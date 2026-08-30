const crypto = require("crypto");
const os = require("os");
const path = require("path");
const express = require("express");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const port = Number(process.env.PORT || 4000);
const instanceName = os.hostname();
const labStressEnabled = String(process.env.LAB_STRESS_ENABLED || "false").toLowerCase() === "true";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

app.use(express.json());
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const clientIp = forwardedFor || req.socket.remoteAddress || "-";

  res.set("X-Backend-Instance", instanceName);
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
    console.log(`[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms client=${clientIp}`);
  });
  next();
});

app.get("/api/instance", (req, res) => {
  res.json({ instance: instanceName, service: "chapter3-backend" });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "chapter3-backend", instance: instanceName });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

app.get("/api/stress", (req, res, next) => {
  if (!labStressEnabled) {
    res.status(404).json({ message: "Lab stress endpoint is disabled" });
    return;
  }

  const requestedIterations = Number.parseInt(req.query.iterations, 10);
  const iterations = Number.isFinite(requestedIterations)
    ? Math.min(Math.max(requestedIterations, 10000), 1000000)
    : 250000;
  const startedAt = process.hrtime.bigint();

  crypto.pbkdf2("ncp-auto-scaling-lab", instanceName, iterations, 32, "sha256", (error) => {
    if (error) {
      next(error);
      return;
    }

    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
    res.set("X-Lab-Stress-Iterations", String(iterations));
    res.set("X-Lab-Stress-Duration-Ms", elapsedMs.toFixed(1));
    res.type("text/plain").send("ok\n");
  });
});

app.get("/api/posts", async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, title, content, author_name AS authorName, created_at AS createdAt
      FROM posts
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.post("/api/posts", async (req, res, next) => {
  try {
    const title = String(req.body.title || "").trim();
    const content = String(req.body.content || "").trim();
    const authorName = String(req.body.authorName || "비가입 유저").trim() || "비가입 유저";

    if (!title || !content) {
      return res.status(400).json({ message: "title and content are required" });
    }

    const [result] = await pool.query(
      "INSERT INTO posts (title, content, author_name) VALUES (?, ?, ?)",
      [title, content, authorName]
    );

    const [rows] = await pool.query(
      `SELECT id, title, content, author_name AS authorName, created_at AS createdAt
       FROM posts WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.delete("/api/posts/:id", async (req, res, next) => {
  try {
    const [result] = await pool.query("DELETE FROM posts WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(port, () => {
  console.log(`Board backend running on port ${port}`);
});
