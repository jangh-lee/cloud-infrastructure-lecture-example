# 013 Cost Slack Alert

## 목표

Naver Cloud Cost and Usage API로 이번 달 사용 요금을 조회하고, Cloud Functions에서 Slack으로 비용 알림을 보냅니다.

구조:

```text
Cloud Functions Trigger
  -> Python Action
  -> Billing API getDemandCostList
  -> Slack Incoming Webhook
```

## 준비물

| 항목 | 설명 |
| --- | --- |
| `NCP_ACCESS_KEY` | Naver Cloud API Access Key |
| `NCP_SECRET_KEY` | Naver Cloud API Secret Key |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook URL |
| `BUDGET_KRW` | 예산 기준 금액 |

Webhook URL과 Secret Key는 Git에 올리지 않습니다.

## zip 파일

업로드용 zip 파일:

```text
013-cost slack alert/dist/ncp-billing.zip
```

다시 만들기:

```bash
cd "013-cost slack alert"
./scripts/build-zip.sh
```

## Cloud Functions Action 생성

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
| Upload File | `ncp-billing.zip` |
| Main Function | `main` |

## 기본 파라미터

```json
{
  "NCP_ACCESS_KEY": "YOUR_NCP_ACCESS_KEY",
  "NCP_SECRET_KEY": "YOUR_NCP_SECRET_KEY",
  "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/...",
  "BUDGET_KRW": "10000",
  "ALERT_ONLY_OVER_BUDGET": "false"
}
```

## 스케줄

매일 오전 9시에 실행하는 예시:

```text
0 0 9 * * *
```

콘솔에서 Cron 기준 시간이 UTC인지 KST인지 확인합니다.

## 동작 설명

1. 현재 월을 `yyyyMM` 형식으로 계산합니다.
2. Billing API `getDemandCostList`를 호출합니다.
3. 응답에서 사용 금액을 추출합니다.
4. `BUDGET_KRW`와 비교합니다.
5. Slack으로 비용 알림을 보냅니다.

## Object Storage 체크섬 설정

현재 `ncp-billing.zip` 예제는 `boto3`를 쓰지 않습니다. 하지만 비용 리포트를 Object Storage에 저장하는 구조로 확장하면 `boto3`/`botocore` 체크섬 설정이 필요할 수 있습니다.

Naver Cloud Object Storage를 S3 호환 API로 사용할 때는 아래 설정을 명시합니다.

```python
from botocore.config import Config

config = Config(
    signature_version="s3v4",
    s3={
        "addressing_style": "path"
    },
    request_checksum_calculation="when_required",
    response_checksum_validation="when_required",
)
```

전체 예제:

```text
013-cost slack alert/examples/object-storage-checksum.py
```

실행:

```bash
cd "013-cost slack alert"

python3 -m venv .venv
source .venv/bin/activate
pip install boto3

NCP_ACCESS_KEY='YOUR_ACCESS_KEY' \
NCP_SECRET_KEY='YOUR_SECRET_KEY' \
NCP_OBJECT_STORAGE_BUCKET='YOUR_BUCKET_NAME' \
python examples/object-storage-checksum.py
```

`AccessDenied`가 발생하면 권한뿐 아니라 `endpoint_url`, `region_name`, `addressing_style`, 체크섬 설정을 같이 확인합니다.

## 참고

- 상세 자료는 저장소의 `013-cost slack alert/README.md`를 확인합니다.
