# 003 Cloud CLI

Ncloud CLI로 VPC, Public/Private Subnet, ACG, Login Key, Server를 순서대로 생성하는 실습입니다.

명령마다 리소스 번호를 다시 복사하지 않도록, Linux/macOS는 shell 변수, Windows는 PowerShell 변수를 사용합니다. 변수는 현재 터미널 세션에만 저장하는 방식을 권장합니다.

## 실습 목표

- Ncloud CLI 설치 및 인증 설정
- OS별 CLI 변수 사용법 이해
- VPC 생성
- Public Subnet과 Private Subnet 생성
- ACG 생성 및 SSH inbound rule 추가
- Login Key 생성
- Server 생성 및 SSH 접속
- 생성한 리소스 정리

## 1. Ncloud CLI 설치

Ncloud CLI 다운로드:

```text
https://cli.ncloud-docs.com/docs/en/guide-clichange
```

Linux/macOS:

```bash
unzip CLI_*.zip
cd CLI_*/cli_linux
export PATH="$PWD:$PATH"
ncloud help
```

Windows PowerShell:

```powershell
Expand-Archive .\CLI_*.zip
cd .\CLI_*\cli_windows
.\ncloud.exe help
```

Windows에서 현재 PowerShell 세션에서만 바로 실행하려면:

```powershell
$env:Path = "$PWD;$env:Path"
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

기본 프로필:

```bash
ncloud configure
```

별도 프로필:

```bash
ncloud configure --profile lecture
```

프로필을 사용한다면 이후 명령에 `--profile lecture`를 추가합니다.

## 3. 공통 변수 설정

Linux/macOS:

```bash
REGION_CODE="KR"
ZONE_CODE="KR-1"

VPC_NAME="vpc-lab3"
VPC_CIDR="10.0.0.0/16"

PUBLIC_SUBNET_NAME="sub-lab3-pub-kr1"
PUBLIC_SUBNET_CIDR="10.0.1.0/24"

PRIVATE_SUBNET_NAME="sub-lab3-pri-kr1"
PRIVATE_SUBNET_CIDR="10.0.2.0/24"

ACG_NAME="lab3-acg"
LOGIN_KEY_NAME="key-lab3"
SERVER_NAME="svr-lab3-web-kr1"

MY_PUBLIC_IP="YOUR_PUBLIC_IP/32"
```

Windows PowerShell:

```powershell
$REGION_CODE = "KR"
$ZONE_CODE = "KR-1"

$VPC_NAME = "vpc-lab3"
$VPC_CIDR = "10.0.0.0/16"

$PUBLIC_SUBNET_NAME = "sub-lab3-pub-kr1"
$PUBLIC_SUBNET_CIDR = "10.0.1.0/24"

$PRIVATE_SUBNET_NAME = "sub-lab3-pri-kr1"
$PRIVATE_SUBNET_CIDR = "10.0.2.0/24"

$ACG_NAME = "lab3-acg"
$LOGIN_KEY_NAME = "key-lab3"
$SERVER_NAME = "svr-lab3-web-kr1"

$MY_PUBLIC_IP = "YOUR_PUBLIC_IP/32"
```

`MY_PUBLIC_IP`에는 본인 또는 강의장 공인 IP를 넣습니다. 실습 편의상 전체 허용이 필요하면 `0.0.0.0/0`을 넣을 수 있지만 운영 환경에서는 권장하지 않습니다.

## 4. 기본 조회

Region:

```bash
ncloud vserver getRegionList --output json
```

Zone:

```bash
ncloud vserver getZoneList \
  --regionCode "$REGION_CODE" \
  --output json
```

PowerShell:

```powershell
ncloud vserver getZoneList `
  --regionCode $REGION_CODE `
  --output json
```

서버 이미지:

```bash
ncloud vserver getServerImageProductList \
  --regionCode "$REGION_CODE" \
  --output json
```

PowerShell:

```powershell
ncloud vserver getServerImageProductList `
  --regionCode $REGION_CODE `
  --output json
```

Ubuntu 이미지만 보기:

Linux/macOS:

```bash
ncloud vserver getServerImageProductList \
  --regionCode "$REGION_CODE" \
  --output json \
  | jq -r '.getServerImageProductListResponse.productList[]
    | select(((.productName // "") | ascii_downcase | contains("ubuntu"))
      or ((.productDescription // "") | ascii_downcase | contains("ubuntu")))
    | [.productCode, .productName, .productDescription] | @tsv'
```

Windows PowerShell:

```powershell
$images = ncloud vserver getServerImageProductList `
  --regionCode $REGION_CODE `
  --output json | ConvertFrom-Json

$images.getServerImageProductListResponse.productList |
  Where-Object { $_.productName -match "ubuntu" -or $_.productDescription -match "ubuntu" } |
  Select-Object productCode, productName, productDescription
```

서버 스펙:

```bash
ncloud vserver getServerProductList \
  --regionCode "$REGION_CODE" \
  --serverImageProductCode "SERVER_IMAGE_PRODUCT_CODE" \
  --output json
```

PowerShell:

```powershell
ncloud vserver getServerProductList `
  --regionCode $REGION_CODE `
  --serverImageProductCode "SERVER_IMAGE_PRODUCT_CODE" `
  --output json
```

조회 결과에서 실제 사용할 값을 변수로 저장합니다.

Linux/macOS:

```bash
SERVER_IMAGE_PRODUCT_CODE="SERVER_IMAGE_PRODUCT_CODE"
SERVER_PRODUCT_CODE="SERVER_PRODUCT_CODE"
```

Windows PowerShell:

```powershell
$SERVER_IMAGE_PRODUCT_CODE = "SERVER_IMAGE_PRODUCT_CODE"
$SERVER_PRODUCT_CODE = "SERVER_PRODUCT_CODE"
```

서버 생성 전에 값이 비어 있지 않은지 확인합니다.

Linux/macOS:

```bash
echo "$SERVER_IMAGE_PRODUCT_CODE"
echo "$SERVER_PRODUCT_CODE"
```

Windows PowerShell:

```powershell
$SERVER_IMAGE_PRODUCT_CODE
$SERVER_PRODUCT_CODE
```

## 5. VPC 생성

Linux/macOS:

```bash
ncloud vpc createVpc \
  --regionCode "$REGION_CODE" \
  --vpcName "$VPC_NAME" \
  --ipv4CidrBlock "$VPC_CIDR" \
  --output json
```

Windows PowerShell:

```powershell
ncloud vpc createVpc `
  --regionCode $REGION_CODE `
  --vpcName $VPC_NAME `
  --ipv4CidrBlock $VPC_CIDR `
  --output json
```

생성된 VPC 번호를 확인합니다.

Linux/macOS:

```bash
ncloud vpc getVpcList \
  --regionCode "$REGION_CODE" \
  --output json

VPC_NO="응답의 vpcNo"
```

Windows PowerShell:

```powershell
ncloud vpc getVpcList `
  --regionCode $REGION_CODE `
  --output json

$VPC_NO = "응답의 vpcNo"
```

## 6. Network ACL 확인

Subnet 생성에는 Network ACL 번호가 필요합니다.

Linux/macOS:

```bash
ncloud vpc getNetworkAclList \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --output json

NETWORK_ACL_NO="응답의 networkAclNo"
```

Windows PowerShell:

```powershell
ncloud vpc getNetworkAclList `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --output json

$NETWORK_ACL_NO = "응답의 networkAclNo"
```

## 7. Public Subnet 생성

Linux/macOS:

```bash
ncloud vpc createSubnet \
  --regionCode "$REGION_CODE" \
  --zoneCode "$ZONE_CODE" \
  --vpcNo "$VPC_NO" \
  --subnetName "$PUBLIC_SUBNET_NAME" \
  --subnet "$PUBLIC_SUBNET_CIDR" \
  --networkAclNo "$NETWORK_ACL_NO" \
  --subnetTypeCode PUBLIC \
  --usageTypeCode GEN \
  --output json
```

Windows PowerShell:

```powershell
ncloud vpc createSubnet `
  --regionCode $REGION_CODE `
  --zoneCode $ZONE_CODE `
  --vpcNo $VPC_NO `
  --subnetName $PUBLIC_SUBNET_NAME `
  --subnet $PUBLIC_SUBNET_CIDR `
  --networkAclNo $NETWORK_ACL_NO `
  --subnetTypeCode PUBLIC `
  --usageTypeCode GEN `
  --output json
```

Public Subnet 번호를 저장합니다.

Linux/macOS:

```bash
ncloud vpc getSubnetList \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --output json

PUBLIC_SUBNET_NO="sub-lab3-pub-kr1의 subnetNo"
```

Windows PowerShell:

```powershell
ncloud vpc getSubnetList `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --output json

$PUBLIC_SUBNET_NO = "sub-lab3-pub-kr1의 subnetNo"
```

## 8. Private Subnet 생성

Linux/macOS:

```bash
ncloud vpc createSubnet \
  --regionCode "$REGION_CODE" \
  --zoneCode "$ZONE_CODE" \
  --vpcNo "$VPC_NO" \
  --subnetName "$PRIVATE_SUBNET_NAME" \
  --subnet "$PRIVATE_SUBNET_CIDR" \
  --networkAclNo "$NETWORK_ACL_NO" \
  --subnetTypeCode PRIVATE \
  --usageTypeCode GEN \
  --output json
```

Windows PowerShell:

```powershell
ncloud vpc createSubnet `
  --regionCode $REGION_CODE `
  --zoneCode $ZONE_CODE `
  --vpcNo $VPC_NO `
  --subnetName $PRIVATE_SUBNET_NAME `
  --subnet $PRIVATE_SUBNET_CIDR `
  --networkAclNo $NETWORK_ACL_NO `
  --subnetTypeCode PRIVATE `
  --usageTypeCode GEN `
  --output json
```

Private Subnet 번호를 저장합니다.

Linux/macOS:

```bash
ncloud vpc getSubnetList \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --output json

PRIVATE_SUBNET_NO="sub-lab3-pri-kr1의 subnetNo"
```

Windows PowerShell:

```powershell
ncloud vpc getSubnetList `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --output json

$PRIVATE_SUBNET_NO = "sub-lab3-pri-kr1의 subnetNo"
```

## 9. ACG 생성

Linux/macOS:

```bash
ncloud vserver createAccessControlGroup \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --accessControlGroupName "$ACG_NAME" \
  --accessControlGroupDescription "CLI lab SSH access" \
  --output json
```

Windows PowerShell:

```powershell
ncloud vserver createAccessControlGroup `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --accessControlGroupName $ACG_NAME `
  --accessControlGroupDescription "CLI lab SSH access" `
  --output json
```

ACG 번호를 저장합니다.

Linux/macOS:

```bash
ncloud vserver getAccessControlGroupList \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --output json

ACG_NO="응답의 accessControlGroupNo"
```

Windows PowerShell:

```powershell
ncloud vserver getAccessControlGroupList `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --output json

$ACG_NO = "응답의 accessControlGroupNo"
```

## 10. SSH Inbound Rule 추가

Linux/macOS:

```bash
ncloud vserver addAccessControlGroupInboundRule \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --accessControlGroupNo "$ACG_NO" \
  --accessControlGroupRuleList "protocolTypeCode='TCP', ipBlock='$MY_PUBLIC_IP', portRange='22', accessControlGroupRuleDescription='SSH'" \
  --output json
```

Windows PowerShell:

```powershell
ncloud vserver addAccessControlGroupInboundRule `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --accessControlGroupNo $ACG_NO `
  --accessControlGroupRuleList "protocolTypeCode='TCP', ipBlock='$MY_PUBLIC_IP', portRange='22', accessControlGroupRuleDescription='SSH'" `
  --output json
```

002 init script로 `2200` 포트도 열 예정이면 추가합니다.

Linux/macOS:

```bash
ncloud vserver addAccessControlGroupInboundRule \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --accessControlGroupNo "$ACG_NO" \
  --accessControlGroupRuleList "protocolTypeCode='TCP', ipBlock='$MY_PUBLIC_IP', portRange='2200', accessControlGroupRuleDescription='SSH 2200'" \
  --output json
```

Windows PowerShell:

```powershell
ncloud vserver addAccessControlGroupInboundRule `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --accessControlGroupNo $ACG_NO `
  --accessControlGroupRuleList "protocolTypeCode='TCP', ipBlock='$MY_PUBLIC_IP', portRange='2200', accessControlGroupRuleDescription='SSH 2200'" `
  --output json
```

## 11. Login Key 확인/생성 참고

이미 콘솔이나 CLI에서 Login Key를 만들었다면 이 단계는 건너뛰고 `LOGIN_KEY_NAME` 변수에 기존 키 이름만 넣으면 됩니다.

기존 Login Key 조회:

Linux/macOS:

```bash
ncloud vserver getLoginKeyList \
  --regionCode "$REGION_CODE" \
  --output json
```

Windows PowerShell:

```powershell
ncloud vserver getLoginKeyList `
  --regionCode $REGION_CODE `
  --output json
```

새로 생성할 때는 아래 명령을 사용합니다. 개인키는 생성 응답에서 한 번만 확인할 수 있습니다.

Linux/macOS:

```bash
ncloud vserver createLoginKey \
  --keyName "$LOGIN_KEY_NAME" \
  --regionCode "$REGION_CODE" \
  --output json
```

Windows PowerShell:

```powershell
ncloud vserver createLoginKey `
  --keyName $LOGIN_KEY_NAME `
  --regionCode $REGION_CODE `
  --output json
```

개인키를 `cli-lab-key.pem`으로 저장하고 권한을 제한합니다. Windows에서는 파일 내용을 메모장에 저장해도 됩니다.

Linux/macOS:

```bash
chmod 400 cli-lab-key.pem
```

## 12. 서버 생성

SSH 접속을 확인할 서버이므로 Public Subnet에 생성합니다.

아래 오류가 나오면 `SERVER_IMAGE_PRODUCT_CODE` 값이 비어 있거나 잘못된 상태입니다. 4번의 Ubuntu 이미지 조회 결과에서 실제 `productCode`를 변수에 넣었는지 확인합니다.

```text
Required field is not specified. location : memberServerImageInstanceNo or serverImageProductCode or serverSpecCode.
```

Linux/macOS:

```bash
ncloud vserver createServerInstances \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --subnetNo "$PUBLIC_SUBNET_NO" \
  --networkInterfaceList "networkInterfaceOrder='0', accessControlGroupNoList=['$ACG_NO']" \
  --serverImageProductCode "$SERVER_IMAGE_PRODUCT_CODE" \
  --serverProductCode "$SERVER_PRODUCT_CODE" \
  --serverName "$SERVER_NAME" \
  --loginKeyName "$LOGIN_KEY_NAME" \
  --associateWithPublicIp true \
  --isProtectServerTermination false \
  --output json
```

Windows PowerShell:

```powershell
ncloud vserver createServerInstances `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --subnetNo $PUBLIC_SUBNET_NO `
  --networkInterfaceList "networkInterfaceOrder='0', accessControlGroupNoList=['$ACG_NO']" `
  --serverImageProductCode $SERVER_IMAGE_PRODUCT_CODE `
  --serverProductCode $SERVER_PRODUCT_CODE `
  --serverName $SERVER_NAME `
  --loginKeyName $LOGIN_KEY_NAME `
  --associateWithPublicIp true `
  --isProtectServerTermination false `
  --output json
```

002 init script를 함께 쓰려면 `INIT_SCRIPT_NO`를 변수로 저장한 뒤 `--initScriptNo`를 추가합니다.

## 13. 서버 상태 확인

Linux/macOS:

```bash
ncloud vserver getServerInstanceList \
  --regionCode "$REGION_CODE" \
  --output json

SERVER_INSTANCE_NO="응답의 serverInstanceNo"
SERVER_PUBLIC_IP="응답의 publicIp"
```

Windows PowerShell:

```powershell
ncloud vserver getServerInstanceList `
  --regionCode $REGION_CODE `
  --output json

$SERVER_INSTANCE_NO = "응답의 serverInstanceNo"
$SERVER_PUBLIC_IP = "응답의 publicIp"
```

## 14. SSH 접속

Linux/macOS:

```bash
ssh -i cli-lab-key.pem "USERNAME@$SERVER_PUBLIC_IP"
```

Windows PowerShell:

```powershell
ssh -i .\cli-lab-key.pem "USERNAME@$SERVER_PUBLIC_IP"
```

002 init script로 `2200` 포트를 열었다면:

```bash
ssh -i cli-lab-key.pem -p 2200 "USERNAME@$SERVER_PUBLIC_IP"
```

## 15. 실습 정리

서버 정지:

```bash
ncloud vserver stopServerInstances \
  --regionCode "$REGION_CODE" \
  --serverInstanceNoList "['$SERVER_INSTANCE_NO']" \
  --output json
```

서버 반납:

```bash
ncloud vserver terminateServerInstances \
  --regionCode "$REGION_CODE" \
  --serverInstanceNoList "['$SERVER_INSTANCE_NO']" \
  --output json
```

ACG 삭제:

```bash
ncloud vserver deleteAccessControlGroup \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --accessControlGroupNo "$ACG_NO" \
  --output json
```

Private Subnet 삭제:

```bash
ncloud vpc deleteSubnet \
  --regionCode "$REGION_CODE" \
  --subnetNo "$PRIVATE_SUBNET_NO" \
  --output json
```

Public Subnet 삭제:

```bash
ncloud vpc deleteSubnet \
  --regionCode "$REGION_CODE" \
  --subnetNo "$PUBLIC_SUBNET_NO" \
  --output json
```

VPC 삭제:

```bash
ncloud vpc deleteVpc \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --output json
```

PowerShell에서는 같은 명령을 백틱과 `$변수명` 형식으로 바꿔 실행합니다.

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
