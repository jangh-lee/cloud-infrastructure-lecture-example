# 🌎 apple-clone

애플 웹사이트 인터랙션 클론 코딩 

<br><br>

# 💻 실행 화면
![Alt Text](https://github.com/ssoonD/apple-clone/blob/main/gif/apple-clone.gif)
<br>
### 1. 웹페이지 골격 만들기
### 2. 스크롤 인터랙션 구현 원리와 구현 실습
### 3. 고해상도 비디오 인터랙션과 스크롤 액션 연동
### 4. 위치와 크기 계산을 이용한 스크롤 인터랙션 구현 실습
### 5. 더 부드럽게 고화질 비디오 제어하기
### 6. SVG 애니메이션

<br><br>

# 📚 Stack
- HTML
- CSS
- Javascript    

<br><br>

# 🚀 Static Hosting

이 프로젝트는 빌드 과정이 없는 순수 정적 웹페이지입니다.

네이버클라우드 Object Storage, Amazon S3, GitHub Pages 같은 정적 호스팅에 올릴 때는 저장소 루트의 파일과 폴더를 그대로 업로드하면 됩니다.

- 시작 문서: `index.html`
- 함께 업로드할 폴더: `css/`, `js/`, `images/`, `video/`, `gif/`
- 함께 업로드할 파일: `favicon.svg`
- 경로는 상대 경로를 사용하므로 버킷 루트에 올리면 바로 동작합니다.
- `video/001`, `video/002` 이미지 시퀀스 파일은 대소문자까지 일치해야 합니다.

로컬 확인:

```bash
python3 -m http.server 8080
```

브라우저에서 `http://localhost:8080/` 접속

<br><br>

# 👩🏻‍🏫 Reference
[인프런](https://www.inflearn.com/course/%EC%95%A0%ED%94%8C-%EC%9B%B9%EC%82%AC%EC%9D%B4%ED%8A%B8-%EC%9D%B8%ED%84%B0%EB%9E%99%EC%85%98-%ED%81%B4%EB%A1%A0/dashboard)
