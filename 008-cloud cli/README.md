# 008 Cloud CLI

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

G3/KVM 이미지는 `getServerImageProductList`가 아니라 `getServerImageList`로 조회합니다. `getServerImageProductList`는 구세대 상품 코드 중심이라 G2만 보일 수 있습니다.

```bash
ncloud vserver getServerImageList \
  --regionCode "$REGION_CODE" \
  --serverImageTypeCodeList NCP \
  --hypervisorTypeCodeList KVM \
  --osTypeCodeList UBUNTU \
  --platformCategoryCodeList OS \
  --pageNo 0 \
  --pageSize 100 \
  --output json
```

PowerShell:

```powershell
ncloud vserver getServerImageList `
  --regionCode $REGION_CODE `
  --serverImageTypeCodeList NCP `
  --hypervisorTypeCodeList KVM `
  --osTypeCodeList UBUNTU `
  --platformCategoryCodeList OS `
  --pageNo 0 `
  --pageSize 100 `
  --output json
```

Ubuntu G3 이미지만 보기:

Linux/macOS:

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

서버 스펙:

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

PowerShell:

```powershell
ncloud vserver getServerSpecList `
  --regionCode $REGION_CODE `
  --zoneCode $ZONE_CODE `
  --serverImageNo $SERVER_IMAGE_NO `
  --hypervisorTypeCodeList KVM `
  --output json | ConvertFrom-Json
```

조회 결과에서 실제 사용할 값을 변수로 저장합니다. `SERVER_SPEC_CODE`에는 숫자인 `serverSpecNo`가 아니라 `s2-g3a`, `c2-g3` 같은 `serverSpecCode` 값을 넣습니다.

Linux/macOS:

```bash
SERVER_IMAGE_NO="104630229"
SERVER_SPEC_CODE="s2-g3a"
```

Windows PowerShell:

```powershell
$SERVER_IMAGE_NO = "104630229"
$SERVER_SPEC_CODE = "s2-g3a"
```

서버 생성 전에 값이 비어 있지 않은지 확인합니다.

Linux/macOS:

```bash
echo "$SERVER_IMAGE_NO"
echo "$SERVER_SPEC_CODE"
```

Windows PowerShell:

```powershell
$SERVER_IMAGE_NO
$SERVER_SPEC_CODE
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

실습 서버는 비용 실수를 막기 위해 시간 요금제(종량제)를 명시합니다.

```text
feeSystemTypeCode
- MTRAT: 시간 요금제
- FXSUM: 월 요금제
```

공식 기본값도 `MTRAT`이지만, 강의 실습에서는 명령어에 `--feeSystemTypeCode MTRAT`를 직접 넣어 확인합니다.

아래 오류가 나오면 `SERVER_IMAGE_NO` 또는 `SERVER_SPEC_CODE` 값이 비어 있거나 잘못된 상태입니다. 4번의 Ubuntu G3 이미지 조회 결과에서 실제 `serverImageNo`를, 스펙 조회 결과에서 실제 `serverSpecCode`를 변수에 넣었는지 확인합니다.

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
  --feeSystemTypeCode MTRAT \
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
  --feeSystemTypeCode MTRAT `
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

## 14. 관리자 비밀번호 확인

서버 생성 시 사용한 Login Key의 개인키 파일로 관리자 비밀번호를 확인할 수 있습니다.

Linux/macOS:

```bash
ncloud vserver getRootPassword \
  --regionCode "$REGION_CODE" \
  --serverInstanceNo "$SERVER_INSTANCE_NO" \
  --privateKey "file://$PWD/cli-lab-key.pem" \
  --output json
```

Windows PowerShell:

```powershell
ncloud vserver getRootPassword `
  --regionCode $REGION_CODE `
  --serverInstanceNo $SERVER_INSTANCE_NO `
  --privateKey "file://$PWD/cli-lab-key.pem" `
  --output json
```

주의할 점:

- 서버 생성 시 사용한 `LOGIN_KEY_NAME`에 해당하는 개인키여야 합니다.
- `file://` 뒤에는 `.pem` 파일 경로를 넣습니다.
- 개인키가 현재 디렉터리에 없다면 절대 경로를 사용합니다.
- 개인키를 잃어버리면 관리자 비밀번호를 복호화할 수 없습니다.
- 비밀번호 출력값은 화면 공유나 로그에 남기지 않습니다.

## 15. SSH 접속

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

## 16. 실습 정리

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

## 참고 문서

- Ncloud CLI 소개: <https://cli.ncloud-docs.com/docs/en/guide>
- Ncloud CLI 설치: <https://cli.ncloud-docs.com/docs/en/guide-clichange>
- Ncloud CLI 인증: <https://cli.ncloud-docs.com/docs/en/cli-auth>
- VPC 생성 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vpc-vpcmanagement-createvpc>
- Subnet 생성 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vpc-subnetmanagement-createsubnet>
- ACG 생성 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-acg-createaccesscontrolgroup>
- ACG inbound rule 추가 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-acg-addaccesscontrolgroupinboundrule>
- ACG 삭제 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-acg-deleteaccesscontrolgroup>
- 서버 이미지 조회 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-serverimage-getserverimagelist>
- 서버 스펙 조회 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-server-common-getserverspeclist>
- Login Key 생성 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-server-loginkey-createloginkey>
- 서버 생성 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-server-createserverinstances>
- 관리자 비밀번호 확인 CLI: <https://cli.ncloud-docs.com/docs/cli-vserver-server-getrootpassword>
