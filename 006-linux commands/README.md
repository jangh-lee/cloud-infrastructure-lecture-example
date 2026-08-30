# 006 Linux Commands

클라우드 엔지니어가 Ubuntu 서버에 접속했을 때 가장 자주 쓰는 기본 명령어를 정리한 실습입니다.

목표는 명령어를 많이 외우는 것이 아니라, 서버 상태를 순서대로 확인하고 문제 원인을 좁히는 습관을 익히는 것입니다.

## 1. 접속 직후 기본 확인

현재 사용자를 확인합니다.

```bash
whoami
id
```

현재 위치와 홈 디렉터리를 확인합니다.

```bash
pwd
echo "$HOME"
```

서버 이름과 OS 버전을 확인합니다.

```bash
hostname
hostnamectl
cat /etc/os-release
```

서버 시간이 맞는지 확인합니다.

```bash
date
timedatectl
```

클라우드 서버에서는 시간대가 UTC인지 KST인지 확인하는 습관이 중요합니다. 로그 분석에서 시간이 어긋나면 원인 추적이 어려워집니다.

## 2. CPU 아키텍처와 하드웨어 확인

CPU 아키텍처를 확인합니다.

```bash
uname -m
arch
```

주요 값:

| 값 | 의미 |
| --- | --- |
| `x86_64` | Intel/AMD 64비트 서버 |
| `aarch64` | ARM 64비트 서버 |

커널 정보를 확인합니다.

```bash
uname -a
```

CPU 정보를 확인합니다.

```bash
lscpu
```

메모리 정보를 확인합니다.

```bash
free -h
```

`free -h`는 서버 메모리 부족 여부를 가장 빠르게 확인하는 명령입니다.

예시:

```text
               total        used        free      shared  buff/cache   available
Mem:           3.8Gi       1.1Gi       450Mi        30Mi       2.2Gi       2.4Gi
Swap:          2.0Gi          0B       2.0Gi
```

읽는 방법:

| 항목 | 의미 | 운영에서 보는 법 |
| --- | --- | --- |
| `total` | 전체 메모리 | 서버 스펙과 맞는지 확인합니다. |
| `used` | 사용 중인 메모리 | 이 값만 보고 메모리 부족이라고 판단하지 않습니다. |
| `free` | 완전히 비어 있는 메모리 | Linux는 남는 메모리를 캐시로 쓰기 때문에 낮을 수 있습니다. |
| `shared` | tmpfs, shared memory 등 여러 프로세스가 공유하는 메모리 | `/dev/shm`, 컨테이너, DB shared buffer 사용과 함께 봅니다. |
| `buff/cache` | 디스크 I/O 성능을 위해 커널이 캐시로 쓰는 메모리 | 필요하면 애플리케이션에 반환될 수 있습니다. |
| `available` | 새 프로세스가 사용할 수 있는 예상 메모리 | 실제 판단은 주로 이 값을 봅니다. |
| `Swap` | 디스크를 메모리처럼 임시 사용하는 영역 | 계속 사용량이 늘면 메모리 부족 가능성이 큽니다. |

판단 기준:

- `available`이 충분하면 `used`가 높아도 정상일 수 있습니다.
- `shared`가 높으면 tmpfs나 shared memory를 많이 쓰는 프로세스가 있는지 확인합니다. 값이 높다고 바로 장애는 아닙니다.
- `available`이 매우 낮고 `Swap used`가 계속 증가하면 메모리 부족을 의심합니다.
- Swap은 RAM보다 훨씬 느립니다. Swap 사용량이 많아지면 서버가 갑자기 느려질 수 있습니다.
- DB 서버에서 Swap이 많이 쓰이면 쿼리 지연, 커넥션 타임아웃으로 이어질 수 있습니다.

메모리를 주기적으로 확인합니다.

```bash
watch -n 1 free -h
```

shared 메모리가 커 보이면 tmpfs 사용량도 같이 확인합니다.

```bash
df -h /dev/shm
mount | grep tmpfs
```

## 3. 파일과 디렉터리 이동

목록을 확인합니다.

```bash
ls
ls -l
ls -la
```

디렉터리를 이동합니다.

```bash
cd /var/log
cd ~
cd -
```

파일 내용을 확인합니다.

```bash
cat /etc/os-release
less /var/log/syslog
head -n 20 /var/log/syslog
tail -n 50 /var/log/syslog
tail -f /var/log/syslog
```

파일과 디렉터리를 생성합니다.

```bash
mkdir -p ~/lab/logs
touch ~/lab/test.txt
```

복사, 이동, 삭제를 연습합니다.

```bash
cp ~/lab/test.txt ~/lab/test-copy.txt
mv ~/lab/test-copy.txt ~/lab/logs/
rm ~/lab/test.txt
```

운영 서버에서 `rm -rf`는 신중하게 사용합니다. 삭제 전에는 항상 `pwd`, `ls`, 삭제 대상 경로를 확인합니다.

## 4. 파일 검색과 텍스트 검색

파일 이름으로 찾습니다.

```bash
find /etc -name "*.conf" 2>/dev/null
find . -type f -name "*.log"
```

파일 내용에서 문자열을 찾습니다.

```bash
grep -n "error" /var/log/syslog
grep -Rni "listen" /etc/nginx 2>/dev/null
```

최근 수정된 파일을 찾습니다.

```bash
find /var/log -type f -mtime -1 2>/dev/null
```

## 5. 권한과 소유자

권한을 확인합니다.

```bash
ls -l
```

소유자를 변경합니다.

```bash
sudo chown ubuntu:ubuntu file.txt
```

실행 권한을 추가합니다.

```bash
chmod +x script.sh
```

SSH 개인키 권한을 제한합니다.

```bash
chmod 400 key.pem
```

`sudo` 권한을 확인합니다.

```bash
sudo -l
```

## 6. 패키지 관리

패키지 목록을 갱신합니다.

```bash
sudo apt-get update
```

패키지를 설치합니다.

```bash
sudo apt-get install -y curl git vim htop net-tools
```

설치된 패키지를 확인합니다.

```bash
dpkg -l | grep nginx
apt-cache policy nginx
```

## 7. 프로세스 확인

실행 중인 프로세스를 봅니다.

```bash
ps aux
ps aux | grep nginx
```

`ps aux`에서 자주 보는 항목:

| 항목 | 의미 |
| --- | --- |
| `USER` | 프로세스를 실행한 사용자 |
| `PID` | 프로세스 ID |
| `%CPU` | CPU 사용률 |
| `%MEM` | 전체 메모리 대비 사용 비율 |
| `VSZ` | 프로세스가 접근 가능한 가상 메모리 크기 |
| `RSS` | 실제 RAM에 올라간 메모리 크기 |
| `STAT` | 프로세스 상태 |
| `COMMAND` | 실행 명령 |

메모리 사용량 기준으로 정렬합니다.

```bash
ps aux --sort=-%mem | head
```

CPU 사용량 기준으로 정렬합니다.

```bash
ps aux --sort=-%cpu | head
```

실시간 리소스 사용량을 봅니다.

```bash
top
htop
```

`top`에서 자주 보는 항목:

| 항목 | 의미 | 확인 포인트 |
| --- | --- | --- |
| `load average` | 실행 대기 중인 작업의 평균 | CPU 코어 수보다 지속적으로 높으면 병목 가능성이 있습니다. |
| `%Cpu(s) us` | 사용자 프로세스 CPU 사용률 | 애플리케이션이 CPU를 많이 쓰는지 봅니다. |
| `%Cpu(s) sy` | 커널 CPU 사용률 | 네트워크, 디스크, 시스템 호출 부하를 의심합니다. |
| `%Cpu(s) id` | idle, 놀고 있는 CPU | 낮을수록 CPU 여유가 적습니다. |
| `%Cpu(s) wa` | I/O wait | 높으면 디스크나 네트워크 스토리지 지연 가능성이 있습니다. |
| `MiB Mem` | 메모리 상태 | `free`보다 `avail Mem`을 봅니다. |
| `MiB Swap` | Swap 상태 | 사용량이 계속 늘면 메모리 부족 가능성이 큽니다. |

`top`에서 유용한 키:

| 키 | 동작 |
| --- | --- |
| `P` | CPU 사용률 기준 정렬 |
| `M` | 메모리 사용률 기준 정렬 |
| `1` | CPU 코어별 사용률 표시 |
| `k` | 프로세스 종료 |
| `q` | 종료 |

`htop`은 `top`보다 초보자가 보기 쉽습니다.

설치:

```bash
sudo apt-get install -y htop
```

실행:

```bash
htop
```

`htop`에서 보는 것:

| 화면 요소 | 의미 |
| --- | --- |
| `CPU` 막대 | 코어별 CPU 사용률 |
| `Mem` 막대 | RAM 사용량 |
| `Swp` 막대 | Swap 사용량 |
| `Load average` | 1분, 5분, 15분 평균 부하 |
| `Tasks` | 전체 프로세스와 실행 중인 프로세스 수 |
| `%CPU` | 프로세스별 CPU 사용률 |
| `%MEM` | 프로세스별 메모리 사용률 |
| `RES` | 실제 RAM 사용량 |
| `Command` | 실행된 명령 |

`htop`에서 유용한 키:

| 키 | 동작 |
| --- | --- |
| `F3` | 프로세스 검색 |
| `F4` | 필터 |
| `F5` | 트리 보기 |
| `F6` | 정렬 기준 선택 |
| `F9` | 프로세스 종료 |
| `F10` | 종료 |

주니어가 자주 하는 실수:

- `used` 메모리만 보고 서버가 위험하다고 판단합니다. 먼저 `available`을 봅니다.
- Swap이 조금이라도 쓰이면 무조건 장애라고 판단합니다. 일시적 사용은 가능하지만 계속 증가하면 위험합니다.
- Load average를 절대값으로만 봅니다. CPU 코어 수와 비교해야 합니다.
- `%CPU`가 순간적으로 높다는 이유만으로 프로세스를 죽입니다. 먼저 몇 분간 지속되는지 봅니다.
- `kill -9`를 먼저 씁니다. 가능하면 서비스 재시작이나 일반 `kill`부터 시도합니다.

특정 프로세스를 종료합니다.

```bash
sudo kill PID
sudo kill -9 PID
```

`kill -9`는 강제 종료입니다. 일반 종료가 안 될 때 마지막 수단으로 사용합니다.

## 8. systemd 서비스 관리

서비스 상태를 확인합니다.

```bash
systemctl status nginx
```

서비스를 시작, 중지, 재시작합니다.

```bash
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
```

부팅 시 자동 시작을 설정합니다.

```bash
sudo systemctl enable nginx
sudo systemctl disable nginx
```

서비스 로그를 확인합니다.

```bash
journalctl -u nginx
journalctl -u nginx -n 100
journalctl -u nginx -f
```

## 9. 네트워크 기본 확인

IP 주소를 확인합니다.

```bash
ip addr
ip -br addr
```

라우팅 테이블을 확인합니다.

```bash
ip route
```

DNS 설정을 확인합니다.

```bash
resolvectl status
cat /etc/resolv.conf
```

외부 통신을 확인합니다.

```bash
ping -c 4 8.8.8.8
ping -c 4 google.com
```

DNS 문제인지 네트워크 문제인지 구분하려면 IP와 도메인을 둘 다 테스트합니다.

## 10. 포트와 소켓 확인

열려 있는 포트를 확인합니다.

```bash
ss -tulpen
```

특정 포트만 확인합니다.

```bash
ss -tulpen | grep ':80'
ss -tulpen | grep ':22'
```

서버 내부에서 HTTP 응답을 확인합니다.

```bash
curl -i http://localhost
curl -i http://localhost/healthz
```

원격 서버 포트 연결을 확인합니다.

```bash
nc -vz SERVER_IP 80
nc -vz SERVER_IP 3306
```

`nc`가 없다면 설치합니다.

```bash
sudo apt-get install -y netcat-openbsd
```

## 11. 방화벽 확인

Ubuntu UFW 상태를 확인합니다.

```bash
sudo ufw status verbose
```

포트를 허용합니다.

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
```

클라우드에서는 OS 방화벽뿐 아니라 ACG, Security Group, Network ACL도 함께 확인해야 합니다.

## 12. 디스크와 파일시스템

디스크 사용량을 확인합니다.

```bash
df -h
```

디렉터리별 사용량을 확인합니다.

```bash
du -sh /var/log
du -h --max-depth=1 /var 2>/dev/null
```

블록 디바이스를 확인합니다.

```bash
lsblk
```

마운트 정보를 확인합니다.

```bash
mount
findmnt
```

디스크가 꽉 차면 가장 먼저 `/var/log`, 애플리케이션 업로드 디렉터리, Docker 이미지와 로그를 확인합니다.

## 13. 로그 확인

시스템 로그를 확인합니다.

```bash
journalctl -n 100
journalctl -f
```

부팅 로그를 확인합니다.

```bash
journalctl -b
```

인증 로그를 확인합니다.

```bash
sudo tail -n 100 /var/log/auth.log
```

Ubuntu 버전에 따라 `/var/log/syslog`가 없을 수 있습니다. 이 경우 `journalctl`을 사용합니다.

## 14. 압축과 전송

디렉터리를 압축합니다.

```bash
tar -czf logs.tar.gz /var/log
```

압축을 풉니다.

```bash
tar -xzf logs.tar.gz
```

서버로 파일을 전송합니다.

```bash
scp -i key.pem local-file.txt ubuntu@SERVER_IP:/home/ubuntu/
```

서버에서 파일을 가져옵니다.

```bash
scp -i key.pem ubuntu@SERVER_IP:/home/ubuntu/logs.tar.gz .
```

## 15. 환경변수

현재 환경변수를 확인합니다.

```bash
env
printenv PATH
```

현재 세션에 환경변수를 설정합니다.

```bash
export APP_ENV=dev
echo "$APP_ENV"
```

명령 한 번에만 환경변수를 적용합니다.

```bash
APP_ENV=dev node server.js
```

## 16. 자주 쓰는 조합

서비스가 죽었는지 확인합니다.

```bash
systemctl status nginx
journalctl -u nginx -n 100
ss -tulpen | grep ':80'
curl -i http://localhost
```

디스크 부족을 확인합니다.

```bash
df -h
du -h --max-depth=1 /var 2>/dev/null | sort -h
```

네트워크 장애를 확인합니다.

```bash
ip -br addr
ip route
ping -c 4 8.8.8.8
ping -c 4 google.com
curl -I https://www.naver.com
```

SSH 접속 문제를 확인합니다.

```bash
chmod 400 key.pem
ssh -i key.pem -v ubuntu@SERVER_IP
sudo tail -n 100 /var/log/auth.log
```

## 17. 실습 체크리스트

- 서버 OS와 아키텍처를 확인할 수 있다.
- 현재 열린 포트를 확인할 수 있다.
- systemd 서비스 상태와 로그를 확인할 수 있다.
- 디스크 사용량과 큰 디렉터리를 찾을 수 있다.
- DNS 문제와 네트워크 문제를 구분할 수 있다.
- SSH 키 권한 문제를 해결할 수 있다.
- ACG와 OS 방화벽의 역할 차이를 설명할 수 있다.
