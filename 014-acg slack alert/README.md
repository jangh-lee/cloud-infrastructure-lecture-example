# 014 ACG Slack Alert

Naver Cloud Cloud Activity Tracer(CAT)에서 VPC ACG 규칙 변경 이벤트를 조회하고, 변경 내용을 Slack으로 알림 보내는 Cloud Functions 실습입니다.

상태 파일은 Object Storage에 저장합니다. 같은 이벤트가 반복 실행으로 중복 전송되지 않도록 `historyId`를 저장하고, ACG별 마지막 규칙 스냅샷을 저장해 다음 변경 시 추가/삭제 규칙을 비교합니다.

## 1. 구조

```text
Cloud Functions Trigger
  -> Python Action
  -> Cloud Activity Tracer API
  -> Object Storage 상태 파일 조회
  -> ACG 규칙 변경 비교
  -> Slack Incoming Webhook 전송
  -> Object Storage 상태 파일 저장
```

## 2. 학습 포인트

- Cloud Activity Tracer에서 계정 활동 이력을 조회하는 방법
- ACG 규칙 변경 이벤트만 필터링하는 방법
- Object Storage에 처리 이력과 비교 기준 스냅샷을 저장하는 방법
- Slack으로 보안 변경 알림을 보내는 방법
- Cloud Functions를 스케줄 기반으로 실행하는 방법

## 3. 코드 위치

Cloud Functions 업로드용 소스:

```text
014-acg slack alert/function/main.py
```

업로드용 zip 파일:

```text
014-acg slack alert/dist/ncp-acg-alert.zip
```

## 4. zip 파일 만들기

```bash
cd "014-acg slack alert"
./scripts/build-zip.sh
```

생성 결과:

```text
dist/ncp-acg-alert.zip
```

## 5. Cloud Functions Action 생성

```text
Naver Cloud Console
  -> Cloud Functions
  -> Action 생성
```

권장 설정:

| 항목 | 값 |
| --- | --- |
| Runtime | Python 3.x |
| Code Type | 파일 업로드 |
| Upload File | `ncp-acg-alert.zip` |
| Main Function | `main` |
| Timeout | 30초 이상 |

## 6. 기본 파라미터

Cloud Functions Action 기본 파라미터에 아래 값을 넣습니다.

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

| 파라미터 | 설명 |
| --- | --- |
| `ncp_access_key` | Naver Cloud API Access Key |
| `ncp_secret_key` | Naver Cloud API Secret Key |
| `slack_webhook_url` | Slack Incoming Webhook URL |
| `state_bucket` | 처리 이력과 ACG 스냅샷을 저장할 Object Storage 버킷 |
| `state_object_key` | 상태 파일 Object Key |
| `lookback_minutes` | 최근 몇 분 동안의 CAT 이벤트를 조회할지 설정 |

인증키와 Slack Webhook URL은 Git에 올리지 않습니다.

## 7. Object Storage 상태 파일

상태 파일 기본 경로:

```text
ncp-account-monitoring/processed-history.json
```

상태 파일에는 아래 정보가 저장됩니다.

```json
{
  "historyIds": [
    "already-sent-history-id"
  ],
  "acgSnapshots": {
    "access-control-group-id": [
      {
        "direction": "INBOUND",
        "protocol": "TCP",
        "ipBlockOrAcg": "1.2.3.4/32",
        "portRange": "22",
        "ruleNo": "12345"
      }
    ]
  }
}
```

## 8. Slack 메시지 예시

```text
[NCP VPC] ACG 규칙 변경

요약
리소스: lab3-acg
리소스 ID: 123456
작업: Update ACG Rule (Complete)
결과: SUCCESS
작업 계정: Main Account
요청 IP: 1.2.3.4
발생 시각: 2026-08-29 10:00:00 KST

ACG 변경 내용
추가 1개 / 삭제 0개

변경 규칙
구분    방향      프로토콜  IP / ACG        포트
------  --------  --------  --------------  ----
추가    INBOUND   TCP       1.2.3.4/32      22
```

## 9. 스케줄 설정

5분마다 실행하는 예시:

```text
0 */5 * * * *
```

콘솔에서 Cron 기준 시간이 UTC인지 KST인지 확인합니다.

## 10. 장애 확인

### CAT API 인증 실패

- `ncp_access_key`, `ncp_secret_key` 확인
- Cloud Activity Tracer 조회 권한 확인
- API Gateway timestamp 오류가 계속 나면 함수 응답과 로그의 에러를 확인

### Slack 알림이 오지 않음

- `lookback_minutes` 범위 안에 ACG 변경 이벤트가 있었는지 확인
- 이미 처리된 `historyId`면 중복 전송되지 않음
- Slack Webhook URL 확인

### 전송은 되지만 변경 규칙이 비어 있음

- CAT 이벤트의 `productData`에 규칙 상세가 포함되지 않은 경우입니다.
- 첫 실행이면 비교 기준이 없어 현재 규칙을 baseline으로 저장합니다.
- 다음 변경부터 추가/삭제 비교가 더 정확해집니다.

### Object Storage AccessDenied

- `state_bucket`에 `GetObject`, `PutObject`, `ListBucket` 권한이 있는지 확인
- S3 호환 체크섬 문제 방지를 위해 코드에서 아래 설정을 사용합니다.

```python
os.environ["AWS_REQUEST_CHECKSUM_CALCULATION"] = "WHEN_REQUIRED"
os.environ["AWS_RESPONSE_CHECKSUM_VALIDATION"] = "WHEN_REQUIRED"
```

## 11. 참고

이 예제는 ACG 규칙 변경과 서버 생성 이벤트를 함께 감지할 수 있도록 구성되어 있습니다. 수업에서는 먼저 ACG inbound 규칙을 하나 추가한 뒤 Slack 알림과 Object Storage 상태 파일 변화를 확인하면 됩니다.
