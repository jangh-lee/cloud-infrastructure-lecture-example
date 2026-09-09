# 403 Cloud DB 특정 시점 복구(PITR)

402에서 이관한 `board_service`를 대상으로 **시험 글 삭제 → 지정 시점 복구 → 데이터 검증 → Backend 전환**을 실습합니다.

전체 절차는 [403 Cloud DB 특정 시점 복구(PITR) 교안](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/403-database-backup-recovery/)을 순서대로 진행합니다.

1. 원본 Cloud DB의 HA·백업·실제 복구 가능한 시간 범위를 확인합니다.
2. 게시판 점검 공지를 적용하고 Backend와 자동 작성기를 중지합니다.
3. 기존 `posts`에 실습용 글 3개를 준비하고 삭제 전 기준값을 저장합니다.
4. 분 단위 복구 목표 시각을 확보한 뒤 실습용 글만 삭제합니다.
5. 콘솔의 **시점 복원**으로 새 Cloud DB 서비스 `board-pitr`를 생성합니다.
6. 삭제 전 기록과 복구 DB의 글·회원·관리자·공지를 대조합니다.
7. Backend 설치 폴더의 `.env`에서 `DB_HOST`만 수정하고 `sudo ./install-backend.sh`를 다시 실행합니다.
8. 게시판 로그인·조회·작성을 확인하고 점검을 해제합니다.

## 실습 SQL

| 파일 | 역할 |
| --- | --- |
| [pitr-prepare.sql](sql/pitr-prepare.sql) | 전용 표시가 있는 시험 글 3개 준비. 재실행 시 중복 추가 방지 |
| [pitr-verify.sql](sql/pitr-verify.sql) | 서버 식별, 쓰기 가능 여부, 행 수·시험 글·게시글 체크섬 확인 |
| [pitr-delete.sql](sql/pitr-delete.sql) | 목표 시각에서 1분이 지난 뒤 시험 글 3개만 삭제 |

삭제 파일에는 같은 MySQL 세션의 `@pitr_time`이 필요합니다. 교안의 `--init-command`가 이 값을 전달하며, 시각이 없거나 아직 이르면 삭제하지 않습니다. SQL 파일은 Bash에서 직접 실행하지 않고 교안의 `mysql ... < 파일.sql` 명령으로 전달합니다.

PITR은 원본에 덮어쓰지 않고 별도 복구 DB를 만듭니다. 이번 실습은 **신규 DB 서비스로 생성**하여 쓰기 가능한 상태에서 검증·전환합니다. 지원 조건과 콘솔 동작은 [Naver Cloud 공식 Backup 안내](https://guide.ncloud-docs.com/docs/database-database-5-4)를 참고합니다.
