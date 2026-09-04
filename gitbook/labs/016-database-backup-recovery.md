# 016 Database 백업 및 복구

## 목표

Ubuntu 서버에서 30초마다 MySQL 호환 DB에 데이터를 기록하고, 백업 및 특정시점 복구(PITR)를 실습합니다.

실습 폴더:

```text
016-database backup recovery
```

## 설치

```bash
cd ~/cloud-infrastructure-lecture-example
cd "016-database backup recovery"

chmod +x scripts/db-writer.sh
sudo ./scripts/db-writer.sh install
```

## DB 접속정보 설정

```bash
sudo ./scripts/db-writer.sh configure
```

예시 입력:

```text
DB host: db-xxxx.vpc-cdb.ntruss.com
DB port [3306]:
DB user [lecture_writer]: student
DB password:
DB name [lecture_recovery_lab]: lab5-db
DB table [recovery_events]:
Source ID [mysql]:
Write interval seconds [30]:
```

이미 특정 DB에만 권한이 있다면 `DB name`에 그 DB 이름을 입력합니다.

권한 확인:

```bash
sudo ./scripts/db-writer.sh db-shell
```

MySQL 콘솔에서:

```sql
SHOW GRANTS FOR CURRENT_USER();
```

## 테이블 준비

저장된 DB 이름에 테이블을 생성합니다.

```bash
sudo ./scripts/db-writer.sh init-schema
```

접속과 테이블 상태를 확인합니다.

```bash
sudo ./scripts/db-writer.sh check
```

## 1회 데이터 전송

```bash
sudo ./scripts/db-writer.sh send-once
```

DB에 직접 들어가 확인합니다.

```bash
sudo ./scripts/db-writer.sh db-shell
```

```sql
SELECT *
FROM recovery_events
ORDER BY id DESC
LIMIT 10;
```

## 30초마다 데이터 전송

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

## PITR 실습 흐름

1. `start`로 데이터를 계속 기록합니다.
2. 몇 분 뒤 현재 시간을 기록합니다.
3. 일부 데이터를 삭제합니다.
4. DB 콘솔에서 특정시점 복구를 실행합니다.
5. 복구된 DB에서 `recovery_events`의 row 수와 `created_at`을 비교합니다.

확인 SQL:

```sql
SELECT COUNT(*) AS total_rows FROM recovery_events;

SELECT MIN(created_at) AS first_event, MAX(created_at) AS last_event
FROM recovery_events;
```

## 다음 실습

[017 Cloud DB Migration](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/017-cloud-db-migration/)에서는 003 Ubuntu DB의 `board_service` 데이터를 Cloud DB for MySQL로 이관합니다.
