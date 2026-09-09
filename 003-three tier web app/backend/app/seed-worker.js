const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const dotenv = require("dotenv");
const { buildPost } = require("./sample-data");

dotenv.config({ path: path.join(__dirname, ".env") });

const enabled = String(process.env.AUTO_POST_ENABLED || "true").toLowerCase() === "true";
const port = Number(process.env.PORT || 4000);
const apiTarget = new URL(process.env.AUTO_POST_API_URL || `http://127.0.0.1:${port}/api/internal/sample-posts`);
// Existing lab .env files used the public posts path; retain their host/port.
if (/\/api\/posts\/?$/.test(apiTarget.pathname)) apiTarget.pathname = '/api/internal/sample-posts';
const apiUrl = apiTarget.toString();
const intervalSeconds = Number(process.env.AUTO_POST_INTERVAL_SECONDS || 60);
const totalPosts = Number(process.env.AUTO_POST_TOTAL || 300);
const stateFile = process.env.AUTO_POST_STATE_FILE || "/var/lib/board-service-post-seeder/progress.json";

function loadProgress() {
  try {
    const progress = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (Array.isArray(progress.usedIndexes)) {
      return [...new Set(progress.usedIndexes.filter((value) => Number.isInteger(value) && value >= 0 && value < totalPosts))];
    }

    if (Number.isInteger(progress.nextIndex) && progress.nextIndex > 0) {
      return Array.from({ length: Math.min(progress.nextIndex, totalPosts) }, (_, index) => index);
    }

    return [];
  } catch {
    return [];
  }
}

function saveProgress(usedIndexes) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const temporaryFile = `${stateFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify({
    usedIndexes,
    usedCount: usedIndexes.length,
    totalPosts,
    updatedAt: new Date().toISOString()
  }, null, 2));
  fs.renameSync(temporaryFile, stateFile);
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
  await postJson(apiUrl, { sampleIndex: index });
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

  if (!Number.isSafeInteger(totalPosts) || totalPosts < 1) {
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
