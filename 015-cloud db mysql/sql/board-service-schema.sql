USE `board_service`;

CREATE TABLE IF NOT EXISTS posts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  author_name VARCHAR(100) NOT NULL DEFAULT '비가입 유저',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

INSERT INTO posts (title, content, author_name)
SELECT
  'Cloud DB 연결 완료',
  '게시판 백엔드가 Naver Cloud DB for MySQL을 사용합니다.',
  'system'
WHERE NOT EXISTS (
  SELECT 1
  FROM posts
  WHERE title = 'Cloud DB 연결 완료'
);
