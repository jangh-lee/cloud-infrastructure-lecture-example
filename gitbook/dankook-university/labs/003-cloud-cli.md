# 003 Cloud CLI

## 목표

Ncloud CLI로 VPC, Public/Private Subnet, ACG, Login Key, Server를 순서대로 생성합니다.

명령마다 리소스 번호를 다시 복사하지 않도록 Linux/macOS는 shell 변수, Windows는 PowerShell 변수를 사용합니다.

## CLI 설치

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
$env:Path = "$PWD;$env:Path"
ncloud help
```

## 인증 설정

```bash
ncloud configure
```

프로필을 따로 쓰려면:

```bash
ncloud configure --profile lecture
```

## 공통 변수 설정

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

## 서버 이미지와 스펙 조회

G3/KVM Ubuntu 이미지는 `getServerImageProductList`가 아니라 `getServerImageList`로 조회합니다.

```bash
ncloud vserver getServerImageList \
  --regionCode "$REGION_CODE" \
  --serverImageTypeCodeList NCP \
  --hypervisorTypeCodeList KVM \
  --osTypeCodeList UBUNTU \
  --platformCategoryCodeList OS \
  --pageNo 0 \
  --pageSize 100 \
  --output json \
  | jq -r '.getServerImageListResponse.serverImageList[]
    | select((.serverImageProductCode // "") | contains("G003"))
    | [.serverImageNo, .serverImageName, .serverImageProductCode] | @tsv'
```

Windows PowerShell:

```powershell
$images = ncloud vserver getServerImageList `
  --regionCode $REGION_CODE `
  --serverImageTypeCodeList NCP `
  --hypervisorTypeCodeList KVM `
  --osTypeCodeList UBUNTU `
  --platformCategoryCodeList OS `
  --pageNo 0 `
  --pageSize 100 `
  --output json | ConvertFrom-Json

$images.getServerImageListResponse.serverImageList |
  Where-Object { $_.serverImageProductCode -match "G003" } |
  Select-Object serverImageNo, serverImageName, serverImageProductCode
```

선택한 Ubuntu 이미지에 맞는 서버 스펙을 조회합니다.

```bash
ncloud vserver getServerSpecList \
  --regionCode "$REGION_CODE" \
  --zoneCode "$ZONE_CODE" \
  --serverImageNo "$SERVER_IMAGE_NO" \
  --hypervisorTypeCodeList KVM \
  --output json \
  | jq -r '.getServerSpecListResponse.serverSpecList[]
    | [.serverSpecCode, .serverSpecNo, .serverSpecDescription, .generationCode, .hypervisorType.code] | @tsv'
```

조회 결과에서 실제 값을 변수로 저장합니다. `SERVER_SPEC_CODE`에는 숫자인 `serverSpecNo`가 아니라 `s2-g3a`, `c2-g3` 같은 `serverSpecCode` 값을 넣습니다.

Linux/macOS:

```bash
SERVER_IMAGE_NO="104630229"
SERVER_SPEC_CODE="s2-g3a"

echo "$SERVER_IMAGE_NO"
echo "$SERVER_SPEC_CODE"
```

Windows PowerShell:

```powershell
$SERVER_IMAGE_NO = "104630229"
$SERVER_SPEC_CODE = "s2-g3a"

$SERVER_IMAGE_NO
$SERVER_SPEC_CODE
```

## 1. VPC 생성

Linux/macOS:

```bash
ncloud vpc createVpc \
  --regionCode "$REGION_CODE" \
  --vpcName "$VPC_NAME" \
  --ipv4CidrBlock "$VPC_CIDR" \
  --output json

VPC_NO="응답의 vpcNo"
```

Windows PowerShell:

```powershell
ncloud vpc createVpc `
  --regionCode $REGION_CODE `
  --vpcName $VPC_NAME `
  --ipv4CidrBlock $VPC_CIDR `
  --output json

$VPC_NO = "응답의 vpcNo"
```

## 2. Network ACL 확인

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

## 3. Public Subnet 생성

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

PUBLIC_SUBNET_NO="응답의 subnetNo"
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

$PUBLIC_SUBNET_NO = "응답의 subnetNo"
```

## 4. Private Subnet 생성

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

PRIVATE_SUBNET_NO="응답의 subnetNo"
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

$PRIVATE_SUBNET_NO = "응답의 subnetNo"
```

## 5. ACG 생성

Linux/macOS:

```bash
ncloud vserver createAccessControlGroup \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --accessControlGroupName "$ACG_NAME" \
  --accessControlGroupDescription "CLI lab SSH access" \
  --output json

ACG_NO="응답의 accessControlGroupNo"
```

Windows PowerShell:

```powershell
ncloud vserver createAccessControlGroup `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --accessControlGroupName $ACG_NAME `
  --accessControlGroupDescription "CLI lab SSH access" `
  --output json

$ACG_NO = "응답의 accessControlGroupNo"
```

## 6. SSH Inbound Rule 추가

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

## 7. Login Key 확인/생성 참고

이미 Login Key가 있으면 이 단계는 건너뛰고 `LOGIN_KEY_NAME` 변수에 기존 키 이름만 넣으면 됩니다.

기존 Login Key 조회:

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

개인키는 생성 응답에서 한 번만 확인할 수 있습니다. `cli-lab-key.pem` 파일로 저장합니다.

## 8. 서버 생성

아래 오류가 나오면 `SERVER_IMAGE_NO` 또는 `SERVER_SPEC_CODE` 값이 비어 있거나 잘못된 상태입니다. Ubuntu G3 이미지 조회 결과에서 실제 `serverImageNo`를, 스펙 조회 결과에서 실제 `serverSpecCode`를 변수에 넣었는지 확인합니다.

```text
Required field is not specified. location : memberServerImageInstanceNo or serverImageProductCode or serverSpecCode.
```

아래 오류가 나오면 `serverSpecNo` 숫자를 `SERVER_SPEC_CODE`에 넣었거나, 이미지와 스펙의 하이퍼바이저 세대가 맞지 않는 상태입니다.

```text
No hypervisor was found that matches the server image, specification, or product code you requested.
```

예를 들어 `SERVER_SPEC_CODE="1502"`처럼 숫자를 넣으면 안 됩니다. G3/KVM 서버는 `SERVER_SPEC_CODE="s2-g3a"`처럼 `serverSpecCode` 문자열을 넣습니다.

Linux/macOS:

```bash
ncloud vserver createServerInstances \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --subnetNo "$PUBLIC_SUBNET_NO" \
  --networkInterfaceList "networkInterfaceOrder='0', accessControlGroupNoList=['$ACG_NO']" \
  --serverImageNo "$SERVER_IMAGE_NO" \
  --serverSpecCode "$SERVER_SPEC_CODE" \
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
  --serverImageNo $SERVER_IMAGE_NO `
  --serverSpecCode $SERVER_SPEC_CODE `
  --serverName $SERVER_NAME `
  --loginKeyName $LOGIN_KEY_NAME `
  --associateWithPublicIp true `
  --isProtectServerTermination false `
  --output json
```

## 9. 서버 상태 확인

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

## 10. SSH 접속

Linux/macOS:

```bash
chmod 400 cli-lab-key.pem
ssh -i cli-lab-key.pem "USERNAME@$SERVER_PUBLIC_IP"
```

Windows PowerShell:

```powershell
ssh -i .\cli-lab-key.pem "USERNAME@$SERVER_PUBLIC_IP"
```

## 11. 실습 정리

삭제는 의존성이 있는 리소스의 역순으로 진행합니다.

```text
Server
→ ACG
→ Private Subnet
→ Public Subnet
→ VPC
```

서버 번호를 모르면 먼저 조회합니다.

```bash
ncloud vserver getServerInstanceList \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --output json

SERVER_INSTANCE_NO="응답의 serverInstanceNo"
```

서버 정지:

```bash
ncloud vserver stopServerInstances \
  --regionCode "$REGION_CODE" \
  --serverInstanceNoList "$SERVER_INSTANCE_NO" \
  --output json
```

`serverInstanceNoList`는 이름은 List이지만 CLI에서는 숫자 값만 넘깁니다. `['144506069']`처럼 대괄호를 넣으면 CLI가 중첩 리스트로 해석해서 오류가 납니다.

서버가 정지될 때까지 상태를 확인합니다.

```bash
ncloud vserver getServerInstanceList \
  --regionCode "$REGION_CODE" \
  --serverInstanceNoList "$SERVER_INSTANCE_NO" \
  --output json
```

서버 반납:

```bash
ncloud vserver terminateServerInstances \
  --regionCode "$REGION_CODE" \
  --serverInstanceNoList "$SERVER_INSTANCE_NO" \
  --output json
```

서버가 반납될 때까지 상태를 확인합니다. 서버가 목록에서 사라지거나 반납 상태가 되면 다음 단계로 진행합니다.

```bash
ncloud vserver getServerInstanceList \
  --regionCode "$REGION_CODE" \
  --serverInstanceNoList "$SERVER_INSTANCE_NO" \
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

ACG가 기본 ACG이거나 다른 서버에서 사용 중이면 삭제할 수 없습니다. 이 실습에서 만든 `lab3-acg`인지 확인합니다.

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

PowerShell에서는 같은 순서로 실행합니다.

```powershell
ncloud vserver getServerInstanceList `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --output json

$SERVER_INSTANCE_NO = "응답의 serverInstanceNo"

ncloud vserver stopServerInstances `
  --regionCode $REGION_CODE `
  --serverInstanceNoList $SERVER_INSTANCE_NO `
  --output json

ncloud vserver terminateServerInstances `
  --regionCode $REGION_CODE `
  --serverInstanceNoList $SERVER_INSTANCE_NO `
  --output json

ncloud vserver deleteAccessControlGroup `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --accessControlGroupNo $ACG_NO `
  --output json

ncloud vpc deleteSubnet `
  --regionCode $REGION_CODE `
  --subnetNo $PRIVATE_SUBNET_NO `
  --output json

ncloud vpc deleteSubnet `
  --regionCode $REGION_CODE `
  --subnetNo $PUBLIC_SUBNET_NO `
  --output json

ncloud vpc deleteVpc `
  --regionCode $REGION_CODE `
  --vpcNo $VPC_NO `
  --output json
```
