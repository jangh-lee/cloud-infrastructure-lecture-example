# 009 Terraform

Naver Cloud 리소스를 Terraform으로 생성하고 삭제하는 실습입니다.

10번까지는 서버에 접속해서 리눅스 명령어로 상태를 확인하는 방법을 익혔습니다. 11번에서는 콘솔이나 CLI로 하나씩 만들던 인프라를 코드로 선언하고, `terraform plan`, `terraform apply`, `terraform destroy` 흐름을 익힙니다.

이 예제는 003번 게시판 실습을 Terraform으로 자동 생성합니다.

```text
사용자 브라우저
  ↓ 80
웹 서버 Public Subnet
  ↓ /backend-api 프록시
백엔드 서버 Private Subnet
  ↓ 3306
DB 서버 Private Subnet

관리자
  ↓ SSH
베스천 서버 Public Subnet
  ↓ SSH ProxyJump
백엔드/DB 서버 Private Subnet
```

## 실습 목표

- Terraform 기본 흐름 이해
- Ncloud Terraform Provider 설정
- VPC, Subnet, NAT Gateway, Route, ACG 생성
- 베스천 서버와 private 서버 접속 구조 이해
- Init Script로 게시판 웹/백엔드/DB 자동 설치
- 시간 요금제 서버 생성
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

## 2. 생성되는 구성

| 구분 | 이름 |
| --- | --- |
| VPC | `vpc-lab11` |
| Public Subnet | `sub-lab11-pub-kr1` |
| Private Subnet | `sub-lab11-pri-kr1` |
| NAT Gateway Subnet | `sub-lab11-nat-kr1` |
| NAT Gateway | `natgw-lab11-kr1` |
| Bastion ACG | `lab11-bastion-acg` |
| Web ACG | `lab11-web-acg` |
| Backend ACG | `lab11-backend-acg` |
| DB ACG | `lab11-db-acg` |
| Login Key | `key-lab11` |
| Bastion Server | `svr-lab11-bastion-kr1` |
| Web Server | `svr-lab11-web-kr1` |
| Backend Server | `svr-lab11-backend-kr1` |
| DB Server | `svr-lab11-db-kr1` |

서버는 시간 요금제로 생성합니다.

```hcl
fee_system_type_code = "MTRAT"
```

Private subnet의 백엔드/DB 서버도 init script에서 패키지를 설치해야 하므로 NAT Gateway를 생성합니다. NAT Gateway가 없으면 private 서버에서 `apt-get`, `git clone`, `npm install`이 실패할 수 있습니다.

## 3. 설치 확인

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

## 4. 예제 폴더로 이동

```bash
cd "009-terraform/examples/ncloud-basic"
```

## 5. 인증키와 입력값 준비

Naver Cloud 콘솔에서 API 인증키를 준비합니다.

```text
마이페이지
계정관리
인증키 관리
신규 API 인증키 생성
```

`terraform.tfvars` 파일을 만듭니다.

```bash
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars`를 수정합니다.

```hcl
access_key   = "YOUR_ACCESS_KEY"
secret_key   = "YOUR_SECRET_KEY"
my_public_ip = "YOUR_PUBLIC_IP/32"

region = "KR"
zone   = "KR-1"

server_image_number = "104630229"
server_spec_code    = "s2-g3a"

db_root_password  = "ChangeRootPassword123!"
board_db_password = "ChangeThisPassword123!"
```

`my_public_ip`는 SSH를 허용할 관리자 공인 IP입니다. 실습 편의상 `0.0.0.0/0`도 가능하지만 운영 환경에서는 권장하지 않습니다.

## 6. 파일 구성

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

## 7. 초기화

```bash
terraform init
```

이 명령은 Ncloud provider를 다운로드하고 `.terraform` 디렉터리를 만듭니다.

## 8. 포맷 확인

```bash
terraform fmt
```

Terraform 파일의 들여쓰기와 정렬을 맞춥니다.

## 9. 문법 검증

```bash
terraform validate
```

문법과 provider 설정이 올바른지 확인합니다.

## 10. 생성 계획 확인

```bash
terraform plan
```

`plan`은 실제 생성 전에 Terraform이 무엇을 만들지 보여줍니다.

| 표시 | 의미 |
| --- | --- |
| `+ create` | 새로 생성 |
| `~ update` | 변경 |
| `- destroy` | 삭제 |
| `-/+ replace` | 삭제 후 재생성 |

## 11. 리소스 생성

```bash
terraform apply
```

확인 메시지가 나오면 `yes`를 입력합니다.

자동 승인으로 실행하려면:

```bash
terraform apply -auto-approve
```

## 12. 생성 결과 확인

```bash
terraform output
```

주요 output:

```bash
terraform output http_url
terraform output bastion_public_ip
terraform output web_public_ip
terraform output backend_private_ip
terraform output db_private_ip
terraform output ssh_bastion_command
terraform output ssh_backend_via_bastion_command
terraform output ssh_db_via_bastion_command
```

관리자 비밀번호도 실습 편의를 위해 output에 보이도록 설정했습니다.

```bash
terraform output admin_passwords
```

이 값은 서버 생성 시 사용한 Terraform login key로 복호화한 관리자 비밀번호입니다. 실무에서는 비밀번호를 output에 그대로 노출하지 않는 것이 맞지만, 강의 실습에서는 접속 흐름을 단순하게 만들기 위해 보이게 했습니다. 화면 공유나 터미널 로그에 남기지 않도록 주의합니다.

## 13. 게시판 접속

출력된 URL로 접속합니다.

```bash
terraform output http_url
```

브라우저에서는 아래 형식으로 접속합니다.

```text
http://WEB_PUBLIC_IP/
```

웹 서버 nginx는 `/backend-api/` 요청을 private subnet의 백엔드 서버로 프록시합니다. 그래서 사용자 브라우저는 백엔드 private IP를 직접 알 필요가 없습니다.

## 14. SSH 접속

베스천 서버 접속:

```bash
terraform output ssh_bastion_command
```

출력된 명령을 실행합니다.

Private backend 서버 접속:

```bash
terraform output ssh_backend_via_bastion_command
```

Private DB 서버 접속:

```bash
terraform output ssh_db_via_bastion_command
```

`-J` 옵션은 SSH ProxyJump입니다. 내 PC에서 베스천을 거쳐 private 서버로 접속할 때 사용합니다.

## 15. 상태 점검

웹 서버:

```bash
sudo tail -n 100 /var/log/lab11-init.log
sudo systemctl status nginx --no-pager
sudo nginx -t
curl -i http://localhost
curl -i http://localhost/backend-api/api/health
```

백엔드 서버:

```bash
sudo tail -n 100 /var/log/lab11-init.log
sudo systemctl status board-service-backend --no-pager
curl -i http://localhost:4000/api/health
```

DB 서버:

```bash
sudo tail -n 100 /var/log/lab11-init.log
sudo systemctl status mariadb --no-pager
sudo mariadb -u root -p -e "SHOW DATABASES;"
```

NCP Ubuntu 서버에서 IPv6가 비활성화된 경우 nginx 기본 설정의 `listen [::]:80` 때문에 nginx가 실패할 수 있습니다. 이 예제의 웹 설치 스크립트는 nginx 설정에서 IPv6 listen 줄을 제거합니다.

## 16. Init Script 재실행 주의

Init Script는 서버 최초 생성 시점에만 실행됩니다. 서버가 이미 만들어진 뒤 init script 내용을 수정했다면 기존 서버에는 자동 재실행되지 않습니다.

실습에서는 전체 삭제 후 다시 생성하는 것이 가장 단순합니다.

```bash
terraform destroy
terraform apply
```

서버만 교체해야 한다면 관련 서버와 Public IP를 같이 교체합니다.

```bash
terraform apply \
  -replace=ncloud_server.web \
  -replace=ncloud_public_ip.web
```

## 17. State 확인

Terraform은 `terraform.tfstate` 파일에 실제 리소스 상태를 기록합니다.

```bash
ls -la
terraform state list
```

주의:

- `terraform.tfstate`에는 리소스 ID와 민감 정보가 포함될 수 있습니다.
- 실무에서는 로컬 state 대신 Object Storage 같은 원격 backend를 사용합니다.
- 이 저장소에서는 `*.tfstate`, `*.tfvars`, `*.pem`을 Git에 올리지 않도록 `.gitignore`에 등록합니다.

## 18. 삭제

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

## 19. 실무 주의사항

- 인증키를 `.tf` 파일에 직접 쓰지 않습니다.
- `terraform.tfvars`는 Git에 올리지 않습니다.
- `terraform plan` 없이 `apply`를 바로 실행하지 않습니다.
- 운영 환경에서는 `destroy` 권한을 제한합니다.
- 여러 명이 함께 쓰는 프로젝트는 원격 backend와 state lock을 사용합니다.
- 수동으로 콘솔에서 리소스를 변경하면 Terraform state와 실제 인프라가 어긋날 수 있습니다.
- NAT Gateway와 Public IP는 비용이 발생할 수 있으므로 실습 후 삭제합니다.

## 20. 참고 문서

- Ncloud Terraform Provider: <https://registry.terraform.io/providers/NaverCloudPlatform/ncloud/latest/docs>
- Ncloud Provider GitHub: <https://github.com/NaverCloudPlatform/terraform-provider-ncloud>
- Terraform Provider 설정: <https://developer.hashicorp.com/terraform/language/providers>
