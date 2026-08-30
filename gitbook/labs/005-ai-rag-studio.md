# 005 AI RAG Studio

## 목표

CLOVA Studio API와 로컬 RAG 문서 관리 화면을 사용해 AI 애플리케이션의 API 호출, 프롬프트, 문서 검색 흐름을 실습합니다.

## 실습 폴더

```text
005-ai rag studio
```

## 설치

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd "cloud-infrastructure-lecture-example/005-ai rag studio"
chmod +x install.sh
sudo ./install.sh
```

처음 실행하면 `.env` 템플릿이 생성됩니다. 값을 채운 뒤 다시 실행합니다.

```bash
sudo ./install.sh
```

## `.env` 예시

```env
PORT=4100
CLOVA_BASE_URL="https://clovastudio.stream.ntruss.com"
CLOVA_API_KEY="nv-xxxx"
CLOVA_TEXT_MODEL="HCX-DASH-002"
ADMIN_PASSWORD="change-me"
DEMO_MODE_IF_NO_KEY="true"
```

API 키 없이 화면 흐름만 확인하려면 `DEMO_MODE_IF_NO_KEY="true"`를 유지합니다.

## 접속

```text
http://SERVER_PUBLIC_IP:4100
```

## ACG

- `22/tcp`: 관리자 IP
- `4100/tcp`: 실습자 또는 강의장 IP

## 실습 포인트

- CLOVA Studio Chat Completions 호출
- RAG 문서 검색과 근거 표시
- 관리자 비밀번호 기반 RAG 문서 추가, 수정, 삭제
- 시스템 프롬프트 변경
