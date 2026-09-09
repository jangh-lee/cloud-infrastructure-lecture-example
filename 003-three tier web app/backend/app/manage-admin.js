const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mysql = require("mysql2/promise");
const { hashPassword, stateDir } = require("./auth");

async function main() {
  const username = process.argv[2] || "admin";
  if (!/^[a-z0-9_]{3,32}$/.test(username)) throw new Error("Username must be 3-32 lowercase letters, numbers or underscores.");
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try {
    const [existing] = await connection.execute("SELECT id FROM users WHERE username = ?", [username]);
    if (existing.length) throw new Error("This username already exists. No account or password was changed.");
    const password = crypto.randomBytes(18).toString("base64url");
    const digest = await hashPassword(password);
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    const credentialFile = path.join(stateDir, `initial-${username}.txt`);
    // Prepare credentials before inserting, so an I/O error cannot strand the account.
    fs.writeFileSync(credentialFile, `username=${username}\npassword=${password}\n`, { mode: 0o600, flag: "wx" });
    try {
      await connection.execute("INSERT INTO users (username, display_name, password_hash, role) VALUES (?, ?, ?, 'admin')", [username, "관리자", digest]);
    } catch (error) {
      fs.unlinkSync(credentialFile);
      throw error;
    }
    console.log(`Administrator created. Read the initial credentials on Backend: sudo cat ${credentialFile}`);
  } finally { await connection.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
