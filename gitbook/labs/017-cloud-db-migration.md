# 017 Cloud DB Migration

## 목표

003번 게시판 DB를 Ubuntu 서버의 MariaDB/MySQL에서 Naver Cloud `Cloud DB for MySQL`로 마이그레이션합니다.

!!! warning "015에서 사용 중인 DB와 분리"
    DMS 실습의 Target에는 Source와 같은 `board_service`가 없어야 합니다. 015에서 생성해 서비스 중인 Cloud DB를 그대로 Target으로 쓰지 말고, DMS용 빈 Cloud DB Service를 새로 만들거나 015 리소스를 더 이상 사용하지 않을 때만 초기화합니다.

이 실습에서는 두 가지 방식을 소개합니다.

| 방식 | 적합한 상황 | 특징 |
| --- | --- | --- |
| DMS | 운영 DB를 Cloud DB로 이관 | 콘솔 기반, 연결 테스트 제공, binlog/권한/ACG 준비 필요 |
| mysqldump | 작은 DB를 단순 백업/복원 | SQL 파일로 이해하기 쉬움, 덤프 이후 변경분은 자동 반영되지 않음 |

DMS 흐름:

```text
Source DB 사전 설정
  -> Cloud DB for MySQL 생성
  -> DMS Endpoint 생성
  -> DMS Migration 실행
  -> 데이터 검증
  -> Backend DB_HOST 전환
```

mysqldump 흐름:

```text
데이터 변경 중지 또는 점검 시간 확보
  -> mysqldump로 SQL 파일 생성
  -> Cloud DB for MySQL에 복원
  -> 데이터 검증
  -> Backend DB_HOST 전환
```

## ERD

```mermaid
erDiagram
  POSTS {
    BIGINT id PK "AUTO_INCREMENT"
    VARCHAR title "게시글 제목"
    TEXT content "게시글 본문"
    VARCHAR author_name "작성자 표시 이름"
    TIMESTAMP created_at "생성 시각"
  }
```

## 데이터 사전

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `BIGINT` | 게시글 고유 번호 |
| `title` | `VARCHAR(200)` | 게시글 제목 |
| `content` | `TEXT` | 게시글 본문 |
| `author_name` | `VARCHAR(100)` | 작성자 표시 이름 |
| `created_at` | `TIMESTAMP` | 생성 시각 |

## 1. Source DB 준비

Naver Cloud DB for MySQL의 DB 사용자 비밀번호 조건에 맞춰 예시 비밀번호는 8자 이상, 20자 이하인 `MigratePass123!`를 사용합니다.

### 1-1. MariaDB 바이너리 로그 설정

003번 Source DB 서버에서 DMS가 초기 데이터 이후의 변경분을 읽을 수 있도록 바이너리 로그를 활성화합니다.

```bash
sudo tee /etc/mysql/mariadb.conf.d/60-dms-source.cnf >/dev/null <<'EOF'
[mysqld]
server-id=1
log_bin=mysql-bin
binlog_format=ROW
binlog_row_image=FULL
expire_logs_days=5
bind-address=0.0.0.0
EOF

sudo systemctl restart mariadb
sudo systemctl is-active mariadb
```

마지막 결과가 `active`인지 확인합니다.

### 1-2. DMS 전용 계정 생성

MariaDB 관리자 비밀번호는 003 DB 서버의 `~/cloud-infrastructure-lecture-example/003-three tier web app/db/.env`에 있는 `DB_ROOT_PASSWORD`를 입력합니다. 아래 `%`는 실습 편의를 위한 값이며 실제 운영 환경에서는 DMS가 접근하는 IP 대역으로 제한합니다.

```bash
sudo mariadb -u root -p <<'SQL'
CREATE USER IF NOT EXISTS 'dms_migration'@'%'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('MigratePass123!');
ALTER USER 'dms_migration'@'%'
  IDENTIFIED VIA mysql_native_password USING PASSWORD('MigratePass123!');
GRANT RELOAD, PROCESS, SHOW DATABASES, REPLICATION SLAVE, REPLICATION CLIENT
  ON *.* TO 'dms_migration'@'%';
GRANT SELECT ON mysql.* TO 'dms_migration'@'%';
GRANT SELECT, SHOW VIEW, LOCK TABLES, TRIGGER
  ON board_service.* TO 'dms_migration'@'%';
FLUSH PRIVILEGES;
SQL
```

`ERROR 1227 ... CREATE USER privilege`가 나오면 `board_app` 같은 일반 앱 계정으로 접속한 것입니다. 반드시 MariaDB `root` 관리자 계정으로 실행합니다.

### 1-3. Source DB 준비 상태 확인

```bash
sudo mariadb -u root -p board_service <<'SQL'
SHOW VARIABLES
WHERE Variable_name IN (
  'server_id', 'log_bin', 'binlog_format',
  'binlog_row_image', 'expire_logs_days', 'bind_address'
);
SHOW MASTER STATUS;
SHOW GRANTS FOR 'dms_migration'@'%';
SELECT COUNT(*) AS total_posts FROM posts;
SQL
```

`log_bin=ON`, `binlog_format=ROW`, `binlog_row_image=FULL`이고 `SHOW MASTER STATUS`에 바이너리 로그 파일이 표시되어야 다음 단계로 넘어갑니다. 권한 결과에는 복제 관련 전역 권한과 `board_service` 조회 권한이 모두 보여야 합니다.

## 2. Cloud DB for MySQL 생성

콘솔에서 Target DB를 생성합니다.

```text
VPC
  -> Cloud DB for MySQL
  -> DB Server 생성
```

Source DB와 같은 major version을 권장합니다.

Cloud DB for MySQL은 DB 서버 OS에 접속해서 `root@localhost`로 계정을 만드는 방식이 아닙니다. 콘솔의 `Cloud DB for MySQL > DB Server > Manage DB > Manage DB user`에서 DB User를 생성합니다.

DMS 작업 전에는 Target에 `board_service` 데이터베이스를 만들지 않습니다. Source와 같은 이름의 데이터베이스가 이미 있으면 DMS 작업을 시작할 수 없습니다. DB User만 다음과 같이 미리 생성합니다.

| USER_ID | HOST(IP) | DB 권한 | 암호 예시 | 용도 |
| --- | --- | --- | --- | --- |
| `board_admin` | 관리 서버 IP 대역 예: `10.10.10.%` | `DDL` | `BoardAdmin123!` | mysqldump 복원, 스키마 및 검증 작업 |
| `board_app` | Backend Subnet 예: `10.10.110.%` | `CRUD` | `BoardApp123!` | 마이그레이션 완료 후 Backend 연결 |

두 계정 모두 **시스템 테이블은 선택하지 않습니다**. `DDL`은 `CRUD`와 `READ`를 포함하고 테이블 생성·변경·삭제가 가능하며, `CRUD`는 게시글 조회·등록·수정·삭제에 사용합니다. DMS 작업 생성 화면에서는 별도 Target DB User를 입력하지 않고 생성한 Cloud DB Service를 Target으로 선택합니다.

계정 구분:

| 위치 | 계정 | 만드는 방법 |
| --- | --- | --- |
| Source Ubuntu DB | `dms_migration` | 위 MariaDB SQL로 생성, DMS Endpoint에서 사용 |
| Target Cloud DB for MySQL | `board_admin` | Console Manage DB user에서 `DDL`로 생성 |
| Target Cloud DB for MySQL | `board_app` | Console Manage DB user에서 `CRUD`로 생성 |

## 3. ACG 확인

Source DB inbound:

| 프로토콜 | 포트 | 접근 소스 |
| --- | --- | --- |
| TCP | `3306` | DMS/Cloud DB에서 Source DB로 접근하는 IP 또는 NAT Gateway IP |

Backend에서 Cloud DB로 전환할 때:

| 방향 | 포트 | 설명 |
| --- | --- | --- |
| 관리 서버 outbound / Cloud DB inbound | `3306` | `board_admin`으로 mysqldump 복원 및 검증 |
| Backend outbound | `3306` | Cloud DB 접속 |
| Cloud DB inbound | `3306` | Backend private IP 허용 |

## 4. 방법 A: DMS Endpoint 생성

```text
Database Migration Service
  -> Endpoint Management
  -> Source Endpoint 생성
```

입력값:

| 항목 | 예시 |
| --- | --- |
| Host | Source DB private IP |
| Port | `3306` |
| User | `dms_migration` |
| Password | migration user password |
| Database | `board_service` |

`Test Connection`을 먼저 통과시킵니다.

## 5. 방법 A: Migration 생성

```text
Database Migration Service
  -> Migration Management
  -> Migration 생성
```

Source Endpoint와 Target Cloud DB for MySQL을 선택하고 `board_service`를 이관합니다.

## 6. 방법 B: mysqldump 이관

정확한 이관을 위해 덤프 중에는 게시판 백엔드와 자동 게시글 생성을 잠시 멈춥니다.

```bash
sudo systemctl stop board-service-post-seeder || true
sudo systemctl stop board-service-backend
```

Source DB에서 덤프 파일 생성:

```bash
cd "017-cloud db migration/scripts"

SOURCE_DB_HOST='SOURCE_DB_PRIVATE_IP' \
SOURCE_DB_USER='board_app' \
SOURCE_DB_PASSWORD='BoardApp123!' \
DB_NAME='board_service' \
DUMP_FILE='/tmp/board_service.sql' \
./dump-source-db.sh
```

Cloud DB for MySQL에 복원:

```bash
TARGET_DB_HOST='db-xxxx.vpc-cdb.ntruss.com' \
TARGET_DB_USER='board_admin' \
TARGET_DB_PASSWORD='BoardAdmin123!' \
DUMP_FILE='/tmp/board_service.sql' \
./restore-target-db.sh
```

명령어를 직접 쓰면 아래와 같습니다.

```bash
MYSQL_PWD='SOURCE_PASSWORD' mysqldump \
  -h SOURCE_DB_PRIVATE_IP \
  -u board_app \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  --databases board_service \
  > /tmp/board_service.sql
```

```bash
MYSQL_PWD='BoardAdmin123!' mysql \
  -h db-xxxx.vpc-cdb.ntruss.com \
  -u board_admin \
  < /tmp/board_service.sql
```

## 7. 데이터 검증

```bash
SOURCE_DB_HOST='SOURCE_DB_PRIVATE_IP' \
SOURCE_DB_USER='board_app' \
SOURCE_DB_PASSWORD='BoardApp123!' \
TARGET_DB_HOST='db-xxxx.vpc-cdb.ntruss.com' \
TARGET_DB_USER='board_app' \
TARGET_DB_PASSWORD='BoardApp123!' \
DB_NAME='board_service' \
./compare-post-counts.sh
```

## 8. 백엔드 전환

```bash
sudo BACKEND_ENV_FILE='/opt/board-service-backend/.env' \
  DB_HOST='db-xxxx.vpc-cdb.ntruss.com' \
  DB_PORT='3306' \
  DB_USER='board_app' \
  DB_PASSWORD='BoardApp123!' \
  DB_NAME='board_service' \
  ./switch-backend-db.sh
```

확인:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/posts
```

## 참고

- 상세 자료는 저장소의 `017-cloud db migration/README.md`를 확인합니다.
