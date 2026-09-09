const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);
const stateDir = process.env.BOARD_STATE_DIR || "/var/lib/board-service-backend";
const cookieName = "board_session";
const sessionDuration = 2 * 60 * 60 * 1000;
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64, scryptOptions);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, salt, digest] = String(encoded).split("$");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(digest || "")) return false;
  const key = await scrypt(password, salt, 64, scryptOptions);
  return crypto.timingSafeEqual(key, Buffer.from(digest, "hex"));
}

function loadSecret() {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const filename = path.join(stateDir, "session-secret");
  try {
    fs.writeFileSync(filename, crypto.randomBytes(48).toString("hex"), { mode: 0o600, flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  return fs.readFileSync(filename, "utf8").trim();
}

function createAuth(pool) {
  const secret = loadSecret();
  const sign = (value) => crypto.createHmac("sha256", secret).update(value).digest("base64url");
  const cookieOptions = { httpOnly: true, sameSite: "strict", secure: process.env.COOKIE_SECURE === "true", path: "/" };
  const profile = (user) => ({ id: user.id, username: user.username, displayName: user.display_name, role: user.role });
  const tokenFrom = (req) => {
    const part = String(req.headers.cookie || "").split(";").map((value) => value.trim()).find((value) => value.startsWith(`${cookieName}=`));
    return part ? part.slice(cookieName.length + 1) : "";
  };
  const csrf = (token) => sign(`csrf:${token}`);
  const safeEqual = (a, b) => {
    const left = Buffer.from(String(a || ""));
    const right = Buffer.from(String(b || ""));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  };

  async function session(req) {
    const token = tokenFrom(req);
    if (!token || token.length > 1024) return null;
    const parts = token.split(".");
    if (parts.length !== 2 || !safeEqual(sign(parts[0]), parts[1])) return null;
    let data;
    try { data = JSON.parse(Buffer.from(parts[0], "base64url").toString()); } catch { return null; }
    if (!Number.isSafeInteger(data.id) || data.id <= 0 || !Number.isInteger(data.version) || !Number.isFinite(data.expires) || data.expires <= Date.now()) return null;
    const [rows] = await pool.execute("SELECT id, username, display_name, role, session_version FROM users WHERE id = ?", [data.id]);
    const user = rows[0];
    return user && user.session_version === data.version ? { user, token } : null;
  }

  function issue(res, user) {
    const body = Buffer.from(JSON.stringify({ id: user.id, version: user.session_version, expires: Date.now() + sessionDuration, nonce: crypto.randomBytes(16).toString("hex") })).toString("base64url");
    const token = `${body}.${sign(body)}`;
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionDuration });
    return { user: profile(user), csrfToken: csrf(token) };
  }

  function sameSiteRequest(req, res, next) {
    if (req.get("X-Requested-With") !== "board") return res.status(403).json({ message: "허용되지 않은 요청입니다." });
    next();
  }

  async function requireAdmin(req, res, next) {
    try {
      const current = await session(req);
      if (!current) return res.status(401).json({ message: "로그인이 필요합니다." });
      if (current.user.role !== "admin") return res.status(403).json({ message: "관리자만 공지를 관리할 수 있습니다." });
      if (req.method !== "GET" && !safeEqual(req.get("X-CSRF-Token"), csrf(current.token))) return res.status(403).json({ message: "요청 확인에 실패했습니다. 다시 로그인해 주세요." });
      req.currentSession = current;
      next();
    } catch (error) { next(error); }
  }

  return { profile, session, issue, requireAdmin, sameSiteRequest, csrf, safeEqual, cookieOptions, cookieName };
}

module.exports = { hashPassword, verifyPassword, createAuth, stateDir };
