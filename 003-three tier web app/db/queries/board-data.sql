-- 007 게시판 DB의 구조와 데이터 적재 상태를 확인합니다.
-- 실행 예시:
-- mysql -h DB_SERVER_PRIVATE_IP -u board_app -p board_service < db/queries/board-data.sql

SELECT
  DATABASE() AS database_name,
  CURRENT_USER() AS authenticated_account,
  USER() AS connection_account,
  VERSION() AS database_version;

SHOW GRANTS FOR CURRENT_USER;
SHOW TABLES;
SHOW CREATE TABLE posts;

SELECT
  COUNT(*) AS total_posts,
  COUNT(DISTINCT author_name) AS distinct_authors,
  MIN(id) AS first_post_id,
  MAX(id) AS last_post_id,
  MIN(created_at) AS first_created_at,
  MAX(created_at) AS last_created_at
FROM posts;

SELECT
  id,
  title,
  content,
  CHAR_LENGTH(title) AS title_length,
  CHAR_LENGTH(content) AS content_length,
  author_name,
  created_at
FROM posts
ORDER BY id DESC
LIMIT 10;

SELECT
  COALESCE(SUM(CASE WHEN TRIM(title) = '' THEN 1 ELSE 0 END), 0) AS empty_title_count,
  COALESCE(SUM(CASE WHEN TRIM(content) = '' THEN 1 ELSE 0 END), 0) AS empty_content_count,
  COALESCE(SUM(CASE WHEN TRIM(author_name) = '' THEN 1 ELSE 0 END), 0) AS empty_author_count,
  COALESCE(SUM(CASE WHEN created_at > CURRENT_TIMESTAMP THEN 1 ELSE 0 END), 0) AS future_created_at_count
FROM posts;

SELECT
  title,
  author_name,
  COUNT(*) AS duplicate_candidate_count
FROM posts
GROUP BY title, author_name
HAVING COUNT(*) > 1
ORDER BY duplicate_candidate_count DESC, title;

SELECT
  author_name,
  COUNT(*) AS post_count,
  MIN(created_at) AS first_post_at,
  MAX(created_at) AS latest_post_at
FROM posts
GROUP BY author_name
ORDER BY post_count DESC, author_name;

SELECT
  DATE(created_at) AS created_date,
  COUNT(*) AS post_count
FROM posts
GROUP BY DATE(created_at)
ORDER BY created_date DESC
LIMIT 14;
