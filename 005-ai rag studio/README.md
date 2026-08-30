# 005 AI Fortune & RAG Studio

네이버 클라우드의 CLOVA Studio API를 이용해 다음 기능을 시연하는 데모입니다.

- 사주/오늘의 운세 텍스트 생성
- RAG Reasoning 기반 실습 문서 질의응답
- 답변에 인용 번호, 검색 근거 문장, 출처와 토큰 사용량 표시
- RAG 문서 추가·수정·삭제 관리 화면
- 문서 관계도와 핵심 키워드 시각화
- 운세 시스템 프롬프트 관리
- RAG 시스템 프롬프트 관리
- API 응답 대기 중 로딩 UI

## 구현 방향

오늘의 운세는 공식 Chat Completions v3 API를 호출해 JSON 형식으로 생성합니다.

RAG 질문은 다음 순서로 처리합니다.

1. RAG Reasoning 모델이 질문을 분석하고 검색 도구 호출을 계획합니다.
2. 서버가 [`data/rag-documents.json`](./data/rag-documents.json)에서 관련 문서를 검색합니다.
3. 검색 결과를 `tool` 메시지로 모델에 다시 전달합니다.
4. 모델이 문서에 근거한 최종 답변과 출처를 생성합니다.

## 공식 문서

- Chat Completions v3: [텍스트 및 이미지](https://api.ncloud-docs.com/docs/clovastudio-chatcompletionsv3)
- RAG Reasoning: `POST /v1/api-tools/rag-reasoning`
- CLOVA Studio 개요: [CLOVA Studio 개요](https://api.ncloud-docs.com/docs/ai-naver-clovastudio-summary)

## 폴더 구성

- [server.js](./server.js): API 서버
- [public/index.html](./public/index.html): 메인 UI
- [public/app.js](./public/app.js): 화면 로직
- [data/prompt-config.json](./data/prompt-config.json): 관리자 프롬프트 설정
- [data/rag-documents.json](./data/rag-documents.json): RAG 검색 대상 실습 문서
- [install.sh](./install.sh): Ubuntu 설치 스크립트

## 실행 방법

```bash
cd "005-ai rag studio"
npm install
npm start
```

기본 접속 주소:

- 메인: `http://localhost:4100`

## Ubuntu 서버 설치

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
cd "cloud-infrastructure-lecture-example/005-ai rag studio"
chmod +x install.sh
sudo ./install.sh
```

처음 실행하면 `.env` 템플릿이 자동 생성됩니다. 값을 채운 뒤 다시 실행하면 됩니다.

## `.env` 예시

```env
PORT=4100
CLOVA_BASE_URL="https://clovastudio.stream.ntruss.com"
CLOVA_API_KEY="nv-xxxx"
CLOVA_TEXT_MODEL="HCX-DASH-002"
ADMIN_PASSWORD="change-me"
DEMO_MODE_IF_NO_KEY="true"
```

## 화면 구성

### 1. 오늘의 사주

- 생년월일시 입력
- 양력/음력 선택
- 오늘의 운세 텍스트 응답

### 2. RAG 질문

- GPT Studio 형태의 대화 UI
- 예시 질문과 여러 차례 이어지는 대화
- RAG Reasoning 검색 계획 및 로컬 문서 검색
- XML 형태의 모델 인용 태그를 `[1]` 형식으로 자동 변환
- 참고한 문서에서 실제 검색된 근거 문장과 핵심 단어 강조
- 참고한 문서와 검색어, 토큰 사용량 표시

### 3. RAG 문서 관리

- `ADMIN_PASSWORD`로 문서 관리 화면 접속
- 문서 ID, 제목, 출처, 검색 본문 추가·수정·삭제
- 등록 문서 수, 전체 문자 수, 핵심 키워드 통계
- RAG와 문서의 연결 관계를 지식 맵으로 시각화
- 여러 문서에 함께 등장하는 검색 키워드를 크기별로 표시

### 4. 프롬프트 관리자

- 운세 시스템 프롬프트
- 운세 사용자 프롬프트 템플릿
- RAG 시스템 프롬프트

## RAG 문서 관리

사이드바의 `RAG 문서 관리`로 이동해 `.env`의 `ADMIN_PASSWORD`를 입력하면 문서를 화면에서 관리할 수 있습니다. 저장된 내용은 즉시 RAG 검색에 반영되며 별도 서비스 재시작은 필요하지 않습니다.

관리 API는 다음과 같습니다.

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/api/admin/rag-documents` | 문서, 통계, 키워드 조회 |
| `POST` | `/api/admin/rag-documents` | 새 문서 추가 |
| `PUT` | `/api/admin/rag-documents/:id` | 기존 문서 수정 |
| `DELETE` | `/api/admin/rag-documents/:id` | 문서 삭제 |

파일을 직접 관리해야 하는 경우에는 다음 형식을 사용합니다.

[`data/rag-documents.json`](./data/rag-documents.json)에 다음 형식으로 문서를 추가합니다.

```json
{
  "id": "unique-document-id",
  "title": "화면에 표시할 문서 제목",
  "source": "/문서/경로",
  "content": "검색하고 답변 근거로 사용할 문서 내용"
}
```

## 참고

`CLOVA_API_KEY`가 비어 있고 `DEMO_MODE_IF_NO_KEY="true"`이면, API 키 없이도 화면 흐름을 확인할 수 있는 데모 응답으로 동작합니다.
