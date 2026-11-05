// T56c — EC2 Redis 프록시 읽기 합치기(scripts/lib/redis-read-coalescer.js)
import test from 'node:test';
import assert from 'node:assert/strict';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createReadCoalescer } = require('../scripts/lib/redis-read-coalescer');

const big = (tag: string) => JSON.stringify({ result: tag + 'x'.repeat(300 * 1024) });
const deferred = <T,>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('같은 키 동시 GET 은 Redis 읽기 1회로 합친다', async () => {
  const c = createReadCoalescer();
  let calls = 0;
  const d = deferred<string>();
  const read = () => { calls++; return d.promise; };
  const ps = Array.from({ length: 500 }, () => c.get('intrinio:eod:snapshot', read));
  await Promise.resolve(); await Promise.resolve();
  d.resolve('{"result":1}');
  const out = await Promise.all(ps);
  assert.equal(calls, 1);
  assert.ok(out.every((b) => b === '{"result":1}'));
  assert.equal(c.snapshot().joined, 499);
  assert.equal(c.snapshot().inflight, 0);
});

test('작은 값은 메모하지 않는다 — 끝난 뒤의 읽기는 다시 Redis 로', async () => {
  const c = createReadCoalescer();
  let calls = 0;
  const read = async () => { calls++; return '{"result":' + calls + '}'; };
  assert.equal(await c.get('price:NVDA', read), '{"result":1}');
  assert.equal(await c.get('price:NVDA', read), '{"result":2}');
  assert.equal(calls, 2);
});

test('큰 값(≥256KB)은 2초 메모 — 지나면 다시 읽는다', async () => {
  let t = 1000;
  const c = createReadCoalescer({ now: () => t });
  let calls = 0;
  const read = async () => { calls++; return big('v' + calls); };
  const a = await c.get('finra:offexchange', read);
  t += 1999;
  assert.equal(await c.get('finra:offexchange', read), a);
  assert.equal(calls, 1);
  t += 1;
  const b = await c.get('finra:offexchange', read);
  assert.equal(calls, 2);
  assert.notEqual(a, b);
});

test('쓰기 무효화 — 쓰기 뒤 읽기는 진행 중이던 옛 읽기와 합치지 않고, 옛 읽기는 메모되지 않는다', async () => {
  const c = createReadCoalescer();
  const old = deferred<string>();
  let calls = 0;
  const p1 = c.get('k', () => { calls++; return old.promise; });
  await Promise.resolve();
  c.invalidate(['k']);                      // /set 이 들어왔다
  const p2 = c.get('k', async () => { calls++; return big('new'); });
  old.resolve(big('old'));
  assert.ok((await p1).includes('old'));
  assert.ok((await p2).includes('new'));
  assert.equal(calls, 2);
  // 메모에는 새 값만 남는다
  assert.ok((await c.get('k', async () => { calls++; return big('third'); })).includes('new'));
  assert.equal(calls, 2);
});

test('쓰기는 그 키의 메모를 지운다', async () => {
  const c = createReadCoalescer();
  let n = 0;
  const read = async () => big('v' + ++n);
  await c.get('k', read);
  c.invalidate(['k']);
  assert.ok((await c.get('k', read)).includes('v2'));
});

test('읽기 실패는 합쳐진 요청 모두에 전달되고 다음 요청은 새로 읽는다', async () => {
  const c = createReadCoalescer();
  const d = deferred<string>();
  const ps = [c.get('k', () => d.promise), c.get('k', () => d.promise)];
  d.reject(new Error('ECONNRESET'));
  for (const p of ps) await assert.rejects(p, /ECONNRESET/);
  assert.equal(await c.get('k', async () => '{"result":null}'), '{"result":null}');
});

test('MGET 은 같은 키 목록끼리만 합치고, 포함된 키가 쓰이면 풀린다', async () => {
  const c = createReadCoalescer();
  const d = deferred<string>();
  let calls = 0;
  const r = () => { calls++; return d.promise; };
  const p1 = c.mget(['a', 'b'], r);
  const p2 = c.mget(['a', 'b'], r);
  const p3 = c.mget(['a', 'c'], async () => { calls++; return '{"results":[]}'; });
  await Promise.resolve();
  c.invalidate(['b']);
  const p4 = c.mget(['a', 'b'], async () => { calls++; return '{"results":[2]}'; });
  d.resolve('{"results":[1]}');
  assert.deepEqual(await Promise.all([p1, p2, p3, p4]), ['{"results":[1]}', '{"results":[1]}', '{"results":[]}', '{"results":[2]}']);
  assert.equal(calls, 3);
});

test('메모 총량 상한 — 오래된 것부터 버린다', async () => {
  const c = createReadCoalescer({ memoMaxBytes: 700 * 1024 });
  await c.get('a', async () => big('a'));
  await c.get('b', async () => big('b'));
  await c.get('c', async () => big('c'));
  const s = c.snapshot();
  assert.equal(s.memoKeys, 2);
  assert.ok(s.memoBytes <= 700 * 1024);
  let calls = 0;
  await c.get('a', async () => { calls++; return big('a2'); });
  assert.equal(calls, 1);
});

test('프록시가 모듈을 불러 /get·/mget·쓰기 경로에 연결했다', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const src: string = require('node:fs').readFileSync(require('node:path').join(__dirname, '../scripts/ec2-redis-proxy.js'), 'utf8');
  assert.match(src, /coalescer\.get\(key, read\)/);
  assert.match(src, /coalescer\.mget\(keys, read\)/);
  // 쓰기 경로 5곳(/set-if-newer·cash-close·/set·/mset·/del) 모두 쓰기 전·후 무효화
  assert.equal((src.match(/coalescer\.invalidate\(/g) || []).length, 10);
  // 모듈이 없어도 뜬다(직접 읽기)
  assert.match(src, /read coalescer unavailable/);
});
