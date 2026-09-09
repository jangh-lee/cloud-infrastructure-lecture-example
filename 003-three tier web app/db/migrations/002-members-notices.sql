-- Run once on the Source application's database before starting DMS.
-- Existing posts are unchanged. Safe to run again.
CREATE TABLE IF NOT EXISTS users (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(32) NOT NULL,
  display_name VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('member', 'admin') NOT NULL DEFAULT 'member',
  session_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY users_username_unique (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notices (
  id BIGINT NOT NULL AUTO_INCREMENT,
  created_by BIGINT NOT NULL,
  mode ENUM('announce', 'maintenance', 'normal') NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY notices_created_by_index (created_by),
  CONSTRAINT notices_created_by_fk FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
