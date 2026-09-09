#!/usr/bin/env python3
"""Copy new DB notices to Web storage; retain the last snapshot during outages."""
import importlib.util
import json
import os
from pathlib import Path
import time
from urllib.request import urlopen

spec = importlib.util.spec_from_file_location('board_notice', Path(__file__).with_name('board-notice.py'))
notice = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notice)


def sync_once(upstream):
    with urlopen(upstream.rstrip('/') + '/api/notice', timeout=5) as response:
        raw = response.read(100001)
    if len(raw) > 100000:
        raise ValueError('notice response too large')
    payload = json.loads(raw)
    if payload is None:
        return
    if (not isinstance(payload, dict) or type(payload.get('id')) is not int or payload['id'] <= 0
            or payload.get('mode') not in ('announce', 'maintenance', 'normal')
            or not isinstance(payload.get('title'), str) or len(payload['title']) > 200
            or not isinstance(payload.get('message'), str) or len(payload['message']) > 10000):
        raise ValueError('invalid notice snapshot')
    with notice.state_lock():
        cursor = notice.STATE_DIR / 'last-notice-id'
        if cursor.exists() and cursor.read_text().strip() == str(payload['id']):
            return
        notice.publish({key: payload.get(key) for key in ('id', 'mode', 'title', 'message', 'updatedAt')})
        # Cursor is separate from the public file: CLI changes survive subsequent polls.
        pending = notice.STATE_DIR / '.last-notice-id'
        pending.write_text(str(payload['id']))
        pending.replace(cursor)


def main():
    upstream = os.environ['BACKEND_UPSTREAM']
    failed = False
    while True:
        try:
            sync_once(upstream)
            if failed:
                print('Notice sync recovered.', flush=True)
            failed = False
        except Exception as error:
            if not failed:
                print(f'Notice sync unavailable ({type(error).__name__}); retaining cached notice.', flush=True)
            failed = True
        time.sleep(2)


if __name__ == '__main__':
    main()
