# 015. Naver Cloud Auto Scaling Hands-on

007번 3계층 게시판의 **Backend 계층**을 Naver Cloud Auto Scaling Group으로 전환하는 실습입니다. 고정 Web 서버와 Cloud DB for MySQL은 그대로 사용하고, Application Load Balancer 뒤의 Backend 서버 수만 CPU 부하에 따라 자동으로 늘리고 줄입니다.

> 이 교재는 Naver Cloud **VPC 환경**을 기준으로 합니다. `GET /api/stress`는 실습용 CPU 부하 API이므로 인터넷에 공개된 운영 서비스에서는 활성화하지 마십시오.

## 1. 학습 목표

실습을 마치면 다음 내용을 직접 확인할 수 있습니다.

- Server Image와 Launch Configuration의 역할 차이
- Auto Scaling Group의 최소, 최대, 기대 용량
- Application Load Balancer와 Target Group의 관계
- Cloud Insight Event Rule과 Scaling Policy의 연결
- CPU 부하에 따른 Scale-out과 부하 종료 후 Scale-in
- 여러 Backend가 하나의 Cloud DB를 공유하는 구조
- 게시판 CRUD가 확장 전후에도 유지되는지 검증하는 방법

## 2. 완료 기준

아래 항목을 모두 확인해야 실습 완료입니다.

- [ ] Load Balancer의 `/api/health`가 HTTP `200`을 반환한다.
- [ ] Web 게시판에서 글을 등록하고 다시 조회할 수 있다.
- [ ] 부하 전 `check-distribution.sh`에서 Backend 1대가 보인다.
- [ ] 부하 중 Cloud Insight 평균 CPU가 50% 이상이 된다.
- [ ] Auto Scaling Group의 서버 수가 1대에서 2대 이상으로 증가한다.
- [ ] 새 서버가 Target Group에서 `정상` 상태가 된다.
- [ ] 부하 후 요청이 서로 다른 Backend 호스트로 분산된다.
- [ ] 부하 종료 후 서버 수가 최소 용량 1대로 감소한다.
- [ ] Scale-in 뒤에도 기존 게시글이 그대로 조회된다.

## 3. 전체 구조

```text
사용자 브라우저
      |
      | HTTP 80
      v
고정 Web 서버 (007 nginx)
      |
      | BACKEND_BASE_URL = Public ALB URL
      v
Application Load Balancer :80
      |
      | Target Group HTTP :4000
      v
Auto Scaling Backend 1~3대 (007 Node.js/Express)
      |
      | MySQL :3306
      v
Cloud DB for MySQL (012에서 전환한 게시판 DB)

부하 발생 PC 또는 서버
      |
      +---- GET /api/stress ----> Public ALB
```

이 실습에서 Web 서버를 고정하는 이유는 브라우저에 정적 파일만 전달하는 계층보다 게시판 API를 처리하는 Backend 계층의 CPU 변화를 더 명확하게 관찰하기 위해서입니다. 모든 Backend는 같은 Cloud DB를 사용하므로 어느 인스턴스가 요청을 처리해도 동일한 게시글을 봅니다.

## 4. 리소스 이름표

먼저 예시 파일을 복사하고 실제 값을 기록합니다. 비밀번호가 들어간 파일은 Git에 커밋하지 마십시오.

```bash
cd "015-auto scaling"
cp lab-values.env.example lab-values.env
chmod 600 lab-values.env
vi lab-values.env
```

권장 이름:

| 리소스 | 예시 |
| --- | --- |
| VPC | `lab-vpc` |
| Backend Subnet | `lab-backend-subnet` |
| Load Balancer Subnet | `lab-lb-subnet` |
| Backend ACG | `lab-asg-backend-acg` |
| Target Group | `lab-board-tg` |
| Application Load Balancer | `lab-board-alb` |
| Server Image | `lab-board-backend-image-v1` |
| Launch Configuration | `lab-board-lc-v1` |
| Auto Scaling Group | `lab-board-asg` |
| 서버 이름 Prefix | `lab-board-api` |

## 5. Step 0 - 사전 환경 확인

필수 준비물:

- 007번 게시판 Web 서버
- 012번에서 게시판 데이터를 이관한 Cloud DB for MySQL
- Backend 골든 이미지 제작용 Ubuntu 서버 1대
- Public Application Load Balancer용 Load Balancer Subnet
- 부하를 실행할 macOS, Linux PC 또는 별도 Ubuntu 서버

Cloud DB 연결 정보는 골든 Backend 서버에서 먼저 확인합니다.

```bash
mysql -h DB_PRIVATE_DOMAIN \
  -P 3306 \
  -u chapter3_user \
  -p \
  chapter3_board \
  -e "SELECT COUNT(*) AS post_count FROM posts;"
```

통과 기준:

- `post_count`가 숫자로 출력된다.
- 접속 오류가 나면 Auto Scaling을 만들기 전에 Cloud DB ACG, 사용자 허용 Host, DB 계정을 먼저 수정한다.

## 6. Step 1 - 네트워크와 ACG 준비

### 6.1 Subnet

| Subnet | 용도 | 권장 유형 |
| --- | --- | --- |
| Backend Subnet | Auto Scaling 서버 배치 | `GEN` Private |
| Load Balancer Subnet | Application Load Balancer 배치 | `LOADB` Public |

Backend 서버 이미지에는 애플리케이션과 패키지가 이미 설치되므로 새 인스턴스가 인터넷에서 패키지를 다시 받을 필요는 없습니다. 별도 업데이트가 필요하면 NAT Gateway 등 아웃바운드 경로를 준비합니다.

### 6.2 Backend ACG Inbound

| 프로토콜 | 포트 | 접근 소스 | 목적 |
| --- | --- | --- | --- |
| TCP | `4000` | Load Balancer Subnet CIDR | ALB 트래픽과 헬스 체크 |
| TCP | `22` | 관리자 PC 또는 Bastion CIDR | 선택 사항, SSH 점검 |

Load Balancer가 2개 Subnet을 사용하면 두 CIDR 모두 `4000/tcp` 접근 소스로 추가합니다. `0.0.0.0/0` 대신 실제 Load Balancer Subnet CIDR을 사용합니다.

### 6.3 Cloud DB ACG Inbound

| 프로토콜 | 포트 | 접근 소스 | 목적 |
| --- | --- | --- | --- |
| TCP | `3306` | `lab-asg-backend-acg` | 모든 Auto Scaling Backend의 DB 연결 |

개별 서버 IP가 아니라 Backend ACG를 접근 소스로 사용해야 새로 생성된 서버도 Cloud DB에 연결할 수 있습니다.

통과 기준:

- 골든 Backend 서버와 Auto Scaling Group에 동일한 Backend ACG를 적용한다.
- Backend ACG는 ALB Subnet에서 오는 `4000/tcp`를 허용한다.
- Cloud DB는 Backend ACG에서 오는 `3306/tcp`를 허용한다.

## 7. Step 2 - 골든 Backend 서버 준비

골든 서버에서 저장소를 받고 이미지 준비 스크립트를 실행합니다. 아래 값은 실제 환경에 맞게 바꿉니다.

```bash
sudo apt-get update
sudo apt-get install -y git

git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd "cloud-infrastructure-lecture-example/015-auto scaling/scripts"

sudo -E \
  DB_HOST='db-xxxx.vpc-cdb.ntruss.com' \
  DB_PORT='3306' \
  DB_NAME='chapter3_board' \
  DB_USER='chapter3_user' \
  DB_PASSWORD='CHANGE_ME' \
  FRONTEND_ORIGIN='http://WEB_SERVER_PUBLIC_IP' \
  ./prepare-backend-image.sh
```

스크립트가 수행하는 작업:

1. 최신 `main` 소스를 `/opt/cloud-infrastructure-lecture-example`에 배치합니다.
2. 007번 Backend `.env`를 Cloud DB 연결값으로 생성합니다.
3. Node.js 게시판 API를 `/opt/chapter3-backend`에 설치합니다.
4. `chapter3-backend` systemd 서비스를 부팅 시 자동 시작하도록 설정합니다.
5. 자동 게시글 생성기는 끄고 실습용 CPU 부하 API만 켭니다.
6. Health, Instance, Stress API를 로컬에서 검증합니다.

직접 다시 확인합니다.

```bash
sudo systemctl status chapter3-backend --no-pager
curl -i http://127.0.0.1:4000/api/health
curl -i http://127.0.0.1:4000/api/instance
curl -i 'http://127.0.0.1:4000/api/stress?iterations=10000'
curl -s http://127.0.0.1:4000/api/posts | head -c 300
```

통과 기준:

- 서비스 상태가 `active (running)`이다.
- Health 응답에 `"status":"ok"`와 현재 hostname이 있다.
- 응답 헤더에 `X-Backend-Instance`가 있다.
- Stress API가 `ok`를 반환한다.
- Posts API가 JSON 배열을 반환한다.

문제가 있으면 다음 로그를 확인합니다.

```bash
sudo journalctl -u chapter3-backend -n 100 --no-pager
sudo cat /opt/chapter3-backend/.env
```

## 8. Step 3 - Server Image 생성

콘솔 경로:

```text
Naver Cloud Console
  -> Compute
  -> Server
  -> Server
  -> 골든 Backend 서버 선택
  -> 서버 관리 및 설정 변경
  -> 내 서버 이미지 생성
```

| 항목 | 값 |
| --- | --- |
| 이미지 이름 | `lab-board-backend-image-v1` |
| 설명 | `007 board backend for autoscaling lab` |

`Compute > Server > Server Image`에서 상태가 `생성완료`가 될 때까지 기다립니다. 서버 이미지는 실행 중 서버의 현재 상태를 저장하며 이미지 저장 비용이 발생할 수 있습니다.

통과 기준:

- Server Image 상태가 `생성완료`이다.
- 이미지 생성 전에 `chapter3-backend`가 부팅 자동 시작 상태였다.

## 9. Step 4 - Target Group 생성

콘솔 경로:

```text
Networking
  -> Load Balancer
  -> Target Group
  -> Target Group 생성
```

### 9.1 Target Group

| 항목 | 값 |
| --- | --- |
| 이름 | `lab-board-tg` |
| Target 유형 | 일반 VPC 서버 |
| VPC | 게시판과 같은 VPC |
| 프로토콜 | `HTTP` |
| 포트 | `4000` |

### 9.2 Health Check

| 항목 | 값 |
| --- | --- |
| 프로토콜 | `HTTP` |
| URL Path | `/api/health` |
| HTTP Method | `GET` |
| 주기 | `10초` |
| 정상 임계값 | `2` |
| 실패 임계값 | `3` |

### 9.3 최초 Target

골든 Backend 서버를 임시 Target으로 추가합니다. ASG 서버가 정상 등록된 뒤 골든 서버는 Target에서 제거합니다.

Target Group 설정:

- 로드밸런싱 알고리즘: `Round Robin`
- Sticky Session: 사용 안 함

통과 기준:

- `Target 상태 확인`에서 골든 Backend가 `정상`이다.
- 비정상이면 Backend ACG의 `4000/tcp`, Cloud DB 연결, `/api/health`를 확인한다.

## 10. Step 5 - Public Application Load Balancer 생성

콘솔 경로:

```text
Networking
  -> Load Balancer
  -> Load Balancer
  -> 로드 밸런서 생성
  -> Application Load Balancer
```

| 항목 | 값 |
| --- | --- |
| 이름 | `lab-board-alb` |
| Network | `Public IP` |
| VPC | 게시판과 같은 VPC |
| Subnet | 준비한 `LOADB` Subnet |
| 부하 처리 성능 | 실습 가능한 최소 사양 |
| Listener | `HTTP : 80` |
| Target Group | `lab-board-tg` |

생성 완료 후 임시 도메인을 기록합니다.

```bash
export LB_URL='http://LOAD_BALANCER_DOMAIN'
curl -i "${LB_URL}/api/health"

cd "015-auto scaling/scripts"
./verify-backend.sh "${LB_URL}"
./smoke-test-board.sh "${LB_URL}"
```

통과 기준:

- Load Balancer URL로 Health, Instance, Posts, Stress API가 모두 응답한다.
- 스모크 테스트가 게시글 1건을 생성하고 다시 읽는다.

## 11. Step 6 - 고정 Web 서버를 Load Balancer로 전환

Web 서버에서 007번 프런트엔드의 Backend 주소를 개별 서버 IP가 아닌 ALB URL로 바꿉니다.

```bash
cd ~/cloud-infrastructure-lecture-example
git pull origin main
cd "007-three tier web app/web"

export LB_URL='http://LOAD_BALANCER_DOMAIN'
sudo sed -i "s|^BACKEND_BASE_URL=.*|BACKEND_BASE_URL=\"${LB_URL}\"|" .env
sudo ./install-web.sh

curl http://127.0.0.1/config.js
```

브라우저에서 Web 서버 주소를 열고 글을 등록한 뒤 새로고침합니다.

통과 기준:

- `/var/www/chapter3-web/config.js`의 `BACKEND_BASE_URL`이 ALB URL이다.
- 글쓰기, 목록 조회, 상세 조회가 정상이다.
- 브라우저 개발자 도구의 Network에서 API 요청 대상이 ALB 도메인이다.

## 12. Step 7 - Launch Configuration 생성

콘솔 경로:

```text
Compute
  -> Auto Scaling
  -> Launch Configuration
  -> Launch Configuration 생성
```

| 단계 | 항목 | 값 |
| --- | --- | --- |
| 서버 이미지 선택 | 내 서버 이미지 | `lab-board-backend-image-v1` |
| 서버 설정 | 서버 스펙 | 수업용 최소 2 vCPU 권장 |
| 서버 설정 | Init Script | 사용 안 함 |
| 이름 설정 | 이름 | `lab-board-lc-v1` |
| 인증키 설정 | 인증키 | 기존 키 또는 새 키 |

새 인스턴스는 이미지에 저장된 `/opt/chapter3-backend`, `.env`, systemd 설정으로 바로 기동되므로 Init Script가 필요하지 않습니다.

통과 기준:

- Launch Configuration 상세 정보에 올바른 Server Image와 서버 스펙이 보인다.
- 골든 서버와 Launch Configuration의 하이퍼바이저 세대가 호환된다.

## 13. Step 8 - Auto Scaling Group 생성

콘솔 경로:

```text
Compute
  -> Auto Scaling
  -> Auto Scaling Group
  -> Auto Scaling Group 생성
```

### 13.1 그룹 설정

| 항목 | 값 |
| --- | --- |
| Launch Configuration | `lab-board-lc-v1` |
| 그룹 이름 | `lab-board-asg` |
| VPC | 게시판과 같은 VPC |
| Subnet | Backend Private Subnet |
| 서버 이름 Prefix | `lab-board-api` |
| 최소 용량 | `1` |
| 최대 용량 | `3` |
| 기대 용량 | `1` |
| 상세 모니터링 적용 | 사용 |
| 쿨다운 기본값 | `300초` |
| 헬스 체크 유형 | Load Balancer |
| 헬스 체크 보류 기간 | `300초` |
| Target Group | `lab-board-tg` |

### 13.2 네트워크 접근

`lab-asg-backend-acg`를 선택합니다.

### 13.3 정책

두 정책을 만듭니다.

| 정책 이름 | 방식 | 값 | 쿨다운 |
| --- | --- | --- | --- |
| `scale-out-add-1` | 증감 변경 | `+1` | `300초` |
| `scale-in-remove-1` | 증감 변경 | `-1` | `300초` |

통보 설정은 수업 환경에 따라 선택합니다.

그룹 생성 후 다음을 기다립니다.

1. ASG 서버 수가 1대가 된다.
2. 새 서버 상태가 운영 중이 된다.
3. Target Group의 새 Target이 정상 상태가 된다.
4. 골든 Backend 서버를 Target Group에서 제거한다.

통과 기준:

- Target Group에는 ASG가 만든 Backend 1대만 남는다.
- 아래 명령에서 ASG 서버 hostname 하나가 출력된다.

```bash
cd "015-auto scaling/scripts"
REQUEST_COUNT=20 ./check-distribution.sh "${LB_URL}"
```

## 14. Step 9 - Scale-out Event Rule 생성

Auto Scaling Policy는 조건 자체가 아니라 **서버 수를 어떻게 변경할지**만 정의합니다. CPU 조건과 Policy 실행 연결은 Cloud Insight Event Rule에서 설정합니다.

콘솔 경로:

```text
Management & Governance
  -> Cloud Insight
  -> Configuration
  -> Event Rule
  -> Event Rule 생성
```

### 14.1 감시 대상

| 항목 | 값 |
| --- | --- |
| 상품 | `Server (VPC)` |
| 대상 유형 | Auto Scaling Group |
| 대상 | `lab-board-asg` |

### 14.2 감시 항목과 조건

| 항목 | 값 |
| --- | --- |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `>= 50` |
| 집약 방법 | `AVG` |
| 지속 시간 | `1 minute` |

CPU별 `CPU/used_rto`가 아니라 서버 평균 CPU인 `SERVER/avg_cpu_used_rto`를 선택합니다. 전자는 CPU core dimension 중 하나만 높아도 이벤트가 발생할 수 있습니다.

### 14.3 액션

| 항목 | 값 |
| --- | --- |
| 액션 유형 | Auto Scaling Policy |
| Auto Scaling Group | `lab-board-asg` |
| Policy | `scale-out-add-1` |

Event가 끝날 때 재실행하는 옵션은 끕니다. 공식 동작상 Event가 유지되면 Policy 쿨다운에 따라 반복 실행될 수 있으므로 최대 용량 `3`이 안전장치가 됩니다.

통과 기준:

- Event Rule의 감시 대상이 개별 골든 서버가 아니라 `lab-board-asg`이다.
- 액션에 `scale-out-add-1`이 연결되어 있다.

## 15. Step 10 - 기준 상태 기록

부하 전에 현재 서버 분포와 게시판 쓰기를 기록합니다.

```bash
cd "015-auto scaling/scripts"

./verify-backend.sh "${LB_URL}"
./smoke-test-board.sh "${LB_URL}"
REQUEST_COUNT=40 ./check-distribution.sh "${LB_URL}"
```

예상 결과:

```text
Requests by backend instance (40 total attempts):
  40 lab-board-api-xxxxx
Unique healthy backend instances observed: 1
```

## 16. Step 11 - CPU 부하 테스트와 Scale-out

부하 발생용 터미널에서 실행합니다.

```bash
cd "015-auto scaling/scripts"

DURATION_SECONDS=600 \
CONCURRENCY=20 \
ITERATIONS=250000 \
./run-load-test.sh "${LB_URL}"
```

각 요청은 Node.js의 비동기 PBKDF2 연산으로 CPU를 사용합니다. 게시판 조회 API나 Cloud DB에 대량 쿼리를 보내지 않으므로 DB 병목보다 Backend CPU 확장을 관찰하기 쉽습니다.

CPU가 50%에 도달하지 않으면 다음 순서로 한 단계씩 높입니다.

```bash
CONCURRENCY=40 ITERATIONS=250000 DURATION_SECONDS=600 ./run-load-test.sh "${LB_URL}"
```

```bash
CONCURRENCY=40 ITERATIONS=500000 DURATION_SECONDS=600 ./run-load-test.sh "${LB_URL}"
```

무조건 가장 높은 값부터 사용하지 마십시오. 수업용 서버 스펙에 따라 적은 동시성으로도 CPU가 충분히 올라갑니다.

부하가 실행되는 동안 콘솔에서 다음 순서로 관찰합니다.

1. Cloud Insight에서 기존 Backend의 평균 CPU가 50% 이상인지 확인
2. Event Rule에서 이벤트 발생 확인
3. Auto Scaling Group의 `실행 이력`에서 `scale-out-add-1` 실행 확인
4. Auto Scaling Group 서버 수가 1에서 2 이상으로 변경되는지 확인
5. Target Group에서 새 Target이 `정상`이 되는지 확인

서버 생성과 헬스 체크에는 수 분이 걸릴 수 있습니다. Metric 수집 1분, Event 지속 시간, 서버 생성, 헬스 체크 보류 및 쿨다운을 합산해서 기다립니다.

새 Target이 정상이 된 뒤 다른 터미널에서 분산을 확인합니다.

```bash
REQUEST_COUNT=100 ./check-distribution.sh "${LB_URL}"
./smoke-test-board.sh "${LB_URL}"
```

예상 결과:

```text
Requests by backend instance (100 total attempts):
  52 lab-board-api-aaaaa
  48 lab-board-api-bbbbb
Unique healthy backend instances observed: 2
```

Round Robin이라도 연결 상태와 Target 등록 시점 때문에 정확히 50:50일 필요는 없습니다. 서로 다른 hostname이 2개 이상 보이고 요청 실패가 없다면 분산 확인은 통과입니다.

## 17. Step 12 - Scale-in 확인

먼저 부하 테스트가 종료되었는지 확인합니다. 실행 중이면 `Ctrl+C`로 중지합니다.

Scale-out 검증이 끝난 뒤에 Scale-in Event Rule을 새로 만듭니다. 처음부터 두 Rule을 동시에 켜면 새로 생성된 저부하 서버의 Metric 때문에 수업 중 결과가 혼동될 수 있습니다.

| 항목 | 값 |
| --- | --- |
| 감시 대상 | `Server (VPC)`의 `lab-board-asg` |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `< 20` |
| 집약 방법 | `AVG` |
| 지속 시간 | `5 minutes` |
| 액션 | `scale-in-remove-1` |

확인 순서:

1. Cloud Insight 평균 CPU가 20% 미만으로 유지된다.
2. Scale-in Event가 발생한다.
3. Auto Scaling Group 실행 이력에 `scale-in-remove-1`이 보인다.
4. 서버 수가 최소 용량 1대까지 감소한다.
5. 종료된 서버가 Target Group에서 자동 제거된다.

최종 검증:

```bash
REQUEST_COUNT=40 ./check-distribution.sh "${LB_URL}"
./verify-backend.sh "${LB_URL}"
./smoke-test-board.sh "${LB_URL}"
```

Scale-in 전 작성한 게시글도 Web 화면에서 조회합니다. 게시글이 유지되는 이유는 데이터가 종료된 Backend 로컬 디스크가 아니라 Cloud DB에 저장되기 때문입니다.

## 18. 실습 결과 기록표

| 확인 항목 | 기록 값 |
| --- | --- |
| 부하 전 Backend 수 |  |
| 부하 전 hostname |  |
| CPU 이벤트 발생 시각 |  |
| Scale-out 시작 시각 |  |
| 새 Target 정상 시각 |  |
| 부하 후 Backend 수 |  |
| 분산 확인 hostname 목록 |  |
| Scale-in 시작 시각 |  |
| 최종 Backend 수 |  |
| 최종 게시글 CRUD | 성공 / 실패 |

## 19. 트러블슈팅

### Target이 계속 비정상

Backend 서버에서 확인:

```bash
sudo systemctl status chapter3-backend --no-pager
sudo journalctl -u chapter3-backend -n 100 --no-pager
curl -i http://127.0.0.1:4000/api/health
ss -lntp | grep ':4000'
```

점검 순서:

1. Backend ACG가 Load Balancer Subnet CIDR의 `4000/tcp`를 허용하는지 확인
2. Target Group 포트가 `4000`, 경로가 `/api/health`인지 확인
3. Cloud DB가 Backend ACG의 `3306/tcp`를 허용하는지 확인
4. `/opt/chapter3-backend/.env`의 DB 정보 확인
5. 헬스 체크 보류 기간을 `300초` 이상으로 설정했는지 확인

### Stress API가 404

이미지 안의 설정을 확인합니다.

```bash
grep '^LAB_STRESS_ENABLED' /opt/chapter3-backend/.env
sudo systemctl restart chapter3-backend
curl -i 'http://127.0.0.1:4000/api/stress?iterations=10000'
```

값이 `true`가 아니면 골든 이미지를 수정한 뒤 새 Server Image와 새 Launch Configuration을 만드는 것이 안전합니다.

### CPU는 높은데 Scale-out이 실행되지 않음

- ASG 생성 시 `상세 모니터링 적용` 여부 확인
- Metric이 `SERVER/avg_cpu_used_rto`인지 확인
- Event Rule 감시 대상이 `lab-board-asg`인지 확인
- Event Rule 액션에 `scale-out-add-1`이 연결되었는지 확인
- ASG `실행 이력`과 쿨다운 확인
- ASG 상세 프로세스에서 알람 통보/정책 관련 프로세스가 일시 정지되지 않았는지 확인
- 현재 서버 수가 최대 용량 `3`에 도달했는지 확인

### 새 서버가 생겼다가 바로 반납됨

- `/api/health`가 DB 연결까지 검사하므로 Cloud DB ACG가 새 Backend를 허용해야 합니다.
- Load Balancer 헬스 체크 보류 기간을 너무 짧게 잡지 않습니다.
- 이미지 생성 전에 systemd 서비스가 `enabled`였는지 확인합니다.

### Web 브라우저에서만 API 오류

```bash
grep '^FRONTEND_ORIGIN' /opt/chapter3-backend/.env
curl http://WEB_SERVER_PUBLIC_IP/config.js
```

- `FRONTEND_ORIGIN`에 브라우저가 실제로 연 Web URL이 포함되어야 합니다.
- `config.js`의 `BACKEND_BASE_URL`은 ALB URL이어야 합니다.
- HTTP Web에서 HTTPS API 또는 그 반대로 섞지 않습니다.

### 분산 결과가 hostname 하나만 표시됨

- Target Group에서 정상 Target이 2개 이상인지 확인합니다.
- Sticky Session을 끄고 알고리즘을 Round Robin으로 설정합니다.
- 새 Target이 정상 전환된 뒤 다시 실행합니다.

```bash
REQUEST_COUNT=200 ./check-distribution.sh "${LB_URL}"
```

## 20. 비용 정리 순서

실습 후 불필요한 과금을 막기 위해 다음 순서로 정리합니다.

1. 부하 테스트 종료
2. Cloud Insight Scale-out/Scale-in Event Rule 삭제
3. ASG 최소 용량과 기대 용량을 `0`으로 변경하고 서버가 모두 반납될 때까지 대기
4. Auto Scaling Group 삭제
5. Launch Configuration 삭제
6. Application Load Balancer 삭제
7. Target Group 삭제
8. 골든 Backend 서버 반납
9. Server Image와 연결된 Snapshot 삭제
10. 실습 전용 ACG와 Subnet 정리

기존 007 Web 서버와 012 Cloud DB를 다음 실습에서 사용할 경우에는 삭제하지 않습니다.

## 21. 핵심 개념 정리

| 개념 | 이 실습에서의 역할 |
| --- | --- |
| Server Image | 애플리케이션과 설정이 설치된 Backend의 디스크 상태 |
| Launch Configuration | Image, 서버 스펙, 인증키를 묶은 생성 템플릿 |
| Auto Scaling Group | 최소 1대, 최대 3대 범위에서 Backend 수 관리 |
| Scaling Policy | 한 번 실행될 때 서버 수를 `+1` 또는 `-1` 변경 |
| Event Rule | 평균 CPU 조건을 감시하고 Scaling Policy 실행 |
| Target Group | Backend `:4000`과 `/api/health` 상태 관리 |
| Application Load Balancer | Public HTTP 요청을 정상 Backend로 분산 |
| Cooldown | 확장 직후 다음 정책 실행을 잠시 억제 |
| Health Check Grace Period | 새 서버가 준비될 시간을 보장 |

## 22. 공식 문서

- [Naver Cloud Auto Scaling 시나리오](https://guide.ncloud-docs.com/docs/autoscaling-procedure)
- [Launch Configuration](https://guide.ncloud-docs.com/docs/autoscaling-lc-vpc)
- [Auto Scaling Group](https://guide.ncloud-docs.com/docs/autoscaling-asg-vpc)
- [Server Image](https://guide.ncloud-docs.com/docs/server-serverimage-vpc)
- [Target Group](https://guide.ncloud-docs.com/docs/loadbalancer-targetgroup-vpc)
- [Application Load Balancer](https://guide.ncloud-docs.com/docs/loadbalancer-application-vpc)
- [Cloud Insight Event Rule](https://guide.ncloud-docs.com/docs/cloudinsight-use-eventrule)
- [평균 CPU Metric 선택 주의사항](https://guide.ncloud-docs.com/docs/cloudinsight-troubleshoot-event)
