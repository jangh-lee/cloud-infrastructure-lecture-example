# 003 Cloud CLI

Ncloud CLI를 사용해 Naver Cloud 리소스를 조회하고, VPC 환경에 서버를 생성하는 실습입니다.

이 예제는 콘솔 화면 클릭 대신 CLI 명령으로 인프라 정보를 확인하고 서버 생성 요청을 보내는 흐름을 다룹니다. 서버 생성은 실제 과금 리소스를 만들 수 있으므로, 명령 실행 전 값과 비용을 반드시 확인합니다.

## 실습 목표

- Ncloud CLI 설치 및 인증 설정
- Region, VPC, Subnet, ACG, 서버 이미지, 서버 스펙 조회
- 서버 생성 명령 구성
- SSH 접속을 위한 공인 IP와 로그인 키 사용 흐름 이해

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

편하게 쓰려면 현재 셸에서 PATH를 추가합니다.

```bash
export PATH="$PWD:$PATH"
ncloud
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

설정 파일은 사용자 홈 디렉터리의 `.ncloud` 아래에 저장됩니다.

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
ncloud vserver getZoneList --regionCode KR --output json
```

VPC 조회:

```bash
ncloud vpc getVpcList --regionCode KR --output json
```

Subnet 조회:

```bash
ncloud vpc getSubnetList --regionCode KR --output json
```

ACG 조회:

```bash
ncloud vserver getAccessControlGroupList --regionCode KR --output json
```

로그인 키 조회:

```bash
ncloud vserver getLoginKeyList --regionCode KR --output json
```

## 4. 서버 이미지와 스펙 조회

Ubuntu 또는 Rocky Linux 같은 서버 이미지 상품 코드를 조회합니다.

```bash
ncloud vserver getServerImageProductList \
  --regionCode KR \
  --output json
```

특정 이미지 코드에 맞는 서버 스펙을 조회합니다.

```bash
ncloud vserver getServerProductList \
  --regionCode KR \
  --serverImageProductCode SERVER_IMAGE_PRODUCT_CODE \
  --output json
```

예시 이미지/스펙 코드는 계정, 리전, 시점에 따라 달라질 수 있습니다. 실습 전 반드시 조회 결과에서 실제 사용 가능한 값을 선택합니다.

## 5. 서버 생성 설정 파일 작성

예시 파일을 복사합니다.

```bash
cd "003-cloud cli"
cp scripts/create-server.env.example scripts/create-server.env
```

`scripts/create-server.env`를 열어 본인 환경 값으로 수정합니다.

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

`INIT_SCRIPT_NO`는 선택값입니다. 002 실습의 SSH 포트 재설정 init script를 콘솔에 등록했다면 해당 init script 번호를 넣을 수 있습니다.

## 6. 서버 생성 명령 확인

먼저 생성 명령만 출력합니다.

```bash
./scripts/create-server.sh
```

출력된 명령을 확인한 뒤 직접 복사해 실행하거나, 아래처럼 스크립트에서 바로 실행합니다.

```bash
./scripts/create-server.sh --execute
```

서버 생성 명령의 핵심 형태:

```bash
ncloud vserver createServerInstances \
  --vpcNo VPC_NO \
  --subnetNo SUBNET_NO \
  --networkInterfaceList "networkInterfaceOrder='0', accessControlGroupNoList=['ACG_NO']" \
  --serverImageProductCode SERVER_IMAGE_PRODUCT_CODE \
  --serverProductCode SERVER_PRODUCT_CODE \
  --serverName SERVER_NAME \
  --loginKeyName LOGIN_KEY_NAME \
  --associateWithPublicIp true \
  --regionCode KR \
  --output json
```

## 7. 생성 상태 확인

서버 목록:

```bash
ncloud vserver getServerInstanceList \
  --regionCode KR \
  --output json
```

특정 서버 번호를 알고 있다면:

```bash
ncloud vserver getServerInstanceDetail \
  --regionCode KR \
  --serverInstanceNo SERVER_INSTANCE_NO \
  --output json
```

## 8. SSH 접속

공인 IP가 할당된 서버라면 ACG에서 `TCP 22` 또는 실습에서 사용하는 SSH 포트를 열어야 합니다.

기본 SSH:

```bash
ssh -i LOGIN_KEY.pem USERNAME@SERVER_PUBLIC_IP
```

002 init script로 `2200` 포트를 추가했다면:

```bash
ssh -i LOGIN_KEY.pem -p 2200 USERNAME@SERVER_PUBLIC_IP
```

## 9. 정리

실습이 끝난 서버는 콘솔 또는 CLI에서 반납합니다. 실수로 운영 리소스를 삭제하지 않도록 서버 이름과 서버 번호를 다시 확인합니다.

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

## 참고 문서

- Ncloud CLI 소개: <https://cli.ncloud-docs.com/docs/en/guide>
- Ncloud CLI 설치: <https://cli.ncloud-docs.com/docs/en/guide-clichange>
- Ncloud CLI 인증: <https://cli.ncloud-docs.com/docs/en/cli-auth>
- 서버 생성 CLI: <https://cli.ncloud-docs.com/docs/en/cli-vserver-server-createserverinstances>

