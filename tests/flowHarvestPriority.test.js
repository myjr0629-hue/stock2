// 실행: node --test tests/flowHarvestPriority.test.js
// 수집 Lambda(signum-flow-harvest) «우선 체인 레인»(mode 'priority-chain', 2026-11-14) — 오프라인(가짜 Redis 프록시·가짜 공급사).
//   ① 고정 목록·휴장·조기 종료 = 앱 원본과 같다 ② 정규장 창(EST·EDT·휴장·조기 종료) ③ 5분 규칙이 두 계절 정규장을 빠짐없이 덮는다
//   ④ 대상(10일 양 끝 포함·중복·대문자·상한·순서) ⑤ 처리 순서(오래 성공 안 한 것부터)
//   ⑥ 핸들러: 정규장 밖 호출 0 · 신선 건너뜀 · 늦은 쓰기 양보 · 429 차단기 · 회차 호출 상한 · 드라이런 쓰기 0 · 속도 복원 · 샤드 경로 무변경
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'scripts/lambda-flow-harvest');

function loadFresh(extraEnv) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(DIR)) delete require.cache[k];
  Object.assign(process.env, extraEnv || {});
  return { index: require(path.join(DIR, 'index.js')), adapter: require(path.join(DIR, 'intrinio-adapter.js')) };
}

const P0 = loadFresh().index.__priority;

test('고정 목록 = firstRunValue ONB_POPULAR · 휴장/조기 종료 = marketCalendar', () => {
  const frv = fs.readFileSync(path.join(ROOT, 'src/lib/app/firstRunValue.ts'), 'utf8');
  const m = frv.match(/export const ONB_POPULAR[^=]*=\s*\[([^\]]*)\]/);
  assert.ok(m, 'ONB_POPULAR 없음');
  assert.deepEqual(P0.PRIORITY_FIXED, [...m[1].matchAll(/'([A-Z.]+)'/g)].map((x) => x[1]));
  const cal = fs.readFileSync(path.join(ROOT, 'src/lib/marketCalendar.ts'), 'utf8');
  const h = cal.match(/US_MARKET_HOLIDAYS = new Set\(\[([\s\S]*?)\]\)/);
  assert.deepEqual([...P0.PRIORITY_HOLIDAYS].sort(), [...h[1].matchAll(/"(\d{4}-\d{2}-\d{2})"/g)].map((x) => x[1]).sort());
  const e = cal.match(/EARLY_CLOSE_DATES[^=]*= new Set\(\[([^\]]*)\]\)/);
  assert.deepEqual([...P0.PRIORITY_EARLY_CLOSE].sort(), [...e[1].matchAll(/"(\d{4}-\d{2}-\d{2})"/g)].map((x) => x[1]).sort());
});

test('정규장 창 — EST·EDT·휴장·조기 종료·주말', () => {
  const w = (iso) => P0.priorityWindow(Date.parse(iso));
  assert.equal(w('2026-11-16T14:29:59Z').reason, 'pre-open');   // 월 09:29 EST
  assert.equal(w('2026-11-16T14:30:00Z').open, true);           // 09:30
  assert.equal(w('2026-11-16T20:59:00Z').open, true);           // 15:59
  assert.equal(w('2026-11-16T21:00:00Z').reason, 'after-close');
  assert.equal(w('2027-03-15T13:30:00Z').open, true);           // EDT 09:30
  assert.equal(w('2027-03-15T13:29:00Z').reason, 'pre-open');
  assert.equal(w('2027-03-15T20:00:00Z').reason, 'after-close'); // EDT 16:00
  assert.equal(w('2026-11-26T15:00:00Z').reason, 'holiday');    // 추수감사절
  assert.equal(w('2026-11-27T17:59:00Z').open, true);           // 조기 종료일 12:59
  assert.equal(w('2026-11-27T18:00:00Z').reason, 'after-close'); // 13:00
  assert.equal(w('2026-11-14T15:00:00Z').reason, 'weekend');
  assert.equal(w('2026-11-14T03:00:00Z').reason, 'after-close'); // 금 22:00 ET(UTC 로는 토) — 금요일로 읽는다
});

// cron(m/step h1-h2 ? * MON-FRI *) — 이 레인 규칙에 필요한 만큼만 해석
function fires(expr, fromMs, toMs) {
  const m = expr.match(/^cron\((\d+)\/(\d+) (\d+)-(\d+) \? \* MON-FRI \*\)$/);
  assert.ok(m, '해석 못 하는 일정 ' + expr);
  const [, m0, step, h1, h2] = m.map(Number);
  const out = [];
  for (let t = Math.ceil(fromMs / 60000) * 60000; t < toMs; t += 60000) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if (d.getUTCHours() < h1 || d.getUTCHours() > h2) continue;
    if (d.getUTCMinutes() < m0 || (d.getUTCMinutes() - m0) % step) continue;
    out.push(t);
  }
  return out;
}

test('5분 규칙이 두 계절 정규장을 덮는다 — 첫 회차 09:32 ET · 마지막 15:57 ET · 78회 · 조기 종료일 42회', () => {
  for (const day of ['2026-11-16', '2027-03-15', '2026-07-15']) {
    const a = Date.parse(day + 'T00:00:00Z'), b = a + 86400000;
    const inWin = fires(P0.PRIORITY.schedule, a, b).filter((t) => P0.priorityWindow(t).open);
    assert.equal(inWin.length, 78, day);
    const first = P0.etParts(inWin[0]), last = P0.etParts(inWin[inWin.length - 1]);
    assert.equal(first.minutes, 9 * 60 + 32, day);
    assert.equal(last.minutes, 15 * 60 + 57, day);
  }
  const a = Date.parse('2026-11-27T00:00:00Z');
  assert.equal(fires(P0.PRIORITY.schedule, a, a + 86400000).filter((t) => P0.priorityWindow(t).open).length, 42);
});

test('대상 — 10일 양 끝 포함·지난 행 제외·대문자·중복·잘못된 기호 제외·가까운 날 먼저·고정 목록 뒤·상한', () => {
  const rows = [
    { ticker: 'nvda', date: '2026-11-17' }, { ticker: 'HD', date: '2026-11-17' }, { ticker: 'OLD', date: '2026-11-13' },
    { ticker: 'EDGE', date: '2026-11-24' }, { ticker: 'OUT', date: '2026-11-25' }, { ticker: 'NVDA', date: '2026-11-20' },
    { ticker: 'b@d', date: '2026-11-18' }, { ticker: 'TODAY', date: '2026-11-14' }, { ticker: 'X', date: 'nope' },
  ];
  const r = P0.buildPriorityTargets(rows, '2026-11-14');
  assert.deepEqual(r.earnings, ['TODAY@11-14', 'HD@11-17', 'NVDA@11-17', 'EDGE@11-24']);
  assert.deepEqual(r.targets.slice(0, 4), ['TODAY', 'HD', 'NVDA', 'EDGE']);
  assert.equal(r.targets.filter((t) => t === 'NVDA').length, 1);
  assert.deepEqual(r.targets.slice(4), P0.PRIORITY_FIXED.filter((t) => t !== 'NVDA'));
  // 상한은 실적 쪽에만 — 고정 12개는 자리 예약(관문 11140907 P2)
  const capped = P0.buildPriorityTargets(rows, '2026-11-14', { maxTickers: 14 });
  assert.equal(capped.targets.length, 14);
  assert.deepEqual(capped.capped, ['EDGE']);
  for (const f of P0.PRIORITY_FIXED) assert.ok(capped.targets.includes(f), f);
  const many = Array.from({ length: 60 }, (_, i) => ({ ticker: 'E' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26)), date: '2026-11-15' }));
  const big = P0.buildPriorityTargets(many, '2026-11-14');
  assert.equal(big.targets.length, 40);
  for (const f of P0.PRIORITY_FIXED) assert.ok(big.targets.includes(f), '실적 60개여도 고정 ' + f + ' 포함');
  assert.equal(big.capped.length, 60 - 28);
  assert.deepEqual(P0.buildPriorityTargets(null, '2026-11-14').targets, P0.PRIORITY_FIXED);
});

test('처리 순서 — 이 레인에서 가장 오래 성공 안 한 것부터, 같으면 대상 순서', () => {
  assert.deepEqual(P0.priorityOrder(['A', 'B', 'C', 'D'], { A: 300, B: 100, D: 100 }), ['C', 'B', 'D', 'A']);
  assert.deepEqual(P0.priorityOrder(['A', 'B'], null), ['A', 'B']);
});

// ── 핸들러(가짜 프록시·가짜 공급사) ──────────────────────────────
function startProxy(store) {
  const writes = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8').on('data', (c) => (body += c));
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.method === 'GET' && u.pathname === '/get') return res.end(JSON.stringify({ result: store.has(u.searchParams.get('key')) ? store.get(u.searchParams.get('key')) : null }));
      const j = JSON.parse(body || '{}');
      if (u.pathname === '/setnx') {
        if (store.has(j.key) && store.get(j.key) !== '') return res.end('{"ok":false,"exists":true}');
        store.set(j.key, j.value); writes.push({ op: 'setnx', key: j.key, ttl: j.ttl }); return res.end('{"ok":true}');
      }
      for (const it of j.items || [j]) { store.set(it.key, it.value); writes.push({ op: u.pathname, key: it.key, ttl: it.ttl }); }
      res.end('{"ok":true}');
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, writes, url: 'http://127.0.0.1:' + server.address().port })));
}

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
function fakeVendor(opts = {}) {
  const calls = [];
  const e1 = ymd(Date.now() + 3 * 86400000), e2 = ymd(Date.now() + 10 * 86400000);
  const fetchImpl = async (url) => {
    const u = new URL(String(url));
    const p = u.pathname.replace(/^\/+/, '');
    if (!u.hostname.includes('intrinio')) throw new Error('unexpected host ' + u.hostname);
    calls.push(p);
    const ok = (j) => ({ ok: true, status: 200, json: async () => j });
    if (opts.status429 && opts.status429(p)) return { ok: false, status: 429, json: async () => ({}) };
    let m;
    if ((m = p.match(/^options\/expirations\/([^/]+)\/eod$/))) return ok({ expirations: [e1, e2] });
    if ((m = p.match(/^securities\/([^/]+)\/prices\/realtime$/))) return ok({ last_price: 100 });
    if ((m = p.match(/^options\/chain\/([^/]+)\/([^/]+)\/eod$/))) {
      const [, T, e] = m;
      return ok({ chain: ['call', 'put'].map((type) => ({ option: { code: `${T}${e}${type}`, type, strike: 100, expiration: e }, prices: { date: '2026-11-13', open_interest: 10, mark: 1, close_bid: 0.9, close_ask: 1.1 } })) });
    }
    if ((m = p.match(/^options\/greeks\/by_ticker\/([^/]+)\/realtime$/))) {
      const T = m[1];
      // 2쪽짜리 그릭스: 1쪽은 성공(next_page), 2쪽은 실패 — «일부만 실시간» 재현
      if (opts.greeksPage2Fail && opts.greeksPage2Fail(T)) {
        if (!u.searchParams.get('next_page')) return ok({ contracts: [{ option: { code: `${T}${e1}call` }, greeks: { implied_volatility: 0.5, gamma: 0.01, synthetic_price: 1.2 } }], next_page: 'p2' });
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return ok({ contracts: [e1, e2].flatMap((e) => ['call', 'put'].map((type) => ({ option: { code: `${T}${e}${type}` }, greeks: { implied_volatility: 0.5, gamma: 0.01, delta: 0.5, synthetic_price: 1.2 } }))) });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { calls, fetchImpl };
}

async function runHandler({ event, store, vendor, env, nowMs }) {
  const px = await startProxy(store);
  const of = global.fetch;
  global.fetch = vendor.fetchImpl;
  const realNow = Date.now;
  try {
    const { index, adapter } = loadFresh(Object.assign({
      EC2_REDIS_PROXY_URL: px.url, REDIS_PROXY_KEY: 't', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '',
      INTRINIO_API_KEY: 'test', INTRINIO_RATE_PER_MIN: '60000', PRIORITY_RATE_PER_MIN: '60000', INTRINIO_MAX_ATTEMPTS: '1',
      PRIORITY_TRIP_429: '8', PRIORITY_CALL_BUDGET: '1200',
    }, env || {}));
    // 시계를 멈추지 않고 옮긴다(멈추면 토큰 버킷이 다시 차지 않는다)
    if (nowMs) { const shift = nowMs - realNow(); Date.now = () => realNow() + shift; }
    const out = await index.handler(event);
    Date.now = realNow;
    return { out, body: JSON.parse(out.body), writes: px.writes, adapter };
  } finally {
    Date.now = realNow;
    global.fetch = of;
    px.server.close();
  }
}

const CAL = (rows) => ({ ok: true, rows, generatedAt: '2026-11-13T20:50:32.799Z' });

test('정규장 밖 — 공급사 호출 0 · 쓰기 0 · 건너뜀', async () => {
  const store = new Map();
  const vendor = fakeVendor();
  const r = await runHandler({ event: { mode: 'priority-chain' }, store, vendor, nowMs: Date.parse('2026-11-14T15:00:00Z') });
  assert.equal(r.body.skipped, true);
  assert.equal(r.body.reason, 'weekend');
  assert.equal(vendor.calls.length, 0);
  assert.equal(r.writes.length, 0);
});

test('강제 1회 — 대상 전부 수집·프로브/판본표 TTL 600(장중 규칙과 같은 함수)·상태 기록·속도는 끝나면 환경 값', async () => {
  const store = new Map([['market:earnings-calendar:v4', CAL([{ ticker: 'NVDA', date: ymd(Date.now() + 86400000) }, { ticker: 'HD', date: ymd(Date.now() + 2 * 86400000) }])]]);
  const vendor = fakeVendor();
  const r = await runHandler({ event: { mode: 'priority-chain', forceRun: true }, store, vendor, env: { PRIORITY_RATE_PER_MIN: '30000' } });
  assert.equal(r.out.statusCode, 200);
  assert.equal(r.body.targets, 13);   // HD + 고정 12(NVDA 중복 제거)
  assert.equal(r.body.ok, 13);
  assert.equal(r.body.fail, 0);
  assert.equal(r.body.calendar, 'cache');
  assert.equal(r.body.ratePerMin, 30000);
  assert.equal(r.adapter.callStats().ratePerMin, 60000, '끝나면 환경 값 속도로 복원');
  const probeWrites = r.writes.filter((w) => /^polygon:snapshot:probe:[A-Z]+$/.test(w.key));
  assert.equal(probeWrites.length, 13);
  const v = store.get('polygon:snapshot:probe:NVDA');
  assert.equal(v._source, 'lambda-flow-harvest');
  assert.ok(v.probeResults.every((c) => c._quoteSource === 'live' && typeof c.ivObservedAt === 'string'));
  assert.ok(store.get('polygon:snapshot:probe:meta:NVDA')._ts > 0);
  assert.ok(!r.writes.some((w) => w.key.startsWith('cache:flow:unified')), '체인만 — 흐름 통합 캐시는 쓰지 않는다');
  assert.ok(!r.writes.some((w) => w.key.startsWith('flow-harvest:cursor')), '샤드 커서 무변경');
  assert.ok(store.get('flow-harvest:priority:status').ok === 13);
  assert.ok(Number(store.get('flow-harvest:priority:last-ok').HD) > 0);
  assert.ok(store.get('flow-harvest:priority:earnings-last-good').rows.length === 2);
});

test('캘린더 캐시 없으면 이 레인의 마지막 정상 목록 · 그것도 없으면 고정 목록만', async () => {
  const d = ymd(Date.now() + 86400000);
  let store = new Map([['flow-harvest:priority:earnings-last-good', { rows: [{ ticker: 'LOW', date: d }], at: Date.now() - 3600e3 }]]);
  let r = await runHandler({ event: { mode: 'priority-chain', forceRun: true, dryRun: true }, store, vendor: fakeVendor() });
  assert.equal(r.body.calendar, 'lane-last-good');
  assert.deepEqual(r.body.earnings, ['LOW@' + d.slice(5)]);
  store = new Map();
  r = await runHandler({ event: { mode: 'priority-chain', forceRun: true, dryRun: true }, store, vendor: fakeVendor() });
  assert.equal(r.body.calendar, 'none');
  assert.equal(r.body.targets, 12);
});

test('드라이런 — 운영 쓰기 0(체인 캐시·최신 EOD 날짜 포함) · 모양 집계는 나온다', async () => {
  const store = new Map([['market:earnings-calendar:v4', CAL([])]]);
  const r = await runHandler({ event: { mode: 'priority-chain', forceRun: true, dryRun: true }, store, vendor: fakeVendor() });
  assert.equal(r.writes.length, 0, JSON.stringify(r.writes.slice(0, 3)));
  assert.equal(r.body.ok, 12);
  const nv = r.body.per.find((p) => p.t === 'NVDA');
  assert.ok(nv.rows >= 4); assert.equal(nv.live, nv.rows); assert.equal(nv.ivObs, nv.rows); assert.equal(nv.eodDate, nv.rows); assert.equal(nv.chainDates, 2);
  assert.ok(nv.calls > 0, '드라이런은 한 종목씩 — 종목당 호출 수');
});

test('다른 수집이 150초 안에 쓴 종목은 건너뛴다 · 우리보다 늦게 쓴 판본표가 있으면 덮지 않는다', async () => {
  const store = new Map([['market:earnings-calendar:v4', CAL([])], ['polygon:snapshot:probe:meta:AAPL', { _ts: Date.now() - 60e3 }]]);
  // TSLA: 시작 때는 묵었고(10분), 우리 수집 도중 다른 쪽이 새로 썼다 — 가짜 공급사가 TSLA 그릭스를 줄 때 판본표를 갱신한다
  store.set('polygon:snapshot:probe:meta:TSLA', { _ts: Date.now() - 600e3 });
  const v = fakeVendor();
  const inner = v.fetchImpl;
  v.fetchImpl = async (url) => { if (String(url).includes('greeks/by_ticker/TSLA')) store.set('polygon:snapshot:probe:meta:TSLA', { _ts: Date.now() + 1000 }); return inner(url); };
  const r = await runHandler({ event: { mode: 'priority-chain', forceRun: true }, store, vendor: v });
  assert.equal(r.body.freshSkip, 1);
  assert.equal(r.body.per.find((p) => p.t === 'AAPL').s, 'fresh');
  assert.equal(r.body.newerSkip, 1);
  assert.equal(r.body.per.find((p) => p.t === 'TSLA').s, 'newer');
  assert.ok(!r.writes.some((w) => w.key === 'polygon:snapshot:probe:TSLA'), 'TSLA 프로브를 덮지 않았다');
  assert.ok(!r.writes.some((w) => w.key === 'polygon:snapshot:probe:AAPL'));
});

test('429 8건·회차 호출 상한은 «엄격» — 넘는 순간 배치 중간이어도 새 요청 차단 · 차단 뒤 결과는 쓰지 않는다', async () => {
  const store = new Map([['market:earnings-calendar:v4', CAL([])]]);
  const v429 = fakeVendor({ status429: (p) => p.startsWith('options/greeks') });
  let r = await runHandler({ event: { mode: 'priority-chain', forceRun: true }, store, vendor: v429, env: { PRIORITY_BATCH: '12', INTRINIO_MAX_CONCURRENCY: '2' } });
  assert.equal(r.body.tripped, '429');
  assert.ok(r.body.notReached.length > 0);
  assert.ok(r.body.r429 >= 8 && r.body.r429 <= 8 + 2, '429 = 상한 + 이미 나간 요청(동시 2) 안: ' + r.body.r429);
  assert.equal(r.body.ok, 0);
  assert.equal(r.body.degraded + r.body.notReached.length, 12, '429 로 그릭스가 빠진 종목 = 불완전 또는 중단(쓰지 않음)');
  assert.ok(!r.writes.some((w) => /^polygon:snapshot:probe:/.test(w.key)), '그릭스가 빠진 체인을 쓰지 않았다');
  const store1 = new Map([['market:earnings-calendar:v4', CAL([])], ['polygon:snapshot:probe:NVDA', { keep: 1 }]]);
  r = await runHandler({ event: { mode: 'priority-chain', forceRun: true }, store: store1, vendor: fakeVendor({ status429: (p) => p.startsWith('options/greeks') }), env: { PRIORITY_BATCH: '1' } });
  assert.ok(r.body.degraded >= 1, '차단 전 종목 = 불완전(그릭스 EOD) → 쓰지 않음');
  assert.deepEqual(store1.get('polygon:snapshot:probe:NVDA'), { keep: 1 }, '직전 프로브를 EOD 그릭스로 덮지 않았다');
  const store2 = new Map([['market:earnings-calendar:v4', CAL([])]]);
  r = await runHandler({ event: { mode: 'priority-chain', forceRun: true }, store: store2, vendor: fakeVendor(), env: { PRIORITY_CALL_BUDGET: '20', PRIORITY_BATCH: '12', INTRINIO_MAX_CONCURRENCY: '2' } });
  assert.equal(r.body.tripped, 'calls');
  assert.ok(r.body.calls <= 20, '나간 요청 ≤ 상한(차단은 요청 전에): ' + r.body.calls);
  for (const w of r.writes.filter((x) => /^polygon:snapshot:probe:[A-Z]+$/.test(x.key))) {
    const v = store2.get(w.key);
    assert.equal(v.partial, false, w.key); assert.equal(v.greeksSource, 'realtime', w.key);
  }
  // 다음 회차는 못 간 종목부터
  const lastOk = store2.get('flow-harvest:priority:last-ok');
  const order = P0.priorityOrder(P0.PRIORITY_FIXED, lastOk);
  assert.equal(order[0], r.body.notReached[0]);
});

test('드라이런은 정규장 정기 모양(forceRun 없음)이어도 락·상태 포함 쓰기 0 (관문 11140907 P1)', async () => {
  const store = new Map([['market:earnings-calendar:v4', CAL([])]]);
  const r = await runHandler({ event: { mode: 'priority-chain', dryRun: true }, store, vendor: fakeVendor(), nowMs: Date.parse('2026-11-16T15:00:00Z') });
  assert.equal(r.body.ok, 12);
  assert.equal(r.writes.length, 0, JSON.stringify(r.writes.slice(0, 3)));
});

test('락 — 앞 회차가 돌고 있으면 건너뛴다(정규장 안 정기 호출) · 자기 키·280초', async () => {
  const store = new Map([['flow-harvest:lock:priority', '123']]);
  const vendor = fakeVendor();
  const r = await runHandler({ event: { mode: 'priority-chain' }, store, vendor, nowMs: Date.parse('2026-11-16T15:00:00Z') });
  assert.equal(r.body.reason, 'concurrent-lock');
  assert.equal(vendor.calls.length, 0);
  assert.equal(P0.PRIORITY.lockKey, 'flow-harvest:lock:priority');
  assert.ok(P0.PRIORITY.lockTtl < 300);
});

test('샤드 경로 — 우선 레인 다음 같은 컨테이너에서도 환경 값 속도 · 샤드 코드 문자열 무변경 지점', () => {
  const src = fs.readFileSync(path.join(DIR, 'index.js'), 'utf8');
  assert.match(src, /if \(event && event\.mode === 'priority-chain'\) return priorityChainHandler\(event\);\n  \/\/ [^\n]*\n  if \(typeof __intrinio\.setRatePerMin === 'function'\) __intrinio\.setRatePerMin\(null\);/);
  assert.match(src, /const snapshotOk = await fetchOptionsSnapshotRaw\(ticker\);/, '샤드는 인자 없이(옛 동작)');
  assert.match(src, /const lockAcquired = await acquireLock\(\);/);
  const { adapter } = loadFresh({ INTRINIO_RATE_PER_MIN: '420' });
  assert.equal(adapter.setRatePerMin(240), 240);
  assert.equal(adapter.setRatePerMin(5000), 420, '환경 값보다 높일 수 없다');
  assert.equal(adapter.setRatePerMin(null), 420);
  assert.equal(/setCallGuard/.test(src), false, '전역 가드 없음 — 레인 문맥(AsyncLocalStorage)만');
});

test('그릭스 2쪽 중 1쪽만 받은 체인(«일부만 실시간»)은 우선 레인이 쓰지 않는다 (관문 11140919 P1)', async () => {
  const store = new Map([['market:earnings-calendar:v4', CAL([])], ['polygon:snapshot:probe:NVDA', { keep: 1 }]]);
  const r = await runHandler({ event: { mode: 'priority-chain', forceRun: true }, store, vendor: fakeVendor({ greeksPage2Fail: (T) => T === 'NVDA' }), env: { PRIORITY_BATCH: '1' } });
  const nv = r.body.per.find((p) => p.t === 'NVDA');
  assert.equal(nv.s, 'degraded');
  assert.equal(nv.greeksSource, 'realtime', '그릭스 출처는 realtime 으로 보이지만');
  assert.equal(nv.greeksComplete, false, '페이지가 덜 왔다');
  assert.deepEqual(store.get('polygon:snapshot:probe:NVDA'), { keep: 1 });
  assert.equal(r.body.ok, 11);
});

test('레인 문맥 — 끝난(done)·차단된 문맥의 남은 작업은 요청을 못 내고, 드라이런 문맥은 체인 캐시를 못 쓴다 · 문맥 밖(샤드)은 그대로', async () => {
  const store = new Map();
  const px = await startProxy(store);
  const v = fakeVendor();
  const of = global.fetch; global.fetch = v.fetchImpl;
  try {
    const { index, adapter } = loadFresh({ EC2_REDIS_PROXY_URL: px.url, REDIS_PROXY_KEY: 't', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', INTRINIO_API_KEY: 'test', INTRINIO_RATE_PER_MIN: '60000' });
    void index;
    const ctx = { done: false, guard: () => ctx.done };
    // 문맥 안에서 시작한 작업이 «핸들러가 끝난 뒤» 깨어나는 상황: 시작 → done → 요청
    const p = adapter.runInLane(ctx, async () => { await new Promise((z) => setTimeout(z, 20)); return adapter.callIntrinio('securities/AAPL/prices/realtime'); });
    ctx.done = true;
    await assert.rejects(p, /LANE_STOP/);
    assert.equal(v.calls.length, 0, '끝난 문맥 = 요청 0');
    // 문맥 밖(샤드)은 같은 시점에도 정상
    await adapter.callIntrinio('securities/AAPL/prices/realtime');
    assert.equal(v.calls.length, 1);
    // 드라이런 문맥: 체인 수집은 하되 체인 캐시·최신 EOD 날짜 쓰기 0
    const before = px.writes.length;
    const out = await adapter.runInLane({ dryRun: true, guard: () => false }, () => adapter.getOptionChain('NVDA'));
    assert.ok(out.results.length > 0);
    assert.equal(out.greeksComplete, true);
    assert.equal(px.writes.length - before, 0, JSON.stringify(px.writes.slice(before, before + 3)));
    // 문맥 밖이면 같은 호출이 체인 캐시를 쓴다(샤드 동작 그대로)
    await adapter.getOptionChain('TSLA');
    assert.ok(px.writes.length - before > 0, '샤드 경로는 체인 캐시를 쓴다');
  } finally { global.fetch = of; px.server.close(); }
});

test('자식(종목) 문맥이 닫히면 부모 회차가 돌고 있어도 그 종목의 남은 요청은 막힌다 · 끝난 레인 요청은 토큰을 쓰지 않아 샤드 요청이 늦지 않는다 (관문 11140927)', async () => {
  const v = fakeVendor();
  const of = global.fetch; global.fetch = v.fetchImpl;
  try {
    const { adapter } = loadFresh({ EC2_REDIS_PROXY_URL: 'http://127.0.0.1:9', INTRINIO_API_KEY: 'test', INTRINIO_RATE_PER_MIN: '60', INTRINIO_MAX_CONCURRENCY: '2' });
    adapter.setRatePerMin(null); adapter.resetRateBucket();
    const parent = { done: false, guard: () => parent.done };
    const child = { done: false, guard: () => child.done || parent.guard() };
    const leftover = adapter.runInLane(child, async () => { await new Promise((z) => setTimeout(z, 20)); return adapter.callIntrinio('securities/X/prices/realtime'); });
    child.done = true;   // 종목이 (시간 초과로) 먼저 돌아왔다
    await assert.rejects(leftover, /LANE_STOP/);
    assert.equal(parent.done, false);
    assert.equal(v.calls.length, 0);
    // 속도 1회/초: 레인 요청 5개가 대기열에 선 뒤 레인이 끝난다 → 뒤의 샤드 요청은 토큰 5개를 기다리지 않는다
    const lane = { done: false, guard: () => lane.done };
    const queued = [1, 2, 3, 4, 5].map((i) => adapter.runInLane(lane, () => adapter.callIntrinio('securities/L' + i + '/prices/realtime')).catch((e) => e.message));
    lane.done = true;
    const t0 = Date.now();
    await adapter.callIntrinio('securities/SHARD/prices/realtime');
    const waited = Date.now() - t0;
    const r = await Promise.all(queued);
    assert.ok(r.every((x) => x === 'LANE_STOP'), JSON.stringify(r));
    assert.ok(waited < 1500, '샤드 요청 대기 ' + waited + 'ms (끝난 레인 5개가 토큰을 썼다면 ≥ 5초)');
    assert.deepEqual(v.calls, ['securities/SHARD/prices/realtime']);
  } finally { global.fetch = of; }
});

test('같은 경로를 레인과 샤드가 동시에 물어도 레인 문맥이 닫히면 레인 쪽만 실패 — 샤드는 자기 요청으로 받는다 (관문 11140931)', async () => {
  const v = fakeVendor();
  const of = global.fetch; global.fetch = v.fetchImpl;
  try {
    const { adapter } = loadFresh({ EC2_REDIS_PROXY_URL: 'http://127.0.0.1:9', INTRINIO_API_KEY: 'test', INTRINIO_RATE_PER_MIN: '60', INTRINIO_MAX_CONCURRENCY: '2' });
    adapter.setRatePerMin(null); adapter.resetRateBucket();
    const lane = { done: false, guard: () => lane.done };
    const P = 'securities/SAME/prices/realtime';
    const laneReq = adapter.runInLane(lane, () => adapter.callIntrinio(P)).catch((e) => e.message);   // 토큰 대기 중
    const shardReq = adapter.callIntrinio(P);
    lane.done = true;
    assert.equal(await laneReq, 'LANE_STOP');
    assert.equal((await shardReq).last_price, 100);
    assert.deepEqual(v.calls, [P]);
    // 샤드끼리는 예전처럼 합친다
    const [a, b] = await Promise.all([adapter.callIntrinio('securities/S2/prices/realtime'), adapter.callIntrinio('securities/S2/prices/realtime')]);
    assert.equal(a, b);
    assert.equal(v.calls.filter((c) => c.includes('S2')).length, 1);
  } finally { global.fetch = of; }
});

test('최신 EOD 날짜 단일 비행은 레인 문맥 밖에서 돈다 — 레인이 시작하고 닫혀도 기다리던 샤드는 진짜 날짜를 받는다 · 드라이런 레인이 시작한 비행은 키를 안 쓴다 (관문 11140934)', async () => {
  const store = new Map();
  const px = await startProxy(store);
  const v = fakeVendor();
  const of = global.fetch; global.fetch = v.fetchImpl;
  try {
    const { adapter } = loadFresh({ EC2_REDIS_PROXY_URL: px.url, REDIS_PROXY_KEY: 't', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', INTRINIO_API_KEY: 'test', INTRINIO_RATE_PER_MIN: '60000' });
    const lane = { dryRun: true, done: false, guard: () => lane.done };
    const laneP = adapter.runInLane(lane, () => adapter.__latestPublishedEodDate());
    const shardP = adapter.__latestPublishedEodDate();   // 같은 비행에 합류
    lane.done = true;                                     // 레인이 곧바로 닫힌다
    assert.equal(await shardP, '2026-11-13');
    assert.equal(await laneP, '2026-11-13');
    assert.ok(v.calls.some((c) => c.startsWith('options/chain/SPY/')), '기준 조회가 실제로 나갔다');
    assert.ok(!px.writes.some((w) => w.key === 'intrinio:chain:latest-eod'), '드라이런 레인이 시작한 비행 = 키 쓰기 0');
  } finally { global.fetch = of; px.server.close(); }
});

test('그릭스 페이지 상한 — 샤드는 14쪽(예전 그대로·capped), 우선 레인 문맥은 30쪽까지 받아야 «완전» · 상한에 닿으면 불완전 (관문 11140937)', async () => {
  const pages = 16;
  const calls = [];
  const of = global.fetch;
  global.fetch = async (url) => {
    const u = new URL(String(url)); const p = u.pathname.replace(/^\/+/, ''); calls.push(p);
    const n = Number(u.searchParams.get('next_page') || 0);
    if (p.startsWith('options/greeks/')) return { ok: true, status: 200, json: async () => ({ contracts: [{ option: { code: 'C' + n }, greeks: { implied_volatility: 0.5, synthetic_price: 1 } }], next_page: n + 1 < pages ? String(n + 1) : null }) };
    if (p.startsWith('options/expirations/')) return { ok: true, status: 200, json: async () => ({ expirations: [ymd(Date.now() + 3 * 86400000)] }) };
    if (p.startsWith('securities/')) return { ok: true, status: 200, json: async () => ({ last_price: 100 }) };
    return { ok: true, status: 200, json: async () => ({ chain: [{ option: { code: 'C0', type: 'call', strike: 100, expiration: ymd(Date.now() + 3 * 86400000) }, prices: { date: '2026-11-13', open_interest: 1 } }] }) };
  };
  try {
    delete process.env.INTRINIO_GREEKS_MAX_PAGES;
    const { adapter } = loadFresh({ EC2_REDIS_PROXY_URL: 'http://127.0.0.1:9', INTRINIO_API_KEY: 'test', INTRINIO_RATE_PER_MIN: '60000' });
    const shard = await adapter.getOptionChain('MU');
    assert.equal(shard.greeksComplete, false, '샤드 14쪽 상한 → 불완전 표시(샤드는 그래도 예전처럼 쓴다)');
    assert.equal(calls.filter((c) => c.startsWith('options/greeks/')).length, 14);
    calls.length = 0;
    const lane = await adapter.runInLane({ greeksMaxPages: 30, guard: () => false }, () => adapter.getOptionChain('MU'));
    assert.equal(lane.greeksComplete, true);
    assert.equal(calls.filter((c) => c.startsWith('options/greeks/')).length, pages);
    const capped = await adapter.runInLane({ greeksMaxPages: 10, guard: () => false }, () => adapter.getOptionChain('MU'));
    assert.equal(capped.greeksComplete, false, '레인도 상한에 닿으면 불완전 → 쓰지 않는다');
  } finally { global.fetch = of; }
});

test('상한에 걸린 레인은 최신 EOD 날짜 비행을 새로 시작하지 않는다 (관문 11140937)', async () => {
  const v = fakeVendor();
  const of = global.fetch; global.fetch = v.fetchImpl;
  try {
    const { adapter } = loadFresh({ EC2_REDIS_PROXY_URL: 'http://127.0.0.1:9', UPSTASH_REDIS_REST_URL: '', INTRINIO_API_KEY: 'test', INTRINIO_RATE_PER_MIN: '60000' });
    const d = await adapter.runInLane({ guard: () => true }, () => adapter.__latestPublishedEodDate());
    assert.equal(d, null);
    assert.equal(v.calls.length, 0);
  } finally { global.fetch = of; }
});
