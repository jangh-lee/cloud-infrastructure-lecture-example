# 015 Auto Scaling Hands-on

## 실습 목표

007번 게시판의 Backend를 Naver Cloud Auto Scaling Group으로 전환하고 CPU 부하에 따른 Scale-out과 Scale-in을 직접 확인합니다.

이 실습은 별도 자동화 스크립트를 사용하지 않습니다. Health, CRUD, 분산, 부하 테스트를 기본 CLI 명령으로 한 단계씩 실행하고 결과를 읽습니다.

```text
고정 Web 서버
  -> Public Application Load Balancer :80
  -> Target Group :4000
  -> Auto Scaling Backend 1~3대
  -> Cloud DB for MySQL :3306
```

## 완료 기준

- ALB Health API가 HTTP `200`입니다.
- 응답에서 Backend hostname을 확인합니다.
- 게시글을 작성하고 Cloud DB에서 다시 읽습니다.
- CPU 50% 이상에서 Backend가 2대 이상으로 증가합니다.
- 요청이 여러 hostname으로 분산됩니다.
- CPU 20% 미만에서 최소 용량 1대로 감소합니다.
- Scale-in 뒤에도 게시글이 유지됩니다.

## 1. 골든 Backend 설정

저장소를 준비합니다.

```bash
sudo apt-get update
```

```bash
sudo apt-get install -y git curl
```

```bash
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
```

```bash
cd ~/cloud-infrastructure-lecture-example/007-three\ tier\ web\ app/backend
```

환경 파일을 직접 작성합니다.

```bash
cp .env.example .env
```

```bash
nano .env
```

```env
PORT=4000
FRONTEND_ORIGIN=http://WEB_SERVER_PUBLIC_IP
DB_HOST=db-xxxx.vpc-cdb.ntruss.com
DB_PORT=3306
DB_NAME=chapter3_board
DB_USER=chapter3_user
DB_PASSWORD=CHANGE_ME
AUTO_POST_ENABLED=false
AUTO_POST_INTERVAL_SECONDS=60
AUTO_POST_TOTAL=300
AUTO_POST_API_URL=http://127.0.0.1:4000/api/posts
LAB_STRESS_ENABLED=true
```

기존 007 Backend 설치기를 실행합니다.

```bash
chmod +x install-backend.sh
```

```bash
sudo ./install-backend.sh
```

앱 설치만 기존 스크립트를 재사용하며 Auto Scaling 생성과 검증은 직접 수행합니다.

## 2. 설치 결과 직접 확인

```bash
systemctl is-enabled chapter3-backend
```

```bash
systemctl is-active chapter3-backend
```

```bash
sudo ss -lntp | grep ':4000'
```

```bash
curl -i http://127.0.0.1:4000/api/health
```

```bash
curl -s http://127.0.0.1:4000/api/instance | python3 -m json.tool
```

```bash
curl -i 'http://127.0.0.1:4000/api/stress?iterations=10000'
```

확인할 값:

- `enabled`, `active`
- `HTTP/1.1 200 OK`
- `X-Backend-Instance`
- Stress 응답 `ok`

확인이 끝나면 `lab-board-backend-image-v1` Server Image를 생성합니다.

## 3. Target Group과 ALB

Target Group:

| 항목 | 값 |
| --- | --- |
| 프로토콜 / 포트 | HTTP / `4000` |
| Health Check | `GET /api/health` |
| 주기 | 10초 |
| 정상 / 실패 임계값 | 2 / 3 |
| 알고리즘 | Round Robin |
| Sticky Session | 사용 안 함 |

골든 Backend를 최초 Target으로 넣고 `정상` 상태를 확인합니다.

Application Load Balancer:

| 항목 | 값 |
| --- | --- |
| Network | Public IP |
| Listener | HTTP `80` |
| Subnet | Public LOADB Subnet |
| Target Group | `lab-board-tg` |

ALB 도메인을 변수로 지정합니다.

```bash
export LB_URL='http://LOAD_BALANCER_DOMAIN'
```

```bash
curl -i "$LB_URL/api/health"
```

게시글을 직접 작성합니다.

```bash
curl -sS -X POST "$LB_URL/api/posts" -H 'Content-Type: application/json' -d '{"title":"autoscaling-before","content":"ALB 경유 쓰기 확인","authorName":"autoscaling-lab"}' | python3 -m json.tool
```

다시 조회합니다.

```bash
curl -sS "$LB_URL/api/posts" | python3 -m json.tool | head -40
```

## 4. Web 서버의 API 주소 변경

```bash
cd ~/cloud-infrastructure-lecture-example/007-three\ tier\ web\ app/web
```

```bash
nano .env
```

```env
BACKEND_BASE_URL="http://LOAD_BALANCER_DOMAIN"
```

```bash
sudo ./install-web.sh
```

```bash
cat /var/www/chapter3-web/config.js
```

브라우저에서 게시글을 작성하고 개발자 도구 Network 탭에서 API 요청 대상이 ALB인지 확인합니다.

## 5. Launch Configuration과 ASG

Launch Configuration:

| 항목 | 값 |
| --- | --- |
| Server Image | `lab-board-backend-image-v1` |
| 서버 스펙 | 2 vCPU 이상 권장 |
| Init Script | 사용 안 함 |
| 이름 | `lab-board-lc-v1` |

Auto Scaling Group:

| 항목 | 값 |
| --- | --- |
| 최소 / 최대 / 기대 | `1 / 3 / 1` |
| 상세 모니터링 | 사용 |
| 기본 Cooldown | 300초 |
| Health Check | Load Balancer |
| Grace Period | 300초 |
| Target Group | `lab-board-tg` |
| Backend ACG | `lab-asg-backend-acg` |

Policy:

| 이름 | 변경 값 |
| --- | --- |
| `scale-out-add-1` | `+1` |
| `scale-in-remove-1` | `-1` |

ASG 서버가 Target Group에서 정상 상태가 되면 골든 Backend를 Target에서 제거합니다.

## 6. 부하 전 hostname 확인

```bash
for i in $(seq 1 20); do curl -fsS -D - -o /dev/null "$LB_URL/api/instance" | awk -F': ' 'tolower($1)=="x-backend-instance" {gsub("\r","",$2); print $2}'; done | sort | uniq -c
```

예상 출력:

```text
20 lab-board-api-xxxxx
```

## 7. Scale-out Event Rule

| 항목 | 값 |
| --- | --- |
| 감시 대상 | Server (VPC)의 `lab-board-asg` |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `>= 50` |
| 집약 / 지속 | AVG / 1 minute |
| 액션 | `scale-out-add-1` |

## 8. ApacheBench 부하

Ubuntu 설치:

```bash
sudo apt-get update && sudo apt-get install -y apache2-utils
```

10분 부하:

```bash
ab -t 600 -c 20 "$LB_URL/api/stress?iterations=250000"
```

CPU가 부족하면 동시성을 높입니다.

```bash
ab -t 600 -c 40 "$LB_URL/api/stress?iterations=250000"
```

콘솔에서 순서대로 확인합니다.

1. Cloud Insight 평균 CPU 50% 이상
2. Event 발생
3. ASG 실행 이력에 `scale-out-add-1`
4. 서버 수 `1 → 2`
5. 새 Target `정상`

## 9. 확장 중 분산 확인

```bash
while true; do date; for i in $(seq 1 30); do curl -fsS -D - -o /dev/null "$LB_URL/api/instance" | awk -F': ' 'tolower($1)=="x-backend-instance" {gsub("\r","",$2); print $2}'; done | sort | uniq -c; echo; sleep 10; done
```

hostname이 하나에서 두 개 이상으로 늘어나는 시점을 직접 확인하고 `Ctrl+C`로 종료합니다.

확장 후 게시글을 작성합니다.

```bash
curl -sS -X POST "$LB_URL/api/posts" -H 'Content-Type: application/json' -d '{"title":"autoscaling-after","content":"Scale-out 후 쓰기 확인","authorName":"autoscaling-lab"}' | python3 -m json.tool
```

## 10. Scale-in

부하를 중지한 뒤 Scale-in Event Rule을 생성합니다.

| 항목 | 값 |
| --- | --- |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `< 20` |
| 집약 / 지속 | AVG / 5 minutes |
| 액션 | `scale-in-remove-1` |

확인 순서:

1. CPU 20% 미만 유지
2. Scale-in Event 발생
3. ASG 실행 이력에 `scale-in-remove-1`
4. 서버 수가 최소 용량 1대까지 감소
5. 종료 서버가 Target Group에서 제거

## 11. 최종 검증

```bash
curl -i "$LB_URL/api/health"
```

```bash
curl -sS "$LB_URL/api/posts" | python3 -m json.tool | grep -E 'autoscaling-before|autoscaling-after'
```

```bash
for i in $(seq 1 20); do curl -fsS -D - -o /dev/null "$LB_URL/api/instance" | awk -F': ' 'tolower($1)=="x-backend-instance" {gsub("\r","",$2); print $2}'; done | sort | uniq -c
```

Scale-in 뒤 hostname은 하나이고 두 게시글이 모두 남아 있으면 완료입니다.

상세한 ACG 값, 화면별 통과 기준, 트러블슈팅과 비용 정리 순서는 [GitHub 상세 교재](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/tree/main/015-auto%20scaling)를 확인합니다.
