# GitBook 운영 준비

## 목표

이 저장소의 강의 교안을 GitBook Space와 연결해서, 강의 중 학생들이 명령어를 복사할 수 있는 웹 교안으로 제공합니다.

현재 무료 공개 교안은 GitHub Pages 배포를 권장합니다. GitBook은 조직 정책상 GitBook을 계속 써야 할 때 선택합니다.

## 권장 구조

```text
cloud-infrastructure-lecture-example
├── 001-api server
├── ...
├── 015-cloud db mysql
├── 016-database backup recovery
├── 017-cloud db migration
└── gitbook
    ├── README.md
    ├── SUMMARY.md
    ├── setup
    └── labs
```

## GitBook에서 필요한 준비물

- GitBook 계정
- GitHub 접근 권한
- 이 저장소에 접근 가능한 GitHub 계정 또는 GitHub Organization 권한
- GitBook GitHub Sync 설정
- GitBook Space 1개

## GitBook Space 연결 값

교안은 아래 값으로 연결합니다.

```text
Repository: cloud-infrastructure-lecture-example
Branch: main
Root directory: gitbook
```

GitBook에서 root directory를 지정할 수 없다면, 교안을 별도 브랜치나 별도 저장소로 분리하는 방식이 더 단순합니다.

## 수정 흐름

로컬에서 교안을 수정합니다.

```bash
git status
git add gitbook
git commit -m "Update Dankook lecture notes"
git push
```

GitBook Git sync가 연결되어 있으면 push 이후 GitBook Space에 변경사항이 반영됩니다.
