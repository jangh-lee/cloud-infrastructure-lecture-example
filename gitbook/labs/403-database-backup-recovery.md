# 403 Cloud DB 특정 시점 복구(PITR)

402에서 이관한 Cloud DB의 게시판에 실습용 글 3개를 추가합니다. 정상 시각을 기록한 뒤 그 글만 삭제하고, **삭제 전 시각으로 새 DB를 복구**합니다. 데이터를 대조한 뒤 Backend를 복구한 DB로 전환합니다.

```text
정상 데이터 준비 → 복구 시각 확보 → 실습 글 삭제
                               ↓
                  지정 시점으로 새 Cloud DB 복구
                               ↓
                  데이터 검증 → DB_HOST 변경 → 게시판 재개
```

| 구분 | 이번 실습에서 사용할 대상 |
| --- | --- |
| 작업 서버 | 402를 마친 Backend 서버 |
| 원본 DB | 402의 Target이었던 Cloud DB `board-service` |
| 데이터 | `board_service`의 `posts`, `users`, `notices` |
| 삭제 대상 | 작성자가 `403-pitr`인 이번 실습용 글 3개 |
| 복구 결과 | 별도 Cloud DB 서비스 `board-pitr` |

**모든 명령은 Backend의 Bash 프롬프트(`root@lab7-backend:~#`)에서 실행합니다.** SQL은 파일로 받아 `mysql`에 전달합니다. 비밀번호 입력 요청에는 해당 DB의 `board_app` 비밀번호를 입력합니다.

## 1. PITR 준비 상태 확인

네이버 클라우드 콘솔의 **VPC > Cloud DB for MySQL**에서 원본 `board-service`를 확인합니다.

- 402의 DMS 작업이 **[Complete]**로 종료됐고 DB가 `운영중`이어야 합니다.
- Master와 Standby Master로 구성된 **고가용성(HA)**이어야 합니다. Stand Alone이면 **DB 관리 > 고가용성 설정 변경**에서 HA를 켜고 구성이 끝날 때까지 기다립니다.
- **Backup > 해당 서비스 상세내역**에 완료된 백업이 있어야 합니다.
- **시점 복원** 창에서 현재 **DB 복원 가능한 시간**을 확인한 뒤 창을 닫습니다.

PITR은 복구 가능한 범위 안에서 **분 단위**로 시각을 지정합니다. 백업 보관일을 7일로 설정했다고 해서 모든 과거 7일이 복구 가능한 것은 아닙니다. 실습할 때 표시되는 시간 범위를 기준으로 진행합니다. [공식 시점 복원 안내](https://guide.ncloud-docs.com/docs/database-database-5-4)

## 2. 점검 안내와 쓰기 중지

게시판 우측 상단 **관리자 로그인 → 공지 관리**에서 아래 내용을 등록하고 표시 방식을 **점검 시작 · 게시판 이용 중단**으로 선택합니다. 공지 반영 완료 메시지와 점검 화면을 확인합니다.

```text
제목: 데이터 복구 실습에 따른 서비스 점검 안내

안정적인 서비스 운영을 위한 데이터 복구 실습을 진행합니다.
점검 중에는 게시글 조회·작성과 회원 로그인이 일시 중단됩니다.

- 점검 일시 : 2026년 00월 00일 18:00 ~ 19:00 (1시간)
- 점검 내용 : Cloud DB 특정 시점 복구(PITR) 실습
- 고객센터 : 02-1234-1234
```

날짜와 시간은 실제 일정으로 수정합니다. 공지가 반영된 다음 Backend에서 두 서비스를 중지합니다.

```bash
sudo systemctl stop board-service-post-seeder || true
sudo systemctl stop board-service-backend
sudo systemctl is-active board-service-backend board-service-post-seeder
```

둘 다 `inactive`인지 확인합니다. 기준값을 기록한 이후에는 복구 DB 검증이 끝날 때까지 서비스를 다시 시작하거나 다른 터미널에서 게시판 데이터를 수정하지 않습니다.

## 3. 실습 SQL 준비와 글 3개 등록

현재 Backend 설정에서 원본 DB 주소를 가져옵니다. 이후 명령도 같은 터미널에서 실행합니다.

```bash
source /opt/board-service-backend/.env
ORIGINAL_DB_HOST="$DB_HOST"
printf '원본 Cloud DB: %s\n' "$ORIGINAL_DB_HOST"
mysql --version
```

출력된 주소가 **402에서 연결한 Cloud DB의 Private 도메인**인지 확인합니다. `mysql` 명령이 없다면 `sudo apt-get update && sudo apt-get install -y mysql-client`로 클라이언트를 설치합니다.

실습용 SQL 파일 3개를 받습니다.

```bash
mkdir -p /tmp/403-pitr
SQL_BASE='https://raw.githubusercontent.com/jangh-lee/cloud-infrastructure-lecture-example/main/403-database%20backup%20recovery/sql'
for name in pitr-prepare pitr-verify pitr-delete; do
  if ! curl -fsSL "$SQL_BASE/$name.sql" -o "/tmp/403-pitr/$name.sql.download"; then
    printf '다운로드 실패: %s.sql — 다시 실행한 뒤 다음 단계로 진행하세요.\n' "$name"
    break
  fi
  mv "/tmp/403-pitr/$name.sql.download" "/tmp/403-pitr/$name.sql"
  printf '준비 완료: %s.sql\n' "$name"
done
```

3개 모두 `준비 완료`가 출력됐으면 원본 DB에 실습용 글을 추가합니다. 같은 실습 글이 이미 있으면 중복 추가하지 않습니다.

```bash
mysql --protocol=TCP --default-character-set=utf8mb4 --table \
  -h "${ORIGINAL_DB_HOST:?3단계에서 원본 DB 주소를 먼저 설정하세요}" \
  -P 3306 -u board_app -p board_service \
  < /tmp/403-pitr/pitr-prepare.sql
```

`[403 PITR] 복구 실습 1`, `2`, `3`이 조회되는지 확인합니다. 이어서 삭제 전 기준값을 파일에 저장합니다.

```bash
set -o pipefail
mysql --protocol=TCP --default-character-set=utf8mb4 --table \
  -h "${ORIGINAL_DB_HOST:?원본 DB 주소를 설정하세요}" \
  -P 3306 -u board_app -p board_service \
  < /tmp/403-pitr/pitr-verify.sql | tee /tmp/403-pitr/before.txt
```

**기준값:** `test_posts=3`, 시험 글의 ID·제목·내용·작성 시각, `posts/users/notices` 행 수, 회원·관리자 수, 게시글 체크섬을 보관합니다.

## 4. 삭제 전 복구 시각 확보

아래 명령은 현재보다 뒤에 있는 **분 경계(초=00)**를 복구 목표 시각으로 저장합니다. 서비스가 중지돼 있으므로 그 시각에도 방금 기록한 데이터가 유지됩니다.

```bash
mysql --protocol=TCP \
  -h "${ORIGINAL_DB_HOST:?원본 DB 주소를 설정하세요}" \
  -P 3306 -u board_app -p board_service -N -B \
  -e "SET SESSION time_zone='+09:00'; SELECT DATE_FORMAT(NOW() + INTERVAL 2 MINUTE, '%Y-%m-%d %H:%i:00');" \
  > /tmp/403-pitr/restore-time.txt
cat /tmp/403-pitr/restore-time.txt
```

예를 들어 `2026-09-09 18:44:00`이 출력되면 **18:44가 복구 목표**, **18:45 이후가 삭제 가능 시각**입니다. 위 예시 대신 자신의 출력값을 사용합니다. 출력 시각은 한국시간(KST)입니다.

1. 목표 시각에서 1분이 지날 때까지 기다립니다.
2. 콘솔 **Backup > 원본 상세내역 > 시점 복원**을 열어, 목표 시각이 **DB 복원 가능한 시간**에 포함되는지 확인합니다.
3. 아직 포함되지 않으면 기다렸다가 새로 확인합니다. 콘솔의 시간대도 출력한 한국시간과 맞춥니다.
4. 목표 시각이 범위에 들어온 것을 확인한 뒤 팝업을 닫습니다. 복원은 삭제 이후에 실행합니다.

## 5. 실습 글 삭제로 장애 재현

다음 명령은 작성자·내용·제목이 모두 일치하는 **이번 실습용 글 3개만 삭제**합니다. 원본 DB에서 실행하는 단계입니다.

```bash
PITR_TIME="$(cat /tmp/403-pitr/restore-time.txt)"
mysql --protocol=TCP --default-character-set=utf8mb4 --table \
  -h "${ORIGINAL_DB_HOST:?원본 DB 주소를 설정하세요}" \
  -P 3306 -u board_app -p board_service \
  --init-command="SET @pitr_time = '$PITR_TIME'" \
  < /tmp/403-pitr/pitr-delete.sql
```

| 출력 | 기대값 |
| --- | --- |
| `can_delete` | `1` |
| `deleted_test_posts` | `3` |
| `remaining_test_posts` | `0` |

`can_delete=0`이면 `restore_time_kst`가 4단계의 목표 시각인지 확인하고, 목표 시각에서 1분이 지난 뒤 다시 실행합니다. 목표 시각이 비어 있거나 잘못됐다면 4단계부터 다시 진행합니다. 이미 삭제했다면 재실행 시 `deleted_test_posts=0`이므로 처음 삭제했을 때의 결과를 보관합니다.

## 6. 지정 시점으로 새 Cloud DB 복구

콘솔 **Cloud DB for MySQL > Backup > 원본 `board-service` 상세내역 > 시점 복원**에서 진행합니다.

| 설정 | 입력·선택 |
| --- | --- |
| DB 복원 시간 | `/tmp/403-pitr/restore-time.txt`에 저장한 시각 |
| 신규 DB 서비스로 생성 | 선택 |
| DB 서비스 이름 | 예: `board-pitr` |
| DB Server 이름 | 예: `board-pitr` |
| VPC·Subnet | Backend에서 접근 가능한 같은 VPC의 DB 서브넷 |
| 고가용성 | 사용 |

시점이 맞는지 확인하고 **복원하기/생성**을 실행합니다. 새 서비스가 `운영중`이 되면 **복구한 DB의 Private 도메인**을 기록합니다. 복구 서버 비용이 추가되므로 실습 후 유지할 서비스를 정리합니다. [공식 복원 절차](https://guide.ncloud-docs.com/docs/database-database-5-4)

복구 DB의 ACG Inbound에 Backend 사설 IP의 TCP `3306`을 허용하고, Backend Outbound에서도 복구 DB의 TCP `3306` 접근을 확인합니다. 복구 DB의 **DB User 관리**에서 `board_app`의 HOST·CRUD 권한과 비밀번호를 원본과 동일하게 맞춥니다.

`신규 DB 서비스로 생성`을 선택하지 않아 읽기 전용 `Recovery`로 만들었다면, 해당 서버의 **DB 관리 > 신규 DB 서비스 생성**으로 전환한 뒤 다음 단계를 진행합니다. Backend를 쓰기 가능한 DB에 연결해야 합니다.

## 7. 삭제 전 데이터가 돌아왔는지 검증

Backend에서 복구 DB의 실제 Private 도메인을 입력합니다.

```bash
read -r -p '복구한 Cloud DB Private 도메인: ' RECOVERED_DB_HOST
mysql --protocol=TCP --default-character-set=utf8mb4 --table \
  -h "${RECOVERED_DB_HOST:?복구 DB 주소를 입력하세요}" \
  -P 3306 -u board_app -p board_service \
  < /tmp/403-pitr/pitr-verify.sql | tee /tmp/403-pitr/restored.txt
```

삭제 전 기록과 복구 DB의 출력값을 대조합니다.

```bash
cat /tmp/403-pitr/before.txt
cat /tmp/403-pitr/restored.txt
```

| 확인 항목 | 통과 기준 |
| --- | --- |
| 접속 대상 | `connected_server`가 원본과 다른 복구 서버 |
| 쓰기 가능 상태 | `read_only=0` |
| 시험 글 | `test_posts=3`, 3개 글의 ID·내용·작성 시각이 삭제 전과 같음 |
| 게시글 전체 | 행 수, `checksum_sum`, `checksum_xor`가 삭제 전과 같음 |
| 회원·관리자·공지 | `users/notices` 행 수와 역할별 계정 수가 삭제 전과 같음 |

복구한 DB를 삭제 이후의 원본 DB와 비교하면 시험 글 3개 차이가 나는 것이 정상입니다. **삭제 전 `before.txt`가 복구 검증 기준**입니다. 결과가 다르면 Backend 전환 전에 복구 시각·접속 도메인을 확인합니다.

## 8. Backend를 복구 DB로 전환

검증이 끝나면 402와 같은 방식으로 **원본 `.env`에서 `DB_HOST`만 바꾸고 설치 스크립트를 다시 실행**합니다.

502 Terraform 기본 설치 경로:

```bash
cd /opt/lab7-setup/backend
sudo vi .env
```

003에서 직접 설치했다면 해당 설치 폴더에서 엽니다.

```bash
cd "$HOME/cloud-infrastructure-lecture-example/003-three tier web app/backend"
sudo vi .env
```

둘 중 실제 설치한 폴더 한 곳에서 `DB_HOST`를 7단계의 **복구 DB Private 도메인**으로 변경하고 저장합니다. 그 폴더에서 다음 명령을 실행합니다.

```bash
sudo ./install-backend.sh
sudo grep '^DB_HOST=' /opt/board-service-backend/.env
curl -fsS http://localhost:4000/api/health
curl -fsS http://localhost:4000/api/posts
```

`DB_HOST`가 복구 DB이고, Health가 `status: ok`, 게시글 API에 실습 글 3개가 보이면 Backend 연결이 확인된 것입니다. 설치 완료 메시지만으로 DB 연결 성공을 판단하지 않습니다. `AUTO_POST_ENABLED=true`이면 자동 작성기도 함께 시작되어 이때부터 복구 DB의 글 수가 늘 수 있습니다.

## 9. 게시판 재개와 완료 확인

1. 게시판의 **관리자 로그인 → 공지 관리**를 엽니다.
2. 이관된 기존 관리자 계정으로 로그인하고, **공지 종료 / 점검 해제**를 적용합니다.
3. 게시판에 `[403 PITR] 복구 실습 1~3`이 다시 보이는지 확인합니다.
4. 일반 회원 로그인과 새 글 등록도 확인합니다.

**완료 기준:** 삭제됐던 글이 같은 ID로 복원됐고, Backend가 새 DB에서 게시글을 읽고 쓸 수 있어야 합니다. 원본과 복구 DB는 서로 다른 서비스이며, 전환 후 새 데이터는 복구 DB에 쌓입니다.

원본 DB의 정리는 복구 결과와 필요한 백업을 확인한 뒤 진행합니다. 실습 파일은 `/tmp/403-pitr`에 있으며, 서버를 재부팅하면 없어질 수 있으므로 `before.txt`, `restored.txt`, `restore-time.txt`를 실습 기록으로 보관합니다.
