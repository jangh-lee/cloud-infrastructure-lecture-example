#!/usr/bin/env bash

set -euo pipefail

SOURCE_DB_HOST="${SOURCE_DB_HOST:?SOURCE_DB_HOST is required}"
SOURCE_DB_PORT="${SOURCE_DB_PORT:-3306}"
SOURCE_DB_USER="${SOURCE_DB_USER:?SOURCE_DB_USER is required}"
SOURCE_DB_PASSWORD="${SOURCE_DB_PASSWORD:?SOURCE_DB_PASSWORD is required}"
TARGET_DB_HOST="${TARGET_DB_HOST:?TARGET_DB_HOST is required}"
TARGET_DB_PORT="${TARGET_DB_PORT:-3306}"
TARGET_DB_USER="${TARGET_DB_USER:?TARGET_DB_USER is required}"
TARGET_DB_PASSWORD="${TARGET_DB_PASSWORD:?TARGET_DB_PASSWORD is required}"
DB_NAME="${DB_NAME:-chapter3_board}"

schema_query="
SELECT COALESCE(GROUP_CONCAT(
  CONCAT_WS(':',
    ORDINAL_POSITION,
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_KEY,
    COALESCE(COLUMN_DEFAULT, '<NULL>'),
    EXTRA,
    COALESCE(CHARACTER_SET_NAME, '<NULL>'),
    COALESCE(COLLATION_NAME, '<NULL>')
  )
  ORDER BY ORDINAL_POSITION SEPARATOR '|'
), '')
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'posts';
"

data_query="
SELECT
  COUNT(*),
  COALESCE(MIN(id), 0),
  COALESCE(MAX(id), 0),
  COALESCE(SUM(CAST(row_crc AS UNSIGNED)), 0),
  COALESCE(BIT_XOR(row_crc), 0)
FROM (
  SELECT
    id,
    CRC32(CONCAT_WS(
      CHAR(31),
      CAST(id AS CHAR),
      title,
      content,
      author_name,
      CAST(UNIX_TIMESTAMP(created_at) AS CHAR)
    )) AS row_crc
  FROM posts
) AS post_fingerprints;
"

row_fingerprint_query="
SELECT
  id,
  CHAR_LENGTH(title),
  CHAR_LENGTH(content),
  CRC32(CONCAT_WS(
    CHAR(31),
    CAST(id AS CHAR),
    title,
    content,
    author_name,
    CAST(UNIX_TIMESTAMP(created_at) AS CHAR)
  ))
FROM posts
ORDER BY id;
"

query_database() {
  local host="$1"
  local port="$2"
  local user="$3"
  local password="$4"
  local query="$5"

  MYSQL_PWD="${password}" mysql \
    --batch \
    --skip-column-names \
    -h "${host}" \
    -P "${port}" \
    -u "${user}" \
    "${DB_NAME}" \
    -e "${query}"
}

source_schema="$(query_database "${SOURCE_DB_HOST}" "${SOURCE_DB_PORT}" "${SOURCE_DB_USER}" "${SOURCE_DB_PASSWORD}" "${schema_query}")"
target_schema="$(query_database "${TARGET_DB_HOST}" "${TARGET_DB_PORT}" "${TARGET_DB_USER}" "${TARGET_DB_PASSWORD}" "${schema_query}")"
source_data="$(query_database "${SOURCE_DB_HOST}" "${SOURCE_DB_PORT}" "${SOURCE_DB_USER}" "${SOURCE_DB_PASSWORD}" "${data_query}")"
target_data="$(query_database "${TARGET_DB_HOST}" "${TARGET_DB_PORT}" "${TARGET_DB_USER}" "${TARGET_DB_PASSWORD}" "${data_query}")"

IFS=$'\t' read -r source_count source_first_id source_last_id source_checksum_sum source_checksum_xor <<< "${source_data}"
IFS=$'\t' read -r target_count target_first_id target_last_id target_checksum_sum target_checksum_xor <<< "${target_data}"

printf '%-18s %s\n' "Source posts:" "${source_count}"
printf '%-18s %s\n' "Target posts:" "${target_count}"
printf '%-18s %s .. %s\n' "Source ID range:" "${source_first_id}" "${source_last_id}"
printf '%-18s %s .. %s\n' "Target ID range:" "${target_first_id}" "${target_last_id}"
printf '%-18s %s / %s\n' "Source checksum:" "${source_checksum_sum}" "${source_checksum_xor}"
printf '%-18s %s / %s\n' "Target checksum:" "${target_checksum_sum}" "${target_checksum_xor}"

validation_failed=false

if [[ -z "${source_schema}" || -z "${target_schema}" ]]; then
  echo "WARN: posts schema was not found on Source or Target."
  validation_failed=true
elif [[ "${source_schema}" != "${target_schema}" ]]; then
  echo "WARN: posts column definitions differ."
  validation_failed=true
else
  echo "OK: posts column definitions match."
fi

if [[ "${source_data}" != "${target_data}" ]]; then
  echo "WARN: post counts, ID ranges, or content checksums differ."
  source_rows="$(query_database "${SOURCE_DB_HOST}" "${SOURCE_DB_PORT}" "${SOURCE_DB_USER}" "${SOURCE_DB_PASSWORD}" "${row_fingerprint_query}")"
  target_rows="$(query_database "${TARGET_DB_HOST}" "${TARGET_DB_PORT}" "${TARGET_DB_USER}" "${TARGET_DB_PASSWORD}" "${row_fingerprint_query}")"
  echo "Row fingerprint differences (id, title length, content length, checksum):"
  diff_output="$(diff -u -L Source -L Target \
    <(printf '%s\n' "${source_rows}") \
    <(printf '%s\n' "${target_rows}") || true)"
  printf '%s\n' "${diff_output}" | sed -n '1,80p'
  validation_failed=true
else
  echo "OK: post data fingerprints match."
fi

if [[ "${validation_failed}" == "true" ]]; then
  exit 2
fi
