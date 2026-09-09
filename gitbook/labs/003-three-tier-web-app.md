# 003 Three Tier Web App

## 1. 목표

Web, Backend, DB 서버를 분리해 3계층 게시판을 구성하고 서버 간 사설 통신과 ACG를 확인합니다. 303에서는 Public ALB 뒤에서 Web 서버를 Auto Scaling하고 Backend와 DB는 고정 서버로 유지합니다.

게시판 서비스의 기본 Database는 `board_service`, Backend 전용 DB 계정은 `board_app`입니다. `003`은 강의 순서일 뿐 서비스 역할이 아니므로 DB와 계정 이름에 챕터 번호를 넣지 않습니다. 401 Cloud DB 생성과 402 마이그레이션에서도 같은 값을 사용합니다.

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

`DB_ALLOWED_HOST`에는 고정 Backend Private IP를 입력합니다. 303의 Auto Scaling 대상은 Web 서버이므로 Backend와 DB 연결은 그대로 유지됩니다. DB ACG에서는 `3306/tcp` 접근 소스를 Backend ACG로 제한합니다.

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
AUTO_POST_API_URL=http://127.0.0.1:4000/api/internal/sample-posts
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
| `AUTO_POST_API_URL` | 자동 등록 기능이 호출할 게시글 API | 같은 Backend를 호출하므로 기본값 `http://127.0.0.1:4000/api/internal/sample-posts`를 사용합니다. |
| `LAB_STRESS_ENABLED` | Backend 부하 발생용 실습 API 사용 여부 | 003과 Web Auto Scaling을 다루는 303에서는 `false`를 유지합니다. |

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
| `SITE_BASE_URL` | 사용자가 브라우저로 접속할 대표 Web 주소 | 003에서는 Web Public IP, 303에서는 Public ALB 주소를 `http://` 또는 `https://`와 함께 입력합니다. |
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
- `/healthz`는 HTTP `200`과 `ok`를 반환하며 303 ALB Health Check에 사용합니다.
- `/web-instance`는 현재 Web hostname과 Private IP를, `X-Web-Instance`는 hostname을 보여줍니다.
- `/api/health`는 Nginx를 거쳐 Backend의 HTTP `200`을 반환합니다.
- `/api/instance`의 `X-Backend-Instance`와 JSON `instance`에 Backend hostname이 표시됩니다.

게시판 하단의 작은 `Web hostname · Private IP` 배지는 `/web-instance`를 5초마다 조회합니다. 303에서 Web 서버가 여러 대로 늘어나면 ALB가 선택한 서버에 따라 표시가 바뀌므로 Scale-out과 분산 상태를 브라우저에서도 확인할 수 있습니다.

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

## 11. 303 Auto Scaling과 연결

003 완료 시 브라우저는 Web Public IP에 접속하고 Web Nginx는 고정 Backend를 바라봅니다.

```env
BACKEND_UPSTREAM=http://BACKEND_SERVER_PRIVATE_IP:4000
```

303에서는 이 Web 서버로 이미지를 만들고 Public ALB 뒤에 Web Auto Scaling Group을 구성합니다. 모든 Web 복제 서버는 같은 `BACKEND_UPSTREAM`을 사용합니다.

```text
브라우저 → Public ALB → Web ASG → 고정 Backend → DB
```

브라우저 진입 주소는 Web 서버 Public IP에서 Public ALB 주소로 바뀝니다. Backend와 DB의 IP는 바뀌지 않습니다.

## 회원과 관리자

우측 상단 **로그인 → 회원 가입**으로 일반 회원을 생성합니다. **관리자 로그인**으로 접속하면 **공지 관리**에서 사전 공지, 점검 시작, 점검 해제를 선택할 수 있습니다. 게시글은 기존 실습처럼 비가입 작성·삭제를 허용합니다. 자동 게시글은 `posts.author_id`로 회원을 참조하고 비가입 글은 이 값이 `NULL`입니다.

`board_service` 안에 `posts`, `users`, `notices`를 함께 저장합니다. `users.role`의 `member` / `admin`으로 권한을 구분하며 별도 관리자 DB는 만들지 않습니다. 비밀번호는 scrypt 해시로 저장합니다. `notices.created_by`는 `users.id`를 참조하고 공지 변경 이력을 남깁니다.

### 자동 게시글의 회원 등록

자동 작성기는 무작위 샘플을 고른 뒤 Backend의 `POST /api/internal/sample-posts`를 호출합니다. 해당 작성자의 회원이 없으면 `users`에 `role=member`로 생성하고, 같은 작성자의 다음 글에는 기존 회원을 재사용합니다. 작성자는 20명이며, `users.seed_author`로 구분합니다. 표시 이름이 같은 일반 회원을 가져다 쓰지는 않습니다.

`posts.author_id → users.id`로 작성자를 연결합니다. 회원 등록과 글 저장은 한 트랜잭션으로 처리하며, `posts.seed_index`의 유일 키로 재시도 시 같은 샘플 글이 중복 저장되는 것을 방지합니다. 자동 계정에는 임의 비밀번호의 해시만 저장하므로 로그인 실습에는 직접 가입한 회원 계정을 사용합니다.

이 API는 Backend의 localhost에서만 호출할 수 있습니다. 기존 `.env`의 `AUTO_POST_API_URL`이 `/api/posts`로 끝나면 새 경로로 자동 변환하므로 설정을 그대로 재사용할 수 있습니다. 등록 간격·총 개수·진행 상태 파일도 유지합니다.

기존 환경을 업데이트할 때는 아래 DB 추가 SQL과 최신 Backend 코드를 먼저 적용한 뒤 **Backend 서버에서** 실행합니다. 기존 자동 작성기의 제목·본문·작성자 형식이 모두 일치하는 글만 회원과 연결하며 원래 글 번호와 내용은 보존합니다.

```bash
sudo systemctl stop board-service-post-seeder
sudo node /opt/board-service-backend/backfill-sample-members.js
# 자동 등록 실습을 계속할 때 다시 시작
sudo systemctl start board-service-post-seeder
```

### 관리자 계정 생성

실습 관리자 로그인은 **아이디 `admin` / 비밀번호 `admin`**입니다.

최신 DB 설치 스크립트는 세 테이블을 생성합니다. 기존 Source DB를 업데이트할 때는 DB 서버에서 아래 추가 SQL만 실행합니다. 기존 게시글은 유지됩니다. **DMS Target에는 미리 실행하지 않습니다.**

```bash
curl -fsSL 'https://raw.githubusercontent.com/jangh-lee/cloud-infrastructure-lecture-example/main/003-three%20tier%20web%20app/db/migrations/002-members-notices.sql' -o /tmp/002-members-notices.sql
sudo mariadb -u root -p board_service < /tmp/002-members-notices.sql
curl -fsSL 'https://raw.githubusercontent.com/jangh-lee/cloud-infrastructure-lecture-example/main/003-three%20tier%20web%20app/db/migrations/003-sample-members.sql' -o /tmp/003-sample-members.sql
sudo mariadb -u root -p board_service < /tmp/003-sample-members.sql
```

Backend와 Web에도 최신 설치 스크립트의 `configure`를 적용한 뒤 **Backend 서버에서** 아래 명령으로 실습 관리자 계정을 준비합니다. 기존 관리자 계정도 같은 비밀번호로 변경됩니다.

```bash
sudo node /opt/board-service-backend/manage-admin.js admin
```

게시판의 **관리자 로그인**에서 아이디와 비밀번호 모두 `admin`을 입력합니다. 비밀번호는 DB에 해시로 저장하며, 기존 계정의 ID와 공지 이력은 유지합니다. 비밀번호가 변경되면 기존 로그인 세션은 만료됩니다. 로그인은 2시간 동안 유지되고 로그아웃하면 해당 계정의 기존 세션을 만료시킵니다. 실습의 HTTP 주소에서는 일반 쿠키를 사용하며, HTTPS를 구성했다면 Backend `.env`에 `COOKIE_SECURE=true`를 설정합니다.

### 관리자 공지 반영

1. 우측 상단 **관리자 로그인 → 공지 관리**로 이동합니다.
2. **사전 공지**와 제목·본문을 입력하고 **공지 반영**을 누릅니다. 게시글 목록 첫 줄에 빨간색 **공지** 표시로 고정되며 제목을 누르면 본문이 열립니다. 검색과 페이지 이동 중에도 맨 위에 표시됩니다.
3. 점검 직전에 **점검 시작**으로 반영하고, 완료 메시지와 실제 점검 화면을 확인합니다.
4. 마이그레이션을 마치고 Backend가 정상 연결되면 **공지 종료 / 점검 해제**를 반영합니다.

관리자 공지는 DB에 저장한 뒤 Web의 `board-service-notice-sync`가 약 2초마다 표시용 파일로 복사합니다. 브라우저 반영까지 보통 10초 이내이며 **저장만 되고 화면 반영이 확인되지 않았다면 DB 작업을 시작하지 않습니다.** DB/Backend 중단 중에도 마지막 공지는 유지되지만 로그인·공지 작성은 사용할 수 없습니다. 이때는 아래 Web CLI로 공지를 변경하거나 해제합니다. CLI 변경은 DB 이력에 저장되지 않으며, 이후 새로운 관리자 공지가 등록될 때까지 유지됩니다.

Web이 여러 대면 각 서버에 sync 서비스를 설치하고 모든 서버의 `/notice.json` 반영을 확인합니다. Backend가 여러 대면 `/var/lib/board-service-backend/session-secret`을 동일하게 배포해야 합니다.

## 공지 및 점검 화면 {#notice-maintenance}

Web 서버의 `board-notice` 명령으로 공지를 관리합니다. 공지와 점검 상태는 `/var/lib/board-service-notice`에 저장되며 DB 연결 없이 Nginx가 제공합니다. 설치·재설정 시 기존 공지와 점검 상태를 유지합니다.

```bash
# Web 서버: 게시글 최상단 고정 공지 (게시판 정상 이용)
sudo board-notice announce --title '서비스 작업 안내' --message-file - <<'NOTICE'
잠시 후 데이터베이스 이전 작업을 진행합니다.
작업 중에는 게시글 조회·작성·삭제가 일시 중단됩니다.
작성 중인 내용은 미리 보관해 주세요.
NOTICE

# Web 서버: 점검 화면 전환 및 공개 API 차단
sudo board-notice maintenance --title '서비스 점검 중입니다' --message-file - <<'NOTICE'
현재 데이터베이스 이전 작업을 진행하고 있습니다.
데이터 확인을 마친 뒤 서비스를 다시 열겠습니다.
이용에 불편을 드려 죄송합니다.
NOTICE

sudo board-notice status
```

공지 설정은 접속 중인 브라우저에도 최대 5초 후 반영됩니다. `announce`는 게시글 목록의 최상단 고정 공지, `maintenance`는 모든 게시판 경로의 점검 화면입니다. 점검 중 일반 `/api/` 요청은 HTTP 503이며, 관리자 복구를 위한 `/api/auth/`·`/api/admin/`는 Backend로 전달합니다. ALB의 `/healthz`는 HTTP 200을 반환합니다. Web이 여러 대라면 각 Web 서버에 같은 공지와 점검 상태를 적용합니다.

**마이그레이션 전에는 Backend 서버에서도 자동 작성기와 API 서비스를 중지합니다.** 자동 작성기는 Web을 거치지 않고 Backend에 직접 요청하므로 Web의 점검 모드만으로는 중지되지 않습니다.

```bash
# Backend 서버
sudo systemctl stop board-service-post-seeder board-service-backend
```

작업 완료 후 Backend를 먼저 시작하고 `http://localhost:4000/api/health`와 `/api/posts`를 확인합니다. Web 서버에서 아래 명령으로 점검을 해제하고, 필요할 때 Backend의 자동 작성기를 다시 시작합니다.

```bash
# Web 서버: 검증을 마친 뒤 점검과 공지 해제
sudo board-notice clear
```

계획된 점검은 관리자가 해제할 때까지 유지됩니다. 점검 모드를 켜지 않은 상태에서 DB/Backend 연결 장애가 발생하면 일시적 장애 안내가 자동 표시되고, 연결이 회복되면 게시판으로 돌아갑니다. 작성 중인 본문은 같은 브라우저 창을 유지하면 보존되며, 실패한 글쓰기·삭제 요청을 자동 재전송하지 않습니다.
