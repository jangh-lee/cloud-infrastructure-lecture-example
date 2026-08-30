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

## Init Script 등록

Naver Cloud에서 Init Script를 생성하고 아래 내용을 등록합니다. 서버 생성 화면에서 `userinput`에는 원하는 표시 문구 하나를 입력합니다.

```bash
#!/usr/bin/env bash
set -euo pipefail

DISPLAY_NAME="${userinput:-Load Balancer Lab}"
REPO_DIR="/opt/cloud-infrastructure-lecture-example"

apt-get update
apt-get install -y git

if [[ -d "${REPO_DIR}/.git" ]]; then
  git -C "${REPO_DIR}" pull --ff-only
else
  git clone --depth 1 \
    https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git \
    "${REPO_DIR}"
fi

cd "${REPO_DIR}/012-load balancer"
chmod +x install.sh update_status.sh
userinput="${DISPLAY_NAME}" ./install.sh
```

Init Script는 서버 생성 시 root 권한으로 실행됩니다. 같은 Init Script로 여러 서버를 생성하면 User Input은 같아도 Hostname과 IP는 각각 다르게 표시됩니다.

## 기존 서버에서 수동 설치

```bash
userinput="내가 넣고 싶은 글자"
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd "cloud-infrastructure-lecture-example/012-load balancer"
chmod +x install.sh
sudo userinput="$userinput" ./install.sh
```

## 서버 확인

```bash
curl http://localhost/healthz
curl http://localhost/status.json
```

`status.json`에서 `serverName`, `hostname`, `primaryIp`, `allIps`를 확인합니다. 공인 IP는 Naver Cloud에서 NAT 방식으로 연결될 수 있으므로 `primaryIp`에는 일반적으로 서버 NIC의 사설 IP가 표시됩니다.

브라우저에서는 각 서버 공인 IP 또는 Load Balancer 주소로 접속합니다.

```text
http://SERVER_PUBLIC_IP/
http://LOAD_BALANCER_URL/
```

## ACG

- 웹 노드 `22/tcp`: 관리자 IP
- 웹 노드 `80/tcp`: Load Balancer 또는 실습자 IP
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
