# 603 Cost API Web Tool

## 목표

Naver Cloud Cost and Usage API의 필수 헤더와 Signature V2 생성 원리를 확인하고, 아래 웹 도구에서 timestamp, 서명, 요청 헤더, `curl`, 실제 비용 조회 응답을 바로 출력합니다.

!!! warning "Secret Key 보안"
    Secret Key를 Markdown, JavaScript 소스, Git 저장소에 넣지 않습니다. 아래 입력값은 현재 브라우저 메모리에서 서명을 만드는 데만 사용하며 저장하거나 프록시로 보내지 않습니다. 공용 PC와 신뢰할 수 없는 배포 주소에서는 인증키를 입력하지 마세요.

## 1. Cost and Usage API 필수 헤더

API 기본 URL:

```text
https://billingapi.apigw.ntruss.com/billing/v1
```

| 헤더 | 필수 | 값 |
| --- | --- | --- |
| `x-ncp-apigw-timestamp` | Required | 1970-01-01 00:00:00 UTC부터 현재까지의 epoch millisecond. API Gateway와 5분 이상 차이 나면 거부됩니다. |
| `x-ncp-iam-access-key` | Required | Naver Cloud 계정 또는 Sub Account의 Access Key |
| `x-ncp-apigw-signature-v2` | Required | Secret Key로 요청 문자열을 HMAC-SHA256 처리한 뒤 Base64로 인코딩한 값 |

헤더의 `x-ncp-apigw-timestamp`는 서명 생성에 사용한 timestamp와 반드시 같아야 합니다.

## 2. Signature V2 생성 규칙

요청 문자열은 아래 순서를 정확히 지킵니다. URI에는 쿼리 문자열까지 포함합니다.

```text
HTTP_METHOD + " " + URI_WITH_QUERY + "\n"
+ TIMESTAMP + "\n"
+ ACCESS_KEY
```

이번 실습의 예:

```text
GET /billing/v1/cost/getDemandCostList?startMonth=202609&endMonth=202609&responseFormatType=json
{timestamp}
{accessKey}
```

이 문자열을 Secret Key로 `HMAC-SHA256` 처리하고 결과 바이트를 Base64로 변환합니다.

```python
signature = base64.b64encode(
    hmac.new(
        SECRET_KEY.encode("utf-8"),
        message.encode("utf-8"),
        hashlib.sha256,
    ).digest()
).decode("utf-8")
```

## 3. 웹 도구

<div data-ncp-cost-api-tool>
  <p>웹 도구를 불러오는 중입니다.</p>
  <noscript>이 도구는 JavaScript를 활성화해야 사용할 수 있습니다.</noscript>
</div>

## 4. 실제 API 응답을 받기 위한 프록시 준비

GitHub Pages는 정적 사이트이므로 NCP Billing API를 직접 호출하면 CORS에 막힐 수 있고 Secret Key를 안전하게 보관할 수도 없습니다. 실제 호출은 NCP Cloud Functions에서 수행합니다.

1. Cloud Functions에서 Node.js `Web Action`을 생성합니다.
2. 저장소의 [`603-cost api web/function/main.js`](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/blob/main/603-cost%20api%20web/function/main.js) 내용을 소스 코드에 넣습니다.
3. Main function을 `main`, HTTP 원문 사용을 `false`, 헤더 옵션 설정을 `true`로 지정합니다.
4. `NCP_ACCESS_KEY`, `NCP_SECRET_KEY`, `WEB_TOOL_TOKEN`을 암호화 기본 파라미터로 등록합니다.
5. API Gateway HTTP 트리거를 연결하고 생성된 HTTPS 호출 URL을 위 도구의 프록시 URL에 입력합니다.

암호화 기본 파라미터 예시:

```json
{
  "NCP_ACCESS_KEY": "YOUR_ACCESS_KEY",
  "NCP_SECRET_KEY": "YOUR_SECRET_KEY",
  "WEB_TOOL_TOKEN": "A_LONG_RANDOM_TOKEN"
}
```

`WEB_TOOL_TOKEN`은 Billing API 키와 다른 긴 임의 문자열을 사용합니다. 프록시 코드는 토큰이 없거나 일치하지 않으면 요청을 거부하며, 응답에 Access Key, Secret Key, Signature를 포함하지 않습니다.

## 5. 출력 확인

성공 기준:

1. `현재 시각 사용`을 누르면 13자리 epoch millisecond와 KST/UTC 시간이 출력됩니다.
2. 날짜와 시간을 입력하고 `입력 시각 사용`을 누르면 선택한 시간대 기준 timestamp가 출력됩니다.
3. Access Key와 Secret Key를 입력하고 `서명과 헤더 만들기`를 누르면 Signature V2, 헤더 JSON, `curl`이 출력됩니다.
4. 프록시 URL과 도구 토큰을 입력하고 `비용 조회`를 누르면 HTTP 상태와 `getDemandCostListResponse`가 출력됩니다.

## 6. 오류 확인

| 증상 | 확인할 내용 |
| --- | --- |
| `Expired timestamp` | 현재 시각을 다시 선택하고 5분 안에 요청했는지 확인 |
| `Authentication Failed` | Access Key, Secret Key, timestamp, URI와 쿼리 파라미터 순서가 서명 당시와 같은지 확인 |
| `Permission Denied` | 계정 또는 Sub Account에 Cost and Usage 조회 권한이 있는지 확인 |
| 프록시 `401` | GitBook에 입력한 도구 토큰과 Cloud Functions의 `WEB_TOOL_TOKEN`이 같은지 확인 |
| 프록시 `502` | Cloud Functions의 외부 HTTPS 통신, VPC NAT Gateway, Billing API 응답을 확인 |

## 참고

- [Cost and Usage API 공통 설정](https://api.ncloud-docs.com/docs/platform-costandusage)
- [Ncloud API Signature V2 생성](https://api.ncloud-docs.com/docs/common-ncpapi)
- [getDemandCostList](https://api.ncloud-docs.com/docs/platform-costandusage-getdemandcostlist)
- [Cloud Functions Web Action 생성](https://guide.ncloud-docs.com/docs/cloudfunctions-actioncreate-vpc)
