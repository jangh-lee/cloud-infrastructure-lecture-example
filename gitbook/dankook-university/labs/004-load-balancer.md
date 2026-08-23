# 004 Load Balancer

## 목표

여러 Ubuntu 웹 노드를 만들고 Load Balancer 뒤에 연결해 헬스체크와 트래픽 분산을 확인합니다.

## 실습 폴더

```text
004-load balancer
```

## 백엔드 노드 설치

서버마다 `userinput` 값을 다르게 넣습니다.

```bash
userinput="node-1"
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd "cloud-infrastructure-lecture-example/004-load balancer"
chmod +x install.sh
sudo userinput="$userinput" ./install.sh
```

두 번째 서버에서는 예를 들어 아래처럼 바꿉니다.

```bash
userinput="node-2"
```

## 서버 확인

```bash
curl http://localhost/healthz
curl http://localhost/status.json
```

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

```bash
LB_URL="http://YOUR_LOAD_BALANCER_URL"

for i in $(seq 1 100); do
  curl -s "$LB_URL/status.json" | sed -n 's/.*"hostname"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
done | sort | uniq -c
```
