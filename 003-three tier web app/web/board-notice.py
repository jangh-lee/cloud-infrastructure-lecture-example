#!/usr/bin/env python3
"""Manage the lab's DB-independent notice on the Web server."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import tempfile

STATE_DIR = Path('/var/lib/board-service-notice')


def main():
    parser = argparse.ArgumentParser(description='게시판 공지 및 점검 화면 설정 (Web 서버에서 실행)')
    parser.add_argument('mode', choices=['announce', 'maintenance', 'clear', 'status'])
    parser.add_argument('--title', default=None)
    parser.add_argument('--message-file', help='UTF-8 본문 파일. - 는 표준 입력')
    args = parser.parse_args()
    notice_path = STATE_DIR / 'notice.json'
    if args.mode == 'status':
        print(notice_path.read_text() if notice_path.exists() else '{"mode":"normal"}')
        return
    if os.geteuid() != 0:
        parser.error('sudo board-notice 명령으로 실행하세요.')
    if args.mode == 'announce' and (STATE_DIR / 'maintenance').exists():
        parser.error('점검 해제는 Backend 정상 동작 확인 후 clear로 실행하세요.')
    if args.mode == 'clear':
        if args.title or args.message_file:
            parser.error('clear에는 제목과 본문을 지정하지 않습니다.')
        title, message = '', ''
    else:
        title = args.title or ('서비스 점검 안내' if args.mode == 'maintenance' else '공지사항')
        if not args.message_file:
            parser.error('--message-file로 공지 본문을 지정하세요. 표준 입력은 --message-file -')
        message = (sys.stdin.read() if args.message_file == '-' else
                   Path(args.message_file).read_text(encoding='utf-8')).strip()
        if not title.strip() or not message or len(title) > 200 or len(message) > 10000:
            parser.error('제목은 1~200자, 본문은 1~10000자로 입력하세요.')
    payload = dict(mode='normal' if args.mode == 'clear' else args.mode,
                   title=title, message=message,
                   updatedAt=datetime.now(timezone.utc).isoformat())
    STATE_DIR.mkdir(parents=True, exist_ok=True, mode=0o755)
    # Close public API access before publishing maintenance state.
    if args.mode == 'maintenance':
        (STATE_DIR / 'maintenance').touch(mode=0o644)
    fd, temp_path = tempfile.mkstemp(prefix='.notice-', dir=STATE_DIR)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.chmod(temp_path, 0o644)
        os.replace(temp_path, notice_path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
    if args.mode == 'clear':
        (STATE_DIR / 'maintenance').unlink(missing_ok=True)
    print('공지 상태: ' + payload['mode'])
    if args.mode == 'maintenance':
        print('공개 API 접근을 차단했습니다. Backend의 자동 게시글 생성과 API 서비스도 중지하세요:')
        print('  sudo systemctl stop board-service-post-seeder board-service-backend')
    print('브라우저에는 최대 5초 후 반영됩니다. nginx 재시작은 필요하지 않습니다.')


if __name__ == '__main__':
    main()
