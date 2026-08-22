# 003 Cloud CLI

Ncloud CLI만 사용해 VPC, Subnet, ACG, Login Key, Server를 하나씩 생성하는 실습입니다.

이 예제는 자동화 스크립트로 한 번에 실행하지 않고, 각 리소스가 어떤 순서로 만들어지는지 직접 확인하면서 진행합니다. 서버 생성은 실제 과금 리소스를 만들 수 있으므로 실습 후 정리까지 진행합니다.

## 실습 목표

- Ncloud CLI 설치 및 인증 설정
- CLI 명령 구조 이해
- VPC 생성
- Network ACL 조회
- Public Subnet과 Private Subnet 생성
- ACG 생성 및 SSH inbound rule 추가
- Login Key 생성
- Server 생성 및 SSH 접속
- 생성한 리소스 정리

## 1. Ncloud CLI 설치

Naver Cloud CLI 다운로드 페이지에서 최신 CLI zip 파일을 받습니다.

```text
https://cli.ncloud-docs.com/docs/en/guide-clichange
```

Linux 서버 또는 작업 PC에서 압축을 풀고 `cli_linux` 폴더로 이동합니다.

```bash
unzip CLI_*.zip
cd CLI_*/cli_linux
./ncloud
```

아래와 비슷한 메시지가 나오면 CLI 자체는 실행되는 상태입니다.

```text
ncloud <command> [subcommand] help
```

현재 터미널에서 `ncloud` 명령을 바로 쓰려면 PATH를 추가합니다.

```bash
export PATH="$PWD:$PATH"
ncloud help
```

## 2. API 인증키 설정

Naver Cloud 콘솔에서 API 인증키를 준비합니다.

```text
마이페이지
계정관리
인증키 관리
신규 API 인증키 생성
```

CLI에 인증키를 설정합니다.

```bash
ncloud configure
```

입력 예시:

```text
Ncloud Access Key ID []: <access-key>
Ncloud Secret Access Key []: <secret-key>
Ncloud API URL (default:https://ncloud.apigw.ntruss.com) []:
```

프로필을 분리하려면:

```bash
ncloud configure --profile lecture
```

이후 명령에 `--profile lecture`를 붙입니다.

## 3. 기본 조회

Region 조회:

```bash
ncloud vserver getRegionList --output json
```

Zone 조회:

```bash
ncloud vserver getZoneList \
  --regionCode KR \
  --output json
```

서버 이미지 조회:

```bash
ncloud vserver getServerImageProductList \
  --regionCode KR \
  --output json
```

서버 스펙 조회:

```bash
ncloud vserver getServerProductList \
  --regionCode KR \
  --serverImageProductCode "SERVER_IMAGE_PRODUCT_CODE" \
  --output json
```

`SERVER_IMAGE_PRODUCT_CODE`와 `SERVER_PRODUCT_CODE`는 계정, 리전, 시점에 따라 달라질 수 있습니다. 조회 결과에서 실제 사용 가능한 값을 선택합니다.

## 4. VPC 생성

VPC를 생성합니다.

```bash
ncloud vpc createVpc \
  --regionCode KR \
  --vpcName cli-lab-vpc \
  --ipv4CidrBlock 10.0.0.0/16 \
  --output json
```

생성된 VPC 목록을 확인합니다.

```bash
ncloud vpc getVpcList \
  --regionCode KR \
  --output json
```

응답에서 `vpcNo`를 확인합니다. 이후 명령의 `VPC_NO` 자리에 넣습니다.

## 5. Network ACL 확인

Subnet 생성에는 Network ACL 번호가 필요합니다. VPC 생성 시 기본 Network ACL이 만들어지므로 목록에서 확인합니다.

```bash
ncloud vpc getNetworkAclList \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --output json
```

응답에서 `networkAclNo`를 확인합니다. 이후 명령의 `NETWORK_ACL_NO` 자리에 넣습니다.

## 6. Public Subnet 생성

서버에 공인 IP를 붙여 SSH 접속할 예정이므로 Public Subnet을 생성합니다.

```bash
ncloud vpc createSubnet \
  --regionCode KR \
  --zoneCode KR-1 \
  --vpcNo "VPC_NO" \
  --subnetName sub-lab3-pub-kr1 \
  --subnet 10.0.1.0/24 \
  --networkAclNo "NETWORK_ACL_NO" \
  --subnetTypeCode PUBLIC \
  --usageTypeCode GEN \
  --output json
```

응답에서 Public Subnet의 `subnetNo`를 확인합니다. 이후 서버 생성 명령의 `PUBLIC_SUBNET_NO` 자리에 넣습니다.

## 7. Private Subnet 생성

외부에서 직접 접속하지 않는 서버나 DB 같은 내부 리소스를 배치하기 위해 Private Subnet을 생성합니다.

```bash
ncloud vpc createSubnet \
  --regionCode KR \
  --zoneCode KR-1 \
  --vpcNo "VPC_NO" \
  --subnetName sub-lab3-pri-kr1 \
  --subnet 10.0.2.0/24 \
  --networkAclNo "NETWORK_ACL_NO" \
  --subnetTypeCode PRIVATE \
  --usageTypeCode GEN \
  --output json
```

생성된 Subnet 목록을 확인합니다.

```bash
ncloud vpc getSubnetList \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --output json
```

응답에서 Public Subnet과 Private Subnet이 모두 생성되었는지 확인합니다.

```text
sub-lab3-pub-kr1  10.0.1.0/24  PUBLIC
sub-lab3-pri-kr1  10.0.2.0/24  PRIVATE
```

## 8. ACG 생성

서버에 적용할 ACG를 생성합니다.

```bash
ncloud vserver createAccessControlGroup \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --accessControlGroupName cli-lab-acg \
  --accessControlGroupDescription "CLI lab SSH access" \
  --output json
```

ACG 목록을 확인합니다.

```bash
ncloud vserver getAccessControlGroupList \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --output json
```

응답에서 `accessControlGroupNo`를 확인합니다. 이후 명령의 `ACG_NO` 자리에 넣습니다.

## 9. ACG Inbound Rule 추가

SSH 접속을 위해 `TCP 22`를 엽니다.

강의장 또는 본인 IP만 허용하는 것을 권장합니다.

```bash
ncloud vserver addAccessControlGroupInboundRule \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --accessControlGroupNo "ACG_NO" \
  --accessControlGroupRuleList "protocolTypeCode='TCP', ipBlock='YOUR_PUBLIC_IP/32', portRange='22', accessControlGroupRuleDescription='SSH'" \
  --output json
```

실습 편의상 전체 허용이 필요하면 아래처럼 열 수 있습니다. 운영 환경에서는 권장하지 않습니다.

```bash
ncloud vserver addAccessControlGroupInboundRule \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --accessControlGroupNo "ACG_NO" \
  --accessControlGroupRuleList "protocolTypeCode='TCP', ipBlock='0.0.0.0/0', portRange='22', accessControlGroupRuleDescription='SSH lab only'" \
  --output json
```

002 init script로 `2200` 포트도 열 예정이면 추가합니다.

```bash
ncloud vserver addAccessControlGroupInboundRule \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --accessControlGroupNo "ACG_NO" \
  --accessControlGroupRuleList "protocolTypeCode='TCP', ipBlock='YOUR_PUBLIC_IP/32', portRange='2200', accessControlGroupRuleDescription='SSH 2200'" \
  --output json
```

## 10. Login Key 생성

서버 접속에 사용할 Login Key를 생성합니다.

개인키는 생성 응답에서 한 번만 확인할 수 있습니다. 반드시 안전하게 저장합니다.

```bash
ncloud vserver createLoginKey \
  --keyName cli-lab-key \
  --regionCode KR \
  --output json
```

`jq`가 있다면 바로 PEM 파일로 저장할 수 있습니다.

```bash
ncloud vserver createLoginKey \
  --keyName cli-lab-key \
  --regionCode KR \
  --output json \
  | jq -r '.createLoginKeyResponse.privateKey' > cli-lab-key.pem

chmod 400 cli-lab-key.pem
```

이미 생성한 키 목록 확인:

```bash
ncloud vserver getLoginKeyList \
  --pageNo 0 \
  --pageSize 10 \
  --regionCode KR \
  --output json
```

## 11. 서버 생성

서버를 생성합니다.

`PUBLIC_SUBNET_NO`, `SERVER_IMAGE_PRODUCT_CODE`, `SERVER_PRODUCT_CODE`는 앞에서 조회한 실제 값으로 바꿉니다. SSH 접속을 확인할 서버이므로 Public Subnet에 생성합니다.

```bash
ncloud vserver createServerInstances \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --subnetNo "PUBLIC_SUBNET_NO" \
  --networkInterfaceList "networkInterfaceOrder='0', accessControlGroupNoList=['ACG_NO']" \
  --serverImageProductCode "SERVER_IMAGE_PRODUCT_CODE" \
  --serverProductCode "SERVER_PRODUCT_CODE" \
  --serverName cli-lab-server \
  --loginKeyName cli-lab-key \
  --associateWithPublicIp true \
  --isProtectServerTermination false \
  --output json
```

002 init script를 콘솔에서 등록해 둔 경우 `--initScriptNo`를 추가할 수 있습니다.

```bash
ncloud vserver createServerInstances \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --subnetNo "PUBLIC_SUBNET_NO" \
  --networkInterfaceList "networkInterfaceOrder='0', accessControlGroupNoList=['ACG_NO']" \
  --serverImageProductCode "SERVER_IMAGE_PRODUCT_CODE" \
  --serverProductCode "SERVER_PRODUCT_CODE" \
  --serverName cli-lab-server \
  --loginKeyName cli-lab-key \
  --associateWithPublicIp true \
  --isProtectServerTermination false \
  --initScriptNo "INIT_SCRIPT_NO" \
  --output json
```

## 12. 서버 상태 확인

서버 목록:

```bash
ncloud vserver getServerInstanceList \
  --regionCode KR \
  --output json
```

특정 서버 상세:

```bash
ncloud vserver getServerInstanceDetail \
  --regionCode KR \
  --serverInstanceNo "SERVER_INSTANCE_NO" \
  --output json
```

서버가 `RUN` 상태가 되고 공인 IP가 할당될 때까지 기다립니다.

## 13. SSH 접속

기본 SSH:

```bash
ssh -i cli-lab-key.pem USERNAME@SERVER_PUBLIC_IP
```

002 init script로 `2200` 포트를 열었다면:

```bash
ssh -i cli-lab-key.pem -p 2200 USERNAME@SERVER_PUBLIC_IP
```

Ubuntu 계열 이미지는 사용자명이 보통 `root` 또는 이미지 안내에 따릅니다. 실습 이미지별 접속 계정은 콘솔의 서버 접속 가이드를 확인합니다.

## 14. 실습 정리

실습이 끝난 서버는 정지 후 반납합니다. 서버 이름과 서버 번호를 반드시 확인합니다.

서버 정지:

```bash
ncloud vserver stopServerInstances \
  --regionCode KR \
  --serverInstanceNoList '["SERVER_INSTANCE_NO"]' \
  --output json
```

서버 반납:

```bash
ncloud vserver terminateServerInstances \
  --regionCode KR \
  --serverInstanceNoList '["SERVER_INSTANCE_NO"]' \
  --output json
```

ACG 삭제:

```bash
ncloud vserver deleteAccessControlGroup \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --accessControlGroupNo "ACG_NO" \
  --output json
```

Private Subnet 삭제:

```bash
ncloud vpc deleteSubnet \
  --regionCode KR \
  --subnetNo "PRIVATE_SUBNET_NO" \
  --output json
```

Public Subnet 삭제:

```bash
ncloud vpc deleteSubnet \
  --regionCode KR \
  --subnetNo "PUBLIC_SUBNET_NO" \
  --output json
```

VPC 삭제:

```bash
ncloud vpc deleteVpc \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --output json
```

## 참고 문서

- Ncloud CLI 소개: <https://cli.ncloud-docs.com/docs/en/guide>
- Ncloud CLI 설치: <https://cli.ncloud-docs.com/docs/en/guide-clichange>
- Ncloud CLI 인증: <https://cli.ncloud-docs.com/docs/en/cli-auth>
- VPC 생성 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vpc-vpcmanagement-createvpc>
- Subnet 생성 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vpc-subnetmanagement-createsubnet>
- ACG 생성 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-acg-createaccesscontrolgroup>
- ACG inbound rule 추가 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-acg-addaccesscontrolgroupinboundrule>
- ACG 삭제 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-acg-deleteaccesscontrolgroup>
- Login Key 생성 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-server-loginkey-createloginkey>
- 서버 생성 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-server-createserverinstances>
