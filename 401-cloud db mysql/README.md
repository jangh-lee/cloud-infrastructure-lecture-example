# 401 Cloud DB for MySQL 생성 및 연결

003 게시판의 Backend가 직접 설치한 Ubuntu MariaDB 대신 Naver Cloud `Cloud DB for MySQL`을 사용하도록 전환하는 실습입니다. 새 Backend 서버를 사용하는 경우에도 교안 안의 명령으로 애플리케이션을 설치할 수 있습니다.

이 실습은 빈 관리형 DB 생성과 애플리케이션 연결에 집중합니다. 기존 DB의 데이터를 옮기는 마이그레이션은 `402-cloud db migration`에서 진행합니다.

## 실습 표준 이름

| 용도 | 값 |
| --- | --- |
| DB Service | `board-service` |
| DB Server | `board-mysql` |
| Private Sub Domain | `board-db` |
| Database | `board_service` |
| 관리 계정 | `board_admin` |
| 애플리케이션 계정 | `board_app` |

챕터 번호는 강의 순서일 뿐 운영 리소스의 역할을 설명하지 못하므로 DB와 계정 이름에 `chapter3`를 사용하지 않습니다. `board_admin`은 스키마 변경용 DDL 계정이고, Backend는 CRUD 권한만 가진 `board_app`을 사용합니다.

이 실습에서 Cloud DB는 `lab7-sub-pri-kr1` Subnet에 생성하며 CIDR은 `10.10.110.0/24`입니다. Backend와 Cloud DB가 같은 Private Subnet을 사용해도 ACG와 DB User의 `HOST(IP)` 제한은 그대로 적용됩니다.

## 포함 파일

- `sql/board-service-schema.sql`: `posts` 테이블과 최초 확인 게시글 생성

## 전체 교안

콘솔 생성값, ACG, DB User, 신규 Backend 설치 또는 기존 Backend 전환과 게시글 검증은 아래 웹 교안에서 순서대로 진행합니다.

```text
https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/401-cloud-db-mysql/
```

다음은 `402-cloud db migration`에서 기존 Ubuntu DB의 게시글을 이관하고, `403-database backup recovery`에서 이관된 Cloud DB의 특정 시점 복구(PITR)를 실습합니다.

402에서는 추가 Cloud DB를 만들지 않고 이 Cloud DB 서버를 Target으로 재사용합니다. DMS 시작 전에 Backend와 자동 게시글 서비스를 중지하고 Target의 `board_service` 데이터베이스를 삭제하며, Cloud DB 서버와 `board_admin`·`board_app` 계정은 유지합니다. 401에서 작성한 Target 데이터가 필요하면 삭제 전에 별도로 내보내거나 백업을 확보합니다. 이관할 원본은 003 Ubuntu DB이므로 검증이 끝날 때까지 원본 서버도 유지합니다.
