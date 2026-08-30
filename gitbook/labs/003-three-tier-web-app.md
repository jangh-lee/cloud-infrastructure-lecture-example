# 003 Three Tier Web App

## 목표

Web, Backend, DB 서버를 분리해 3계층 게시판을 구성하고 서버 간 통신, ACG, 사설 IP 연결을 실습합니다.

## 실습 폴더

```text
003-three tier web app
```

## 권장 구조

```text
사용자 브라우저
   ↓ 80
웹서버 nginx
   ↓ 4000
백엔드 Node.js
   ↓ 3306
DB MariaDB
```

## 설치 순서

1. DB 서버
2. 백엔드 서버
3. 웹서버

## DB 서버

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git || true
cd cloud-infrastructure-lecture-example
git pull origin main
cd "003-three tier web app/db"
chmod +x install-db.sh
sudo ./install-db.sh
```

처음 실행하면 `.env` 템플릿이 생성됩니다. 값을 채운 뒤 다시 실행합니다.

예시 비밀번호는 Naver Cloud DB for MySQL 콘솔에서도 그대로 쓸 수 있도록 2자 이상, 21자 이하로 맞췄습니다.

```env
DB_ROOT_PASSWORD=RootPass123!
DB_PREVIOUS_ROOT_PASSWORD=
DB_NAME=chapter3_board
DB_USER=chapter3_user
DB_PASSWORD=AppDbPass123!
DB_ALLOWED_HOST=10.0.1.25
DB_BIND_ADDRESS=0.0.0.0
```

```bash
sudo ./install-db.sh
```

## 백엔드 서버

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git || true
cd cloud-infrastructure-lecture-example
git pull origin main
cd "003-three tier web app/backend"
chmod +x install-backend.sh
sudo ./install-backend.sh
```

`.env`를 채운 뒤 다시 실행합니다.

```env
PORT=4000
FRONTEND_ORIGIN=http://WEB_SERVER_PUBLIC_IP
DB_HOST=DB_SERVER_PRIVATE_IP
DB_PORT=3306
DB_NAME=chapter3_board
DB_USER=chapter3_user
DB_PASSWORD=AppDbPass123!
AUTO_POST_ENABLED=true
AUTO_POST_INTERVAL_SECONDS=60
AUTO_POST_TOTAL=300
AUTO_POST_API_URL=http://127.0.0.1:4000/api/posts
```

```bash
sudo ./install-backend.sh
```

## 웹서버

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git || true
cd cloud-infrastructure-lecture-example
git pull origin main
cd "003-three tier web app/web"
chmod +x install-web.sh
sudo ./install-web.sh
```

`.env`를 채운 뒤 다시 실행합니다.

```bash
sudo ./install-web.sh
```

## ACG 권장 규칙

웹서버:

- `22/tcp`: 관리자 IP
- `80/tcp`: `0.0.0.0/0`

백엔드 서버:

- `22/tcp`: 관리자 IP
- `4000/tcp`: 웹서버 사설 IP 또는 웹서버 ACG

DB 서버:

- `22/tcp`: 관리자 IP
- `3306/tcp`: 백엔드 서버 사설 IP 또는 백엔드 ACG

## 확인

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/posts
```

웹서버는 브라우저에서 확인합니다.

```text
http://WEB_SERVER_PUBLIC_IP/
```
