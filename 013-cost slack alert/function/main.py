import base64
import datetime as dt
import email.utils
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

import boto3
from botocore.config import Config


BILLING_HOST = "billingapi.apigw.ntruss.com"
BILLING_DEMAND_COST_PATH = "/billing/v1/cost/getDemandCostList"
BILLING_PRODUCT_DEMAND_COST_PATH = "/billing/v1/cost/getProductDemandCostList"
KST = dt.timezone(dt.timedelta(hours=9))


def main(args):
    args = args or {}

    access_key = _get_value(args, "NCP_ACCESS_KEY", required=True)
    secret_key = _get_value(args, "NCP_SECRET_KEY", required=True)
    slack_webhook_url = _get_value(args, "SLACK_WEBHOOK_URL", required=True)

    today = _kst_today()
    start_date = _parse_date(_get_value(args, "START_DATE", default=""), default=today.replace(day=1))
    end_date = _parse_date(_get_value(args, "END_DATE", default=""), default=today)
    current_month = today.strftime("%Y%m")
    start_month = _get_value(args, "START_MONTH", default=start_date.strftime("%Y%m") if start_date else current_month)
    end_month = _get_value(args, "END_MONTH", default=end_date.strftime("%Y%m") if end_date else start_month)
    period_label = _format_period_label(start_date, end_date)
    budget = _to_float(_get_value(args, "BUDGET_KRW", default="0"))
    alert_only_over_budget = _to_bool(_get_value(args, "ALERT_ONLY_OVER_BUDGET", default="false"))
    save_report = _to_bool(_get_value(args, "SAVE_REPORT_TO_OBJECT_STORAGE", default="false"))

    response = _get_demand_cost_list(access_key, secret_key, start_month, end_month)
    product_response = _get_product_demand_cost_list(access_key, secret_key, start_month, end_month)
    amount = _extract_use_amount(response)
    product_costs = _extract_product_costs(product_response)
    over_budget = budget > 0 and amount >= budget
    month_label = start_month if start_month == end_month else f"{start_month}-{end_month}"
    previous_amount = _resolve_previous_amount(args, access_key, secret_key, month_label, today, save_report)
    delta = _build_delta(amount, previous_amount)

    object_storage_result = None
    if save_report:
        object_storage_result = _save_report_to_object_storage(
            args=args,
            access_key=access_key,
            secret_key=secret_key,
            month=month_label,
            period_label=period_label,
            amount=amount,
            previous_amount=previous_amount,
            delta=delta,
            product_costs=product_costs,
            budget=budget,
            over_budget=over_budget,
            billing_response=response,
            product_billing_response=product_response,
            today=today,
        )

    should_send = over_budget or not alert_only_over_budget
    if should_send:
        message = _build_slack_message(
            month=month_label,
            period_label=period_label,
            amount=amount,
            delta=delta,
            product_costs=product_costs,
            budget=budget,
            over_budget=over_budget,
            request_id=_find_value(response, "requestId"),
            object_storage_key=object_storage_result.get("key") if object_storage_result else None,
        )
        _send_slack(
            slack_webhook_url,
            message,
            channel=_get_value(args, "SLACK_CHANNEL", default=""),
            username=_get_value(args, "SLACK_USERNAME", default="NCP Cost Bot"),
        )

    return {
        "ok": True,
        "sent": should_send,
        "month": month_label,
        "period": period_label,
        "useAmount": amount,
        "previousUseAmount": previous_amount,
        "delta": delta,
        "productCosts": product_costs,
        "budget": budget,
        "overBudget": over_budget,
        "objectStorage": object_storage_result,
    }


def _get_demand_cost_list(access_key, secret_key, start_month, end_month):
    return _call_billing_api(access_key, secret_key, BILLING_DEMAND_COST_PATH, start_month, end_month)


def _get_product_demand_cost_list(access_key, secret_key, start_month, end_month):
    return _call_billing_api(access_key, secret_key, BILLING_PRODUCT_DEMAND_COST_PATH, start_month, end_month)


def _call_billing_api(access_key, secret_key, path, start_month, end_month):
    params = {
        "startMonth": start_month,
        "endMonth": end_month,
        "responseFormatType": "json",
    }
    query = urllib.parse.urlencode(params)
    path_with_query = f"{path}?{query}"
    url = f"https://{BILLING_HOST}{path_with_query}"
    timestamp = str(_gateway_epoch_millis())

    headers = {
        "x-ncp-apigw-timestamp": timestamp,
        "x-ncp-iam-access-key": access_key,
        "x-ncp-apigw-signature-v2": _make_signature("GET", path_with_query, timestamp, access_key, secret_key),
    }

    request = urllib.request.Request(url, method="GET", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Billing API failed: HTTP {exc.code} {body}") from exc


def _make_signature(method, path_with_query, timestamp, access_key, secret_key):
    message = f"{method} {path_with_query}\n{timestamp}\n{access_key}"
    digest = hmac.new(secret_key.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def _gateway_epoch_millis():
    request = urllib.request.Request(f"https://{BILLING_HOST}", method="HEAD")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            date_header = response.headers.get("Date")
    except Exception:
        date_header = None

    if date_header:
        server_time = email.utils.parsedate_to_datetime(date_header)
        return int(server_time.timestamp() * 1000)

    return int(time.time() * 1000)


def _extract_use_amount(payload):
    explicit = _find_value(payload, "useAmount")
    if explicit is not None:
        return _to_float(explicit)

    total = 0.0
    for key in ("demandAmount", "promiseDiscountAmount", "promotionDiscountAmount", "etcDiscountAmount"):
        value = _find_value(payload, key)
        if value is not None:
            total += _to_float(value)
    return total


def _extract_product_costs(payload):
    response = payload.get("getProductDemandCostListResponse", {}) if isinstance(payload, dict) else {}
    rows = response.get("productDemandCostList", [])
    costs_by_service = {}

    for row in rows:
        product_type = row.get("productDemandType", {}) if isinstance(row, dict) else {}
        service_name = product_type.get("codeName") or product_type.get("code") or "Unknown"
        amount = _to_float(row.get("useAmount"))
        costs_by_service[service_name] = costs_by_service.get(service_name, 0.0) + amount

    return [
        {"service": service, "useAmount": amount}
        for service, amount in sorted(costs_by_service.items(), key=lambda item: item[1], reverse=True)
    ]


def _find_value(value, target_key):
    if isinstance(value, dict):
        if target_key in value:
            return value[target_key]
        for nested in value.values():
            found = _find_value(nested, target_key)
            if found is not None:
                return found
    if isinstance(value, list):
        for item in value:
            found = _find_value(item, target_key)
            if found is not None:
                return found
    return None


def _resolve_previous_amount(args, access_key, secret_key, month, today, save_report):
    manual_previous = _get_value(args, "PREVIOUS_USE_AMOUNT_KRW", default="")
    if manual_previous != "":
        return _to_float(manual_previous)

    if not save_report:
        return None

    try:
        s3, bucket, key_prefix = _create_object_storage_client(args, access_key, secret_key)
        previous_day = today - dt.timedelta(days=1)
        previous_key = _report_key(key_prefix, month, previous_day)
        response = s3.get_object(Bucket=bucket, Key=previous_key)
        payload = json.loads(response["Body"].read().decode("utf-8"))
        return _to_float(payload.get("useAmount"))
    except Exception:
        return None


def _build_delta(amount, previous_amount):
    if previous_amount is None:
        return {
            "available": False,
            "previousAmount": None,
            "changeAmount": None,
            "changeRate": None,
            "label": "전일 리포트 없음",
        }

    change_amount = amount - previous_amount
    change_rate = None if previous_amount == 0 else (change_amount / previous_amount) * 100
    direction = "증가" if change_amount > 0 else "감소" if change_amount < 0 else "변동 없음"
    if change_rate is None:
        label = f"{direction} {abs(change_amount):,.0f} KRW"
    else:
        label = f"{direction} {abs(change_amount):,.0f} KRW ({abs(change_rate):.1f}%)"

    return {
        "available": True,
        "previousAmount": previous_amount,
        "changeAmount": change_amount,
        "changeRate": change_rate,
        "label": label,
    }


def _save_report_to_object_storage(
    args,
    access_key,
    secret_key,
    month,
    period_label,
    amount,
    previous_amount,
    delta,
    product_costs,
    budget,
    over_budget,
    billing_response,
    product_billing_response,
    today,
):
    s3, bucket, key_prefix = _create_object_storage_client(args, access_key, secret_key)
    key = _report_key(key_prefix, month, today)

    report = {
        "month": month,
        "period": period_label,
        "useAmount": amount,
        "previousUseAmount": previous_amount,
        "delta": delta,
        "productCosts": product_costs,
        "budget": budget,
        "overBudget": over_budget,
        "createdAt": _utc_now().isoformat(timespec="seconds").replace("+00:00", "Z"),
        "billingResponse": billing_response,
        "productBillingResponse": product_billing_response,
    }

    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(report, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json; charset=utf-8",
    )

    return {
        "bucket": bucket,
        "key": key,
    }


def _create_object_storage_client(args, access_key, secret_key):
    bucket = _get_value(args, "OBJECT_STORAGE_BUCKET", default=_get_value(args, "NCP_OBJECT_STORAGE_BUCKET", default=""))
    if not bucket:
        raise ValueError("Missing required value: OBJECT_STORAGE_BUCKET")

    object_access_key = _get_value(args, "OBJECT_STORAGE_ACCESS_KEY", default=access_key)
    object_secret_key = _get_value(args, "OBJECT_STORAGE_SECRET_KEY", default=secret_key)
    endpoint_url = _get_value(args, "OBJECT_STORAGE_ENDPOINT", default="https://kr.object.ncloudstorage.com")
    region_name = _get_value(args, "OBJECT_STORAGE_REGION", default="kr-standard")
    key_prefix = _get_value(args, "OBJECT_STORAGE_KEY_PREFIX", default="billing-reports").strip("/")

    config = Config(
        signature_version="s3v4",
        s3={
            "addressing_style": "path",
        },
        request_checksum_calculation="when_required",
        response_checksum_validation="when_required",
    )

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        region_name=region_name,
        aws_access_key_id=object_access_key,
        aws_secret_access_key=object_secret_key,
        config=config,
    )

    return s3, bucket, key_prefix


def _report_key(key_prefix, month, day):
    return f"{key_prefix}/{month}/ncp-billing-{day.strftime('%Y%m%d')}.json"


def _build_slack_message(
    month,
    period_label,
    amount,
    delta,
    product_costs,
    budget,
    over_budget,
    request_id=None,
    object_storage_key=None,
):
    status = "예산 초과" if over_budget else "정상"
    budget_text = f"{budget:,.0f} KRW" if budget > 0 else "미설정"
    lines = [
        "*NCP 비용 알림*",
        f"- 조회 월: `{month}`",
        f"- 조회 기간: `{period_label}`",
        f"- 현재 사용 금액: *{amount:,.0f} KRW*",
        f"- 전일 대비: `{delta['label']}`",
        f"- 예산: `{budget_text}`",
        f"- 상태: *{status}*",
    ]
    if product_costs:
        lines.append("")
        lines.append("*서비스별 비용*")
        for item in product_costs[:8]:
            lines.append(f"- {item['service']}: `{item['useAmount']:,.0f} KRW`")
    if request_id:
        lines.append(f"- requestId: `{request_id}`")
    if object_storage_key:
        lines.append(f"- 저장 경로: `{object_storage_key}`")
    return "\n".join(lines)


def _send_slack(webhook_url, text, channel="", username="NCP Cost Bot"):
    payload = {
        "text": text,
        "username": username,
    }
    if channel:
        payload["channel"] = channel

    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        webhook_url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Slack webhook failed: HTTP {exc.code} {body}") from exc


def _get_value(args, key, default=None, required=False):
    value = args.get(key)
    if value is None or value == "":
        value = os.environ.get(key, default)
    if required and (value is None or value == ""):
        raise ValueError(f"Missing required value: {key}")
    return value


def _to_float(value):
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    return float(str(value).replace(",", ""))


def _to_bool(value):
    return str(value).strip().lower() in ("1", "true", "yes", "y", "on")


def _utc_now():
    return dt.datetime.now(dt.timezone.utc)


def _kst_today():
    return dt.datetime.now(KST).date()


def _parse_date(value, default=None):
    if not value:
        return default
    return dt.datetime.strptime(value, "%Y-%m-%d").date()


def _format_period_label(start_date, end_date):
    if start_date and end_date:
        return f"{start_date.month}월 {start_date.day}일 ~ {end_date.month}월 {end_date.day}일"
    if start_date:
        return f"{start_date.month}월 {start_date.day}일 ~"
    if end_date:
        return f"~ {end_date.month}월 {end_date.day}일"
    return "기간 미지정"
