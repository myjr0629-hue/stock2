// 2026-11-14 — 큰 체인 값 gzip 저장(redis-codec.js · redisValueCodec.ts) 시험
//   ① 왕복 ② 옛 평문 값 그대로 ③ 손상 값 → null(예외 없음) ④ 대상 키만 압축(meta·latest-eod·다른 키 무변경)
//   ⑤ JS(Lambda 2곳)·TS(Vercel) 교차 왕복·JS 두 사본 바이트 동일 ⑥ EC2 프록시(JSON 문자열)·Upstash 경유 형태 그대로 해제
//   ⑦ redisClient 의 get/mget/set 이 압축 값을 풀고, 대상 키만 압축해 쓴다(가짜 프록시)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { GZ_MARK, decodeStoredValue, decodeStoredValues, encodeForKey, shouldCompressKey } from '../src/lib/redisValueCodec';

const ROOT = path.resolve(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsCodec = require('../scripts/lambda-flow-harvest/redis-codec.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const xsCodec = require('../scripts/lambda-xs/redis-codec.js');

const chain = (n: number) => ({
  chain: Array.from({ length: n }, (_, i) => ({
    option: { code: `NVDA261120C${String(100 + i).padStart(5, '0')}000`, type: i % 2 ? 'put' : 'call', strike: 100 + i, expiration: '2026-11-20' },
    prices: { date: '2026-11-13', open_interest: 1000 + i, implied_volatility: 0.45 + i / 1e4, delta: 0.5, gamma: 0.01, close: 1.23 },
  })),
  note: '한글·日本語 ✓',
});
const probe = { probeResults: chain(300).chain, chainDate: '2026-11-13', chainDates: { '2026-11-20': '2026-11-13' }, weeklyExpiry: '2026-11-20', _ts: 1763100000000, _source: 'lambda-flow-harvest' };

test('대상 키 판정 — 체인·프로브 본문만, meta·latest-eod·다른 키는 아님', () => {
  for (const c of [shouldCompressKey, jsCodec.shouldCompressKey]) {
    assert.equal(c('polygon:snapshot:probe:NVDA'), true);
    assert.equal(c('polygon:snapshot:probe:BRK.B'), true);
    assert.equal(c('polygon:snapshot:probe:meta:NVDA'), false);
    assert.equal(c('intrinio:chain:NVDA:2026-11-20'), true);
    assert.equal(c('intrinio:chain:latest-eod'), false);
    assert.equal(c('intrinio:options:oi'), false);
    assert.equal(c('structure:v2:NVDA'), false);
    assert.equal(c('polygon:snapshot:probe:'), false);
  }
});

test('왕복 — 내용 동일 · 표식 · 크기 감소', () => {
  for (const key of ['polygon:snapshot:probe:NVDA', 'intrinio:chain:NVDA:2026-11-20']) {
    const v = key.startsWith('intrinio') ? chain(400) : probe;
    const enc = encodeForKey(key, v) as string;
    assert.equal(typeof enc, 'string');
    assert.ok(enc.startsWith(GZ_MARK));
    assert.ok(enc.length * 3 < JSON.stringify(v).length, `압축률 ${JSON.stringify(v).length}/${enc.length}`);
    assert.deepEqual(decodeStoredValue(enc), v);
    assert.deepEqual(jsCodec.decodeStoredValue(enc), v);
  }
});

test('대상 아닌 키·객체 아닌 값은 그대로', () => {
  const meta = { chainDate: '2026-11-13', _ts: 1 };
  assert.equal(encodeForKey('polygon:snapshot:probe:meta:NVDA', meta), meta);
  assert.equal(encodeForKey('intrinio:chain:latest-eod', meta), meta);
  assert.equal(encodeForKey('polygon:snapshot:probe:NVDA', 'x'), 'x');
  assert.equal(encodeForKey('polygon:snapshot:probe:NVDA', 5), 5);
  assert.equal(encodeForKey('polygon:snapshot:probe:NVDA', null), null);
  assert.equal(jsCodec.encodeForKey('structure:v2:NVDA', meta), meta);
});

test('옛 평문 값(표식 없음)은 그대로 — 혼재 기간 하위 호환', () => {
  for (const d of [decodeStoredValue, jsCodec.decodeStoredValue]) {
    assert.deepEqual(d(probe), probe);
    assert.deepEqual(d([1, 2]), [1, 2]);
    assert.equal(d('plain string'), 'plain string');
    assert.equal(d('gz2:abc'), 'gz2:abc');
    assert.equal(d(42), 42);
    assert.equal(d(null), null);
  }
  assert.equal(decodeStoredValue(undefined), null);
  assert.deepEqual(decodeStoredValues([probe, null, encodeForKey('intrinio:chain:A:2026-11-20', { chain: [1] })]), [probe, null, { chain: [1] }]);
});

test('손상 값 → null(캐시 미스) · 예외 없음', () => {
  const enc = encodeForKey('polygon:snapshot:probe:NVDA', probe) as string;
  const bad = [
    GZ_MARK,                                   // 빈 본문
    GZ_MARK + '!!!!not-base64!!!!',            // base64 아님
    GZ_MARK + Buffer.from('{"a":1}').toString('base64'), // gzip 아님
    enc.slice(0, Math.floor(enc.length / 2)),  // 잘린 값
    GZ_MARK + gzipSync(Buffer.from('{not json')).toString('base64'), // 풀리지만 JSON 아님
  ];
  for (const b of bad) {
    assert.doesNotThrow(() => decodeStoredValue(b));
    assert.equal(decodeStoredValue(b), null);
    assert.equal(jsCodec.decodeStoredValue(b), null);
    assert.equal(xsCodec.decodeStoredValue(b), null);
  }
});

test('JS(Lambda)↔TS(Vercel) 교차 왕복 · Lambda 두 사본 바이트 동일', () => {
  const k = 'polygon:snapshot:probe:NVDA';
  assert.deepEqual(decodeStoredValue(jsCodec.encodeForKey(k, probe)), probe);
  assert.deepEqual(jsCodec.decodeStoredValue(encodeForKey(k, probe)), probe);
  assert.deepEqual(xsCodec.decodeStoredValue(jsCodec.encodeForKey(k, probe)), probe);
  assert.equal(
    fs.readFileSync(path.join(ROOT, 'scripts/lambda-flow-harvest/redis-codec.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'scripts/lambda-xs/redis-codec.js'), 'utf8'),
  );
});

test('저장소 경유 형태 — EC2 프록시(JSON.stringify→JSON.parse)·Upstash 원문 저장 모두 같은 문자열로 돌아와 풀린다', () => {
  const enc = encodeForKey('intrinio:chain:NVDA:2026-11-20', chain(50)) as string;
  const viaProxy = JSON.parse(JSON.stringify({ result: JSON.parse(JSON.stringify(enc)) })).result; // 프록시 /set 직렬화 → /get 응답
  assert.equal(viaProxy, enc);
  assert.deepEqual(decodeStoredValue(viaProxy), chain(50));
  // Upstash(Lambda 폴백): ['SET', k, JSON.stringify(value)] → GET → JSON.parse
  assert.deepEqual(jsCodec.decodeStoredValue(JSON.parse(JSON.stringify(enc))), chain(50));
});

// ── redisClient 통합(가짜 EC2 프록시) ─────────────────────────────────────
test('redisClient — get/mget 은 압축·평문 모두 풀어 주고, setInCache 는 대상 키만 압축해 쓴다', async () => {
  const store = new Map<string, string>(); // 프록시처럼 JSON 문자열 저장
  const server = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    if (req.method === 'GET' && u.pathname === '/get') {
      const v = store.get(u.searchParams.get('key') || '');
      return res.end(JSON.stringify({ result: v ? JSON.parse(v) : null }));
    }
    if (req.method === 'GET' && u.pathname === '/mget') {
      const ks = (u.searchParams.get('keys') || '').split(',');
      return res.end(JSON.stringify({ results: ks.map((k) => { const v = store.get(k); return v ? JSON.parse(v) : null; }) }));
    }
    if (req.method === 'POST' && u.pathname === '/set') {
      let b = ''; req.on('data', (c) => b += c); req.on('end', () => { const j = JSON.parse(b); store.set(j.key, JSON.stringify(j.value)); res.end('{"ok":true}'); });
      return;
    }
    res.statusCode = 404; res.end('{}');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as any).port;
  const env = { ...process.env };
  process.env.EC2_REDIS_PROXY_URL = `http://127.0.0.1:${port}`;
  process.env.EC2_REDIS_PROXY_KEY = 'test-key';
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN; delete process.env.KV_REST_API_TOKEN;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rc = require('../src/services/redisClient');
    // 옛 평문 값 + 새 압축 값 + 손상 값 혼재
    store.set('polygon:snapshot:probe:OLD', JSON.stringify(probe));
    store.set('polygon:snapshot:probe:NEW', JSON.stringify(encodeForKey('polygon:snapshot:probe:NEW', probe)));
    store.set('polygon:snapshot:probe:BAD', JSON.stringify(GZ_MARK + 'garbage'));
    assert.deepEqual(await rc.getFromCache('polygon:snapshot:probe:OLD'), probe);
    assert.deepEqual(await rc.getFromCache('polygon:snapshot:probe:NEW'), probe);
    assert.equal(await rc.getFromCache('polygon:snapshot:probe:BAD'), null);
    assert.deepEqual(await rc.mgetFromCache(['polygon:snapshot:probe:OLD', 'polygon:snapshot:probe:NEW', 'polygon:snapshot:probe:BAD', 'nope']), [probe, probe, null, null]);
    const strict = await rc.getAuthoritativeCache('polygon:snapshot:probe:NEW');
    assert.equal(strict.ok, true); assert.deepEqual(strict.value, probe);

    assert.equal(await rc.setInCache('polygon:snapshot:probe:W', probe, 600), true);
    assert.ok(JSON.parse(store.get('polygon:snapshot:probe:W')!).startsWith(GZ_MARK), '프로브 본문은 압축 저장');
    assert.deepEqual(await rc.getFromCache('polygon:snapshot:probe:W'), probe);
    const meta = { chainDate: '2026-11-13', _ts: 5 };
    assert.equal(await rc.setInCache('polygon:snapshot:probe:meta:W', meta, 600), true);
    assert.deepEqual(JSON.parse(store.get('polygon:snapshot:probe:meta:W')!), meta, '판본표는 평문 그대로');
    assert.equal(await rc.setInCache('structure:v2:W', { a: 1 }, 600), true);
    assert.deepEqual(JSON.parse(store.get('structure:v2:W')!), { a: 1 }, '다른 키 무변경');
  } finally {
    process.env = env;
    await new Promise<void>((r) => server.close(() => r()));
  }
});
