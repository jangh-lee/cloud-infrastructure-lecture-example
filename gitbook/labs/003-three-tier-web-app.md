# 003 Three Tier Web App

## 1. 목표

Web, Backend, DB 서버를 분리해 3계층 게시판을 구성하고 서버 간 사설 통신과 ACG를 확인합니다. 014에서는 Public ALB 뒤에서 Web 서버를 Auto Scaling하고 Backend와 DB는 고정 서버로 유지합니다.

게시판 서비스의 기본 Database는 `board_service`, Backend 전용 DB 계정은 `board_app`입니다. `003`은 강의 순서일 뿐 서비스 역할이 아니므로 DB와 계정 이름에 챕터 번호를 넣지 않습니다. 015 Cloud DB 생성과 017 마이그레이션에서도 같은 값을 사용합니다.

## 2. 실제 요청 구조

```text
사용자 브라우저
   |
   | http://WEB_PUBLIC_IP/
   | http://WEB_PUBLIC_IP/api/...
   v
Web 서버 Nginx
   |
   | BACKEND_UPSTREAM
   v
Backend Private IP :4000
   |
   | DB_HOST
   v
DB Private IP :3306
```

프런트 JavaScript는 Backend IP를 직접 호출하지 않고 `/api/posts`, `/api/health` 같은 상대경로만 호출합니다. 브라우저 요청을 받은 Web Nginx가 `.env`의 `BACKEND_UPSTREAM`으로 API 요청을 전달합니다.

!!! info "주소별 역할"
    - `SITE_BASE_URL`: 사용자가 브라우저로 접속하는 Web 주소
    - `BACKEND_UPSTREAM`: Web Nginx가 연결할 Backend 내부 주소
    - `DB_HOST`: Backend가 연결할 DB 내부 주소

## 3. 설치 전 기록할 값

| 값 | 예시 |
| --- | --- |
| Web Public IP | `203.0.113.10` |
| Web Private IP | `10.0.0.10` |
| Backend Private IP | `10.0.1.25` |
| Backend Subnet | `10.0.1.0/24` |
| DB Private IP | `10.0.2.30` |

설치 순서는 **DB → Backend → Web**입니다.

## 4. Step 1 - DB 서버 설치

DB 서버에서 아래 블록을 실행합니다. 첫 실행은 `.env` 템플릿을 만들고 종료합니다.

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git || true
cd ~/cloud-infrastructure-lecture-example
git pull --ff-only origin main
cd "003-three tier web app/db"
chmod +x install-db.sh
sudo ./install-db.sh
```

생성된 `.env`를 편집합니다.

```env
DB_ROOT_PASSWORD=ChangeRootPass123!
DB_PREVIOUS_ROOT_PASSWORD=
DB_NAME=board_service
DB_USER=board_app
DB_PASSWORD=BoardApp123!
DB_ALLOWED_HOST=10.0.1.25
DB_BIND_ADDRESS=0.0.0.0
```

| 변수 | 의미 | 입력 기준 |
| --- | --- | --- |
| `DB_ROOT_PASSWORD` | MariaDB `root` 관리자 비밀번호 | 최초 설치에 사용할 새 비밀번호를 입력합니다. |
| `DB_PREVIOUS_ROOT_PASSWORD` | 변경 전 `root` 비밀번호 | 최초 설치는 비워 둡니다. 기존 비밀번호를 변경할 때만 임시로 입력하고 변경 후 다시 비웁니다. |
| `DB_NAME` | 게시판이 사용할 데이터베이스 이름 | Backend의 `DB_NAME`과 동일해야 합니다. |
| `DB_USER` | 게시판 전용 DB 계정 | Backend의 `DB_USER`와 동일해야 합니다. |
| `DB_PASSWORD` | 게시판 전용 DB 계정 비밀번호 | Backend의 `DB_PASSWORD`와 동일해야 합니다. |
| `DB_ALLOWED_HOST` | 게시판 DB 계정의 접속 허용 호스트 | 고정 Backend 서버의 Private IP를 입력합니다. |
| `DB_BIND_ADDRESS` | MariaDB가 연결을 수신할 주소 | Private Network의 Backend 연결을 받도록 `0.0.0.0`을 사용하고, 실제 접근 범위는 ACG로 제한합니다. |

`DB_ALLOWED_HOST`에는 고정 Backend Private IP를 입력합니다. 014의 Auto Scaling 대상은 Web 서버이므로 Backend와 DB 연결은 그대로 유지됩니다. DB ACG에서는 `3306/tcp` 접근 소스를 Backend ACG로 제한합니다.

설치를 다시 실행합니다.

```bash
sudo ./install-db.sh
sudo systemctl is-active mariadb
sudo mariadb -u root -p -e "SHOW DATABASES;"
```

`active`와 `board_service`를 확인합니다.

## 5. Step 2 - Backend 서버 설치

Backend 서버에서 실행합니다.

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git || true
cd ~/cloud-infrastructure-lecture-example
git pull --ff-only origin main
cd "003-three tier web app/backend"
chmod +x install-backend.sh
sudo ./install-backend.sh install
```

생성된 `.env`를 편집합니다.

```env
PORT=4000
DB_HOST=DB_SERVER_PRIVATE_IP
DB_PORT=3306
DB_NAME=board_service
DB_USER=board_app
DB_PASSWORD=BoardApp123!
AUTO_POST_ENABLED=true
AUTO_POST_INTERVAL_SECONDS=60
AUTO_POST_TOTAL=300
AUTO_POST_API_URL=http://127.0.0.1:4000/api/posts
LAB_STRESS_ENABLED=false
```

!!! note "실습 메모: Backend 설정 파일 위치"
    설치 작업과 설정 변경은 Git 저장소의 `~/cloud-infrastructure-lecture-example/003-three tier web app/backend`에서 진행합니다. 사용자가 수정할 원본 설정 파일은 이 경로의 `.env`입니다.

    설치 스크립트는 애플리케이션과 `.env`를 `/opt/board-service-backend`로 복사하고, systemd는 이 배포 경로에서 서비스를 실행합니다. `/opt/board-service-backend/.env`를 직접 수정하면 다음 설치 또는 `configure` 실행 때 원본 설정으로 덮어써지므로 직접 편집하지 않습니다.

    ```bash
    cd ~/cloud-infrastructure-lecture-example/"003-three tier web app"/backend
    vi .env
    sudo ./install-backend.sh configure
    ```

| 변수 | 의미 | 입력 기준 |
| --- | --- | --- |
| `PORT` | Backend 애플리케이션 수신 포트 | 기본값은 `4000`이며 ACG와 Web의 `BACKEND_UPSTREAM` 포트도 같아야 합니다. |
| `DB_HOST` | Backend가 접속할 DB 주소 | DB 서버 Private IP 또는 내부 도메인을 입력하며 `http://`는 붙이지 않습니다. |
| `DB_PORT` | DB 접속 포트 | MariaDB/MySQL 기본 포트인 `3306`을 사용합니다. |
| `DB_NAME` | 접속할 데이터베이스 이름 | DB 서버의 `DB_NAME`과 동일해야 합니다. |
| `DB_USER` | DB 접속 계정 | DB 서버의 `DB_USER`와 동일해야 합니다. |
| `DB_PASSWORD` | DB 접속 계정 비밀번호 | DB 서버의 `DB_PASSWORD`와 동일해야 합니다. |
| `AUTO_POST_ENABLED` | 실습용 게시글 자동 등록 기능 사용 여부 | 기본값은 `true`이며 자동 등록을 중지할 때만 `false`로 설정합니다. |
| `AUTO_POST_INTERVAL_SECONDS` | 자동 게시글 등록 간격 | `AUTO_POST_ENABLED=true`일 때 적용되는 초 단위 값입니다. |
| `AUTO_POST_TOTAL` | 자동 등록할 게시글의 최대 개수 | 필요한 실습 데이터 수를 정수로 입력합니다. |
| `AUTO_POST_API_URL` | 자동 등록 기능이 호출할 게시글 API | 같은 Backend를 호출하므로 기본값 `http://127.0.0.1:4000/api/posts`를 사용합니다. |
| `LAB_STRESS_ENABLED` | Backend 부하 발생용 실습 API 사용 여부 | 003과 Web Auto Scaling을 다루는 014에서는 `false`를 유지합니다. |

설치와 점검을 실행합니다.

```bash
sudo ./install-backend.sh install
systemctl is-enabled board-service-backend
systemctl is-active board-service-backend
curl -i http://127.0.0.1:4000/api/health
curl -i http://127.0.0.1:4000/api/instance
```

`enabled`, `active`, HTTP `200`을 확인합니다. `/api/instance`에는 현재 Backend hostname이 표시됩니다.

!!! warning "참고: 이전 Nginx 실습 환경 삭제"
    이전 실습에서 설치한 Nginx와 설정이 남아 충돌할 때만 아래 명령을 실행합니다. 신규 Web 서버이거나 기존 Nginx 설정을 유지해야 한다면 건너뜁니다. `/etc/nginx`와 기존 로그까지 모두 삭제됩니다.

    ```bash
    sudo systemctl stop nginx
    sudo apt-get remove --purge nginx nginx-full nginx-common
    sudo apt-get autoremove
    sudo apt-get clean
    sudo rm -rf /etc/nginx
    sudo rm -rf /var/log/nginx
    ```

## 6. Step 3 - Web 서버 설치

Web 서버에서 실행합니다.

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git || true
cd ~/cloud-infrastructure-lecture-example
git pull --ff-only origin main
cd "003-three tier web app/web"
chmod +x install-web.sh
sudo ./install-web.sh install
```

생성된 `.env`를 편집합니다.

```env
SITE_BASE_URL=http://WEB_SERVER_PUBLIC_IP
BACKEND_UPSTREAM=http://BACKEND_SERVER_PRIVATE_IP:4000
SITE_TITLE=DevForum Practice Board
```

| 변수 | 의미 | 입력 기준 |
| --- | --- | --- |
| `SITE_BASE_URL` | 사용자가 브라우저로 접속할 대표 Web 주소 | 003에서는 Web Public IP, 014에서는 Public ALB 주소를 `http://` 또는 `https://`와 함께 입력합니다. |
| `BACKEND_UPSTREAM` | Nginx가 `/api` 요청을 전달할 Backend 주소 | 고정 Backend의 Private IP와 포트까지 입력합니다. 예: `http://10.0.1.25:4000` |
| `SITE_TITLE` | 게시판 화면에 표시할 서비스 제목 | 실습에서 구분하기 쉬운 원하는 제목을 입력합니다. |

`BACKEND_UPSTREAM`은 브라우저에 전달되지 않습니다. Web Nginx 설정 안에서만 사용하는 Backend 목적지입니다.

설치와 점검을 실행합니다.

```bash
sudo ./install-web.sh install
sudo ./install-web.sh status
curl -i http://127.0.0.1/
curl -i http://127.0.0.1/healthz
curl -i http://127.0.0.1/web-instance
curl -i http://127.0.0.1/api/health
curl -i http://127.0.0.1/api/instance
```

확인할 결과:

- `/`는 게시판 HTML을 반환합니다.
- `/healthz`는 HTTP `200`과 `ok`를 반환하며 014 ALB Health Check에 사용합니다.
- `/web-instance`는 현재 Web hostname과 Private IP를, `X-Web-Instance`는 hostname을 보여줍니다.
- `/api/health`는 Nginx를 거쳐 Backend의 HTTP `200`을 반환합니다.
- `/api/instance`의 `X-Backend-Instance`와 JSON `instance`에 Backend hostname이 표시됩니다.

게시판 하단의 작은 `Web hostname · Private IP` 배지는 `/web-instance`를 5초마다 조회합니다. 014에서 Web 서버가 여러 대로 늘어나면 ALB가 선택한 서버에 따라 표시가 바뀌므로 Scale-out과 분산 상태를 브라우저에서도 확인할 수 있습니다.

## 7. 서버별 트래픽과 로그 확인

각 명령은 해당 서버의 **새 SSH 터미널**에서 실행합니다. 로그 확인을 마치려면 `Ctrl+C`를 누릅니다.

### Web 서버

Nginx가 받은 요청은 `access.log`, 프록시 연결 실패와 설정 오류는 `error.log`에서 확인합니다. 브라우저에서 조회·글쓰기·삭제를 실행하면 `/api/...` 요청과 상태 코드가 표시됩니다.

```bash
sudo tail -F /var/log/nginx/access.log /var/log/nginx/error.log
```

### Backend 서버

Backend 요청, 상태 코드, 처리 시간과 애플리케이션·DB 오류를 확인합니다. 자동 게시글 기능을 사용하면 seeder 로그도 함께 표시합니다.

```bash
sudo journalctl -u board-service-backend -u board-service-post-seeder -f
```

정상 글쓰기는 `POST /api/posts 201`, 오류는 `500`과 이어지는 stack trace로 구분합니다. 요청 본문과 DB 비밀번호는 기록하지 않습니다.

### DB 서버

MariaDB 시작·종료, 인증과 연결 오류는 서비스 로그에서 확인합니다.

```bash
sudo journalctl -u mariadb -f
```

실제 `SELECT`, `INSERT`, `DELETE` 쿼리를 관찰할 때만 General Log를 잠시 켭니다. 쿼리 내용이 기록되고 부하가 증가하므로 실습 후 반드시 끕니다.

```bash
GENERAL_LOG_FILE=$(sudo mariadb -Nse "SELECT IF(LEFT(@@general_log_file,1)='/',@@general_log_file,CONCAT(@@datadir,@@general_log_file));")
sudo mariadb -e "SET GLOBAL log_output='FILE'; SET GLOBAL general_log=ON;"
echo "$GENERAL_LOG_FILE"
sudo tail -F "$GENERAL_LOG_FILE"
```

확인이 끝나면 `Ctrl+C`를 누른 뒤 General Log를 끕니다.

```bash
sudo mariadb -e "SET GLOBAL general_log=OFF;"
```

## 8. ACG 권장 규칙

### Web ACG

| 프로토콜 | 포트 | 접근 소스 |
| --- | --- | --- |
| TCP | `22` | 관리자 IP |
| TCP | `80` | `0.0.0.0/0` |

### Backend ACG

| 프로토콜 | 포트 | 접근 소스 |
| --- | --- | --- |
| TCP | `22` | 관리자 IP 또는 Bastion |
| TCP | `4000` | Web 서버 Private IP 또는 Web ACG |

### DB ACG

| 프로토콜 | 포트 | 접근 소스 |
| --- | --- | --- |
| TCP | `22` | 관리자 IP 또는 Bastion |
| TCP | `3306` | Backend ACG |

Backend의 `4000/tcp`를 인터넷에 공개하지 않습니다. 외부 사용자는 Web 서버에만 접속하고 API 요청은 Nginx가 내부로 전달합니다.

## 9. 브라우저 확인

브라우저에서 Web Public IP로 접속해 게시글을 조회하고 새 글을 작성합니다.

```text
http://WEB_SERVER_PUBLIC_IP/
```

개발자 도구의 Network 탭에서 다음을 확인합니다.

- API Request URL이 `http://WEB_SERVER_PUBLIC_IP/api/...`입니다.
- Backend Private IP는 브라우저에 표시되지 않습니다.
- Health, 목록 조회, 글쓰기 요청이 모두 성공합니다.

## 10. 설정만 다시 반영

Web의 upstream이나 제목만 변경할 때는 패키지를 다시 설치하지 않습니다.

```bash
cd ~/cloud-infrastructure-lecture-example/003-three\ tier\ web\ app/web
nano .env
sudo ./install-web.sh configure
curl -i http://127.0.0.1/api/health
```

Backend `.env`만 변경할 때도 같은 방식으로 설정만 반영합니다.

```bash
cd ~/cloud-infrastructure-lecture-example/003-three\ tier\ web\ app/backend
nano .env
sudo ./install-backend.sh configure
curl -i http://127.0.0.1:4000/api/health
```

## 11. 014 Auto Scaling과 연결

003 완료 시 브라우저는 Web Public IP에 접속하고 Web Nginx는 고정 Backend를 바라봅니다.

```env
BACKEND_UPSTREAM=http://BACKEND_SERVER_PRIVATE_IP:4000
```

014에서는 이 Web 서버로 이미지를 만들고 Public ALB 뒤에 Web Auto Scaling Group을 구성합니다. 모든 Web 복제 서버는 같은 `BACKEND_UPSTREAM`을 사용합니다.

```text
브라우저 → Public ALB → Web ASG → 고정 Backend → DB
```

브라우저 진입 주소는 Web 서버 Public IP에서 Public ALB 주소로 바뀝니다. Backend와 DB의 IP는 바뀌지 않습니다.
