const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const enabled = String(process.env.AUTO_POST_ENABLED || "false").toLowerCase() === "true";
const port = Number(process.env.PORT || 4000);
const apiUrl = process.env.AUTO_POST_API_URL || `http://127.0.0.1:${port}/api/posts`;
const intervalSeconds = Number(process.env.AUTO_POST_INTERVAL_SECONDS || 60);
const totalPosts = Number(process.env.AUTO_POST_TOTAL || 300);
const stateFile = process.env.AUTO_POST_STATE_FILE || "/var/lib/chapter3-post-seeder/progress.json";

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

function loadProgress() {
  try {
    const progress = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (Array.isArray(progress.usedIndexes)) {
      return progress.usedIndexes.filter((value) => Number.isInteger(value));
    }

    if (Number.isInteger(progress.nextIndex) && progress.nextIndex > 0) {
      return Array.from({ length: progress.nextIndex }, (_, index) => index);
    }

    return [];
  } catch {
    return [];
  }
}

function saveProgress(usedIndexes) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({
    usedIndexes,
    usedCount: usedIndexes.length,
    totalPosts,
    updatedAt: new Date().toISOString()
  }, null, 2));
}

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

function postJson(url, payload) {
  const target = new URL(url);
  const body = JSON.stringify(payload);
  const client = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      },
      timeout: 10000
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(responseBody);
          return;
        }
        reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function sendNext() {
  const usedIndexes = loadProgress();
  const usedSet = new Set(usedIndexes);

  if (usedSet.size >= totalPosts) {
    console.log(`auto post seeder complete: ${totalPosts}/${totalPosts}`);
    return false;
  }

  let index;
  do {
    index = Math.floor(Math.random() * totalPosts);
  } while (usedSet.has(index));

  const post = buildPost(index);
  await postJson(apiUrl, post);
  usedIndexes.push(index);
  saveProgress(usedIndexes);
  console.log(`created sample post ${usedIndexes.length}/${totalPosts}: sample=${index + 1} ${post.title} by ${post.authorName}`);
  return true;
}

async function main() {
  if (!enabled) {
    console.log("auto post seeder disabled. Set AUTO_POST_ENABLED=true to enable it.");
    return;
  }

  if (!Number.isFinite(intervalSeconds) || intervalSeconds < 1) {
    throw new Error("AUTO_POST_INTERVAL_SECONDS must be 1 or greater");
  }

  if (!Number.isFinite(totalPosts) || totalPosts < 1) {
    throw new Error("AUTO_POST_TOTAL must be 1 or greater");
  }

  console.log(`auto post seeder started: api=${apiUrl} interval=${intervalSeconds}s total=${totalPosts}`);

  while (await sendNext()) {
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

main().catch((error) => {
  console.error(`auto post seeder failed: ${error.message}`);
  process.exit(1);
});
