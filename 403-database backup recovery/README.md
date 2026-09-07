# 403 Database Backup Recovery

401에서 생성하고 402에서 데이터를 이관한 **같은 Cloud DB for MySQL의 `board_service`**로 백업 및 특정시점 복구(PITR)를 실습합니다. Backend에서 30초마다 시험 데이터를 기록하고 삭제한 뒤, 별도의 복원 서버에서 삭제 전 상태를 확인합니다.

```text
401 생성·연결 → 402 board_service 이관·Backend 전환 → 403 백업·복원

Backend의 ncp-db-writer
  └─ 원본 Cloud DB: board_service.recovery_events
       └─ 자동 백업 파일 / PITR → 별도의 Recovery에서 SELECT 검증
```

`posts`와 `board_service`는 유지합니다. 장애 재현은 `recovery_events`의 `source_id='403-pitr'` 행만 삭제합니다. 콘솔 복원 자체는 서버 단위이므로 Recovery에는 `posts`도 선택한 시점의 상태로 존재합니다.

## 전체 교안과 복원 전제

HA 전환, 백업 확보, 복원 시각 선정, 삭제와 원본/Recovery 대조는 [403 Database 백업 및 복구 교안](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/403-database-backup-recovery/)을 순서대로 진행합니다.

- **401의 기본 Stand Alone:** 완료된 자동 Backup 파일 복원 가능. PITR은 미지원.
- **PITR:** 원본 서버의 **DB 관리 > 고가용성 설정 변경**에서 `N → Y` 전환 후 Master·Standby Master `운영중`, 백업 완료, 실제 복원 가능한 시간 범위를 확인합니다. Multi Zone은 필수가 아닙니다.
- **복원 결과:** 새 Recovery 서버를 생성하며 읽기 전용이므로 SELECT로 검증합니다. writer는 원본을 계속 가리킵니다.
- **Manual Backup:** HA 전용 스냅샷이며 자동 Backup 파일/PITR과 구분합니다.

[공식 DB Server·고가용성 설정 변경](https://guide.ncloud-docs.com/docs/database-database-5-2), [공식 Backup·PITR·Manual Backup](https://guide.ncloud-docs.com/docs/database-database-5-4)

## 1. Backend에서 설치와 원본 확인

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

`DATABASE()`가 `board_service`, 계정이 `board_app`이고 이관한 `posts`를 조회할 수 있어야 합니다. 설치는 MySQL 클라이언트, Python venv와 `pymysql`, `/opt/ncp-db-writer`, systemd 서비스를 준비합니다.

## 2. board_admin으로 시험 테이블 생성

```bash
mysql --protocol=TCP -h "$ORIGINAL_DB_HOST" -P 3306 \
  -u board_admin -p board_service < sql/table_only.sql
```

[sql/table_only.sql](./sql/table_only.sql)은 현재 DB에 `recovery_events`만 생성합니다. `board_app`은 CRUD 계정이므로 이 계정으로 `init-schema`를 실행하면 CREATE 권한 오류가 날 수 있습니다.

이번에는 별도 DB·사용자 생성용 [sql/mysql_schema.sql](./sql/mysql_schema.sql)을 실행하지 않습니다. 해당 파일과 `init-schema`는 관리자 권한으로 독립적인 MySQL 호환 실습 환경을 만들 때 쓰는 보조 수단입니다.

| Column | 의미 |
| --- | --- |
| `id` | 자동 증가 PK |
| `source_id` | 데이터를 쓴 실습 식별자 |
| `event_message` | heartbeat 메시지 또는 기준 행 |
| `metric_value` | 시험 숫자 |
| `created_at` | DB 기록 시각, TIMESTAMP(6) |

## 3. writer 설정과 INSERT 검증

```bash
sudo ./scripts/db-writer.sh configure
```

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

`lecture_writer`와 `lecture_recovery_lab` 기본값을 그대로 선택하지 않습니다. 설정은 `/etc/ncp-db-writer.env`에 `0600`으로 저장됩니다.

```bash
sudo ./scripts/db-writer.sh show-config
sudo ./scripts/db-writer.sh check
sudo ./scripts/db-writer.sh send-once
sudo ./scripts/db-writer.sh db-shell
```

```sql
SELECT id, source_id, event_message, created_at
FROM recovery_events WHERE source_id = '403-pitr'
ORDER BY id DESC LIMIT 5;
exit
```

**통과 기준:** 로그인·DB 접근·테이블 조회가 각각 성공하고 INSERT 출력 ID와 실제 행이 일치합니다.

## 4. 기록·삭제·복원 순서

```bash
sudo ./scripts/db-writer.sh start
sudo ./scripts/db-writer.sh status
sudo ./scripts/db-writer.sh logs
```

2~3분 동안 INSERT ID가 증가하는지 확인합니다. 로그의 `Ctrl+C`는 서비스를 중지하지 않습니다. 기준값 기록 전 아래 명령으로 실제 중지합니다.

```bash
sudo ./scripts/db-writer.sh stop
sudo systemctl is-active ncp-db-writer
```

기대값은 `inactive`입니다. 이후 [전체 교안](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/403-database-backup-recovery/)의 5~9단계를 진행합니다.

1. `BEFORE_DELETE_MARKER`를 추가하고 **행 수·최소/최대 ID·최초/최종 시각·기준 행 ID**를 기록합니다.
2. DB 세션을 `+09:00`으로 맞추고 `NOW(6)`, `UTC_TIMESTAMP(6)`, 세션·전역·시스템 시간대를 기록합니다. heartbeat 메시지 안의 시각은 UTC 문자열입니다.
3. writer가 중지된 상태에서 기준값 이후에 시작·완료된 자동 백업 파일을 확보합니다. 없으면 백업 시간을 설정하고 실제 완료를 기다립니다.
4. PITR은 미래의 `초=00` 시각을 정한 뒤 그 시각이 콘솔 복원 가능 범위에 포함되고, 목표로부터 적어도 1분이 지난 후 삭제합니다. 콘솔과 DB 시간대를 맞춥니다. 콘솔은 **분 단위** 선택입니다.
5. `DELETE FROM recovery_events WHERE source_id='403-pitr';` 직후 `ROW_COUNT()`를 기록합니다. 원본의 해당 행이 0개인지 확인하고 `posts`는 변경하지 않습니다.
6. Backup 파일 복원 또는 PITR으로 별도 Recovery를 만듭니다. 새 도메인으로 SELECT하여 삭제 전 기준값과 대조합니다.

**원본은 0행, Recovery는 원래 행 수·ID·시각·기준 행이 복구**되어야 통과입니다. writer는 원본을 가리키게 두고 Recovery에 INSERT하지 않습니다. 복원 완료 메시지만으로 성공을 판정하지 않습니다.

## 스크립트 명령어

| Command | 설명 |
| --- | --- |
| `install` | Ubuntu 패키지, Python venv, 앱, systemd 서비스 설치 |
| `configure` | DB 접속정보를 환경 파일에 저장 |
| `configure-plain` | 암호가 보이는 진단용 설정. 화면 공유 중에는 사용하지 않음 |
| `show-config` | 암호를 마스킹한 설정 확인 |
| `db-shell` | 저장된 설정으로 MySQL 콘솔 접속 |
| `check` | 서버 로그인, DB 접근, 테이블 조회를 각각 확인 |
| `init-schema` | CREATE 권한으로 DB·테이블 생성. 이번 수업에서는 사용하지 않음 |
| `send-once` | 시험 데이터 1건 INSERT |
| `start` | writer 시작 및 부팅 시 자동 시작 활성화 |
| `stop` | 서비스 중지. 자동 시작 설정은 남아 있음 |
| `restart` | 서비스 재시작 |
| `status` | systemd 상태 확인 |
| `logs` | 서비스 로그 실시간 확인 |

## 트러블슈팅

**서버 로그인은 되지만 DB 접근 실패:** DB 이름이 `board_service`인지, `board_app` 권한과 HOST가 Backend IP를 허용하는지 확인합니다. 이미 이관한 DB가 있으므로 임의의 DB를 새로 만들지 않습니다.

```bash
mysql --protocol=TCP -h "$ORIGINAL_DB_HOST" -P 3306 \
  -u board_app -p board_service
```

```sql
SELECT DATABASE(), CURRENT_USER();
SHOW GRANTS FOR CURRENT_USER();
```

**직접 접속은 되지만 스크립트만 인증 실패:** `configure`를 다시 실행해 암호를 한 줄로 입력합니다. 제어 문자·줄바꿈이 섞이지 않았는지 확인합니다. 실행 중인 서비스는 설정 변경 후 `restart`해야 새 설정을 읽습니다.

**서비스는 active지만 데이터가 늘지 않음:** `logs`의 `insert failed`를 확인합니다. writer는 실패를 기록하고 다음 주기에 재시도하므로 active만으로 쓰기 성공을 판단할 수 없습니다. `send-once` 출력과 실제 SQL 행을 대조합니다.

**연결 시간 초과 / Recovery 접속 실패:** 원본과 Recovery의 Private 도메인을 구분하고, VPC 경로·DB ACG TCP 3306·DB User HOST·서버 운영중 상태를 확인합니다.

**PITR 메뉴·목표 시각 선택 불가:** Stand Alone은 PITR 미지원입니다. HA 전환과 백업 완료, 콘솔의 실제 복원 가능한 시간을 확인합니다. 7일 보관 설정만으로 지금까지 모두 복원 가능한 것은 아닙니다.

**Recovery 쓰기 실패 / 행 수 불일치:** Recovery는 읽기 전용입니다. SELECT로 검증하며, 행 수가 다르면 writer 중지 여부, source_id, 접속 도메인, 백업·복원 시각과 시간대를 확인합니다.

## 실습 정리

```bash
sudo ./scripts/db-writer.sh stop
sudo systemctl disable ncp-db-writer
sudo systemctl is-active ncp-db-writer
sudo systemctl is-enabled ncp-db-writer
```

`inactive`, `disabled`를 확인합니다. 증거를 저장한 뒤 이번 Recovery만 정리합니다. 원본 Cloud DB, `posts`, Backend 연결은 유지합니다. 원본 삭제는 모든 관련 실습 종료 후 진행하며, HA를 켰다면 Standby 비용과 유지 여부도 확인합니다.
