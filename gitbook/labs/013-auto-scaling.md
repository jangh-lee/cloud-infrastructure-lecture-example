# 013 Backend Auto Scaling Hands-on

!!! info "이 실습에서 다루는 범위"
    003번에서 완성한 Backend 서버로 이미지를 만들고, **Private Application Load Balancer 뒤에 Auto Scaling Backend**를 구성합니다.

    내 서버 이미지, Launch Configuration, Target Group, Private ALB, Auto Scaling Group, Scaling Policy와 Web upstream 전환만 다룹니다. DB 이전, Public ALB, Cloud Insight, CPU 부하 테스트는 포함하지 않습니다.

- [003 Three Tier Web App 교재](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/003-three-tier-web-app/)
- [GitHub 013 실습 폴더](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/tree/main/013-auto%20scaling)

## 1. 완성 구조

```text
사용자 브라우저
      |
      | http://WEB_PUBLIC_IP/api/...
      v
003 Web 서버 Nginx
      |
      | BACKEND_UPSTREAM
      v
Private Application Load Balancer :80
      |
      v
Target Group HTTP :4000
      |
      v
Auto Scaling Backend 1~3대
      |
      v
003 DB 서버 :3306
```

브라우저와 Web 주소는 바뀌지 않습니다. 003에서는 Nginx가 기존 Backend Private IP를 바라보지만, 013에서는 `BACKEND_UPSTREAM`만 Private ALB 주소로 바꿉니다. ASG Backend의 개별 IP는 어디에도 직접 입력하지 않습니다.

!!! warning "기존 Backend가 ASG에 편입되는 것은 아닙니다"
    003 Backend는 이미지 원본이자 ALB 전환 중 임시 Target입니다. ASG는 이미지로 새로운 서버를 만들며, 새 서버가 정상 상태가 되면 기존 Backend를 Target Group에서 제거합니다.

Naver Cloud 콘솔의 공식 템플릿 명칭은 **Launch Configuration**입니다.

## 2. 완료 기준

- [ ] 기존 Backend의 서비스와 `/api/health`가 정상입니다.
- [ ] 내 서버 이미지 상태가 `생성됨`입니다.
- [ ] Launch Configuration을 만들었습니다.
- [ ] Target Group에서 기존 Backend가 `정상`입니다.
- [ ] Private ALB를 Web 서버에서 호출하면 HTTP `200`입니다.
- [ ] Web의 `BACKEND_UPSTREAM`을 Private ALB로 변경했습니다.
- [ ] ASG가 만든 Backend가 Target Group에서 `정상`입니다.
- [ ] 기존 Backend를 Target Group에서 제거했습니다.
- [ ] Scale-out으로 ASG 서버가 `1대 → 2대`가 됩니다.
- [ ] Web `/api/instance`에서 서로 다른 Backend hostname이 보입니다.
- [ ] Scale-in으로 ASG 서버가 `2대 → 1대`가 됩니다.

## 3. Step 0 - 기존 003 값 기록

| 확인할 값 | 사용할 값 |
| --- | --- |
| Web 서버 | 003 Web 서버 |
| 원본 Backend | 003 Backend 서버 |
| VPC | 003 서버가 속한 VPC |
| Backend Subnet | 기존 Backend가 속한 Private Subnet |
| Backend ACG | 기존 Backend가 사용하는 ACG |
| DB | 003 DB Private IP 또는 Private Domain |
| 인증키 | 기존 수업용 인증키 |

DB 서버를 직접 운영한다면 003 DB의 `.env`에서 `DB_ALLOWED_HOST`가 단일 Backend IP가 아니라 Backend Subnet 패턴인지 확인합니다.

```env
DB_ALLOWED_HOST=10.0.1.%
```

위 예시는 Backend Subnet이 `10.0.1.0/24`일 때 사용합니다. Cloud DB for MySQL을 사용한다면 DB ACG가 Backend ACG의 `3306/tcp`를 허용해야 합니다.

## 4. Step 1 - 이미지 생성 전 Backend 점검

기존 Backend 서버에서 실행합니다.

```bash
systemctl is-enabled chapter3-backend
systemctl is-active chapter3-backend
sudo ss -lntp | grep ':4000'
curl -i http://127.0.0.1:4000/api/health
curl -i http://127.0.0.1:4000/api/instance
```

| 명령 | 정상 결과 |
| --- | --- |
| `systemctl is-enabled` | `enabled` |
| `systemctl is-active` | `active` |
| `ss -lntp` | `:4000`, `LISTEN` |
| `/api/health` | HTTP `200` |
| `/api/instance` | 기존 Backend hostname |

하나라도 실패하면 이미지를 만들지 말고 로그를 확인합니다.

```bash
sudo systemctl enable --now chapter3-backend
sudo journalctl -u chapter3-backend -n 50 --no-pager
```

이미지에 포함될 환경값을 비밀번호 없이 확인합니다.

```bash
sudo test -f /opt/chapter3-backend/.env && echo '.env exists'
sudo grep -E '^(PORT|FRONTEND_ORIGIN|DB_HOST|DB_PORT|DB_NAME|DB_USER|AUTO_POST_ENABLED)=' /opt/chapter3-backend/.env
```

`PORT=4000`, 올바른 DB 주소, Web Public 주소인 `FRONTEND_ORIGIN`, `AUTO_POST_ENABLED=false`를 확인합니다.

!!! warning "실습 이미지와 비밀번호"
    기존 Backend의 `.env`도 이미지에 포함됩니다. 수업에서는 동일 설정 복제를 위해 사용하지만 운영 환경에서는 Secret Manager 등으로 비밀번호를 별도 주입해야 합니다.

## 5. Step 2 - Backend 내 서버 이미지 생성

1. **Services > Compute > Server > Server**로 이동합니다.
2. 기존 Backend 서버를 선택합니다.
3. **서버 관리 및 설정 변경 > 내 서버 이미지 생성**을 클릭합니다.
4. 아래 값을 입력합니다.

| 항목 | 입력값 |
| --- | --- |
| 이미지 이름 | `lab-backend-image-v1` |
| 설명 | `003 backend image for auto scaling` |

**Compute > Server > Server Image**에서 상태가 `생성 중`에서 `생성됨`으로 바뀔 때까지 기다립니다. 원본 Backend도 다시 `운영 중`인지 확인합니다.

## 6. Step 3 - Launch Configuration 생성

1. **Services > Compute > Auto Scaling > Launch Configuration**으로 이동합니다.
2. **Launch Configuration 생성**을 클릭합니다.
3. **내 서버 이미지** 탭에서 `lab-backend-image-v1`을 선택합니다.
4. 아래 기준으로 설정합니다.

| 항목 | 값 |
| --- | --- |
| 서버 이미지 | `lab-backend-image-v1` |
| 서버 사양 | 원본과 같거나 수업용 최소 사양 |
| 스토리지 | 기본값 |
| Init Script | 사용 안 함 |
| 이름 | `lab-backend-lc-v1` |
| 인증키 | 기존 수업용 인증키 |

이미지에 앱, `.env`, systemd 서비스가 이미 있으므로 Init Script로 설치를 반복하지 않습니다.

## 7. Step 4 - Private Load Balancer Subnet 확인

Private ALB는 전용 Load Balancer Subnet이 필요합니다. 기존 VPC에 없다면 **Services > Networking > VPC > Subnet**에서 생성합니다.

| 항목 | 예시 |
| --- | --- |
| 이름 | `lab-private-lb-subnet` |
| VPC | 003 VPC |
| IP 주소 범위 | 기존 Subnet과 겹치지 않는 대역 |
| 용도 | Load Balancer |
| 유형 | Private |

Backend ACG에는 이 **Private Load Balancer Subnet CIDR → TCP 4000** 규칙을 추가합니다. ALB Health Check와 API 요청이 모두 이 경로를 사용합니다.

| 프로토콜 | 포트 | 접근 소스 |
| --- | --- | --- |
| TCP | `4000` | Private Load Balancer Subnet CIDR |

003에서 사용한 Web ACG 또는 Web Private IP의 `4000/tcp` 규칙은 ALB 전환이 끝난 뒤 제거할 수 있습니다.

## 8. Step 5 - Target Group 생성

1. **Services > Networking > Load Balancer > Target Group**으로 이동합니다.
2. **Target Group 생성**을 클릭합니다.
3. 다음 값을 입력합니다.

| 항목 | 값 |
| --- | --- |
| 이름 | `lab-backend-tg` |
| Target 유형 | 일반 VPC 서버 |
| VPC | 003 VPC |
| 프로토콜 | HTTP |
| 포트 | `4000` |
| 알고리즘 | Round Robin |
| Sticky Session | 사용 안 함 |

Health Check를 설정합니다.

| 항목 | 값 |
| --- | --- |
| 프로토콜 | HTTP |
| 포트 | `4000` |
| Method | GET |
| URL Path | `/api/health` |
| 주기 | `10`초 |
| 정상 임계값 | `2` |
| 실패 임계값 | `3` |

Target 추가 화면에서는 **기존 003 Backend 서버를 임시 Target으로 추가**합니다. Target Group 생성 후 **Target 상태 확인**에서 기존 Backend가 `정상`인지 확인합니다.

로컬 Health는 정상인데 Target만 비정상이면 다음 두 항목을 확인합니다.

- Backend ACG가 Private Load Balancer Subnet CIDR의 `4000/tcp`를 허용합니다.
- Health Check 경로가 `/api/health`입니다.

## 9. Step 6 - Private Application Load Balancer 생성

1. **Services > Networking > Load Balancer > Load Balancer**로 이동합니다.
2. **로드밸런서 생성 > 애플리케이션 로드밸런서 생성**을 클릭합니다.
3. 다음 값을 입력합니다.

| 항목 | 값 |
| --- | --- |
| 이름 | `lab-backend-alb` |
| Network | Private IP |
| VPC | 003 VPC |
| Subnet | `lab-private-lb-subnet` |
| Listener | HTTP `80` |
| Target Group | `lab-backend-tg` |

상태가 `운영 중`이 되면 콘솔에 표시된 Private 접속 주소를 기록합니다. 이 주소는 인터넷 PC가 아니라 같은 VPC의 Web 서버에서 확인합니다.

Web 서버에서 실행합니다.

```bash
PRIVATE_ALB_URL="http://PRIVATE_ALB_ENDPOINT"
curl -i "$PRIVATE_ALB_URL/api/health"
curl -i "$PRIVATE_ALB_URL/api/instance"
```

두 요청이 HTTP `200`이고 `X-Backend-Instance`가 기존 Backend hostname이면 Private ALB 경로가 정상입니다.

## 10. Step 7 - Web upstream을 Private ALB로 전환

Web 서버에서 최신 코드를 받은 뒤 `.env`를 수정합니다.

```bash
cd ~/cloud-infrastructure-lecture-example
git pull --ff-only origin main
cd ~/cloud-infrastructure-lecture-example/003-three\ tier\ web\ app/web
nano .env
```

기존 Backend Private IP를 Private ALB 주소로 교체합니다.

```env
SITE_BASE_URL=http://WEB_SERVER_PUBLIC_IP
BACKEND_UPSTREAM=http://PRIVATE_ALB_ENDPOINT
SITE_TITLE=DevForum Practice Board
```

패키지 설치 없이 Nginx 설정만 반영하고 Web 경유 API를 확인합니다.

```bash
sudo ./install-web.sh configure
curl -i http://127.0.0.1/api/health
curl -i http://127.0.0.1/api/instance
```

브라우저 게시판도 새로 고침합니다. 주소는 계속 `http://WEB_SERVER_PUBLIC_IP/`이고 API Request URL도 `http://WEB_SERVER_PUBLIC_IP/api/...`입니다. Private ALB 주소는 브라우저에 노출되지 않습니다.

## 11. Step 8 - Auto Scaling Group 생성

Naver Cloud 공식 순서상 Load Balancer를 먼저 만든 뒤 ASG에 연결합니다.

1. **Services > Compute > Auto Scaling > Auto Scaling Group**으로 이동합니다.
2. **Auto Scaling Group 생성**을 클릭합니다.
3. `lab-backend-lc-v1`을 선택합니다.
4. 다음 값을 입력합니다.

| 항목 | 값 |
| --- | --- |
| 이름 | `lab-backend-asg` |
| VPC | 003 VPC |
| Subnet | 기존 Backend Private Subnet |
| 서버 이름 Prefix | `lab-backend-as` |
| 최소 용량 | `1` |
| 최대 용량 | `3` |
| 기대 용량 | `1` |
| 상세 모니터링 | 사용 안 함 |
| Cooldown 기본값 | `300`초 |
| Health Check 보류 기간 | `300`초 |
| Health Check 유형 | Load Balancer |
| Target Group | `lab-backend-tg` |

네트워크 접근 설정에서 기존 Backend ACG를 선택합니다. 정책과 통보는 우선 **나중에 설정**을 선택하고 그룹을 생성합니다.

다음 순서로 관찰합니다.

1. ASG 서버 수가 `0 → 1`로 바뀝니다.
2. `lab-backend-as` Prefix의 서버가 생성됩니다.
3. Target Group에 새 서버가 자동 추가됩니다.
4. 새 ASG Backend가 `정상`이 됩니다.

새 서버가 `정상`이 된 뒤 Target Group의 **Target 설정**에서 임시로 넣었던 기존 003 Backend를 제거합니다. 이제 Target Group에는 ASG Backend만 남아야 합니다.

Web 서버에서 확인합니다.

```bash
curl -i http://127.0.0.1/api/instance
```

`X-Backend-Instance`와 JSON `instance`가 `lab-backend-as`로 시작하는 새 서버 hostname인지 확인합니다.

## 12. Step 9 - Scaling Policy 생성

`lab-backend-asg`를 선택하고 **설정 > 정책 > 생성**으로 이동합니다.

### Scale-out 정책

| 항목 | 값 |
| --- | --- |
| 정책 이름 | `backend-add-1` |
| Scaling 설정 | 증감 변경 |
| 조정값 | `1` 증가 |
| Cooldown | `300`초 |

### Scale-in 정책

| 항목 | 값 |
| --- | --- |
| 정책 이름 | `backend-remove-1` |
| Scaling 설정 | 증감 변경 |
| 조정값 | `1` 감소 |
| Cooldown | `300`초 |

정책은 서버 수를 어떻게 바꿀지 정의합니다. CPU 조건으로 자동 실행하려면 Cloud Insight Event Rule이 추가로 필요하지만 이번 실습에서는 정책을 직접 실행합니다.

## 13. Step 10 - Scale-out 실행과 분산 확인

1. **설정 > 정책**에서 `backend-add-1`을 선택합니다.
2. **실행**을 클릭합니다.
3. **서버 목록**과 **이력**을 확인합니다.
4. ASG 서버 수가 `1 → 2`가 될 때까지 기다립니다.
5. Target Group에서 두 ASG Backend가 모두 `정상`인지 확인합니다.

Web 서버에서 20회 호출해 실제 처리 Backend를 집계합니다.

```bash
for i in $(seq 1 20); do
  curl -fsS http://127.0.0.1/api/instance
  echo
done | sed -n 's/.*"instance":"\([^"]*\)".*/\1/p' | sort | uniq -c
```

예상 형태:

```text
10 lab-backend-as-xxxxx
10 lab-backend-as-yyyyy
```

정확히 10회씩일 필요는 없습니다. 서로 다른 ASG Backend hostname이 보이고 합계가 20이면 `Web → Private ALB → ASG Backend` 분산을 확인한 것입니다.

## 14. Step 11 - 새 Backend 내부 확인

필요하면 콘솔에서 새 서버의 관리자 비밀번호를 확인한 뒤 기존 Backend 또는 Bastion에서 접속합니다.

```bash
ssh root@NEW_BACKEND_PRIVATE_IP
hostname
systemctl is-enabled chapter3-backend
systemctl is-active chapter3-backend
sudo ss -lntp | grep ':4000'
curl -i http://127.0.0.1:4000/api/health
```

서비스가 실패했다면 로그와 DB 설정을 확인합니다.

```bash
sudo journalctl -u chapter3-backend -n 100 --no-pager
sudo grep -E '^(PORT|DB_HOST|DB_PORT|DB_NAME|DB_USER)=' /opt/chapter3-backend/.env
```

DB 오류는 DB Host 허용 범위, DB ACG, ASG Subnet과 ACG를 확인합니다.

## 15. Step 12 - Scale-in 실행

1. **설정 > 정책**에서 `backend-remove-1`을 선택합니다.
2. **실행**을 클릭합니다.
3. ASG 서버 수가 `2 → 1`로 줄어드는지 확인합니다.
4. Target Group에서도 종료된 서버가 제거되는지 확인합니다.
5. Web 게시판 조회와 글쓰기가 계속 되는지 확인합니다.

최소 용량이 `1`이므로 다시 실행해도 `0`대로 줄어들지 않습니다.

## 16. 최종 확인표

| 확인 위치 | 결과 |
| --- | --- |
| Web 브라우저 주소 | 기존 Web Public IP 유지 |
| Web API 경로 | `/api/...` 상대경로 |
| Nginx upstream | Private ALB 주소 |
| Load Balancer | Private Application Load Balancer |
| Target Group | HTTP `4000`, `/api/health` |
| Target | ASG Backend만 존재 |
| ASG 용량 | 최소 `1`, 최대 `3`, 기대 `1` |
| Health Check | Load Balancer, 보류 `300`초 |
| Scale-out | `1대 → 2대`, hostname 2개 |
| Scale-in | `2대 → 1대`, 게시판 정상 |

## 17. Backend 이미지 갱신

Backend 코드를 변경해도 기존 이미지와 Launch Configuration은 자동으로 바뀌지 않습니다.

1. 원본 Backend 코드와 설정을 수정합니다.
2. 서비스와 Health API를 점검합니다.
3. `lab-backend-image-v2`를 만듭니다.
4. 새 이미지로 `lab-backend-lc-v2`를 만듭니다.
5. ASG의 Launch Configuration을 v2로 변경합니다.
6. 기존 인스턴스를 최소 용량을 지키며 순차 교체합니다.

## 18. 실습 종료와 비용 정리

Private ALB를 삭제하기 전에 Web을 기존 Backend로 되돌려 게시판 연결을 유지합니다.

```bash
cd ~/cloud-infrastructure-lecture-example/003-three\ tier\ web\ app/web
nano .env
sudo ./install-web.sh configure
curl -i http://127.0.0.1/api/health
```

```env
BACKEND_UPSTREAM=http://ORIGINAL_BACKEND_PRIVATE_IP:4000
```

그다음 순서대로 정리합니다.

1. ASG 최소 용량과 기대 용량을 `0`으로 변경합니다.
2. ASG 서버가 모두 반납되면 Auto Scaling Group을 삭제합니다.
3. Private ALB를 삭제합니다.
4. Target Group을 삭제합니다.
5. Launch Configuration을 삭제합니다.
6. 더 이상 필요 없는 내 서버 이미지를 삭제합니다.
7. 3세대 서버라면 이미지와 함께 만들어진 Snapshot도 삭제합니다.

원본 003 Web, Backend, DB 서버는 삭제하지 않습니다.

## 19. 공식 문서

- [Auto Scaling 시작 절차](https://guide.ncloud-docs.com/docs/autoscaling-procedure)
- [내 서버 이미지](https://guide.ncloud-docs.com/docs/server-serverimage-vpc)
- [Launch Configuration](https://guide.ncloud-docs.com/docs/autoscaling-lc-vpc)
- [Auto Scaling Group](https://guide.ncloud-docs.com/docs/autoscaling-asg-vpc)
- [Target Group](https://guide.ncloud-docs.com/docs/loadbalancer-targetgroup-vpc)
- [Application Load Balancer](https://guide.ncloud-docs.com/docs/loadbalancer-application-vpc)
