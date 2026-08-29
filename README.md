# Cloud Infrastructure Lecture Example

클라우드 인프라 강의에서 사용하는 실습 예제 모음입니다.

웹 강의 교안은 MkDocs Material과 GitHub Pages로 배포합니다. 교안 원본은 [`gitbook`](./gitbook/) 폴더에서 관리합니다.

```text
https://jangh-lee.github.io/cloud-infrastructure-lecture-example/
```

## Examples

| Folder | Topic |
| --- | --- |
| [`001-api server`](./001-api%20server/) | Todo UI와 REST API로 HTTP, JSON, Postman, CRUD 흐름을 익히는 가장 기본 웹 서버 예제입니다. |
| [`002-init script`](./002-init%20script/) | 서버 생성 시 init script를 사용해 Ubuntu SSH 포트를 `22`, `2200`으로 재설정하는 예제입니다. |
| [`003-cloud cli`](./003-cloud%20cli/) | Ncloud CLI를 설치하고 인증한 뒤 VPC 리소스를 조회하고 서버를 생성하는 예제입니다. |
| [`004-load balancer`](./004-load%20balancer/) | 여러 Ubuntu 웹 노드를 만들고 Load Balancer 뒤에 연결해 헬스체크와 트래픽 분산을 확인하는 예제입니다. |
| [`005-static website`](./005-static%20website/) | Object Storage, Amazon S3 같은 오브젝트 스토리지 계열 서비스에서 정적 웹사이트를 퍼블리싱하기 위한 자료 예시입니다. |
| [`006-database backup recovery`](./006-database%20backup%20recovery/) | 데이터베이스 백업, 복구, 특정시점 복구(PITR)를 실습하기 위해 Ubuntu 서버에서 30초마다 DB에 테스트 데이터를 기록하는 예제입니다. |
| [`007-three tier web app`](./007-three%20tier%20web%20app/) | Web, Backend, DB 서버를 분리해 3계층 게시판과 서버 간 통신, ACG 설계를 실습하는 예제입니다. |
| [`008-game server`](./008-game%20server/) | Ubuntu 서버에서 SuperTuxKart 게임 서버를 실행하며 서버 생성, ACG, UDP 포트, 공인 IP 접속을 실습하는 예제입니다. |
| [`009-ai rag studio`](./009-ai%20rag%20studio/) | CLOVA Studio API와 로컬 RAG 문서 관리 화면을 사용해 AI 애플리케이션 구성을 실습하는 예제입니다. |
| [`010-linux commands`](./010-linux%20commands/) | 클라우드 엔지니어가 Ubuntu 서버에서 자주 사용하는 리눅스 기본 명령어를 점검 순서대로 익히는 예제입니다. |
| [`011-terraform`](./011-terraform/) | Terraform으로 Naver Cloud VPC, Subnet, ACG, Init Script, Server를 코드로 생성하고 삭제하는 예제입니다. |
| [`012-cloud db migration`](./012-cloud%20db%20migration/) | 007번 게시판 DB를 Cloud DB for MySQL로 마이그레이션하기 위한 ERD, Source DB 사전 설정, 검증, 백엔드 전환 예제입니다. |
| [`013-cost slack alert`](./013-cost%20slack%20alert/) | Cloud Functions에서 Naver Cloud 비용을 조회하고 Slack으로 알림을 보내는 예제입니다. |
| [`014-acg slack alert`](./014-acg%20slack%20alert/) | Cloud Activity Tracer로 ACG 규칙 변경을 감지하고 Slack으로 보안 알림을 보내는 예제입니다. |
| [`015-auto scaling`](./015-auto%20scaling/) | 007번 게시판 Backend를 Application Load Balancer와 Auto Scaling Group으로 확장하는 실습입니다. 전체 절차는 [GitBook 015 교재](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/015-auto-scaling/)에서 진행합니다. |
