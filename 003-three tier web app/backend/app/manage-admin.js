const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mysql = require("mysql2/promise");
const { hashPassword, verifyPassword, stateDir } = require("./auth");

async function main() {
  const username = process.argv[2] || "admin";
  const password = "admin";
  if (!/^[a-z0-9_]{3,32}$/.test(username)) throw new Error("Username must be 3-32 lowercase letters, numbers or underscores.");
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const [existing] = await connection.execute("SELECT id, role, password_hash FROM users WHERE username = ?", [username]);
    if (existing.length) {
      if (existing[0].role !== "admin") throw new Error("This username belongs to a member. No account was changed.");
      if (!await verifyPassword(password, existing[0].password_hash)) {
        await connection.execute("UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?", [await hashPassword(password), existing[0].id]);
      }
    } else {
      await connection.execute("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'admin')", [username, "관리자", await hashPassword(password)]);
    }
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    const credentialFile = path.join(stateDir, `initial-${username}.txt`);
    fs.writeFileSync(credentialFile, `username=${username}\npassword=${password}\n`, { mode: 0o600 });
    fs.chmodSync(credentialFile, 0o600);
    console.log(`Lab administrator ready: ${username} / ${password}`);
  } finally { await connection.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
