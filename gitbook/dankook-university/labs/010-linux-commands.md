# 010 Linux Commands

## 목표

클라우드 엔지니어가 Ubuntu 서버에 접속했을 때 자주 쓰는 기본 명령어를 익힙니다.

## 1. 접속 직후 확인

```bash
whoami
id
pwd
hostname
hostnamectl
cat /etc/os-release
date
timedatectl
```

## 2. 아키텍처와 리소스

```bash
uname -m
arch
uname -a
lscpu
free -h
```

| 값 | 의미 |
| --- | --- |
| `x86_64` | Intel/AMD 64비트 서버 |
| `aarch64` | ARM 64비트 서버 |

## 3. 파일과 디렉터리

```bash
ls -la
cd /var/log
cd ~
cat /etc/os-release
less /var/log/syslog
tail -n 50 /var/log/syslog
tail -f /var/log/syslog
mkdir -p ~/lab/logs
touch ~/lab/test.txt
cp ~/lab/test.txt ~/lab/test-copy.txt
mv ~/lab/test-copy.txt ~/lab/logs/
rm ~/lab/test.txt
```

운영 서버에서 `rm -rf`는 삭제 전 경로를 반드시 확인합니다.

## 4. 검색

```bash
find /etc -name "*.conf" 2>/dev/null
find . -type f -name "*.log"
grep -n "error" /var/log/syslog
grep -Rni "listen" /etc/nginx 2>/dev/null
find /var/log -type f -mtime -1 2>/dev/null
```

## 5. 권한

```bash
ls -l
sudo chown ubuntu:ubuntu file.txt
chmod +x script.sh
chmod 400 key.pem
sudo -l
```

## 6. 패키지

```bash
sudo apt-get update
sudo apt-get install -y curl git vim htop net-tools
dpkg -l | grep nginx
apt-cache policy nginx
```

## 7. 프로세스

```bash
ps aux
ps aux | grep nginx
top
htop
sudo kill PID
sudo kill -9 PID
```

`kill -9`는 강제 종료이므로 마지막 수단으로 사용합니다.

## 8. systemd 서비스

```bash
systemctl status nginx
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
sudo systemctl disable nginx
journalctl -u nginx
journalctl -u nginx -n 100
journalctl -u nginx -f
```

## 9. 네트워크

```bash
ip addr
ip -br addr
ip route
resolvectl status
cat /etc/resolv.conf
ping -c 4 8.8.8.8
ping -c 4 google.com
```

IP ping은 되는데 도메인 ping이 안 되면 DNS 문제일 가능성이 큽니다.

## 10. 포트 확인

```bash
ss -tulpen
ss -tulpen | grep ':80'
ss -tulpen | grep ':22'
curl -i http://localhost
curl -i http://localhost/healthz
nc -vz SERVER_IP 80
nc -vz SERVER_IP 3306
```

`nc`가 없다면 설치합니다.

```bash
sudo apt-get install -y netcat-openbsd
```

## 11. 방화벽

```bash
sudo ufw status verbose
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
```

클라우드에서는 OS 방화벽뿐 아니라 ACG, Security Group, Network ACL도 함께 확인합니다.

## 12. 디스크

```bash
df -h
du -sh /var/log
du -h --max-depth=1 /var 2>/dev/null
lsblk
mount
findmnt
```

디스크가 꽉 차면 `/var/log`, 애플리케이션 업로드 디렉터리, Docker 이미지와 로그부터 확인합니다.

## 13. 로그

```bash
journalctl -n 100
journalctl -f
journalctl -b
sudo tail -n 100 /var/log/auth.log
```

Ubuntu 버전에 따라 `/var/log/syslog`가 없을 수 있습니다. 이 경우 `journalctl`을 사용합니다.

## 14. 압축과 전송

```bash
tar -czf logs.tar.gz /var/log
tar -xzf logs.tar.gz
scp -i key.pem local-file.txt ubuntu@SERVER_IP:/home/ubuntu/
scp -i key.pem ubuntu@SERVER_IP:/home/ubuntu/logs.tar.gz .
```

## 15. 환경변수

```bash
env
printenv PATH
export APP_ENV=dev
echo "$APP_ENV"
APP_ENV=dev node server.js
```

## 16. 장애 확인 조합

서비스 장애:

```bash
systemctl status nginx
journalctl -u nginx -n 100
ss -tulpen | grep ':80'
curl -i http://localhost
```

디스크 부족:

```bash
df -h
du -h --max-depth=1 /var 2>/dev/null | sort -h
```

네트워크 장애:

```bash
ip -br addr
ip route
ping -c 4 8.8.8.8
ping -c 4 google.com
curl -I https://www.naver.com
```

SSH 접속 문제:

```bash
chmod 400 key.pem
ssh -i key.pem -v ubuntu@SERVER_IP
sudo tail -n 100 /var/log/auth.log
```

## 체크리스트

- 서버 OS와 아키텍처를 확인할 수 있다.
- 현재 열린 포트를 확인할 수 있다.
- systemd 서비스 상태와 로그를 확인할 수 있다.
- 디스크 사용량과 큰 디렉터리를 찾을 수 있다.
- DNS 문제와 네트워크 문제를 구분할 수 있다.
- SSH 키 권한 문제를 해결할 수 있다.
- ACG와 OS 방화벽의 역할 차이를 설명할 수 있다.
