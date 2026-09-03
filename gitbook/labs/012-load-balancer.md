# 012 Load Balancer

## 목표

여러 Ubuntu 웹 노드를 만들고 Load Balancer 뒤에 연결해 헬스체크와 트래픽 분산을 확인합니다. Target 서버에는 013 Auto Scaling 부하 실습에 사용할 패키지도 함께 설치합니다.

`userinput`은 원하는 표시 문구 하나만 사용하고, 실제 백엔드 구분은 서버마다 자동으로 달라지는 Hostname과 IP로 확인합니다.

## 실습 폴더

```text
012-load balancer
```

## 화면에서 확인할 값

| 화면 항목 | 의미 | 서버별 차이 |
| --- | --- | --- |
| User Input | Init Script에 전달한 자유로운 문구 | 같아도 됨 |
| Hostname | 서버에 자동 부여된 호스트명 | 다름 |
| Primary IP (NIC) | 서버 NIC의 기본 IP이며 일반적으로 사설 IP | 다름 |
| All IPs | 서버 인터페이스의 전체 IP | 다름 |
| Date, Time | 해당 서버가 응답한 시간 | 요청 시점에 따라 다름 |

!!! note "User Input은 하나만 사용"
    서버를 여러 대 생성하더라도 `node-1`, `node-2`처럼 값을 따로 만들 필요가 없습니다. `강의장 LB 실습`처럼 원하는 글자 하나를 입력하고 Hostname과 IP가 바뀌는지 관찰합니다.

## 통합 Init Script

신규 서버의 Naver Cloud Init Script와 이미 생성된 서버의 터미널에서 **같은 코드 박스 하나만 사용**합니다. 기존 서버용 Git clone 절차나 별도의 수동 설치 절차는 없습니다.

`userinput` 기본값을 원하는 글자로 바꾸고 전체를 실행합니다. Naver Cloud가 `userinput`을 전달하면 해당 값이 우선 사용됩니다.

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

통합 스크립트는 최신 설치 파일을 `/opt/lb-demo-installer`에 내려받고 신규 서버 설치와 기존 설치 갱신을 같은 방식으로 수행합니다. 일반 사용자로 실행하면 내부에서 `sudo`로 전환합니다.

## 서버 확인

```bash
curl http://localhost/healthz
curl http://localhost/status.json
curl -fsS -H 'X-Lab-Token: asg-lab' http://localhost/stress-status
sudo systemctl is-active lb-demo-stress.service
stress-ng --version
htop --version
```

`status.json`에서 `serverName`, `hostname`, `primaryIp`, `allIps`를 확인합니다. 공인 IP는 Naver Cloud에서 NAT 방식으로 연결될 수 있으므로 `primaryIp`에는 일반적으로 서버 NIC의 사설 IP가 표시됩니다.

`stress-ng`는 013에서 CPU 부하를 발생시키고, `htop`은 서버에 직접 접속해 문제를 확인할 때 사용할 수 있는 선택 도구입니다. 통합 Init Script가 두 패키지를 Nginx와 함께 설치하며, 013 기본 부하 실습에는 SSH를 사용하지 않습니다.

`lb-demo-stress.service`는 `127.0.0.1:8081`에서만 실행되고 Nginx의 `/stress` 요청을 받습니다. `www-data`가 임시 파일을 만들 수 있도록 작업 디렉터리는 `/tmp`를 사용합니다. 요청이 반복되어도 서버마다 `stress-ng`를 하나만 실행하며 20초 뒤 자동 종료하므로, 013에서 Load Balancer를 통해 제한된 CPU 부하를 줄 수 있습니다. `/stress-status`에서는 요청을 처리한 Hostname, 부하 실행 여부, 프로세스 ID, 종료 코드와 1분 Load Average를 확인할 수 있습니다.

`stressRunning`이 바로 `false`가 되거나 `exitCode`가 `0`이 아니면 서비스 로그를 확인합니다.

```bash
sudo journalctl -u lb-demo-stress.service -n 30 --no-pager
```

## 503 복구 확인

통합 Init Script를 Target 서버마다 한 번 실행한 뒤 다음 명령을 실행합니다.

```bash
sudo systemctl is-active nginx
curl -i http://127.0.0.1/healthz
curl -s http://127.0.0.1/status.json
sudo ss -lntp | grep ':80'
```

다음 결과를 모두 확인하고 넘어갑니다.

- `nginx` 상태가 `active`
- `/healthz` 응답이 HTTP `200`이고 본문이 `ok`
- `/status.json`에 `hostname`, `primaryIp`가 출력됨
- `0.0.0.0:80` 또는 `*:80`이 LISTEN 상태

로컬 확인은 모두 정상인데 Load Balancer URL만 503이면 애플리케이션 문제가 아니라 Target Group 또는 ACG 문제입니다.

| 확인 항목 | 설정값 |
| --- | --- |
| Target Group 프로토콜, 포트 | `HTTP`, `80` |
| Health Check 프로토콜, 포트 | `HTTP`, `80` |
| Health Check URL Path | `/healthz` |
| 웹 서버 ACG 인바운드 | Load Balancer Subnet CIDR에서 웹 서버 `80/tcp` 허용 |
| Target 상태 | `Healthy` |

브라우저에서는 각 서버 공인 IP 또는 Load Balancer 주소로 접속합니다.

```text
http://SERVER_PUBLIC_IP/
http://LOAD_BALANCER_URL/
```

## ACG

- 웹 노드 `22/tcp`: 관리자 IP
- 웹 노드 `80/tcp`: Load Balancer Subnet CIDR 또는 실습자 IP
- Load Balancer 리스너: `80/tcp`
- Load Balancer 헬스체크 경로: `/healthz`

## 분산 확인

User Input이 모든 서버에서 같더라도 `hostname`을 기준으로 응답 횟수를 집계합니다. 먼저 Target Group의 Sticky Session을 끈 상태에서 사용하는 터미널에 맞는 명령 하나를 실행합니다.

### Sticky Session OFF

#### Linux 또는 macOS 터미널

먼저 실제 Load Balancer 주소를 입력해 한 번 실행합니다.

```bash
LB_URL="http://YOUR_LOAD_BALANCER_URL"
```

그다음 아래 박스만 복사해 100회 호출합니다.

```bash
for i in $(seq 1 100); do
  curl -s "$LB_URL/status.json" | sed -n 's/.*"hostname"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
done | sort | uniq -c
```

#### Windows Terminal PowerShell

먼저 실제 Load Balancer 주소를 입력해 한 번 실행합니다.

```powershell
$LB_URL = "http://YOUR_LOAD_BALANCER_URL"
```

그다음 아래 박스만 복사해 100회 호출합니다.

```powershell
$results = 1..100 | ForEach-Object {
  (Invoke-RestMethod -Uri "$LB_URL/status.json" -Method Get).hostname
}

$results |
  Group-Object |
  Sort-Object Count -Descending |
  Select-Object Count, Name
```

정상적으로 분산되면 다음처럼 Hostname별 호출 횟수가 표시됩니다.

```text
Count Name
----- ----
   52 lb-node-001
   48 lb-node-002
```

호출 횟수의 합이 `100`인지 확인합니다. Sticky Session이 꺼져 있는데 Hostname이 하나만 나오면 Target Group에 Healthy 서버가 한 대만 연결되어 있는지 확인합니다.

### Sticky Session ON

[Naver Cloud Target Group 공식 가이드](https://guide.ncloud-docs.com/docs/loadbalancer-targetgroup-vpc)는 Sticky Session을 서버 고유 ID를 헤더에 추가해 다음 요청도 같은 서버로 전달하는 기능으로 설명합니다. 따라서 100회 요청에서도 **같은 세션 정보를 계속 재사용**해야 합니다.

기존 명령처럼 매번 새 `curl` 또는 새 PowerShell 요청을 만들면 세션이 유지되지 않아 Sticky Session을 켜도 여러 서버로 분산될 수 있습니다.

#### Linux 또는 macOS 터미널

먼저 실제 Load Balancer 주소를 입력해 한 번 실행합니다.

```bash
LB_URL="http://YOUR_LOAD_BALANCER_URL"
```

그다음 아래 박스를 복사합니다. 임시 쿠키 파일 생성부터 삭제까지 한 번에 실행됩니다.

```bash
COOKIE_JAR="$(mktemp)"

for i in $(seq 1 100); do
  curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$LB_URL/status.json" |
    sed -n 's/.*"hostname"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
done | sort | uniq -c

rm -f "$COOKIE_JAR"
```

#### Windows Terminal PowerShell

먼저 실제 Load Balancer 주소를 입력해 한 번 실행합니다.

```powershell
$LB_URL = "http://YOUR_LOAD_BALANCER_URL"
```

그다음 아래 박스를 복사합니다. 같은 PowerShell Web Session으로 100회 호출합니다.

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$results = 1..100 | ForEach-Object {
  (Invoke-RestMethod -Uri "$LB_URL/status.json" -WebSession $session).hostname
}

$results |
  Group-Object |
  Sort-Object Count -Descending |
  Select-Object Count, Name
```

Sticky Session이 정상이라면 다음처럼 Hostname 하나에 100회가 집계됩니다.

```text
Count Name
----- ----
  100 lb-node-001
```

새 쿠키 파일, 새 PowerShell 세션, 시크릿 브라우저는 새로운 세션이므로 처음 선택되는 서버가 달라질 수 있습니다. 고정된 Target이 Unhealthy 상태가 되어 제외되어도 다른 서버로 전환될 수 있습니다.

## 013 실습으로 이어가기

012 실습이 끝나도 다음 리소스는 삭제하지 않습니다.

- Load Balancer
- Target Group
- 이미지 원본으로 사용할 Target 서버 한 대

013 Step 1에서 기존 Target 서버를 선택해 내 서버 이미지를 생성합니다. HTTP Stress API, `stress-ng`, `htop`, Nginx와 상태 갱신 timer는 012 통합 Init Script로 이미 설치되어 있습니다.
