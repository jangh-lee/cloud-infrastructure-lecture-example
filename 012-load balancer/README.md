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

- `install.sh`: Ubuntu 서버 설치 스크립트
- `update_status.sh`: 상태 JSON 갱신 스크립트
- `templates/index.html.template`: 정적 HTML 템플릿

## Naver Cloud Init Script

서버 생성 시 입력할 수 있는 `userinput`은 하나뿐입니다. 여기에 노드 번호를 억지로 넣지 않고 `강의장 LB 실습`, `내 웹 서버`처럼 원하는 표시 문구 하나를 입력합니다. 여러 서버를 동시에 생성하면 같은 문구가 표시되지만 Hostname과 IP는 서버마다 자동으로 달라집니다.

Init Script에는 아래 내용을 그대로 등록합니다.

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

Init Script는 서버 생성 시 root 권한으로 한 번 실행되므로 내부 명령에는 `sudo`가 필요하지 않습니다.

## 기존 서버에서 수동 설치

```bash
userinput="내가 넣고 싶은 글자"
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd "cloud-infrastructure-lecture-example/012-load balancer"
chmod +x install.sh
sudo userinput="$userinput" ./install.sh
```

설치 과정에서 추가 입력은 받지 않으며 `userinput` 값은 화면의 User Input에 그대로 표시됩니다.

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

브라우저에서는 아래 주소로 접속합니다.

```text
http://SERVER_IP/
```

## 로드밸런서 100회 호출 테스트

로드밸런서가 어떤 백엔드로 얼마나 분산했는지 `hostname` 기준으로 집계하려면 아래처럼 실행하면 됩니다.

```bash
LB_URL="http://YOUR_LOAD_BALANCER_URL"

for i in $(seq 1 100); do
  curl -s "$LB_URL/status.json" | sed -n 's/.*"hostname"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
done | sort | uniq -c
```

`grep -P`를 지원하지 않는 환경도 있어서, 예제는 `sed` 기준으로 넣었습니다.

## 동작 방식

- `nginx`가 `/var/www/lb-demo`의 정적 파일을 서비스합니다.
- `systemd timer`가 1분마다 `status.json`을 갱신합니다.
- 메인 페이지는 `/status.json`을 읽어 날짜, 시간, User Input, 호스트명, NIC IP 정보를 표시합니다.
- IPv6를 지원하지 않는 Ubuntu 환경에서도 설치되도록, 패키지 설치 중 기본 `nginx` 자동 시작은 막고 사용자 설정으로 다시 기동합니다.
