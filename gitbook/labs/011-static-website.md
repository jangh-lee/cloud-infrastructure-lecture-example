# 011 Object Storage 정적 웹사이트

## 목표

Object Storage 계열 서비스에 정적 웹사이트 파일을 업로드하고, 브라우저에서 웹 페이지가 열리는지 확인합니다.

실습 폴더:

```text
011-static website
```

## 업로드 전 확인

```bash
cd ~/cloud-infrastructure-lecture-example
ls "011-static website"
```

정적 웹사이트는 서버 코드 없이 HTML, CSS, JavaScript, 이미지, 영상 파일만으로 동작해야 합니다.

## Naver Cloud Object Storage 업로드

폴더 이름에 공백이 있으므로 경로 전체를 따옴표로 감쌉니다.

```bash
aws --endpoint-url=https://kr.object.ncloudstorage.com \
  s3 sync "011-static website/" s3://YOUR_BUCKET_NAME/
```

예시:

```bash
aws --endpoint-url=https://kr.object.ncloudstorage.com \
  s3 sync "011-static website/" s3://lab-bucket-james-260816/
```

## 업로드 확인

```bash
aws --endpoint-url=https://kr.object.ncloudstorage.com \
  s3 ls s3://YOUR_BUCKET_NAME/
```

## 정적 웹사이트 호스팅 확인

Object Storage에서 정적 웹사이트 호스팅을 켠 뒤, index document를 아래처럼 설정합니다.

```text
Index document: index.html
```

단순히 `index.html` 객체 URL을 직접 여는 것과 정적 웹사이트 호스팅 endpoint를 여는 것은 다릅니다.

- 객체 URL: 특정 객체 하나를 직접 다운로드/조회
- 정적 웹사이트 endpoint: `/` 요청을 `index.html`로 매핑하고 웹사이트처럼 응답
