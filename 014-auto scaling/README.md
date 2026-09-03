# 014 Auto Scaling Hands-on (2)

014는 003번 Web 서버를 이미지로 만들어 Public Application Load Balancer 뒤에서 Auto Scaling하는 심화 실습입니다. Backend와 DB는 기존 고정 서버를 그대로 사용합니다.

## 실습 시작

### [014 Auto Scaling 전체 교재 열기](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/014-auto-scaling/)

다루는 내용:

- 기존 Web의 `/healthz`, `/web-instance` 점검
- Public ALB용 Web Target Group 생성
- Public Application Load Balancer 생성
- Web 대표 접속 주소를 Public ALB로 변경
- Web 내 서버 이미지와 Launch Configuration 생성
- 최소 1대, 최대 3대의 Web Auto Scaling Group 생성
- 수업용 1분 감지 조건과 60초 Cooldown 적용
- Cloud Insight와 Web 증감 정책 연결
- Web 이미지에 `stress-ng`와 `htop` 포함 후 Bastion에서 부하·CPU 관찰
- Public ALB를 통한 Web hostname 분산 확인

## 실습 구조

```text
사용자
  -> Public ALB
  -> Auto Scaling Web 1~3대
  -> 고정 Backend
  -> 고정 DB

Bastion
  -> Web 인스턴스에 stress-ng 원격 실행
```

Backend의 `/api/stress`는 사용하지 않습니다. Web ASG를 확장하려면 Web CPU를 높여야 하며, Public ALB 분산은 `/web-instance` 응답의 Web hostname으로 별도 확인합니다.

## 문서와 코드

| 구분 | 위치 |
| --- | --- |
| 전체 실습 교재 | [GitBook 014](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/014-auto-scaling/) |
| 교재 원본 | [`gitbook/labs/014-auto-scaling.md`](../gitbook/labs/014-auto-scaling.md) |
| Web 코드와 Nginx 설치기 | [`003-three tier web app/web`](../003-three%20tier%20web%20app/web/) |
| 고정 Backend 코드 | [`003-three tier web app/backend`](../003-three%20tier%20web%20app/backend/) |

실습 절차를 변경할 때는 GitBook 원본을 수정합니다. 이 README에는 전체 명령을 중복하지 않습니다.
