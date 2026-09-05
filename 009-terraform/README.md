# 009 Terraform 빠른 환경 구성

Terraform으로 Naver Cloud에 003 게시판 실습 환경을 한 번에 생성합니다.

```text
사용자 -> Public ALB -> Web(Private) -> Backend(Private) -> MariaDB(Private)
관리자 -> Bastion(Public) -> Web / Backend / DB
Private Server -> NAT Gateway -> apt, npm, GitHub Raw
```

Web, Backend, DB는 [`003-three tier web app`](../003-three%20tier%20web%20app/)의 설치 스크립트를 그대로 사용합니다. 전체 실행 설명과 문제 해결은 [GitBook 009 Terraform 교안](https://jangh-lee.github.io/cloud-infrastructure-lecture-example/labs/009-terraform/)에서 같은 순서로 확인할 수 있습니다.

## 네트워크

VPC는 `lab7-vpc`, CIDR은 `10.10.0.0/16`입니다.

| 구분 | Subnet 이름 | CIDR | Zone | Internet Gateway | 용도 |
| --- | --- | --- | --- | --- | --- |
| Public 1 | `lab7-pub-kr1` | `10.10.10.0/24` | KR-1 | Y | Bastion |
| Public 2 | `lab7-pub-kr2` | `10.10.20.0/24` | KR-2 | Y | NAT Gateway |
| Load Balancer | `lab7-lb-kr1` | `10.10.30.0/24` | KR-1 | Y | Public ALB 전용 |
| Private 1 | `lab7-pri-kr1` | `10.10.110.0/24` | KR-1 | N | Web, Backend |
| Private 2 | `lab7-pri-kr2` | `10.10.120.0/24` | KR-2 | N | DB |

Naver Cloud Load Balancer에는 `usage_type = "LOADB"`인 전용 Subnet이 필요하므로 제공된 4개 대역에 `10.10.30.0/24`를 추가합니다. Private 기본 Route Table에는 `0.0.0.0/0 -> lab7-natgw-kr2` 경로를 설정합니다.

## 주요 리소스

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

Bastion만 Public IP를 가지며 Web, Backend, DB는 Private IP만 사용합니다.

## ACG 규칙

| 대상 ACG | 접근 소스 | 포트 |
| --- | --- | --- |
| `lab7-bastion-acg` | 관리자 Public IP `/32` | TCP 22 |
| `lab7-web-acg` | LB Subnet `10.10.30.0/24` | TCP 80 |
| `lab7-web-acg` | Bastion ACG | TCP 22 |
| `lab7-backend-acg` | Web ACG | TCP 4000 |
| `lab7-backend-acg` | Bastion ACG | TCP 22 |
| `lab7-db-acg` | Backend ACG | TCP 3306 |
| `lab7-db-acg` | Bastion ACG | TCP 22 |

## 파일 구성

```text
examples/ncloud-basic
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

## 빠른 실행

```bash
cd "009-terraform/examples/ncloud-basic"
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars`에서 인증키, 관리자 Public IP, 서버 이미지 번호와 비밀번호를 수정합니다.

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

DB 비밀번호와 Login Key는 Terraform state에 저장됩니다. `terraform.tfstate`, `terraform.tfvars`, `lab7-key.pem`을 외부에 공유하지 않습니다.

```bash
terraform init
terraform fmt
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
```

`Apply complete!` 이후 서버 내부 Init Script가 끝날 때까지 약 3~10분 걸릴 수 있습니다.

## 접속 정보 Output

```bash
terraform output

terraform output -raw board_url
terraform output -raw ssh_bastion_command
terraform output -raw ssh_web_via_bastion_command
terraform output -raw ssh_backend_via_bastion_command
terraform output -raw ssh_db_via_bastion_command
```

IP, 네트워크, 로그 확인 명령도 출력합니다.

```bash
terraform output network_info
terraform output server_ip_addresses
terraform output verification_commands
terraform output admin_passwords
terraform output next_steps
```

`lab7-key.pem`은 SSH 개인키가 아니라 Naver Cloud 관리자 비밀번호 확인용 Login Key입니다. SSH 명령 실행 시 `admin_passwords`에 출력된 서버별 비밀번호를 입력합니다.

## 게시판 확인

```bash
BOARD_URL=$(terraform output -raw board_url)

curl -i "${BOARD_URL}healthz"
curl -i "${BOARD_URL}api/health"
curl -s "${BOARD_URL}api/posts"
```

브라우저에서 `board_url`을 열고 게시글 조회, 작성, 삭제가 모두 되면 `Public ALB -> Web -> Backend -> MariaDB` 경로가 검증된 것입니다.

게시판이 열리지 않으면 다음 output의 명령으로 `/var/log/lab7-init.log`를 확인합니다.

```bash
terraform output verification_commands
```

## 삭제

NAT Gateway, Public IP, ALB와 서버는 비용이 발생할 수 있으므로 실습이 끝나면 삭제합니다.

```bash
terraform destroy
terraform state list
```

## 참고 문서

- [Ncloud Terraform Provider](https://registry.terraform.io/providers/NaverCloudPlatform/ncloud/latest/docs)
- [Ncloud Subnet Resource](https://registry.terraform.io/providers/NaverCloudPlatform/ncloud/latest/docs/resources/subnet)
- [Ncloud Application Load Balancer](https://guide.ncloud-docs.com/docs/loadbalancer-application-vpc)
- [Ncloud ACG](https://guide.ncloud-docs.com/docs/server-acg-vpc)
