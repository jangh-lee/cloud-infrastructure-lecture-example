-- MariaDB 관리자 계정으로 실제 DB 사용자와 권한을 확인합니다.
-- 게시판의 author_name은 표시 이름이며, 아래 DB 계정과는 다른 개념입니다.
-- 실행 예시:
-- sudo mariadb -u root -p < db/queries/database-accounts.sql

SELECT
  User AS user_name,
  Host AS allowed_host,
  plugin AS authentication_plugin
FROM mysql.user
ORDER BY User, Host;

SELECT
  GRANTEE,
  PRIVILEGE_TYPE,
  IS_GRANTABLE
FROM information_schema.USER_PRIVILEGES
ORDER BY GRANTEE, PRIVILEGE_TYPE;

SELECT
  GRANTEE,
  TABLE_SCHEMA,
  PRIVILEGE_TYPE,
  IS_GRANTABLE
FROM information_schema.SCHEMA_PRIVILEGES
WHERE TABLE_SCHEMA = 'board_service'
ORDER BY GRANTEE, PRIVILEGE_TYPE;
