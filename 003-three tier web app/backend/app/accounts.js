const { hashPassword, verifyPassword, createAuth } = require("./auth");

module.exports = function accounts(app, pool) {
  const auth = createAuth(pool);
  const attempts = new Map();
  const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
  const fields = (req) => ({ username: String(req.body.username || "").trim().toLowerCase(), password: String(req.body.password || "") });
  const validUsername = (name) => /^[a-z0-9_]{3,32}$/.test(name);
  let globalAttempts = { count: 0, until: 0 };
  function limit(req, res, next) {
    const now = Date.now();
    if (globalAttempts.until < now) globalAttempts = { count: 0, until: now + 60000 };
    const key = fields(req).username.slice(0, 32);
    for (const [name, item] of attempts) if (item.until < now) attempts.delete(name);
    const item = attempts.get(key) || { count: 0, until: now + 10 * 60000 };
    if (++globalAttempts.count > 60 || ++item.count > 12) {
      res.set("Retry-After", "60");
      return res.status(429).json({ message: "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." });
    }
    attempts.set(key, item);
    next();
  }

  app.get("/api/auth/session", wrap(async (req, res) => {
    const current = await auth.session(req);
    res.json(current ? { user: auth.profile(current.user), csrfToken: auth.csrf(current.token) } : { user: null, csrfToken: null });
  }));

  app.post("/api/auth/register", auth.sameSiteRequest, limit, wrap(async (req, res) => {
    const { username, password } = fields(req);
    const displayName = String(req.body.displayName || "").trim();
    if (!validUsername(username) || password.length < 10 || password.length > 128 || !displayName || displayName.length > 50) {
      return res.status(400).json({ message: "아이디는 영문 소문자·숫자·밑줄 3~32자, 비밀번호는 10~128자, 이름은 1~50자로 입력해 주세요." });
    }
    const passwordHash = await hashPassword(password);
    let result;
    try {
      [result] = await pool.execute("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'member')", [username, displayName, passwordHash]);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "이미 사용 중인 아이디입니다." });
      throw error;
    }
    const user = { id: result.insertId, username, display_name: displayName, role: "member", session_version: 0 };
    res.status(201).json(auth.issue(res, user));
  }));

  app.post("/api/auth/login", auth.sameSiteRequest, limit, wrap(async (req, res) => {
    const { username, password } = fields(req);
    if (!validUsername(username) || password.length > 128) return res.status(401).json({ message: "아이디 또는 비밀번호를 확인해 주세요." });
    const [rows] = await pool.execute("SELECT * FROM users WHERE username = ?", [username]);
    const user = rows[0];
    if (!user || !await verifyPassword(password, user.password_hash)) return res.status(401).json({ message: "아이디 또는 비밀번호를 확인해 주세요." });
    if (req.body.admin === true && user.role !== "admin") return res.status(403).json({ message: "관리자 계정으로 로그인해 주세요." });
    attempts.delete(username);
    res.json(auth.issue(res, user));
  }));

  app.post("/api/auth/logout", auth.sameSiteRequest, wrap(async (req, res) => {
    const current = await auth.session(req);
    if (current) {
      if (!auth.safeEqual(req.get("X-CSRF-Token"), auth.csrf(current.token))) return res.status(403).json({ message: "요청 확인에 실패했습니다." });
      await pool.execute("UPDATE users SET session_version = session_version + 1 WHERE id = ?", [current.user.id]);
    }
    res.clearCookie(auth.cookieName, auth.cookieOptions);
    res.status(204).end();
  }));

  app.get("/api/notice", wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT id, mode, title, message, created_at AS updatedAt FROM notices ORDER BY id DESC LIMIT 1");
    res.json(rows[0] || null);
  }));

  app.get("/api/admin/notices", auth.requireAdmin, wrap(async (req, res) => {
    const [rows] = await pool.query("SELECT n.id, n.mode, n.title, n.message, n.created_at AS createdAt, u.display_name AS authorName FROM notices n JOIN users u ON u.id = n.created_by ORDER BY n.id DESC LIMIT 30");
    res.json(rows);
  }));

  app.post("/api/admin/notices", auth.requireAdmin, wrap(async (req, res) => {
    const mode = String(req.body.mode || "");
    const title = mode === "normal" ? "" : String(req.body.title || "").trim();
    const message = mode === "normal" ? "" : String(req.body.message || "").trim();
    if (!["announce", "maintenance", "normal"].includes(mode) || (mode !== "normal" && (!title || !message)) || title.length > 200 || message.length > 10000) {
      return res.status(400).json({ message: "표시 방식, 제목(200자 이내), 내용(10000자 이내)을 확인해 주세요." });
    }
    const [result] = await pool.execute("INSERT INTO notices (created_by, mode, title, message) VALUES (?, ?, ?, ?)", [req.currentSession.user.id, mode, title, message]);
    res.status(201).json({ id: result.insertId, mode, title, message });
  }));
};
