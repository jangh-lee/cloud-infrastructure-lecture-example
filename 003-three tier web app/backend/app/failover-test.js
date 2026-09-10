// 403 실습: 실행 → 정상 확인 → Enter → 콘솔 Failover → 자동 결과 출력.
// Backend 서비스는 계속 실행합니다. 이 파일은 DB Failover를 직접 실행하지 않습니다.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const readline = require('node:readline');
const { performance } = require('node:perf_hooks');

const RTO_SECONDS = 180; // 실습용 복구 시간 목표. Naver Cloud의 보장 시간이 아닙니다.
const STABLE = 3;
const TIMEOUT_MS = 5000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clock = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour12: false });

// 같은 서비스 도메인으로 매번 새 연결. 전체 작업이 5초를 넘으면 연결을 끊습니다.
async function withDb(config, work, driver = require('mysql2/promise')) {
  let connection, timer, expired = false;
  const task = (async () => {
    connection = await driver.createConnection({ ...config, connectTimeout: 3000 });
    if (expired) { connection.destroy(); throw new Error('TIMEOUT'); }
    return work(connection, () => expired);
  })();
  try {
    return await Promise.race([task, new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        connection?.destroy();
        reject(new Error('TIMEOUT'));
      }, TIMEOUT_MS);
    })]);
  } finally {
    clearTimeout(timer);
    connection?.destroy();
  }
}

async function writePost(config, item, ack, driver) {
  return withDb(config, async (db, expired) => {
    const [[identity]] = await db.query('SELECT @@hostname AS server, @@read_only AS read_only');
    await db.beginTransaction();
    const [insert] = await db.execute('INSERT INTO posts (title, content, author_name) VALUES (?, ?, ?)',
      [item.title, item.content, item.author]);
    await db.commit();
    if (expired()) throw new Error('TIMEOUT');
    ack(insert.insertId); // 성공 응답은 조회 전에 로컬 디스크에 기록합니다.
    const [[row]] = await db.execute('SELECT title, content FROM posts WHERE id = ?', [insert.insertId]);
    if (!row || row.title !== item.title || row.content !== item.content || identity.read_only !== 0) {
      throw new Error('READBACK_MISMATCH');
    }
    return identity.server;
  }, driver);
}

function health() {
  return new Promise(resolve => {
    let timer;
    const request = http.get('http://127.0.0.1:4000/api/health', response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        clearTimeout(timer);
        try { resolve(response.statusCode === 200 && JSON.parse(body).status === 'ok'); }
        catch { resolve(false); }
      });
      response.on('error', () => { clearTimeout(timer); resolve(false); });
    });
    timer = setTimeout(() => { request.destroy(); resolve(false); }, TIMEOUT_MS);
    request.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

// 실패 요청 시작부터 마지막 장애 뒤의 연속 3회 성공 구간 첫 완료까지.
function recoveryTime(samples, marker) {
  if (!marker) return { status: 'not_marked', seconds: null };
  const after = samples.filter(s => s.ms >= marker.ms);
  const first = after.find(s => !s.ok);
  if (!first) return { status: 'outage_not_observed', seconds: null };
  const lastBad = after.reduce((last, s, i) => s.ok ? last : i, -1);
  if (after.length - lastBad - 1 < STABLE) return { status: 'not_recovered', seconds: null };
  const recovered = after[lastBad + 1];
  return { status: 'recovered', seconds: Number(((recovered.ms - first.startMs) / 1000).toFixed(3)),
    firstFailureStart: first.startAt, firstErrorReceived: first.at, recoveredAt: recovered.at,
    confirmedAt: after[lastBad + STABLE].at };
}

function compareData(events, rows) {
  const attempts = events.filter(e => e.type === 'attempt');
  const acks = events.filter(e => e.type === 'ack');
  const byId = new Map(rows.map(row => [String(row.id), row]));
  const byTitle = new Map();
  for (const row of rows) byTitle.set(row.title, (byTitle.get(row.title) || 0) + 1);
  const missing = [], mismatch = [];
  for (const ack of acks) {
    const expected = attempts.find(e => e.seq === ack.seq), actual = byId.get(String(ack.id));
    if (!actual) missing.push(ack.id);
    else if (actual.title !== expected.title || actual.content !== expected.content) mismatch.push(ack.id);
  }
  const ackedSeq = new Set(acks.map(e => e.seq));
  const unknown = attempts.filter(e => !ackedSeq.has(e.seq));
  const titles = new Set(attempts.map(e => e.title));
  return { attempted: attempts.length, acknowledged: acks.length, missing, mismatch,
    duplicates: [...byTitle].filter(([, count]) => count > 1).map(([title]) => title),
    unexpected: rows.filter(row => !titles.has(row.title)).map(row => row.id),
    unacknowledgedStored: unknown.filter(e => byTitle.has(e.title)).map(e => e.seq),
    unacknowledgedAbsent: unknown.filter(e => !byTitle.has(e.title)).map(e => e.seq) };
}

async function report(file, config) {
  const events = fs.readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const meta = events[0], marker = events.find(e => e.type === 'marker');
  if (!events.some(e => e.type === 'stopped')) throw new Error('MEASUREMENT_NOT_STOPPED');
  if (meta.host !== config.host || meta.port !== config.port || meta.database !== config.database) throw new Error('DB_TARGET_CHANGED');
  const current = await withDb(config, async db => {
    const [[identity]] = await db.query('SELECT @@hostname AS server, @@read_only AS read_only');
    const [rows] = await db.execute('SELECT id, title, content FROM posts WHERE author_name = ?', [meta.author]);
    return { ...identity, rows };
  });
  const result = { db: recoveryTime(events.filter(e => e.type === 'db'), marker),
    api: recoveryTime(events.filter(e => e.type === 'api'), marker), data: compareData(events, current.rows),
    oldMaster: marker?.server || null, newMaster: current.server, readOnly: current.read_only,
    serverChanged: marker ? marker.server !== current.server : null, rtoTargetSeconds: meta.rtoTargetSeconds };
  fs.writeFileSync(file + '.result.json', JSON.stringify(result, null, 2) + '\n');
  const duration = value => value.seconds === null
    ? ({ not_marked: '시작 표시 없음', outage_not_observed: '중단 미관측 (0초라는 뜻이 아님)', not_recovered: '복구 확인 전 측정 종료' })[value.status]
    : `${value.seconds.toFixed(3)}초 / 목표 ${meta.rtoTargetSeconds}초 ${value.seconds <= meta.rtoTargetSeconds ? '이내' : '초과'}`;
  console.log('\n========== Failover 측정 결과 ==========');
  console.log(`Master 변경    : ${result.oldMaster || '?'} → ${result.newMaster} (${result.serverChanged ? '변경 확인' : '변경 확인 안 됨'})`);
  console.log(`DB 읽기·쓰기   : ${duration(result.db)}`);
  console.log(`Backend 조회   : ${duration(result.api)}`);
  console.log(`저장 성공 응답 : ${result.data.acknowledged}건 / 전체 시도 ${result.data.attempted}건`);
  console.log(`성공 데이터 유실 : ${result.data.missing.length}건 ${JSON.stringify(result.data.missing)}`);
  console.log(`본문 불일치      : ${result.data.mismatch.length}건 ${JSON.stringify(result.data.mismatch)}`);
  console.log(`중복 / 예상 외 글 : ${result.data.duplicates.length}건 / ${result.data.unexpected.length}건`);
  console.log(`응답 미확인 요청 : 저장됨 ${result.data.unacknowledgedStored.length}건 / 미저장 ${result.data.unacknowledgedAbsent.length}건 (유실과 구분)`);
  const intact = result.data.acknowledged > 0 && ['missing', 'mismatch', 'duplicates', 'unexpected'].every(k => result.data[k].length === 0);
  console.log(`데이터 대조    : ${intact ? '성공 응답 데이터 보존 확인' : '확인 필요'}`);
  console.log(`쓰기 허용      : ${current.read_only === 0 ? '예' : '아니오'}`);
  console.log(`결과 파일      : ${file}.result.json\n원본 기록      : ${file}`);
  console.log('수동 전환 시험 결과입니다. 콘솔 역할 변경과 게시판 기능도 확인하세요.');
  return result;
}

async function run(config) {
  const runId = crypto.randomUUID(), author = `failover-${runId}`;
  const directory = '/var/log/board-failover';
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${Date.now()}-${runId}.jsonl`);
  const fd = fs.openSync(file, 'wx', 0o600), events = [];
  const record = (type, fields = {}) => {
    const event = { type, at: new Date().toISOString(), ms: performance.now(), ...fields };
    fs.writeSync(fd, JSON.stringify(event) + '\n'); fs.fsyncSync(fd); events.push(event);
    return event;
  };
  record('start', { author, host: config.host, port: config.port, database: config.database, rtoTargetSeconds: RTO_SECONDS });
  let stop = false, marker, seq = 0, ready = false, stableSince = null, fatal = null;
  const state = { db: { ok: null, count: 0 }, api: { ok: null, count: 0 } };
  const input = readline.createInterface({ input: process.stdin, output: process.stdout });
  const requestStop = () => {
    if (stop) return;
    stop = true; console.log('\n측정을 종료하고 저장된 데이터를 대조합니다…');
  };
  process.on('SIGINT', requestStop); process.on('SIGTERM', requestStop);
  input.on('SIGINT', requestStop); input.on('close', requestStop);
  input.on('line', () => {
    if (marker || stop) return;
    if (!Object.values(state).every(s => s.ok && s.count >= STABLE && performance.now() - s.ms < 6000)) {
      console.log('[대기] DB와 Backend가 연속 3회 정상이어야 시작할 수 있습니다.'); return;
    }
    marker = record('marker', { server: state.db.server });
    console.log(`[${clock()} 시작 표시] 지금 콘솔의 Master DB Failover [예]를 누르세요.`);
  });
  async function monitor(channel) {
    while (!stop) {
      const startMs = performance.now(), startAt = new Date().toISOString();
      let ok = false, server, error;
      try {
        if (channel === 'db') {
          const item = { seq: ++seq, title: `[Failover] ${runId.slice(0, 8)} - ${seq}`, content: crypto.randomBytes(32).toString('hex'), author };
          record('attempt', item);
          server = await writePost(config, item, id => record('ack', { seq: item.seq, id }));
          ok = true;
        } else ok = await health();
      } catch (failure) {
        if (['ENOSPC', 'EIO', 'EBADF', 'EACCES'].includes(failure.code)) throw failure;
        error = failure.code || (failure.message === 'TIMEOUT' ? 'TIMEOUT' : 'DB_ERROR');
      }
      const sample = record(channel, { startMs, startAt, ok, server, error });
      if (state[channel].ok !== ok) console.log(`[${clock()} ${ok ? '정상' : '장애'}] ${channel === 'db' ? 'DB 읽기·쓰기' : 'Backend 조회'} ${ok ? '성공' : `실패 ${error || ''}`}`);
      state[channel] = { ...sample, count: ok ? state[channel].count + 1 : 0 };
      await sleep(Math.max(0, 1000 - (performance.now() - startMs)));
    }
  }
  console.log(`\n대상 DB: ${config.host} / ${config.database}\n기록: ${file}\n목표: ${RTO_SECONDS}초 / 시도 간격: 약 1초 / 요청 제한: 5초`);
  console.log('정상 상태를 확인한 뒤 Enter를 누르세요. Backend 서비스는 계속 실행합니다.');
  const ticker = setInterval(() => {
    if (stop) return;
    const good = Object.values(state).every(s => s.ok && s.count >= STABLE && performance.now() - s.ms < 6000);
    if (good && !ready) { ready = true; console.log('[준비 완료] 콘솔 Failover 확인 창을 열고, 여기서 Enter를 누른 다음 콘솔 [예]를 누르세요.'); }
    const recovered = marker && good && state.db.server !== marker.server;
    if (recovered && stableSince === null) console.log('[복구 관측] 새 Master에서 DB·API가 정상입니다. 30초 더 관찰한 뒤 결과를 출력합니다.');
    stableSince = recovered ? (stableSince ?? performance.now()) : null;
    const label = value => value === null ? '대기' : (value ? '정상' : '실패');
    console.log(`${clock()} | DB ${label(state.db.ok)} | API ${label(state.api.ok)} | 저장 성공 ${events.filter(e => e.type === 'ack').length}건 | Master ${state.db.server || '?'}`);
    if (stableSince !== null && performance.now() - stableSince >= 30000) requestStop();
  }, 2000);
  const limit = setTimeout(requestStop, 10 * 60 * 1000);
  try {
    await Promise.all(['db', 'api'].map(channel => monitor(channel).catch(error => { fatal = error; stop = true; })));
    if (!fatal) record('stopped');
  } finally {
    clearInterval(ticker); clearTimeout(limit); input.close(); fs.closeSync(fd);
    process.removeListener('SIGINT', requestStop); process.removeListener('SIGTERM', requestStop);
  }
  if (fatal) throw fatal;
  try { await report(file, config); }
  catch {
    process.exitCode = 1;
    console.log(`검증 미완료: DB 정상화 후 다시 실행하세요.\nsudo node ${__filename} --report ${file}`);
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('실행: sudo node failover-test.js\n재검증: sudo node failover-test.js --report /var/log/board-failover/실행기록.jsonl'); return;
  }
  const env = require('dotenv').parse(fs.readFileSync(path.join(__dirname, '.env')));
  if (!['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].every(k => env[k])) throw new Error('ENV_MISSING');
  const config = { host: env.DB_HOST, port: Number(env.DB_PORT || 3306), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME };
  if (process.argv[2] === '--report' && process.argv[3]) await report(path.resolve(process.argv[3]), config);
  else if (process.argv.length === 2) await run(config);
  else throw new Error('사용법: node failover-test.js [--report 기록파일]');
}

module.exports = { recoveryTime, compareData, writePost };
if (require.main === module) main().catch(error => { console.error('측정 중단:', error.code || error.message); process.exitCode = 1; });
