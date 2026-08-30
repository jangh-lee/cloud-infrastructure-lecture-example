# 009 Terraform

## 목표

Terraform으로 Naver Cloud 리소스를 코드로 생성하고 삭제합니다.

이 실습에서는 003번 게시판 예제를 베스천 포함 3-tier 구조로 자동 생성합니다.

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

## 생성 리소스

| 리소스 | 이름 |
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

Private subnet의 백엔드/DB 서버도 패키지 설치와 GitHub 다운로드가 필요하므로 NAT Gateway를 같이 생성합니다.

## 1. Terraform 설치 확인

```bash
terraform version
```

Ubuntu에서 설치:

```bash
sudo apt-get update
sudo apt-get install -y wget gpg unzip
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(. /etc/os-release && echo "$VERSION_CODENAME") main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update
sudo apt-get install -y terraform
```

macOS:

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

## 2. 예제 폴더 이동

```bash
cd "009-terraform/examples/ncloud-basic"
```

## 3. 입력값 준비

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

`terraform.tfvars`, `terraform.tfstate`, `.pem` 파일은 Git에 올리지 않습니다.

## 4. 초기화

```bash
terraform init
```

Provider 플러그인을 다운로드하고 `.terraform` 디렉터리를 만듭니다.

## 5. 포맷과 문법 확인

```bash
terraform fmt
terraform validate
```

## 6. 생성 계획 확인

```bash
terraform plan
```

주요 표시:

| 표시 | 의미 |
| --- | --- |
| `+ create` | 새로 생성 |
| `~ update` | 변경 |
| `- destroy` | 삭제 |
| `-/+ replace` | 삭제 후 재생성 |

## 7. 생성

```bash
terraform apply
```

확인 메시지가 나오면 `yes`를 입력합니다.

자동 승인:

```bash
terraform apply -auto-approve
```

## 8. 결과 확인

```bash
terraform output
terraform output http_url
terraform output bastion_public_ip
terraform output web_public_ip
terraform output backend_private_ip
terraform output db_private_ip
```

접속 명령도 output으로 확인합니다.

```bash
terraform output ssh_bastion_command
terraform output ssh_backend_via_bastion_command
terraform output ssh_db_via_bastion_command
```

관리자 비밀번호도 실습 편의를 위해 output에 보이도록 설정했습니다.

```bash
terraform output admin_passwords
```

실무에서는 비밀번호를 output에 그대로 노출하지 않는 것이 맞지만, 강의 실습에서는 접속 흐름을 단순하게 만들기 위해 보이게 했습니다.

## 9. 게시판 접속

브라우저에서 output의 `http_url`로 접속합니다.

```bash
terraform output http_url
```

```text
http://WEB_PUBLIC_IP/
```

웹 서버는 `/backend-api/` 요청을 private subnet의 백엔드 서버로 프록시합니다. 사용자 브라우저는 백엔드 private IP에 직접 접근하지 않습니다.

## 10. SSH 접속

베스천 서버:

```bash
terraform output ssh_bastion_command
```

Private backend 서버:

```bash
terraform output ssh_backend_via_bastion_command
```

Private DB 서버:

```bash
terraform output ssh_db_via_bastion_command
```

`-J` 옵션은 SSH ProxyJump입니다. 내 PC에서 베스천을 거쳐 private 서버로 접속할 때 사용합니다.

## 11. 상태 점검

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
sudo systemctl status chapter3-backend --no-pager
curl -i http://localhost:4000/api/health
```

DB 서버:

```bash
sudo tail -n 100 /var/log/lab11-init.log
sudo systemctl status mariadb --no-pager
sudo mariadb -u root -p -e "SHOW DATABASES;"
```

## 12. Init Script 재실행 주의

Init Script는 서버 최초 생성 시점에만 실행됩니다. 서버가 이미 만들어진 뒤 init script 내용을 수정했다면 기존 서버에는 자동 재실행되지 않습니다.

전체 삭제 후 다시 생성하는 것이 가장 단순합니다.

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

## 13. State 확인

```bash
terraform state list
ls -la
```

`terraform.tfstate`는 Terraform이 관리 중인 리소스 상태를 기록합니다. 실무에서는 Object Storage 같은 원격 backend와 state lock을 사용합니다.

## 14. 삭제

실습이 끝나면 반드시 삭제합니다.

```bash
terraform destroy
```

자동 승인:

```bash
terraform destroy -auto-approve
```

삭제 후 확인:

```bash
terraform state list
```

아무것도 출력되지 않으면 Terraform이 관리하던 리소스가 모두 삭제된 상태입니다.

## 주의사항

- 인증키를 `.tf` 파일에 직접 쓰지 않습니다.
- `terraform.tfvars`는 Git에 올리지 않습니다.
- 운영 환경에서는 `terraform plan`을 먼저 확인합니다.
- `destroy`는 실제 리소스를 삭제하므로 실습 리소스인지 반드시 확인합니다.
- NAT Gateway와 Public IP는 비용이 발생할 수 있으므로 실습 후 삭제합니다.
- 콘솔에서 수동 변경하면 Terraform state와 실제 리소스가 어긋날 수 있습니다.

## 참고 문서

- Ncloud Terraform Provider: <https://registry.terraform.io/providers/NaverCloudPlatform/ncloud/latest/docs>
- Ncloud Provider GitHub: <https://github.com/NaverCloudPlatform/terraform-provider-ncloud>
- Terraform Provider 설정: <https://developer.hashicorp.com/terraform/language/providers>
