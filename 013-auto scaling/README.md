# 013 Backend Auto Scaling Hands-on

013 실습은 003번에서 완성한 Backend 서버를 원본으로 사용해 Naver Cloud Auto Scaling Group을 구성합니다. 전체 절차와 입력값은 아래 GitBook 정본 교재에서 확인합니다.

## 실습 시작

### [013 Backend Auto Scaling 전체 교재 열기](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/013-auto-scaling/)

다루는 내용:

- 기존 003 Backend 서비스 점검
- Backend 내 서버 이미지 생성
- Launch Configuration 생성
- 최소 1대, 최대 3대의 Auto Scaling Group 생성
- 1대 증가, 1대 감소 Scaling Policy 생성
- 정책 수동 실행과 새 Backend 서비스 확인

다루지 않는 내용:

- DB 설치 또는 Cloud DB 마이그레이션
- Target Group과 Load Balancer
- Web 서버의 Backend 주소 변경
- Cloud Insight Event Rule과 CPU 부하 테스트

## 실습 구조

```text
003 기존 Backend
  -> 내 서버 이미지
  -> Launch Configuration
  -> Auto Scaling Group
  -> Backend 1~3대
```

기존 003 Backend 서버는 이미지의 원본일 뿐 Auto Scaling Group에 자동 편입되지 않습니다. ASG는 이미지로 새로운 Backend 서버를 만듭니다.

## 문서와 코드

| 구분 | 위치 |
| --- | --- |
| 전체 실습 교재 | [GitBook 013](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/013-auto-scaling/) |
| 교재 원본 | [`gitbook/labs/013-auto-scaling.md`](../gitbook/labs/013-auto-scaling.md) |
| 기존 Backend 코드 | [`003-three tier web app/backend`](../003-three%20tier%20web%20app/backend/) |

013 절차를 변경할 때는 GitBook 원본을 수정합니다. 이 README에는 명령어를 중복해서 두지 않아 두 문서의 내용이 달라지는 문제를 방지합니다.
