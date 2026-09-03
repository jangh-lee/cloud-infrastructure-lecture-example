# 013 Auto Scaling Hands-on (1)

!!! info "이번 실습 범위"
    012에서 사용한 **Nginx Target 서버로 내 서버 이미지를 생성**하고, 기존 Load Balancer와 Target Group을 그대로 사용합니다. 이어서 Launch Configuration, Auto Scaling Group, Scaling Policy, Cloud Insight Event Rule을 만듭니다.

- [012 Load Balancer 선행 실습](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/012-load-balancer/)
- [GitHub 013 실습 폴더](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/tree/main/013-auto%20scaling)

## 1. 완성 구조

```text
사용자 또는 Bastion
        |
        v
012 Load Balancer :80                 그대로 사용
        |
        v
012 Target Group :80, /healthz        그대로 사용
        |
        v
Auto Scaling Nginx 서버 1~3대         새로 구성
  |-- /status.json: Hostname, Private IP
  |-- stress-ng: CPU 부하 발생
  +-- htop: CPU와 프로세스 확인
```

012에서 수동으로 만든 서버 여러 대를 Auto Scaling으로 관리되는 서버 1~3대로 교체합니다. 웹 페이지와 `/status.json`은 그대로이므로 **서버 수만 자동으로 바뀌는 과정**에 집중할 수 있습니다.

## 2. 실습 전 준비

012를 끝낸 상태에서 다음 리소스를 기록합니다.

| 값 | 예시 | 용도 |
| --- | --- | --- |
| 이미지 원본 서버 | 012 Target 서버 한 대 | Step 1에서 내 서버 이미지 생성 |
| Load Balancer | 012에서 만든 LB | 외부 진입점 |
| LB URL | `http://...kr.lb.naverncp.com` | 반복 호출 |
| Target Group | 012에서 만든 TG | ASG 연결과 Health Check |
| VPC / 서버 Subnet | 012 서버와 같은 환경 | ASG 서버 배치 |
| Web ACG | 012 서버에 적용한 ACG | HTTP와 SSH 허용 |
| Bastion | Private IP로 SSH 가능한 서버 | 부하 명령 실행 |
| 인증키 | 서버 생성에 사용한 키 | 관리자 비밀번호 확인 |

!!! warning "012 리소스를 삭제하지 않습니다"
    Load Balancer와 Target Group은 013에서도 사용합니다. 012 수동 서버도 새 ASG Target이 Healthy가 될 때까지 유지합니다.

## 3. Step 1 - 기존 Target 서버 이미지 생성

1. **Services > Compute > Server > Server**로 이동합니다.
2. 012 Load Balancer의 Target으로 사용한 서버 한 대를 선택합니다.
3. **서버 관리 및 설정 변경 > 내 서버 이미지 생성**을 클릭합니다.

| 항목 | 값 |
| --- | --- |
| 이미지 이름 | `lab-asg-web-image-v1` |
| 설명 | `012 load balancer target for auto scaling` |

**Services > Compute > Server > Server Image**에서 `lab-asg-web-image-v1`의 상태가 `생성됨`이 될 때까지 기다립니다.

012 통합 Init Script로 설치한 Nginx, 상태 페이지, `stress-ng`, `htop`, 상태 갱신 timer가 이미지에 포함됩니다. Auto Scaling 서버가 부팅되면 timer가 `/status.json`을 자신의 Hostname과 Private IP로 다시 기록합니다.

### 확인하고 넘어가기

- [ ] 이미지 원본이 012 Load Balancer의 기존 Target 서버입니다.
- [ ] 이미지 이름이 `lab-asg-web-image-v1`입니다.
- [ ] Server Image 상태가 `생성됨`입니다.

## 4. Step 2 - Launch Configuration 생성

1. **Services > Compute > Auto Scaling > Launch Configuration**으로 이동합니다.
2. **Launch Configuration 생성**을 클릭합니다.
3. **내 서버 이미지**에서 `lab-asg-web-image-v1`을 선택합니다.

| 항목 | 값 |
| --- | --- |
| 이름 | `lab-asg-web-lc-v1` |
| 서버 이미지 | `lab-asg-web-image-v1` |
| 서버 사양 | 012 원본과 같거나 수업용 최소 사양 |
| 인증키 | 수업용 인증키 |
| Init Script | 사용 안 함 |

이미지 안에 Nginx, `stress-ng`, `htop`, 상태 갱신 timer가 이미 들어 있으므로 Init Script는 비워 둡니다.

### 확인하고 넘어가기

- [ ] Launch Configuration 이미지가 `lab-asg-web-image-v1`입니다.
- [ ] Init Script를 중복 입력하지 않았습니다.
- [ ] 이름이 `lab-asg-web-lc-v1`로 목록에 표시됩니다.

## 5. Step 3 - Auto Scaling Group 생성

1. **Services > Compute > Auto Scaling > Auto Scaling Group**으로 이동합니다.
2. **Auto Scaling Group 생성**을 클릭합니다.
3. `lab-asg-web-lc-v1`을 선택합니다.

| 항목 | 값 |
| --- | --- |
| 이름 | `lab-asg-web-group` |
| VPC | 012와 같은 VPC |
| Subnet | 012 웹 서버와 같은 Private Subnet |
| 서버 이름 Prefix | `lab-asg-web` |
| 최소 용량 | `1` |
| 최대 용량 | `3` |
| 기대 용량 | `1` |
| 상세 모니터링 | 사용 |
| Cooldown 기본값 | `60`초 |
| Health Check 보류 기간 | `60`초 |
| Health Check 유형 | Load Balancer |
| Target Group | 012 Target Group |
| ACG | 012 Web ACG |

정책, 일정, 통보는 우선 **나중에 설정**으로 두고 생성합니다.

!!! note "1분 설정의 의미"
    수업에서 빠르게 변화를 보기 위한 값입니다. 서버 생성, 부팅, Health Check에는 추가 시간이 걸리므로 전체 Scale-out이 정확히 1분 안에 끝난다는 뜻은 아닙니다. 새 서버가 부팅 전에 반복 반납되면 Health Check 보류 기간을 `300`초로 늘립니다.

### ACG 확인

| 프로토콜 | 포트 | 접근 소스 | 목적 |
| --- | --- | --- | --- |
| TCP | `80` | Load Balancer Subnet CIDR | 서비스 요청과 Health Check |
| TCP | `22` | Bastion ACG 또는 Bastion Private IP | 부하와 상태 확인 |

### 확인하고 넘어가기

다음 순서로 상태를 확인합니다.

1. 이름이 `lab-asg-web...`인 서버 한 대가 생성됩니다.
2. 012 Target Group에 새 서버가 자동 등록됩니다.
3. `/healthz` 검사 후 새 Target 상태가 `Healthy`가 됩니다.
4. Load Balancer URL의 `/status.json`이 정상 응답합니다.

```bash
LB_URL="http://YOUR_LOAD_BALANCER_URL"
curl -i "$LB_URL/healthz"
curl -sS "$LB_URL/status.json"
```

## 6. Step 4 - 수동 Target을 ASG Target으로 교체

ASG 서버가 `Healthy`가 된 뒤에만 012에서 수동 등록한 서버들을 Target Group에서 제거합니다. 서버 자체를 바로 삭제할 필요는 없으며 Target 목록에서만 제거해도 됩니다.

교체 후 Target Group에는 다음 서버만 남아야 합니다.

```text
lab-asg-web...    Healthy
```

Load Balancer를 20번 호출해 ASG 서버 한 대만 응답하는지 확인합니다.

```bash
for i in $(seq 1 20); do
  curl -fsS "$LB_URL/status.json" |
    sed -n 's/.*"hostname"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
done | sort | uniq -c
```

정상 예시는 다음과 같습니다.

```text
20 lab-asg-web-xxxxx
```

기존 012 Hostname이 섞여 나오면 수동 Target이 아직 Target Group에 남아 있는지 확인합니다.

## 7. Step 5 - Scaling Policy 생성

`lab-asg-web-group`을 선택하고 **설정 > 정책 > 생성**에서 두 정책을 만듭니다.

### Scale-out 정책

| 항목 | 값 |
| --- | --- |
| 정책 이름 | `lab-asg-web-add-1` |
| Scaling 설정 | 증감 변경 |
| 조정값 | `1` 증가 |
| Cooldown | `60`초 |

### Scale-in 정책

| 항목 | 값 |
| --- | --- |
| 정책 이름 | `lab-asg-web-remove-1` |
| Scaling 설정 | 증감 변경 |
| 조정값 | `1` 감소 |
| Cooldown | `60`초 |

최대 용량 3보다 늘어나거나 최소 용량 1보다 줄어들지 않습니다.

## 8. Step 6 - Cloud Insight Event Rule 연결

Scaling Policy는 실행 동작만 정의합니다. CPU 조건으로 자동 실행하려면 **Services > Management & Governance > Cloud Insight > Configuration > Event Rule**에서 두 규칙을 연결합니다.

### Scale-out Event Rule

| 항목 | 값 |
| --- | --- |
| 상품 | Server (VPC) |
| 감시 대상 | Auto Scaling Group `lab-asg-web-group` |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `>= 50` |
| 집약 | AVG |
| 지속 시간 | `1 minute` |
| 액션 | Auto Scaling Policy `lab-asg-web-add-1` |

### Scale-in Event Rule

| 항목 | 값 |
| --- | --- |
| 상품 | Server (VPC) |
| 감시 대상 | Auto Scaling Group `lab-asg-web-group` |
| Metric | `SERVER/avg_cpu_used_rto` |
| 조건 | `< 20` |
| 집약 | AVG |
| 지속 시간 | `1 minute` |
| 액션 | Auto Scaling Policy `lab-asg-web-remove-1` |

Scale-out을 관찰하기 전에는 Scale-in Rule을 비활성화해도 됩니다. 새 서버가 생기자마자 평균 CPU가 낮아져 축소되는 상황을 막아 변화 과정을 천천히 확인할 수 있습니다.

### 확인하고 넘어가기

- [ ] 감시 대상이 개별 서버가 아니라 `lab-asg-web-group`입니다.
- [ ] Scale-out Rule 액션이 `lab-asg-web-add-1`입니다.
- [ ] 조건 지속 시간이 `1 minute`입니다.

## 9. Step 7 - Bastion에서 CPU 부하 발생

ASG의 서버 목록에서 현재 서버 Private IP를 확인합니다. 다음 명령은 **Bastion에서** 실행하고 CPU 부하는 원격 ASG 서버에 발생합니다.

```bash
WEB_PRIVATE_IP="ASG_SERVER_PRIVATE_IP"

ssh root@"$WEB_PRIVATE_IP" 'hostname; stress-ng --version; htop --version'
ssh root@"$WEB_PRIVATE_IP" \
  'nohup stress-ng --cpu 0 --cpu-load 90 --timeout 180s >/tmp/asg-web-stress.log 2>&1 &'
ssh root@"$WEB_PRIVATE_IP" 'pgrep -af stress-ng; uptime'
```

별도 Bastion 터미널에서 CPU를 눈으로 확인할 수 있습니다.

```bash
ssh -t root@"$WEB_PRIVATE_IP" htop
```

`htop`에서 `1`은 CPU 코어별 표시, `P`는 CPU 사용률 순 정렬, `q`는 종료입니다. `htop`은 현재 접속한 서버 한 대만 보여줍니다.

!!! note "왜 HTTP 요청 대신 stress-ng를 사용하나요?"
    정적 파일을 제공하는 Nginx는 가벼워서 많은 HTTP 요청에도 CPU 50%를 안정적으로 넘지 않을 수 있습니다. `stress-ng`는 선택한 ASG 서버의 CPU를 확실하게 올려 정책 동작 자체를 검증합니다. 여러 서버에 동시에 실행되는 명령은 아니며, 위 SSH 대상 한 대에만 부하가 걸립니다.

## 10. Step 8 - Scale-out 관찰

다음 화면을 순서대로 확인합니다.

| 순서 | 화면 | 확인할 변화 |
| --- | --- | --- |
| 1 | Cloud Insight | ASG 평균 CPU 50% 이상 |
| 2 | Event Rule | Scale-out Event 발생 |
| 3 | ASG 이력 | `lab-asg-web-add-1` 실행 |
| 4 | Server | 새 `lab-asg-web...` 서버 생성 |
| 5 | Target Group | 새 Target이 `Healthy` |
| 6 | ASG | 서버 수 `1 → 2` |

새 서버가 `Healthy`가 된 뒤 Load Balancer를 40번 호출합니다.

### Linux 또는 macOS

```bash
for i in $(seq 1 40); do
  curl -fsS "$LB_URL/status.json" |
    sed -n 's/.*"hostname"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
done | sort | uniq -c
```

### Windows Terminal PowerShell

```powershell
$LB_URL = "http://YOUR_LOAD_BALANCER_URL"

1..40 | ForEach-Object {
  (Invoke-RestMethod -Uri "$LB_URL/status.json").hostname
} | Group-Object | Sort-Object Count -Descending | Select-Object Count, Name
```

서로 다른 ASG Hostname이 보이고 합계가 40이면 성공입니다. 정확히 20회씩 나뉠 필요는 없습니다.

```text
Count Name
----- ----
   22 lab-asg-web-aaaaa
   18 lab-asg-web-bbbbb
```

페이지를 새로고침하면서 Hostname과 Private IP가 바뀌는지도 확인합니다. 같은 원본 이미지로 만들어졌지만 `lb-demo-status.timer`가 각 서버의 실제 값을 다시 기록합니다.

## 11. Step 9 - 부하 종료와 Scale-in 확인

3분이 지나면 `stress-ng`가 자동 종료됩니다. 즉시 중지하려면 Bastion에서 실행합니다.

```bash
ssh root@"$WEB_PRIVATE_IP" 'pkill -f stress-ng || true'
```

Scale-in Rule을 활성화하고 다음 순서로 확인합니다.

1. ASG 평균 CPU가 20% 미만으로 내려갑니다.
2. Scale-in Event가 발생합니다.
3. `lab-asg-web-remove-1` 정책이 실행됩니다.
4. ASG 서버 수가 `2 → 1`이 됩니다.
5. 종료된 서버가 Target Group에서 자동 제거됩니다.
6. Load Balancer URL은 계속 HTTP `200`을 반환합니다.

## 12. 최종 확인표

| 확인 위치 | 완료 조건 |
| --- | --- |
| Server Image | 012 Target 서버에서 `lab-asg-web-image-v1` 생성 |
| Launch Configuration | 별도 Init Script 없음 |
| Auto Scaling Group | 최소 1, 최대 3, 기대 1 |
| Target Group | ASG 서버 자동 등록, `/healthz` Healthy |
| Scale-out | CPU 50% 이상 1분 후 `1 → 2` |
| 분산 | `/status.json`에서 서로 다른 Hostname |
| Scale-in | CPU 20% 미만 1분 후 `2 → 1` |
| 서비스 연속성 | 증감 중에도 LB HTTP `200` |

## 13. 자주 막히는 지점

| 증상 | 확인할 항목 |
| --- | --- |
| 새 Target이 Unhealthy | Web ACG의 LB Subnet CIDR `80/tcp`, `/healthz`, Nginx 상태 |
| 새 서버가 원본 Hostname 표시 | 15초 뒤 재조회, `systemctl status lb-demo-status.timer` |
| CPU가 올라도 확장 안 됨 | 상세 모니터링, Event 대상 ASG, Metric, Policy 액션 |
| 서버가 너무 빨리 축소됨 | Scale-in Rule을 잠시 비활성화 |
| 부팅 중 서버가 반납됨 | Health Check 보류 기간을 `300`초로 변경 |
| 기존 서버 응답이 섞임 | 012 수동 Target을 Target Group에서 제거 |

## 14. 실습 종료와 비용 정리

1. ASG 최소 용량과 기대 용량을 `0`으로 변경합니다.
2. ASG 서버가 모두 반납되면 Auto Scaling Group을 삭제합니다.
3. Launch Configuration을 삭제합니다.
4. 다음 실습이 없다면 Load Balancer와 Target Group을 삭제합니다.
5. 내 서버 이미지와 연결 Snapshot을 삭제합니다.

014 게시판 Auto Scaling 심화 실습을 이어서 진행한다면 003의 Web, Backend, DB 리소스는 유지합니다.

## 15. 다음 실습

[014 Auto Scaling Hands-on (2)](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/014-auto-scaling/)에서는 003 게시판의 Web 계층을 Public ALB 뒤에서 Auto Scaling합니다. 이번 013과 달리 고정 Backend·DB 연결과 게시글 데이터 유지까지 함께 확인합니다.

## 16. 공식 문서

- [Auto Scaling 시작 절차](https://guide.ncloud-docs.com/docs/autoscaling-procedure)
- [Launch Configuration](https://guide.ncloud-docs.com/docs/autoscaling-lc-vpc)
- [Auto Scaling Group](https://guide.ncloud-docs.com/docs/autoscaling-asg-vpc)
- [Cloud Insight Event Rule](https://guide.ncloud-docs.com/docs/cloudinsight-use-eventrule)
- [Target Group](https://guide.ncloud-docs.com/docs/loadbalancer-targetgroup-vpc)
