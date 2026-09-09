const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

process.env.BOARD_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'board-auth-test-'));
const { hashPassword, verifyPassword } = require('../auth');
const accounts = require('../accounts');

// In-memory SQL boundary; tests exercise the actual HTTP/auth handlers and crypto.
function memoryPool() {
  const users = [];
  const notices = [];
  return {
    users, notices,
    async execute(sql, args) {
      if (sql.startsWith('SELECT')) return [users.filter((u) => sql.includes('username = ?') ? u.username === args[0] : u.id === args[0])];
      if (sql.startsWith('INSERT INTO users')) {
        if (users.some((u) => u.username === args[0])) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
        users.push({ id: users.length + 1, username: args[0], display_name: args[1], password_hash: args[2], role: 'member', session_version: 0 });
        return [{ insertId: users.length }];
      }
      if (sql.startsWith('UPDATE users')) { users.find((u) => u.id === args[0]).session_version++; return [{}]; }
      if (sql.startsWith('INSERT INTO notices')) {
        notices.push({ id: notices.length + 1, created_by: args[0], mode: args[1], title: args[2], message: args[3] });
        return [{ insertId: notices.length }];
      }
      throw new Error('Unexpected SQL');
    },
    async query(sql) {
      if (sql.includes('JOIN users')) return [notices.slice().reverse()];
      if (sql.includes('FROM notices')) return [notices.slice(-1)];
      throw new Error('Unexpected query');
    }
  };
}

after(() => fs.rmSync(process.env.BOARD_STATE_DIR, { recursive: true, force: true }));

test('scrypt salts differ; only the correct password verifies', async () => {
  const a = await hashPassword('sample-password');
  const b = await hashPassword('sample-password');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('sample-password', a), true);
  assert.equal(await verifyPassword('incorrect', a), false);
  assert.equal(await verifyPassword('anything', 'invalid-hash'), false);
});

test('HTTP member/admin permissions, CSRF, cookie tampering and logout', async (t) => {
  const pool = memoryPool();
  pool.users.push({ id: 1, username: 'admin', display_name: '관리자', password_hash: await hashPassword('test-admin-password'), role: 'admin', session_version: 0 });
  const app = express();
  app.use(express.json());
  accounts(app, pool);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (url, body, session = {}, extra = {}) => {
    const response = await fetch(base + url, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'board', Cookie: session.cookie || '', 'X-CSRF-Token': session.csrfToken || '', ...extra },
      body: body && JSON.stringify(body)
    });
    return { status: response.status, data: response.status === 204 ? null : await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  };
  assert.equal((await call('/api/admin/notices')).status, 401);
  assert.equal((await call('/api/auth/login', { username: 'admin', password: 'incorrect' })).status, 401);
  const signup = { username: 'member', password: 'member-password', displayName: '회원', role: 'admin' };
  assert.equal((await call('/api/auth/register', signup, {}, { 'X-Requested-With': '' })).status, 403);
  const member = await call('/api/auth/register', signup);
  assert.equal(member.status, 201);
  assert.equal(member.data.user.role, 'member');
  assert.equal(pool.users[1].role, 'member');
  assert.notEqual(pool.users[1].password_hash, signup.password);
  assert.equal((await call('/api/auth/register', signup)).status, 409);
  assert.equal((await call('/api/admin/notices', undefined, member)).status, 403);
  assert.equal((await call('/api/admin/notices', { mode: 'normal' }, { cookie: member.cookie, csrfToken: member.data.csrfToken })).status, 403);
  assert.equal((await call('/api/auth/login', { ...signup, admin: true })).status, 403);

  const login = await call('/api/auth/login', { username: 'admin', password: 'test-admin-password', admin: true });
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal('password_hash' in login.data.user, false);
  const admin = { cookie: login.cookie, csrfToken: login.data.csrfToken };
  assert.equal((await call('/api/admin/notices', { mode: 'normal' }, { cookie: admin.cookie })).status, 403);
  assert.equal((await call('/api/admin/notices', undefined, { cookie: admin.cookie + 'tampered' })).status, 401);
  assert.equal((await call('/api/admin/notices', { mode: 'invalid' }, admin)).status, 400);
  assert.equal((await call('/api/admin/notices', { mode: 'announce', title: '', message: 'body' }, admin)).status, 400);
  const saved = await call('/api/admin/notices', { mode: 'announce', title: '<script>test</script>', message: '한글 공지', created_by: 999 }, admin);
  assert.equal(saved.status, 201);
  assert.equal(pool.notices[0].created_by, 1);
  assert.equal((await call('/api/notice')).data.message, '한글 공지');
  assert.equal((await call('/api/admin/notices', undefined, admin)).data.length, 1);
  assert.equal((await call('/api/auth/logout', {}, { cookie: admin.cookie })).status, 403);
  assert.equal((await call('/api/auth/logout', {}, admin)).status, 204);
  assert.equal((await call('/api/admin/notices', undefined, admin)).status, 401);
  assert.equal((await call('/api/auth/session', undefined, admin)).data.user, null);
});
