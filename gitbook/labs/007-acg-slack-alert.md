# 007 ACG Slack Alert

## 목표

Cloud Activity Tracer에서 ACG 규칙 변경 이벤트를 조회하고, Slack으로 보안 변경 알림을 보냅니다.

구조:

```text
Cloud Functions Trigger
  -> Cloud Activity Tracer API
  -> Object Storage 상태 파일
  -> Slack Incoming Webhook
```

## zip 파일

업로드용 zip 파일:

```text
007-acg slack alert/dist/ncp-acg-alert.zip
```

다시 만들기:

```bash
cd "007-acg slack alert"
./scripts/build-zip.sh
```

## Cloud Functions Action 생성

| 항목 | 값 |
| --- | --- |
| Runtime | Python 3.x |
| Code Type | 파일 업로드 |
| Upload File | `ncp-acg-alert.zip` |
| Main Function | `main` |

## 기본 파라미터

```json
{
  "ncp_access_key": "NCP_ACCESS_KEY",
  "ncp_secret_key": "NCP_SECRET_KEY",
  "slack_webhook_url": "SLACK_WEBHOOK_URL",
  "state_bucket": "ncp-billing-report-james-260828",
  "state_object_key": "ncp-account-monitoring/processed-history.json",
  "lookback_minutes": 5
}
```

## 동작 방식

1. 최근 `lookback_minutes`분 동안의 CAT 이벤트를 조회합니다.
2. ACG 규칙 변경 완료 이벤트를 찾습니다.
3. Object Storage 상태 파일에서 이전 ACG 규칙 스냅샷을 읽습니다.
4. 현재 이벤트의 규칙과 이전 스냅샷을 비교합니다.
5. 추가/삭제 규칙을 Slack으로 보냅니다.
6. 처리한 `historyId`와 최신 스냅샷을 상태 파일에 저장합니다.

## 상태 파일

기본 저장 경로:

```text
ncp-account-monitoring/processed-history.json
```

중복 알림 방지를 위해 이미 전송한 `historyId`를 저장합니다.

## Slack 메시지 예시

```text
[NCP VPC] ACG 규칙 변경

요약
리소스: lab3-acg
작업: Update ACG Rule (Complete)
작업 계정: Main Account
발생 시각: 2026-08-29 10:00:00 KST

ACG 변경 내용
추가 1개 / 삭제 0개
```

## 참고

상세 자료는 저장소의 `007-acg slack alert/README.md`를 확인합니다.
