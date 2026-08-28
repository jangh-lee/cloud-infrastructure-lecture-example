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

zip 파일에는 `main.py`, `__main__.py`, `boto3/botocore` 의존성이 함께 들어갑니다.

## 기본 파라미터

```json
{
  "NCP_ACCESS_KEY": "YOUR_NCP_ACCESS_KEY",
  "NCP_SECRET_KEY": "YOUR_NCP_SECRET_KEY",
  "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/...",
  "BUDGET_KRW": "10000",
  "ALERT_ONLY_OVER_BUDGET": "false",
  "SAVE_REPORT_TO_OBJECT_STORAGE": "true",
  "OBJECT_STORAGE_BUCKET": "ncp-billing-report-james-260828"
}
```

## 스케줄

매일 오전 9시에 실행하는 예시:

```text
0 0 9 * * *
```

콘솔에서 Cron 기준 시간이 UTC인지 KST인지 확인합니다.

## 동작 설명

1. KST 기준 오늘 날짜를 계산합니다. `START_DATE`, `END_DATE`를 생략하면 자동으로 `이번 달 1일 ~ 오늘` 기간을 표시합니다.
2. Billing API `getDemandCostList`를 호출합니다.
3. Billing API `getProductDemandCostList`를 호출해 서비스별 비용을 가져옵니다.
4. 응답에서 사용 금액을 추출합니다.
5. 전일 Object Storage 리포트 또는 `PREVIOUS_USE_AMOUNT_KRW`와 비교해 증감액을 계산합니다.
6. `BUDGET_KRW`와 비교합니다.
7. `SAVE_REPORT_TO_OBJECT_STORAGE=true`이면 Object Storage에 JSON 리포트를 저장합니다.
8. Slack으로 비용 알림을 보냅니다.

Billing API의 기본 조회 단위는 `yyyyMM` 월 단위입니다. `START_DATE`, `END_DATE`는 메시지와 리포트에 보여줄 기간이고, 실제 API 호출에는 해당 월이 사용됩니다. 날짜 파라미터를 생략하면 매일 실행 시 자동으로 오늘 날짜가 반영됩니다.

Slack 메시지 예시:

```text
NCP 비용 리포트
8월 1일 ~ 8월 28일 기준 사용 금액 요약입니다.

요약
항목           내용
------------ ----------------------------
조회 월         202608
조회 기간        8월 1일 ~ 8월 28일
사용 금액        26,810 KRW
전일 대비        증가 1,230 KRW (4.8%)
예산           10,000 KRW
상태           예산 초과

서비스별 비용
No  Service                                        Cost
--  ------------------------------------ --------------
 1  Server(VPC)                              17,540 KRW
 2  Cloud DB for MySQL (VPC)                  5,440 KRW
 3  NAT Gateway                               2,070 KRW

리포트 정보
requestId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
저장 경로: billing-reports/202608/ncp-billing-20260828.json
```

## Object Storage 체크섬 설정

`ncp-billing.zip` 예제의 `main.py`는 Object Storage 저장 옵션을 켜면 `boto3`를 사용합니다. 이때 체크섬 설정을 함수 코드 안에 포함했습니다.

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
