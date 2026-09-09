const authors = [
  "김민준", "이서연", "박지훈", "최유진", "정도윤", "한지아", "오준호", "강수빈",
  "윤태민", "임하은", "장현우", "신예린", "서지호", "문채원", "조민성", "배소윤",
  "남도현", "백가은", "유시우", "홍나래"
];

const topics = [
  "서버 생성", "ACG 설정", "로드밸런서", "오토스케일링", "Object Storage",
  "DB 백업", "특정시점 복구", "베스천 서버", "NAT Gateway", "Terraform",
  "Linux 명령어", "모니터링", "Init Script", "VPC 설계", "Subnet 분리"
];

const actions = [
  "실습하면서 확인한 내용입니다",
  "강의 중 질문으로 남깁니다",
  "팀원들과 공유할 메모입니다",
  "오류를 해결하면서 정리했습니다",
  "다음 실습 전에 다시 볼 내용입니다",
  "콘솔과 CLI 결과를 비교했습니다",
  "운영 환경이라면 주의해야 할 부분입니다",
  "네트워크 흐름을 따라가며 확인했습니다"
];

const details = [
  "보안 그룹은 최소 권한으로 여는 것이 좋겠습니다.",
  "private IP와 public IP를 구분해서 기록해야 헷갈리지 않습니다.",
  "서비스가 안 열리면 포트, 프로세스, 방화벽 순서로 보면 빨랐습니다.",
  "자동화는 편하지만 삭제 절차까지 같이 확인해야 비용을 줄일 수 있습니다.",
  "로그를 먼저 보면 원인을 훨씬 빨리 찾을 수 있었습니다.",
  "웹 콘솔에서 만든 값과 코드에 적은 값이 일치하는지 확인이 필요합니다.",
  "서버 내부 통신은 private subnet 기준으로 설계하는 편이 좋겠습니다.",
  "실습 후에는 반드시 리소스 정리 여부를 확인해야 합니다."
];

function buildPost(index) {
  const authorName = authors[index % authors.length];
  const topic = topics[index % topics.length];
  const action = actions[Math.floor(index / topics.length) % actions.length];
  const detail = details[Math.floor(index / (topics.length * actions.length)) % details.length];
  const round = String(index + 1).padStart(3, "0");

  return {
    title: `[${round}] ${topic} 실습 메모`,
    content: `${action}.\n\n${detail}\n\n자동 작성된 강의용 예시 게시글입니다.`,
    authorName
  };
}

module.exports = { authors, buildPost };
