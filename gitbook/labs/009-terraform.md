# 009 Terraform 빠른 환경 구성

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
009-terraform/examples/ncloud-basic
├── versions.tf
├── variables.tf
├── main.tf
├── network.tf
├── security.tf
├── load-balancer.tf
├── init-scripts.tf
├── compute.tf
├── outputs.tf
└── terraform.tfvars.example
```

| 파일 | 역할 |
| --- | --- |
| `network.tf` | VPC, Subnet, NAT Gateway, Route |
| `security.tf` | Bastion, Web, Backend, DB ACG와 Rule |
| `load-balancer.tf` | Public ALB, Target Group, Listener |
| `init-scripts.tf` | 003 DB, Backend, Web 자동 설치 |
| `compute.tf` | Login Key, NIC, 서버, Bastion Public IP |
| `outputs.tf` | URL, IP, SSH, 로그 확인 명령 |

## 5. Terraform 설치 확인

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

macOS:

```bash
brew tap hashicorp/tap
brew install hashicorp/tap/terraform
```

## 6. 예제 준비

```bash
git clone https://github.com/jangh-lee/cloud-infrastructure-lecture-example.git || true
cd ~/cloud-infrastructure-lecture-example
git pull --ff-only origin main
cd "009-terraform/examples/ncloud-basic"

cp terraform.tfvars.example terraform.tfvars
```

현재 관리자 Public IP를 확인합니다.

```bash
curl -4 https://ifconfig.me
```

`terraform.tfvars`를 열어 다음 값을 수정합니다.

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

```bash
terraform init
terraform fmt
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

`Apply complete!`가 표시되면 클라우드 리소스 생성은 완료된 것입니다. 각 서버의 Init Script는 서버 내부에서 계속 실행될 수 있으므로 게시판이 열리기까지 약 3~10분 정도 기다립니다.

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

```bash
BOARD_URL=$(terraform output -raw board_url)

curl -i "${BOARD_URL}healthz"
curl -i "${BOARD_URL}api/health"
curl -s "${BOARD_URL}api/posts"
```

브라우저에서는 `terraform output -raw board_url`로 출력된 주소를 엽니다. 게시글 조회, 작성, 삭제가 모두 되면 다음 경로가 검증된 것입니다.

```text
Public ALB -> Web -> Backend -> MariaDB
```

## 10. SSH 접속

명령을 출력한 뒤 그대로 복사해 실행합니다.

```bash
terraform output -raw ssh_bastion_command
terraform output -raw ssh_web_via_bastion_command
terraform output -raw ssh_backend_via_bastion_command
terraform output -raw ssh_db_via_bastion_command
```

`-J`는 내 PC에서 Bastion을 거쳐 Private 서버에 접속하는 SSH ProxyJump 옵션입니다.

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
| SSH 실패 | 현재 관리자 Public IP와 `my_public_ip/32`, `admin_passwords`의 서버별 비밀번호 확인 |

Init Script는 서버가 처음 만들어질 때 한 번만 실행됩니다. 코드를 수정한 뒤 다시 설치하려면 전체 환경을 재생성하는 방식이 가장 단순합니다.

```bash
terraform destroy -auto-approve
terraform apply -auto-approve
```

## 13. 삭제

NAT Gateway, Public IP, ALB와 서버는 비용이 발생할 수 있으므로 실습이 끝나면 삭제합니다.

```bash
terraform destroy
terraform state list
```

`terraform state list`에 아무것도 나오지 않으면 Terraform이 관리하던 실습 리소스가 삭제된 것입니다.

## 공식 문서

- [Ncloud Terraform Provider](https://registry.terraform.io/providers/NaverCloudPlatform/ncloud/latest/docs)
- [Ncloud Subnet Resource](https://registry.terraform.io/providers/NaverCloudPlatform/ncloud/latest/docs/resources/subnet)
- [Ncloud Application Load Balancer](https://guide.ncloud-docs.com/docs/loadbalancer-application-vpc)
- [Ncloud ACG](https://guide.ncloud-docs.com/docs/server-acg-vpc)
