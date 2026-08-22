# 003 Cloud CLI

## 목표

Ncloud CLI로 VPC, Subnet, ACG, Login Key, Server를 하나씩 생성합니다.

실습 폴더:

```text
003-cloud cli
```

## CLI 설치

Ncloud CLI 다운로드:

```text
https://cli.ncloud-docs.com/docs/en/guide-clichange
```

Linux 기준:

```bash
unzip CLI_*.zip
cd CLI_*/cli_linux
./ncloud
```

현재 터미널에서 `ncloud` 명령을 바로 쓰려면:

```bash
export PATH="$PWD:$PATH"
ncloud help
```

## 인증 설정

```bash
ncloud configure
```

입력값:

```text
Ncloud Access Key ID []: <access-key>
Ncloud Secret Access Key []: <secret-key>
Ncloud API URL (default:https://ncloud.apigw.ntruss.com) []:
```

## 기본 조회

Region:

```bash
ncloud vserver getRegionList --output json
```

Zone:

```bash
ncloud vserver getZoneList \
  --regionCode KR \
  --output json
```

서버 이미지:

```bash
ncloud vserver getServerImageProductList \
  --regionCode KR \
  --output json
```

서버 스펙:

```bash
ncloud vserver getServerProductList \
  --regionCode KR \
  --serverImageProductCode "SERVER_IMAGE_PRODUCT_CODE" \
  --output json
```

## 1. VPC 생성

```bash
ncloud vpc createVpc \
  --regionCode KR \
  --vpcName cli-lab-vpc \
  --ipv4CidrBlock 10.0.0.0/16 \
  --output json
```

VPC 번호 확인:

```bash
ncloud vpc getVpcList \
  --regionCode KR \
  --output json
```

응답의 `vpcNo`를 이후 `VPC_NO`에 넣습니다.

## 2. Network ACL 확인

Subnet 생성에는 Network ACL 번호가 필요합니다.

```bash
ncloud vpc getNetworkAclList \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --output json
```

응답의 `networkAclNo`를 이후 `NETWORK_ACL_NO`에 넣습니다.

## 3. Public Subnet 생성

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

## 4. Private Subnet 생성

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

Subnet 목록 확인:

```bash
ncloud vpc getSubnetList \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --output json
```

Public Subnet과 Private Subnet이 모두 생성되었는지 확인합니다.

```text
sub-lab3-pub-kr1  10.0.1.0/24  PUBLIC
sub-lab3-pri-kr1  10.0.2.0/24  PRIVATE
```

## 5. ACG 생성

```bash
ncloud vserver createAccessControlGroup \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --accessControlGroupName cli-lab-acg \
  --accessControlGroupDescription "CLI lab SSH access" \
  --output json
```

ACG 번호 확인:

```bash
ncloud vserver getAccessControlGroupList \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --output json
```

응답의 `accessControlGroupNo`를 이후 `ACG_NO`에 넣습니다.

## 6. SSH Inbound Rule 추가

본인 IP만 허용하는 예시:

```bash
ncloud vserver addAccessControlGroupInboundRule \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --accessControlGroupNo "ACG_NO" \
  --accessControlGroupRuleList "protocolTypeCode='TCP', ipBlock='YOUR_PUBLIC_IP/32', portRange='22', accessControlGroupRuleDescription='SSH'" \
  --output json
```

강의 실습 편의상 전체 허용이 필요할 때:

```bash
ncloud vserver addAccessControlGroupInboundRule \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --accessControlGroupNo "ACG_NO" \
  --accessControlGroupRuleList "protocolTypeCode='TCP', ipBlock='0.0.0.0/0', portRange='22', accessControlGroupRuleDescription='SSH lab only'" \
  --output json
```

002 init script로 `2200` 포트도 열 예정이면:

```bash
ncloud vserver addAccessControlGroupInboundRule \
  --regionCode KR \
  --vpcNo "VPC_NO" \
  --accessControlGroupNo "ACG_NO" \
  --accessControlGroupRuleList "protocolTypeCode='TCP', ipBlock='YOUR_PUBLIC_IP/32', portRange='2200', accessControlGroupRuleDescription='SSH 2200'" \
  --output json
```

## 7. Login Key 생성

개인키는 생성 응답에서 한 번만 확인할 수 있습니다.

```bash
ncloud vserver createLoginKey \
  --keyName cli-lab-key \
  --regionCode KR \
  --output json
```

`jq`가 있으면 PEM 파일로 바로 저장합니다.

```bash
ncloud vserver createLoginKey \
  --keyName cli-lab-key \
  --regionCode KR \
  --output json \
  | jq -r '.createLoginKeyResponse.privateKey' > cli-lab-key.pem

chmod 400 cli-lab-key.pem
```

## 8. 서버 생성

앞에서 조회한 실제 Public Subnet 번호와 서버 이미지/스펙 코드를 넣습니다. SSH 접속을 확인할 서버이므로 Public Subnet에 생성합니다.

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

002 init script를 같이 쓰려면 `--initScriptNo`를 추가합니다.

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

## 9. 서버 상태 확인

```bash
ncloud vserver getServerInstanceList \
  --regionCode KR \
  --output json
```

```bash
ncloud vserver getServerInstanceDetail \
  --regionCode KR \
  --serverInstanceNo "SERVER_INSTANCE_NO" \
  --output json
```

## 10. SSH 접속

```bash
ssh -i cli-lab-key.pem USERNAME@SERVER_PUBLIC_IP
```

002 init script로 `2200` 포트를 열었다면:

```bash
ssh -i cli-lab-key.pem -p 2200 USERNAME@SERVER_PUBLIC_IP
```

## 11. 실습 정리

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
