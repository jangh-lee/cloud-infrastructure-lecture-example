# GitBook Lecture Notes

GitBook으로 배포할 학교별 강의 교안을 관리하는 폴더입니다.

## Schools

| Folder | Description |
| --- | --- |
| [`dankook-university`](./dankook-university/) | 단국대 클라우드 인프라 실습 교안입니다. |

## 운영 방식

학교별로 GitBook Space를 따로 만들고, 각 Space의 Git sync root directory를 해당 학교 폴더로 지정합니다.

예시:

```text
Repository: cloud-infrastructure-lecture-example
Branch: main
Root directory: gitbook/dankook-university
```

