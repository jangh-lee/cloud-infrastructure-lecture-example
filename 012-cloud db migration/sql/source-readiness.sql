-- DMS 마이그레이션 전에 Source DB의 설정과 읽기 권한을 확인합니다.
-- 관리자 계정으로 chapter3_board에 연결해서 실행합니다.

SELECT
  DATABASE() AS database_name,
  CURRENT_USER() AS authenticated_account,
  VERSION() AS database_version;

SHOW VARIABLES
WHERE Variable_name IN (
  'server_id',
  'log_bin',
  'binlog_format',
  'binlog_row_image',
  'expire_logs_days',
  'bind_address'
);

SHOW MASTER STATUS;

SELECT
  TABLE_NAME,
  ENGINE,
  TABLE_ROWS AS estimated_rows,
  TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'chapter3_board'
ORDER BY TABLE_NAME;

SELECT
  GRANTEE,
  PRIVILEGE_TYPE,
  IS_GRANTABLE
FROM information_schema.USER_PRIVILEGES
WHERE PRIVILEGE_TYPE IN (
  'RELOAD',
  'PROCESS',
  'SHOW DATABASES',
  'REPLICATION SLAVE',
  'REPLICATION CLIENT'
)
ORDER BY GRANTEE, PRIVILEGE_TYPE;

SELECT
  GRANTEE,
  TABLE_SCHEMA,
  PRIVILEGE_TYPE
FROM information_schema.SCHEMA_PRIVILEGES
WHERE TABLE_SCHEMA = 'chapter3_board'
ORDER BY GRANTEE, PRIVILEGE_TYPE;

SELECT
  COUNT(*) AS total_posts,
  MIN(id) AS first_post_id,
  MAX(id) AS last_post_id,
  MIN(created_at) AS first_created_at,
  MAX(created_at) AS last_created_at
FROM posts;
