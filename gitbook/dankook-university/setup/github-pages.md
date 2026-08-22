# GitHub Pages 배포

## 목표

GitBook 유료 플랜 없이 GitHub Pages에서 강의 교안을 무료로 공개합니다.

이 저장소는 `gitbook/dankook-university` 폴더를 문서 원본으로 사용하고, GitHub Actions가 MkDocs Material 정적 사이트로 빌드합니다.

## 배포 흐름

```text
main 브랜치 push
→ GitHub Actions 실행
→ mkdocs build --strict
→ site 폴더 생성
→ gh-pages 브랜치로 배포
→ GitHub Pages에서 공개
```

## GitHub에서 최초 설정

저장소에서 아래 메뉴로 이동합니다.

```text
Settings → Pages
```

Build and deployment 값을 아래처럼 설정합니다.

```text
Source: Deploy from a branch
Branch: gh-pages
Folder: /root
```

`gh-pages` 브랜치가 보이지 않으면, 먼저 Actions 탭에서 `Deploy lecture docs` 워크플로를 한 번 실행합니다.

## 로컬에서 미리 확인

```bash
python3 -m venv .venv-docs
source .venv-docs/bin/activate
pip install -r requirements-docs.txt
mkdocs serve
```

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:8000
```

배포 전 빌드 검사는 아래 명령어로 합니다.

```bash
mkdocs build --strict
```

## 교안 수정 흐름

단국대 교안은 아래 폴더에서 수정합니다.

```text
gitbook/dankook-university
```

수정 후 push하면 자동 배포됩니다.

```bash
git status
git add gitbook/dankook-university mkdocs.yml requirements-docs.txt .github/workflows/deploy-docs.yml
git commit -m "Update lecture docs"
git push
```
