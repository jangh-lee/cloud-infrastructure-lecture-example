# 013 Auto Scaling Hands-on (1)

012 Load Balancer 실습의 기존 Target 서버로 내 서버 이미지를 만들고, 기존 Load Balancer와 Target Group을 그대로 사용해 Nginx 웹 서버를 Auto Scaling합니다.

### [013 Auto Scaling 전체 교재 열기](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/013-auto-scaling/)

## 이번 실습에서 새로 만드는 것

- 012 Target 서버의 내 서버 이미지
- 생성한 이미지 기반 Launch Configuration
- 최소 1대, 최대 3대의 Auto Scaling Group
- 서버 1대 증가·감소 정책
- CPU 조건을 감시하는 Cloud Insight Event Rule

## 재사용하는 것

| 012에서 만든 리소스 | 013에서의 용도 |
| --- | --- |
| Target 서버 한 대 | Step 1에서 내 서버 이미지 생성 |
| Load Balancer | 외부 접속과 트래픽 분산 |
| Target Group | ASG 서버 자동 등록과 Health Check |
| Web ACG | Load Balancer Subnet의 HTTP 허용 |

별도 Web 설치나 Init Script는 사용하지 않습니다. 012 통합 설치 스크립트에 HTTP Stress API와 `stress-ng`가 포함되어 있어 모든 ASG 서버가 Load Balancer 요청으로 부하를 받을 수 있습니다.

## 핵심 확인 흐름

1. 기존 012 Target 서버를 선택해 내 서버 이미지를 만듭니다.
2. 생성한 이미지로 Launch Configuration을 만듭니다.
3. 기존 012 Target Group을 연결해 기대 용량 1의 ASG를 만듭니다.
4. ASG Target이 Healthy가 되면 수동으로 등록했던 012 Target을 제거합니다.
5. Bastion에서 Load Balancer `/stress`에 5분 제한 HTTP 부하를 실행합니다.
6. 새 Target도 부하를 받으며 서버가 `1대 → 2대 → 3대`로 늘어나는지 확인합니다.
7. Load Balancer의 `/status.json`에서 서로 다른 Hostname을 확인합니다.
8. 부하가 끝난 뒤 CPU 20% 미만 1분 Event가 서버를 최소 용량 1대로 줄이는지 확인합니다.

## 관련 자료

| 자료 | 링크 |
| --- | --- |
| 선행 실습 | [012 Load Balancer](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/012-load-balancer/) |
| 심화 실습 | [014 Auto Scaling Hands-on (2)](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/014-auto-scaling/) |
| 교재 원본 | [`gitbook/labs/013-auto-scaling.md`](../gitbook/labs/013-auto-scaling.md) |
