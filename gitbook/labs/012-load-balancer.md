# 012 Load Balancer

## 목표

여러 Ubuntu 웹 노드를 만들고 Load Balancer 뒤에 연결해 헬스체크와 트래픽 분산을 확인합니다.

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
```

`status.json`에서 `serverName`, `hostname`, `primaryIp`, `allIps`를 확인합니다. 공인 IP는 Naver Cloud에서 NAT 방식으로 연결될 수 있으므로 `primaryIp`에는 일반적으로 서버 NIC의 사설 IP가 표시됩니다.

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

User Input이 모든 서버에서 같더라도 아래 명령은 `hostname`을 기준으로 응답 횟수를 집계합니다.

```bash
LB_URL="http://YOUR_LOAD_BALANCER_URL"

for i in $(seq 1 100); do
  curl -s "$LB_URL/status.json" | sed -n 's/.*"hostname"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
done | sort | uniq -c
```
