# 403 Database 백업 및 복구

## 목표와 이어지는 환경

401에서 생성하고 402에서 기존 게시판 데이터를 이관한 **같은 Cloud DB의 `board_service`**를 사용합니다. `recovery_events`에 30초마다 시험 데이터를 기록한 뒤 삭제하고, 별도의 복원 서버에서 삭제 전 상태를 확인합니다.

```text
401 생성·연결 → 402 board_service 이관·Backend 전환 → 403 백업·복원
```

`posts`나 `board_service`를 삭제하거나 게시판 초기 스키마를 다시 실행하지 않습니다. 장애 재현은 **`recovery_events`의 `source_id='403-pitr'` 행만 삭제**합니다. 콘솔 복원은 DB 서버 단위이므로 Recovery에는 `posts`도 선택한 시점의 상태로 존재합니다.

| 대상 | 실습 값 |
| --- | --- |
| Ubuntu 작업 서버 | 402에서 Cloud DB로 연결을 전환한 Backend |
| 원본 Cloud DB | 401에서 생성한 `board-service` |
| Database | `board_service` |
| 테이블 생성 / 기록 계정 | `board_admin` / `board_app` |
| 시험 테이블 / Source ID | `recovery_events` / `403-pitr` |

## 1. 복원 방식과 HA 선행 조건

401의 기본값은 고가용성을 사용하지 않는 **Stand Alone**입니다.

| 방식 | 필요한 조건 | 복원 기준 |
| --- | --- | --- |
| A. Backup 파일 복원 | Stand Alone 또는 HA, 완료된 자동 백업 파일 | 백업 파일의 상태 |
| B. PITR | HA, 백업 완료, 실제 복원 가능 범위 | 범위 내 분 단위 시각 |

원본에 덮어쓰지 않고 **새 Recovery 서버를 생성**합니다. Recovery는 읽기 전용이며 SELECT로 검증합니다. 애플리케이션과 writer의 DB_HOST는 원본으로 유지합니다. 쓰기 가능한 서버로 쓰려면 별도의 **신규 DB 서비스 생성** 작업이 필요합니다. [공식 Backup 안내](https://guide.ncloud-docs.com/docs/database-database-5-4), [공식 DB Server 안내](https://guide.ncloud-docs.com/docs/database-database-5-2)

### PITR 선택 시: 기존 DB를 HA로 전환

1. **VPC > Cloud DB for MySQL > DB Server**에서 원본 `board-service` 서버를 선택합니다.
2. **DB 관리 > 고가용성 설정 변경**을 엽니다.
3. 고가용성 `N`을 `Y`로 변경합니다. 이번 실습에서 Multi Zone은 사용하지 않아도 됩니다.
4. **예**를 누르고 Master·Standby Master 구성이 `운영중`이 될 때까지 기다립니다.
5. Backend에서 원본 DB 접속을 다시 확인합니다.

같은 DB Service를 전환하며 Standby 서버 비용이 추가됩니다. 전환 후 실제 백업 완료와 PITR의 **DB 복원 가능한 시간**을 확인해야 합니다. HA 전환만으로 모든 과거 시각이 복원 가능해지는 것은 아닙니다. [공식 고가용성 설정 변경](https://guide.ncloud-docs.com/docs/database-database-5-2)

!!! note "Manual Backup은 별도 기능입니다"
    이 교안은 자동 Backup 파일 복원 또는 PITR을 사용합니다. Manual Backup은 HA 전용 스냅샷이며 새 DB 서비스로 복원합니다. Manual Backup 완료만으로 PITR 가능 범위를 추정하지 않습니다. [공식 Manual Backup 안내](https://guide.ncloud-docs.com/docs/database-database-5-4)

## 2. 설치와 원본 DB 확인

Backend 서버에서 실행합니다. `ORIGINAL_DB_HOST`는 **402의 Target Cloud DB Private 도메인**입니다. 003 Source DB IP나 이후 생성할 Recovery 도메인을 입력하지 않습니다.

```bash
cd ~/cloud-infrastructure-lecture-example
git pull --ff-only
cd "403-database backup recovery"
chmod +x scripts/db-writer.sh
sudo ./scripts/db-writer.sh install

read -r -p '원본 Cloud DB Private 도메인: ' ORIGINAL_DB_HOST
mysql --protocol=TCP -h "$ORIGINAL_DB_HOST" -P 3306 \
  -u board_app -p board_service \
  -e 'SELECT DATABASE(), CURRENT_USER(); SELECT COUNT(*) AS posts_rows FROM posts;'
```

**통과 기준:** `DATABASE()`는 `board_service`, 접속 계정은 `board_app`이고 이관한 `posts`가 조회됩니다. 설치는 MySQL 클라이언트, Python venv, `/opt/ncp-db-writer`, systemd 서비스를 준비합니다.

## 3. board_admin으로 시험 테이블만 생성

같은 터미널에서 실행합니다.

```bash
mysql --protocol=TCP -h "$ORIGINAL_DB_HOST" -P 3306 \
  -u board_admin -p board_service < sql/table_only.sql

mysql --protocol=TCP -h "$ORIGINAL_DB_HOST" -P 3306 \
  -u board_app -p board_service \
  -e 'SHOW TABLES; SHOW COLUMNS FROM recovery_events; SHOW GRANTS FOR CURRENT_USER();'
```

**통과 기준:** `posts`와 `recovery_events`가 함께 보입니다. 시험 테이블의 `id`, `source_id`, `event_message`, `metric_value`, `created_at`을 확인합니다.

!!! warning "앱 계정으로 init-schema를 실행하지 않습니다"
    `board_app`은 CRUD 계정입니다. `init-schema`는 CREATE DATABASE와 CREATE TABLE을 실행하므로 권한 오류가 날 수 있습니다. 이번에는 `board_admin`이 `table_only.sql`을 실행하고 writer는 `board_app`으로 기록합니다. 별도 DB·사용자를 만드는 `sql/mysql_schema.sql`도 실행하지 않습니다.

## 4. writer 설정과 실제 INSERT 검증

```bash
sudo ./scripts/db-writer.sh configure
```

대괄호 기본값이 나와도 사용자와 DB 이름은 아래 값으로 **직접 덮어써 입력**합니다.

```text
DB host: 원본 Cloud DB Private 도메인
DB port [3306]: 3306
DB user [lecture_writer]: board_app
DB password: board_app의 실제 암호
DB name [lecture_recovery_lab]: board_service
DB table [recovery_events]: recovery_events
Source ID [서버호스트명]: 403-pitr
Write interval seconds [30]: 30
```

설정 파일 `/etc/ncp-db-writer.env`는 암호를 포함하므로 `0600`으로 저장됩니다.

```bash
sudo ./scripts/db-writer.sh show-config
sudo ./scripts/db-writer.sh check
sudo ./scripts/db-writer.sh send-once
sudo ./scripts/db-writer.sh db-shell
```

MySQL 콘솔에서 실행합니다.

```sql
SELECT id, source_id, event_message, metric_value, created_at
FROM recovery_events WHERE source_id = '403-pitr'
ORDER BY id DESC LIMIT 5;
exit
```

**통과 기준:** 서버 로그인·DB 접근·테이블 조회가 각각 성공하고, `send-once`가 출력한 ID의 행이 DB에도 있습니다.

## 5. 주기적 기록과 삭제 전 기준값

```bash
sudo ./scripts/db-writer.sh start
sudo ./scripts/db-writer.sh status
sudo ./scripts/db-writer.sh logs
```

2~3분 동안 INSERT ID가 증가하는지 확인합니다. 로그의 `Ctrl+C`는 서비스를 중지하지 않습니다. 아래 명령으로 실제 서비스를 중지합니다.

```bash
sudo ./scripts/db-writer.sh stop
sudo systemctl is-active ncp-db-writer
sudo ./scripts/db-writer.sh db-shell
```

`is-active`의 기대값은 `inactive`입니다. 복원 대조가 끝날 때까지 writer를 다시 시작하지 않습니다. MySQL 콘솔에서 시간대를 맞추고 기준 행을 넣습니다.

```sql
SET SESSION time_zone = '+09:00';
SELECT NOW(6) AS db_now_kst, UTC_TIMESTAMP(6) AS db_now_utc,
       @@session.time_zone AS session_tz,
       @@global.time_zone AS global_tz,
       @@system_time_zone AS system_tz;

INSERT INTO recovery_events (source_id, event_message, metric_value)
VALUES ('403-pitr', 'BEFORE_DELETE_MARKER', 0);

SELECT COUNT(*) AS baseline_rows, MIN(id) AS first_id, MAX(id) AS last_id,
       MIN(created_at) AS first_created_at,
       MAX(created_at) AS last_created_at
FROM recovery_events WHERE source_id = '403-pitr';

SELECT id, source_id, event_message, created_at
FROM recovery_events WHERE source_id = '403-pitr'
ORDER BY id DESC LIMIT 5;
SELECT NOW(6) AS baseline_recorded_kst;
exit
```

**행 수·최소/최대 ID·최초/최종 시각·기준 행 ID·기준값 기록 시각**을 저장합니다. heartbeat 메시지 안의 시각은 Python이 넣은 UTC 문자열입니다. 복원 기준은 시간대를 맞춘 DB 시각으로 판단합니다.

## 6. 기준값 이후 자동 백업 완료 확인

1. **Cloud DB for MySQL > Backup > 원본 서비스 > 상세내역**으로 이동합니다.
2. 기준값 기록 **이후에 시작하여 완료된 자동 백업 파일**을 확인합니다.
3. 백업 날짜, 시작·완료 시간, 크기를 기록합니다.
4. 해당 파일이 없다면 **DB Server > DB 관리 > DB Server 상세보기 > Backup 설정 관리**에서 가까운 미래의 백업 시간을 지정하고 실제 완료를 기다립니다.

writer가 중지된 상태에서 백업하므로 선택한 파일의 시험 행 수와 ID를 기준값과 정확히 비교할 수 있습니다. `recovery_events` 생성·기준 행 추가 이전의 파일이나 아직 완료되지 않은 백업으로 삭제 단계에 진입하지 않습니다.

자동 백업은 하루 한 번 수행됩니다. 지정 시각은 즉시 완료 시각이 아니므로 실제 시작·완료를 확인합니다. 보관 기간 `7일` 설정이 현재 시각까지 PITR 가능하다는 뜻도 아닙니다. [공식 백업 수행 규칙](https://guide.ncloud-docs.com/docs/database-database-5-4)

## 7. PITR 시각 확보와 시험 행 삭제

### B. PITR 선택 시에만

원본 DB에 다시 접속해 아래부터 삭제까지 **같은 MySQL 세션**을 유지합니다.

```bash
sudo ./scripts/db-writer.sh db-shell
```

```sql
SET SESSION time_zone = '+09:00';
SET @pitr_kst = TIMESTAMP(DATE_FORMAT(
    NOW(6) + INTERVAL 2 MINUTE, '%Y-%m-%d %H:%i:00'));
SELECT NOW(6) AS db_now_kst, UTC_TIMESTAMP(6) AS db_now_utc,
       @@session.time_zone AS session_tz,
       @pitr_kst AS restore_target_kst,
       @pitr_kst - INTERVAL 9 HOUR AS restore_target_utc;
```

출력된 목표 시각을 기록합니다. 이는 현재보다 뒤에 있는 `초=00` 시각이며 writer가 멈춰 있어 기준 행이 유지됩니다. 목표가 `14:05:00 KST`라면 적어도 `14:06:00 KST` 이후 삭제합니다.

1. 아래 조회를 다시 실행해 `can_delete=1`인지 확인합니다.
2. 콘솔 **Backup > 상세내역 > 시점 복원**에서 목표가 **DB 복원 가능한 시간**에 포함되는지 확인합니다.
3. 콘솔 표시 시간대와 KST/UTC를 대조하여 목표를 맞춥니다.
4. 범위에 아직 포함되지 않으면 기다린 뒤 확인합니다. 팝업을 취소하고 삭제 단계로 돌아옵니다.

```sql
SELECT NOW(6) AS db_now_kst, @pitr_kst AS restore_target_kst,
       NOW(6) >= @pitr_kst + INTERVAL 1 MINUTE AS can_delete;
```

PITR 콘솔은 **분 단위까지** 지정합니다. `binlog_expire_logs_seconds` 설정과 실제 사용 가능한 로그 범위를 확인해야 하며 “삭제 직전 몇 초”를 지정하는 방식에 의존하지 않습니다. [공식 시점 복원](https://guide.ncloud-docs.com/docs/database-database-5-4)

### A·B 공통: 자신의 시험 행만 삭제

Backup 파일 복원만 선택했다면 `db-shell`로 접속해 실행합니다. PITR은 위의 같은 세션에서 실행합니다.

```sql
SET SESSION time_zone = '+09:00';
SELECT COUNT(*) AS before_delete_rows, MIN(id) AS first_id, MAX(id) AS last_id
FROM recovery_events WHERE source_id = '403-pitr';

DELETE FROM recovery_events WHERE source_id = '403-pitr';
SELECT ROW_COUNT() AS deleted_rows, NOW(6) AS deleted_at_kst,
       UTC_TIMESTAMP(6) AS deleted_at_utc;

SELECT COUNT(*) AS remaining_rows
FROM recovery_events WHERE source_id = '403-pitr';
SELECT COUNT(*) AS posts_rows FROM posts;
exit
```

**통과 기준:** 삭제 전 행 수와 `deleted_rows`가 기준 행 수와 같고 원본의 `remaining_rows=0`입니다. `posts`와 다른 `source_id`는 삭제 대상이 아닙니다. 게시판 자동 입력이 실행 중이면 `posts_rows`는 늘 수 있습니다.

## 8. 별도의 Recovery 생성

A·B 중 준비한 방식 하나로 진행합니다.

| 방식 | 콘솔 경로·선택값 |
| --- | --- |
| A. Backup 파일 복원 | Backup > 원본 상세내역 > 6단계 파일 > **Backup 파일 복원**. 이름 예: `board-backup` |
| B. PITR | Backup > 원본 상세내역 > **시점 복원**. 7단계 목표 시각 선택. 이름 예: `board-pitr` |
| 공통 | 같은 VPC의 접근 가능한 Subnet과 실습용 서버 타입 확인 |
| 결과 형태 | **신규 DB 서비스로 생성**은 선택하지 않고 `Recovery`로 생성 |

DB Server 목록에서 새 서버의 Role이 `Recovery`, 상태가 `운영중`인지 확인합니다. **새 서버의 Private 도메인**을 복사합니다. 적용된 ACG가 Backend의 TCP `3306`을 허용하고 복원된 계정의 HOST 조건이 Backend IP를 허용하는지도 확인합니다. [공식 콘솔 복원 절차](https://guide.ncloud-docs.com/docs/database-database-5-4)

## 9. 원본과 Recovery 대조

Backend의 같은 터미널에서 실행합니다. writer의 `configure`는 다시 실행하지 않습니다.

```bash
read -r -p '새 Recovery Private 도메인: ' RECOVERY_DB_HOST

mysql --protocol=TCP -h "$ORIGINAL_DB_HOST" -P 3306 \
  -u board_app -p board_service \
  -e "SELECT COUNT(*) AS original_remaining FROM recovery_events WHERE source_id='403-pitr';"

mysql --protocol=TCP -h "$RECOVERY_DB_HOST" -P 3306 \
  -u board_app -p board_service
```

Recovery에 연결한 MySQL 콘솔에서 실행합니다.

```sql
SET SESSION time_zone = '+09:00';
SELECT @@hostname AS connected_server, DATABASE(), CURRENT_USER(), @@read_only;
SELECT COUNT(*) AS restored_rows, MIN(id) AS first_id, MAX(id) AS last_id,
       MIN(created_at) AS first_created_at,
       MAX(created_at) AS last_created_at
FROM recovery_events WHERE source_id = '403-pitr';

SELECT id, source_id, event_message, created_at
FROM recovery_events WHERE source_id = '403-pitr'
ORDER BY id DESC LIMIT 5;
SELECT COUNT(*) AS restored_posts_rows FROM posts;
exit
```

| 증거 | 통과 기준 |
| --- | --- |
| 원본 | `original_remaining=0` |
| 접속 대상 | 새 Recovery 도메인·서버 이름이며 읽기 전용 상태 |
| 복원 행 | 행 수와 최소·최대 ID가 기준값과 같음 |
| 시각·기준 행 | 최초·최종 시각이 같고 같은 ID의 `BEFORE_DELETE_MARKER` 존재 |
| 이관 데이터 | Recovery에서도 `posts` 조회 가능 |

행 수만 보지 않고 ID·시각·기준 행까지 대조합니다. Recovery의 `posts`는 선택한 시점의 데이터이므로 이후 계속 쓰기가 일어난 현재 원본과 행 수가 다를 수 있습니다. Recovery에서 INSERT하거나 writer를 시작하지 않습니다.

## 10. 정리와 문제 해결

재부팅 후 writer가 다시 켜지지 않도록 중지와 자동 시작 해제를 함께 수행합니다.

```bash
sudo ./scripts/db-writer.sh stop
sudo systemctl disable ncp-db-writer
sudo systemctl is-active ncp-db-writer
sudo systemctl is-enabled ncp-db-writer
sudo ./scripts/db-writer.sh show-config
```

기대값은 `inactive`, `disabled`입니다. writer의 DB_HOST와 Backend 연결은 원본에 유지합니다. 증거를 저장한 뒤 이번에 만든 **Recovery 서버만** 이름을 대조해 삭제합니다. 원본 Cloud DB와 이관 데이터 삭제는 모든 게시판 실습이 끝난 뒤 별도 정리합니다. HA를 켰다면 Standby 비용과 유지 여부도 확인합니다.

| 증상 | 확인과 조치 |
| --- | --- |
| CREATE 권한 오류 | `board_admin`으로 `table_only.sql` 실행. 앱 계정의 `init-schema` 사용 금지 |
| DB 접근 실패 | `board_app` 암호·HOST·`board_service` 권한 확인. 로그인 성공과 DB 접근 성공 구분 |
| 연결 시간 초과 | Private 도메인, VPC 경로, Backend → DB ACG TCP 3306 확인 |
| active지만 새 행 없음 | `logs`의 `insert failed`, `send-once` 결과와 실제 SQL 행 대조 |
| PITR 메뉴·시각 선택 불가 | Stand Alone 여부, HA·백업 완료, 실제 복원 범위 확인 |
| 복원 결과에 테이블·행 없음 | 백업·목표 시각이 테이블 생성·기준 행 추가 이후인지 확인 |
| 행 수 불일치 | writer 중지 여부, source_id, 접속 도메인, 시간대·목표 시각 확인 |
| Recovery 쓰기 실패 | 읽기 전용 서버이므로 SELECT로 검증 |

완료 기준은 **원본의 삭제와 별도 Recovery의 삭제 전 행을 함께 확인하는 것**입니다. 복원 버튼의 완료 메시지만으로 데이터 복구를 판정하지 않습니다.
