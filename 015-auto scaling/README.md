# 015. Naver Cloud Auto Scaling Hands-on

015 실습은 **GitBook 페이지를 정본 교재**로 사용합니다. 명령어를 중복해서 두 문서에 관리하지 않으므로 GitHub README와 GitBook 내용이 서로 달라지는 문제를 방지합니다.

## 실습 시작

아래 GitBook 페이지를 열고 `Step 0`부터 순서대로 진행합니다.

### [015 Auto Scaling 전체 실습 교재 열기](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/015-auto-scaling/)

GitBook에는 다음 내용이 모두 포함되어 있습니다.

- 실습 구조와 완료 기준
- Cloud DB 연결 확인
- Backend 및 Cloud DB ACG 설정
- 골든 Backend 준비와 Server Image 생성
- Target Group과 Application Load Balancer 생성
- Web 서버의 Backend 주소 전환
- Launch Configuration과 Auto Scaling Group 생성
- Cloud Insight Scale-out, Scale-in Event Rule
- `curl`을 이용한 Health, CRUD, hostname 확인
- `ApacheBench`를 이용한 CPU 부하 테스트
- 화면별 관찰 순서와 예상 출력
- 트러블슈팅 명령과 비용 정리

## 문서와 코드 위치

| 구분 | 위치 |
| --- | --- |
| 배포된 전체 교재 | [GitBook 015](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/015-auto-scaling/) |
| 교재 원본 Markdown | [`gitbook/labs/015-auto-scaling.md`](../gitbook/labs/015-auto-scaling.md) |
| 게시판 Backend | [`007-three tier web app/backend`](../007-three%20tier%20web%20app/backend/) |
| 게시판 Web | [`007-three tier web app/web`](../007-three%20tier%20web%20app/web/) |
| Cloud DB Migration | [`012-cloud db migration`](../012-cloud%20db%20migration/) |

## 실습 구조

```text
고정 Web 서버
  -> Public Application Load Balancer :80
  -> Target Group :4000
  -> Auto Scaling Backend 1~3대
  -> Cloud DB for MySQL :3306
```

## 코드 사용 원칙

Auto Scaling 리소스 생성과 검증은 GitBook의 CLI 명령을 한 줄씩 직접 실행합니다. 별도의 015 전용 자동화 스크립트는 사용하지 않습니다.

Node.js 패키지와 systemd 서비스 설치에만 기존 007번의 `install-backend.sh`를 재사용합니다. Health 확인, 게시글 CRUD, Backend hostname 집계, CPU 부하는 각각 `curl`, `awk`, `ApacheBench`로 직접 확인합니다.

## 문서 수정 원칙

015 실습 절차를 변경할 때는 정본인 [`gitbook/labs/015-auto-scaling.md`](../gitbook/labs/015-auto-scaling.md)를 수정합니다. 이 README에는 실습 명령어를 복제하지 않고 정본 교재와 관련 코드의 연결만 유지합니다.
