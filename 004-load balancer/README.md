# Chapter 2. Load Balancer

Ubuntu 서버에서 `nginx` 기반으로 아주 단순한 백엔드 노드를 띄우기 위한 실습용 예제입니다.

로드밸런서 뒤에 여러 대를 붙여두고 새로고침하거나 트래픽을 분산시키면, 어떤 백엔드가 응답했는지 바로 확인할 수 있습니다.

## 화면에 표시되는 정보

- 날짜
- 시간
- 설치 시 입력한 이름
- 호스트명
- IP 정보

## 헬스체크 경로

- `GET /healthz`

## 구성 파일

- `install.sh`: Ubuntu 서버 설치 스크립트
- `update_status.sh`: 상태 JSON 갱신 스크립트
- `templates/index.html.template`: 정적 HTML 템플릿

## 설치 방법

```bash
userinput="node-1"
chmod +x install.sh
sudo userinput="$userinput" ./install.sh
```

설치 과정에서 추가 입력은 받지 않습니다. `userinput` 값이 그대로 Display Name에 표시됩니다.

## 공개 리포 사용자용 복붙 스크립트

```bash
userinput="node-1"
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd "cloud-infrastructure-lecture-example/004-load balancer"
chmod +x install.sh
sudo userinput="$userinput" ./install.sh
```

## 설치 후 확인

```bash
curl http://localhost/healthz
curl http://localhost/status.json
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
- 메인 페이지는 `/status.json`을 읽어 날짜, 시간, 이름, 호스트명, IP 정보를 표시합니다.
- IPv6를 지원하지 않는 Ubuntu 환경에서도 설치되도록, 패키지 설치 중 기본 `nginx` 자동 시작은 막고 사용자 설정으로 다시 기동합니다.
