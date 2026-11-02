// [2026-11-02] 서머타임 종료 뒤 Intrinio realtime 시각이 «2083-09-02…»(실제 + 2026-11-01T04:00Z epoch)로 오는 왜곡 —
// 허브(scripts/ec2-price-ws.js)의 실제 함수를 네트워크 없이 잘라 실행해 복구 규칙·REST 폴백·신선도 비교를 검증한다.
// 실행: node tests/hubDstVendorTime.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../scripts/ec2-price-ws.js'), 'utf8');
const slice = (from, to) => {
  const a = source.indexOf(from); const b = source.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `slice ${from}`); return source.slice(a, b);
};
const sessionCode = slice('const regularSessionFormatter =', '\nfunction handleTradeUpdate');
const tradeCode = slice('const regularSessionFormatter =', '\nfunction throttledBroadcast(');
const normalizeCode = slice('function normalizeTradeMs(', '\n/** 서버 관심 종목 등록');
const restCode = slice('async function fetchSnapshotREST(', '// REST fallback polling loop');
const optionCode = slice('function broadcastOptionPrice(', '\n/** Intrinio 계약코드');

// 웹 정의(src/lib/vendorTime.ts)를 그대로 불러 허브 정의와 결과가 같은지 대조한다.
const web = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/vendorTime.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
{ exports: web.exports, Date, Intl, Object, Number });

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

let now = 0;
class Clock extends Date { static now() { return now; } }
function makeHub(extra = {}) {
  const ctx = { Date: Clock, Intl, Object, Number, Math, Set, Array, console, isFinite, JSON,
    INTRINIO_API_KEY: 'test', REST_REQUEST_TIMEOUT_MS: 5000, REST_CONCURRENCY: 4,
    latestPrices: new Map(), staleDropped: new Map(), liveTicks: new Map(), lastAcceptedTradeMs: new Map(),
    tickerSubscribers: new Map(), subscribedOnPolygon: new Set(), serverJoined: new Set(),
    getETDateString: () => '2026-11-02', markPolygonDataReceived() {}, checkAndRefreshPrevClose() {},
    broadcasts: [], responses: [], ...extra };
  ctx.broadcastPrice = (...a) => ctx.broadcasts.push(a);
  ctx.throttledBroadcast = (...a) => ctx.broadcasts.push(a);
  ctx.httpsGet = () => Promise.resolve(ctx.responses.shift());
  vm.runInNewContext(normalizeCode + '\n' + tradeCode + '\n' + restCode + '\nthis.vendorTimeRepairStats = vendorTimeRepairStats;', ctx);
  return ctx;
}

const SKEW = Date.parse('2026-11-01T04:00:00Z');           // 실측 왜곡값 = 1,793,505,600,000
assert.equal(SKEW, 1_793_505_600_000);
const PRE = Date.parse('2026-11-02T10:21:00Z');            // 05:21 ET 월요일 프리마켓(실측 시각)
const REG = Date.parse('2026-11-02T15:00:00Z');            // 10:00 EST 정규장
const realNvda = Date.parse('2026-11-02T10:05:08.905Z');
const iso = ms => new Date(ms).toISOString();

console.log('hubDstVendorTime');

check('왜곡 시각: 실측 2083 값(ISO·ns·ms)을 테이프와 같은 실제 시각으로 복구', () => {
  now = PRE; const h = makeHub();
  assert.equal(h.normalizeTradeMs('2083-09-02T14:05:08.905Z'), realNvda);
  assert.equal(h.normalizeTradeMs((realNvda + SKEW) * 1e6), realNvda);           // WS SDK ns
  assert.equal(h.normalizeTradeMs(realNvda + SKEW), realNvda);                   // ms
  assert.equal(h.vendorTimeRepairStats.repaired, 3); assert.equal(h.vendorTimeRepairStats.cleared, 0);
});

check('정상 시각: 그대로(15분 지연·금요일 종가 시각·+10분 안 미래 모두 불변) · 결측 0', () => {
  now = PRE; const h = makeHub();
  for (const ms of [PRE - 900_000, Date.parse('2026-10-30T20:00:00Z'), PRE, PRE + 600_000, Date.parse('2026-10-01T13:30:00Z')]) {
    assert.equal(h.normalizeTradeMs(iso(ms)), ms); assert.equal(h.normalizeTradeMs(ms), ms);
  }
  assert.equal(h.normalizeTradeMs(null), 0); assert.equal(h.normalizeTradeMs('2026-11-02T10:00:00'), 0);
  assert.equal(h.vendorTimeRepairStats.repaired + h.vendorTimeRepairStats.cleared, 0);
});

check('복구 불가 미래 시각은 0(모름) — 미래 시각을 남기지 않는다', () => {
  now = PRE; const h = makeHub();
  assert.equal(h.normalizeTradeMs(iso(PRE + 600_001)), 0);                   // +10분+1ms, 알려진 왜곡 아님
  assert.equal(h.normalizeTradeMs('2099-01-01T00:00:00Z'), 0);
  assert.equal(h.normalizeTradeMs(iso(PRE - 15 * 86_400_000 + SKEW)), 0);   // 빼도 14일보다 옛날
  assert.equal(h.vendorTimeRepairStats.cleared, 3);
});

check('웹 정의(vendorTime.ts)와 같은 결과 — 2026·2027 전환일 앞뒤 시각 격자', () => {
  const nows = [];
  for (const d of ['2026-03-06', '2026-03-09', '2026-10-30', '2026-11-02', '2027-01-04', '2027-03-12', '2027-03-15', '2027-11-05', '2027-11-08'])
    for (const hm of ['08:59', '09:00', '13:29', '13:30', '14:30', '20:59', '21:00', '00:59', '01:00']) nows.push(Date.parse(`${d}T${hm}:00Z`));
  const skews = ['2026-03-08T05:00:00Z', '2026-11-01T04:00:00Z', '2027-03-14T05:00:00Z', '2027-11-07T04:00:00Z', '2025-11-02T04:00:00Z'].map(Date.parse);
  let n = 0;
  for (const t of nows) {
    now = t; const h = makeHub();
    for (const lag of [0, 60_000, 900_000, 3 * 86_400_000, 15 * 86_400_000]) {
      for (const add of [0, ...skews, 600_001]) {
        const v = t - lag + add;
        assert.equal(h.repairVendorEpochMs(v, t), web.exports.repairVendorEpochMs(v, t), `${iso(t)} lag ${lag} add ${add}`); n++;
      }
    }
  }
  assert.ok(n > 2000);
});

check('서머타임 경계: 전환일 ET 자정 epoch 를 Intl 로 계산(EDT 04:00Z·EST 05:00Z)', () => {
  now = PRE; const h = makeHub();
  assert.equal(h.etWallToMs(2026, 11, 1, 0, 0), Date.parse('2026-11-01T04:00:00Z'));
  assert.equal(h.etWallToMs(2026, 3, 8, 0, 0), Date.parse('2026-03-08T05:00:00Z'));
  assert.equal(h.etWallToMs(2027, 11, 7, 0, 0), Date.parse('2027-11-07T04:00:00Z'));
  assert.equal(h.etWallToMs(2027, 3, 14, 0, 0), Date.parse('2027-03-14T05:00:00Z'));
  assert.equal(h.etWallToMs(2026, 11, 2, 9, 30), Date.parse('2026-11-02T14:30:00Z'));   // EST 개장
  assert.equal(h.etWallToMs(2026, 10, 30, 9, 30), Date.parse('2026-10-30T13:30:00Z'));  // EDT 개장
  // 2027년에도 2026-11 왜곡(작년 종료일)은 복구된다.
  now = Date.parse('2027-01-04T15:00:00Z');
  assert.equal(h.repairVendorEpochMs(now - 900_000 + SKEW, now), now - 900_000);
  // 정규장 판정이 EST 로 바뀐 경계(09:29/09:30/15:59/16:00 EST)
  assert.equal(h.isRegularSession(Date.parse('2026-11-02T14:29:59Z')), false);
  assert.equal(h.isRegularSession(Date.parse('2026-11-02T14:30:00Z')), true);
  assert.equal(h.isRegularSession(Date.parse('2026-11-02T20:59:59Z')), true);
  assert.equal(h.isRegularSession(Date.parse('2026-11-02T21:00:00Z')), false);
  assert.equal(h.isRegularSession(Date.parse('2026-10-30T13:30:00Z')), true);   // EDT 금요일 개장
  assert.equal(h.isRegularSession(Date.parse('2026-10-30T20:00:00Z')), false);  // EDT 금요일 마감
});

(async () => {
  await (async () => {
    // 프리마켓: 왜곡 응답은 복구된 실제 시각으로 저장·방송(ts 2083 0건)
    now = PRE; const h = makeHub();
    h.responses.push({ last_price: 207.55, last_time: '2083-09-02T14:05:08.905Z', normal_market_hours_last_price: 202.49,
      normal_market_hours_last_time: '2026-10-30T20:00:00.000Z', eod_close_price: 202.49, source: 'cboe_one_delayed' });
    await h.fetchSnapshotREST(['NVDA']);
    assert.equal(h.latestPrices.get('NVDA').ts, realNvda); assert.equal(h.broadcasts.length, 1);
    passed++; console.log('  ✓ REST 폴백(프리마켓): 왜곡 응답 → 복구 시각으로 저장·방송');
  })();

  await (async () => {
    // 정규장: 15분 지연 REST 값이 왜곡 시각 때문에 «신선»으로 방송되던 결함 → 복구 시각으로 90초 규칙이 다시 걸러 낸다.
    now = REG; const h = makeHub();
    h.responses.push({ last_price: 210, last_time: iso(REG - 900_000 + SKEW), eod_close_price: 202.49, source: 'cboe_one_delayed' });
    await h.fetchSnapshotREST(['NVDA']);
    assert.equal(h.broadcasts.length, 0); assert.equal('price' in (h.latestPrices.get('NVDA') || {}), false);
    assert.equal(h.staleDropped.get('NVDA'), 1);
    // 같은 응답을 «수리 전»처럼 미래 시각 그대로 받으면 방송됐다(회귀 증명).
    const old = makeHub(); old.normalizeTradeMs = x => Date.parse(x) || 0;
    vm.runInNewContext(restCode, old);
    old.responses.push({ last_price: 210, last_time: iso(REG - 900_000 + SKEW), eod_close_price: 202.49 });
    await old.fetchSnapshotREST(['NVDA']);
    assert.equal(old.broadcasts.length, 1);
    passed++; console.log('  ✓ REST 폴백(정규장): 15분 지연 왜곡 값 미방송(수리 전 동작은 방송 — 대조)');
  })();

  await (async () => {
    // 왜곡 → 정상 전환: 공급사가 고친 뒤 정상 시각 응답이 계속 채택되고 역행은 여전히 막힌다.
    now = PRE; const h = makeHub();
    h.responses.push({ last_price: 207.55, last_time: iso(PRE - 900_000 + SKEW), eod_close_price: 202.49 });
    await h.fetchSnapshotREST(['NVDA']);
    const t1 = PRE - 900_000; assert.equal(h.latestPrices.get('NVDA').ts, t1);
    now = PRE + 15_000;
    h.responses.push({ last_price: 207.60, last_time: iso(t1 + 10_000), eod_close_price: 202.49 });   // 정상 시각, 더 새 체결
    await h.fetchSnapshotREST(['NVDA']);
    assert.equal(h.latestPrices.get('NVDA').price, 207.60); assert.equal(h.latestPrices.get('NVDA').ts, t1 + 10_000);
    h.responses.push({ last_price: 207.10, last_time: iso(t1 + 5_000), eod_close_price: 202.49 });    // 역행(옛 체결)
    await h.fetchSnapshotREST(['NVDA']);
    assert.equal(h.latestPrices.get('NVDA').price, 207.60);
    h.responses.push({ last_price: 207.70, last_time: iso(t1 + 20_000 + SKEW), eod_close_price: 202.49 }); // 다시 왜곡 와도 이어짐
    await h.fetchSnapshotREST(['NVDA']);
    assert.equal(h.latestPrices.get('NVDA').price, 207.70); assert.equal(h.broadcasts.length, 3);
    passed++; console.log('  ✓ 왜곡 → 정상 → 왜곡 전환: 새 체결 채택·역행 차단 유지');
  })();

  await (async () => {
    // 이미 저장된 2083 값(수리 전 프로세스 상태)이 «최신»으로 남아 새 값을 막지 않는다 — ts·lastTradeTs 모두.
    now = PRE; const h = makeHub();
    h.latestPrices.set('A', { price: 100, ts: PRE - 900_000 + SKEW, prevClose: 99, prevCloseDate: '2026-11-02' });
    h.latestPrices.set('B', { prevClose: 99, prevCloseDate: '2026-11-02', lastTradeTs: PRE + SKEW });
    h.responses.push({ last_price: 101, last_time: iso(PRE - 800_000), eod_close_price: 99 },
      { last_price: 102, last_time: iso(PRE - 800_000), eod_close_price: 99 });
    await h.fetchSnapshotREST(['A', 'B']);
    assert.equal(h.latestPrices.get('A').price, 101); assert.equal(h.latestPrices.get('B').price, 102);
    // 정규장 즉시 전송 판정: 미래 ts 캐시는 신선하다고 보지 않는다.
    now = REG;
    assert.equal(h.isSnapshotSendable({ price: 1, ts: REG + SKEW }, REG), false);
    assert.equal(h.isSnapshotSendable({ price: 1, ts: REG - 30_000 }, REG), true);
    assert.equal(h.isSnapshotSendable({ price: 1, ts: REG + 600_001 }, REG), false);
    passed++; console.log('  ✓ 저장된 2083 ts·lastTradeTs 가 하한으로 남지 않음 · 미래 ts 캐시 즉시 전송 안 함(정규장)');
  })();

  await (async () => {
    // WS 체결: 왜곡 ns 시각 → 복구. 정규장 지연 체결 버림 때 남기는 lastTradeTs 에 2083 을 옮기지 않는다.
    now = REG; const h = makeHub();
    h.tickerSubscribers.set('X', new Set());
    h.handleTradeUpdate({ sym: 'X', p: 50, s: 1, t: (REG - 2_000 + SKEW) * 1e6, _intrinio: true });
    assert.equal(h.latestPrices.get('X').ts, REG - 2_000); assert.equal(h.liveTicks.get('X').trade, REG - 2_000);
    h.latestPrices.set('X', { price: 50, ts: REG + SKEW, prevClose: 49, lastTradeTs: REG + SKEW });
    h.handleTradeUpdate({ sym: 'X', p: 51, s: 1, t: (REG - 900_000) * 1e6, _intrinio: true });          // 지연 체결 → 버림
    const kept = h.latestPrices.get('X');
    assert.equal('price' in kept, false); assert.equal(kept.lastTradeTs, undefined); assert.equal(kept.prevClose, 49);
    passed++; console.log('  ✓ WS 체결: 왜곡 ns 복구 · 지연 체결 버림 때 2083 lastTradeTs 미보존');
  })();

  await (async () => {
    // 관문 11021945 보류 재현: 장외 101(t1) → 복구 불가 미래 시각 102(시각 0) → t1 보다 1분 옛 99 — 역행 기준이 사라지면 안 된다.
    now = PRE; const h = makeHub();
    const t1 = PRE - 300_000;
    h.responses.push({ last_price: 101, last_time: iso(t1), eod_close_price: 99 });
    await h.fetchSnapshotREST(['R']);
    h.responses.push({ last_price: 102, last_time: '2099-01-01T00:00:00Z', eod_close_price: 99 });
    await h.fetchSnapshotREST(['R']);
    assert.equal(h.latestPrices.get('R').price, 102); assert.equal(h.latestPrices.get('R').ts, 0);
    assert.equal(h.latestPrices.get('R').lastTradeTs, t1);
    h.responses.push({ last_price: 99, last_time: iso(t1 - 60_000), eod_close_price: 99 });
    await h.fetchSnapshotREST(['R']);
    assert.equal(h.latestPrices.get('R').price, 102);
    h.responses.push({ last_price: 103, last_time: iso(t1 + 1_000), eod_close_price: 99 });          // 더 새 체결은 채택
    await h.fetchSnapshotREST(['R']);
    assert.equal(h.latestPrices.get('R').price, 103); assert.equal(h.latestPrices.get('R').lastTradeTs, undefined);
    // WS 쪽도 시각 없는 체결이 역행 기준을 지우지 않는다.
    h.tickerSubscribers.set('W', new Set());
    h.latestPrices.set('W', { price: 10, ts: t1, prevClose: 9 });
    h.handleTradeUpdate({ sym: 'W', p: 11, s: 1, t: '2099-01-01T00:00:00Z', _intrinio: true });
    assert.equal(h.latestPrices.get('W').ts, 0); assert.equal(h.latestPrices.get('W').lastTradeTs, t1);
    h.responses.push({ last_price: 8, last_time: iso(t1 - 1), eod_close_price: 9 });
    await h.fetchSnapshotREST(['W']);
    assert.equal(h.latestPrices.get('W').price, 11);
    passed++; console.log('  ✓ 복구 불가(시각 0) 값 뒤에도 역행 기준 유지(REST·WS) — 관문 11021945 지적');
  })();

  await (async () => {
    // 11/2 23:4x KST 정규장 실측(CDP 진단): Intrinio WS 원본 ns 가 개장 전 값에 고정 — QQQ 3587117382982xxxxxx 가
    // 가격 697.1066→697.1116 메시지마다 반복, 복구하면 09:29:42Z(5시간 전) → 수리 전 코드는 전부 staleDropped.
    const RX = Date.parse('2026-11-02T14:43:22.349Z');
    now = RX; const h = makeHub();
    h.tickerSubscribers.set('QQQ', new Set());
    h.handleTradeUpdate({ sym: 'QQQ', p: 697.1066, s: 0, t: 3587117382982000000, _intrinio: true });
    assert.equal(h.staleDropped.get('QQQ'), 1);                                     // 처음 보는 왜곡값 — 고정인지 모름 → 기존 규칙(버림)
    now = RX + 500;
    h.handleTradeUpdate({ sym: 'QQQ', p: 697.1116, s: 0, t: 3587117382982000000, _intrinio: true });
    assert.equal(h.staleDropped.get('QQQ'), 1);                                     // 같은 원본 반복 = 고정값 → 채택
    assert.equal(h.latestPrices.get('QQQ').price, 697.1116); assert.equal(h.latestPrices.get('QQQ').ts, RX + 500);
    const tick = h.liveTicks.get('QQQ');
    assert.equal(tick.trade, RX + 500); assert.equal(tick.rx, RX + 500);           // 웹 /last 오버레이: rx − trade ≤ 90초 통과
    assert.equal(h.vendorTimeRepairStats.wsRxTime, 1);
    // 관문 11022346 지적: 전진하는 왜곡 원본이 복구해도 15분 전(진짜 지연·재전송)이면 수신 시각으로 꾸미지 않고 버린다.
    h.tickerSubscribers.set('Z', new Set());
    h.handleTradeUpdate({ sym: 'Z', p: 10, s: 0, t: (RX - 1_000_000 + SKEW) * 1e6, _intrinio: true });
    h.handleTradeUpdate({ sym: 'Z', p: 11, s: 0, t: (RX - 900_000 + SKEW) * 1e6, _intrinio: true });
    assert.equal(h.staleDropped.get('Z'), 2); assert.equal(h.liveTicks.has('Z'), false);
    // 복구해서 신선(90초 안)하면 복구값 그대로.
    h.handleTradeUpdate({ sym: 'Z', p: 12, s: 0, t: (RX + 500 - 2_000 + SKEW) * 1e6, _intrinio: true });
    assert.equal(h.latestPrices.get('Z').ts, RX + 500 - 2_000);
    // 복구 불가 미래 왜곡값도 처음이면 버림, 같은 값 반복이면 수신 시각.
    h.tickerSubscribers.set('Y', new Set());
    h.handleTradeUpdate({ sym: 'Y', p: 5, s: 0, t: '2099-01-01T00:00:00Z', _intrinio: true });
    assert.equal(h.staleDropped.get('Y'), 1);
    h.handleTradeUpdate({ sym: 'Y', p: 5.1, s: 0, t: '2099-01-01T00:00:00Z', _intrinio: true });
    assert.equal(h.latestPrices.get('Y').ts, RX + 500);
    assert.equal(h.isSnapshotSendable(h.latestPrices.get('QQQ'), RX + 1_000), true);
    // 정상 시각(XLY 실측 지연 0.7초)은 원천 시각 그대로.
    h.tickerSubscribers.set('XLY', new Set());
    h.handleTradeUpdate({ sym: 'XLY', p: 117.97, s: 0, t: (RX - 700) * 1e6, _intrinio: true });
    assert.equal(h.latestPrices.get('XLY').ts, RX - 700);
    // 정상 시각의 지연 체결은 여전히 버린다(T31f).
    h.handleTradeUpdate({ sym: 'XLY', p: 117.5, s: 0, t: (RX - 900_000) * 1e6, _intrinio: true });
    assert.equal(h.staleDropped.get('XLY'), 1);
    passed++; console.log('  ✓ 정규장 Intrinio WS 고정(반복) 왜곡 시각 → 수신 시각 채택 · 전진 왜곡 지연은 버림(관문 11022346) · 정상 시각 불변 · 지연 체결 버림 유지');
  })();

  await (async () => {
    // 관문 11021947 보류 재현: 정규장 WS 체결의 원천 시각이 복구 불가 미래면 신선도를 모르므로 방송·저장·lastAccepted 기록 0.
    now = REG; const h = makeHub();
    h.tickerSubscribers.set('U', new Set());
    h.latestPrices.set('U', { price: 10, ts: REG - 200_000, prevClose: 9 });
    h.handleTradeUpdate({ sym: 'U', p: 12, s: 1, t: (REG + 3_600_000) * 1e6, _intrinio: true });   // 처음 보는 왜곡값
    assert.equal(h.broadcasts.length, 0); assert.equal(h.lastAcceptedTradeMs.has('U'), false); assert.equal(h.liveTicks.has('U'), false);
    assert.equal('price' in h.latestPrices.get('U'), false); assert.equal(h.staleDropped.get('U'), 1);
    assert.equal(h.latestPrices.get('U').lastTradeTs, REG - 200_000);
    // 시각 결측(원천에 시각 자체가 없음)은 기존 동작 그대로 채택.
    h.handleTradeUpdate({ sym: 'U', p: 12, s: 1, t: 0, _intrinio: true });
    assert.equal(h.latestPrices.get('U').price, 12); assert.equal(h.broadcasts.length, 1);
    // 왜곡(복구 가능) 시각은 정규장에도 신선하면 채택.
    h.handleTradeUpdate({ sym: 'U', p: 13, s: 1, t: (REG - 1_000 + SKEW) * 1e6, _intrinio: true });
    assert.equal(h.latestPrices.get('U').price, 13); assert.equal(h.latestPrices.get('U').ts, REG - 1_000);
    passed++; console.log('  ✓ 정규장 WS: 복구 불가 미래 시각 체결은 버림 · 결측은 기존 · 복구 가능은 채택 — 관문 11021947 지적');
  })();

  (() => {
    // 옵션 가격 방송: 왜곡 시각 복구, 정상 시각 불변.
    now = REG; const sent = [];
    const ctx = { Date: Clock, Intl, Object, Number, Math, JSON, WebSocket: { OPEN: 1 },
      optionsTickerSubscribers: new Map([['O:X', new Set([{ readyState: 1, send: m => sent.push(JSON.parse(m)) }])]]) };
    vm.runInNewContext(sessionCode + '\n' + optionCode, ctx);
    ctx.broadcastOptionPrice('O:X', 1.5, REG - 1_000 + SKEW);
    ctx.broadcastOptionPrice('O:X', 1.6, REG - 1_000);
    ctx.broadcastOptionPrice('O:X', 1.7, REG + 3_600_000);                 // 복구 불가 미래 → 0(수신 시각으로 꾸미지 않음)
    assert.deepEqual(sent.map(m => m.ts), [REG - 1_000, REG - 1_000, 0]);
    // 옵션 체결 방송 시각: 왜곡 복구 · 복구 불가 0 · 결측은 기존대로 수신 시각
    assert.equal(ctx.optionEventTs(REG - 5_000 + SKEW), REG - 5_000);
    assert.equal(ctx.optionEventTs(REG + 3_600_000), 0);
    assert.equal(ctx.optionEventTs(undefined), REG);
    assert.equal(ctx.optionEventTs(REG - 5_000), REG - 5_000);
    passed++; console.log('  ✓ 옵션 가격·체결 방송 시각 복구(복구 불가 0 · 결측 수신 시각)');
  })();

  console.log(`hubDstVendorTime: ${passed} passed`);
})().catch(e => { console.error(e); process.exit(1); });
