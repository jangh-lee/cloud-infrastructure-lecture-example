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

```bash
ncloud vserver getServerImageProductList \
  --regionCode "$REGION_CODE" \
  --output json
```

```bash
ncloud vserver getServerProductList \
  --regionCode "$REGION_CODE" \
  --serverImageProductCode "SERVER_IMAGE_PRODUCT_CODE" \
  --output json
```

조회 결과에서 실제 값을 변수로 저장합니다.

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

## 7. Login Key 생성

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

Linux/macOS:

```bash
ncloud vserver stopServerInstances \
  --regionCode "$REGION_CODE" \
  --serverInstanceNoList "['$SERVER_INSTANCE_NO']" \
  --output json

ncloud vserver terminateServerInstances \
  --regionCode "$REGION_CODE" \
  --serverInstanceNoList "['$SERVER_INSTANCE_NO']" \
  --output json

ncloud vserver deleteAccessControlGroup \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --accessControlGroupNo "$ACG_NO" \
  --output json

ncloud vpc deleteSubnet \
  --regionCode "$REGION_CODE" \
  --subnetNo "$PRIVATE_SUBNET_NO" \
  --output json

ncloud vpc deleteSubnet \
  --regionCode "$REGION_CODE" \
  --subnetNo "$PUBLIC_SUBNET_NO" \
  --output json

ncloud vpc deleteVpc \
  --regionCode "$REGION_CODE" \
  --vpcNo "$VPC_NO" \
  --output json
```

PowerShell에서는 같은 명령을 백틱과 `$변수명` 형식으로 바꿔 실행합니다.
