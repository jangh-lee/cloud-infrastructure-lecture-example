const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const express = require('express');
const mysql = require('mysql2/promise');
const { buildPost } = require('../sample-data');
const { createSamplePost, registerSampleRoute } = require('../sample-posts');
const { backfill } = require('../backfill-sample-members');

test('sample endpoint rejects external peers, including forged forwarded headers', async () => {
  let handler;
  registerSampleRoute({ post: (url, fn) => { handler = fn; } }, {});
  let status;
  const res = { status(code) { status = code; return this; }, json() {} };
  await handler({ socket: { remoteAddress: '10.10.110.7' }, headers: { 'x-forwarded-for': '127.0.0.1' }, body: { sampleIndex: 0 } }, res);
  assert.equal(status, 403);
  await handler({ socket: { remoteAddress: '127.0.0.1' }, body: { sampleIndex: -1 } }, res);
  assert.equal(status, 400);
});

// Run only against a disposable DB whose name starts with board_seed_check_.
test('real DB: member reuse, retries, rollback, historical posts and worker progress', { skip: !process.env.TEST_DB_NAME }, async (t) => {
  assert.match(process.env.TEST_DB_NAME, /^board_seed_check_[a-z0-9_]+$/);
  const pool = mysql.createPool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.TEST_DB_NAME, connectionLimit: 5 });
  t.after(() => pool.end());
  const count = async (table) => (await pool.query(`SELECT COUNT(*) AS n FROM ${table}`))[0][0].n;

  const first = await createSamplePost(pool, 0);
  const repeat = await createSamplePost(pool, 0);
  const sameAuthor = await createSamplePost(pool, 20);
  assert.equal(first.post.id, repeat.post.id);
  assert.equal(first.post.authorId, sameAuthor.post.authorId);
  assert.equal(await count('users'), 1);
  assert.equal(await count('posts'), 2);
  const [members] = await pool.query('SELECT * FROM users');
  assert.equal(members[0].role, 'member');
  assert.match(members[0].password_hash, /^scrypt\$/);
  const concurrent = await Promise.all([createSamplePost(pool, 2), createSamplePost(pool, 2)]);
  assert.equal(concurrent[0].post.id, concurrent[1].post.id);
  assert.equal(await count('users'), 2);
  assert.equal(await count('posts'), 3);

  const failingPool = {
    async getConnection() {
      const connection = await pool.getConnection();
      return new Proxy(connection, { get(target, key) {
        if (key === 'execute') return (sql, args) => {
          if (sql.startsWith('INSERT INTO posts')) throw new Error('Injected post write failure');
          return target.execute(sql, args);
        };
        return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
      } });
    }
  };
  await assert.rejects(createSamplePost(failingPool, 3), /Injected/);
  assert.equal(await count('users'), 2, 'failed post must roll back new member');
  assert.equal(await count('posts'), 3);

  const old = buildPost(9);
  for (const content of [old.content, old.content, '수동으로 작성한 다른 글']) {
    await pool.execute('INSERT INTO posts (title, content, author_name) VALUES (?, ?, ?)', [old.title, content, old.authorName]);
  }
  const [before] = await pool.query('SELECT id, title, content, author_name, created_at FROM posts ORDER BY id');
  const connection = await pool.getConnection();
  try {
    assert.equal(await backfill(connection), 2);
    assert.equal(await backfill(connection), 0);
  } finally { connection.release(); }
  const [after] = await pool.query('SELECT id, title, content, author_name, created_at FROM posts ORDER BY id');
  assert.deepEqual(after, before);
  const [historical] = await pool.execute('SELECT author_id, seed_index FROM posts WHERE title = ? ORDER BY id', [old.title]);
  assert.equal(historical[0].author_id, historical[1].author_id);
  assert.equal(historical[0].seed_index, 9);
  assert.equal(historical[1].seed_index, null);
  assert.equal(historical[2].author_id, null);

  const app = express();
  app.use(express.json());
  let requests = 0;
  app.use((req, res, next) => { requests++; next(); });
  registerSampleRoute(app, pool);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sample-worker-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, AUTO_POST_ENABLED: 'true', AUTO_POST_TOTAL: '1', AUTO_POST_INTERVAL_SECONDS: '1', AUTO_POST_API_URL: `http://127.0.0.1:${server.address().port}/api/posts`, AUTO_POST_STATE_FILE: path.join(dir, 'progress.json') };
  await execFile(process.execPath, [path.join(__dirname, '../seed-worker.js')], { env, timeout: 15000 });
  assert.deepEqual(JSON.parse(fs.readFileSync(env.AUTO_POST_STATE_FILE)).usedIndexes, [0]);
  assert.equal(requests, 1);
  await execFile(process.execPath, [path.join(__dirname, '../seed-worker.js')], { env, timeout: 15000 });
  assert.equal(requests, 1, 'completed worker must preserve progress across restarts');
  assert.equal(await count('posts'), 6, 'retrying a sample must not duplicate the row');
  const [orphans] = await pool.query('SELECT COUNT(*) AS n FROM posts p LEFT JOIN users u ON u.id=p.author_id WHERE p.author_id IS NOT NULL AND u.id IS NULL');
  assert.equal(orphans[0].n, 0);
});
