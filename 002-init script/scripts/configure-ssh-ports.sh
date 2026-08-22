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
