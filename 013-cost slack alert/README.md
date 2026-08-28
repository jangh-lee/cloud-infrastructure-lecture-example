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
013-cost slack alert/function/__main__.py
```

업로드용 zip 파일:

```text
013-cost slack alert/dist/ncp-cost-slack-alert.zip
```

zip 파일에는 `__main__.py`가 루트에 들어 있어야 합니다.

## 5. zip 파일 다시 만들기

로컬에서 zip을 다시 만들려면:

```bash
cd "013-cost slack alert"
./scripts/build-zip.sh
```

생성 결과:

```text
dist/ncp-cost-slack-alert.zip
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
| Upload File | `dist/ncp-cost-slack-alert.zip` |
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
| `START_MONTH` | 이번 달 | 조회 시작 월, `yyyyMM` |
| `END_MONTH` | 이번 달 | 조회 종료 월, `yyyyMM` |
| `BUDGET_KRW` | `0` | 예산 기준 금액 |
| `ALERT_ONLY_OVER_BUDGET` | `false` | `true`면 예산 초과 시에만 Slack 전송 |
| `SLACK_CHANNEL` | Slack Webhook 기본 채널 | Webhook이 허용하는 경우 채널 override |
| `SLACK_USERNAME` | `NCP Cost Bot` | Slack 표시 이름 |

## 8. 테스트 파라미터 예시

Cloud Functions 테스트 실행 시 아래처럼 넣습니다.

```json
{
  "NCP_ACCESS_KEY": "YOUR_NCP_ACCESS_KEY",
  "NCP_SECRET_KEY": "YOUR_NCP_SECRET_KEY",
  "SLACK_WEBHOOK_URL": "https://hooks.slack.com/services/...",
  "BUDGET_KRW": "5000",
  "ALERT_ONLY_OVER_BUDGET": "false"
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
NCP 비용 알림
조회 월: 202608
현재 사용 금액: 12,340 KRW
예산: 10,000 KRW
상태: 예산 초과
```

## 11. 코드 동작 설명

1. 현재 월을 `yyyyMM` 형식으로 계산합니다.
2. Billing API `getDemandCostList`를 호출합니다.
3. 응답에서 `useAmount` 또는 비용 관련 숫자 필드를 찾아 합산합니다.
4. `BUDGET_KRW`와 비교합니다.
5. Slack Incoming Webhook으로 메시지를 보냅니다.

## 12. 장애 확인

### Billing API 인증 실패

- `NCP_ACCESS_KEY`, `NCP_SECRET_KEY` 값 확인
- Billing API 조회 권한 확인
- 함수 실행 시간이 현재 시간과 크게 차이 나지 않는지 확인

### Slack 전송 실패

- Webhook URL 확인
- Slack 앱이 채널에 추가되어 있는지 확인
- Webhook URL을 Git에 커밋하지 않았는지 확인

### 금액이 0으로 나오는 경우

- 조회 월 확인
- 아직 청구 데이터가 집계되지 않은 시점인지 확인
- 계정에 실제 사용량이 있는지 확인

## 13. 참고 자료

- Naver Cloud Cost and Usage API: <https://api.ncloud-docs.com/docs/en/platform-costandusage>
- Naver Cloud API Workflow 비용 조회 예시: <https://guide.ncloud-docs.com/docs/en/apiworkflow-procedure>
- Naver Cloud Cloud Functions Sample Code: <https://guide.ncloud-docs.com/docs/en/cloudfunctions-samplecodes>
