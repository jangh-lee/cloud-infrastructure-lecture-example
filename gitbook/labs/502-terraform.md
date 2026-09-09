# 502 Terraform 빠른 환경 구성

## 목표

Terraform으로 Naver Cloud에 003 게시판 실습 환경을 한 번에 생성합니다.

```text
사용자
  -> Public Application Load Balancer :80
  -> Web Server (Private KR-1) :80
  -> Backend Server (Private KR-1) :4000
  -> MariaDB Server (Private KR-2) :3306

관리자
  -> Bastion (Public KR-1) :22
  -> Web / Backend / DB

Private Server
  -> NAT Gateway (Public KR-2)
  -> apt, npm, GitHub Raw
```

Web, Backend, DB는 003의 설치 스크립트를 그대로 사용합니다. 별도의 Terraform 전용 게시판을 만들지 않으므로 003 코드가 개선되면 새로 생성하는 Terraform 환경에도 같은 코드가 적용됩니다.

## 1. 생성되는 네트워크

VPC 이름은 `lab7-vpc`, CIDR은 `10.10.0.0/16`입니다.

| 구분 | Subnet 이름 | CIDR | Zone | Internet Gateway | 용도 |
| --- | --- | --- | --- | --- | --- |
| Public 1 | `lab7-sub-pub-kr1` | `10.10.10.0/24` | KR-1 | Y | Bastion |
| Public 2 | `lab7-sub-pub-kr2` | `10.10.20.0/24` | KR-2 | Y | NAT Gateway |
| Load Balancer | `lab7-sub-lb-kr1` | `10.10.30.0/24` | KR-1 | Y | Public ALB 전용 |
| Private 1 | `lab7-sub-pri-kr1` | `10.10.110.0/24` | KR-1 | N | Web, Backend |
| Private 2 | `lab7-sub-pri-kr2` | `10.10.120.0/24` | KR-2 | N | DB |

!!! note "LB 전용 Subnet을 추가한 이유"
    Naver Cloud Load Balancer는 `usage_type = "LOADB"`인 전용 Subnet이 필요합니다. 일반 Public Subnet이나 NAT Gateway Subnet을 ALB에 같이 사용할 수 없으므로 `10.10.30.0/24`를 추가했습니다.

Private 기본 Route Table에는 다음 경로가 추가됩니다.

| 목적지 | Target Type | Target |
| --- | --- | --- |
| `0.0.0.0/0` | `NATGW` | `lab7-natgw-kr2` |

## 2. 생성되는 주요 리소스

| 구분 | 이름 |
| --- | --- |
| VPC | `lab7-vpc` |
| NAT Gateway | `lab7-natgw-kr2` |
| Bastion | `lab7-bastion` |
| Web Server | `lab7-web` |
| Backend Server | `lab7-backend` |
| DB Server | `lab7-db` |
| Application Load Balancer | `lab7-web-alb` |
| Target Group | `lab7-web-tg` |
| Login Key | `lab7-key` |

서버는 시간 요금제 `MTRAT`로 생성되며 Bastion만 Public IP를 가집니다. Web, Backend, DB는 Private IP만 사용합니다.

## 3. ACG 규칙

| 대상 ACG | 방향 | 접근 소스 | 포트 | 목적 |
| --- | --- | --- | --- | --- |
| `lab7-bastion-acg` | Inbound | 관리자 Public IP `/32` | TCP 22 | Bastion SSH |
| `lab7-web-acg` | Inbound | `10.10.30.0/24` | TCP 80 | ALB에서 Web 호출 |
| `lab7-web-acg` | Inbound | Bastion ACG | TCP 22 | Web 관리 |
| `lab7-backend-acg` | Inbound | Web ACG | TCP 4000 | API 호출 |
| `lab7-backend-acg` | Inbound | Bastion ACG | TCP 22 | Backend 관리 |
| `lab7-db-acg` | Inbound | Backend ACG | TCP 3306 | MariaDB 연결 |
| `lab7-db-acg` | Inbound | Bastion ACG | TCP 22 | DB 관리 |

각 ACG의 Outbound TCP/UDP는 패키지 설치와 응답 통신을 위해 `0.0.0.0/0`으로 허용합니다. Web, Backend, DB의 서비스 포트는 인터넷에 직접 공개하지 않습니다.

## 4. Terraform 파일

```text
502-terraform/examples/ncloud-basic
├── versions.tf
├── variables.tf
├── main.tf
├── network.tf
├── security.tf
├── load-balancer.tf
├── init-scripts.tf
├── compute.tf
├── outputs.tf
├── scripts/setup-internal-ssh.sh
├── templates/bastion-init.sh.tftpl
└── terraform.tfvars.example
```

[GitHub에서 Terraform 예제 코드 전체 보기](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/tree/main/502-terraform/examples/ncloud-basic)

[Naver Cloud Terraform Provider 공식 문서](https://registry.terraform.io/providers/NaverCloudPlatform/ncloud/latest/docs)

| 파일 | 역할 |
| --- | --- |
| [`network.tf`](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/blob/main/502-terraform/examples/ncloud-basic/network.tf) | VPC, Subnet, NAT Gateway, Route |
| [`security.tf`](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/blob/main/502-terraform/examples/ncloud-basic/security.tf) | Bastion, Web, Backend, DB ACG와 Rule |
| [`load-balancer.tf`](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/blob/main/502-terraform/examples/ncloud-basic/load-balancer.tf) | Public ALB, Target Group, Listener |
| [`init-scripts.tf`](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/blob/main/502-terraform/examples/ncloud-basic/init-scripts.tf) | 003 DB, Backend, Web 자동 설치 |
| [`compute.tf`](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/blob/main/502-terraform/examples/ncloud-basic/compute.tf) | Login Key, NIC, 서버, Bastion Public IP |
| [`outputs.tf`](https://github.com/jangh-lee/cloud-infrastructure-lecture-example/blob/main/502-terraform/examples/ncloud-basic/outputs.tf) | URL, IP, SSH, 로그 확인 명령 |

## 5. Terraform 설치 확인

자신의 실습 PC 운영체제에 맞는 터미널에서 진행합니다. Windows는 **PowerShell**, macOS와 Ubuntu는 **Terminal**을 사용합니다.

### Windows PowerShell

PowerShell을 **관리자 권한**으로 열고 Git과 Terraform을 설치합니다.

```powershell
winget install --exact --id Git.Git
winget install --exact --id Hashicorp.Terraform
```

설치가 끝나면 PowerShell을 닫았다가 다시 열고 버전을 확인합니다.

```powershell
git --version
terraform version
ssh -V
```

`git version`, `Terraform v...`, `OpenSSH_for_Windows...`가 각각 표시되면 통과입니다. `ssh`를 찾을 수 없다면 Windows 설정의 **시스템 > 선택적 기능**에서 `OpenSSH 클라이언트`를 설치합니다.

### Ubuntu

```bash
terraform version
```

Ubuntu에 Terraform이 없다면 설치합니다.

```bash
sudo apt-get update
sudo apt-get install -y wget gpg unzip
wget -O- https://apt.releases.hashicorp.com/gpg |
  sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(. /etc/os-release && echo "$VERSION_CODENAME") main" |
  sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update
sudo apt-get install -y terraform
```

### macOS

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

## 6. 예제 준비

### Ubuntu / macOS

```bash
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git || true
cd ~/cloud-infrastructure-lecture-example
git pull --ff-only origin main
cd "502-terraform/examples/ncloud-basic"

cp terraform.tfvars.example terraform.tfvars
```

현재 관리자 Public IP를 확인합니다.

```bash
curl -4 https://ifconfig.me
```

### Windows PowerShell

```powershell
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git
Set-Location ".\cloud-infrastructure-lecture-example\502-terraform\examples\ncloud-basic"
Copy-Item .\terraform.tfvars.example .\terraform.tfvars

(Invoke-RestMethod -Uri "https://ifconfig.me/ip").Trim()
notepad .\terraform.tfvars
```

이미 저장소를 내려받았다면 `git clone` 대신 다음 명령으로 최신 코드를 받습니다.

```powershell
Set-Location ".\cloud-infrastructure-lecture-example"
git pull --ff-only origin main
Set-Location ".\502-terraform\examples\ncloud-basic"
if (-not (Test-Path .\terraform.tfvars)) { Copy-Item .\terraform.tfvars.example .\terraform.tfvars }
notepad .\terraform.tfvars
```

!!! tip "Windows 경로 확인"
    `Get-Location`의 마지막 경로가 `502-terraform\examples\ncloud-basic`이고 `Test-Path .\main.tf` 결과가 `True`이면 올바른 폴더입니다.

운영체제와 관계없이 `terraform.tfvars`에 다음 값을 입력합니다.

```hcl
access_key   = "YOUR_ACCESS_KEY"
secret_key   = "YOUR_SECRET_KEY"
my_public_ip = "YOUR_PUBLIC_IP/32"

region      = "KR"
zone_kr1    = "KR-1"
zone_kr2    = "KR-2"
name_prefix = "lab7"

server_image_number = "104630229"
server_spec_code     = "s2-g3a"

db_root_password  = "ChangeRootPass123!"
board_db_password = "ChangeBoardPass123!"
```

`server_image_number`와 `server_spec_code`는 계정에서 사용할 수 있는 Ubuntu G3/KVM 상품 값으로 바꿀 수 있습니다. `terraform.tfvars`, `*.tfstate`, `*.pem`은 `.gitignore`에 포함되어 GitHub에 올라가지 않습니다.

!!! warning "State와 Login Key 보관"
    DB 비밀번호와 Login Key는 Terraform state에 저장됩니다. 실습 PC의 `terraform.tfstate`, `terraform.tfvars`, `lab7-key.pem`을 외부에 공유하지 않고 실습 종료 후 안전하게 정리합니다.

## 7. 생성

초기화, 포맷, 검증, 계획 확인, 생성을 순서대로 실행합니다.

```console
terraform init
terraform fmt
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

`Apply complete!`가 표시되면 클라우드 리소스 생성은 완료된 것입니다. 각 서버의 Init Script는 서버 내부에서 계속 실행될 수 있으므로 게시판이 열리기까지 약 3~10분 정도 기다립니다.

!!! note "Windows에서도 명령은 같습니다"
    위 다섯 줄은 PowerShell에 그대로 복사해 실행합니다. `tfplan`은 실행 파일이 아니라 Terraform이 생성한 실행 계획 파일입니다.

## 8. 접속 정보 Output

전체 접속 정보를 확인합니다.

```bash
terraform output
```

필요한 값만 한 줄로 확인할 수도 있습니다.

```bash
terraform output -raw board_url
terraform output -raw bastion_public_ip
terraform output -raw web_private_ip
terraform output -raw backend_private_ip
terraform output -raw db_private_ip

terraform output -raw ssh_bastion_command
terraform output -raw ssh_web_via_bastion_command
terraform output -raw ssh_backend_via_bastion_command
terraform output -raw ssh_db_via_bastion_command
```

묶음형 정보와 초기화 확인 명령:

```bash
terraform output network_info
terraform output server_ip_addresses
terraform output ssh_commands
terraform output verification_commands
terraform output admin_passwords
terraform output next_steps
```

`admin_passwords`는 폐기 가능한 강의 실습 환경의 편의를 위해 표시합니다. 실제 운영 구성에서는 비밀번호를 일반 output으로 노출하지 않습니다.

Naver Cloud의 `lab7-key.pem`은 SSH 개인키가 아니라 관리자 비밀번호 확인에 사용하는 Login Key입니다. 접속할 때는 `admin_passwords`에 출력된 각 서버 비밀번호를 입력합니다.

## 9. 게시판 확인

ALB를 통한 전체 경로를 확인합니다.

### Ubuntu / macOS

```bash
BOARD_URL=$(terraform output -raw board_url)

curl -i "${BOARD_URL}healthz"
curl -i "${BOARD_URL}api/health"
curl -s "${BOARD_URL}api/posts"
```

### Windows PowerShell

PowerShell의 `curl` 별칭 대신 실제 curl 프로그램인 `curl.exe`를 사용합니다.

```powershell
$BOARD_URL = terraform output -raw board_url

curl.exe -i "${BOARD_URL}healthz"
curl.exe -i "${BOARD_URL}api/health"
curl.exe -s "${BOARD_URL}api/posts"

Start-Process $BOARD_URL
```

브라우저에서는 `terraform output -raw board_url`로 출력된 주소를 엽니다. 게시글 조회, 작성, 삭제가 모두 되면 다음 경로가 검증된 것입니다.

```text
Public ALB -> Web -> Backend -> MariaDB
```

## 10. Bastion에서 내부 서버로 SSH 접속

내 PC에서 Bastion으로 로그인한 뒤, Bastion에서 Web / Backend / DB로 이동하는 실습입니다. Bastion Init Script가 끝나면 `setup-internal-ssh`와 `web`, `backend`, `db` SSH 별칭을 사용할 수 있습니다.

1. 내 PC에서 비밀번호와 접속 명령을 확인합니다. 출력된 SSH 명령을 복사해 실행하고 **Bastion 비밀번호**를 입력합니다. Windows PowerShell에서도 같은 명령을 사용합니다.

   ```bash
   terraform output admin_passwords
   terraform output -raw ssh_bastion_command
   terraform output -raw internal_ssh_setup
   ```

2. **Bastion에서** 최초 한 번 실행합니다.

   ```bash
   setup-internal-ssh
   ```

   내부 접속 전용 Ed25519 키를 `/root/.ssh/lab_internal`에 생성하고, `ssh-copy-id`로 공개키를 Web → Backend → DB 순서로 등록합니다. 각 서버의 SSH 호스트 키 지문을 확인하고 해당 서버의 **Ncloud 관리자 비밀번호**를 입력합니다. DB 서버에도 MariaDB 비밀번호가 아닌 서버 관리자 비밀번호를 입력합니다.

3. **Bastion에서** 내부 서버로 이동하고 `hostname`으로 위치를 확인합니다.

   ```bash
   ssh web
   hostname
   exit

   ssh backend
   hostname
   exit

   ssh db
   hostname
   exit
   ```

   공개키 등록 후에는 서버 비밀번호 입력 없이 접속합니다. `exit`는 Bastion으로 돌아옵니다. 위 별칭은 Bastion의 root 계정에 설정되므로 내 PC에서 실행하지 않습니다.

키는 재실행해도 유지되며, 이미 등록된 공개키는 건너뜁니다. 실패한 서버만 다시 등록하려면 `setup-internal-ssh web`처럼 실행합니다. 키에는 실습 편의를 위해 암호를 설정하지 않으며, 개인키는 Bastion 안에만 생성되어 Terraform state나 Init Script에 포함되지 않습니다. Bastion을 재생성하면 새 키의 공개키 등록이 필요합니다.

이 설정은 **새 서버의 최초 부팅 시** 적용됩니다. 기존 Bastion에는 Terraform Init Script 수정만으로 자동 적용되지 않습니다. 기존 환경은 생성된 Bastion 초기화 스크립트의 설정을 별도로 적용하거나, 필요한 데이터를 보존한 뒤 서버 재생성 계획을 검토합니다.

기존 `ssh_*_via_bastion_command` output은 내 PC에서 사용하는 비밀번호 기반 ProxyJump 명령으로 계속 제공됩니다.

003의 최신 Web 설치 스크립트에는 `board-notice` 명령도 포함됩니다. Bastion에서 `ssh web`으로 이동해 [003 공지 및 점검 화면](003-three-tier-web-app.md#notice-maintenance)을 설정할 수 있습니다. [402 마이그레이션 교안](402-cloud-db-migration.md#0)에는 복사해서 사용하는 사전 공지와 점검 전환 명령이 있습니다.

## 11. 초기화 상태 확인

게시판이 아직 열리지 않으면 먼저 자동 생성된 확인 명령을 봅니다.

```bash
terraform output verification_commands
```

각 서버에서 공통으로 확인할 로그는 `/var/log/lab7-init.log`입니다.

```bash
sudo tail -n 100 /var/log/lab7-init.log
```

서비스별 확인:

```bash
# Web
sudo systemctl status nginx --no-pager
curl -i http://127.0.0.1/healthz
curl -i http://127.0.0.1/api/health

# Backend
sudo systemctl status board-service-backend --no-pager
curl -i http://127.0.0.1:4000/api/health

# DB
sudo systemctl status mariadb --no-pager
sudo mariadb -u root -p -e "SHOW DATABASES;"
```

## 12. 문제 해결

| 증상 | 확인 |
| --- | --- |
| Server Image 오류 | 콘솔에서 사용 가능한 Ubuntu G3/KVM 이미지 번호와 사양 코드 확인 |
| Private 서버 패키지 설치 실패 | NAT Gateway 상태와 Private Route `0.0.0.0/0 -> NATGW` 확인 |
| ALB Target이 `미사용` 또는 `DOWN` | Web Init 로그, Nginx, Web ACG의 LB Subnet `10.10.30.0/24:80` 확인 |
| Backend Health `ETIMEDOUT` | DB 서버 상태와 DB ACG의 Backend ACG `3306` 허용 확인 |
| 게시판 URL이 처음에는 `503` | Init Script 완료 전일 수 있으므로 Web 로그와 Target Health를 확인 |
| SSH 실패 | 현재 관리자 Public IP와 `my_public_ip/32`, `admin_passwords`의 서버별 비밀번호 확인. Bastion에서 `setup-internal-ssh web`으로 실패한 서버만 재등록 |
| `setup-internal-ssh: command not found` | Bastion Init Script 완료 여부와 `/var/log/lab7-init.log` 확인. 기존 서버는 Init Script 수정만으로 갱신되지 않음 |

Init Script는 서버가 처음 만들어질 때 한 번만 실행됩니다. 코드를 수정한 뒤 다시 설치하려면 전체 환경을 재생성하는 방식이 가장 단순합니다.

```bash
terraform destroy -auto-approve
terraform apply -auto-approve
```

## 13. 삭제

NAT Gateway, Public IP, ALB와 서버는 비용이 발생할 수 있으므로 실습이 끝나면 삭제합니다.

```console
terraform destroy
terraform state list
```

`terraform state list`에 아무것도 나오지 않으면 Terraform이 관리하던 실습 리소스가 삭제된 것입니다.

## 공식 문서

- [Ncloud Terraform Provider](https://registry.terraform.io/providers/NaverCloudPlatform/ncloud/latest/docs)
- [Ncloud Subnet Resource](https://registry.terraform.io/providers/NaverCloudPlatform/ncloud/latest/docs/resources/subnet)
- [Ncloud Application Load Balancer](https://guide.ncloud-docs.com/docs/loadbalancer-application-vpc)
- [Ncloud ACG](https://guide.ncloud-docs.com/docs/server-acg-vpc)
- [HashiCorp Terraform 설치](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli)
- [Microsoft OpenSSH for Windows](https://learn.microsoft.com/windows-server/administration/openssh/openssh_install_firstuse)
