# 013 Naver Cloud Auto Scaling Hands-on

!!! info "교재와 예제 코드 연결"
    이 페이지가 013 Auto Scaling 실습의 **정본 교재**입니다. 처음부터 마지막 완료 기준까지 이 페이지 하나만 보고 진행할 수 있습니다.

    - [GitHub 013 실습 폴더](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/tree/main/013-auto%20scaling)
    - [003 게시판 Backend 코드](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/tree/main/003-three%20tier%20web%20app/backend)
    - [015 Cloud DB Migration 교재](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/015-cloud-db-migration/)

003번 3계층 게시판의 Backend를 Naver Cloud Auto Scaling Group으로 전환하는 실습입니다.

이 교재는 전용 자동화 스크립트로 결과를 감추지 않습니다. 같은 목적의 연속 명령은 한 코드 박스로 묶어 한 번에 복사하고, 결과 해석이나 실행 시점이 다른 명령만 분리했습니다. 학습자는 `curl`, `systemctl`, `awk`, `ab`의 출력과 CPU 그래프, 서버 수, Target 상태를 직접 확인합니다.

003번의 `install-backend.sh`만 앱 설치에 재사용합니다. 이 스크립트는 Node.js 패키지와 systemd 서비스를 설치하기 위한 기존 게시판 구성 요소이며, Auto Scaling 리소스 생성과 검증은 모두 직접 수행합니다.

> `GET /api/stress`는 수업용 CPU 부하 API입니다. `LAB_STRESS_ENABLED=true`인 실습 이미지에서만 열고 운영 환경에서는 사용하지 마십시오.

## 1. 학습 목표

- Server Image와 Launch Configuration의 차이를 설명할 수 있습니다.
- Target Group Health Check와 Application Load Balancer의 관계를 확인합니다.
- Auto Scaling Group의 최소, 최대, 기대 용량을 직접 설정합니다.
- Cloud Insight CPU Event Rule과 Scaling Policy를 연결합니다.
- 부하 전후의 Backend hostname을 직접 집계합니다.
- Scale-out과 Scale-in 중에도 게시판 데이터가 유지되는 이유를 확인합니다.

## 2. 완료 기준

- [ ] Load Balancer의 `/api/health`가 HTTP `200`을 반환합니다.
- [ ] 응답 헤더에서 `X-Backend-Instance`를 확인합니다.
- [ ] Load Balancer를 통해 게시글을 작성하고 조회합니다.
- [ ] 부하 전 hostname은 1개입니다.
- [ ] CPU 50% 이상 Event가 발생합니다.
- [ ] Auto Scaling Group이 1대에서 2대 이상으로 확장됩니다.
- [ ] 새 서버가 Target Group에서 `정상`이 됩니다.
- [ ] 부하 후 hostname이 2개 이상 집계됩니다.
- [ ] 부하 종료 후 최소 용량 1대로 축소됩니다.
- [ ] Scale-in 후에도 기존 게시글이 조회됩니다.

## 3. 실습 구조

```text
사용자 브라우저
      |
      v
고정 Web 서버 (003 nginx)
      |
      | BACKEND_BASE_URL = ALB URL
      v
Public Application Load Balancer :80
      |
      v
Target Group HTTP :4000
      |
      v
Auto Scaling Backend 1~3대 (003 Node.js)
      |
      v
Cloud DB for MySQL :3306

부하 발생 PC ---- ApacheBench ----> ALB /api/stress
```

Web 서버는 정적 파일만 전달하므로 고정합니다. API 요청과 CPU 연산을 수행하는 Backend만 Auto Scaling 대상으로 구성합니다. 모든 Backend는 같은 Cloud DB를 사용하므로 서버가 교체되어도 게시글은 유지됩니다.

## 4. 실습 화면 배치

실습 중 다음 화면을 동시에 열어 둡니다.

| 화면 | 용도 |
| --- | --- |
| 터미널 A | 골든 Backend 설정과 API 확인 |
| 터미널 B | ALB 호출과 ApacheBench 부하 발생 |
| Naver Cloud 콘솔 | CPU, ASG 실행 이력, 서버 수 확인 |
| 브라우저 | 실제 게시판 글쓰기와 조회 확인 |

## 5. Step 0 - 사용할 값 기록

아래 값을 메모장에 실제 값으로 기록합니다. 비밀번호는 Git에 저장하지 않습니다.

| 이름 | 예시 |
| --- | --- |
| Web Public IP | `203.0.113.10` |
| Cloud DB Private Domain | `db-xxxx.vpc-cdb.ntruss.com` |
| DB Name | `chapter3_board` |
| DB User | `chapter3_user` |
| Backend ACG | `lab-asg-backend-acg` |
| Load Balancer Subnet CIDR | `10.0.10.0/24` |
| Target Group | `lab-board-tg` |
| Load Balancer | `lab-board-alb` |
| Server Image | `lab-board-backend-image-v1` |
| Launch Configuration | `lab-board-lc-v1` |
| Auto Scaling Group | `lab-board-asg` |

## 6. Step 1 - Cloud DB 접속 확인

골든 Backend 서버에서 Cloud DB에 직접 접속합니다.

```bash
mysql -h DB_PRIVATE_DOMAIN -P 3306 -u chapter3_user -p chapter3_board
```

MySQL 프롬프트에 아래 블록을 한 번에 붙여 넣습니다.

```sql
SELECT DATABASE(), CURRENT_USER(), VERSION();
SELECT COUNT(*) AS post_count FROM posts;
SELECT id, title, created_at FROM posts ORDER BY id DESC LIMIT 3;
exit
```

눈으로 확인할 것:

- 선택 DB가 `chapter3_board`입니다.
- `post_count`가 숫자로 출력됩니다.
- 최근 게시글 3건의 제목과 등록시각이 보입니다.

여기서 실패하면 Auto Scaling을 만들지 말고 Cloud DB ACG, DB 사용자 허용 Host, 비밀번호를 먼저 수정합니다.

## 7. Step 2 - Backend ACG 확인

### Backend ACG Inbound

| 프로토콜 | 포트 | 접근 소스 | 목적 |
| --- | --- | --- | --- |
| TCP | `4000` | Load Balancer Subnet CIDR | API 요청과 Health Check |
| TCP | `22` | 관리자 또는 Bastion CIDR | 선택 사항, SSH 점검 |

### Cloud DB ACG Inbound

| 프로토콜 | 포트 | 접근 소스 | 목적 |
| --- | --- | --- | --- |
| TCP | `3306` | Backend ACG | 모든 ASG Backend의 DB 접속 |

중요 확인:

- Cloud DB에는 개별 Backend IP가 아니라 Backend ACG를 등록합니다.
- Load Balancer가 두 Subnet을 사용하면 두 Subnet CIDR의 `4000/tcp`를 모두 허용합니다.
- `4000/tcp`를 `0.0.0.0/0`에 공개하지 않습니다.

## 8. Step 3 - 골든 Backend 준비

### 8.1 저장소 받기

처음 준비하는 골든 Backend Ubuntu 서버에서는 아래 블록을 한 번에 실행합니다.

```bash
sudo apt-get update
sudo apt-get install -y git curl
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd ~/cloud-infrastructure-lecture-example/003-three\ tier\ web\ app/backend
```

이미 저장소가 있다면 새로 clone하지 않고 아래 블록을 실행합니다.

```bash
cd ~/cloud-infrastructure-lecture-example
git pull --ff-only origin main
cd ~/cloud-infrastructure-lecture-example/003-three\ tier\ web\ app/backend
```

### 8.2 환경 파일 직접 작성

예제 파일을 복사한 뒤 바로 편집기로 엽니다.

```bash
cp .env.example .env
nano .env
```

아래 형태로 실제 값을 입력합니다.

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

저장 후 비밀번호를 제외한 설정을 확인합니다.

```bash
grep -v '^DB_PASSWORD=' .env
```

눈으로 확인할 것:

- `DB_HOST`는 Cloud DB의 Private Domain입니다.
- `FRONTEND_ORIGIN`은 브라우저에서 접속할 Web 주소입니다.
- `AUTO_POST_ENABLED=false`입니다.
- `LAB_STRESS_ENABLED=true`입니다.

### 8.3 게시판 Backend 설치

기존 003번 설치기를 실행합니다.

```bash
chmod +x install-backend.sh
sudo ./install-backend.sh
```

이 단계만 기존 스크립트를 사용하는 이유는 Node.js 패키지 설치와 systemd 서비스 파일 생성을 반복해서 손으로 입력하는 것이 Auto Scaling 학습 목표가 아니기 때문입니다.

서비스 자동 시작, 현재 상태, 포트 Listen 여부를 한 번에 확인합니다.

```bash
systemctl is-enabled chapter3-backend
systemctl is-active chapter3-backend
sudo ss -lntp | grep ':4000'
```

앞의 두 줄은 각각 `enabled`, `active`가 출력되고 마지막 줄에는 `:4000` LISTEN 정보가 보여야 합니다.

실제로 어떤 명령으로 기동되는지 확인합니다.

```bash
sudo systemctl cat chapter3-backend
```

최근 로그를 확인합니다.

```bash
sudo journalctl -u chapter3-backend -n 20 --no-pager
```

## 9. Step 4 - 로컬 API를 한 개씩 확인

### Health Check

```bash
curl -i http://127.0.0.1:4000/api/health
```

확인할 부분:

```text
HTTP/1.1 200 OK
X-Backend-Instance: 골든서버-hostname

{"status":"ok","service":"chapter3-backend","instance":"골든서버-hostname"}
```

### 현재 Backend 식별

```bash
curl -s http://127.0.0.1:4000/api/instance | python3 -m json.tool
```

### 게시글 조회

```bash
curl -s http://127.0.0.1:4000/api/posts | python3 -m json.tool | head -40
```

### CPU 부하 API 한 번 호출

```bash
curl -i 'http://127.0.0.1:4000/api/stress?iterations=10000'
```

확인할 부분:

```text
HTTP/1.1 200 OK
X-Backend-Instance: 골든서버-hostname
X-Lab-Stress-Iterations: 10000
X-Lab-Stress-Duration-Ms: ...

ok
```

이 네 명령이 모두 성공한 뒤에만 Server Image를 생성합니다.

## 10. Step 5 - Server Image 생성

콘솔 경로:

```text
Compute > Server > Server
  > 골든 Backend 선택
  > 서버 관리 및 설정 변경
  > 내 서버 이미지 생성
```

| 항목 | 값 |
| --- | --- |
| 이미지 이름 | `lab-board-backend-image-v1` |
| 설명 | `003 board backend for autoscaling lab` |

눈으로 확인할 곳:

```text
Compute > Server > Server Image
```

통과 기준:

- 이미지 상태가 `생성완료`입니다.
- 이미지 생성 전에 Backend 서비스가 `enabled`, `active`였습니다.
- 이미지 생성 비용과 Snapshot 비용이 발생할 수 있음을 확인합니다.

## 11. Step 6 - Target Group 생성

콘솔 경로:

```text
Networking > Load Balancer > Target Group > Target Group 생성
```

### Target Group 값

| 항목 | 값 |
| --- | --- |
| 이름 | `lab-board-tg` |
| Target 유형 | 일반 VPC 서버 |
| VPC | 게시판 VPC |
| 프로토콜 | HTTP |
| 포트 | `4000` |

### Health Check 값

| 항목 | 값 |
| --- | --- |
| 프로토콜 | HTTP |
| URL Path | `/api/health` |
| Method | GET |
| 주기 | 10초 |
| 정상 임계값 | 2 |
| 실패 임계값 | 3 |

최초 Target에는 골든 Backend를 임시로 추가합니다.

Target Group 설정:

| 항목 | 값 |
| --- | --- |
| 알고리즘 | Round Robin |
| Sticky Session | 사용 안 함 |

눈으로 확인할 곳:

```text
Target Group > lab-board-tg > Target 상태 확인
```

통과 기준은 골든 Backend가 `정상`으로 표시되는 것입니다. `비정상`이면 다음 명령을 골든 서버에서 다시 실행합니다.

```bash
curl -i http://127.0.0.1:4000/api/health
```

로컬은 정상인데 Target Group만 비정상이면 Backend ACG의 Load Balancer Subnet CIDR과 `4000/tcp`를 확인합니다.

## 12. Step 7 - Application Load Balancer 생성

콘솔 경로:

```text
Networking > Load Balancer > Load Balancer > 로드 밸런서 생성
```

| 항목 | 값 |
| --- | --- |
| 유형 | Application Load Balancer |
| 이름 | `lab-board-alb` |
| Network | Public IP |
| VPC | 게시판 VPC |
| Subnet | Public LOADB Subnet |
| Listener | HTTP `80` |
| Target Group | `lab-board-tg` |

생성 후 제공된 도메인을 터미널 B에 변수로 넣고 바로 확인합니다.

```bash
export LB_URL='http://LOAD_BALANCER_DOMAIN'
echo "$LB_URL"
```

### ALB를 통한 Health 확인

```bash
curl -i "$LB_URL/api/health"
```

확인할 것:

- HTTP 상태가 `200`입니다.
- `X-Backend-Instance`가 골든 Backend hostname입니다.
- JSON의 `status`가 `ok`입니다.

### ALB를 통한 게시글 작성

```bash
curl -sS -X POST "$LB_URL/api/posts" -H 'Content-Type: application/json' -d '{"title":"autoscaling-before","content":"ALB 경유 게시글 쓰기 확인","authorName":"autoscaling-lab"}' | python3 -m json.tool
```

확인할 것:

- 새 게시글의 `id`가 출력됩니다.
- `title`이 `autoscaling-before`입니다.
- `createdAt`이 현재 시각입니다.

### ALB를 통한 게시글 재조회

```bash
curl -sS "$LB_URL/api/posts" | python3 -m json.tool | head -40
```

`autoscaling-before` 글이 보이면 ALB, Backend, Cloud DB 전체 경로가 연결된 것입니다.

## 13. Step 8 - Web 서버를 ALB로 전환

고정 Web 서버에서 최신 소스를 받고 Web 폴더로 이동합니다.

```bash
cd ~/cloud-infrastructure-lecture-example
git pull --ff-only origin main
cd ~/cloud-infrastructure-lecture-example/003-three\ tier\ web\ app/web
```

현재 설정을 확인한 뒤 편집기로 엽니다.

```bash
grep '^BACKEND_BASE_URL=' .env
nano .env
```

```env
BACKEND_BASE_URL="http://LOAD_BALANCER_DOMAIN"
```

Web 파일을 다시 배치하고 실제 배포 설정을 확인합니다.

```bash
sudo ./install-web.sh
cat /var/www/chapter3-web/config.js
```

브라우저에서 Web 서버를 열어 `autoscaling-before` 글을 확인하고 새 글을 하나 더 작성합니다. 개발자 도구 Network 탭에서 API 요청 주소가 개별 Backend IP가 아니라 ALB 도메인인지 확인합니다.

## 14. Step 9 - Launch Configuration 생성

콘솔 경로:

```text
Compute > Auto Scaling > Launch Configuration > Launch Configuration 생성
```

| 단계 | 항목 | 값 |
| --- | --- | --- |
| 서버 이미지 | 내 서버 이미지 | `lab-board-backend-image-v1` |
| 서버 설정 | 서버 스펙 | 수업용 2 vCPU 이상 권장 |
| 서버 설정 | Init Script | 사용 안 함 |
| 이름 | Launch Configuration 이름 | `lab-board-lc-v1` |
| 인증키 | 인증키 | 기존 키 또는 새 키 |

눈으로 확인할 것:

- 내 Server Image 이름이 정확합니다.
- 새 서버에서 사용할 vCPU 수를 기록합니다.
- 이미지에 앱과 systemd 설정이 있으므로 Init Script가 비어 있습니다.

## 15. Step 10 - Auto Scaling Group 생성

콘솔 경로:

```text
Compute > Auto Scaling > Auto Scaling Group > Auto Scaling Group 생성
```

### 그룹 설정

| 항목 | 값 |
| --- | --- |
| Launch Configuration | `lab-board-lc-v1` |
| 그룹 이름 | `lab-board-asg` |
| VPC | 게시판 VPC |
| Subnet | Backend Private Subnet |
| 서버 이름 Prefix | `lab-board-api` |
| 최소 용량 | `1` |
| 최대 용량 | `3` |
| 기대 용량 | `1` |
| 상세 모니터링 | 사용 |
| 기본 Cooldown | `300초` |
| Health Check 유형 | Load Balancer |
| Health Check Grace Period | `300초` |
| Target Group | `lab-board-tg` |

### 네트워크 접근

`lab-asg-backend-acg`를 선택합니다.

### Scaling Policy

| 정책 | 방식 | 값 | Cooldown |
| --- | --- | --- | --- |
| `scale-out-add-1` | 증감 변경 | `+1` | 300초 |
| `scale-in-remove-1` | 증감 변경 | `-1` | 300초 |

그룹 생성 후 콘솔을 새로고침하며 다음 변화를 순서대로 봅니다.

| 순서 | 화면 | 확인할 변화 |
| --- | --- | --- |
| 1 | Auto Scaling Group | 서버 수 `0 → 1` |
| 2 | Server | `lab-board-api...` 서버 생성 중 → 운영 중 |
| 3 | Target Group | 새 Target 초기 → 정상 |
| 4 | Target Group | 골든 Backend 수동 제거 |

골든 Backend를 제거한 뒤 ALB 응답 hostname이 ASG 서버인지 확인합니다.

```bash
curl -sS -D - -o /dev/null "$LB_URL/api/instance" | grep -i '^X-Backend-Instance:'
```

## 16. Step 11 - 부하 전 분산 상태 직접 집계

아래 명령은 ALB를 20번 호출하고 응답 헤더의 Backend hostname을 집계합니다.

```bash
for i in $(seq 1 20); do curl -fsS -D - -o /dev/null "$LB_URL/api/instance" | awk -F': ' 'tolower($1)=="x-backend-instance" {gsub("\r","",$2); print $2}'; done | sort | uniq -c
```

예상 출력:

```text
20 lab-board-api-xxxxx
```

명령을 나누어 이해합니다.

| 부분 | 의미 |
| --- | --- |
| `seq 1 20` | 20회 반복 |
| `curl -D - -o /dev/null` | Body는 버리고 Header만 출력 |
| `awk` | `X-Backend-Instance` 값만 선택 |
| `sort | uniq -c` | hostname별 요청 수 집계 |

이 시점에는 기대 용량이 1이므로 hostname 하나만 보여야 합니다.

## 17. Step 12 - Cloud Insight Scale-out Rule 생성

콘솔 경로:

```text
Management & Governance > Cloud Insight
  > Configuration > Event Rule > Event Rule 생성
```

### 감시 대상

| 항목 | 값 |
| --- | --- |
| 상품 | Server (VPC) |
| 대상 유형 | Auto Scaling Group |
| 대상 | `lab-board-asg` |

### 감시 조건

| 항목 | 값 |
| --- | --- |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `>= 50` |
| 집약 | AVG |
| 지속 시간 | 1 minute |

### 액션

| 항목 | 값 |
| --- | --- |
| 액션 유형 | Auto Scaling Policy |
| Auto Scaling Group | `lab-board-asg` |
| Policy | `scale-out-add-1` |

`CPU/used_rto`가 아니라 서버 전체 평균 CPU인 `SERVER/avg_cpu_used_rto`를 선택합니다. CPU core dimension 중 하나만 높아서 잘못 확장되는 상황을 피하기 위함입니다.

Event 종료 시 재실행 옵션은 끕니다. Event가 계속되면 Cooldown마다 Policy가 다시 실행될 수 있지만 최대 용량 3대에서 멈춥니다.

## 18. Step 13 - ApacheBench 설치

부하 발생용 Ubuntu에서:

```bash
sudo apt-get update && sudo apt-get install -y apache2-utils
```

macOS에서:

```bash
brew install httpd
```

설치와 Stress API 준비 상태를 함께 확인합니다.

```bash
ab -V
curl -i "$LB_URL/api/stress?iterations=10000"
```

HTTP `200`과 `ok`가 보여야 합니다. `404`이면 Server Image 안의 `/opt/chapter3-backend/.env`에서 `LAB_STRESS_ENABLED=true`인지 확인합니다.

## 19. Step 14 - CPU 부하 발생

터미널 B에서 10분 동안 동시 요청 20개를 발생시킵니다.

```bash
ab -t 600 -c 20 "$LB_URL/api/stress?iterations=250000"
```

옵션 의미:

| 옵션 | 의미 |
| --- | --- |
| `-t 600` | 600초 동안 실행 |
| `-c 20` | 동시에 20개 요청 유지 |
| `iterations=250000` | 요청마다 수행할 CPU 연산량 |

CPU가 50%를 넘지 않으면 `Ctrl+C`로 종료하고 동시성만 한 단계 높입니다.

```bash
ab -t 600 -c 40 "$LB_URL/api/stress?iterations=250000"
```

그래도 낮을 때만 연산량을 높입니다.

```bash
ab -t 600 -c 40 "$LB_URL/api/stress?iterations=500000"
```

처음부터 가장 높은 값을 사용하지 않습니다. 서버 스펙마다 필요한 부하가 다릅니다.

## 20. Step 15 - Scale-out을 눈으로 추적

부하를 실행한 상태에서 아래 화면을 순서대로 관찰합니다.

| 순서 | 콘솔 화면 | 확인할 변화 |
| --- | --- | --- |
| 1 | Cloud Insight Dashboard | 평균 CPU가 50% 이상 |
| 2 | Cloud Insight Event Rule | Event 발생 |
| 3 | ASG 설정 및 관리 > 실행 이력 | `scale-out-add-1` 실행 |
| 4 | Auto Scaling Group | 서버 수 `1 → 2` |
| 5 | Server | 새 `lab-board-api...` 생성 |
| 6 | Target Group > Target 상태 | 새 Target 초기 → 정상 |

관찰 시각을 기록합니다.

| 항목 | 기록 |
| --- | --- |
| CPU 50% 도달 |  |
| Event 발생 |  |
| Scale-out 시작 |  |
| 새 서버 운영 중 |  |
| 새 Target 정상 |  |

Metric 수집, Event 지속 시간, 서버 생성, Health Check 때문에 즉시 늘어나지 않습니다. 각 단계가 어느 화면에서 지연되는지 확인하는 것이 실습의 핵심입니다.

## 21. Step 16 - 확장 중 hostname 변화 실시간 확인

별도 터미널에서 10초마다 요청 처리 hostname을 집계합니다.

```bash
while true; do date; for i in $(seq 1 30); do curl -fsS -D - -o /dev/null "$LB_URL/api/instance" | awk -F': ' 'tolower($1)=="x-backend-instance" {gsub("\r","",$2); print $2}'; done | sort | uniq -c; echo; sleep 10; done
```

처음에는 하나만 보입니다.

```text
30 lab-board-api-aaaaa
```

새 Target이 정상 상태가 되면 hostname이 두 개 이상 보입니다.

```text
16 lab-board-api-aaaaa
14 lab-board-api-bbbbb
```

정확히 15:15일 필요는 없습니다. 서로 다른 hostname이 보이고 실패가 없다면 트래픽 분산이 확인된 것입니다. 확인 후 `Ctrl+C`로 종료합니다.

## 22. Step 17 - 확장 후 게시판 데이터 확인

확장된 상태에서 새 글을 작성합니다.

```bash
curl -sS -X POST "$LB_URL/api/posts" -H 'Content-Type: application/json' -d '{"title":"autoscaling-after","content":"Scale-out 후 Cloud DB 쓰기 확인","authorName":"autoscaling-lab"}' | python3 -m json.tool
```

목록을 다시 읽습니다.

```bash
curl -sS "$LB_URL/api/posts" | python3 -m json.tool | head -60
```

확인할 것:

- `autoscaling-before`와 `autoscaling-after`가 모두 보입니다.
- 요청을 처리하는 Backend가 달라도 같은 목록을 반환합니다.
- 데이터는 Backend 로컬 디스크가 아니라 Cloud DB에 있습니다.

브라우저 게시판에서도 두 글을 확인합니다.

## 23. Step 18 - 부하 종료와 Scale-in Rule

ApacheBench가 실행 중이면 `Ctrl+C`로 중지합니다.

Cloud Insight에서 평균 CPU가 20% 아래로 내려가는 것을 먼저 확인합니다. Scale-out 검증 후에 Scale-in Rule을 생성해야 새로 추가된 저부하 서버 때문에 두 정책이 동시에 움직이는 혼동을 줄일 수 있습니다.

| 항목 | 값 |
| --- | --- |
| 감시 대상 | `Server (VPC)`의 `lab-board-asg` |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `< 20` |
| 집약 | AVG |
| 지속 시간 | 5 minutes |
| 액션 | `scale-in-remove-1` |

눈으로 확인할 순서:

| 순서 | 콘솔 화면 | 확인할 변화 |
| --- | --- | --- |
| 1 | Cloud Insight | CPU 20% 미만 유지 |
| 2 | Event Rule | Scale-in Event 발생 |
| 3 | ASG 실행 이력 | `scale-in-remove-1` 실행 |
| 4 | Auto Scaling Group | 서버 수 감소 |
| 5 | Target Group | 종료 서버 자동 제거 |
| 6 | Auto Scaling Group | 최소 용량 1대에서 정지 |

## 24. Step 19 - 최종 확인

최종 Backend hostname, Health, 게시글을 한 번에 확인합니다.

```bash
for i in $(seq 1 20); do curl -fsS -D - -o /dev/null "$LB_URL/api/instance" | awk -F': ' 'tolower($1)=="x-backend-instance" {gsub("\r","",$2); print $2}'; done | sort | uniq -c
curl -i "$LB_URL/api/health"
curl -sS "$LB_URL/api/posts" | python3 -m json.tool | grep -E 'autoscaling-before|autoscaling-after'
```

첫 명령의 hostname은 하나여야 하고, Health는 HTTP `200`, 마지막 명령은 두 게시글 제목을 출력해야 합니다.

예상 출력:

```text
"title": "autoscaling-after",
"title": "autoscaling-before",
```

Scale-in으로 서버가 종료되어도 두 글이 남아 있으면 전체 실습이 완료된 것입니다.

## 25. 트러블슈팅 명령

### Backend 프로세스

```bash
systemctl is-active chapter3-backend
sudo journalctl -u chapter3-backend -n 100 --no-pager
sudo ss -lntp | grep ':4000'
```

### Backend 로컬 Health

```bash
curl -i http://127.0.0.1:4000/api/health
```

### 이미지에 저장된 환경 설정

```bash
sudo grep -v '^DB_PASSWORD=' /opt/chapter3-backend/.env
```

### Cloud DB 연결

```bash
mysql -h DB_PRIVATE_DOMAIN -P 3306 -u chapter3_user -p chapter3_board -e 'SELECT 1;'
```

### ALB 응답 서버

```bash
curl -sS -D - -o /dev/null "$LB_URL/api/instance" | grep -i '^X-Backend-Instance:'
```

### Target이 계속 비정상일 때

1. Backend ACG에 Load Balancer Subnet CIDR의 `4000/tcp`가 있는지 확인합니다.
2. Target Group 포트가 `4000`인지 확인합니다.
3. Health Check가 `GET /api/health`인지 확인합니다.
4. Cloud DB ACG가 Backend ACG의 `3306/tcp`를 허용하는지 확인합니다.
5. Health Check Grace Period가 `300초`인지 확인합니다.

### CPU는 높은데 확장되지 않을 때

1. ASG의 상세 모니터링이 켜져 있는지 확인합니다.
2. Metric이 `SERVER/avg_cpu_used_rto`인지 확인합니다.
3. 감시 대상이 개별 서버가 아니라 `lab-board-asg`인지 확인합니다.
4. Event Rule 액션이 `scale-out-add-1`인지 확인합니다.
5. ASG 실행 이력과 Cooldown을 확인합니다.
6. 현재 서버 수가 최대 용량 3대인지 확인합니다.

### 새 서버가 생겼다가 바로 종료될 때

새 서버의 `/api/health`가 DB 연결까지 검사합니다. Cloud DB 접속이 실패하면 Target이 비정상이 되어 교체될 수 있습니다. Cloud DB ACG와 이미지 속 DB 설정을 먼저 확인합니다.

## 26. 비용 정리

1. ApacheBench 종료
2. Cloud Insight Scale-out, Scale-in Event Rule 삭제
3. ASG 최소 용량과 기대 용량을 `0`으로 변경
4. ASG 서버가 모두 반납될 때까지 확인
5. Auto Scaling Group 삭제
6. Launch Configuration 삭제
7. Application Load Balancer 삭제
8. Target Group 삭제
9. 골든 Backend 서버 반납
10. Server Image와 연결 Snapshot 삭제

기존 003 Web 서버와 015 Cloud DB를 다음 실습에서 사용할 경우 삭제하지 않습니다.

## 27. 핵심 개념 정리

| 개념 | 직접 확인한 내용 |
| --- | --- |
| Server Image | 실행 가능한 Backend와 설정이 저장된 이미지 |
| Launch Configuration | 이미지, 서버 스펙, 인증키를 묶은 생성 템플릿 |
| Auto Scaling Group | Backend 수를 최소 1대, 최대 3대로 유지 |
| Scaling Policy | 실행될 때 서버 수를 `+1` 또는 `-1` 변경 |
| Event Rule | CPU 조건을 감시하고 Policy 실행 |
| Target Group | `:4000` Backend와 `/api/health` 상태 관리 |
| Application Load Balancer | 정상 Backend에 HTTP 요청 분산 |
| Cooldown | 확장 직후 다음 정책 실행을 잠시 억제 |
| Grace Period | 새 서버가 기동될 시간을 보장 |

## 28. 공식 문서

- [Naver Cloud Auto Scaling 시나리오](https://guide.ncloud-docs.com/docs/autoscaling-procedure)
- [Launch Configuration](https://guide.ncloud-docs.com/docs/autoscaling-lc-vpc)
- [Auto Scaling Group](https://guide.ncloud-docs.com/docs/autoscaling-asg-vpc)
- [Server Image](https://guide.ncloud-docs.com/docs/server-serverimage-vpc)
- [Target Group](https://guide.ncloud-docs.com/docs/loadbalancer-targetgroup-vpc)
- [Application Load Balancer](https://guide.ncloud-docs.com/docs/loadbalancer-application-vpc)
- [Cloud Insight Event Rule](https://guide.ncloud-docs.com/docs/cloudinsight-use-eventrule)
- [평균 CPU Metric 선택 주의사항](https://guide.ncloud-docs.com/docs/cloudinsight-troubleshoot-event)
