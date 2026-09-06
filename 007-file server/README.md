# 007 FTP/FTPS 파일 서버

Naver Cloud의 Ubuntu 서버 한 대를 파일 서버로 구성하고 Windows와 macOS의 FileZilla Client에서 파일을 업로드·다운로드합니다.

이번 실습은 FTP 구조를 학습하기 위해 `vsftpd`를 사용하되, 계정과 파일이 평문으로 노출되지 않도록 **Explicit FTPS**와 **Passive Mode**를 적용합니다.

## 1. 학습 목표

- FTP의 제어 채널과 데이터 채널을 구분합니다.
- Active Mode와 Passive Mode가 방화벽에서 어떻게 다른지 이해합니다.
- FTP, FTPS, SFTP의 차이를 설명할 수 있습니다.
- Naver Cloud ACG에 필요한 포트를 최소 범위로 허용합니다.
- Windows와 macOS FileZilla에서 파일을 업로드·다운로드합니다.
- 서버의 파일, 권한, 접속 로그를 직접 확인합니다.

## 2. FTP 기본 이론

### FTP, FTPS, SFTP 차이

| 구분 | 기본 포트 | 암호화 | 특징 |
| --- | ---: | --- | --- |
| FTP | `21/TCP` | 없음 | 계정과 파일이 평문으로 전달되므로 인터넷 공개 환경에는 권장하지 않습니다. |
| Explicit FTPS | `21/TCP` + 데이터 포트 | TLS | FTP 연결 후 `AUTH TLS`로 암호화를 시작합니다. 이번 실습에서 사용합니다. |
| Implicit FTPS | `990/TCP` + 데이터 포트 | TLS | 접속 시작부터 TLS를 사용하지만 신규 구성에서는 Explicit FTPS가 더 일반적입니다. |
| SFTP | `22/TCP` | SSH | 이름은 비슷하지만 FTP가 아닌 SSH 파일 전송 프로토콜이며 하나의 연결만 사용합니다. |

FileZilla는 위 프로토콜을 모두 지원하는 **클라이언트**입니다. Naver Cloud Ubuntu 서버에는 FileZilla Server가 아니라 `vsftpd`를 설치합니다.

### 제어 채널과 데이터 채널

FTP는 명령과 인증을 전달하는 **제어 채널**과 실제 파일 목록·파일 내용을 전달하는 **데이터 채널**을 분리합니다.

```text
FileZilla Client
  ├─ TCP 21 ───────────────> FTP 제어 채널
  └─ TCP 30000~30010 ──────> Passive 데이터 채널
                                Naver Cloud Ubuntu + vsftpd
```

로그인에는 성공했는데 폴더 목록 조회나 파일 전송에서 멈춘다면 데이터 채널의 ACG 또는 Passive 설정을 먼저 확인합니다.

### Active Mode와 Passive Mode

| 방식 | 데이터 연결 시작 주체 | 클라우드 환경에서의 특징 |
| --- | --- | --- |
| Active | 서버가 클라이언트로 연결 | 클라이언트 NAT와 방화벽 때문에 연결이 차단되기 쉽습니다. |
| Passive | 클라이언트가 서버로 연결 | 서버의 Passive 포트 범위를 ACG에 허용하면 되므로 클라우드 실습에 적합합니다. |

이번 실습은 `30000~30010/TCP`를 Passive 데이터 포트로 고정합니다. 포트를 넓게 열지 않고 수업에 필요한 동시 전송 수만큼만 허용합니다.

## 3. 실습 구성

```text
Windows FileZilla ─┐
                   ├─ Internet ─> Public IP ─> ACG ─> Ubuntu FTPS Server
macOS FileZilla ───┘                    TCP 21, 30000~30010
```

| 항목 | 실습 값 |
| --- | --- |
| 서버 이미지 | Ubuntu Server 24.04 |
| 서버 이름 | `lab-file-server` |
| 서버 위치 | Internet Gateway가 연결된 Public Subnet |
| 공인 IP | 서버에 할당한 Public IP |
| FTP 서버 | `vsftpd` |
| 전송 방식 | Explicit FTPS, Passive Mode |
| 실습 계정 | `ftpstudent` |
| 업로드 경로 | `/home/ftpstudent/upload` |

## 4. Step 1: 서버와 ACG 준비

Naver Cloud 콘솔에서 Ubuntu 서버를 생성하고 Public IP를 할당합니다. Public IP는 Internet Gateway 전용 Public Subnet의 서버에 할당할 수 있습니다.

서버에 적용한 ACG의 Inbound 규칙을 다음과 같이 설정합니다.

| 프로토콜 | 접근 소스 | 허용 포트 | 용도 |
| --- | --- | --- | --- |
| TCP | 강사 또는 관리자 공인 IP `/32` | `22` | 서버 설정용 SSH |
| TCP | 수강생 공인 IP 또는 교육장 공인 IP 대역 | `21` | FTP 제어 채널과 Explicit TLS 시작 |
| TCP | 수강생 공인 IP 또는 교육장 공인 IP 대역 | `30000-30010` | Passive 데이터 채널 |

`0.0.0.0/0` 전체 허용은 피하고 FileZilla를 사용하는 장소의 공인 IP만 입력합니다. Windows PowerShell에서는 다음 명령으로 현재 공인 IP를 확인할 수 있습니다.

```powershell
(Invoke-RestMethod -Uri "https://api.ipify.org")
```

macOS Terminal에서는 다음 명령을 사용합니다.

```bash
curl -s https://api.ipify.org; echo
```

**확인 기준:** 서버가 `운영중`이고 Public IP가 할당되어 있으며 ACG에 `22`, `21`, `30000-30010` 규칙이 있어야 다음 단계로 넘어갑니다.

## 5. Step 2: vsftpd와 실습 계정 설치

SSH로 Ubuntu 서버에 접속한 뒤 패키지와 실습 계정을 준비합니다. 예시 암호는 수업용이므로 실제 운영 환경에서는 변경합니다.

```bash
sudo apt-get update
sudo apt-get install -y vsftpd openssl

sudo useradd --create-home --shell /usr/sbin/nologin ftpstudent
echo 'ftpstudent:FileLab123!' | sudo chpasswd

grep -qxF '/usr/sbin/nologin' /etc/shells || \
  echo '/usr/sbin/nologin' | sudo tee -a /etc/shells

sudo mkdir -p /home/ftpstudent/upload
sudo chown root:root /home/ftpstudent
sudo chmod 755 /home/ftpstudent
sudo chown ftpstudent:ftpstudent /home/ftpstudent/upload
sudo chmod 750 /home/ftpstudent/upload
```

`ftpstudent`는 SSH 셸에 로그인할 수 없고 `/upload` 폴더에만 파일을 기록합니다. 홈 디렉터리는 `root` 소유로 유지해 사용자가 FTPS 루트 설정을 변경하지 못하게 합니다.

권한을 확인합니다.

```bash
getent passwd ftpstudent
sudo ls -ld /home/ftpstudent /home/ftpstudent/upload
```

**확인 기준:** 계정 셸이 `/usr/sbin/nologin`, 홈 디렉터리 소유자가 `root`, `upload` 소유자가 `ftpstudent`로 출력되어야 합니다.

## 6. Step 3: TLS 인증서와 Passive Mode 설정

아래 첫 줄에 서버의 실제 Public IP를 입력합니다. `pasv_address`가 잘못되면 로그인 후 디렉터리 목록 조회에서 연결이 멈춥니다.

> **주의:** `FTP_PUBLIC_IP`에는 Naver Cloud 콘솔의 **Server > Public IP**에서 해당 서버에 할당된 주소를 입력합니다. 서버에서 `curl ifconfig.me`로 확인한 외부 통신 IP는 NAT 구성에 따라 할당 Public IP와 다를 수 있으므로 `pasv_address`로 사용하지 않습니다.

```bash
FTP_PUBLIC_IP="YOUR_SERVER_PUBLIC_IP"

sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/vsftpd.key \
  -out /etc/ssl/certs/vsftpd.crt \
  -subj "/C=KR/O=CloudLab/CN=$FTP_PUBLIC_IP"

sudo chmod 600 /etc/ssl/private/vsftpd.key
sudo cp /etc/vsftpd.conf /etc/vsftpd.conf.backup

sudo tee /etc/vsftpd.conf > /dev/null <<EOF
listen=YES
listen_ipv6=NO
anonymous_enable=NO
local_enable=YES
write_enable=YES
local_umask=022
dirmessage_enable=YES
use_localtime=YES
xferlog_enable=YES
xferlog_std_format=NO
log_ftp_protocol=YES
connect_from_port_20=YES
chroot_local_user=YES
allow_writeable_chroot=NO
user_sub_token=\$USER
local_root=/home/\$USER
secure_chroot_dir=/var/run/vsftpd/empty
pam_service_name=vsftpd
pasv_enable=YES
pasv_min_port=30000
pasv_max_port=30010
pasv_address=$FTP_PUBLIC_IP
ssl_enable=YES
allow_anon_ssl=NO
force_local_logins_ssl=YES
force_local_data_ssl=YES
ssl_tlsv1=YES
ssl_sslv2=NO
ssl_sslv3=NO
require_ssl_reuse=NO
rsa_cert_file=/etc/ssl/certs/vsftpd.crt
rsa_private_key_file=/etc/ssl/private/vsftpd.key
EOF

sudo systemctl enable --now vsftpd
sudo systemctl restart vsftpd
```

서버 상태, 제어 포트, 인증서 지문을 확인합니다.

```bash
sudo systemctl is-active vsftpd
sudo ss -lntp | grep ':21'
sudo grep -E '^pasv_(address|min_port|max_port)=' /etc/vsftpd.conf
sudo openssl x509 -in /etc/ssl/certs/vsftpd.crt \
  -noout -subject -fingerprint -sha256
```

UFW가 활성 상태일 때만 OS 방화벽에도 같은 포트를 허용합니다.

```bash
sudo ufw status
sudo ufw allow 21/tcp
sudo ufw allow 30000:30010/tcp
```

UFW가 `inactive`라면 두 `allow` 명령은 생략할 수 있습니다.

**확인 기준:** 서비스가 `active`이고 `0.0.0.0:21` 리슨과 인증서 SHA-256 지문이 출력되어야 합니다. `pasv_address`는 Naver Cloud 콘솔에 표시된 서버 Public IP와 정확히 같아야 합니다.

## 7. Step 4: 서버 테스트 파일 준비

FileZilla에서 내려받을 파일을 서버에 하나 만듭니다.

```bash
sudo -u ftpstudent tee /home/ftpstudent/upload/server-guide.txt > /dev/null <<'EOF'
Naver Cloud FTPS file server
This file was created on the server.
EOF

sudo ls -l /home/ftpstudent/upload
sudo cat /home/ftpstudent/upload/server-guide.txt
```

**확인 기준:** `server-guide.txt`의 소유자가 `ftpstudent`이고 두 줄의 내용이 출력되어야 합니다.

## 8. Step 5: Windows FileZilla 접속

### 8-1. 설치와 로컬 파일 생성

[FileZilla Client 공식 다운로드](https://filezilla-project.org/download.php?type=client)에서 Windows용 **FileZilla Client**를 설치합니다. FileZilla Server를 설치하지 않습니다.

PowerShell에서 업로드할 파일을 만듭니다.

```powershell
"Uploaded from Windows FileZilla" | Set-Content `
  "$HOME\Desktop\ftps-test-windows.txt" -Encoding utf8
```

### 8-2. 사이트 관리자 설정

FileZilla에서 **파일 > 사이트 관리자 > 새 사이트**를 선택하고 다음 값을 입력합니다.

| 항목 | 값 |
| --- | --- |
| 프로토콜 | `FTP - 파일 전송 프로토콜` |
| 호스트 | Naver Cloud 서버 Public IP |
| 포트 | `21` |
| 암호화 | `TLS를 통한 명시적 FTP 필요` |
| 로그온 유형 | `일반` |
| 사용자 | `ftpstudent` |
| 비밀번호 | `FileLab123!` |

**연결**을 누르면 자체 서명 인증서 경고가 나타납니다. 서버에서 확인한 SHA-256 지문과 비교한 뒤 이번 실습 서버가 맞을 때만 신뢰합니다.

### 8-3. 업로드와 다운로드

1. 왼쪽 로컬 사이트에서 `C:\Users\사용자명\Desktop`을 엽니다.
2. 오른쪽 리모트 사이트에서 `/upload`를 엽니다.
3. `ftps-test-windows.txt`를 왼쪽에서 오른쪽으로 끌어 업로드합니다.
4. 서버의 `server-guide.txt`를 오른쪽에서 왼쪽으로 끌어 다운로드합니다.
5. 하단 전송 큐의 **성공한 전송** 탭에 두 작업이 표시되는지 확인합니다.

**확인 기준:** 오른쪽 `/upload`에 Windows 파일이 보이고 Desktop에 `server-guide.txt`가 내려받아져야 합니다.

## 9. Step 6: macOS FileZilla 접속

### 9-1. 설치와 로컬 파일 생성

[FileZilla Client 공식 다운로드](https://filezilla-project.org/download.php?type=client)에서 macOS용 **FileZilla Client**를 설치합니다.

Terminal에서 업로드할 파일을 만듭니다.

```bash
printf 'Uploaded from macOS FileZilla\n' > ~/Desktop/ftps-test-macos.txt
```

### 9-2. 사이트 관리자 설정

FileZilla에서 **File > Site Manager > New site**를 선택합니다.

| 항목 | 값 |
| --- | --- |
| Protocol | `FTP - File Transfer Protocol` |
| Host | Naver Cloud 서버 Public IP |
| Port | `21` |
| Encryption | `Require explicit FTP over TLS` |
| Logon Type | `Normal` |
| User | `ftpstudent` |
| Password | `FileLab123!` |

인증서 경고에서 서버의 SHA-256 지문을 확인하고 연결합니다.

### 9-3. 업로드와 다운로드

1. 왼쪽 Local site에서 `/Users/사용자명/Desktop`을 엽니다.
2. 오른쪽 Remote site에서 `/upload`를 엽니다.
3. `ftps-test-macos.txt`를 업로드합니다.
4. `server-guide.txt`를 Desktop으로 다운로드합니다.
5. 하단 Successful transfers에서 완료 상태를 확인합니다.

**확인 기준:** 오른쪽 `/upload`에 macOS 파일이 보이고 Desktop에 `server-guide.txt`가 내려받아져야 합니다.

## 10. Step 7: 서버에서 전송 결과와 로그 확인

Windows와 macOS 파일이 실제 서버 디스크에 저장됐는지 확인합니다.

```bash
sudo find /home/ftpstudent/upload -maxdepth 1 -type f \
  -printf '%f | %u:%g | %s bytes | %TY-%Tm-%Td %TH:%TM:%TS\n'

sudo du -sh /home/ftpstudent/upload
sudo tail -n 50 /var/log/vsftpd.log
sudo journalctl -u vsftpd -n 50 --no-pager
```

FileZilla에서 `/`에 새 파일을 만들면 권한 오류가 나고 `/upload`에서는 성공해야 합니다. 이는 FTP 계정이 필요한 폴더에만 쓰도록 제한됐다는 뜻입니다.

### 최종 통과 기준

- Windows에서 업로드한 파일이 서버에 있습니다.
- macOS에서 업로드한 파일이 서버에 있습니다.
- 두 클라이언트 모두 `server-guide.txt`를 다운로드했습니다.
- FileZilla 로그에 TLS 연결과 Passive 데이터 전송이 표시됩니다.
- `/` 쓰기는 실패하고 `/upload` 쓰기는 성공합니다.
- `/var/log/vsftpd.log`에서 로그인과 전송 기록을 확인할 수 있습니다.

## 11. 장애 확인

| 증상 | 확인할 항목 |
| --- | --- |
| `Connection timed out` | Public IP, ACG `21/TCP`, 접속 장소의 공인 IP |
| `ECONNREFUSED` | `systemctl status vsftpd`, `ss -lntp | grep ':21'` |
| 로그인 후 폴더 목록에서 멈춤 | ACG `30000-30010`, 서버 Public IP와 `pasv_address` 일치 여부, FileZilla Passive Mode |
| `530 Login incorrect` | 사용자명, 암호, `/etc/shells`의 `/usr/sbin/nologin` 등록 |
| TLS 인증서 경고 | Public IP와 인증서 CN, SHA-256 지문 확인 |
| `/upload` 업로드 실패 | 폴더 소유자와 권한, `chown ftpstudent:ftpstudent` 확인 |
| 일반 FTP로 연결됨 | FileZilla 암호화를 `Require explicit FTP over TLS`로 변경 |

FileZilla 로그의 `227 Entering Passive Mode`에 서버 Public IP가 아닌 다른 IP가 표시되면 다음 명령으로 바로 수정합니다.

```bash
FTP_PUBLIC_IP="YOUR_SERVER_PUBLIC_IP"

sudo sed -i '/^pasv_address=/d' /etc/vsftpd.conf
echo "pasv_address=$FTP_PUBLIC_IP" | sudo tee -a /etc/vsftpd.conf
sudo systemctl restart vsftpd

sudo grep -E '^pasv_(address|min_port|max_port)=' /etc/vsftpd.conf
sudo systemctl is-active vsftpd
```

재접속 후 PASV 응답의 IP가 서버 Public IP와 같고 디렉터리 목록이 표시되면 정상입니다. `21/TCP`는 로그인과 명령용이고, 목록·업로드·다운로드에는 ACG의 `30000-30010/TCP` 허용도 반드시 필요합니다.

상세 로그를 실시간으로 확인합니다.

```bash
sudo journalctl -u vsftpd -f
```

## 12. 실습 정리

실습 서버를 계속 사용하지 않는다면 Public IP와 서버를 반납합니다. 서버 안의 구성만 제거하려면 다음 명령을 사용합니다.

```bash
sudo systemctl disable --now vsftpd
sudo apt-get remove --purge -y vsftpd
sudo userdel -r ftpstudent
sudo rm -f /etc/ssl/private/vsftpd.key /etc/ssl/certs/vsftpd.crt
```

Naver Cloud 콘솔에서 사용하지 않는 Public IP도 별도로 반납해야 과금이 중지됩니다.

## 참고

- [FileZilla Client 공식 사용법](https://wiki.filezilla-project.org/FileZilla_Client_Tutorial_(en))
- [Naver Cloud VPC ACG](https://guide.ncloud-docs.com/docs/server-acg-vpc)
- [Naver Cloud Public IP](https://guide.ncloud-docs.com/docs/vpc-publicip-vpc)
