# 013 Backend Auto Scaling Hands-on

!!! info "이 실습에서 다루는 범위"
    003번에서 완성한 **Backend 서버를 그대로 원본 서버로 사용**합니다. 이 서버로 이미지를 만들고, 같은 Backend를 자동 생성할 수 있는 Auto Scaling Group을 구성합니다.

    이 페이지에서는 **내 서버 이미지, Launch Configuration, Auto Scaling Group, Scaling Policy**만 다룹니다. DB 이전, Target Group, Load Balancer, Web 서버 변경, Cloud Insight, 부하 테스트는 포함하지 않습니다.

- [003 Three Tier Web App 교재](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/003-three-tier-web-app/)
- [GitHub 013 실습 폴더](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/tree/main/013-auto%20scaling)

## 1. 먼저 이해할 구조

```text
003 기존 Backend 서버
        |
        | 현재 디스크 상태를 이미지로 저장
        v
내 서버 이미지
        |
        | 서버 사양과 인증키를 결합
        v
Launch Configuration
        |
        | 최소/최대/기대 용량과 정책 적용
        v
Auto Scaling Group
        |
        +-- Backend 인스턴스 1
        +-- Backend 인스턴스 2  <- Scale-out 시 생성
        +-- Backend 인스턴스 3  <- 최대 3대
```

!!! warning "기존 서버가 ASG에 들어가는 것은 아닙니다"
    003번의 기존 Backend 서버는 **이미지를 만드는 원본**입니다. Auto Scaling Group은 그 이미지를 사용해 새로운 Backend 서버를 생성합니다. 기존 서버가 자동으로 Auto Scaling Group에 편입되지는 않습니다.

Naver Cloud 콘솔의 공식 명칭은 **Launch Configuration**입니다. 이 교재에서 말하는 실행 구성 또는 사용자가 흔히 부르는 런치 템플릿은 모두 이 메뉴를 뜻합니다.

## 2. 완료 기준

아래 항목을 모두 확인하면 실습이 끝납니다.

- [ ] 기존 Backend의 `chapter3-backend` 서비스가 `enabled`, `active` 상태입니다.
- [ ] 기존 Backend의 `/api/health`가 HTTP `200`을 반환합니다.
- [ ] 내 서버 이미지 상태가 `생성됨`입니다.
- [ ] 생성한 이미지로 Launch Configuration을 만들었습니다.
- [ ] Auto Scaling Group의 서버 수가 최초 `1`대입니다.
- [ ] Scale-out 정책을 실행해 서버 수가 `2`대로 증가합니다.
- [ ] Scale-in 정책을 실행해 서버 수가 `1`대로 감소합니다.
- [ ] Auto Scaling 실행 이력에서 각 작업의 성공을 확인합니다.

## 3. Step 0 - 기존 003 리소스 확인

003번 실습에서 만든 다음 리소스를 그대로 사용합니다. 새 VPC나 새 Backend 서버를 만들지 않습니다.

| 확인할 값 | 사용할 값 |
| --- | --- |
| 원본 서버 | 003번 Backend 서버 |
| VPC | 원본 Backend가 속한 VPC |
| Subnet | 원본 Backend가 속한 Private Subnet |
| ACG | 원본 Backend에 적용한 ACG |
| 인증키 | 원본 서버를 만들 때 사용한 인증키 또는 수업용 인증키 |
| Backend 포트 | `4000` |
| systemd 서비스 | `chapter3-backend` |

콘솔에서 **Services > Compute > Server > Server**로 이동해 기존 Backend 서버를 선택합니다. 서버 상세 정보에서 VPC, Subnet, ACG를 메모해 둡니다. 이후 Auto Scaling Group에도 같은 네트워크를 선택합니다.

!!! note "현재 게시판 연결은 그대로 유지됩니다"
    이 실습에는 Load Balancer 구성이 없습니다. 따라서 003 Web 서버는 계속 기존 Backend를 사용합니다. Auto Scaling으로 만들어진 서버는 Backend 서비스가 정상 기동되는지와 서버 수가 증감하는지만 확인합니다.

## 4. Step 1 - 이미지 생성 전 Backend 점검

기존 Backend 서버에 SSH로 접속합니다. 아래 명령은 이미지에 들어갈 서비스가 재부팅 후에도 자동 실행되는지 확인합니다.

```bash
systemctl is-enabled chapter3-backend
systemctl is-active chapter3-backend
sudo ss -lntp | grep ':4000'
curl -i http://127.0.0.1:4000/api/health
```

각 출력에서 다음 내용을 확인합니다.

| 명령 | 정상 결과 | 의미 |
| --- | --- | --- |
| `systemctl is-enabled` | `enabled` | 이미지로 생성된 새 서버에서도 부팅 시 자동 시작 |
| `systemctl is-active` | `active` | 현재 Backend 프로세스가 실행 중 |
| `ss -lntp` | `:4000`과 `LISTEN` | Node.js가 Backend 포트에서 요청 대기 |
| `curl -i` | `HTTP/1.1 200 OK` | Backend Health API 정상 |

하나라도 정상 결과가 아니면 이미지를 만들지 말고 먼저 서비스를 복구합니다.

```bash
sudo systemctl enable --now chapter3-backend
sudo journalctl -u chapter3-backend -n 50 --no-pager
```

첫 번째 명령은 서비스를 자동 시작 상태로 바꾸고 즉시 실행합니다. 두 번째 명령은 최근 로그 50줄을 출력하므로 DB 접속 실패, 환경 변수 오류, 포트 충돌을 확인할 수 있습니다. 복구 후 앞의 네 가지 점검 명령을 다시 실행합니다.

환경 파일이 설치 경로에 있는지도 확인합니다. 비밀번호 값은 화면에 출력하지 않습니다.

```bash
sudo test -f /opt/chapter3-backend/.env && echo '.env exists'
sudo grep -E '^(PORT|DB_HOST|DB_PORT|DB_NAME|DB_USER|AUTO_POST_ENABLED)=' /opt/chapter3-backend/.env
```

`PORT=4000`, 올바른 DB 주소와 DB 이름, `AUTO_POST_ENABLED=false`를 확인합니다.

!!! warning "실습 이미지와 비밀번호"
    기존 Backend의 `.env`도 서버 이미지에 포함됩니다. 수업에서는 동일 설정을 복제하기 위해 그대로 사용하지만, 운영 환경에서는 비밀번호를 이미지에 저장하지 말고 Secret Manager나 별도의 초기화 절차로 주입해야 합니다.

## 5. Step 2 - Backend 내 서버 이미지 생성

1. Naver Cloud 콘솔에서 **Services > Compute > Server > Server**로 이동합니다.
2. 003번의 기존 Backend 서버를 선택합니다.
3. **서버 관리 및 설정 변경 > 내 서버 이미지 생성**을 클릭합니다.
4. 아래 값을 입력하고 생성합니다.

| 항목 | 입력값 | 설명 |
| --- | --- | --- |
| 이미지 이름 | `lab-backend-image-v1` | 영문자로 시작하고 영문 소문자, 숫자, 하이픈 사용 |
| 이미지 설명 | `003 backend image for auto scaling` | 이미지의 원본과 목적 기록 |

원본 서버는 실행 중이어도 이미지를 만들 수 있습니다. 생성 중에는 원본 서버 상태가 일시적으로 `복제 중`으로 표시될 수 있으므로 다른 서버 작업을 하지 않고 완료될 때까지 기다립니다.

**Services > Compute > Server > Server Image**에서 이미지 상태가 `생성 중`에서 `생성됨`으로 바뀌는지 확인합니다. 상태가 `생성됨`이 되기 전에는 다음 단계로 넘어가지 않습니다.

확인할 것:

- 이미지 이름이 `lab-backend-image-v1`입니다.
- 원본 서버가 003 Backend입니다.
- 이미지 상태가 `생성됨`입니다.
- 원본 Backend 서버가 다시 `운영 중`입니다.

## 6. Step 3 - Launch Configuration 생성

1. **Services > Compute > Auto Scaling > Launch Configuration**으로 이동합니다.
2. **Launch Configuration 생성**을 클릭합니다.
3. 이미지 선택 화면에서 **내 서버 이미지**를 선택합니다.
4. `lab-backend-image-v1`을 선택합니다.
5. 아래 기준으로 서버 설정을 완료합니다.

| 항목 | 권장값 | 이유 |
| --- | --- | --- |
| 서버 이미지 | `lab-backend-image-v1` | 점검을 마친 003 Backend 복제 |
| 서버 세대와 타입 | 원본 Backend와 같거나 수업용 최소 사양 | 이미지와 동일한 앱 실행 |
| 스토리지 | 기본값 | 별도 데이터 디스크가 없는 Backend 기준 |
| Init Script | 사용 안 함 | 앱이 이미지에 이미 설치되어 있으므로 중복 설치 방지 |
| Launch Configuration 이름 | `lab-backend-lc-v1` | 이미지 버전과 맞춰 관리 |
| 인증키 | 기존 수업용 인증키 | 생성된 서버에 접속할 때 사용 |

마지막 확인 화면에서 이미지, 서버 사양, 인증키를 다시 확인한 뒤 생성합니다.

!!! tip "Init Script를 넣지 않는 이유"
    003 Backend의 코드, Node.js 패키지, `.env`, systemd 서비스가 모두 이미지에 들어 있습니다. 같은 설치 스크립트를 Init Script로 다시 실행하면 설정을 덮어쓰거나 설치가 중복될 수 있으므로 이 실습에서는 비워 둡니다.

Launch Configuration 목록에서 `lab-backend-lc-v1`이 보이면 다음 단계로 이동합니다.

## 7. Step 4 - Auto Scaling Group 생성

1. **Services > Compute > Auto Scaling > Auto Scaling Group**으로 이동합니다.
2. **Auto Scaling Group 생성**을 클릭합니다.
3. Launch Configuration에서 `lab-backend-lc-v1`을 선택합니다.
4. 그룹 설정에 아래 값을 입력합니다.

| 항목 | 입력값 | 설명 |
| --- | --- | --- |
| Auto Scaling Group 이름 | `lab-backend-asg` | Backend 그룹 식별 |
| VPC | 003 Backend와 같은 VPC | 기존 DB와 내부 통신 |
| Subnet | 003 Backend와 같은 Private Subnet | 기존 Backend 네트워크 재사용 |
| 서버 이름 Prefix | `lab-backend-as` | 생성 서버 이름 구분 |
| 최소 용량 | `1` | 적어도 Backend 1대 유지 |
| 최대 용량 | `3` | 수업 중 최대 3대로 제한 |
| 기대 용량 | `1` | 생성 직후 서버 1대 시작 |
| 상세 모니터링 | 사용 안 함 | 이번 실습은 Cloud Insight를 사용하지 않음 |
| Cooldown 기본값 | `300`초 | 연속 증감 작업 사이 대기 |
| Health Check 보류 기간 | `300`초 | 부팅과 앱 시작 시간 허용 |
| Health Check 유형 | `Server` | 이번 실습에는 Load Balancer가 없음 |

5. 네트워크 접근 설정에서 **003 Backend가 사용하던 ACG**를 선택합니다.
6. 정책과 일정 화면에서는 우선 아무것도 추가하지 않고 다음으로 이동합니다.
7. 통보 설정은 선택 사항이므로 수업에서는 건너뜁니다.
8. 최종 설정을 확인하고 Auto Scaling Group을 생성합니다.

!!! warning "반드시 기존 Backend와 같은 네트워크를 선택합니다"
    다른 VPC나 DB에 접근할 수 없는 Subnet을 선택하면 서버는 생성되어도 Backend가 DB에 연결되지 못합니다. ACG도 새로 만들지 않고 003 Backend의 ACG를 그대로 선택합니다.

생성 직후 다음 순서로 확인합니다.

1. Auto Scaling Group 목록에서 기대 용량이 `1`인지 확인합니다.
2. 그룹 상세의 서버 목록에서 새 서버가 생성되는지 확인합니다.
3. **Services > Compute > Server > Server**에서 `lab-backend-as`로 시작하는 서버를 찾습니다.
4. 새 서버 상태가 `생성 중`에서 `운영 중`으로 바뀔 때까지 기다립니다.
5. Auto Scaling Group을 선택하고 **이력** 버튼을 눌러 서버 생성 작업이 성공했는지 확인합니다.

## 8. Step 5 - Scaling Policy 생성

Auto Scaling Group의 서버를 한 대 늘리는 정책과 한 대 줄이는 정책을 각각 만듭니다.

### 8.1 Scale-out 정책

1. Auto Scaling Group 목록에서 `lab-backend-asg`를 선택합니다.
2. **설정 > 정책**으로 이동합니다.
3. **생성**을 클릭합니다.
4. 아래 값을 입력합니다.

| 항목 | 입력값 |
| --- | --- |
| 정책 이름 | `backend-add-1` |
| 조정 유형 | 증감 변경 |
| 조정값 | `1` 증가 |
| Cooldown | `300`초 |

### 8.2 Scale-in 정책

같은 화면에서 두 번째 정책을 추가합니다.

| 항목 | 입력값 |
| --- | --- |
| 정책 이름 | `backend-remove-1` |
| 조정 유형 | 증감 변경 |
| 조정값 | `1` 감소 |
| Cooldown | `300`초 |

`증감 변경`은 현재 서버 수를 기준으로 지정한 수만큼 더하거나 뺍니다. `backend-add-1`을 실행하면 `1대 → 2대`, `backend-remove-1`을 실행하면 `2대 → 1대`가 됩니다. 최대 용량 `3`보다 늘어나거나 최소 용량 `1`보다 줄어들지는 않습니다.

!!! note "정책만 만들면 CPU에 따라 자동 실행되지는 않습니다"
    Scaling Policy는 **서버 수를 어떻게 변경할지** 정의합니다. CPU 임계값으로 자동 실행하려면 Cloud Insight Event Rule 연결이 추가로 필요합니다. 이번 축소 실습에서는 정책을 콘솔에서 직접 실행해 이미지와 Auto Scaling 동작만 검증합니다.

## 9. Step 6 - Scale-out 직접 실행

1. `lab-backend-asg`의 **설정 > 정책**에서 `backend-add-1`을 선택합니다.
2. **실행**을 클릭하고 확인합니다.
3. **서버 목록**과 **이력**을 새로 고침합니다.
4. 서버 수가 `1`대에서 `2`대로 바뀌는지 확인합니다.
5. 새 서버가 `운영 중`이 되고 실행 이력이 성공할 때까지 기다립니다.

Cooldown 동안 같은 정책을 다시 눌러도 즉시 추가 실행되지 않을 수 있습니다. 오류가 아니라 연속 확장을 막기 위한 동작이므로 300초가 지난 뒤 다시 시도합니다.

눈으로 확인할 것:

- 기대 용량과 현재 서버 수가 `2`입니다.
- 두 서버 이름이 모두 `lab-backend-as` Prefix로 시작합니다.
- 두 서버가 같은 이미지와 Launch Configuration에서 생성되었습니다.
- 실행 이력에 서버 생성 성공 기록이 있습니다.

## 10. Step 7 - 새 Backend 서비스 확인

이 단계는 서버 생성뿐 아니라 이미지 안의 Backend 서비스가 정상 기동했는지 확인합니다. 먼저 콘솔의 Server 목록에서 새 서버를 선택한 뒤 **서버 관리 및 설정 변경 > 관리자 비밀번호 확인**으로 이동합니다. Launch Configuration에서 선택한 인증키의 `.pem` 파일을 등록해 관리자 비밀번호를 확인합니다.

그다음 기존 Backend 또는 Bastion에서 새 서버의 Private IP로 접속합니다.

```bash
ssh root@NEW_BACKEND_PRIVATE_IP
hostname
systemctl is-enabled chapter3-backend
systemctl is-active chapter3-backend
sudo ss -lntp | grep ':4000'
curl -i http://127.0.0.1:4000/api/health
```

`NEW_BACKEND_PRIVATE_IP`는 콘솔의 새 서버 상세 정보에 표시된 Private IP로 바꿉니다. 예를 들어 IP가 `10.0.2.15`라면 `ssh root@10.0.2.15`로 입력합니다.

정상 결과:

- `hostname`은 새로 생성된 서버 이름을 출력합니다.
- 서비스 상태는 `enabled`, `active`입니다.
- `:4000` 포트가 `LISTEN` 상태입니다.
- Health API는 `HTTP/1.1 200 OK`를 반환합니다.

SSH 연결은 안 되지만 서버가 `운영 중`이라면 ACG의 `22/tcp`, 접속 경로, 인증키를 먼저 확인합니다. 서비스가 `failed`라면 다음 명령으로 원인을 확인합니다.

```bash
sudo journalctl -u chapter3-backend -n 100 --no-pager
sudo grep -E '^(PORT|DB_HOST|DB_PORT|DB_NAME|DB_USER)=' /opt/chapter3-backend/.env
```

DB 접속 오류가 보이면 원본 Backend와 같은 VPC, Subnet, ACG를 선택했는지 확인합니다.

## 11. Step 8 - Scale-in 직접 실행

1. Auto Scaling Group의 **설정 > 정책**에서 `backend-remove-1`을 선택합니다.
2. **실행**을 클릭하고 확인합니다.
3. 서버 수가 `2`대에서 `1`대로 줄어들 때까지 기다립니다.
4. 실행 이력에서 서버 반납 작업이 성공했는지 확인합니다.

최소 용량을 `1`로 설정했으므로 정책을 다시 실행해도 `0`대로 줄어들지 않습니다. 이것이 최소 용량이 서비스를 보호하는 방식입니다.

## 12. 최종 확인표

| 확인 위치 | 확인할 결과 |
| --- | --- |
| Server Image | `lab-backend-image-v1`, 상태 `생성됨` |
| Launch Configuration | `lab-backend-lc-v1` |
| Auto Scaling Group | `lab-backend-asg` |
| 용량 설정 | 최소 `1`, 최대 `3`, 기대 `1` |
| Health Check | `Server`, 보류 기간 `300`초 |
| Scale-out 정책 | `backend-add-1`, 1 증가 |
| Scale-in 정책 | `backend-remove-1`, 1 감소 |
| Scale-out 결과 | Backend 서버 `1대 → 2대` |
| Scale-in 결과 | Backend 서버 `2대 → 1대` |
| 새 서버 내부 | 서비스 `enabled`, `active`, Health `200` |

## 13. Backend 코드 변경 후 이미지 갱신

서버 이미지는 생성 시점의 복사본입니다. 이후 003 Backend 코드를 수정해도 기존 이미지와 Launch Configuration은 자동으로 바뀌지 않습니다.

업데이트할 때는 다음 순서를 사용합니다.

1. 기존 003 Backend 서버의 코드와 설정을 수정합니다.
2. 서비스와 `/api/health`를 다시 점검합니다.
3. `lab-backend-image-v2` 이미지를 새로 만듭니다.
4. 새 이미지로 `lab-backend-lc-v2`를 만듭니다.
5. Auto Scaling Group의 Launch Configuration을 새 버전으로 변경합니다.
6. 이후 새로 확장되는 서버가 v2 이미지로 생성되는지 확인합니다.

이미 실행 중인 인스턴스는 Launch Configuration을 바꿨다고 자동 교체되지 않습니다. 수업에서는 최소 용량을 지키면서 기존 인스턴스를 순차적으로 줄이고 다시 늘려 새 버전으로 교체합니다.

## 14. 실습 종료와 비용 정리

계속 사용할 필요가 없다면 비용이 발생하는 리소스를 정리합니다.

1. Auto Scaling Group의 최소 용량과 기대 용량을 `0`으로 변경합니다.
2. 생성된 Backend 서버가 모두 반납될 때까지 기다립니다.
3. Auto Scaling Group을 삭제합니다.
4. Launch Configuration을 삭제합니다.
5. 더 이상 필요 없는 내 서버 이미지를 삭제합니다.

3세대 서버는 내 서버 이미지를 삭제해도 이미지 생성 시 함께 만들어진 Snapshot이 남습니다. **Services > Compute > Server > Snapshot**에서 사용하지 않는 Snapshot도 별도로 삭제합니다.

원본 003 Backend 서버는 다음 실습에서도 사용할 수 있으므로 삭제하지 않습니다.

## 15. 공식 문서

- [Auto Scaling 시작 절차](https://guide.ncloud-docs.com/docs/autoscaling-procedure)
- [내 서버 이미지 생성 및 관리](https://guide.ncloud-docs.com/docs/server-serverimage-vpc)
- [Launch Configuration 생성](https://guide.ncloud-docs.com/docs/autoscaling-lc-vpc)
- [Auto Scaling Group 생성과 정책 실행](https://guide.ncloud-docs.com/docs/autoscaling-asg-vpc)
