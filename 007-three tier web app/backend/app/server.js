const path = require("path");
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const port = Number(process.env.PORT || 4000);
const frontendOrigin = process.env.FRONTEND_ORIGIN || "*";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

app.use(cors({
  origin: frontendOrigin,
  methods: ["GET", "POST", "DELETE", "OPTIONS"]
}));
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", service: "chapter3-backend" });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
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
  console.log(`Chapter 3 backend running on port ${port}`);
});
