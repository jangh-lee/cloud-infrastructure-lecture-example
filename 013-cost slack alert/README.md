# 013 Cost Slack Alert

Naver Cloud Cost and Usage API로 이번 달 사용 요금을 조회하고, Cloud Functions에서 Slack Incoming Webhook으로 알림을 보내는 실습입니다.

이 예제는 비용 알림 구조를 이해하기 위한 강의용 코드입니다. 실제 운영에서는 예산 정책, 권한 분리, Secret 관리, 알림 중복 방지까지 함께 설계해야 합니다.

## 1. 구조

```text
Cloud Functions Trigger
  -> Python Action
  -> Naver Cloud Billing API(getDemandCostList)
  -> Slack Incoming Webhook
```

## 2. 학습 포인트

- Cloud Functions에 zip 파일로 코드를 업로드하는 방법
- Naver Cloud API Signature v2 인증 방식
- Billing API로 월별 사용 금액을 조회하는 방법
- Slack Webhook으로 알림을 보내는 방법
- 예산 기준 금액을 넘었을 때만 알림을 보내는 방식

## 3. 준비물

### Naver Cloud API 인증키

콘솔에서 API 인증키를 준비합니다.

```text
Naver Cloud Console
  -> My Page
  -> Manage Account
  -> 인증키 관리
```

필요 값:

```text
NCP_ACCESS_KEY
NCP_SECRET_KEY
```

Billing API 조회 권한이 있는 계정 또는 Sub Account를 사용해야 합니다.

### Slack Incoming Webhook URL

Slack에서 Incoming Webhook을 만들고 URL을 준비합니다.

```text
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Webhook URL은 비밀번호처럼 취급합니다. Git에 올리지 않습니다.

## 4. 코드 위치

Cloud Functions 업로드용 소스:

```text
013-cost slack alert/function/main.py
```

업로드용 zip 파일:

```text
013-cost slack alert/dist/ncp-billing.zip
```

zip 파일에는 `main.py`, `__main__.py`, `boto3/botocore` 의존성이 함께 들어갑니다. `main.py`가 실제 함수 본체이고, `__main__.py`는 Cloud Functions 런타임 호환을 위한 wrapper입니다.

## 5. zip 파일 다시 만들기

로컬에서 zip을 다시 만들려면:

```bash
cd "013-cost slack alert"
./scripts/build-zip.sh
```

생성 결과:

```text
dist/ncp-billing.zip
```

## 6. Cloud Functions Action 생성

콘솔에서 Action을 생성합니다.

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
| Upload File | `dist/ncp-billing.zip` |
| Main Function | `main` |
| Timeout | 30초 이상 |

## 7. 기본 파라미터

Action의 기본 파라미터 또는 환경 변수에 아래 값을 넣습니다.

```json
{
  "NCP_ACCESS_KEY": "YOUR_NCP_ACCESS_KEY",
  "NCP_SECRET_KEY": "YOUR_NCP_SECRET_KEY",
  "SLACK_WEBHOOK_URL": "YOUR_SLACK_WEBHOOK_URL",
  "BUDGET_KRW": "10000",
  "ALERT_ONLY_OVER_BUDGET": "false"
}
```

선택 파라미터:

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `START_DATE` | KST 기준 이번 달 1일 | Slack 메시지에 표시할 조회 시작일, `yyyy-mm-dd` |
| `END_DATE` | KST 기준 오늘 | Slack 메시지에 표시할 조회 종료일, `yyyy-mm-dd` |
| `START_MONTH` | 이번 달 | 조회 시작 월, `yyyyMM` |
| `END_MONTH` | 이번 달 | 조회 종료 월, `yyyyMM` |
| `BUDGET_KRW` | `0` | 예산 기준 금액 |
| `ALERT_ONLY_OVER_BUDGET` | `false` | `true`면 예산 초과 시에만 Slack 전송 |
| `PREVIOUS_USE_AMOUNT_KRW` |  | 전일 대비 비교용 이전 금액을 수동으로 넣을 때 사용 |
| `SLACK_CHANNEL` | Slack Webhook 기본 채널 | Webhook이 허용하는 경우 채널 override |
| `SLACK_USERNAME` | `NCP Cost Bot` | Slack 표시 이름 |
| `SAVE_REPORT_TO_OBJECT_STORAGE` | `false` | `true`면 비용 조회 결과를 Object Storage에 JSON으로 저장 |
| `OBJECT_STORAGE_BUCKET` |  | 비용 리포트를 저장할 Object Storage 버킷 |
| `OBJECT_STORAGE_KEY_PREFIX` | `billing-reports` | 저장 경로 prefix |
| `OBJECT_STORAGE_ENDPOINT` | `https://kr.object.ncloudstorage.com` | Object Storage endpoint |
| `OBJECT_STORAGE_REGION` | `kr-standard` | Object Storage region |
| `OBJECT_STORAGE_ACCESS_KEY` | `NCP_ACCESS_KEY` | Object Storage용 Access Key를 따로 쓸 때 사용 |
| `OBJECT_STORAGE_SECRET_KEY` | `NCP_SECRET_KEY` | Object Storage용 Secret Key를 따로 쓸 때 사용 |

## 8. 테스트 파라미터 예시

Cloud Functions 테스트 실행 시 아래처럼 넣습니다.

```json
{
  "NCP_ACCESS_KEY": "YOUR_NCP_ACCESS_KEY",
  "NCP_SECRET_KEY": "YOUR_NCP_SECRET_KEY",
  "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/...",
  "BUDGET_KRW": "5000",
  "ALERT_ONLY_OVER_BUDGET": "false",
  "SAVE_REPORT_TO_OBJECT_STORAGE": "true",
  "OBJECT_STORAGE_BUCKET": "ncp-billing-report-james-260828"
}
```

성공 응답 예시:

```json
{
  "ok": true,
  "sent": true,
  "month": "202608",
  "useAmount": 1234.0,
  "budget": 5000.0,
  "overBudget": false
}
```

## 9. 스케줄 설정

매일 오전 9시에 확인하도록 Trigger를 연결합니다.

```text
Cloud Functions
  -> Trigger
  -> Cron/Schedule Trigger 생성
```

Cron 예시:

```text
0 0 9 * * *
```

콘솔에서 Cron 표현식 기준이 UTC인지 KST인지 확인하고 수업 환경에 맞게 조정합니다.

## 10. Slack 메시지 예시

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
 4  Public IP                                 1,460 KRW

리포트 정보
requestId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
저장 경로: billing-reports/202608/ncp-billing-20260828.json
```

## 11. 코드 동작 설명

1. KST 기준 오늘 날짜를 계산합니다. `START_DATE`, `END_DATE`를 생략하면 자동으로 `이번 달 1일 ~ 오늘` 기간을 만듭니다.
2. Billing API `getDemandCostList`를 호출합니다.
3. Billing API `getProductDemandCostList`를 호출해 서비스별 비용을 가져옵니다.
4. 응답에서 `useAmount` 또는 비용 관련 숫자 필드를 찾아 합산합니다.
5. 전일 저장 리포트 또는 `PREVIOUS_USE_AMOUNT_KRW`와 비교해 증감액을 계산합니다.
6. `BUDGET_KRW`와 비교합니다.
7. `SAVE_REPORT_TO_OBJECT_STORAGE=true`이면 Object Storage에 JSON 리포트를 저장합니다.
8. Slack Incoming Webhook으로 메시지를 보냅니다.

주의할 점은 Billing API의 기본 조회 단위가 `yyyyMM` 월 단위라는 것입니다. `START_DATE`, `END_DATE`는 Slack 메시지와 리포트에 표시할 기간이며, API 호출에는 해당 날짜가 속한 `START_MONTH`, `END_MONTH`가 사용됩니다. 날짜 파라미터를 생략하면 매일 실행 시 자동으로 오늘 날짜가 반영됩니다.

## 12. Object Storage 저장 시 boto3 체크섬 설정

`ncp-billing.zip` 예제는 `SAVE_REPORT_TO_OBJECT_STORAGE=true`일 때 비용 조회 결과를 Object Storage에 JSON 파일로 저장합니다. 이때 `main.py` 안에서 `boto3`와 아래 `botocore.config.Config`를 사용합니다.

최근 `botocore` 버전에서는 요청/응답 체크섬 처리가 더 적극적으로 동작할 수 있고, S3 호환 스토리지에서 체크섬 관련 헤더 때문에 `AccessDenied`, `InvalidRequest`, 서명 오류처럼 보이는 문제가 발생할 수 있습니다.

Naver Cloud Object Storage를 `boto3`로 사용할 때는 아래 설정을 명시합니다.

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

`main.py`에 들어간 Object Storage client 생성 방식:

```python
import boto3
from botocore.config import Config

ACCESS_KEY = "YOUR_ACCESS_KEY"
SECRET_KEY = "YOUR_SECRET_KEY"
BUCKET = "YOUR_BUCKET_NAME"

config = Config(
    signature_version="s3v4",
    s3={
        "addressing_style": "path"
    },
    request_checksum_calculation="when_required",
    response_checksum_validation="when_required",
)

s3 = boto3.client(
    "s3",
    endpoint_url="https://kr.object.ncloudstorage.com",
    region_name="kr-standard",
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    config=config,
)

response = s3.list_objects_v2(Bucket=BUCKET)
print(response)
```

비용 리포트 저장 경로 예시:

```text
billing-reports/202608/ncp-billing-20260828.json
```

예제 파일:

```text
013-cost slack alert/examples/object-storage-checksum.py
```

실행 예시:

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

권한 확인 포인트:

- Access Key/Secret Key가 Object Storage 권한을 가진 계정인지 확인합니다.
- 버킷 정책 또는 IAM 정책에서 `ListBucket`, `GetObject`, `PutObject` 권한을 확인합니다.
- Naver Cloud Object Storage는 path-style 접근을 쓰는 것이 안전합니다.
- `endpoint_url`은 한국 리전 기준 `https://kr.object.ncloudstorage.com`을 사용합니다.
- 최신 `boto3`/`botocore`에서 원인 불명의 `AccessDenied`가 나면 체크섬 설정을 먼저 확인합니다.

## 13. 장애 확인

### Billing API 인증 실패

- `NCP_ACCESS_KEY`, `NCP_SECRET_KEY` 값 확인
- Billing API 조회 권한 확인
- 함수 실행 시간이 현재 시간과 크게 차이 나지 않는지 확인
- `Expired timestamp`가 나오면 함수 코드가 현재 epoch millisecond를 보내는지 확인합니다. 이 예제는 Cloud Functions 런타임 시각 차이에 대비하기 위해 Billing API Gateway의 `Date` 헤더를 먼저 읽고, 그 시간을 기준으로 서명합니다. Date 헤더를 가져오지 못할 때만 `time.time()`을 사용합니다.

### Slack 전송 실패

- Webhook URL 확인
- Slack 앱이 채널에 추가되어 있는지 확인
- Webhook URL을 Git에 커밋하지 않았는지 확인

### 금액이 0으로 나오는 경우

- 조회 월 확인
- 아직 청구 데이터가 집계되지 않은 시점인지 확인
- 계정에 실제 사용량이 있는지 확인

### Object Storage AccessDenied

- Object Storage Manager 권한만으로 충분하지 않을 수 있으므로 버킷 단위 정책과 IAM 정책을 함께 확인합니다.
- `PutObject`만 실패하면 업로드 권한, `ListObjectsV2`만 실패하면 버킷 목록 조회 권한을 확인합니다.
- S3 호환 API에서는 `region_name`, `endpoint_url`, `addressing_style`, 체크섬 설정이 실제 권한 문제처럼 보이는 오류를 만들 수 있습니다.

## 14. 참고 자료

- Naver Cloud Cost and Usage API: <https://api.ncloud-docs.com/docs/en/platform-costandusage>
- Naver Cloud API Workflow 비용 조회 예시: <https://guide.ncloud-docs.com/docs/en/apiworkflow-procedure>
- Naver Cloud Cloud Functions Sample Code: <https://guide.ncloud-docs.com/docs/en/cloudfunctions-samplecodes>
