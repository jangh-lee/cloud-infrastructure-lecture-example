# 011 Object Flow Lab

Object Storage 계열 서비스에서 정적 웹사이트를 퍼블리싱하는 흐름을 설명하기 위한 인터랙션 웹페이지 예제입니다.

이 예제는 서버 사이드 코드 없이 HTML, CSS, JavaScript, 이미지 파일만으로 구성되어 있습니다. 네이버클라우드 Object Storage, Amazon S3, GitHub Pages 같은 정적 호스팅 환경에 그대로 업로드할 수 있습니다.

## Pages

- `index.html`: 사진 시퀀스 기반 스크롤 인터랙션 메인 페이지
- `rooms.html`: 개별 정적 HTML 페이지 이동 예시
- `ideas.html`: 정적 웹사이트 패턴 예시
- `stores.html`: Object Storage 리소스 경로 예시
- `contact.html`: 정적 사이트에서 별도 API가 필요한 기능 예시
- `overview.html`: 실습 개요
- `specs.html`: 객체 key와 웹 리소스 경로 설명
- `buy.html`: 배포 명령어 흐름 설명

## Static Hosting

버킷 루트에 이 폴더 안의 파일과 폴더를 그대로 업로드합니다.

- 시작 문서: `index.html`
- 함께 업로드할 폴더: `css/`, `js/`, `images/`, `video/`, `gif/`
- 함께 업로드할 파일: `favicon.svg`
- `video/001`, `video/002` 이미지 시퀀스 파일은 대소문자까지 일치해야 합니다.

```bash
aws --endpoint-url=https://kr.object.ncloudstorage.com \
  s3 sync "011-static website/" s3://버킷이름/
```

로컬 확인:

```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080/`에 접속합니다.
