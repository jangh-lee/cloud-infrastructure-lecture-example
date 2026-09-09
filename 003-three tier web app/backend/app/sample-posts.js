const crypto = require('crypto');
const { hashPassword } = require('./auth');
const { authors, buildPost } = require('./sample-data');

const fields = 'id, title, content, author_id AS authorId, author_name AS authorName, created_at AS createdAt';

async function ensureMember(connection, authorIndex) {
  const [existing] = await connection.execute('SELECT id, role FROM users WHERE seed_author = ?', [authorIndex]);
  if (existing.length) {
    if (existing[0].role !== 'member') throw new Error('Sample author must have the member role');
    return existing[0].id;
  }
  // An internal marker identifies generated members; a matching display name alone never does.
  const username = `sample_${String(authorIndex + 1).padStart(2, '0')}_${crypto.randomBytes(6).toString('hex')}`;
  const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'));
  const [inserted] = await connection.execute(
    "INSERT INTO users (username, display_name, password_hash, role, seed_author) VALUES (?, ?, ?, 'member', ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)",
    [username, authors[authorIndex], passwordHash, authorIndex]
  );
  // A concurrent upsert may reuse a row created after this transaction's snapshot.
  const [rows] = await connection.execute('SELECT id, role, seed_author FROM users WHERE id = ? FOR UPDATE', [inserted.insertId]);
  if (rows[0]?.role !== 'member' || rows[0]?.seed_author !== authorIndex) throw new Error('Sample account identity conflict');
  return rows[0].id;
}

async function createSamplePost(pool, index) {
  const post = buildPost(index);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute(`SELECT ${fields} FROM posts WHERE seed_index = ?`, [index]);
    if (existing.length) {
      await connection.commit();
      return { post: existing[0] };
    }
    const authorId = await ensureMember(connection, index % authors.length);
    const [inserted] = await connection.execute(
      'INSERT INTO posts (title, content, author_name, author_id, seed_index) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
      [post.title, post.content, post.authorName, authorId, index]
    );
    const [rows] = await connection.execute(`SELECT ${fields} FROM posts WHERE id = ? FOR UPDATE`, [inserted.insertId]);
    await connection.commit();
    return { post: rows[0] };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

function registerSampleRoute(app, pool) {
  app.post('/api/internal/sample-posts', async (req, res, next) => {
    // Use the TCP peer, never forwarded headers supplied by a browser or proxy.
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
      return res.status(403).json({ message: 'Sample generation is only available on Backend localhost' });
    }
    const index = req.body.sampleIndex;
    const total = Number(process.env.AUTO_POST_TOTAL || 300);
    if (!Number.isSafeInteger(index) || index < 0 || index >= total) {
      return res.status(400).json({ message: 'Invalid sample index' });
    }
    try {
      const result = await createSamplePost(pool, index);
      res.json(result.post);
    } catch (error) { next(error); }
  });
}

module.exports = { ensureMember, createSamplePost, registerSampleRoute };
