# 003 Cloud CLI

## 목표

Ncloud CLI를 설치하고 인증한 뒤, CLI로 VPC 서버를 생성합니다.

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

프로필을 따로 만들려면:

```bash
ncloud configure --profile lecture
```

## 리소스 조회

Region:

```bash
ncloud vserver getRegionList --output json
```

VPC:

```bash
ncloud vpc getVpcList --regionCode KR --output json
```

Subnet:

```bash
ncloud vpc getSubnetList --regionCode KR --output json
```

ACG:

```bash
ncloud vserver getAccessControlGroupList --regionCode KR --output json
```

로그인 키:

```bash
ncloud vserver getLoginKeyList --regionCode KR --output json
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
  --serverImageProductCode SERVER_IMAGE_PRODUCT_CODE \
  --output json
```

## 서버 생성 설정

```bash
cd ~/cloud-infrastructure-lecture-example
cd "003-cloud cli"
cp scripts/create-server.env.example scripts/create-server.env
```

`scripts/create-server.env`를 수정합니다.

```bash
REGION_CODE="KR"
VPC_NO="12345678"
SUBNET_NO="23456789"
ACG_NO="67890123"
SERVER_IMAGE_PRODUCT_CODE="SW.VSVR.OS.LNX64.ROCKY.0810.B050"
SERVER_PRODUCT_CODE="SVR.VSVR.HICPU.C002.M004.NET.SSD.B050.G002"
SERVER_NAME="cli-lab-001"
LOGIN_KEY_NAME="my-login-key"
ASSOCIATE_WITH_PUBLIC_IP="true"
INIT_SCRIPT_NO=""
PROFILE=""
```

## 서버 생성 명령 출력

먼저 dry run으로 생성 명령을 확인합니다.

```bash
./scripts/create-server.sh
```

값이 맞으면 실행합니다.

```bash
./scripts/create-server.sh --execute
```

## 생성 상태 확인

```bash
ncloud vserver getServerInstanceList \
  --regionCode KR \
  --output json
```

## SSH 접속

```bash
ssh -i LOGIN_KEY.pem USERNAME@SERVER_PUBLIC_IP
```

002 init script로 `2200` 포트를 열었다면:

```bash
ssh -i LOGIN_KEY.pem -p 2200 USERNAME@SERVER_PUBLIC_IP
```

## 실습 정리

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

