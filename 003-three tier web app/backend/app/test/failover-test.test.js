const test = require('node:test');
const assert = require('node:assert/strict');
const { recoveryTime, compareData, writePost } = require('../failover-test');
const sample = (start, end, ok) => ({ startMs: start * 1000, ms: end * 1000, ok,
  startAt: String(start), at: String(end) });
const marker = { ms: 1000 };

test('stable recovery includes the failed request timeout and ignores a transient success', () => {
  const result = recoveryTime([sample(0, .1, true), sample(2, 7, false), sample(8, 8.1, true),
    sample(9, 14, false), sample(15, 15.1, true), sample(16, 16.1, true), sample(17, 17.1, true)], marker);
  assert.equal(result.seconds, 13.1);
  assert.equal(result.firstErrorReceived, '7');
  assert.equal(result.recoveredAt, '15.1');
  assert.equal(result.confirmedAt, '17.1');
});

test('no failure is unobserved, and fewer than three successes is not recovery', () => {
  assert.equal(recoveryTime([sample(2, 3, true)], marker).status, 'outage_not_observed');
  assert.equal(recoveryTime([sample(2, 3, false), sample(4, 5, true)], marker).seconds, null);
  assert.equal(recoveryTime([], null).status, 'not_marked');
});

test('a later outage replaces the earlier recovery endpoint', () => {
  const samples = [sample(2, 3, false), ...[4, 5, 6].map(t => sample(t, t + .1, true)),
    sample(8, 9, false), ...[10, 11, 12].map(t => sample(t, t + .1, true))];
  assert.equal(recoveryTime(samples, marker).seconds, 8.1);
});

test('ACK loss and ambiguous commits are classified separately; content and duplicates checked', () => {
  const events = [1, 2, 3, 4].map(seq => ({ type: 'attempt', seq, title: `test-${seq}`, content: `body-${seq}` }));
  events.push({ type: 'ack', seq: 1, id: 101 }, { type: 'ack', seq: 2, id: 102 });
  const result = compareData(events, [{ id: 101, title: 'test-1', content: 'WRONG' },
    { id: 103, title: 'test-3', content: 'body-3' }, { id: 104, title: 'test-3', content: 'body-3' }]);
  assert.deepEqual(result.missing, [102]);
  assert.deepEqual(result.mismatch, [101]);
  assert.deepEqual(result.duplicates, ['test-3']);
  assert.deepEqual(result.unacknowledgedStored, [3]);
  assert.deepEqual(result.unacknowledgedAbsent, [4]);
});

test('a read failure after COMMIT retains the acknowledgement', async () => {
  const acks = [], operations = [];
  const db = {
    query: async () => [[{ server: 'master-a', read_only: 0 }]],
    beginTransaction: async () => operations.push('begin'),
    execute: async sql => {
      if (sql.startsWith('INSERT')) return [{ insertId: 321 }];
      assert.deepEqual(acks, [321]); throw new Error('read connection lost');
    },
    commit: async () => operations.push('commit'),
    destroy: () => operations.push('destroy')
  };
  await assert.rejects(writePost({}, { title: 'test', content: 'data', author: 'test' },
    id => acks.push(id), { createConnection: async () => db }));
  assert.deepEqual(acks, [321]);
  assert.deepEqual(operations, ['begin', 'commit', 'destroy']);
});

test('COMMIT without a successful response never creates a false ACK', async () => {
  let acknowledged = false;
  const db = {
    query: async () => [[{ server: 'master-a', read_only: 0 }]], beginTransaction: async () => {},
    execute: async () => [{ insertId: 321 }], commit: async () => { throw new Error('commit response lost'); },
    destroy: () => {}
  };
  await assert.rejects(writePost({}, { title: 'test', content: 'data', author: 'test' },
    () => { acknowledged = true; }, { createConnection: async () => db }));
  assert.equal(acknowledged, false);
});
