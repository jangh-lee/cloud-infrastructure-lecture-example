# 015 Cloud DB for MySQL 생성 및 연결

## 목표

003에서 Ubuntu DB 서버에 직접 설치했던 MariaDB를 Naver Cloud의 관리형 `Cloud DB for MySQL`로 교체합니다. Cloud DB 생성부터 Backend 연결 변경, 게시글 등록까지 확인합니다.

```text
Public ALB
  -> Web Server
  -> Backend Server
  -> Cloud DB for MySQL
```

!!! note "이번 실습은 마이그레이션이 아닙니다"
    빈 Cloud DB에 게시판 스키마를 새로 만들고 Backend 연결을 변경합니다. 기존 Ubuntu DB의 게시글을 옮기는 작업은 [017 Cloud DB Migration](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/017-cloud-db-migration/)에서 진행합니다. 검증이 끝날 때까지 기존 DB 서버를 삭제하지 않습니다.

## 1. 운영형 이름과 계정 분리

챕터 번호는 강의 순서일 뿐 서비스 역할을 설명하지 못합니다. 이 실습부터 DB와 계정에는 게시판 서비스의 역할이 드러나는 이름을 사용합니다.

| 구분 | 실습 값 | 역할 |
| --- | --- | --- |
| DB Service 이름 | `board-service` | 같은 데이터를 가진 DB 서버 그룹 |
| DB Server 이름 | `board-mysql` | 실제 MySQL 서버 |
| Private Sub Domain | `board-db` | VPC 내부 접속 도메인 식별자 |
| Database | `board_service` | 게시판 테이블을 저장하는 스키마 |
| 관리 계정 | `board_admin` | 테이블 생성·변경용 DDL 계정 |
| 애플리케이션 계정 | `board_app` | Backend가 사용하는 CRUD 계정 |
| 관리 계정 암호 예시 | `BoardAdmin123!` | 콘솔 생성 시 입력 |
| 앱 계정 암호 예시 | `BoardApp123!` | Backend `.env`에 입력 |

Backend에 관리자 계정을 넣지 않습니다. 스키마 작업은 `board_admin`, 게시글 조회·등록·삭제는 `board_app`으로 분리해 필요한 권한만 부여합니다.

## 2. 시작 전 확인

003 게시판에서 Web과 Backend가 정상인지 먼저 확인합니다.

```bash
curl -fsS http://127.0.0.1:4000/api/health
curl -fsS http://127.0.0.1:4000/api/posts
```

콘솔과 Backend 서버에서 다음 값을 기록합니다.

| 확인 값 | 예시 |
| --- | --- |
| 003에서 사용한 VPC | `lab-vpc` |
| DB 전용 Subnet | `10.10.120.0/24` |
| Backend Private IP | `10.10.110.7` |
| Backend ACG | `lab-backend-acg` |
| Backend Subnet 대역 | `10.10.110.0/24` |

Backend와 Cloud DB는 같은 VPC의 사설 네트워크로 통신합니다. Public 도메인은 만들지 않습니다.

## 3. Step 1 - Cloud DB for MySQL 생성

Naver Cloud Console에서 **Services > Database > Cloud DB for MySQL > DB Server > DB Server 생성**으로 이동합니다.

### 서버 설정

| 항목 | 실습 값 |
| --- | --- |
| DB 엔진 | MySQL `8.0` |
| 고가용성 | 실습 비용 절감을 위해 사용 안 함 |
| Multi Zone | 사용 안 함 |
| VPC | 003 게시판과 같은 VPC |
| Subnet | DB 전용 Subnet |
| DB Server 타입 | 실습 가능한 최소 사양 |
| 데이터 스토리지 | SSD, 기본 용량 |
| DB Server 이름 | `board-mysql` |
| DB Service 이름 | `board-service` |
| Private Sub Domain | `board-db` |

고가용성을 켜면 Master와 Standby Master가 함께 만들어져 비용이 증가합니다. 운영 환경에서는 장애 복구 요구사항에 따라 HA와 Multi Zone을 검토하지만 이번 연결 실습에서는 단일 서버를 사용합니다.

### DB 설정

| 항목 | 실습 값 |
| --- | --- |
| USER_ID | `board_admin` |
| HOST(IP) | Backend Subnet 예: `10.10.110.%` |
| USER 암호 | `BoardAdmin123!` |
| DB 접속 포트 | `3306` |
| DB Data Load | 신규 생성 |
| 기본 DB 명 | `board_service` |
| Backup | 사용, 보관 기간 `7일`, 시간 자동 |

암호는 8~20자이며 영문, 숫자, 허용된 특수문자를 각각 포함해야 합니다. 실제 수업에서는 예시 암호를 그대로 운영 환경에 사용하지 않습니다.

**최종확인 > 생성**을 누른 뒤 DB Server 상태가 `운영중`이 될 때까지 기다립니다. 생성에는 수분 이상 걸릴 수 있습니다.

### 확인하고 넘어가기

- [ ] DB Server 상태가 `운영중`입니다.
- [ ] 기본 DB 이름이 `board_service`입니다.
- [ ] Private 도메인과 접속 포트를 기록했습니다.

## 4. Step 2 - Cloud DB ACG 설정

Cloud DB 생성 시 자동 생성된 ACG를 선택하고 **ACG 설정**을 누릅니다.

| 프로토콜 | 접근 소스 | 허용 포트 |
| --- | --- | --- |
| TCP | 003 Backend ACG 이름 | `3306` |

ACG는 네트워크 연결을 허용하고 DB User의 `HOST(IP)`는 MySQL 로그인을 허용합니다. 둘 중 하나만 맞아도 접속할 수 없으므로 두 설정을 함께 확인합니다.

!!! warning "Web ACG를 허용하지 않습니다"
    DB에 접속하는 주체는 Web 서버가 아니라 Backend 서버입니다. Cloud DB ACG의 접근 소스는 Backend ACG로 제한합니다.

## 5. Step 3 - 애플리케이션 DB User 생성

Cloud DB Server를 선택하고 **DB 관리 > DB User 관리**로 이동해 사용자를 추가합니다.

| 항목 | 값 |
| --- | --- |
| USER_ID | `board_app` |
| HOST(IP) | Backend Subnet 예: `10.10.110.%` |
| DB 권한 | `CRUD` |
| 암호 | `BoardApp123!` |
| 시스템 테이블 | 선택 안 함 |

`CRUD`는 게시글 조회·등록·수정·삭제에 필요한 권한입니다. 테이블 생성은 `board_admin`이 담당하므로 앱 계정에 DDL 권한을 주지 않습니다. 저장 후 DB 상태가 다시 `운영중`이 될 때까지 기다립니다.

## 6. Step 4 - Backend에서 네트워크와 로그인 확인

Backend 서버에 접속해 MySQL 클라이언트를 설치합니다.

```bash
sudo apt-get update
sudo apt-get install -y default-mysql-client
```

Private 도메인과 실제 암호를 입력합니다. 이후 명령은 같은 터미널에서 실행합니다.

```bash
DB_HOST="YOUR_PRIVATE_DOMAIN"
DB_PORT="3306"
DB_ADMIN_USER="board_admin"
DB_ADMIN_PASSWORD='BoardAdmin123!'
DB_APP_USER="board_app"
DB_APP_PASSWORD='BoardApp123!'
DB_NAME="board_service"
```

DNS와 TCP 연결을 먼저 확인합니다.

```bash
getent hosts "$DB_HOST"
timeout 3 bash -c "</dev/tcp/$DB_HOST/$DB_PORT" && echo "PASS: TCP connected"
```

관리 계정 로그인을 확인합니다.

```bash
MYSQL_PWD="$DB_ADMIN_PASSWORD" mysql \
  -h "$DB_HOST" -P "$DB_PORT" \
  -u "$DB_ADMIN_USER" "$DB_NAME" \
  -e "SELECT DATABASE(), CURRENT_USER(), VERSION();"
```

`DATABASE()`가 `board_service`이고 `CURRENT_USER()`에 `board_admin`이 보이면 다음 단계로 이동합니다.

## 7. Step 5 - 게시판 스키마 생성

최신 스키마 파일을 내려받고 `board_admin`으로 실행합니다.

```bash
SCHEMA_FILE="/tmp/board-service-schema.sql"

curl -fsSL \
  "https://raw.githubusercontent.com/jangh-lee/cloud-infrastructure-lecture-example/main/015-cloud%20db%20mysql/sql/board-service-schema.sql" \
  -o "$SCHEMA_FILE"

MYSQL_PWD="$DB_ADMIN_PASSWORD" mysql \
  -h "$DB_HOST" -P "$DB_PORT" \
  -u "$DB_ADMIN_USER" "$DB_NAME" \
  < "$SCHEMA_FILE"
```

이 파일은 `posts` 테이블과 확인용 게시글 한 건을 생성합니다. 다시 실행해도 같은 확인용 글을 중복으로 넣지 않습니다.

앱 계정으로 읽을 수 있는지 확인합니다.

```bash
MYSQL_PWD="$DB_APP_PASSWORD" mysql \
  -h "$DB_HOST" -P "$DB_PORT" \
  -u "$DB_APP_USER" "$DB_NAME" \
  -e "SHOW TABLES; SELECT id, title, author_name, created_at FROM posts ORDER BY id DESC LIMIT 5;"
```

### 확인하고 넘어가기

- [ ] `posts` 테이블이 출력됩니다.
- [ ] `Cloud DB 연결 완료` 게시글이 출력됩니다.
- [ ] 접속 계정은 `board_app`이며 관리자 계정을 사용하지 않았습니다.

## 8. Step 6 - Backend DB 연결 전환

003 저장소의 Backend `.env`를 백업한 뒤 Cloud DB 값으로 바꿉니다.

```bash
cd ~/cloud-infrastructure-lecture-example/"003-three tier web app"/backend

sudo cp .env .env.before-cloud-db
sudo sed -i \
  -e "s|^DB_HOST=.*|DB_HOST=$DB_HOST|" \
  -e "s|^DB_PORT=.*|DB_PORT=$DB_PORT|" \
  -e "s|^DB_NAME=.*|DB_NAME=$DB_NAME|" \
  -e "s|^DB_USER=.*|DB_USER=$DB_APP_USER|" \
  -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$DB_APP_PASSWORD|" \
  .env

sudo ./install-backend.sh configure
```

설정값과 서비스 상태를 확인합니다.

```bash
sudo grep -E '^DB_(HOST|PORT|NAME|USER)=' /opt/board-service-backend/.env
sudo systemctl is-active board-service-backend
curl -fsS http://127.0.0.1:4000/api/health
curl -fsS http://127.0.0.1:4000/api/posts
```

다음 값이 확인되면 Backend 전환이 완료된 것입니다.

```text
DB_NAME=board_service
DB_USER=board_app
{"status":"ok","service":"board-service-backend",...}
```

## 9. Step 7 - ALB에서 게시글 등록 검증

브라우저에서 003 게시판의 Public ALB 주소로 접속합니다.

1. 기존 목록에 `Cloud DB 연결 완료` 글이 표시되는지 확인합니다.
2. 제목에 `Cloud DB 최종 확인`을 입력합니다.
3. 본문과 작성자를 입력하고 **글쓰기**를 누릅니다.
4. 새 글이 화면에 즉시 나타나는지 확인합니다.

Cloud DB에서도 같은 글을 확인합니다.

```bash
MYSQL_PWD="$DB_APP_PASSWORD" mysql \
  -h "$DB_HOST" -P "$DB_PORT" \
  -u "$DB_APP_USER" "$DB_NAME" \
  -e "SELECT id, title, author_name, created_at FROM posts ORDER BY id DESC LIMIT 10;"
```

브라우저와 SQL 양쪽에서 같은 게시글이 보이면 `ALB -> Web -> Backend -> Cloud DB` 전체 경로가 검증된 것입니다.

## 10. 장애 확인

| 증상 | 확인할 항목 |
| --- | --- |
| `getent hosts` 실패 | Private 도메인 오타, 같은 VPC인지 확인 |
| TCP 연결 실패 | Cloud DB 상태 `운영중`, ACG 접근 소스가 Backend ACG인지 확인 |
| `Access denied` | `board_app` HOST가 Backend IP 대역을 허용하는지 확인 |
| `Unknown database` | 기본 DB 명이 `board_service`인지 확인 |
| `Table 'posts' doesn't exist` | Step 5 스키마 SQL을 `board_admin`으로 실행 |
| Backend health `500` | `/opt/board-service-backend/.env`, Backend 로그 확인 |
| 브라우저 글 등록 `500` | `board_app` CRUD 권한과 Backend 로그 확인 |

Backend 로그:

```bash
sudo journalctl -u board-service-backend -n 100 --no-pager
sudo journalctl -u board-service-backend -f
```

## 11. 롤백

Cloud DB 연결에 실패하면 저장해 둔 기존 설정으로 돌아갑니다.

```bash
cd ~/cloud-infrastructure-lecture-example/"003-three tier web app"/backend
sudo cp .env.before-cloud-db .env
sudo ./install-backend.sh configure
curl -fsS http://127.0.0.1:4000/api/health
```

## 12. 실습 종료와 다음 단계

016 백업·복구 실습을 이어서 진행한다면 Cloud DB와 Backend를 유지합니다. 모든 DB 실습이 끝난 경우에만 DB Server의 반납 보호를 해제하고 삭제합니다. Cloud DB는 서버가 운영되는 동안 과금되며, HA를 사용하면 서버가 두 대 구성됩니다.

- [016 Database 백업 및 복구](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/016-database-backup-recovery/)
- [017 Cloud DB Migration](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/017-cloud-db-migration/)

## 공식 문서

- [Cloud DB for MySQL 시나리오](https://guide.ncloud-docs.com/docs/clouddbformysql-procedure)
- [Cloud DB for MySQL DB Server 생성](https://guide.ncloud-docs.com/docs/database-database-5-2)
- [Cloud DB for MySQL 시작 및 접속](https://guide.ncloud-docs.com/docs/clouddbformysql-start)
