# 015 Database Backup Recovery

데이터베이스 백업 및 복구, 특히 **특정시점 복구(PITR, Point-in-Time Recovery)**를 실습하기 위한 예제입니다.

Ubuntu 서버에서 30초마다 MySQL 호환 데이터베이스로 테스트 데이터를 넣고, 이후 백업/복구 시점에 따라 어떤 데이터가 남거나 사라지는지 확인합니다.

## 실습 구조

```text
Ubuntu Server
  └─ ncp-db-writer systemd service
       └─ 30초마다 INSERT

MySQL 호환 DB
  └─ DB_NAME.recovery_events
```

이 예제는 NCP Cloud DB for MySQL, 직접 설치한 MySQL/MariaDB, Amazon RDS for MySQL 같은 MySQL 호환 DB에서 사용할 수 있습니다.

## 1. DB 준비

먼저 DB 서버에 로그인할 수 있는지 확인합니다. 이 단계는 “서버 접속 가능 여부”만 확인합니다.

```bash
mysql -h DB_HOST -P 3306 -u DB_USER -p
```

로그인이 된다고 해서 특정 데이터베이스 접근 권한까지 있는 것은 아닙니다. 아래처럼 DB 이름까지 지정해서 접속되는지 확인해야 합니다.

```bash
mysql -h DB_HOST -P 3306 -u DB_USER -p DB_NAME
```

DB와 테이블이 아직 없다면 DB 관리자 계정으로 접속해서 [sql/mysql_schema.sql](./sql/mysql_schema.sql)을 실행합니다.

```bash
mysql -h DB_HOST -P 3306 -u 관리자계정 -p < sql/mysql_schema.sql
```

또는 `configure`에 관리자 권한이 있는 계정을 입력했다면 스크립트로 기본 DB와 테이블을 만들 수 있습니다.

```bash
sudo ./scripts/db-writer.sh init-schema
```

기본 구성:

```text
Database: lecture_recovery_lab
User:     lecture_writer
Table:    recovery_events
```

Cloud DB에서 실습 계정이 이미 특정 DB에만 권한을 가진 경우가 있습니다. 예를 들어 `SHOW GRANTS` 결과에 아래처럼 나온다면:

```sql
GRANT ALL PRIVILEGES ON `lab5-db`.* TO `student`@`%`;
```

이 계정은 `lecture_recovery_lab`가 아니라 `lab5-db`를 써야 합니다. 이 경우 `configure`에서 `DB name`에 `lab5-db`를 입력합니다.

```text
DB name [lecture_recovery_lab]: lab5-db
```

테스트용 SQL에는 `lecture_writer` 사용자 비밀번호가 `ChangeThisStrongPassword!`로 들어 있습니다. 실습 환경에서는 반드시 다른 값으로 바꾸세요.

이미 존재하는 DB에 테이블만 만들고 싶다면 [sql/table_only.sql](./sql/table_only.sql)을 사용합니다.

```bash
mysql -h DB_HOST -P 3306 -u DB_USER -p DB_NAME < sql/table_only.sql
```

테이블 구조:

| Column | Description |
| --- | --- |
| `id` | 자동 증가 PK |
| `source_id` | 데이터를 보낸 서버 식별자 |
| `event_message` | 삽입된 테스트 메시지 |
| `metric_value` | 임의 숫자 값 |
| `created_at` | DB에 기록된 시각 |

## 2. Ubuntu 서버에 프로그램 설치

Ubuntu 서버에 이 저장소를 받은 뒤 006 폴더로 이동합니다.

```bash
cd "015-database backup recovery"
chmod +x scripts/db-writer.sh
sudo ./scripts/db-writer.sh install
```

설치 작업:

- MySQL 클라이언트 설치
- Python 3 및 venv 설치
- `/opt/ncp-db-writer`에 실행 프로그램 복사
- `pymysql` 설치
- `ncp-db-writer.service` systemd 서비스 등록

## 3. DB 접속정보 설정

```bash
sudo ./scripts/db-writer.sh configure
```

입력 항목:

```text
DB host
DB port
DB user
DB password
DB name
DB table
Source ID
Write interval seconds
```

설정은 `/etc/ncp-db-writer.env`에 저장됩니다. 비밀번호가 포함되므로 파일 권한은 `0600`으로 설정됩니다.

저장된 설정 확인:

```bash
sudo ./scripts/db-writer.sh show-config
```

비밀번호는 한 줄로 입력해야 합니다. 붙여넣기 과정에서 줄바꿈이나 제어문자가 섞이면 DB 로그인에 실패할 수 있으니, 인증 오류가 나면 `configure`를 다시 실행해 비밀번호를 직접 타이핑하세요.

## 4. 스크립트 명령어

이 실습은 `scripts/db-writer.sh` 하나로 설치, 설정, DB 접속, 데이터 전송, 서비스 관리를 수행합니다.

| Command | Description |
| --- | --- |
| `install` | Ubuntu 패키지, Python venv, MySQL 클라이언트, systemd 서비스를 설치합니다. |
| `configure` | DB 접속정보를 입력받아 `/etc/ncp-db-writer.env`에 저장합니다. |
| `configure-plain` | 비밀번호가 화면에 보이는 설정 모드입니다. 복사/붙여넣기 문제를 확인할 때 사용합니다. |
| `show-config` | 저장된 설정을 보여줍니다. 비밀번호는 마스킹됩니다. |
| `db-shell` | 저장된 설정으로 MySQL 콘솔에 바로 접속합니다. |
| `check` | 서버 로그인, DB 접근, 테이블 접근을 단계별로 확인합니다. |
| `init-schema` | 저장된 DB 이름에 `recovery_events` 테이블을 만듭니다. DB가 없으면 생성도 시도합니다. |
| `send-once` | 테스트 데이터를 한 건만 INSERT합니다. |
| `start` | 30초마다 데이터를 쓰는 systemd 서비스를 시작합니다. |
| `stop` | systemd 서비스를 중지합니다. |
| `restart` | systemd 서비스를 재시작합니다. |
| `status` | systemd 상태를 확인합니다. |
| `logs` | 서비스 로그를 실시간으로 봅니다. |

저장된 설정으로 직접 DB에 들어가려면 `mysql` 명령을 따로 조합하지 않고 아래처럼 실행합니다.

```bash
sudo ./scripts/db-writer.sh db-shell
```

## 5. 연결 테스트

서비스를 켜기 전에 접속 상태를 단계별로 확인합니다.

```bash
sudo ./scripts/db-writer.sh check
```

`check`는 다음을 분리해서 확인합니다.

- MySQL 서버 로그인 가능 여부
- 설정한 데이터베이스 존재 및 접근 가능 여부
- 설정한 테이블 조회 가능 여부

문제가 없다면 한 건만 넣어 봅니다.

```bash
sudo ./scripts/db-writer.sh send-once
```

DB에서 확인:

```sql
SELECT id, source_id, event_message, metric_value, created_at
FROM recovery_events
ORDER BY id DESC
LIMIT 5;
```

## 6. 30초마다 데이터 넣기 시작

```bash
sudo ./scripts/db-writer.sh start
```

상태 확인:

```bash
sudo ./scripts/db-writer.sh status
```

로그 확인:

```bash
sudo ./scripts/db-writer.sh logs
```

중지:

```bash
sudo ./scripts/db-writer.sh stop
```

재시작:

```bash
sudo ./scripts/db-writer.sh restart
```

## 7. 특정시점 복구 실습 흐름

1. DB와 테이블을 생성합니다.
2. Ubuntu 서버에서 `ncp-db-writer`를 시작합니다.
3. 2~3분 정도 기다려 데이터가 쌓이는지 확인합니다.
4. 현재 시각을 기록합니다.
5. 일부 데이터를 삭제하거나 테이블을 잘못 수정합니다.
6. DB 콘솔에서 특정시점 복구를 실행해 기록한 시각 직전/직후로 복구합니다.
7. `recovery_events`의 row 수와 `created_at` 값을 비교합니다.

예시 확인 SQL:

```sql
SELECT COUNT(*) AS total_rows FROM recovery_events;

SELECT MIN(created_at) AS first_event, MAX(created_at) AS last_event
FROM recovery_events;

SELECT *
FROM recovery_events
ORDER BY id DESC
LIMIT 10;
```

## 8. 트러블슈팅

DB 접속 실패:

- DB host/port가 맞는지 확인합니다.
- DB 보안그룹 또는 ACG에서 Ubuntu 서버의 접속을 허용했는지 확인합니다.
- DB 사용자 권한이 `INSERT`, `SELECT`를 포함하는지 확인합니다.
- `mysql -h DB_HOST -P 3306 -u DB_USER -p DB_NAME`으로 직접 접속이 되는지 확인합니다.
- 직접 접속은 되는데 스크립트만 실패하면 `sudo ./scripts/db-writer.sh configure`를 다시 실행해 비밀번호를 직접 타이핑합니다.

`Access denied for user 'USER'@'%' to database 'DB_NAME'`:

- MySQL 서버 로그인은 성공했지만 해당 데이터베이스 권한이 없는 상태입니다.
- DB가 아직 없거나, 현재 사용자에게 `DB_NAME` 권한이 부여되지 않았을 때 발생합니다.
- `SHOW GRANTS FOR CURRENT_USER();`로 어떤 DB에 권한이 있는지 확인합니다.
- 이미 권한이 있는 DB가 있다면 `sudo ./scripts/db-writer.sh configure`를 다시 실행해서 `DB name`을 그 DB 이름으로 바꿉니다.
- 관리자 계정으로 `sql/mysql_schema.sql`을 실행하거나, 현재 계정에 `SELECT`, `INSERT` 권한을 부여하세요.

서비스가 실행되지 않음:

```bash
sudo ./scripts/db-writer.sh status
sudo ./scripts/db-writer.sh logs
```

설정 변경 후에는 재시작합니다.

```bash
sudo ./scripts/db-writer.sh configure
sudo ./scripts/db-writer.sh restart
```
