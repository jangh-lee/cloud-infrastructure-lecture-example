# Cloud Infrastructure Lecture Example

클라우드 인프라 강의에서 사용하는 실습 예제 모음입니다.

웹 강의 교안은 MkDocs Material과 GitHub Pages로 배포합니다. 교안 원본은 [`gitbook`](./gitbook/) 폴더에서 관리합니다.

```text
https://jangh-lee.github.io/cloud-infrastructure-lecture-example/
```

## Examples

### 1. 서버 실습

| Folder | Topic |
| --- | --- |
| [`001-api server`](./001-api%20server/) | Todo UI와 REST API로 HTTP, JSON, Postman, CRUD 흐름을 익히는 가장 기본 웹 서버 예제입니다. |
| [`002-init script`](./002-init%20script/) | 서버 생성 시 init script를 사용해 Ubuntu SSH 포트를 `22`, `2200`으로 재설정하는 예제입니다. |
| [`003-three tier web app`](./003-three%20tier%20web%20app/) | Web, Backend, DB 서버를 분리해 3계층 게시판과 서버 간 통신, ACG 설계를 실습하는 예제입니다. |
| [`004-game server`](./004-game%20server/) | Ubuntu 서버에서 SuperTuxKart 게임 서버를 실행하며 서버 생성, ACG, UDP 포트, 공인 IP 접속을 실습하는 예제입니다. |
| [`005-ai rag studio`](./005-ai%20rag%20studio/) | CLOVA Studio API와 로컬 RAG 문서 관리 화면을 사용해 AI 애플리케이션 구성을 실습하는 예제입니다. |
| [`006-linux commands`](./006-linux%20commands/) | 클라우드 엔지니어가 Ubuntu 서버에서 자주 사용하는 리눅스 기본 명령어를 점검 순서대로 익히는 예제입니다. |

### 2. 네트워크 실습

| Folder | Topic |
| --- | --- |
| [`007-acg slack alert`](./007-acg%20slack%20alert/) | Cloud Activity Tracer로 ACG 규칙 변경을 감지하고 Slack으로 보안 알림을 보내는 예제입니다. |

### 3. CLI 및 IaC 실습

| Folder | Topic |
| --- | --- |
| [`008-cloud cli`](./008-cloud%20cli/) | Ncloud CLI를 설치하고 인증한 뒤 VPC 리소스를 조회하고 서버를 생성하는 예제입니다. |
| [`009-terraform`](./009-terraform/) | Terraform으로 Naver Cloud VPC, Subnet, ACG, Init Script, Server를 코드로 생성하고 삭제하는 예제입니다. |
| [`010-cost slack alert`](./010-cost%20slack%20alert/) | Cloud Functions에서 Naver Cloud 비용을 조회하고 Slack으로 알림을 보내는 자동화 예제입니다. |

### 4. 스토리지 실습

| Folder | Topic |
| --- | --- |
| [`011-static website`](./011-static%20website/) | Object Storage에서 정적 웹사이트를 퍼블리싱하는 예제입니다. |

### 5. Load Balancer 및 Auto Scaling 실습

| Folder | Topic |
| --- | --- |
| [`012-load balancer`](./012-load%20balancer/) | 여러 Ubuntu 웹 노드의 분산을 확인하고 Target 서버에 `stress-ng`를 함께 설치합니다. |
| [`013-auto scaling`](./013-auto%20scaling/) | 012번 Target 서버로 이미지를 만들고 기존 Load Balancer와 Target Group을 사용해 기본 Auto Scaling을 확인합니다. |
| [`014-auto scaling`](./014-auto%20scaling/) | 003번 게시판 Web 이미지를 사용해 Public ALB 뒤에서 Web Auto Scaling과 데이터 유지를 확인합니다. |

### 6. 데이터베이스 실습

| Folder | Topic |
| --- | --- |
| [`015-database backup recovery`](./015-database%20backup%20recovery/) | Ubuntu 서버에서 테스트 데이터를 기록하며 데이터베이스 백업, 복구, 특정시점 복구(PITR)를 실습합니다. |
| [`016-cloud db migration`](./016-cloud%20db%20migration/) | 003번 게시판 DB를 Cloud DB for MySQL로 마이그레이션하고 정합성과 백엔드 연결을 검증합니다. |
