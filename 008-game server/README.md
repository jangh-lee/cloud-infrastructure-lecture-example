# 008 Game Server

Ubuntu 서버에 SuperTuxKart 게임 서버를 실행해 보는 실습입니다.

이 예제는 클라우드 서버 생성, ACG/방화벽, 공인 IP, UDP 포트, 클라이언트 접속을 설명하기 위한 자료입니다. HTTP 웹 서비스와 달리 게임 서버는 같은 방의 플레이어가 같은 서버 프로세스에 접속해야 하므로 Auto Scaling/LB 실습보다는 서버 생성 및 네트워크 실습에 더 적합합니다.

## 실습 구조

```text
Student PC
  └─ SuperTuxKart client
       └─ Public IP:2759 UDP

Ubuntu Server
  └─ SuperTuxKart LAN server
```

## 1. ACG 포트 열기

Naver Cloud ACG inbound 규칙에 아래 포트를 추가합니다.

| Protocol | Port | Source | Purpose |
| --- | --- | --- | --- |
| TCP | 22 | 강사/관리자 IP | SSH 접속 |
| UDP | 2759 | 학생 IP 대역 또는 `0.0.0.0/0` | SuperTuxKart 게임 서버 기본 포트 |
| UDP | 2757 | 학생 IP 대역 또는 `0.0.0.0/0` | 서버 discovery 용도 |

Ubuntu 방화벽 `ufw`를 사용 중이면 서버 안에서도 포트를 엽니다.

```bash
sudo ufw allow 2759/udp
sudo ufw allow 2757/udp
sudo ufw status
```

## 2. 서버 설치

Ubuntu 서버에서 SuperTuxKart를 설치합니다.

```bash
sudo apt update
sudo apt install -y supertuxkart
```

옵션 이름은 배포판 패키지 버전에 따라 약간 다를 수 있으므로 서버 관련 옵션을 확인합니다.

```bash
supertuxkart --help | grep -i server
supertuxkart --help | grep -i port
supertuxkart --help | grep -i player
```

## 3. 게임 서버 실행

기본 24명 서버를 실행합니다.

```bash
supertuxkart \
  --no-graphics \
  --no-sound \
  --lan-server=NCP-Lab \
  --port=2759 \
  --max-players=24
```

정상 실행 로그 예시:

```text
STKHost: Host initialized.
STKHost: Server port is 2759
main: Creating a LAN server 'NCP-Lab'.
STKHost: Listening has been started.
```

`Invalid parameter: --max-.`가 나오면 명령이 줄바꿈되면서 `--max-players=24`가 쪼개진 것입니다. `--max-players=24`는 한 줄로 입력해야 합니다.

서버가 실제로 포트를 열었는지 확인합니다.

```bash
sudo ss -lunp | grep 2759
```

## 4. 30명 접속 운영

SuperTuxKart 서버는 보통 최대 24명 기준으로 운영하는 것이 안전합니다. 30명이 동시에 실습한다면 서버를 2개로 나누는 편이 낫습니다.

터미널 1:

```bash
supertuxkart \
  --no-graphics \
  --no-sound \
  --lan-server=NCP-Lab-1 \
  --port=2759 \
  --max-players=15
```

터미널 2:

```bash
supertuxkart \
  --no-graphics \
  --no-sound \
  --lan-server=NCP-Lab-2 \
  --port=2760 \
  --max-players=15
```

이 경우 ACG와 `ufw`에 `2760/udp`도 추가합니다.

```bash
sudo ufw allow 2760/udp
```

## 5. 클라이언트 설치

학생 PC에는 SuperTuxKart 클라이언트를 설치합니다.

공식 다운로드:

```text
https://supertuxkart.net/Download
```

Ubuntu 클라이언트:

```bash
sudo apt update
sudo apt install -y supertuxkart
```

## 6. 클라이언트 접속

학생 PC에서 SuperTuxKart를 실행한 뒤 아래 순서로 접속합니다.

```text
Online
Global Networking
Enter server address
```

서버 주소에는 클라우드 서버의 공인 IP와 포트를 입력합니다.

```text
SERVER_PUBLIC_IP:2759
```

두 번째 서버를 열었다면 일부 학생은 아래 주소로 접속합니다.

```text
SERVER_PUBLIC_IP:2760
```

서버 목록에 보이지 않아도 직접 주소 접속은 가능할 수 있습니다.

## 7. 기본 조작키

| Key | Action |
| --- | --- |
| `↑` | 가속 |
| `↓` | 브레이크 / 후진 |
| `←` | 왼쪽 조향 |
| `→` | 오른쪽 조향 |
| `Space` | 아이템 사용 |
| `N` | 니트로 |
| `V` | 뒤 보기 |
| `Esc` | 일시정지 / 메뉴 |
| `Enter` | 메뉴 선택 |

조작키는 클라이언트에서 변경할 수 있습니다.

```text
Options
Controls
```

## 8. 트러블슈팅

서버가 열린 상태인지 확인:

```bash
sudo ss -lunp | grep 2759
```

ACG와 Ubuntu 방화벽 확인:

```bash
sudo ufw status
```

서버 실행 중 클라이언트 접속 로그 예시:

```text
STKHost: 1.2.3.4:51534 has just connected. There are now 1 peers.
ServerLobby: New player james with online id 0 from 1.2.3.4:51534 with SuperTuxKart/1.5.
```

`No saved online player session to create or connect to a wan server`:

- `--wan-server` 방식에서 온라인 계정 세션이 없을 때 발생할 수 있습니다.
- 강의장 실습에서는 `--lan-server=NCP-Lab`로 실행하고 학생들이 공인 IP와 포트로 직접 접속하는 방식이 단순합니다.

`Invalid parameter: --server=NCP-Lab`:

- 설치된 SuperTuxKart 버전이 `--server` 옵션을 지원하지 않는 경우입니다.
- `--lan-server=NCP-Lab`를 사용합니다.

`Invalid parameter: --max-.`:

- `--max-players=24`가 줄바꿈으로 쪼개진 상태입니다.
- 명령을 한 줄로 입력하거나 백슬래시를 사용하되 옵션 이름 자체는 쪼개지 않도록 합니다.
