const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const { authors, buildPost } = require('./sample-data');
const { ensureMember } = require('./sample-posts');

async function backfill(connection) {
  let linked = 0;
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query('SELECT id, title, content, author_name FROM posts WHERE author_id IS NULL ORDER BY id');
    for (const row of rows) {
      const match = /^\[(\d+)\] /.exec(row.title);
      if (!match) continue;
      const index = Number(match[1]) - 1;
      if (!Number.isSafeInteger(index) || index < 0 || index > 4294967295) continue;
      const expected = buildPost(index);
      if (row.title !== expected.title || row.content !== expected.content || row.author_name !== expected.authorName) continue;
      const authorId = await ensureMember(connection, index % authors.length);
      const [used] = await connection.execute('SELECT id FROM posts WHERE seed_index = ?', [index]);
      // Preserve even historical duplicate rows; only one owns the retry key.
      await connection.execute('UPDATE posts SET author_id = ?, seed_index = ? WHERE id = ? AND author_id IS NULL', [authorId, used.length ? null : index, row.id]);
      linked++;
    }
    await connection.commit();
    return linked;
  } catch (error) { await connection.rollback(); throw error; }
}

async function main() {
  const connection = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  try { console.log(`Existing sample posts linked to members: ${await backfill(connection)}`); }
  finally { await connection.end(); }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { backfill };
