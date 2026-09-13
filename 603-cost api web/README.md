# 603 Cost API Web Tool

Naver Cloud Cost and Usage API의 필수 헤더와 Signature V2를 브라우저에서 만들고, Cloud Functions 프록시를 통해 `getDemandCostList` 응답을 확인하는 실습입니다.

## 구조

```text
MkDocs 실습 페이지
  -> 현재 시각 또는 입력 시각을 epoch millisecond로 변환
  -> Web Crypto API로 Signature V2 생성
  -> 필수 헤더와 curl 명령 출력
  -> Cloud Functions 프록시 호출
  -> Billing API getDemandCostList 응답 출력
```

정적 웹 문서에 NCP Secret Key를 저장하지 않습니다. 브라우저의 Secret Key 입력값은 Signature V2 생성에만 사용되며 `localStorage`, 쿠키, 네트워크 요청에 넣지 않습니다.

실제 Billing API 호출은 [`function/main.js`](./function/main.js)가 담당합니다. Cloud Functions 액션의 암호화 기본 파라미터에 다음 값을 등록합니다.

```json
{
  "NCP_ACCESS_KEY": "YOUR_ACCESS_KEY",
  "NCP_SECRET_KEY": "YOUR_SECRET_KEY",
  "WEB_TOOL_TOKEN": "A_LONG_RANDOM_TOKEN"
}
```

## Cloud Functions 권장 설정

| 항목 | 값 |
| --- | --- |
| Action type | Web Action |
| Runtime | Node.js |
| Main function | `main` |
| HTTP 원문 사용 | `false` |
| 헤더 옵션 설정 | `true` |
| Timeout | 30초 이상 |

`NCP_ACCESS_KEY`, `NCP_SECRET_KEY`, `WEB_TOOL_TOKEN`은 반드시 암호화 파라미터로 저장합니다. API Gateway HTTP 트리거를 연결한 뒤 생성된 HTTPS URL을 GitBook 도구의 `Cloud Functions 프록시 URL`에 입력합니다.

VPC 연결을 사용하는 액션에서 외부 HTTPS 통신이 차단되면 NAT Gateway와 라우팅을 확인합니다.

## 성공 기준

1. 현재 시각과 직접 입력한 시각이 13자리 epoch millisecond로 출력됩니다.
2. Signature V2, 필수 헤더 3개, 실행 가능한 `curl` 명령이 출력됩니다.
3. 프록시 URL과 도구 토큰을 입력한 뒤 `비용 조회`를 누르면 HTTP 상태와 `getDemandCostListResponse`가 출력됩니다.

자세한 사용법은 웹 교안의 `603 Cost API Web Tool` 페이지를 확인합니다.
