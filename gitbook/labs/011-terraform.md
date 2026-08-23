# 011 Terraform

## 목표

Terraform으로 Naver Cloud 리소스를 코드로 생성하고 삭제합니다.

CLI 실습에서는 명령을 하나씩 실행했습니다. Terraform 실습에서는 원하는 인프라 상태를 `.tf` 파일로 선언하고, Terraform이 생성 순서와 삭제 순서를 계산하게 합니다.

## 실습 폴더

```text
011-terraform/examples/ncloud-basic
```

## 생성 리소스

| 리소스 | 이름 |
| --- | --- |
| VPC | `vpc-lab11` |
| Public Subnet | `sub-lab11-pub-kr1` |
| Private Subnet | `sub-lab11-pri-kr1` |
| ACG | `lab11-acg` |
| Login Key | `key-lab11` |
| Init Script | `init-lab11-nginx` |
| Server | `svr-lab11-web-kr1` |

서버는 시간 요금제로 생성합니다.

```hcl
fee_system_type_code = "MTRAT"
```

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
cd "011-terraform/examples/ncloud-basic"
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
terraform output server_instance_no
terraform output public_ip
terraform output http_url
```

관리자 비밀번호는 sensitive output이라 일반 `terraform output` 화면에서는 숨겨집니다. 직접 확인할 때만 아래 명령을 사용합니다.

```bash
terraform output -raw admin_password
```

브라우저 접속:

```text
http://PUBLIC_IP/
```

Ncloud Terraform provider는 `ncloud_init_script.content`에 HTML 태그가 들어가면 콘솔 저장 과정에서 일부 태그를 필터링해 Terraform state 비교가 깨질 수 있습니다. 그래서 이 예제의 init script는 HTML 태그 없이 단순 텍스트 페이지를 생성합니다.

아래 오류가 나오면 init script 내용에 필터링되는 태그가 들어간 경우입니다.

```text
Provider produced inconsistent result after apply
```

이 경우 init script 내용에서 HTML/XML 태그를 제거하고 다시 실행합니다.

```bash
terraform apply
```

nginx 접속이 안 되면 먼저 SSH로 서버에 접속해 init script 로그와 서비스 상태를 확인합니다.

```bash
ssh -i key-lab11.pem root@PUBLIC_IP
sudo tail -n 100 /var/log/lab11-init.log
sudo systemctl status nginx --no-pager
sudo ss -tulpen | grep ':80'
curl -i http://localhost
```

확인 순서:

1. `terraform output public_ip`의 IP로 접속 중인지 확인합니다.
2. ACG에 `80/tcp` inbound가 있는지 확인합니다.
3. 서버 내부에서 `curl -i http://localhost`가 되는지 확인합니다.
4. `/var/log/lab11-init.log`에서 `apt-get`, `nginx` 설치 실패가 있는지 확인합니다.

Init Script는 서버 최초 생성 시점에만 실행됩니다. 서버가 이미 만들어진 뒤 init script 내용을 수정했다면 기존 서버에는 자동 재실행되지 않습니다. 실습에서는 아래처럼 서버를 교체하거나 전체 삭제 후 다시 생성합니다.

```bash
terraform apply -replace=ncloud_server.web
```

또는:

```bash
terraform destroy
terraform apply
```

## 9. State 확인

```bash
terraform state list
ls -la
```

`terraform.tfstate`는 Terraform이 관리 중인 리소스 상태를 기록합니다. 실무에서는 Object Storage 같은 원격 backend와 state lock을 사용합니다.

## 10. 삭제

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
- 콘솔에서 수동 변경하면 Terraform state와 실제 리소스가 어긋날 수 있습니다.

## 참고 문서

- Ncloud Terraform Provider: <https://registry.terraform.io/providers/NaverCloudPlatform/ncloud/latest/docs>
- Ncloud Provider GitHub: <https://github.com/NaverCloudPlatform/terraform-provider-ncloud>
- Terraform Provider 설정: <https://developer.hashicorp.com/terraform/language/providers>
