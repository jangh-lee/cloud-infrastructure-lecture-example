# 004 Game Server 생성 실습

## 목표

Ubuntu 서버에서 SuperTuxKart 게임 서버를 실행하고, 학생 PC에서 공인 IP와 UDP 포트로 접속합니다.

실습 폴더:

```text
004-game server
```

## ACG 포트

| Protocol | Port | Purpose |
| --- | --- | --- |
| TCP | 22 | SSH |
| UDP | 2759 | SuperTuxKart 게임 서버 |
| UDP | 2757 | 서버 discovery |

Ubuntu 방화벽:

```bash
sudo ufw allow 2759/udp
sudo ufw allow 2757/udp
sudo ufw status
```

## 서버 설치

```bash
sudo apt update
sudo apt install -y supertuxkart
```

## 서버 실행

```bash
supertuxkart \
  --no-graphics \
  --no-sound \
  --lan-server=NCP-Lab \
  --port=2759 \
  --max-players=24
```

스크립트로 실행:

```bash
cd ~/cloud-infrastructure-lecture-example
cd "004-game server"
./scripts/start-supertuxkart.sh
```

서버 포트 확인:

```bash
sudo ss -lunp | grep 2759
```

정상 로그 예시:

```text
STKHost: Server port is 2759
main: Creating a LAN server 'NCP-Lab'.
STKHost: Listening has been started.
```

## 30명 접속 운영

SuperTuxKart는 한 서버를 24명 이하로 운영하는 것이 안전합니다. 30명 실습이면 서버를 2개로 나눕니다.

서버 1:

```bash
SERVER_NAME=NCP-Lab-1 SERVER_PORT=2759 MAX_PLAYERS=15 \
  ./scripts/start-supertuxkart.sh
```

서버 2:

```bash
SERVER_NAME=NCP-Lab-2 SERVER_PORT=2760 MAX_PLAYERS=15 \
  ./scripts/start-supertuxkart.sh
```

추가 포트:

```bash
sudo ufw allow 2760/udp
```

## 학생 접속

클라이언트 다운로드:

```text
https://supertuxkart.net/Download
```

접속 경로:

```text
Online
Global Networking
Enter server address
```

서버 주소:

```text
SERVER_PUBLIC_IP:2759
```

## 기본 조작키

| Key | Action |
| --- | --- |
| `↑` | 가속 |
| `↓` | 브레이크 / 후진 |
| `←` | 왼쪽 조향 |
| `→` | 오른쪽 조향 |
| `Space` | 아이템 사용 |
| `N` | 니트로 |
| `V` | 뒤 보기 |
| `Esc` | 메뉴 |
