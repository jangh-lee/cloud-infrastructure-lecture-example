# 011 Terraform

Naver Cloud 리소스를 Terraform으로 생성하고 삭제하는 실습입니다.

10번까지는 서버에 접속해서 리눅스 명령어로 상태를 확인하는 방법을 익혔습니다. 11번에서는 같은 클라우드 리소스를 콘솔이나 CLI로 하나씩 누르는 대신, 코드로 선언하고 `terraform plan`, `terraform apply`, `terraform destroy` 흐름을 익힙니다.

## 실습 목표

- Terraform 기본 흐름 이해
- Ncloud Terraform Provider 설정
- VPC, Subnet, ACG, Login Key, Init Script, Server 생성
- 시간 요금제 서버 생성
- Public IP 확인
- Terraform state 개념 이해
- 실습 리소스 삭제

## 1. Terraform이 하는 일

Terraform은 인프라를 코드로 관리하는 도구입니다.

```text
main.tf 작성
→ terraform init
→ terraform plan
→ terraform apply
→ 실제 클라우드 리소스 생성
→ terraform destroy
→ 리소스 삭제
```

중요한 개념:

| 개념 | 설명 |
| --- | --- |
| Provider | Naver Cloud, AWS 같은 클라우드 API와 연결하는 플러그인 |
| Resource | Terraform이 만들 리소스. 예: VPC, Subnet, Server |
| Variable | 환경별로 바뀌는 값. 예: 인증키, 리전, IP |
| Output | 생성 후 확인할 값. 예: 서버 번호, 공인 IP |
| State | Terraform이 현재 인프라 상태를 기록하는 파일 |

## 2. 설치 확인

Terraform 설치 확인:

```bash
terraform version
```

없다면 설치합니다.

```bash
sudo apt-get update
sudo apt-get install -y wget gpg unzip
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(. /etc/os-release && echo "$VERSION_CODENAME") main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update
sudo apt-get install -y terraform
```

macOS에서는 Homebrew를 사용할 수 있습니다.

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

## 3. 예제 폴더로 이동

```bash
cd "011-terraform/examples/ncloud-basic"
```

## 4. 인증키 준비

Naver Cloud 콘솔에서 API 인증키를 준비합니다.

```text
마이페이지
계정관리
인증키 관리
신규 API 인증키 생성
```

이 실습에서는 인증키를 코드에 직접 쓰지 않습니다. `terraform.tfvars` 파일에 넣고, 이 파일은 `.gitignore`로 Git에 올라가지 않게 관리합니다.

```bash
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars`를 수정합니다.

```hcl
access_key   = "YOUR_ACCESS_KEY"
secret_key   = "YOUR_SECRET_KEY"
my_public_ip = "YOUR_PUBLIC_IP/32"
```

강의장 전체에서 접속해야 하면 `my_public_ip`를 강의장 공인 IP 대역으로 넣습니다. 실습 편의상 `0.0.0.0/0`도 가능하지만 운영 환경에서는 권장하지 않습니다.

## 5. 파일 구성

```text
examples/ncloud-basic
├── versions.tf
├── variables.tf
├── main.tf
├── outputs.tf
└── terraform.tfvars.example
```

각 파일 역할:

| 파일 | 역할 |
| --- | --- |
| `versions.tf` | Terraform과 provider 버전 선언 |
| `variables.tf` | 입력값 선언 |
| `main.tf` | 실제 리소스 선언 |
| `outputs.tf` | 생성 후 출력할 값 선언 |
| `terraform.tfvars.example` | 입력값 예시 |

## 6. 초기화

```bash
terraform init
```

이 명령은 Ncloud provider를 다운로드하고 `.terraform` 디렉터리를 만듭니다.

## 7. 포맷 확인

```bash
terraform fmt
```

Terraform 파일의 들여쓰기와 정렬을 맞춥니다.

## 8. 문법 검증

```bash
terraform validate
```

문법과 provider 설정이 올바른지 확인합니다.

## 9. 생성 계획 확인

```bash
terraform plan
```

`plan`은 실제 생성 전에 Terraform이 무엇을 만들지 보여줍니다.

주니어가 꼭 봐야 하는 부분:

| 표시 | 의미 |
| --- | --- |
| `+ create` | 새로 생성 |
| `~ update` | 변경 |
| `- destroy` | 삭제 |
| `-/+ replace` | 삭제 후 재생성 |

## 10. 리소스 생성

```bash
terraform apply
```

확인 메시지가 나오면 `yes`를 입력합니다.

자동 승인으로 실행하려면:

```bash
terraform apply -auto-approve
```

## 11. 생성 결과 확인

```bash
terraform output
```

특정 값만 확인:

```bash
terraform output server_instance_no
terraform output public_ip
```

생성되는 주요 리소스:

| 리소스 | 이름 |
| --- | --- |
| VPC | `vpc-lab11` |
| Public Subnet | `sub-lab11-pub-kr1` |
| Private Subnet | `sub-lab11-pri-kr1` |
| ACG | `lab11-acg` |
| Login Key | `key-lab11` |
| Init Script | `init-lab11-nginx` |
| Server | `svr-lab11-web-kr1` |

## 12. 브라우저 접속

출력된 Public IP로 접속합니다.

```text
http://PUBLIC_IP/
```

Init Script가 정상 동작했다면 nginx 기본 페이지 또는 실습 페이지가 보입니다.

Ncloud Terraform provider는 `ncloud_init_script.content`에 HTML 태그가 들어가면 콘솔 저장 과정에서 일부 태그를 필터링해 Terraform state 비교가 깨질 수 있습니다. 그래서 이 예제의 init script는 HTML 태그 없이 단순 텍스트 페이지를 생성합니다.

아래와 같은 오류가 나오면 init script 내용에 필터링되는 태그가 들어간 경우입니다.

```text
Provider produced inconsistent result after apply
```

이 경우 init script 내용에서 HTML/XML 태그를 제거하고 다시 실행합니다.

```bash
terraform apply
```

## 13. 상태 파일 이해

Terraform은 `terraform.tfstate` 파일에 실제 리소스 상태를 기록합니다.

```bash
ls -la
terraform state list
```

주의:

- `terraform.tfstate`에는 리소스 ID와 민감 정보가 포함될 수 있습니다.
- 실무에서는 로컬 state 대신 Object Storage 같은 원격 backend를 사용합니다.
- 이 저장소에서는 `*.tfstate`, `*.tfvars`, `*.pem`을 Git에 올리지 않도록 `.gitignore`에 등록합니다.

## 14. 변경 실습

예를 들어 `variables.tf` 또는 `terraform.tfvars`에서 서버 이름을 바꾸고 plan을 확인합니다.

```bash
terraform plan
```

Terraform은 변경이 가능한 항목은 update로, 재생성이 필요한 항목은 replace로 표시합니다.

## 15. 삭제

실습이 끝나면 반드시 삭제합니다.

```bash
terraform destroy
```

확인 메시지가 나오면 `yes`를 입력합니다.

자동 승인:

```bash
terraform destroy -auto-approve
```

삭제 후 state를 확인합니다.

```bash
terraform state list
```

아무것도 출력되지 않으면 Terraform이 관리하던 리소스가 모두 삭제된 상태입니다.

## 16. 실무 주의사항

- 인증키를 `.tf` 파일에 직접 쓰지 않습니다.
- `terraform.tfvars`는 Git에 올리지 않습니다.
- `terraform plan` 없이 `apply`를 바로 실행하지 않습니다.
- 운영 환경에서는 `destroy` 권한을 제한합니다.
- 여러 명이 함께 쓰는 프로젝트는 원격 backend와 state lock을 사용합니다.
- 수동으로 콘솔에서 리소스를 변경하면 Terraform state와 실제 인프라가 어긋날 수 있습니다.

## 17. 참고 문서

- Ncloud Terraform Provider: <https://registry.terraform.io/providers/NaverCloudPlatform/ncloud/latest/docs>
- Ncloud Provider GitHub: <https://github.com/NaverCloudPlatform/terraform-provider-ncloud>
- Terraform Provider 설정: <https://developer.hashicorp.com/terraform/language/providers>
