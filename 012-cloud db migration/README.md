# 012 Cloud DB for MySQL Migration

007번 게시판 실습에서 Ubuntu 서버에 직접 설치한 MariaDB/MySQL 데이터를 Naver Cloud `Cloud DB for MySQL`로 마이그레이션하는 실습입니다.

이 챕터에서는 두 가지 방식으로 Source DB에서 Target DB로 데이터를 옮기는 방법을 소개합니다.

- 방법 A: Naver Cloud Database Migration Service(DMS)
- 방법 B: `mysqldump` 파일 백업/복원

마이그레이션 후에는 백엔드 API 서버의 `.env`를 Cloud DB 주소로 바꿔 애플리케이션이 그대로 동작하는지 확인합니다.

> 용어 정정: 데이터베이스 구조 설명은 보통 `EDR`이 아니라 `ERD(Entity Relationship Diagram)`라고 부릅니다.

## 1. 목표 구조

마이그레이션 전:

```text
사용자
  -> Web Server
  -> Backend API Server
  -> Ubuntu DB Server(MariaDB/MySQL)
```

마이그레이션 후:

```text
사용자
  -> Web Server
  -> Backend API Server
  -> Cloud DB for MySQL
```

방법 A. DMS 작업 흐름:

```text
Source DB 사전 설정
  -> Cloud DB for MySQL 생성
  -> ACG 접근 허용
  -> DMS Endpoint 생성
  -> DMS Migration 생성 및 실행
  -> 데이터 검증
  -> Backend .env의 DB_HOST 전환
```

방법 B. mysqldump 작업 흐름:

```text
Source DB 데이터 변경 중지 또는 점검 시간 확보
  -> mysqldump로 SQL 파일 생성
  -> SQL 파일을 Target Cloud DB에 복원
  -> 데이터 검증
  -> Backend .env의 DB_HOST 전환
```

## 1-1. DMS와 mysqldump 비교

| 방식 | 적합한 상황 | 장점 | 주의점 |
| --- | --- | --- | --- |
| DMS | 운영 중인 DB를 Cloud DB로 옮기고 싶을 때 | 콘솔 기반, 연결 테스트 제공, 변경분 이관 시나리오 설명에 적합 | Source DB binlog, 계정 권한, ACG 설정이 필요 |
| mysqldump | 작은 DB를 단순하게 백업/복원하고 싶을 때 | 원리가 쉽고 파일로 남기기 좋음, 백업/복구 수업에 적합 | 덤프 시점 이후 변경분은 자동 반영되지 않음 |

수업에서는 둘 다 보여주는 것이 좋습니다. DMS는 클라우드 관리형 마이그레이션을 설명하기 좋고, `mysqldump`는 데이터베이스 백업 파일이 실제로 어떻게 만들어지고 복원되는지 이해시키기 좋습니다.

## 2. 게시판 ERD

현재 게시판 예제는 로그인/회원 기능 없이 게시글만 저장합니다. 따라서 핵심 테이블은 `posts` 하나입니다.

```text
posts
-----
id PK
title
content
author_name
created_at
```

Mermaid ERD:

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

## 3. 데이터 사전

데이터베이스 이름 기본값:

```text
chapter3_board
```

테이블:

| 테이블 | 설명 |
| --- | --- |
| `posts` | 게시판 글 목록을 저장합니다. |

컬럼:

| 컬럼 | 타입 | Null | Key | 기본값 | 설명 |
| --- | --- | --- | --- | --- | --- |
| `id` | `BIGINT` | `NO` | `PK` | `AUTO_INCREMENT` | 게시글 고유 번호 |
| `title` | `VARCHAR(200)` | `NO` |  |  | 게시글 제목 |
| `content` | `TEXT` | `NO` |  |  | 게시글 본문 |
| `author_name` | `VARCHAR(100)` | `NO` |  | `비가입 유저` | 작성자 표시 이름 |
| `created_at` | `TIMESTAMP` | `NO` |  | `CURRENT_TIMESTAMP` | 게시글 생성 시각 |

DDL:

```sql
CREATE DATABASE IF NOT EXISTS `chapter3_board`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `chapter3_board`;

CREATE TABLE IF NOT EXISTS posts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  author_name VARCHAR(100) NOT NULL DEFAULT '비가입 유저',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
```

## 4. Source DB 사전 설정

DMS가 Source DB를 읽으려면 보통 아래 준비가 필요합니다.

- Source DB에서 외부 접속 허용
- Source DB 바이너리 로그 활성화
- 마이그레이션 전용 계정 생성
- DMS 또는 Cloud DB 쪽에서 Source DB `3306/tcp`로 접근 가능하도록 ACG 허용

Source DB 서버에서:

```bash
cd "012-cloud db migration/scripts"
sudo SOURCE_DB_ROOT_PASSWORD='DB_ROOT_PASSWORD' \
  MIGRATION_USER='dms_migration' \
  MIGRATION_PASSWORD='ChangeMigrationPassword123!' \
  SOURCE_DATABASE='chapter3_board' \
  ./prepare-source-db.sh
```

스크립트가 하는 일:

- MariaDB/MySQL 설정 파일에 DMS용 바이너리 로그 설정 추가
- `server-id=1`
- `log_bin`
- `binlog_format=ROW`
- `expire_logs_days=5`
- 마이그레이션 계정 생성 및 권한 부여
- DB 서비스 재시작

확인:

```bash
sudo SOURCE_DB_ROOT_PASSWORD='DB_ROOT_PASSWORD' ./check-source-db.sh
```

Source DB의 binlog 설정, 마이그레이션 관련 전역 권한, `chapter3_board` 스키마 권한과 현재 게시글 범위를 한 번에 확인하려면 다음 SQL을 실행합니다.

```bash
cd "012-cloud db migration"
sudo mariadb -u root \
  -p chapter3_board \
  < sql/source-readiness.sql
```

결과에서 최소한 다음 항목을 확인합니다.

- `server_id`가 `0`이 아닌지
- `log_bin=ON`, `binlog_format=ROW`인지
- `SHOW MASTER STATUS` 결과가 비어 있지 않은지
- 마이그레이션 계정에 복제 관련 권한과 `chapter3_board` 조회 권한이 있는지
- `posts` 테이블과 이관할 게시글이 실제로 존재하는지

## 5. ACG 확인

DMS 연결 테스트가 실패하면 대부분 네트워크 또는 권한 문제입니다.

Source DB 서버 ACG inbound:

| 프로토콜 | 포트 | 접근 소스 |
| --- | --- | --- |
| TCP | `3306` | DMS/Cloud DB가 Source DB로 접근할 때 사용하는 대역 또는 NAT Gateway IP |

Target Cloud DB ACG outbound:

| 프로토콜 | 포트 | 목적지 |
| --- | --- | --- |
| TCP | `3306` | Source DB private IP 또는 Source DB 대역 |

수업에서는 Source DB와 Cloud DB가 같은 VPC에 있으면 private IP 기준으로 접근시키는 편이 이해하기 쉽습니다.

## 6. Cloud DB for MySQL 생성

콘솔에서 Target DB를 생성합니다.

```text
Naver Cloud Console
  -> VPC
  -> Cloud DB for MySQL
  -> DB Server 생성
```

권장:

- Source DB와 같은 VPC 또는 통신 가능한 VPC
- Source DB와 같은 MySQL/MariaDB major version 권장
- DB 포트: `3306`
- DB User/Password는 실습용으로 명확하게 기록
- Private domain 예: `db-xxxx.vpc-cdb.ntruss.com`

## 7. 방법 A: DMS Endpoint 생성

```text
Naver Cloud Console
  -> Database Migration Service
  -> Endpoint Management
  -> Endpoint 생성
```

입력값 예시:

| 항목 | 값 |
| --- | --- |
| Endpoint 이름 | `src-board-db` |
| DB 종류 | MySQL 또는 MariaDB |
| Source DB Host | Source DB private IP |
| Port | `3306` |
| User | `dms_migration` |
| Password | `ChangeMigrationPassword123!` |
| Database | `chapter3_board` |

`Test Connection`을 눌러 연결이 되는지 먼저 확인합니다.

## 8. 방법 A: DMS Migration 생성

```text
Naver Cloud Console
  -> Database Migration Service
  -> Migration Management
  -> Migration 생성
```

입력값 예시:

| 항목 | 값 |
| --- | --- |
| Source Endpoint | `src-board-db` |
| Target DB | 생성한 Cloud DB for MySQL |
| Migration 대상 DB | `chapter3_board` |
| Migration 방식 | 콘솔 옵션에 따라 전체 이관 또는 변경분 포함 이관 |

마이그레이션 작업이 완료되면 반드시 완료 상태를 확인합니다. 콘솔에서 마이그레이션 작업을 종료/완료 처리해야 계속 실행 중으로 남지 않습니다.

## 9. 방법 B: mysqldump로 이관

`mysqldump` 방식은 Source DB의 내용을 SQL 파일로 저장한 뒤 Target Cloud DB for MySQL에 복원하는 방식입니다.

이 방식은 DMS보다 단순하지만, 덤프를 뜬 이후 Source DB에 새로 들어온 데이터는 자동으로 Target DB에 반영되지 않습니다. 정확한 실습을 위해서는 아래 중 하나를 선택합니다.

- 게시판 백엔드와 자동 게시글 생성 서비스를 잠시 중지한 뒤 덤프
- 수업용이라면 덤프 시점 이후 데이터는 누락될 수 있음을 설명하고 진행

백엔드와 자동 게시글 생성을 잠시 멈추는 예시:

```bash
sudo systemctl stop chapter3-post-seeder || true
sudo systemctl stop chapter3-backend
```

Source DB에서 덤프 파일 생성:

```bash
cd "012-cloud db migration/scripts"

SOURCE_DB_HOST='SOURCE_DB_PRIVATE_IP' \
SOURCE_DB_USER='chapter3_user' \
SOURCE_DB_PASSWORD='ChangeThisPassword123!' \
DB_NAME='chapter3_board' \
DUMP_FILE='/tmp/chapter3_board.sql' \
./dump-source-db.sh
```

Cloud DB for MySQL에 복원:

```bash
TARGET_DB_HOST='db-xxxx.vpc-cdb.ntruss.com' \
TARGET_DB_USER='TARGET_USER' \
TARGET_DB_PASSWORD='TARGET_PASSWORD' \
DUMP_FILE='/tmp/chapter3_board.sql' \
./restore-target-db.sh
```

복원 후 백엔드는 다시 켤 수 있습니다. 단, DB 전환 전이라면 기존 Source DB로 다시 쓰게 됩니다.

```bash
sudo systemctl start chapter3-backend
sudo systemctl start chapter3-post-seeder || true
```

`mysqldump` 명령어를 직접 쓰면 아래와 같습니다.

```bash
MYSQL_PWD='SOURCE_PASSWORD' mysqldump \
  -h SOURCE_DB_PRIVATE_IP \
  -u chapter3_user \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  --databases chapter3_board \
  > /tmp/chapter3_board.sql
```

복원 명령어:

```bash
MYSQL_PWD='TARGET_PASSWORD' mysql \
  -h db-xxxx.vpc-cdb.ntruss.com \
  -u TARGET_USER \
  < /tmp/chapter3_board.sql
```

## 10. 마이그레이션 검증

Source DB와 Target DB의 데이터 수와 내용 지문을 비교합니다.

```bash
cd "012-cloud db migration/scripts"

SOURCE_DB_HOST='SOURCE_DB_PRIVATE_IP' \
SOURCE_DB_USER='chapter3_user' \
SOURCE_DB_PASSWORD='ChangeThisPassword123!' \
TARGET_DB_HOST='db-xxxx.vpc-cdb.ntruss.com' \
TARGET_DB_USER='TARGET_USER' \
TARGET_DB_PASSWORD='TARGET_PASSWORD' \
DB_NAME='chapter3_board' \
./compare-post-counts.sh
```

스크립트는 다음 항목을 함께 비교하며 하나라도 다르면 종료 코드 `2`를 반환합니다.

- `posts` 컬럼 구조
- 전체 행 수
- 첫 번째·마지막 게시글 ID
- 모든 게시글의 제목, 본문, 작성자, 작성 시각을 반영한 체크섬
- 불일치가 발생한 게시글 ID와 행별 제목 길이·본문 길이·체크섬

체크섬은 빠른 실습 검증을 위한 값입니다. 백업 보존이나 법적 무결성 증명에 사용하는 암호학적 해시는 아닙니다.

직접 확인:

```bash
mysql -h SOURCE_DB_PRIVATE_IP -u chapter3_user -p chapter3_board \
  -e "SELECT COUNT(*) AS source_posts FROM posts;"

mysql -h db-xxxx.vpc-cdb.ntruss.com -u TARGET_USER -p chapter3_board \
  -e "SELECT COUNT(*) AS target_posts FROM posts;"
```

각 DB의 스키마, ID·시간 범위, 체크섬, 빈 값·미래 시각 같은 이상 데이터, 중복 후보, 최신 10건의 실제 제목·본문과 작성자별 건수를 직접 확인하려면 동일한 SQL을 Source와 Target에 각각 실행합니다.

```bash
cd "012-cloud db migration"

mysql -h SOURCE_DB_PRIVATE_IP \
  -u chapter3_user \
  -p chapter3_board \
  < sql/migration-validation.sql

mysql -h db-xxxx.vpc-cdb.ntruss.com \
  -u TARGET_USER \
  -p chapter3_board \
  < sql/migration-validation.sql
```

DMS로 변경분까지 이관하는 동안에는 Source에 쓰기가 계속 발생할 수 있으므로 일시적으로 값이 다를 수 있습니다. 최종 전환 직전에는 게시판 백엔드와 자동 게시글 생성기를 중지하고, DMS 지연이 `0`이 된 뒤 다시 검증해야 합니다. `mysqldump` 방식은 덤프를 만든 시점부터 Source 쓰기를 중지한 상태에서 비교해야 합니다.

## 11. Backend DB_HOST 전환

백엔드 서버에서 `.env`의 DB 접속 정보를 Cloud DB로 바꿉니다.

```bash
cd "012-cloud db migration/scripts"

sudo BACKEND_ENV_FILE='/opt/chapter3-backend/.env' \
  DB_HOST='db-xxxx.vpc-cdb.ntruss.com' \
  DB_PORT='3306' \
  DB_USER='TARGET_USER' \
  DB_PASSWORD='TARGET_PASSWORD' \
  DB_NAME='chapter3_board' \
  ./switch-backend-db.sh
```

스크립트는 `.env`를 수정하고 `chapter3-backend` 서비스를 재시작합니다.

확인:

```bash
curl http://localhost:4000/api/health
curl http://localhost:4000/api/posts
sudo systemctl status chapter3-backend --no-pager
```

## 12. 장애 확인 포인트

### DMS Test Connection 실패

- Source DB ACG inbound `3306/tcp` 확인
- Source DB `bind-address=0.0.0.0` 또는 private IP 확인
- migration user 비밀번호 확인
- `mysql -h SOURCE_DB_PRIVATE_IP -u dms_migration -p` 직접 접속 확인

### Migration 실패

- binary log 활성화 확인
- `server-id` 설정 확인
- Source DB와 Target DB major version 차이 확인
- 마이그레이션 계정 권한 확인

### 앱 전환 후 API 실패

- 백엔드 `.env`의 `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` 확인
- Backend 서버 ACG outbound에서 Cloud DB `3306/tcp` 접근 가능한지 확인
- Cloud DB ACG inbound에서 Backend 서버 private IP 허용 여부 확인

### mysqldump 실패

- Source DB 접속 정보 확인
- Source DB ACG inbound `3306/tcp` 확인
- `mysqldump` 패키지 설치 여부 확인
- Target Cloud DB 계정에 DB 생성/테이블 생성 권한이 있는지 확인
- Source와 Target의 MySQL/MariaDB 버전 차이 확인

## 13. 참고 자료

- Naver Cloud Database Migration Service 개요: <https://guide.ncloud-docs.com/docs/en/dms-overview>
- Naver Cloud Database Migration Service 사전 조건: <https://guide.ncloud-docs.com/docs/en/dms-spec>
- 참고 블로그: <https://kclouder.tistory.com/8>
