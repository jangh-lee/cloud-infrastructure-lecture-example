# 002 Init Script

## 목표

서버 생성 시 init script를 사용해 Ubuntu 서버의 SSH 포트를 자동으로 재설정합니다.

이 실습에서는 SSH를 `22`, `2200` 두 포트에서 동시에 접속 가능하도록 구성합니다.

실습 폴더:

```
002-init script
```

## ACG 준비

서버 생성 전 ACG inbound에 아래 포트를 엽니다.

| Protocol | Port | Purpose |
| -------- | ---- | ------- |
| TCP      | 22   | 기본 SSH  |
| TCP      | 2200 | 추가 SSH  |

SSH는 가능하면 본인 IP 또는 강의장 IP 대역에서만 접근하도록 제한합니다.

## Init Script

서버 생성 화면의 init script 입력란에 아래 스크립트를 넣습니다.

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

## 기존 서버에서 실행

이미 생성된 서버에서 실행할 수도 있습니다.

```bash
cd ~/cloud-infrastructure-lecture-example
cd "002-init script"
chmod +x scripts/configure-ssh-ports.sh
sudo ./scripts/configure-ssh-ports.sh
```

## 접속 확인

기존 SSH 세션은 끊지 말고, 새 터미널에서 확인합니다.

```bash
ssh -p 2200 root@SERVER_PUBLIC_IP
```

```bash
ssh -p 22 USERNAME@SERVER_PUBLIC_IP
```

```bash
ssh -p 2200 USERNAME@SERVER_PUBLIC_IP
```



서버 내부 확인:

```bash
sudo ss -ltnp | grep ssh
```

## 문제 해결

`2200`으로 접속되지 않으면 아래를 확인합니다.

* ACG inbound에 `TCP 2200`이 열려 있는지 확인합니다.
* Ubuntu 방화벽을 사용 중이면 `sudo ufw allow 2200/tcp`를 실행합니다.
* `sudo ss -ltnp | grep ssh`로 `2200` 리슨 여부를 확인합니다.
* `systemctl status ssh`와 `systemctl status ssh.socket`으로 서비스 상태를 확인합니다.
