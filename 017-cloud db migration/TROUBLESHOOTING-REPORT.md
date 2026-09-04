# DMS migration troubleshooting report

This report records the failures reproduced while migrating the three-tier board lab to Naver Cloud DB for MySQL. Credentials and public endpoint details are intentionally omitted.

## Final result

| Item | Result |
| --- | --- |
| Source engine | MySQL 8.4.11 |
| Target engine | Naver Cloud DB for MySQL 8.4.8 |
| Initial rows | Source 302 / Target 302 |
| CDC verification | Inserted Source row ID 303 and observed Target row ID 303 |
| Final rows | Source 303 / Target 303 |
| Schema fingerprint | Match |
| Data fingerprint | Match |
| Replication connection | `Binlog Dump`, waiting for new updates |

## Failure 1: MariaDB relay log parse error

The first DMS task completed Exporting and Importing, but failed after entering Replication.

```text
Relay log read failure: Could not parse relay log event entry
Last_SQL_Errno: 13121
Slave_IO_Running: Yes
Slave_SQL_Running: No
```

The IO thread could read the Source binlog, so this was not an ACG, routing, or credential problem. The failing position contained MariaDB-specific GTID and row events that the MySQL Target replication SQL thread could not parse.

Recovery used for the disposable lab server:

1. Back up `board_service` and the database configuration.
2. Replace MariaDB with Oracle MySQL.
3. Recreate the application and DMS users.
4. Run `prepare-source-db.sh` and `check-source-db.sh`.
5. Delete the failed DMS task and create a new task so cached engine metadata is not reused.

Do not skip the replication error in a real migration. Skipping can produce a Target that appears healthy while silently missing transactions.

## Failure 2: MySQL 8.0 export syntax error

After converting the Source to Ubuntu MySQL 8.0.46, DMS Test Connection passed and detected a Non-GTID Source. Exporting then failed with:

```text
mysqldump: Couldn't execute 'SHOW BINARY LOG STATUS':
You have an error in your SQL syntax ... near 'LOG STATUS' at line 1 (1064)
```

The DMS dump client used the MySQL 8.4 command `SHOW BINARY LOG STATUS`, while MySQL 8.0 only supports the older `SHOW MASTER STATUS` spelling. Repeating Restart does not fix this version mismatch.

Recovery used for the lab:

```bash
cd "/root/cloud-infrastructure-lecture-example/017-cloud db migration/scripts"
sudo CONFIRM_UPGRADE=YES ./upgrade-mysql-source-to-84.sh
```

The upgrade script creates a logical backup, selects MySQL 8.4 LTS from Oracle's official APT repository, preserves the DMS configuration, and verifies the row count after the upgrade.

## MySQL 8.4 authentication change

MySQL 8.4 disables `mysql_native_password` by default. The existing DMS user then fails with error 1524 even though its password and grants are correct.

The lab configuration explicitly enables the plugin for the dedicated DMS account:

```ini
[mysqld]
mysql_native_password=ON
```

`prepare-source-db.sh` adds this setting only for MySQL 8.4. Restrict the migration account host and remove the compatibility setting after the migration when the production authentication policy allows it.

## Verification commands

Source readiness:

```bash
sudo SOURCE_DB_ADMIN_PASSWORD='SOURCE_ADMIN_PASSWORD' \
  ./scripts/check-source-db.sh
```

Source and Target comparison:

```bash
SOURCE_DB_HOST='SOURCE_HOST' \
SOURCE_DB_USER='SOURCE_USER' \
SOURCE_DB_PASSWORD='SOURCE_PASSWORD' \
TARGET_DB_HOST='TARGET_HOST' \
TARGET_DB_USER='TARGET_USER' \
TARGET_DB_PASSWORD='TARGET_PASSWORD' \
DB_NAME='board_service' \
  ./scripts/compare-post-counts.sh
```

The migration is not considered successful until all of these are true:

- DMS Exporting and Importing succeeded.
- DMS is in Replication without a SQL thread error.
- Initial Source and Target schema/data fingerprints match.
- A row inserted after Replication starts appears on Target.
- The final Source and Target fingerprints still match.
