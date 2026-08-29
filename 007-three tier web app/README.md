# Chapter 3. Multi-Tier Board on Naver Cloud

네이버클라우드 Ubuntu 서버 3대로 구성하는 게시판 실습입니다.

- 웹서버: 정적 프론트엔드 + `nginx`
- 백엔드 서버: `node`, `express`, `mysql2`
- DB 서버: `mariadb`

로그인 없이도 `비가입 유저` 이름으로 게시글 작성과 삭제가 가능하도록 구성했습니다.

## 1. 팀장 역할

팀장은 아래 항목을 먼저 정리합니다.

1. 웹서버 공인/사설 IP
2. 백엔드 서버 공인/사설 IP
3. DB 서버 공인/사설 IP
4. ACG 규칙
5. 각 서버 `.env` 값

실습 전에 팀장이 먼저 아래 값을 공유하면 진행이 빨라집니다.

- `SITE_BASE_URL`
- `BACKEND_BASE_URL`
- `FRONTEND_ORIGIN`
- `DB_HOST`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

주소 값은 프라이빗 IP, 퍼블릭 IP, DNS 중 실제로 상대 서버에서 도달 가능한 값이면 어느 쪽이든 사용할 수 있습니다.
같은 VPC 내부 통신이면 보통 프라이빗 IP를 권장합니다.

## 2. 네트워크 구성

권장 구조:

```text
사용자 브라우저
   ↓ 80
웹서버 (nginx)
   ↓ 4000
백엔드 서버 (node/express)
   ↓ 3306
DB 서버 (mariadb)
```

## 3. 네이버클라우드 ACG 권장 규칙

### 웹서버 ACG

- `22/tcp`: 관리자 IP에서만 허용
- `80/tcp`: `0.0.0.0/0`

### 백엔드 서버 ACG

- `22/tcp`: 관리자 IP에서만 허용
- `4000/tcp`: 웹서버 사설 IP 또는 웹서버 ACG에서만 허용

### DB 서버 ACG

- `22/tcp`: 관리자 IP에서만 허용
- `3306/tcp`: 백엔드 서버 사설 IP 또는 백엔드 ACG에서만 허용

## 4. 설치 순서

1. DB 서버 설치
2. 백엔드 서버 설치
3. 웹서버 설치

## 5. 서버별 폴더

- [web](./web)
- [backend](./backend)
- [db](./db)

## 6. 서버 접속 직후 바로 실행

이미 리포를 받은 적이 없다면:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd cloud-infrastructure-lecture-example
```

이미 리포를 받아둔 서버라면:

```bash
cd cloud-infrastructure-lecture-example
git pull origin main
```

스크립트는 `.env`가 없으면 같은 폴더에 템플릿 `.env`를 자동으로 만들어주고 종료합니다.
즉, 스크립트만 서버에 복사해 넣어도 1회 실행 후 `.env`를 채우고 다시 실행하는 방식으로 사용할 수 있습니다.

### DB 서버 `.env` 예시

```env
DB_ROOT_PASSWORD=ChangeRootPassword123!
DB_PREVIOUS_ROOT_PASSWORD=
DB_NAME=chapter3_board
DB_USER=chapter3_user
DB_PASSWORD=ChangeThisPassword123!
DB_ALLOWED_HOST=10.0.1.25
DB_BIND_ADDRESS=0.0.0.0
```

### DB 서버

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git || true
cd cloud-infrastructure-lecture-example
git pull origin main
cd "007-three tier web app/db"
chmod +x install-db.sh
sudo ./install-db.sh
# .env가 자동 생성되면 값 수정 후 다시
sudo ./install-db.sh
```

DB 서버의 `DB_PASSWORD`를 변경한 경우 `.env`를 저장하고 `sudo ./install-db.sh`를 다시 실행하면 기존 DB 사용자의 비밀번호도 새 값으로 갱신됩니다. 이후 백엔드 서버의 `DB_PASSWORD`도 같은 값으로 변경하고 `sudo ./install-backend.sh configure`를 실행해야 합니다.

`DB_ROOT_PASSWORD` 자체를 변경하면서 기존 루트 비밀번호 인증이 필요한 환경이라면 DB 서버 `.env`에 이전 값을 임시로 지정합니다. 변경 완료 후에는 `DB_PREVIOUS_ROOT_PASSWORD`를 다시 비워두세요.

```env
DB_ROOT_PASSWORD=NewRootPassword
DB_PREVIOUS_ROOT_PASSWORD=CurrentRootPassword
```

### 백엔드 서버 `.env` 예시

```env
PORT="4000"
FRONTEND_ORIGIN="http://10.0.0.10,http://board.example.com"
DB_HOST="10.0.1.30"
DB_PORT="3306"
DB_NAME="chapter3_board"
DB_USER="chapter3_user"
DB_PASSWORD="ChangeThisPassword123!"
AUTO_POST_ENABLED="true"
AUTO_POST_INTERVAL_SECONDS="60"
AUTO_POST_TOTAL="300"
AUTO_POST_API_URL="http://127.0.0.1:4000/api/posts"
```

`FRONTEND_ORIGIN`은 브라우저에서 접속하는 웹 주소를 적습니다. HTTP 수업이면 반드시 `http://`까지 포함합니다. 웹서버 공인 IP와 도메인을 둘 다 쓸 경우 콤마로 나열합니다.

```env
FRONTEND_ORIGIN="http://WEB_SERVER_PUBLIC_IP,http://YOUR_DOMAIN"
```

강의 편의상 모든 Origin을 허용하려면 아래처럼 쓸 수 있습니다. 운영 환경에서는 권장하지 않습니다.

```env
FRONTEND_ORIGIN="*"
```

### 백엔드 서버

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git || true
cd cloud-infrastructure-lecture-example
git pull origin main
cd "007-three tier web app/backend"
chmod +x install-backend.sh
sudo ./install-backend.sh
# .env가 자동 생성되면 값 수정 후 다시
sudo ./install-backend.sh configure
```

자동 예시 글을 생성하려면 백엔드 서버 `.env`에 아래 값을 넣고 `install-backend.sh`를 다시 실행합니다.

```env
AUTO_POST_ENABLED=true
AUTO_POST_INTERVAL_SECONDS=60
AUTO_POST_TOTAL=300
AUTO_POST_API_URL=http://127.0.0.1:4000/api/posts
```

`.env`만 바꾼 경우에는 패키지 설치를 반복할 필요가 없으므로 아래 명령으로 설정만 반영합니다.

```bash
sudo ./install-backend.sh configure
```

이 기능은 백엔드 서버 안에서 별도 systemd 서비스가 1분에 한 번씩 자기 API에 `POST /api/posts`를 호출하는 방식입니다. 작성자는 여러 명처럼 보이도록 샘플 이름을 섞고, 제목과 본문은 실습 주제 조합으로 300개까지 생성합니다. 샘플은 매번 랜덤으로 선택하며, 이미 사용한 샘플 번호는 상태 파일에 저장해서 중복 등록하지 않습니다.

상태 확인:

```bash
sudo ./install-backend.sh status
sudo systemctl status chapter3-post-seeder --no-pager
sudo journalctl -u chapter3-post-seeder -f
```

중지:

```bash
sudo systemctl disable --now chapter3-post-seeder
```

### 웹서버 `.env` 예시

```env
SITE_BASE_URL="http://10.0.0.10"
BACKEND_BASE_URL="http://10.0.1.25:4000"
SITE_TITLE="DevForum Practice Board"
```

### 웹서버

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git || true
cd cloud-infrastructure-lecture-example
git pull origin main
cd "007-three tier web app/web"
chmod +x install-web.sh
sudo ./install-web.sh
# .env가 자동 생성되면 값 수정 후 다시
sudo ./install-web.sh
```

## 7. 동작 확인

### DB 서버

```bash
sudo mariadb -u root -p -e "SHOW DATABASES;"
```

### 백엔드 서버

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/posts
```

### 웹서버

```bash
curl http://localhost
```

브라우저에서는 웹서버 공인 IP로 접속합니다.

```text
http://WEB_SERVER_PUBLIC_IP/
```
