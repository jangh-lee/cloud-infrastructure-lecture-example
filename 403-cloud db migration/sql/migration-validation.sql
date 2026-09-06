-- Source DB와 Target DB에서 각각 실행해 구조와 데이터가 같은지 비교합니다.
-- 실행할 때 board_service를 기본 DB로 선택해야 합니다.

SELECT
  DATABASE() AS database_name,
  CURRENT_USER() AS authenticated_account,
  VERSION() AS database_version;

SELECT
  ORDINAL_POSITION,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_KEY,
  COLUMN_DEFAULT,
  EXTRA,
  CHARACTER_SET_NAME,
  COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'posts'
ORDER BY ORDINAL_POSITION;

SHOW CREATE TABLE posts;

SELECT
  COUNT(*) AS total_posts,
  MIN(id) AS first_post_id,
  MAX(id) AS last_post_id,
  MIN(created_at) AS first_created_at,
  MAX(created_at) AS last_created_at
FROM posts;

SELECT
  COUNT(*) AS total_posts,
  COALESCE(SUM(CAST(row_crc AS UNSIGNED)), 0) AS checksum_sum,
  COALESCE(BIT_XOR(row_crc), 0) AS checksum_xor
FROM (
  SELECT CRC32(CONCAT_WS(
    CHAR(31),
    CAST(id AS CHAR),
    title,
    content,
    author_name,
    CAST(UNIX_TIMESTAMP(created_at) AS CHAR)
  )) AS row_crc
  FROM posts
) AS post_fingerprints;

SELECT
  COALESCE(SUM(CASE WHEN TRIM(title) = '' THEN 1 ELSE 0 END), 0) AS empty_title_count,
  COALESCE(SUM(CASE WHEN TRIM(content) = '' THEN 1 ELSE 0 END), 0) AS empty_content_count,
  COALESCE(SUM(CASE WHEN TRIM(author_name) = '' THEN 1 ELSE 0 END), 0) AS empty_author_count,
  COALESCE(SUM(CASE WHEN created_at > CURRENT_TIMESTAMP THEN 1 ELSE 0 END), 0) AS future_created_at_count
FROM posts;

SELECT
  id,
  title,
  content,
  CHAR_LENGTH(title) AS title_length,
  CHAR_LENGTH(content) AS content_length,
  author_name,
  created_at,
  CRC32(CONCAT_WS(
    CHAR(31),
    CAST(id AS CHAR),
    title,
    content,
    author_name,
    CAST(UNIX_TIMESTAMP(created_at) AS CHAR)
  )) AS row_checksum
FROM posts
ORDER BY id DESC
LIMIT 10;

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
  COUNT(*) AS post_count
FROM posts
GROUP BY author_name
ORDER BY post_count DESC, author_name;
