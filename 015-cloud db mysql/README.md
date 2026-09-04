# 015 Cloud DB for MySQL 생성 및 연결

003 게시판의 Backend가 직접 설치한 Ubuntu MariaDB 대신 Naver Cloud `Cloud DB for MySQL`을 사용하도록 전환하는 실습입니다.

이 실습은 빈 관리형 DB 생성과 애플리케이션 연결에 집중합니다. 기존 DB의 데이터를 옮기는 마이그레이션은 `017-cloud db migration`에서 진행합니다.

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

## 포함 파일

- `sql/board-service-schema.sql`: `posts` 테이블과 최초 확인 게시글 생성

## 전체 교안

콘솔 생성값, ACG, DB User, 접속 확인, Backend 전환과 게시글 검증은 아래 웹 교안에서 순서대로 진행합니다.

```text
https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/015-cloud-db-mysql/
```

다음 실습은 `016-database backup recovery`, 기존 DB를 실제로 이관하는 실습은 `017-cloud db migration`입니다.
