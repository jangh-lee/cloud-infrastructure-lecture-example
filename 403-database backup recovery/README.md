# 403 Cloud DB Failover 측정

Backend에서 명령 하나를 실행해 **Failover 복구 시간과 성공 응답 데이터의 유실 여부**를 확인하는 Associate 수준 실습입니다.

[전체 GitBook 교안과 출력 해설](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/403-database-backup-recovery/)

Backend에서 실행합니다.

```bash
cd /opt/board-service-backend
sudo node failover-test.js
```

1. 정상 출력을 확인합니다.
2. Enter를 누른 뒤 콘솔의 **DB 관리 > Master DB Failover > 예**를 누릅니다.
3. 장애·복구 상태와 저장 성공 건수를 화면에서 확인합니다.
4. 새 Master에서 30초간 안정 상태가 유지되면 자동으로 결과가 출력됩니다.

측정기는 기존 `.env`와 `posts`를 사용하며 새 패키지나 시험 테이블이 필요하지 않습니다. Backend·자동 작성기는 계속 실행합니다. 기록은 `/var/log/board-failover`에 저장됩니다.

- [측정 스크립트](../003-three%20tier%20web%20app/backend/app/failover-test.js)
- [측정·데이터 분류 테스트](../003-three%20tier%20web%20app/backend/app/test/failover-test.test.js)

RTO는 목표값이고 실습에서는 관측 복구 시간을 측정해 비교합니다. 성공 응답을 받지 못한 요청은 전환 후 저장 여부를 따로 확인하며, 무조건 데이터 유실로 세지 않습니다.
