# 003 Three Tier Web App

## 1. 목표

Web, Backend, DB 서버를 분리해 3계층 게시판을 구성하고 서버 간 사설 통신과 ACG를 확인합니다. 013에서는 Public ALB 뒤에서 Web 서버를 Auto Scaling하고 Backend와 DB는 고정 서버로 유지합니다.

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
    - `FRONTEND_ORIGIN`: Backend가 허용할 브라우저 Web Origin
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
DB_ROOT_PASSWORD=RootPass123!
DB_PREVIOUS_ROOT_PASSWORD=
DB_NAME=chapter3_board
DB_USER=chapter3_user
DB_PASSWORD=AppDbPass123!
DB_ALLOWED_HOST=10.0.1.25
DB_BIND_ADDRESS=0.0.0.0
```

`DB_ALLOWED_HOST`에는 고정 Backend Private IP를 입력합니다. 013의 Auto Scaling 대상은 Web 서버이므로 Backend와 DB 연결은 그대로 유지됩니다. DB ACG에서는 `3306/tcp` 접근 소스를 Backend ACG로 제한합니다.

설치를 다시 실행합니다.

```bash
sudo ./install-db.sh
sudo systemctl is-active mariadb
sudo mariadb -u root -p -e "SHOW DATABASES;"
```

`active`와 `chapter3_board`를 확인합니다.

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
FRONTEND_ORIGIN=http://WEB_SERVER_PUBLIC_IP
DB_HOST=DB_SERVER_PRIVATE_IP
DB_PORT=3306
DB_NAME=chapter3_board
DB_USER=chapter3_user
DB_PASSWORD=AppDbPass123!
AUTO_POST_ENABLED=false
AUTO_POST_INTERVAL_SECONDS=60
AUTO_POST_TOTAL=300
AUTO_POST_API_URL=http://127.0.0.1:4000/api/posts
LAB_STRESS_ENABLED=false
```

`FRONTEND_ORIGIN`에는 Backend IP가 아니라 브라우저에서 접속할 Web Public IP 또는 도메인을 입력합니다. 주소를 여러 개 허용하려면 쉼표로 구분합니다.

```env
FRONTEND_ORIGIN=http://WEB_SERVER_PUBLIC_IP,http://board.example.com
```

설치와 점검을 실행합니다.

```bash
sudo ./install-backend.sh install
systemctl is-enabled chapter3-backend
systemctl is-active chapter3-backend
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
- `/healthz`는 HTTP `200`과 `ok`를 반환하며 013 ALB Health Check에 사용합니다.
- `/web-instance`와 `X-Web-Instance`는 현재 Web hostname을 보여줍니다.
- `/api/health`는 Nginx를 거쳐 Backend의 HTTP `200`을 반환합니다.
- `/api/instance`의 `X-Backend-Instance`와 JSON `instance`에 Backend hostname이 표시됩니다.

## 7. ACG 권장 규칙

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

## 8. 브라우저 확인

브라우저에서 Web Public IP로 접속해 게시글을 조회하고 새 글을 작성합니다.

```text
http://WEB_SERVER_PUBLIC_IP/
```

개발자 도구의 Network 탭에서 다음을 확인합니다.

- API Request URL이 `http://WEB_SERVER_PUBLIC_IP/api/...`입니다.
- Backend Private IP는 브라우저에 표시되지 않습니다.
- Health, 목록 조회, 글쓰기 요청이 모두 성공합니다.

## 9. 설정만 다시 반영

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

## 10. 013 Auto Scaling과 연결

003 완료 시 브라우저는 Web Public IP에 접속하고 Web Nginx는 고정 Backend를 바라봅니다.

```env
BACKEND_UPSTREAM=http://BACKEND_SERVER_PRIVATE_IP:4000
```

013에서는 이 Web 서버로 이미지를 만들고 Public ALB 뒤에 Web Auto Scaling Group을 구성합니다. 모든 Web 복제 서버는 같은 `BACKEND_UPSTREAM`을 사용합니다.

```text
브라우저 → Public ALB → Web ASG → 고정 Backend → DB
```

브라우저 진입 주소는 Web 서버 Public IP에서 Public ALB 주소로 바뀝니다. Backend와 DB의 IP는 바뀌지 않습니다.
