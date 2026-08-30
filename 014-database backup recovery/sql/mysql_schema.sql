CREATE DATABASE IF NOT EXISTS lecture_recovery_lab
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'lecture_writer'@'%' IDENTIFIED BY 'ChangeThisStrongPassword!';

GRANT INSERT, SELECT ON lecture_recovery_lab.* TO 'lecture_writer'@'%';

FLUSH PRIVILEGES;

USE lecture_recovery_lab;

CREATE TABLE IF NOT EXISTS recovery_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_id VARCHAR(80) NOT NULL,
  event_message VARCHAR(255) NOT NULL,
  metric_value INT NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_created_at (created_at),
  KEY idx_source_created_at (source_id, created_at)
) ENGINE=InnoDB;

