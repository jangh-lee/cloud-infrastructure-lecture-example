# 012 Load Balancer

Ubuntu 서버에서 `nginx` 기반으로 아주 단순한 백엔드 노드를 띄우기 위한 실습용 예제입니다.

로드밸런서 뒤에 여러 대를 붙여두고 새로고침하거나 트래픽을 분산시키면, 어떤 백엔드가 응답했는지 바로 확인할 수 있습니다.

## 화면에 표시되는 정보

| 항목 | 값 |
| --- | --- |
| User Input | Init Script에 전달한 자유로운 표시 문구 |
| Hostname | 서버마다 자동으로 부여된 호스트명 |
| Primary IP (NIC) | 서버 NIC의 기본 IP이며 일반적으로 사설 IP |
| All IPs | 서버 인터페이스에서 확인한 전체 IP |
| Date, Time | 서버가 응답한 현재 날짜와 시간 |

여러 서버에 같은 User Input을 사용해도 Hostname과 IP가 다르므로 어떤 백엔드가 응답했는지 구분할 수 있습니다.

## 헬스체크 경로

- `GET /healthz`

## 구성 파일

- `init.sh`: 신규 서버와 기존 서버가 공통으로 실행하는 통합 Init Script
- `install.sh`: Ubuntu 서버 설치 스크립트
- `update_status.sh`: 상태 JSON 갱신 스크립트
- `templates/index.html.template`: 정적 HTML 템플릿

## 통합 Init Script

신규 서버의 Naver Cloud Init Script와 이미 생성한 서버의 터미널에서 **같은 코드 박스 하나만 사용**합니다. `userinput`에는 `강의장 LB 실습`, `내 웹 서버`처럼 원하는 표시 문구 하나를 입력합니다.

아래 코드에서 기본 문구만 원하는 글자로 바꾼 뒤 전체를 실행합니다. Naver Cloud가 `userinput`을 전달하면 해당 값이 우선 사용됩니다.

```bash
#!/usr/bin/env bash
set -euo pipefail

userinput="${userinput:-내가 넣고 싶은 글자}"
INIT_FILE="/tmp/lb-demo-init.sh"
INIT_URL="https://raw.githubusercontent.com/jangh-lee/cloud-infrastructure-lecture-example/main/012-load%20balancer/init.sh"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL --retry 5 "${INIT_URL}" -o "${INIT_FILE}"
else
  wget -q "${INIT_URL}" -O "${INIT_FILE}"
fi

chmod +x "${INIT_FILE}"
userinput="${userinput}" "${INIT_FILE}"
```

통합 스크립트는 저장소를 clone하지 않습니다. 매번 최신 설치 파일을 `/opt/lb-demo-installer`에 내려받아 신규 서버를 설치하거나 기존 설치를 동일한 상태로 갱신합니다. 일반 사용자로 실행하면 내부에서 한 번만 `sudo`로 전환합니다.

## 설치 후 확인

```bash
curl http://localhost/healthz
curl http://localhost/status.json
```

`status.json`에서는 다음 키를 확인합니다.

```json
{
  "serverName": "내가 넣고 싶은 글자",
  "hostname": "서버별-호스트명",
  "primaryIp": "10.x.x.x",
  "allIps": "10.x.x.x"
}
```

## 503 확인

먼저 Load Balancer가 아니라 각 Target 서버에서 확인합니다.

```bash
sudo systemctl is-active nginx
curl -i http://127.0.0.1/healthz
curl -s http://127.0.0.1/status.json
sudo ss -lntp | grep ':80'
```

`nginx`가 `active`, `/healthz`가 HTTP `200`, 응답 본문이 `ok`이면 서버 설치는 정상입니다. 이 상태에서 Load Balancer만 503이면 다음 값을 수정합니다.

- Target Group 프로토콜과 포트: `HTTP`, `80`
- Health Check 프로토콜과 포트: `HTTP`, `80`
- Health Check URL Path: `/healthz`
- 웹 서버 ACG 인바운드: Load Balancer Subnet CIDR에서 웹 서버 `80/tcp` 허용
- Target 상태: `Healthy`가 된 뒤 Load Balancer URL 재접속

브라우저에서는 아래 주소로 접속합니다.

```text
http://SERVER_IP/
```

## 로드밸런서 100회 호출 테스트

로드밸런서가 어떤 백엔드로 얼마나 분산했는지 `hostname` 기준으로 집계합니다. 사용하는 터미널에 맞는 명령 하나를 실행합니다.

### Linux 또는 macOS 터미널

```bash
LB_URL="http://YOUR_LOAD_BALANCER_URL"

for i in $(seq 1 100); do
  curl -s "$LB_URL/status.json" | sed -n 's/.*"hostname"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
done | sort | uniq -c
```

### Windows Terminal PowerShell

```powershell
$LB_URL = "http://YOUR_LOAD_BALANCER_URL"

$results = 1..100 | ForEach-Object {
  (Invoke-RestMethod -Uri "$LB_URL/status.json" -Method Get).hostname
}

$results |
  Group-Object |
  Sort-Object Count -Descending |
  Select-Object Count, Name
```

정상적으로 분산되면 두 환경 모두 다음처럼 Hostname별 호출 횟수가 표시됩니다.

```text
Count Name
----- ----
   52 lb-node-001
   48 lb-node-002
```

호출 횟수의 합이 `100`인지 확인합니다. Hostname이 하나만 나오면 Target Group에 Healthy 서버가 한 대만 연결되어 있는지 확인합니다.

## 동작 방식

- `nginx`가 `/var/www/lb-demo`의 정적 파일을 서비스합니다.
- `systemd timer`가 1분마다 `status.json`을 갱신합니다.
- 메인 페이지는 `/status.json`을 읽어 날짜, 시간, User Input, 호스트명, NIC IP 정보를 표시합니다.
- IPv6를 지원하지 않는 Ubuntu 환경에서도 설치되도록, 패키지 설치 중 기본 `nginx` 자동 시작은 막고 사용자 설정으로 다시 기동합니다.
