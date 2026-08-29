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

Naver Cloud DB for MySQL 콘솔에서 같은 값을 재사용할 수 있도록 예시 비밀번호는 2자 이상, 21자 이하로 구성했습니다.

### DB 서버 `.env` 예시

```env
DB_ROOT_PASSWORD=RootPass123!
DB_PREVIOUS_ROOT_PASSWORD=
DB_NAME=chapter3_board
DB_USER=chapter3_user
DB_PASSWORD=AppDbPass123!
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
DB_PASSWORD="AppDbPass123!"
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

게시판 DB의 테이블 구조, 전체 게시글 수, 최신 10건의 실제 제목·본문, 빈 값·미래 시각 같은 이상 데이터, 중복 후보, 작성자별·날짜별 적재 현황은 학습용 조회 SQL로 확인할 수 있습니다.

```bash
cd "007-three tier web app"
mysql -h DB_SERVER_PRIVATE_IP \
  -u chapter3_user \
  -p chapter3_board \
  < db/queries/board-data.sql
```

이 예제에는 회원가입 기능과 `users` 테이블이 없습니다. `posts.author_name`은 게시글에 저장되는 작성자 표시 이름입니다. 실제 MariaDB 접속 계정과 허용 호스트, 인증 방식, `chapter3_board` 권한은 DB 서버에서 관리자용 SQL로 확인합니다.

```bash
cd "007-three tier web app"
sudo mariadb -u root -p < db/queries/database-accounts.sql
```

#### SQL 직접 조회 실습

SQL 파일만 실행하고 넘어가지 말고, 아래처럼 DB에 접속해서 쿼리를 하나씩 입력해 봅니다.

```bash
mysql -h DB_SERVER_PRIVATE_IP -u chapter3_user -p chapter3_board
```

접속 후 현재 선택된 DB와 실제 인증 계정을 확인합니다.

```sql
SELECT
  DATABASE() AS database_name,
  CURRENT_USER() AS authenticated_account,
  USER() AS connection_account,
  VERSION() AS database_version;

SHOW GRANTS FOR CURRENT_USER;
```

`database_name`은 `chapter3_board`여야 합니다. `CURRENT_USER()`는 DB가 권한을 판정할 때 사용한 계정이고, `USER()`는 클라이언트가 접속할 때 사용한 계정과 접속 출발지를 보여줍니다.

테이블과 컬럼 구조를 직접 확인합니다.

```sql
SHOW TABLES;
DESCRIBE posts;
SHOW CREATE TABLE posts\G
```

`posts.id`는 기본 키이자 `AUTO_INCREMENT`, 제목·본문·작성자·작성 시각은 `NOT NULL`인지 확인합니다.

게시글이 실제로 쌓이고 있는지 범위와 최근 내용을 조회합니다.

```sql
SELECT
  COUNT(*) AS total_posts,
  MIN(id) AS first_post_id,
  MAX(id) AS last_post_id,
  MIN(created_at) AS first_created_at,
  MAX(created_at) AS last_created_at
FROM posts;

SELECT id, title, content, author_name, created_at
FROM posts
ORDER BY id DESC
LIMIT 10;
```

웹에서 새 글을 작성한 뒤 두 쿼리를 다시 실행해 `total_posts`, `last_post_id`가 증가하고 최신 행의 제목·본문이 입력한 내용과 같은지 확인합니다. 특정 글 하나를 자세히 보려면 실제 ID를 지정합니다.

```sql
SET @post_id = 1;

SELECT
  id,
  title,
  content,
  CHAR_LENGTH(title) AS title_length,
  CHAR_LENGTH(content) AS content_length,
  author_name,
  created_at
FROM posts
WHERE id = @post_id;
```

작성자와 날짜별로 데이터가 어떤 분포로 쌓였는지 집계합니다. 이 게시판에는 회원 테이블이 없으므로 `author_name`은 로그인 사용자가 아니라 게시글에 저장된 표시 이름입니다.

```sql
SELECT author_name, COUNT(*) AS post_count
FROM posts
GROUP BY author_name
ORDER BY post_count DESC, author_name;

SELECT DATE(created_at) AS created_date, COUNT(*) AS post_count
FROM posts
GROUP BY DATE(created_at)
ORDER BY created_date DESC
LIMIT 14;
```

마지막으로 빈 값, 미래 시각, 중복 후보 같은 이상 데이터를 조회합니다. 정상이라면 첫 쿼리의 네 값은 모두 `0`이고, 중복 후보 쿼리는 결과가 없거나 의도적으로 같은 제목을 작성한 행만 나와야 합니다.

```sql
SELECT
  COALESCE(SUM(CASE WHEN TRIM(title) = '' THEN 1 ELSE 0 END), 0) AS empty_title_count,
  COALESCE(SUM(CASE WHEN TRIM(content) = '' THEN 1 ELSE 0 END), 0) AS empty_content_count,
  COALESCE(SUM(CASE WHEN TRIM(author_name) = '' THEN 1 ELSE 0 END), 0) AS empty_author_count,
  COALESCE(SUM(CASE WHEN created_at > CURRENT_TIMESTAMP THEN 1 ELSE 0 END), 0) AS future_created_at_count
FROM posts;

SELECT title, author_name, COUNT(*) AS duplicate_candidate_count
FROM posts
GROUP BY title, author_name
HAVING COUNT(*) > 1
ORDER BY duplicate_candidate_count DESC, title;
```

실제 MariaDB 접속 계정은 DB 서버에서 관리자 권한으로 별도 확인합니다.

```bash
sudo mariadb -u root -p
```

```sql
SELECT User, Host, plugin
FROM mysql.user
ORDER BY User, Host;

SELECT GRANTEE, TABLE_SCHEMA, PRIVILEGE_TYPE
FROM information_schema.SCHEMA_PRIVILEGES
WHERE TABLE_SCHEMA = 'chapter3_board'
ORDER BY GRANTEE, PRIVILEGE_TYPE;
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
