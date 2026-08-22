# 002 Init Script

클라우드 서버 생성 시 초기화 스크립트(init script)를 사용해 기본 설정을 자동화하는 실습입니다.

이 예제에서는 Ubuntu 서버의 SSH 접속 포트를 `22`와 `2200` 두 개로 열어 둡니다. 기본 SSH 포트 `22`를 유지하면서 보조 포트 `2200`을 추가해, ACG/방화벽/서비스 재시작 흐름을 확인할 수 있습니다.

## 실습 목표

- 서버 생성 시 init script가 어떤 역할을 하는지 이해합니다.
- SSH 포트를 `22`, `2200`으로 동시에 열어 봅니다.
- ACG inbound 규칙과 서버 내부 SSH 설정의 차이를 확인합니다.
- SSH 설정 변경 시 기존 접속 세션을 유지한 상태로 검증하는 습관을 익힙니다.

## 1. ACG 포트 준비

스크립트를 실행하기 전에 ACG inbound에 아래 규칙을 먼저 추가합니다.

| Protocol | Port | Source | Purpose |
| --- | --- | --- | --- |
| TCP | 22 | 강사/관리자 IP | 기본 SSH 접속 |
| TCP | 2200 | 강사/관리자 IP | 추가 SSH 접속 |

`0.0.0.0/0`로 열 수도 있지만, SSH는 가능한 한 본인 IP 또는 강의장 IP 대역으로 제한하는 것을 권장합니다.

## 2. Init Script

서버 생성 화면의 init script 입력란에 아래 내용을 넣습니다.

```bash
#!/bin/bash
set -e

mkdir -p /etc/systemd/system/ssh.socket.d

cat > /etc/systemd/system/ssh.socket.d/override.conf <<'EOF'
[Socket]
ListenStream=
ListenStream=22
ListenStream=2200
EOF

sed -i '/^Port /d' /etc/ssh/sshd_config
sed -i '1i Port 2200' /etc/ssh/sshd_config
sed -i '1i Port 22' /etc/ssh/sshd_config

systemctl daemon-reload
systemctl restart ssh.socket
systemctl restart ssh
```

같은 스크립트는 [scripts/configure-ssh-ports.sh](./scripts/configure-ssh-ports.sh)에 저장되어 있습니다.

## 3. 기존 서버에서 직접 실행

이미 생성된 Ubuntu 서버에서 테스트하려면:

```bash
cd "002-init script"
chmod +x scripts/configure-ssh-ports.sh
sudo ./scripts/configure-ssh-ports.sh
```

## 4. 접속 확인

기존 SSH 세션을 끊지 않은 상태에서 새 터미널을 열고 확인합니다.

기본 포트:

```bash
ssh -p 22 USERNAME@SERVER_PUBLIC_IP
```

추가 포트:

```bash
ssh -p 2200 USERNAME@SERVER_PUBLIC_IP
```

서버 내부에서 리슨 포트를 확인합니다.

```bash
sudo ss -ltnp | grep ssh
```

예상 결과:

```text
LISTEN ... 0.0.0.0:22
LISTEN ... 0.0.0.0:2200
```

## 5. 트러블슈팅

`2200`으로 접속이 안 되는 경우:

- ACG inbound에 `TCP 2200`이 열려 있는지 확인합니다.
- 서버 내부 방화벽을 사용 중이면 `sudo ufw allow 2200/tcp`를 실행합니다.
- `sudo ss -ltnp | grep ssh`로 서버가 실제로 `2200`을 듣고 있는지 확인합니다.
- 기존 SSH 세션을 끊지 말고 새 터미널에서 테스트합니다.

`ssh.socket` 재시작 실패:

- Ubuntu 버전에 따라 SSH 서비스 구성이 다를 수 있습니다.
- 아래 명령으로 서비스 이름을 확인합니다.

```bash
systemctl status ssh
systemctl status ssh.socket
```

