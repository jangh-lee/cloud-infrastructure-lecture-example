# 014 Auto Scaling Hands-on (2)

!!! info "최종 실습 범위"
    003번 Web 서버로 이미지를 만들고 **Public Application Load Balancer 뒤에서 Web 서버를 Auto Scaling**합니다. Backend와 DB 서버는 기존 서버 한 대를 그대로 사용합니다.

    Web 이미지, Launch Configuration, Target Group, Public ALB, Web Auto Scaling Group, Scaling Policy, Cloud Insight 연동과 Bastion 부하 명령만 다룹니다.

- [003 Three Tier Web App 교재](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/003-three-tier-web-app/)
- [013 Auto Scaling 기초 실습](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/013-auto-scaling/)
- [GitHub 014 실습 폴더](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/tree/main/014-auto%20scaling)

## 1. 완성 구조

```text
사용자 브라우저
      |
      v
Public Application Load Balancer :80
      |
      v
Web Auto Scaling Group :80
      |
      | Nginx /api Reverse Proxy
      v
고정 Backend 서버 :4000
      |
      v
고정 DB 서버 :3306

Bastion
  |-- Public ALB HTTP 호출과 분산 확인
  +-- Web Private IP에 stress-ng 원격 실행
```

모든 Web 서버는 같은 `.env`를 사용합니다.

```env
BACKEND_UPSTREAM=http://BACKEND_SERVER_PRIVATE_IP:4000
```

Web 서버가 늘어나도 Backend 주소는 바뀌지 않습니다. 이번 실습은 **Web 계층만 확장**하므로 Backend와 DB는 여전히 단일 장애 지점입니다.

## 2. Backend가 아니라 Web에 부하를 주는 이유

Auto Scaling 정책의 감시 대상은 Web Auto Scaling Group입니다. Backend의 `/api/stress`를 호출하면 Backend CPU만 올라가므로 Web ASG의 확장 조건을 검증할 수 없습니다.

이번 실습에서는 Bastion에서 현재 Web 인스턴스에 `stress-ng`를 원격 실행해 Web CPU를 높입니다. Public ALB의 실제 분산은 `/web-instance` 반복 호출로 별도 확인합니다.

!!! note "ApacheBench만으로는 CPU가 충분히 오르지 않을 수 있습니다"
    정적 파일을 제공하는 Nginx는 효율적이어서 `ab`로 `/`를 많이 호출해도 서버 사양에 따라 CPU 임계값을 넘지 않을 수 있습니다. `ab`는 선택적인 HTTP 트래픽 테스트로 사용하고, 자동 확장 완료 기준은 `stress-ng`로 검증합니다.

## 3. 완료 기준

- [ ] 기존 Web의 `/healthz`가 HTTP `200`을 반환합니다.
- [ ] 기존 Web의 `/web-instance`에 Web hostname이 보입니다.
- [ ] Public ALB를 통해 게시판과 `/api/health`가 정상입니다.
- [ ] Web 내 서버 이미지와 Launch Configuration을 만들었습니다.
- [ ] Web ASG 서버 한 대가 Target Group에서 `정상`입니다.
- [ ] 기존 003 Web 서버를 Target Group에서 제거했습니다.
- [ ] Bastion에서 Web ASG 인스턴스에 CPU 부하를 실행했습니다.
- [ ] Cloud Insight Event가 Scale-out 정책을 실행합니다.
- [ ] Web ASG가 `1대 → 2대` 이상으로 확장됩니다.
- [ ] Public ALB 호출에서 서로 다른 Web hostname이 보입니다.
- [ ] 부하 종료 후 Web ASG가 최소 용량 `1`대로 축소됩니다.
- [ ] Scale-out과 Scale-in 중에도 게시판 조회와 글쓰기가 정상입니다.

## 4. Step 0 - 사용할 값 기록

| 값 | 설명 |
| --- | --- |
| 기존 Web 서버 | 003 Web 서버, 이미지 원본과 임시 Target |
| Web Private IP | 기존 Web의 사설 주소 |
| Web ACG | 기존 Web에 적용된 ACG |
| Backend Private IP | 모든 Web Nginx가 사용할 고정 upstream |
| VPC | 003 서버가 속한 VPC |
| Bastion | Web Private IP로 SSH 가능한 서버 |
| 인증키 | Auto Scaling Web 서버 관리자 비밀번호 확인용 |

003 Web, Backend, DB가 모두 정상인 상태에서 시작합니다.

## 5. Step 1 - 기존 Web을 ALB Target으로 준비

기존 Web 서버에서 최신 코드를 받고 Nginx 설정을 갱신합니다.

```bash
cd ~/cloud-infrastructure-lecture-example
git pull --ff-only origin main
cd ~/cloud-infrastructure-lecture-example/003-three\ tier\ web\ app/web
sudo ./install-web.sh configure
```

한 번에 상태를 확인합니다.

```bash
sudo ./install-web.sh status
curl -i http://127.0.0.1/
curl -i http://127.0.0.1/healthz
curl -i http://127.0.0.1/web-instance
curl -i http://127.0.0.1/api/health
curl -i http://127.0.0.1/api/instance
```

| 경로 | 확인할 결과 |
| --- | --- |
| `/` | 게시판 HTML |
| `/healthz` | HTTP `200`, 본문 `ok` |
| `/web-instance` | 기존 Web hostname과 Private IP |
| `/api/health` | 고정 Backend Health `200` |
| `/api/instance` | `X-Web-Instance`와 `X-Backend-Instance` |

`.env`의 upstream이 기존 Backend Private IP인지 확인합니다.

```bash
grep '^BACKEND_UPSTREAM=' .env
```

```env
BACKEND_UPSTREAM=http://BACKEND_SERVER_PRIVATE_IP:4000
```

## 6. Step 2 - Web ACG와 Public LB Subnet 준비

Public ALB에는 **Public Load Balancer 전용 Subnet**이 필요합니다. 기존 VPC에 없다면 **Services > Networking > VPC > Subnet**에서 생성합니다.

| 항목 | 예시 |
| --- | --- |
| 이름 | `lab-public-lb-subnet` |
| VPC | 003 VPC |
| IP 주소 범위 | 기존 Subnet과 겹치지 않는 대역 |
| 용도 | Load Balancer |
| 유형 | Public |

Web ACG에 다음 규칙을 추가합니다.

| 프로토콜 | 포트 | 접근 소스 | 목적 |
| --- | --- | --- | --- |
| TCP | `80` | Public LB Subnet CIDR | ALB 요청과 Health Check |
| TCP | `22` | Bastion ACG 또는 Bastion Private IP | 부하 실행과 점검 |

기존 Web 서버를 Public IP로 직접 확인하는 동안에는 `0.0.0.0/0 → 80` 규칙을 유지해도 됩니다. ALB 전환이 끝나면 Web `80/tcp`는 Public LB Subnet에서만 허용하는 것이 안전합니다.

Backend ACG의 `4000/tcp` 접근 소스는 개별 Web IP가 아니라 **Web ACG**로 설정합니다. 그래야 새 Web 인스턴스도 같은 Backend에 연결할 수 있습니다.

## 7. Step 3 - Web Target Group 생성

1. **Services > Networking > Load Balancer > Target Group**으로 이동합니다.
2. **Target Group 생성**을 클릭합니다.
3. 다음 값을 입력합니다.

| 항목 | 값 |
| --- | --- |
| 이름 | `lab-web-tg` |
| Target 유형 | 일반 VPC 서버 |
| VPC | 003 VPC |
| 프로토콜 | HTTP |
| 포트 | `80` |
| 알고리즘 | Round Robin |
| Sticky Session | 사용 안 함 |

Health Check는 다음과 같이 설정합니다.

| 항목 | 값 |
| --- | --- |
| 프로토콜 | HTTP |
| 포트 | `80` |
| Method | GET |
| URL Path | `/healthz` |
| 주기 | `10`초 |
| 정상 임계값 | `2` |
| 실패 임계값 | `3` |

Target 추가 화면에서 **기존 003 Web 서버**를 임시 Target으로 추가합니다. 생성 후 **Target 상태 확인**에서 기존 Web이 `정상`인지 확인합니다.

비정상이면 다음을 다시 확인합니다.

- 기존 Web에서 `curl -i http://127.0.0.1/healthz`가 성공합니다.
- Web ACG가 Public LB Subnet CIDR의 `80/tcp`를 허용합니다.
- Target Group 포트는 `80`, Health 경로는 `/healthz`입니다.

## 8. Step 4 - Public Application Load Balancer 생성

1. **Services > Networking > Load Balancer > Load Balancer**로 이동합니다.
2. **로드밸런서 생성 > 애플리케이션 로드밸런서 생성**을 클릭합니다.
3. 다음 값을 입력합니다.

| 항목 | 값 |
| --- | --- |
| 이름 | `lab-web-alb` |
| Network | Public IP |
| VPC | 003 VPC |
| Subnet | `lab-public-lb-subnet` |
| Listener | HTTP `80` |
| Target Group | `lab-web-tg` |

상태가 `운영 중`이 되면 제공된 Public 도메인을 기록합니다.

```bash
ALB_URL="http://PUBLIC_ALB_DOMAIN"
curl -i "$ALB_URL/healthz"
curl -i "$ALB_URL/web-instance"
curl -i "$ALB_URL/api/health"
```

세 요청이 모두 HTTP `200`이면 `Public ALB → 기존 Web → 고정 Backend` 경로가 정상입니다.

## 9. Step 5 - Web 대표 주소를 Public ALB로 변경

Web 서버의 `SITE_BASE_URL`을 대표 접속 주소인 Public ALB로 변경합니다. Backend upstream은 그대로 둡니다.

```bash
cd ~/cloud-infrastructure-lecture-example/003-three\ tier\ web\ app/web
nano .env
sudo ./install-web.sh configure
```

```env
SITE_BASE_URL=http://PUBLIC_ALB_DOMAIN
BACKEND_UPSTREAM=http://BACKEND_SERVER_PRIVATE_IP:4000
SITE_TITLE=DevForum Practice Board
```

브라우저에서 Public ALB 주소로 게시판을 열고 글 조회, 작성, 삭제를 확인합니다.

## 10. Step 6 - Web 이미지 준비와 생성

Auto Scaling 동작을 확실하게 검증할 수 있도록 기존 Web 서버에 `stress-ng`와 `htop`을 함께 설치합니다. `stress-ng`는 CPU 부하를 만들고, `htop`은 CPU·메모리와 실행 중인 프로세스를 실시간으로 확인할 때 사용합니다.

```bash
sudo apt-get update && sudo apt-get install -y stress-ng htop
stress-ng --version
htop --version
systemctl is-enabled nginx
systemctl is-active nginx
curl -i http://127.0.0.1/healthz
```

`stress-ng`와 `htop` 버전, `enabled`, `active`, HTTP `200`을 확인한 뒤 이미지를 만듭니다. 이 시점에 설치하면 이후 이미지로 생성되는 모든 Auto Scaling Web 서버에서 두 명령을 바로 사용할 수 있습니다.

1. **Services > Compute > Server > Server**로 이동합니다.
2. 기존 003 Web 서버를 선택합니다.
3. **서버 관리 및 설정 변경 > 내 서버 이미지 생성**을 클릭합니다.

| 항목 | 값 |
| --- | --- |
| 이미지 이름 | `lab-web-image-v1` |
| 설명 | `003 web image for auto scaling` |

**Compute > Server > Server Image**에서 상태가 `생성됨`이 될 때까지 기다립니다.

## 11. Step 7 - Launch Configuration 생성

1. **Services > Compute > Auto Scaling > Launch Configuration**으로 이동합니다.
2. **Launch Configuration 생성**을 클릭합니다.
3. **내 서버 이미지**에서 `lab-web-image-v1`을 선택합니다.

| 항목 | 값 |
| --- | --- |
| 서버 이미지 | `lab-web-image-v1` |
| 서버 사양 | 원본 Web과 같거나 수업용 최소 사양 |
| 스토리지 | 기본값 |
| Init Script | 사용 안 함 |
| 이름 | `lab-web-lc-v1` |
| 인증키 | 기존 수업용 인증키 |

Nginx, 정적 파일, `.env`, `stress-ng`, `htop`이 이미지에 이미 있으므로 Init Script를 사용하지 않습니다.

## 12. Step 8 - Web Auto Scaling Group 생성

1. **Services > Compute > Auto Scaling > Auto Scaling Group**으로 이동합니다.
2. **Auto Scaling Group 생성**을 클릭합니다.
3. `lab-web-lc-v1`을 선택합니다.

| 항목 | 값 |
| --- | --- |
| 이름 | `lab-web-asg` |
| VPC | 003 VPC |
| Subnet | Web 서버용 Private Subnet |
| 서버 이름 Prefix | `lab-web-as` |
| 최소 용량 | `1` |
| 최대 용량 | `3` |
| 기대 용량 | `1` |
| 상세 모니터링 | 사용 |
| Cooldown 기본값 | `60`초 |
| Health Check 보류 기간 | `60`초 |
| Health Check 유형 | Load Balancer |
| Target Group | `lab-web-tg` |

네트워크 접근 설정에서 Web ACG를 선택합니다. 정책과 통보는 우선 **나중에 설정**으로 그룹을 생성합니다.

다음 순서로 확인합니다.

1. `lab-web-as` 서버가 생성됩니다.
2. Target Group에 새 Web 서버가 자동 추가됩니다.
3. `/healthz` 검사 후 새 Web이 `정상`이 됩니다.
4. Public ALB로 게시판과 `/api/health`가 정상입니다.

새 ASG Web이 정상 상태가 되면 Target Group의 **Target 설정**에서 임시로 넣었던 기존 003 Web 서버를 제거합니다. 이제 Target Group에는 ASG Web만 남아야 합니다.

## 13. Step 9 - Scaling Policy 생성

`lab-web-asg`를 선택하고 **설정 > 정책 > 생성**으로 이동합니다.

### Scale-out 정책

| 항목 | 값 |
| --- | --- |
| 정책 이름 | `web-add-1` |
| Scaling 설정 | 증감 변경 |
| 조정값 | `1` 증가 |
| Cooldown | `60`초 |

### Scale-in 정책

| 항목 | 값 |
| --- | --- |
| 정책 이름 | `web-remove-1` |
| Scaling 설정 | 증감 변경 |
| 조정값 | `1` 감소 |
| Cooldown | `60`초 |

최대 용량 `3`보다 늘어나거나 최소 용량 `1`보다 줄어들지 않습니다.

## 14. Step 10 - 부하 전 Web 분산 확인

Bastion에서 Public ALB를 20번 호출합니다.

```bash
ALB_URL="http://PUBLIC_ALB_DOMAIN"

for i in $(seq 1 20); do
  curl -fsS "$ALB_URL/web-instance"
  echo
done | sed -n 's/.*"instance":"\([^"]*\)".*/\1/p' | sort | uniq -c
```

현재 기대 용량이 `1`이므로 hostname 하나에 20회가 집계되어야 합니다.

```text
20 lab-web-as-xxxxx
```

## 15. Step 11 - Cloud Insight Event Rule 연결

Scaling Policy만 만들면 CPU에 따라 자동 실행되지 않습니다. **Services > Management & Governance > Cloud Insight > Configuration > Event Rule**에서 두 규칙을 만듭니다.

### Scale-out Event Rule

| 항목 | 값 |
| --- | --- |
| 상품 | Server (VPC) |
| 감시 대상 | Auto Scaling Group `lab-web-asg` |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `>= 50` |
| 집약 | AVG |
| 지속 시간 | `1 minute` |
| 액션 | Auto Scaling Policy `web-add-1` |

### Scale-in Event Rule

| 항목 | 값 |
| --- | --- |
| 상품 | Server (VPC) |
| 감시 대상 | Auto Scaling Group `lab-web-asg` |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `< 20` |
| 집약 | AVG |
| 지속 시간 | `1 minute` |
| 액션 | Auto Scaling Policy `web-remove-1` |

Scale-in Rule은 Scale-out 검증이 끝난 뒤 활성화해도 됩니다. 두 규칙이 동시에 움직여 관찰이 어려워지는 것을 방지할 수 있습니다.

!!! note "1분의 의미"
    `1 minute`은 CPU 조건이 지속되어 Event가 실행되는 수업용 감지 기준입니다. Cloud Insight 수집 주기와 서버 생성, 부팅, Target Health Check가 추가로 필요하므로 새 Web 서버가 `정상`이 되는 전체 시간이 정확히 1분이라는 뜻은 아닙니다. 운영 환경에서는 순간 부하로 인한 반복 증감을 막기 위해 더 긴 지속 시간과 Cooldown을 사용합니다. 새 서버가 부팅 전에 비정상 판정되어 반복 반납되면 Health Check 보류 기간을 기본값인 `300초`로 되돌립니다.

## 16. Step 12 - Bastion에서 Web CPU 부하 실행

콘솔의 ASG **서버 목록**에서 현재 Web 인스턴스 Private IP를 확인합니다. Bastion에서 먼저 SSH와 `stress-ng`, `htop` 설치 상태를 확인합니다.

```bash
WEB_PRIVATE_IP="WEB_ASG_INSTANCE_PRIVATE_IP"
ssh root@"$WEB_PRIVATE_IP" 'hostname; stress-ng --version; htop --version'
```

메트릭 수집 지연을 고려해 최대 3분 동안 Web CPU를 약 90%로 높입니다. 정책 조건 자체는 1분입니다.

```bash
ssh root@"$WEB_PRIVATE_IP" \
  'nohup stress-ng --cpu 0 --cpu-load 90 --timeout 180s >/tmp/web-stress.log 2>&1 &'
```

실행 상태를 확인합니다.

```bash
ssh root@"$WEB_PRIVATE_IP" 'pgrep -af stress-ng; uptime'
```

새 Bastion 터미널에서 `htop`을 열면 CPU 상승과 `stress-ng-cpu` 프로세스를 실시간으로 볼 수 있습니다.

```bash
ssh -t root@"$WEB_PRIVATE_IP" htop
```

`htop`에서 `1`은 CPU 코어별 표시, `P`는 CPU 사용률 순 정렬, `q`는 종료입니다. `htop`은 현재 접속한 Web 한 대만 보여주므로 Scale-out 후 새 서버도 보려면 해당 Private IP로 다시 접속합니다.

명령을 입력하는 위치는 Bastion이지만 실제 CPU 부하는 Web 인스턴스에서 발생합니다. Backend의 `/api/stress`는 사용하지 않습니다.

## 17. Step 13 - Scale-out 관찰과 재확인

다음 화면을 순서대로 확인합니다.

| 순서 | 화면 | 확인할 변화 |
| --- | --- | --- |
| 1 | Cloud Insight | Web ASG 평균 CPU 50% 이상 |
| 2 | Event Rule | Scale-out Event 발생 |
| 3 | ASG 이력 | `web-add-1` 실행 |
| 4 | Server | 새 `lab-web-as` 서버 생성 |
| 5 | Target Group | 새 Web Target `정상` |
| 6 | ASG | 서버 수 `1 → 2` |

새 Web이 정상 상태가 된 뒤 Bastion에서 다시 집계합니다.

```bash
for i in $(seq 1 40); do
  curl -fsS "$ALB_URL/web-instance"
  echo
done | sed -n 's/.*"instance":"\([^"]*\)".*/\1/p' | sort | uniq -c
```

서로 다른 Web hostname이 보이고 합계가 40이면 분산 성공입니다. 정확히 절반씩 나올 필요는 없습니다. 게시판 하단의 작은 Web 배지도 5초마다 hostname과 Private IP를 갱신하므로 브라우저에서 처리 서버가 바뀌는 모습을 함께 확인할 수 있습니다.

게시판 API도 계속 정상인지 확인합니다.

```bash
curl -i "$ALB_URL/api/health"
curl -sS "$ALB_URL/api/posts" | head
```

## 18. 선택 실습 - Bastion에서 HTTP 트래픽 발생

실제 사용자 요청 형태도 확인하려면 Bastion에 ApacheBench를 설치해 Public ALB를 호출합니다.

```bash
sudo apt-get update && sudo apt-get install -y apache2-utils
ab -t 60 -c 200 "$ALB_URL/"
```

이 요청은 `Public ALB → Web ASG` 경로를 사용합니다. 다만 Nginx 정적 페이지는 CPU 사용량이 낮을 수 있으므로 이 명령만으로 Scale-out되지 않아도 오류가 아닙니다.

## 19. Step 14 - 부하 종료와 Scale-in 확인

부하를 즉시 중지하려면 Bastion에서 실행합니다.

```bash
ssh root@"$WEB_PRIVATE_IP" 'pkill -f stress-ng || true'
```

CPU가 내려간 뒤 Scale-in Event와 `web-remove-1` 실행을 확인합니다. ASG 서버 수가 `2 → 1`이 되고 Target Group에서 종료 서버가 제거되어야 합니다.

마지막으로 Public ALB에서 게시판을 조회하고 새 글을 작성합니다. Web 서버가 교체되어도 데이터는 고정 Backend와 DB에 있으므로 유지되어야 합니다.

## 20. 최종 확인표

| 확인 위치 | 결과 |
| --- | --- |
| 외부 진입점 | Public ALB |
| Target Group | Web HTTP `80`, `/healthz` |
| Auto Scaling 대상 | Web 서버 |
| Web API 처리 | `/api`를 고정 Backend로 프록시 |
| Backend/DB | 기존 고정 서버 유지 |
| 용량 | 최소 `1`, 최대 `3`, 기대 `1` |
| Scale-out 부하 | Bastion에서 Web에 `stress-ng` 원격 실행 |
| 분산 확인 | Public ALB `/web-instance` hostname 집계 |
| 데이터 확인 | Scale-out/in 중 게시글 유지 |

## 21. 이미지 갱신

Web 코드나 Nginx 설정을 변경하면 기존 이미지에는 자동 반영되지 않습니다.

1. 원본 003 Web을 `git pull`과 `install-web.sh configure`로 갱신합니다.
2. `/healthz`, `/web-instance`, `/api/health`를 확인합니다.
3. `lab-web-image-v2`를 만듭니다.
4. `lab-web-lc-v2`를 만듭니다.
5. ASG의 Launch Configuration을 v2로 변경합니다.
6. 기존 Web 인스턴스를 최소 용량을 유지하며 순차 교체합니다.

## 22. 실습 종료와 비용 정리

1. ASG 최소 용량과 기대 용량을 `0`으로 변경합니다.
2. ASG Web 서버가 모두 반납되면 Auto Scaling Group을 삭제합니다.
3. Public ALB를 삭제합니다.
4. Target Group을 삭제합니다.
5. Launch Configuration을 삭제합니다.
6. 내 서버 이미지와 연결 Snapshot을 삭제합니다.

기존 003 Web, Backend, DB는 다음 실습을 위해 유지할 수 있습니다. Public ALB를 삭제한 뒤에는 기존 Web Public IP로 다시 접속합니다.

다음 실습에서는 [015 Cloud DB for MySQL 생성 및 연결](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/015-cloud-db-mysql/)을 진행합니다.

## 23. 공식 문서

- [Auto Scaling 시작 절차](https://guide.ncloud-docs.com/docs/autoscaling-procedure)
- [내 서버 이미지](https://guide.ncloud-docs.com/docs/server-serverimage-vpc)
- [Launch Configuration](https://guide.ncloud-docs.com/docs/autoscaling-lc-vpc)
- [Auto Scaling Group](https://guide.ncloud-docs.com/docs/autoscaling-asg-vpc)
- [Target Group](https://guide.ncloud-docs.com/docs/loadbalancer-targetgroup-vpc)
- [Application Load Balancer](https://guide.ncloud-docs.com/docs/loadbalancer-application-vpc)
- [Cloud Insight Event Rule](https://guide.ncloud-docs.com/docs/cloudinsight-use-eventrule)
