#!/usr/bin/env python3
import argparse
import os
import random
import socket
import sys
import time
from datetime import datetime, timezone

import pymysql


def getenv(name, default=None, required=False):
    value = os.environ.get(name, default)
    if required and not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def get_config():
    return {
        "host": getenv("DB_HOST", required=True),
        "port": int(getenv("DB_PORT", "3306")),
        "user": getenv("DB_USER", required=True),
        "password": getenv("DB_PASSWORD", required=True),
        "database": getenv("DB_NAME", "lecture_recovery_lab"),
        "table": getenv("DB_TABLE", "recovery_events"),
        "source_id": getenv("SOURCE_ID", socket.gethostname()),
        "interval": int(getenv("INTERVAL_SECONDS", "30")),
        "connect_timeout": int(getenv("DB_CONNECT_TIMEOUT", "10")),
    }


def quote_identifier(value):
    if not value or "\x00" in value:
        raise RuntimeError(f"Invalid MySQL identifier: {value!r}")
    return f"`{value.replace('`', '``')}`"


def connect(config, use_database=True):
    return pymysql.connect(
        host=config["host"],
        port=config["port"],
        user=config["user"],
        password=config["password"],
        database=config["database"] if use_database else None,
        charset="utf8mb4",
        autocommit=True,
        connect_timeout=config["connect_timeout"],
        read_timeout=10,
        write_timeout=10,
    )


def insert_event(config):
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    message = f"heartbeat from {config['source_id']} at {now}"
    metric_value = random.randint(1, 100)

    sql = (
        f"INSERT INTO {quote_identifier(config['table'])} "
        "(source_id, event_message, metric_value) VALUES (%s, %s, %s)"
    )

    with connect(config) as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, (config["source_id"], message, metric_value))
            event_id = cursor.lastrowid

    print(
        f"inserted id={event_id} source_id={config['source_id']} "
        f"metric_value={metric_value}",
        flush=True,
    )


def check_config(config):
    print("checking MySQL server login...", flush=True)
    with connect(config, use_database=False) as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT VERSION(), CURRENT_USER()")
            version, current_user = cursor.fetchone()
            print(f"server login ok: version={version} current_user={current_user}", flush=True)

            cursor.execute(
                "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = %s",
                (config["database"],),
            )
            database_exists = cursor.fetchone() is not None

    if not database_exists:
        raise RuntimeError(
            f"database {config['database']!r} does not exist or is not visible to this user. "
            "Create it first with an admin account, or run init-schema with an account that has CREATE privilege."
        )

    print(f"checking database access: {config['database']}...", flush=True)
    with connect(config) as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT DATABASE()")
            print(f"database access ok: {cursor.fetchone()[0]}", flush=True)

            table_name = quote_identifier(config["table"])
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            row_count = cursor.fetchone()[0]
            print(f"table access ok: {config['table']} rows={row_count}", flush=True)


def init_schema(config):
    database_name = quote_identifier(config["database"])
    table_name = quote_identifier(config["table"])

    with connect(config, use_database=False) as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS {database_name} "
                "DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci"
            )
            cursor.execute(f"USE {database_name}")
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {table_name} (
                  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                  source_id VARCHAR(80) NOT NULL,
                  event_message VARCHAR(255) NOT NULL,
                  metric_value INT NOT NULL,
                  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
                  PRIMARY KEY (id),
                  KEY idx_created_at (created_at),
                  KEY idx_source_created_at (source_id, created_at)
                ) ENGINE=InnoDB
                """
            )

    print(
        f"schema ready: database={config['database']} table={config['table']}",
        flush=True,
    )


def run_forever(config):
    print(
        f"db-writer started: host={config['host']} db={config['database']} "
        f"table={config['table']} interval={config['interval']}s",
        flush=True,
    )

    while True:
        try:
            insert_event(config)
        except Exception as exc:
            print(f"insert failed: {exc}", file=sys.stderr, flush=True)
        time.sleep(config["interval"])


def main():
    parser = argparse.ArgumentParser(description="Write periodic recovery lab events to MySQL.")
    parser.add_argument("command", choices=["run", "send-once", "check", "init-schema"])
    args = parser.parse_args()

    try:
        config = get_config()
        if args.command == "run":
            run_forever(config)
        elif args.command == "send-once":
            insert_event(config)
        elif args.command == "check":
            check_config(config)
        elif args.command == "init-schema":
            init_schema(config)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
