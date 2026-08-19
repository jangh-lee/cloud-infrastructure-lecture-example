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


def connect(config):
    return pymysql.connect(
        host=config["host"],
        port=config["port"],
        user=config["user"],
        password=config["password"],
        database=config["database"],
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
        f"INSERT INTO `{config['table']}` "
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
    parser.add_argument("command", choices=["run", "send-once"])
    args = parser.parse_args()

    try:
        config = get_config()
        if args.command == "run":
            run_forever(config)
        elif args.command == "send-once":
            insert_event(config)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

