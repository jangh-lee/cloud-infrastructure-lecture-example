-- 삭제 전 원본과 복구 DB에 같은 쿼리를 실행해 결과를 비교합니다.
SET SESSION time_zone = '+09:00';

SELECT @@hostname AS connected_server, DATABASE() AS database_name,
       CURRENT_USER() AS authenticated_account, @@read_only AS read_only;

SELECT 'posts' AS table_name, COUNT(*) AS rows_count FROM posts
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'notices', COUNT(*) FROM notices;

SELECT role, COUNT(*) AS accounts FROM users GROUP BY role ORDER BY role;

SELECT COUNT(*) AS test_posts
FROM posts
WHERE author_name = '403-pitr'
  AND content = '403 PITR 복구 확인용 게시글'
  AND title IN ('[403 PITR] 복구 실습 1', '[403 PITR] 복구 실습 2', '[403 PITR] 복구 실습 3');

SELECT id, title, content, author_name, created_at
FROM posts
WHERE author_name = '403-pitr'
  AND content = '403 PITR 복구 확인용 게시글'
  AND title IN ('[403 PITR] 복구 실습 1', '[403 PITR] 복구 실습 2', '[403 PITR] 복구 실습 3')
ORDER BY id;

SELECT COUNT(*) AS total_posts,
       COALESCE(SUM(CAST(row_crc AS UNSIGNED)), 0) AS checksum_sum,
       COALESCE(BIT_XOR(row_crc), 0) AS checksum_xor
FROM (
  SELECT CRC32(CONCAT_WS(CHAR(31), id, title, content, author_name,
    COALESCE(CAST(author_id AS CHAR), '<NULL>'),
    COALESCE(CAST(seed_index AS CHAR), '<NULL>'), UNIX_TIMESTAMP(created_at))) AS row_crc
  FROM posts
) AS fingerprints;
