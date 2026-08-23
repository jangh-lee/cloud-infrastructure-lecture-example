# 001 API Server

## 목표

Todo 웹 UI와 REST API를 실행해 HTTP 메서드, JSON 요청/응답, Postman CRUD 테스트를 실습합니다.

## 실습 폴더

```text
001-api server
```

## 서버 설치

Ubuntu 서버에서 바로 실행합니다.

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd "cloud-infrastructure-lecture-example/001-api server"
chmod +x install.sh
sudo ./install.sh
```

## 접속 확인

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/todos
```

브라우저에서는 아래 주소를 엽니다.

```text
http://SERVER_PUBLIC_IP:3000
http://SERVER_PUBLIC_IP:3000/guide
```

## ACG

- `22/tcp`: 관리자 IP
- `3000/tcp`: 실습자 또는 강의장 IP

## API 목록

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/api/todos` | 전체 할 일 조회 |
| `GET` | `/api/todos/:id` | 단건 조회 |
| `POST` | `/api/todos` | 새 할 일 생성 |
| `PUT` | `/api/todos/:id` | 전체 수정 |
| `PATCH` | `/api/todos/:id` | 일부 수정 |
| `DELETE` | `/api/todos/:id` | 삭제 |
