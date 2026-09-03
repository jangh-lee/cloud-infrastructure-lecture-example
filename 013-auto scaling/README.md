# 013 Auto Scaling Hands-on (1)

012 Load Balancer 실습에서 만든 `lab-lb-web-image-v1`, Load Balancer, Target Group을 그대로 사용해 Nginx 웹 서버를 Auto Scaling합니다.

### [013 Auto Scaling 전체 교재 열기](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/013-auto-scaling/)

## 이번 실습에서 새로 만드는 것

- 012 서버 이미지 기반 Launch Configuration
- 최소 1대, 최대 3대의 Auto Scaling Group
- 서버 1대 증가·감소 정책
- CPU 조건을 감시하는 Cloud Insight Event Rule

## 재사용하는 것

| 012에서 만든 리소스 | 013에서의 용도 |
| --- | --- |
| `lab-lb-web-image-v1` | Auto Scaling 서버 원본 이미지 |
| Load Balancer | 외부 접속과 트래픽 분산 |
| Target Group | ASG 서버 자동 등록과 Health Check |
| Web ACG | LB의 HTTP와 Bastion SSH 허용 |

별도 Web 설치나 Init Script는 사용하지 않습니다. 012 통합 설치 스크립트에 `stress-ng`와 `htop`이 포함되어 있어 이미지로 생성되는 모든 서버에서 바로 사용할 수 있습니다.

## 핵심 확인 흐름

1. 012 이미지로 Launch Configuration을 만듭니다.
2. 기존 012 Target Group을 연결해 기대 용량 1의 ASG를 만듭니다.
3. ASG Target이 Healthy가 되면 수동으로 등록했던 012 Target을 제거합니다.
4. Bastion에서 ASG 서버에 `stress-ng`를 실행합니다.
5. CPU 50% 이상 1분 Event가 서버를 `1대 → 2대`로 늘리는지 확인합니다.
6. Load Balancer의 `/status.json`에서 서로 다른 Hostname을 확인합니다.
7. 부하가 끝난 뒤 CPU 20% 미만 1분 Event가 서버를 1대로 줄이는지 확인합니다.

## 관련 자료

| 자료 | 링크 |
| --- | --- |
| 선행 실습 | [012 Load Balancer](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/012-load-balancer/) |
| 심화 실습 | [014 Auto Scaling Hands-on (2)](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/014-auto-scaling/) |
| 교재 원본 | [`gitbook/labs/013-auto-scaling.md`](../gitbook/labs/013-auto-scaling.md) |
