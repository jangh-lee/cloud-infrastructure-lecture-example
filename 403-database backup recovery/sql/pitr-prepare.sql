-- 기존 게시판에 이번 PITR 실습용 글 3개를 준비합니다. 재실행해도 중복 추가하지 않습니다.
SET SESSION time_zone = '+09:00';

INSERT INTO posts (title, content, author_name)
SELECT sample.title, '403 PITR 복구 확인용 게시글', '403-pitr'
FROM (
  SELECT '[403 PITR] 복구 실습 1' AS title
  UNION ALL SELECT '[403 PITR] 복구 실습 2'
  UNION ALL SELECT '[403 PITR] 복구 실습 3'
) AS sample
LEFT JOIN posts AS existing
  ON existing.title = sample.title
  AND existing.content = '403 PITR 복구 확인용 게시글'
  AND existing.author_name = '403-pitr'
WHERE existing.id IS NULL;

SELECT ROW_COUNT() AS added_test_posts, NOW() AS prepared_at_kst;
SELECT id, title, content, author_name, created_at
FROM posts
WHERE author_name = '403-pitr'
  AND content = '403 PITR 복구 확인용 게시글'
  AND title IN ('[403 PITR] 복구 실습 1', '[403 PITR] 복구 실습 2', '[403 PITR] 복구 실습 3')
ORDER BY id;
