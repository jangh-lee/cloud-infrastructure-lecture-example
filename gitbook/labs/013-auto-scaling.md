# 013 Auto Scaling Hands-on (1)

!!! info "이번 실습 범위"
    012에서 사용한 **Nginx Target 서버로 내 서버 이미지를 생성**하고, 기존 Load Balancer와 Target Group을 그대로 사용합니다. 이어서 Launch Configuration, Auto Scaling Group, Scaling Policy, Cloud Insight Event Rule을 만듭니다.

- [012 Load Balancer 선행 실습](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/012-load-balancer/)
- [GitHub 013 실습 폴더](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/tree/main/013-auto%20scaling)

## 1. 완성 구조

```text
사용자 또는 Bastion의 지속적인 HTTP 요청
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
  +-- /stress: 서버당 하나의 제한된 CPU 부하 실행
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
| Web ACG | 012 서버에 적용한 ACG | Load Balancer Subnet의 HTTP 허용 |
| Bastion | Load Balancer URL 호출이 가능한 서버 | `hey` 부하 명령 실행 |
| 인증키 | 서버 생성에 사용한 키 | 관리자 비밀번호 확인 |

!!! warning "012 리소스를 삭제하지 않습니다"
    Load Balancer와 Target Group은 013에서도 사용합니다. 012 수동 서버도 새 ASG Target이 Healthy가 될 때까지 유지합니다.

## 3. Step 1 - 기존 Target 서버 이미지 생성

!!! warning "기존 012 서버를 이미 만들어 둔 경우"
    이미지 생성 전에 [012 통합 Init Script](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/012-load-balancer/#init-script)를 Target 서버에서 한 번 다시 실행합니다. 최신 설치기에 HTTP Stress API가 추가되어 있으므로 예전에 만든 서버를 그대로 이미지로 만들면 `/stress`가 동작하지 않습니다.

1. **Services > Compute > Server > Server**로 이동합니다.
2. 012 Load Balancer의 Target으로 사용한 서버 한 대를 선택합니다.
3. **서버 관리 및 설정 변경 > 내 서버 이미지 생성**을 클릭합니다.

| 항목 | 값 |
| --- | --- |
| 이미지 이름 | `lab-asg-web-image-v1` |
| 설명 | `012 load balancer target for auto scaling` |

**Services > Compute > Server > Server Image**에서 `lab-asg-web-image-v1`의 상태가 `생성됨`이 될 때까지 기다립니다.

012 통합 Init Script로 설치한 Nginx, 상태 페이지, HTTP Stress API, `stress-ng`, `htop`, 상태 갱신 timer가 이미지에 포함됩니다. Auto Scaling 서버가 부팅되면 timer가 `/status.json`을 자신의 Hostname과 Private IP로 다시 기록합니다.

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

이미지 안에 Nginx, HTTP Stress API, `stress-ng`, `htop`, 상태 갱신 timer가 이미 들어 있으므로 Init Script는 비워 둡니다.

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
| 서버 이름 Prefix | `asg` |
| 최소 용량 | `1` |
| 최대 용량 | `3` |
| 기대 용량 | `1` |
| 상세 모니터링 | 사용 |
| Cooldown 기본값 | `60`초 |
| Health Check 보류 기간 | `60`초 |
| Health Check 유형 | Load Balancer |
| Target Group | 012 Target Group |
| ACG | 012 Web ACG |

`서버 이름 Prefix`는 최대 7자까지 입력할 수 있으므로 이 실습에서는 `asg`로 통일합니다.

정책, 일정, 통보는 우선 **나중에 설정**으로 두고 생성합니다.

!!! note "1분 설정의 의미"
    수업에서 빠르게 변화를 보기 위한 값입니다. 서버 생성, 부팅, Health Check에는 추가 시간이 걸리므로 전체 Scale-out이 정확히 1분 안에 끝난다는 뜻은 아닙니다. 새 서버가 부팅 전에 반복 반납되면 Health Check 보류 기간을 `300`초로 늘립니다.

### ACG 확인

| 프로토콜 | 포트 | 접근 소스 | 목적 |
| --- | --- | --- | --- |
| TCP | `80` | Load Balancer Subnet CIDR | 서비스 요청과 Health Check |

부하는 Load Balancer의 HTTP `80`으로 전달하므로 Bastion에서 ASG 서버로 SSH 접속할 필요가 없습니다.

### 확인하고 넘어가기

다음 순서로 상태를 확인합니다.

1. 이름이 `asg...`인 서버 한 대가 생성됩니다.
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
asg...    Healthy
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
20 asg-xxxxx
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
| 조정값 | `1` 반납 |
| Cooldown | `60`초 |

### 쿨다운이란?

쿨다운은 한 번의 Scaling을 수행한 뒤 서버가 준비되는 동안 **다른 알람에 바로 반응하지 않고 기다리는 시간**입니다. 이번 실습에서는 Scale-out과 Scale-in 정책 모두 `60초`로 설정합니다.

예를 들어 Scale-out으로 서버 한 대를 생성한 직후 CPU 알람이 다시 발생하더라도, 쿨다운 60초 동안에는 같은 알람으로 서버를 연속 생성하지 않습니다. 빠른 수업 진행을 위한 값이며 운영 환경에서는 실제 서버 부팅 시간과 애플리케이션 준비 시간을 고려해 더 길게 설정합니다.

Cloud Insight Event가 계속 유지되면 쿨다운이 끝날 때마다 정책이 반복 실행되고, CPU 조건이 해제되어 Event가 종료되면 반복도 멈춥니다.

!!! note "다른 시간 설정과 구분"
    Cloud Insight의 `1 minute`은 CPU 조건이 얼마나 오래 지속되어야 알람을 발생시킬지 정하는 값입니다. Health Check 보류 기간은 새 서버가 부팅되는 동안 Health Check 실패를 정상으로 간주하는 시간입니다. 쿨다운은 Scaling 직후 추가 알람에 반응하지 않는 시간입니다.

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

## 9. Step 7 - Load Balancer로 HTTP 부하 발생

명령은 Bastion에서 실행하지만 ASG 서버에 SSH로 접속하지 않습니다. Bastion에 HTTP 부하 도구 `hey`를 설치합니다.

```bash
sudo apt-get update
sudo apt-get install -y hey
```

실제 Load Balancer 주소를 입력해 한 번 실행합니다.

```bash
LB_URL="http://YOUR_LOAD_BALANCER_URL"
```

먼저 `/stress`가 응답하는지 한 번 확인합니다.

```bash
curl -fsS -H 'X-Lab-Token: asg-lab' "$LB_URL/stress"
```

`status`, 요청을 처리한 `hostname`, `durationSeconds`가 출력되면 아래 명령으로 5분 동안 부하를 발생시킵니다.

```bash
hey -z 5m -c 20 -q 5 -disable-keepalive \
  -H 'X-Lab-Token: asg-lab' \
  "$LB_URL/stress"
```

| 옵션 | 의미 |
| --- | --- |
| `-z 5m` | 5분 후 자동 종료 |
| `-c 20` | 동시 Worker 20개 |
| `-q 5` | Worker당 최대 5 QPS, 전체 약 100 QPS |
| `-disable-keepalive` | 매 요청에 새 연결을 사용해 새 Target에도 트래픽 전달 |

각 `/stress` 요청은 해당 Target 서버에서 최대 하나의 `stress-ng`만 실행합니다. CPU 부하는 20초 뒤 자동 종료되지만 요청이 계속 들어오면 다음 20초 부하가 다시 시작됩니다. 새 ASG 서버가 `Healthy`가 되면 Load Balancer의 새 연결을 받아 그 서버에도 자동으로 CPU 부하가 발생합니다.

!!! warning "실습 비용 제한"
    `/stress` 응답은 1KB보다 작고 부하 명령은 5분 후 종료됩니다. 동시성이나 실행 시간을 임의로 크게 늘리지 말고, 중간에 멈추려면 `Ctrl+C`를 누릅니다. 테스트가 끝나면 ASG가 최소 용량 1대로 돌아오는지 반드시 확인합니다. Load Balancer 처리 트래픽은 별도 과금될 수 있으므로 비용이 0원이라고 보장되지는 않습니다. 자세한 기준은 [Naver Cloud Load Balancer 요금](https://www.ncloud.com/api-cms/service-product/static/loadBalancer)을 확인합니다.

## 10. Step 8 - Scale-out 관찰

다음 화면을 순서대로 확인합니다.

| 순서 | 화면 | 확인할 변화 |
| --- | --- | --- |
| 1 | Cloud Insight | ASG 평균 CPU 50% 이상 |
| 2 | Event Rule | Scale-out Event 발생 |
| 3 | ASG 이력 | `lab-asg-web-add-1` 실행 |
| 4 | Server | 새 `asg...` 서버 생성 |
| 5 | Target Group | 새 Target이 `Healthy` |
| 6 | ASG | 서버 수 `1 → 2 → 3` |

첫 Scale-out 후에도 `hey`를 종료하지 않습니다. 새 서버가 `Healthy`가 되면 `/stress` 요청을 받아 CPU가 올라갑니다. [Cloud Insight Event Rule 가이드](https://guide.ncloud-docs.com/docs/cloudinsight-use-eventrule)에 따라 Event가 유지되는 동안 쿨다운 주기로 정책이 반복 실행되므로 최대 용량 3대까지 확장됩니다. 5분 안에 2대까지만 생성됐다면 첫 명령이 끝난 뒤 같은 명령을 2분 정도 더 실행합니다.

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
   22 asg-aaaaa
   18 asg-bbbbb
```

페이지를 새로고침하면서 Hostname과 Private IP가 바뀌는지도 확인합니다. 같은 원본 이미지로 만들어졌지만 `lb-demo-status.timer`가 각 서버의 실제 값을 다시 기록합니다.

## 11. Step 9 - 부하 종료와 Scale-in 확인

5분이 지나면 `hey`가 자동 종료됩니다. 즉시 중지하려면 실행 중인 Bastion 터미널에서 `Ctrl+C`를 누릅니다. 마지막 HTTP 요청 이후 서버별 `stress-ng`도 최대 20초 안에 자동 종료됩니다.

Scale-in Rule을 활성화하고 다음 순서로 확인합니다.

1. ASG 평균 CPU가 20% 미만으로 내려갑니다.
2. Scale-in Event가 발생합니다.
3. `lab-asg-web-remove-1` 정책이 실행됩니다.
4. 쿨다운과 다음 감지를 거쳐 ASG 서버 수가 `3 → 2 → 1`로 줄어듭니다.
5. 종료된 서버가 Target Group에서 자동 제거됩니다.
6. Load Balancer URL은 계속 HTTP `200`을 반환합니다.

## 12. 최종 확인표

| 확인 위치 | 완료 조건 |
| --- | --- |
| Server Image | 012 Target 서버에서 `lab-asg-web-image-v1` 생성 |
| Launch Configuration | 별도 Init Script 없음 |
| Auto Scaling Group | 최소 1, 최대 3, 기대 1 |
| Target Group | ASG 서버 자동 등록, `/healthz` Healthy |
| Scale-out 부하 | Bastion에서 LB `/stress`를 약 100 QPS로 5분 호출 |
| Scale-out | 새 Target도 부하를 받으며 `1 → 2 → 3` |
| 분산 | `/status.json`에서 서로 다른 Hostname |
| Scale-in | 부하 종료 후 `3 → 2 → 1` |
| 서비스 연속성 | 증감 중에도 LB HTTP `200` |

## 13. 자주 막히는 지점

| 증상 | 확인할 항목 |
| --- | --- |
| 새 Target이 Unhealthy | Web ACG의 LB Subnet CIDR `80/tcp`, `/healthz`, Nginx 상태 |
| 새 서버가 원본 Hostname 표시 | 15초 뒤 재조회, `systemctl status lb-demo-status.timer` |
| CPU가 올라도 확장 안 됨 | 상세 모니터링, Event 대상 ASG, Metric, Policy 액션 |
| `/stress`가 403 | `X-Lab-Token: asg-lab` 헤더 확인 |
| `/stress`가 502 | 012 통합 Init Script 재실행 후 새 이미지 생성 |
| 새 서버 CPU가 오르지 않음 | Target `Healthy`, `hey` 실행 유지, `-disable-keepalive` 확인 |
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
