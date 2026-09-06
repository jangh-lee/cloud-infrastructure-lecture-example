import os

# NCP Object Storage checksum compatibility. Keep this before importing boto3.
os.environ["AWS_REQUEST_CHECKSUM_CALCULATION"] = "WHEN_REQUIRED"
os.environ["AWS_RESPONSE_CHECKSUM_VALIDATION"] = "WHEN_REQUIRED"

import base64
import datetime as dt
import email.utils
import hashlib
import hmac
import json
import re
import time
import urllib.error
import urllib.request

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


CAT_HOST = "cloudactivitytracer.apigw.ntruss.com"
CAT_URI = "/api/v1/activities"
OBJECT_STORAGE_ENDPOINT = "https://kr.object.ncloudstorage.com"
DEFAULT_STATE_KEY = "ncp-account-monitoring/processed-history.json"
MAX_HISTORY_IDS = 3000
MAX_CAT_PAGES = 20
MAX_TABLE_DATA_ROWS = 20

ACG_COMPLETE_ACTIONS = {
    "Update ACG Rule (Complete)",
    "updateAcgRuleComplete",
}

SERVER_CREATE_ACTIONS = {
    "Create Server Instance",
    "createServerInstance",
}

RULE_KEY_PATTERN = re.compile(r"^(inboundRules|outboundRules)\[(\d+)]\.(.+)$")
KST = dt.timezone(dt.timedelta(hours=9))


def main(args):
    args = args or {}

    access_key = _get_value(args, "ncp_access_key", "NCP_ACCESS_KEY")
    secret_key = _get_value(args, "ncp_secret_key", "NCP_SECRET_KEY")
    webhook_url = _get_value(args, "slack_webhook_url", "SLACK_WEBHOOK_URL")
    state_bucket = _get_value(args, "state_bucket", "STATE_BUCKET")
    state_object_key = args.get("state_object_key") or os.environ.get("STATE_OBJECT_KEY") or DEFAULT_STATE_KEY
    lookback_minutes = int(args.get("lookback_minutes") or os.environ.get("LOOKBACK_MINUTES") or 5)

    missing = [
        key
        for key, value in {
            "ncp_access_key": access_key,
            "ncp_secret_key": secret_key,
            "slack_webhook_url": webhook_url,
            "state_bucket": state_bucket,
        }.items()
        if not value
    ]
    if missing:
        return {
            "status": "error",
            "message": "필수 파라미터 누락",
            "missingParameters": missing,
        }

    write_log(
        "INFO",
        "monitoring_started",
        lookbackMinutes=lookback_minutes,
        stateBucket=state_bucket,
        stateObjectKey=state_object_key,
    )

    s3_client = create_object_storage_client(access_key, secret_key)
    state = load_state(s3_client, state_bucket, state_object_key)
    processed_history_ids = set(str(value) for value in state.get("historyIds", []))
    snapshots = state.setdefault("acgSnapshots", {})

    activities = get_activities(access_key, secret_key, lookback_minutes)
    activities.sort(key=lambda item: int(item.get("eventTime", 0) or 0))

    matched_count = 0
    sent_count = 0
    duplicate_count = 0
    failed_count = 0
    result_activities = []

    for activity in activities:
        target_type = get_target_type(activity)
        if not target_type:
            continue

        matched_count += 1
        history_id = str(activity.get("historyId") or "")
        if not history_id:
            write_log("WARNING", "history_id_missing", action=get_action(activity))
            continue

        if history_id in processed_history_ids:
            duplicate_count += 1
            write_log("INFO", "duplicate_event_skipped", historyId=history_id, action=get_action(activity))
            continue

        resource_id = get_resource_id(activity)
        pending_snapshot = None

        try:
            if target_type == "ACG_RULE_CHANGE":
                current_rules = extract_acg_rules(activity)
                previous_rules = snapshots.get(resource_id)

                if isinstance(previous_rules, list):
                    added_rules, removed_rules = compare_rules(previous_rules, current_rules)
                    comparison_status = "COMPARED"
                else:
                    added_rules = infer_recent_added_rules(current_rules, activity.get("eventTime"))
                    removed_rules = []
                    comparison_status = "BASELINE_CREATED"

                pending_snapshot = current_rules
                slack_message = build_acg_slack_message(
                    activity=activity,
                    added_rules=added_rules,
                    removed_rules=removed_rules,
                    comparison_status=comparison_status,
                    current_rules=current_rules,
                )

                result_activities.append(
                    {
                        "historyId": history_id,
                        "action": get_action(activity),
                        "resourceId": resource_id,
                        "resourceName": get_resource_name(activity),
                        "comparisonStatus": comparison_status,
                        "currentRuleCount": len(current_rules),
                        "addedRuleCount": len(added_rules),
                        "removedRuleCount": len(removed_rules),
                        "addedRules": added_rules,
                        "removedRules": removed_rules,
                    }
                )
            else:
                slack_message = build_server_slack_message(activity)
                result_activities.append(
                    {
                        "historyId": history_id,
                        "action": get_action(activity),
                        "resourceId": resource_id,
                        "resourceName": get_resource_name(activity),
                    }
                )

            slack_result = send_slack(webhook_url, slack_message)
            processed_history_ids.add(history_id)
            if pending_snapshot is not None:
                snapshots[resource_id] = pending_snapshot

            sent_count += 1
            write_log(
                "INFO",
                "slack_delivery_success",
                historyId=history_id,
                action=get_action(activity),
                statusCode=slack_result["statusCode"],
            )
        except Exception as error:
            failed_count += 1
            write_log(
                "ERROR",
                "event_processing_failed",
                historyId=history_id,
                action=get_action(activity),
                errorType=type(error).__name__,
                message=str(error),
            )

    state["historyIds"] = list(processed_history_ids)
    save_state(s3_client, state_bucket, state_object_key, state)

    result = {
        "status": "completed",
        "lookbackMinutes": lookback_minutes,
        "queriedCount": len(activities),
        "matchedCount": matched_count,
        "sentCount": sent_count,
        "duplicateSkippedCount": duplicate_count,
        "failedCount": failed_count,
        "activities": result_activities,
    }
    write_log("INFO", "monitoring_completed", **result)
    return result


def write_log(level, event_name, **fields):
    print(json.dumps({"level": level, "event": event_name, **fields}, ensure_ascii=False, default=str))


def get_activities(access_key, secret_key, lookback_minutes):
    now = int(time.time() * 1000)
    from_event_time = now - int(lookback_minutes * 60 * 1000)
    activities = []
    page = 0

    while True:
        result = get_activity_page(access_key, secret_key, from_event_time, now, page)
        items = result.get("items", [])
        if isinstance(items, list):
            activities.extend(items)

        if not result.get("hasMore", False):
            break

        page += 1
        if page >= MAX_CAT_PAGES:
            write_log("WARNING", "cat_page_limit_reached", page=page)
            break

    write_log(
        "INFO",
        "cat_query_completed",
        fromEventTime=from_event_time,
        toEventTime=now,
        itemCount=len(activities),
        pageCount=page + 1,
    )
    return activities


def get_activity_page(access_key, secret_key, from_event_time, to_event_time, page):
    timestamp = str(gateway_epoch_millis())
    signature = make_ncp_signature("POST", CAT_URI, timestamp, access_key, secret_key)
    body = {
        "fromEventTime": from_event_time,
        "toEventTime": to_event_time,
        "page": page,
        "size": 100,
    }
    request = urllib.request.Request(
        f"https://{CAT_HOST}{CAT_URI}",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "x-ncp-apigw-timestamp": timestamp,
            "x-ncp-iam-access-key": access_key,
            "x-ncp-apigw-signature-v2": signature,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"CAT API 오류: HTTP {error.code}, response={response_body}") from error


def make_ncp_signature(method, uri, timestamp, access_key, secret_key):
    message = f"{method} {uri}\n{timestamp}\n{access_key}"
    signature = hmac.new(secret_key.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(signature).decode("utf-8")


def gateway_epoch_millis():
    request = urllib.request.Request(f"https://{CAT_HOST}", method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            date_header = response.headers.get("Date")
    except Exception:
        date_header = None

    if date_header:
        server_time = email.utils.parsedate_to_datetime(date_header)
        return int(server_time.timestamp() * 1000)

    return int(time.time() * 1000)


def create_object_storage_client(access_key, secret_key):
    return boto3.client(
        "s3",
        endpoint_url=OBJECT_STORAGE_ENDPOINT,
        region_name="kr-standard",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(
            signature_version="s3v4",
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
            s3={"addressing_style": "path"},
            connect_timeout=5,
            read_timeout=10,
            retries={"max_attempts": 2, "mode": "standard"},
        ),
    )


def create_empty_state():
    return {
        "historyIds": [],
        "acgSnapshots": {},
    }


def load_state(s3_client, bucket, object_key):
    try:
        response = s3_client.get_object(Bucket=bucket, Key=object_key)
        state = json.loads(response["Body"].read().decode("utf-8"))
        if not isinstance(state, dict):
            state = create_empty_state()
        state.setdefault("historyIds", [])
        state.setdefault("acgSnapshots", {})
        write_log(
            "INFO",
            "state_loaded",
            bucket=bucket,
            objectKey=object_key,
            historyCount=len(state["historyIds"]),
            snapshotCount=len(state["acgSnapshots"]),
        )
        return state
    except ClientError as error:
        error_code = str(error.response.get("Error", {}).get("Code", ""))
        if error_code in {"NoSuchKey", "NoSuchObject", "404"}:
            write_log("INFO", "state_not_found", bucket=bucket, objectKey=object_key)
            return create_empty_state()
        raise
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
        write_log("WARNING", "state_json_invalid", bucket=bucket, objectKey=object_key)
        return create_empty_state()


def save_state(s3_client, bucket, object_key, state):
    history_ids = list(dict.fromkeys(state.get("historyIds", [])))
    state["historyIds"] = history_ids[-MAX_HISTORY_IDS:]
    state["updatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
    s3_client.put_object(
        Bucket=bucket,
        Key=object_key,
        Body=json.dumps(state, ensure_ascii=False).encode("utf-8"),
        ContentType="application/json",
    )
    write_log(
        "INFO",
        "state_saved",
        bucket=bucket,
        objectKey=object_key,
        historyCount=len(state["historyIds"]),
        snapshotCount=len(state.get("acgSnapshots", {})),
    )


def get_action(activity):
    return str(activity.get("actionDisplayName") or activity.get("action") or "").strip()


def is_vpc_activity(activity):
    platform_type = str(activity.get("platformType", "")).upper()
    nrn = str(activity.get("nrn", ""))
    return platform_type == "VPC" or ":VPCServer:" in nrn


def get_target_type(activity):
    if not is_vpc_activity(activity):
        return None

    action = get_action(activity)
    resource_type = str(activity.get("resourceType", "")).upper()

    if action in ACG_COMPLETE_ACTIONS:
        if resource_type and resource_type != "ACG":
            return None
        return "ACG_RULE_CHANGE"

    if action in SERVER_CREATE_ACTIONS:
        if resource_type and resource_type != "SERVER":
            return None
        return "SERVER_CREATION"

    return None


def convert_kst(event_time):
    if event_time in (None, ""):
        return "-"

    try:
        timestamp = int(event_time)
        if timestamp > 100000000000:
            timestamp /= 1000
        return dt.datetime.fromtimestamp(timestamp, tz=dt.timezone.utc).astimezone(KST).strftime("%Y-%m-%d %H:%M:%S KST")
    except (TypeError, ValueError, OSError):
        return str(event_time)


def get_actor_label(activity):
    user_type = str(activity.get("actionUserType", "-"))
    sub_account_no = activity.get("actionSubAccountNo")
    if user_type == "Sub" and sub_account_no:
        return f"Sub Account #{sub_account_no}"
    if user_type == "Customer":
        return "Main Account"
    return user_type


def first_value(source, *keys, default="-"):
    for key in keys:
        value = source.get(key)
        if value not in (None, ""):
            return value
    return default


def get_resource_id(activity):
    resource_id = activity.get("resourceId")
    if resource_id not in (None, ""):
        return str(resource_id)

    nrn = str(activity.get("nrn", ""))
    if "/" in nrn:
        return nrn.rsplit("/", 1)[-1]
    return nrn or "unknown"


def product_data_to_mapping(product_data):
    if isinstance(product_data, dict):
        return product_data

    mapping = {}
    if isinstance(product_data, list):
        for item in product_data:
            if not isinstance(item, dict):
                continue
            key = item.get("key") or item.get("name")
            if key is None:
                continue
            value = item.get("value")
            if value is None:
                value = item.get("productValue")
            mapping[str(key)] = value

    return mapping


def get_resource_name(activity):
    resource_name = activity.get("resourceName")
    if resource_name:
        return str(resource_name)

    product_data = product_data_to_mapping(activity.get("productData", {}))
    return str(first_value(product_data, "accessControlGroupName", "serverName", default=get_resource_id(activity)))


def normalize_rule(raw_rule, direction):
    return {
        "direction": direction,
        "protocol": str(first_value(raw_rule, "protocolTypeCode", "protocol")).upper(),
        "ipBlockOrAcg": str(first_value(raw_rule, "ipBlock", "ipBlockOrAcg", "accessControlGroupName", "accessControlGroupNo")),
        "portRange": str(first_value(raw_rule, "portRange")),
        "ruleNo": str(first_value(raw_rule, "accessControlGroupRuleNo", "ruleNo")),
        "statusCode": str(first_value(raw_rule, "statusCode")),
        "description": str(first_value(raw_rule, "description")),
        "createdYmdt": str(first_value(raw_rule, "createdYmdt")),
        "modifiedYmdt": str(first_value(raw_rule, "modifiedYmdt")),
    }


def extract_acg_rules(activity):
    product_data = product_data_to_mapping(activity.get("productData", {}))
    grouped = {
        "inboundRules": {},
        "outboundRules": {},
    }

    for collection_name in ("inboundRules", "outboundRules"):
        nested_rules = product_data.get(collection_name)
        if isinstance(nested_rules, list):
            for index, rule in enumerate(nested_rules):
                if isinstance(rule, dict):
                    grouped[collection_name][index] = dict(rule)

    for key, value in product_data.items():
        match = RULE_KEY_PATTERN.match(str(key))
        if not match:
            continue
        collection_name, index_text, field_name = match.groups()
        grouped[collection_name].setdefault(int(index_text), {})[field_name] = value

    rules = []
    for collection_name, direction in (("inboundRules", "INBOUND"), ("outboundRules", "OUTBOUND")):
        for index in sorted(grouped[collection_name]):
            rules.append(normalize_rule(grouped[collection_name][index], direction))

    return rules


def rule_identity(rule):
    rule_no = str(rule.get("ruleNo", "-"))
    if rule_no not in {"", "-", "None"}:
        return f"ruleNo:{rule_no}"
    return "|".join(str(rule.get(key, "-")) for key in ("direction", "protocol", "ipBlockOrAcg", "portRange"))


def compare_rules(previous_rules, current_rules):
    previous_map = {rule_identity(rule): rule for rule in previous_rules}
    current_map = {rule_identity(rule): rule for rule in current_rules}
    added_rules = [current_map[key] for key in current_map.keys() - previous_map.keys()]
    removed_rules = [previous_map[key] for key in previous_map.keys() - current_map.keys()]

    def sort_key(rule):
        return (
            str(rule.get("direction", "")),
            str(rule.get("protocol", "")),
            str(rule.get("portRange", "")),
            str(rule.get("ruleNo", "")),
        )

    return sorted(added_rules, key=sort_key), sorted(removed_rules, key=sort_key)


def infer_recent_added_rules(current_rules, event_time, tolerance_ms=120000):
    try:
        event_ms = int(event_time)
    except (TypeError, ValueError):
        return []

    inferred = []
    for rule in current_rules:
        timestamps = []
        for key in ("createdYmdt", "modifiedYmdt"):
            try:
                timestamps.append(int(rule.get(key)))
            except (TypeError, ValueError):
                pass
        if timestamps and min(abs(timestamp - event_ms) for timestamp in timestamps) <= tolerance_ms:
            inferred.append(rule)
    return inferred


def build_acg_slack_message(activity, added_rules, removed_rules, comparison_status, current_rules):
    resource_name = get_resource_name(activity)
    summary = f"추가 {len(added_rules)}개 / 삭제 {len(removed_rules)}개"
    if comparison_status == "BASELINE_CREATED" and not added_rules and not removed_rules:
        summary = "이전 비교 기준이 없어 현재 규칙을 baseline으로 저장했습니다."

    blocks = [
        header_block("[NCP VPC] ACG 규칙 변경"),
        fields_block(common_fields(activity)),
        section_block(f"*ACG 변경 내용*\n{summary}"),
        section_block(f"*변경 규칙*\n{rule_table_text(added_rules, removed_rules, current_rules if comparison_status == 'BASELINE_CREATED' else [])}"),
        context_block(f"resource={resource_name} · historyId={activity.get('historyId', '-')}"),
    ]
    return {
        "text": f"[NCP VPC] ACG 규칙 변경: {resource_name}",
        "blocks": blocks,
    }


def build_server_slack_message(activity):
    product_data = product_data_to_mapping(activity.get("productData", {}))
    fields = common_fields(activity)
    for label, keys in (
        ("서버명", ("serverName",)),
        ("서버 번호", ("serverInstanceNo", "serverNo")),
        ("VPC 번호", ("vpcNo",)),
        ("Subnet 번호", ("subnetNo",)),
        ("사설 IP", ("privateIp", "privateIpAddress")),
        ("서버 이미지", ("serverImageProductCode", "serverImageName")),
        ("서버 스펙", ("serverProductCode", "serverProductName")),
    ):
        value = first_value(product_data, *keys, default=None)
        if value not in (None, "", "-"):
            fields.append((label, value))

    return {
        "text": f"[NCP VPC] 서버 생성: {get_resource_name(activity)}",
        "blocks": [
            header_block("[NCP VPC] 서버 생성"),
            fields_block(fields),
            context_block(f"historyId={activity.get('historyId', '-')}"),
        ],
    }


def common_fields(activity):
    return [
        ("리소스", get_resource_name(activity)),
        ("리소스 ID", get_resource_id(activity)),
        ("작업", get_action(activity) or "-"),
        ("결과", activity.get("actionResultType", "-")),
        ("작업 계정", get_actor_label(activity)),
        ("요청 방식", activity.get("sourceType", "-")),
        ("요청 IP", activity.get("sourceIp", "-")),
        ("발생 시각", convert_kst(activity.get("eventTime"))),
        ("리전", activity.get("regionCode", "KR")),
    ]


def header_block(text):
    return {
        "type": "header",
        "text": {"type": "plain_text", "text": truncate(text, 150), "emoji": True},
    }


def fields_block(items):
    return {
        "type": "section",
        "fields": [{"type": "mrkdwn", "text": f"*{label}*\n`{truncate(value, 180)}`"} for label, value in items[:10]],
    }


def section_block(text):
    return {
        "type": "section",
        "text": {"type": "mrkdwn", "text": truncate(text, 2800)},
    }


def context_block(text):
    return {
        "type": "context",
        "elements": [{"type": "mrkdwn", "text": truncate(text, 2000)}],
    }


def rule_table_text(added_rules, removed_rules, current_rules=None):
    display_rules = [("추가", rule) for rule in added_rules]
    display_rules.extend(("삭제", rule) for rule in removed_rules)
    if not display_rules and current_rules:
        display_rules.extend(("현재", rule) for rule in current_rules)

    if not display_rules:
        return "```CAT 응답에서 비교 가능한 ACG 규칙 값이 확인되지 않았습니다.```"

    lines = [
        "```",
        f"{'구분':<6} {'방향':<8} {'프로토콜':<8} {'IP / ACG':<22} {'포트':<10}",
        f"{'-' * 6} {'-' * 8} {'-' * 8} {'-' * 22} {'-' * 10}",
    ]
    for change_type, rule in display_rules[:MAX_TABLE_DATA_ROWS]:
        lines.append(
            f"{change_type:<6} "
            f"{truncate(rule.get('direction', '-'), 8):<8} "
            f"{truncate(rule.get('protocol', '-'), 8):<8} "
            f"{truncate(rule.get('ipBlockOrAcg', '-'), 22):<22} "
            f"{truncate(rule.get('portRange', '-'), 10):<10}"
        )
    if len(display_rules) > MAX_TABLE_DATA_ROWS:
        lines.append(f"... 외 {len(display_rules) - MAX_TABLE_DATA_ROWS}개 규칙 생략")
    lines.append("```")
    return "\n".join(lines)


def send_slack(webhook_url, slack_message):
    request = urllib.request.Request(
        webhook_url,
        data=json.dumps(slack_message, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            if not 200 <= response.status < 300:
                raise RuntimeError(f"Slack 오류: HTTP {response.status}, response={response_body}")
            return {"statusCode": response.status, "body": response_body}
    except urllib.error.HTTPError as error:
        response_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Slack 오류: HTTP {error.code}, response={response_body}") from error


def truncate(value, limit):
    text = str(value if value not in (None, "") else "-")
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _get_value(args, param_key, env_key):
    return args.get(param_key) or os.environ.get(env_key)
