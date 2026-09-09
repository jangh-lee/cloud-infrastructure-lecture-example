-- --init-command로 전달한 @pitr_time은 한국시간이며 분 경계(초=00)입니다.
-- 목표 시각에서 1분이 지나야 실습용 글만 삭제합니다. 시각이 없으면 삭제하지 않습니다.
SET SESSION time_zone = '+09:00';
SET @can_delete = COALESCE(
  NOW() >= CAST(@pitr_time AS DATETIME) + INTERVAL 1 MINUTE, 0
);

SELECT NOW() AS db_now_kst, @pitr_time AS restore_time_kst, @can_delete AS can_delete;

DELETE FROM posts
WHERE @can_delete = 1
  AND author_name = '403-pitr'
  AND content = '403 PITR 복구 확인용 게시글'
  AND title IN ('[403 PITR] 복구 실습 1', '[403 PITR] 복구 실습 2', '[403 PITR] 복구 실습 3');

SELECT ROW_COUNT() AS deleted_test_posts, NOW() AS deleted_at_kst;
SELECT COUNT(*) AS remaining_test_posts
FROM posts
WHERE author_name = '403-pitr'
  AND content = '403 PITR 복구 확인용 게시글'
  AND title IN ('[403 PITR] 복구 실습 1', '[403 PITR] 복구 실습 2', '[403 PITR] 복구 실습 3');
