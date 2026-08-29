# 015 Auto Scaling Hands-on

## 목표

007번 게시판의 Backend를 Naver Cloud Auto Scaling Group으로 전환하고, CPU 부하에 따라 서버가 자동 확장·축소되는 전체 흐름을 확인합니다.

```text
고정 Web 서버
  -> Public Application Load Balancer :80
  -> Target Group :4000
  -> Auto Scaling Backend 1~3대
  -> Cloud DB for MySQL :3306
```

## 완료 기준

- Load Balancer의 Health API가 HTTP `200`을 반환합니다.
- Web 게시판에서 글을 등록하고 조회할 수 있습니다.
- 부하 전에는 Backend hostname 1개가 보입니다.
- CPU 50% 이상 이벤트로 Backend가 2대 이상이 됩니다.
- 새 Backend가 Target Group에서 정상 상태가 됩니다.
- 요청이 여러 Backend로 분산됩니다.
- 부하 종료 후 Backend가 최소 용량 1대로 감소합니다.
- Scale-in 뒤에도 Cloud DB의 게시글이 유지됩니다.

## 1. 골든 Backend 준비

```bash
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd "cloud-infrastructure-lecture-example/015-auto scaling/scripts"

sudo -E \
  DB_HOST='db-xxxx.vpc-cdb.ntruss.com' \
  DB_NAME='chapter3_board' \
  DB_USER='chapter3_user' \
  DB_PASSWORD='CHANGE_ME' \
  FRONTEND_ORIGIN='http://WEB_SERVER_PUBLIC_IP' \
  ./prepare-backend-image.sh
```

로컬 확인:

```bash
curl -i http://127.0.0.1:4000/api/health
curl -i http://127.0.0.1:4000/api/instance
curl -i 'http://127.0.0.1:4000/api/stress?iterations=10000'
```

골든 서버에서 `chapter3-backend`가 `active`, `enabled`인지 확인한 뒤 `lab-board-backend-image-v1` Server Image를 생성합니다.

## 2. Target Group과 Load Balancer

Target Group:

| 항목 | 값 |
| --- | --- |
| 프로토콜 / 포트 | `HTTP / 4000` |
| Health Check | `GET /api/health` |
| 주기 / 임계값 | `10초 / 정상 2 / 실패 3` |
| 알고리즘 | Round Robin |
| Sticky Session | 사용 안 함 |

Public Application Load Balancer:

| 항목 | 값 |
| --- | --- |
| Listener | `HTTP :80` |
| Target Group | `lab-board-tg` |
| Subnet | Public `LOADB` Subnet |

확인:

```bash
export LB_URL='http://LOAD_BALANCER_DOMAIN'
./verify-backend.sh "${LB_URL}"
./smoke-test-board.sh "${LB_URL}"
```

## 3. Web 서버 전환

```bash
cd "007-three tier web app/web"
sudo sed -i "s|^BACKEND_BASE_URL=.*|BACKEND_BASE_URL=\"${LB_URL}\"|" .env
sudo ./install-web.sh
curl http://127.0.0.1/config.js
```

브라우저에서 글쓰기와 조회를 확인합니다.

## 4. Launch Configuration과 ASG

Launch Configuration은 생성한 Server Image와 수업용 2 vCPU 이상 스펙을 사용합니다. 앱과 설정이 Image에 포함되어 있으므로 Init Script는 생략합니다.

Auto Scaling Group 권장값:

| 항목 | 값 |
| --- | --- |
| 최소 / 최대 / 기대 | `1 / 3 / 1` |
| 상세 모니터링 | 사용 |
| 기본 Cooldown | `300초` |
| Health Check | Load Balancer |
| Health Check Grace Period | `300초` |
| Target Group | `lab-board-tg` |
| Scale-out Policy | `+1`, Cooldown `300초` |
| Scale-in Policy | `-1`, Cooldown `300초` |

첫 ASG Backend가 정상 등록되면 골든 서버를 Target Group에서 제거합니다.

## 5. Cloud Insight Scale-out Rule

| 항목 | 값 |
| --- | --- |
| 감시 대상 | `Server (VPC)`의 `lab-board-asg` |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `>= 50` |
| 집약 / 지속 | `AVG / 1 minute` |
| 액션 | `scale-out-add-1` |

`CPU/used_rto`가 아니라 서버 평균 CPU Metric을 선택합니다.

## 6. 부하 및 Scale-out

```bash
REQUEST_COUNT=40 ./check-distribution.sh "${LB_URL}"

DURATION_SECONDS=600 \
CONCURRENCY=20 \
ITERATIONS=250000 \
./run-load-test.sh "${LB_URL}"
```

관찰 순서:

1. 평균 CPU 50% 이상
2. Event 발생
3. ASG 실행 이력에 Scale-out Policy 표시
4. 서버 수 증가
5. 새 Target 정상 전환

분산과 DB 쓰기를 확인합니다.

```bash
REQUEST_COUNT=100 ./check-distribution.sh "${LB_URL}"
./smoke-test-board.sh "${LB_URL}"
```

## 7. Scale-in

Scale-out 확인 후 부하를 중지하고 Scale-in Event Rule을 생성합니다.

| 항목 | 값 |
| --- | --- |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `< 20` |
| 집약 / 지속 | `AVG / 5 minutes` |
| 액션 | `scale-in-remove-1` |

최종 확인:

```bash
REQUEST_COUNT=40 ./check-distribution.sh "${LB_URL}"
./verify-backend.sh "${LB_URL}"
./smoke-test-board.sh "${LB_URL}"
```

상세 콘솔 입력값, 트러블슈팅, 비용 정리 순서는 저장소의 [`015-auto scaling/README.md`](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/tree/main/015-auto%20scaling)를 확인합니다.
