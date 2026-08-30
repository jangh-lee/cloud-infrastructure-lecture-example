# 001 Postman & API Server

투두리스트 UI와 함께 CRUD API를 실습하기 위한 예제입니다.

## 실행 방법

```bash
npm install
npm start
```

기본 주소:

- 메인 페이지: `http://localhost:3000`
- API 가이드: `http://localhost:3000/guide`
- API 헬스체크: `http://localhost:3000/api/health`

브라우저를 여러 개 열어두면 SSE로 변경 내용이 자동 반영됩니다.

## Ubuntu 서버 설치 스크립트

서버에서 바로 실행하려면 [install.sh](./install.sh)를 사용하면 됩니다.

```bash
chmod +x install.sh
sudo ./install.sh
```

이 스크립트는 아래 작업을 한 번에 처리합니다.

- `nodejs`, `npm` 설치
- `npm install` 실행
- `chapter1-todo-api.service` systemd 서비스 등록
- 서버 재부팅 후에도 자동 실행되도록 설정

공개 리포 기준으로 바로 복붙할 수 있는 예시는 아래입니다.

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd "cloud-infrastructure-lecture-example/001-api server"
chmod +x install.sh
sudo ./install.sh
```

설치 후 확인:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/todos
```

## API 목록

- `GET /api/todos`: 전체 할 일 조회
- `GET /api/todos/:id`: 단건 조회
- `POST /api/todos`: 새 할 일 생성
- `PUT /api/todos/:id`: 전체 수정
- `PATCH /api/todos/:id`: 일부 수정
- `DELETE /api/todos/:id`: 삭제

상세 요청 예시와 JSON body 예시는 `/guide` 페이지에서 확인하면 됩니다.
