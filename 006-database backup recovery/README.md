# 006 Database Backup Recovery

데이터베이스 백업 및 복구, 특히 **특정시점 복구(PITR, Point-in-Time Recovery)**를 실습하기 위한 예제입니다.

Ubuntu 서버에서 30초마다 MySQL 호환 데이터베이스로 테스트 데이터를 넣고, 이후 백업/복구 시점에 따라 어떤 데이터가 남거나 사라지는지 확인합니다.

## 실습 구조

```text
Ubuntu Server
  └─ ncp-db-writer systemd service
       └─ 30초마다 INSERT

MySQL 호환 DB
  └─ lecture_recovery_lab.recovery_events
```

이 예제는 NCP Cloud DB for MySQL, 직접 설치한 MySQL/MariaDB, Amazon RDS for MySQL 같은 MySQL 호환 DB에서 사용할 수 있습니다.

## 1. DB 준비

DB 관리자 계정으로 접속해서 [sql/mysql_schema.sql](./sql/mysql_schema.sql)을 실행합니다.

```bash
mysql -h DB_HOST -P 3306 -u 관리자계정 -p < sql/mysql_schema.sql
```

생성되는 기본 구성:

```text
Database: lecture_recovery_lab
User:     lecture_writer
Table:    recovery_events
```

테스트용 SQL에는 `lecture_writer` 사용자 비밀번호가 `ChangeThisStrongPassword!`로 들어 있습니다. 실습 환경에서는 반드시 다른 값으로 바꾸세요.

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
cd "006-database backup recovery"
chmod +x scripts/db-writer.sh
sudo ./scripts/db-writer.sh install
```

설치 작업:

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

## 4. 연결 테스트

서비스를 켜기 전에 한 건만 넣어 봅니다.

```bash
sudo ./scripts/db-writer.sh send-once
```

DB에서 확인:

```sql
SELECT id, source_id, event_message, metric_value, created_at
FROM lecture_recovery_lab.recovery_events
ORDER BY id DESC
LIMIT 5;
```

## 5. 30초마다 데이터 넣기 시작

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

## 6. 특정시점 복구 실습 흐름

1. DB와 테이블을 생성합니다.
2. Ubuntu 서버에서 `ncp-db-writer`를 시작합니다.
3. 2~3분 정도 기다려 데이터가 쌓이는지 확인합니다.
4. 현재 시각을 기록합니다.
5. 일부 데이터를 삭제하거나 테이블을 잘못 수정합니다.
6. DB 콘솔에서 특정시점 복구를 실행해 기록한 시각 직전/직후로 복구합니다.
7. `recovery_events`의 row 수와 `created_at` 값을 비교합니다.

예시 확인 SQL:

```sql
SELECT COUNT(*) AS total_rows FROM lecture_recovery_lab.recovery_events;

SELECT MIN(created_at) AS first_event, MAX(created_at) AS last_event
FROM lecture_recovery_lab.recovery_events;

SELECT *
FROM lecture_recovery_lab.recovery_events
ORDER BY id DESC
LIMIT 10;
```

## 7. 트러블슈팅

DB 접속 실패:

- DB host/port가 맞는지 확인합니다.
- DB 보안그룹 또는 ACG에서 Ubuntu 서버의 접속을 허용했는지 확인합니다.
- DB 사용자 권한이 `INSERT`, `SELECT`를 포함하는지 확인합니다.

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

