-- Source DB only, before DMS. Re-running preserves all rows and identifiers.
-- MySQL and MariaDB compatible; each ALTER is skipped after successful application.
SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'seed_author'),
  'SELECT 1',
  'ALTER TABLE users ADD COLUMN seed_author TINYINT UNSIGNED NULL,
    ADD UNIQUE KEY users_seed_author_unique (seed_author)'
);
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @ddl = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND COLUMN_NAME = 'author_id'),
  'SELECT 1',
  'ALTER TABLE posts ADD COLUMN author_id BIGINT NULL,
    ADD COLUMN seed_index INT UNSIGNED NULL,
    ADD UNIQUE KEY posts_seed_index_unique (seed_index),
    ADD CONSTRAINT posts_author_fk FOREIGN KEY (author_id) REFERENCES users (id)'
);
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
