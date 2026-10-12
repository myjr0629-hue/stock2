/**
 * 시간외(PRE·POST) 칸의 «지금 값» — 한 곳의 계산(lib/price/extendedLive) 시험 (2026-10-12 대표 «PRE 인데 가격 변동이 없다»)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/extendedLive.test.ts
 *
 * 사고(실측 10/12 04:10~04:28 ET): 우리 Intrinio 구독은 REST·웹소켓 «둘 다 15분 지연»(WS 수신−체결 900~901초).
 *   04:00~04:15 엔 오늘 프리 체결이 하나도 없어 화면이 금요일 POST 를 «POST (CLOSED)»로 이었고, 그 뒤에도 15분 전 값이었다.
 *   수리: FMP aftermarket-trade(실시간, 수신−체결 10~30초)를 후보로 더하고 «오늘 그 세션 창 안의 가장 새로운 체결»을 고른다.
 *
 * 덮는 것
 *   1. 04:00:10 실시간 허브 틱(src live) — 시세 요청에 아직 프리 체결이 없어도 그 틱을 쓴다
 *   2. 시세 요청만(지연) — 그 값 · src delayed → 화면 «04:09 ET · 15분 지연»
 *   3. 어제 날짜 허브 틱 — 쓰지 않는다 · 체결 시각 없는 허브 틱(옛 허브)도 쓰지 않는다
 *   4. src delayed 허브 틱이 더 새로우면 그 값(지연 표식 유지) · 실시간이 같은 시각이면 실시간
 *   5. 애프터(post) 세션 — 16:00~20:00 창
 *   6. 정규장 — 적용하지 않는다(PRE CLOSE 잠정값 규칙 10/5 그대로)
 *   7. 둘 다 없음 — 칸 유지 · 직전 확정값을 날짜와 함께(«POST 10/9»)
 *   8. 서버 고르기(FMP live vs Intrinio delayed) · FMP 응답 해석 · 캐시·분당 상한(벤더 호출 수)
 *   9. 목록(내 종목) wsTickUsable 이 같은 규칙 · 허브(ec2-price-ws.js) 체결 시각 단위 변환·지연 판정
 */
process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
process.env.EC2_REDIS_PROXY_KEY = 'k';
process.env.FMP_API_KEY = 'fmp-test';
process.env.FMP_EXT_BUDGET_PER_MIN = '5';
process.env.EXT_LIVE_FMP = '1';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ── 모의 fetch — EC2 Redis 프록시(get·mget·set) + FMP ──
const store = new Map<string, unknown>();
let fmpCalls = 0;
let fmpRow: any = null;
(globalThis as any).fetch = async (input: any, init?: any) => {
  const url = String(input);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('http://ec2.test/mget?')) {
    const keys = (new URL(url).searchParams.get('keys') || '').split(',').map(decodeURIComponent);
    return json({ results: keys.map((k) => (store.has(k) ? store.get(k) : null)) });
  }
  if (url.startsWith('http://ec2.test/get?')) {
    const key = new URL(url).searchParams.get('key') || '';
    return json({ result: store.has(key) ? store.get(key) : null });
  }
  if (url.startsWith('http://ec2.test/set')) {
    const b = JSON.parse(String(init?.body || '{}'));
    store.set(b.key, b.value);
    return json({ ok: true });
  }
  if (url.startsWith('https://financialmodelingprep.com/stable/aftermarket-trade')) {
    fmpCalls++;
    const sym = new URL(url).searchParams.get('symbol');
    return json(fmpRow ? [{ symbol: sym, ...fmpRow }] : []);
  }
  return new Response('{}', { status: 404 });
};

let n = 0;
let failed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); n++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.log(`  ✗ ${name}\n      ${String(e?.message || e).split('\n').join('\n      ')}`); }
};

// ET 벽시계 → epoch ms (10월 = EDT, UTC-4)
const D = '2026-10-12';       // 월요일
const PREV = '2026-10-09';    // 직전 거래일(금)
const et = (date: string, hhmm: string, ss = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h + 4, m, ss);
};
const iso = (ms: number) => new Date(ms).toISOString();

(async () => {
  const L = await import('../src/lib/price/extendedLive');
  const { calcPriceDisplay } = await import('../src/utils/calcPriceDisplay');
  const LQ = await import('../src/utils/liveQuote');
  const FX = await import('../src/services/fmpExtTrade');
  const { readTradeMeta } = await import('../src/providers/WebSocketProvider');

  const PREV_CLOSE = 382.7;     // 금 정규장 종가(TSLA 10/9)
  const PREV_POST = 382.73;     // 금 애프터 종가

  console.log('━━━ 1~5. 고르기(pickExtendedForApp) ━━━');
  await t('★ 04:00:10 ET 실시간 허브 틱(src live) — 시세 요청에 아직 프리 체결이 없어도 그 틱을 쓴다', () => {
    const r = L.pickExtendedForApp({
      session: 'pre', todayET: D,
      ws: { price: 384.0, tradeTs: et(D, '04:00', 10), src: 'live' },
      rest: { extendedPrice: 0, extendedTime: null, extendedKind: null },
    });
    assert.equal(r.applies, true); assert.equal(r.price, 384.0); assert.equal(r.src, 'live'); assert.equal(r.origin, 'ws');
    assert.equal(r.timeMs, et(D, '04:00', 10));
  });
  await t('시세 요청만(Intrinio 지연) — 그 값 · src delayed', () => {
    const r = L.pickExtendedForApp({ session: 'pre', todayET: D, ws: null, rest: { extendedPrice: 383.94, extendedTime: iso(et(D, '04:00', 27)), extendedKind: 'live' } });
    assert.equal(r.price, 383.94); assert.equal(r.src, 'delayed'); assert.equal(r.origin, 'rest');
  });
  await t('시세 요청이 실시간(extendedSrc live — 서버가 FMP 를 골랐다)이면 live', () => {
    const r = L.pickExtendedForApp({ session: 'pre', todayET: D, rest: { extendedPrice: 383.75, extendedTime: iso(et(D, '04:26', 41)), extendedSrc: 'live', extendedKind: 'live' } });
    assert.equal(r.src, 'live'); assert.equal(r.price, 383.75);
  });
  await t('★ 어제 날짜 허브 틱(금 19:59 애프터) — 쓰지 않는다 · 시세 값이 있으면 그것', () => {
    const r = L.pickExtendedForApp({ session: 'pre', todayET: D, ws: { price: 382.73, tradeTs: et(PREV, '19:59', 50), src: 'delayed' }, rest: { extendedPrice: 383.9, extendedTime: iso(et(D, '04:01')), extendedKind: 'live' } });
    assert.equal(r.origin, 'rest'); assert.equal(r.price, 383.9);
    const none = L.pickExtendedForApp({ session: 'pre', todayET: D, ws: { price: 382.73, tradeTs: et(PREV, '19:59', 50), src: 'delayed' }, rest: null });
    assert.equal(none.applies, true); assert.equal(none.price, 0);
  });
  await t('체결 시각 없는 허브 틱(옛 허브)은 쓰지 않는다 — 어제 애프터 체결일 수 있다(9/25 함정)', () => {
    const r = L.pickExtendedForApp({ session: 'pre', todayET: D, ws: { price: 382.73, tradeTs: null, src: null }, rest: null });
    assert.equal(r.price, 0);
  });
  await t('정규장 체결(09:31)은 프리 값이 아니다 — 창 밖', () => {
    const r = L.pickExtendedForApp({ session: 'pre', todayET: D, ws: { price: 390, tradeTs: et(D, '09:31'), src: 'live' } });
    assert.equal(r.price, 0);
  });
  await t('src delayed 허브 틱이 시세보다 새로우면 그 값(지연 표식 유지) · 같은 시각이면 실시간 원천이 이긴다', () => {
    const a = L.pickExtendedForApp({ session: 'pre', todayET: D, ws: { price: 384.19, tradeTs: et(D, '04:09', 41), src: 'delayed' }, rest: { extendedPrice: 384.26, extendedTime: iso(et(D, '04:03', 53)), extendedKind: 'live' } });
    assert.equal(a.origin, 'ws'); assert.equal(a.src, 'delayed'); assert.equal(a.price, 384.19);
    const b = L.pickExtendedForApp({ session: 'pre', todayET: D, ws: { price: 384.0, tradeTs: et(D, '04:10'), src: 'delayed' }, rest: { extendedPrice: 384.1, extendedTime: iso(et(D, '04:10')), extendedSrc: 'live', extendedKind: 'live' } });
    assert.equal(b.src, 'live'); assert.equal(b.price, 384.1);
  });
  await t('실시간 시세(FMP)가 지연 허브 틱보다 새로우면 실시간', () => {
    const r = L.pickExtendedForApp({ session: 'pre', todayET: D, ws: { price: 384.19, tradeTs: et(D, '04:09', 41), src: 'delayed' }, rest: { extendedPrice: 383.88, extendedTime: iso(et(D, '04:28', 18)), extendedSrc: 'live', extendedKind: 'live' } });
    assert.equal(r.src, 'live'); assert.equal(r.price, 383.88);
  });
  await t('애프터(post) — 16:00~20:00 창 · 정규장 종가 인쇄(15:59:59)·20:00 이후는 아니다', () => {
    const ok = L.pickExtendedForApp({ session: 'post', todayET: D, ws: { price: 381, tradeTs: et(D, '16:00', 5), src: 'live' } });
    assert.equal(ok.kind, 'post'); assert.equal(ok.price, 381);
    assert.equal(L.pickExtendedForApp({ session: 'post', todayET: D, ws: { price: 381, tradeTs: et(D, '15:59', 59), src: 'live' } }).price, 0);
    assert.equal(L.pickExtendedForApp({ session: 'POST', todayET: D, ws: { price: 381, tradeTs: et(D, '20:00', 1), src: 'live' } }).price, 0);
  });
  await t('정규장·마감은 적용하지 않는다(applies false — 부르는 쪽의 기존 규칙)', () => {
    assert.equal(L.pickExtendedForApp({ session: 'regular', todayET: D, ws: { price: 390, tradeTs: et(D, '10:00'), src: 'live' } }).applies, false);
    assert.equal(L.pickExtendedForApp({ session: 'REG', todayET: D }).applies, false);
    assert.equal(L.pickExtendedForApp({ session: 'closed', todayET: D }).applies, false);
  });
  await t('확정 종가(extendedKind close)는 «진행 중 체결» 후보가 아니다', () => {
    const r = L.pickExtendedForApp({ session: 'post', todayET: D, rest: { extendedPrice: 381, extendedTime: iso(et(D, '17:00')), extendedKind: 'close' } });
    assert.equal(r.price, 0);
  });

  console.log('━━━ 6~7. 화면(calcPriceDisplay) ━━━');
  await t('★ 프리 · 지연 원천 — 칸 유지 · «PRE» · 체결 시각(04:09) · activeExtDelayed', () => {
    const r = calcPriceDisplay({ session: 'PRE', liveExtPrice: 384.19, liveExtLabel: 'PRE', liveExtKind: 'live', liveExtTime: iso(et(D, '04:09', 41)), liveExtSrc: 'delayed', prevRegularClose: PREV_CLOSE });
    assert.equal(r.activeExtLabel, 'PRE'); assert.equal(r.activeExtPrice, 384.19);
    assert.equal(r.activeExtDelayed, true); assert.equal(r.activeExtAsOf, '04:09');
    assert.ok(Math.abs(r.activeExtPct - ((384.19 / PREV_CLOSE - 1) * 100)) < 1e-9, '등락 기준 = 직전 정규장 종가');
    assert.equal(L.extDelayedText(r.activeExtAsOf, 'ko'), '04:09 ET · 15분 지연');
    assert.equal(L.extDelayedText(r.activeExtAsOf, 'ja'), '04:09 ET · 15分遅延');
    assert.equal(L.extDelayedText(r.activeExtAsOf, 'en'), '04:09 ET · 15-min delayed');
  });
  await t('★ 프리 · 실시간 원천 — 지연 표식이 없다', () => {
    const r = calcPriceDisplay({ session: 'PRE', liveExtPrice: 383.88, liveExtLabel: 'PRE', liveExtKind: 'live', liveExtTime: iso(et(D, '04:28', 18)), liveExtSrc: 'live', prevRegularClose: PREV_CLOSE });
    assert.equal(r.activeExtDelayed, false); assert.equal(r.activeExtAsOf, null); assert.equal(r.activeExtLabel, 'PRE');
  });
  await t('애프터 · 지연 원천 — «POST» · 등락 기준 = 오늘 정규장 종가 · 표식', () => {
    const r = calcPriceDisplay({ session: 'POST', liveExtPrice: 381, liveExtLabel: 'POST', liveExtKind: 'live', liveExtTime: iso(et(D, '16:05')), liveExtSrc: 'delayed', prevRegularClose: PREV_CLOSE, regularCloseToday: 380 });
    assert.equal(r.activeExtLabel, 'POST'); assert.equal(r.activeExtDelayed, true); assert.equal(r.activeExtAsOf, '16:05');
    assert.ok(Math.abs(r.activeExtPct - ((381 / 380 - 1) * 100)) < 1e-9);
  });
  await t('★ 정규장 무변경 — PRE CLOSE(확정)·잠정값 «09:16 ET 기준» 규칙 그대로 · 지연 표식 없음', () => {
    const a = calcPriceDisplay({ session: 'REG', livePrice: 390, liveExtPrice: 385, liveExtLabel: 'PRE', liveExtKind: 'close', liveExtTime: iso(et(D, '09:29', 59)), liveExtSrc: 'delayed', prevRegularClose: PREV_CLOSE });
    assert.equal(a.activeExtLabel, 'PRE CLOSE'); assert.equal(a.activeExtAsOf, null); assert.equal(a.activeExtDelayed, false);
    const b = calcPriceDisplay({ session: 'REG', livePrice: 390, liveExtPrice: 385, liveExtLabel: 'PRE', liveExtKind: 'live', liveExtTime: iso(et(D, '09:16', 59)), prevRegularClose: PREV_CLOSE });
    assert.equal(b.activeExtLabel, 'PRE CLOSE'); assert.equal(b.activeExtAsOf, '09:16'); assert.equal(b.activeExtDelayed, false);
  });
  await t('★ 둘 다 없음 — 칸은 남고 직전 확정값을 «날짜를 붙여»(POST 10/9) · «(CLOSED)»만 붙이지 않는다', () => {
    const r = calcPriceDisplay({ session: 'PRE', liveExtPrice: 0, liveExtLabel: 'PRE', prevRegularClose: PREV_CLOSE, extended: { prePrice: null, prevPostPrice: PREV_POST, prevPostDate: PREV }, prices: {} });
    assert.ok(r.activeExtPrice > 0 && !!r.activeExtLabel, '칸이 사라졌다');
    assert.equal(r.activeExtLabel, 'POST 10/9'); assert.equal(r.activeExtPrice, PREV_POST); assert.equal(r.activeExtCarry, true);
    assert.equal(L.extCarryLabel('POST', null), 'POST (CLOSED)', '날짜를 모르면 옛 라벨');
  });
  await t('마감(CLOSED) 라벨은 그대로 «POST (CLOSED)»', () => {
    const r = calcPriceDisplay({ session: 'CLOSED', liveExtPrice: 382.73, liveExtLabel: 'POST (CLOSED)', prevRegularClose: 375, regularCloseToday: PREV_CLOSE });
    assert.equal(r.activeExtLabel, 'POST (CLOSED)'); assert.equal(r.activeExtDelayed, false);
  });

  console.log('━━━ 8. 서버 — FMP vs Intrinio · FMP 응답 · 캐시·상한 ━━━');
  await t('서버 고르기: FMP(live, 04:26:41) vs Intrinio 스냅샷(delayed, 04:11) → FMP', () => {
    const r = L.pickExtendedLive({ session: 'pre', todayET: D, candidates: [
      { price: 383.7507, ts: et(D, '04:26', 41), src: 'live', origin: 'fmp' },
      { price: 384.2, ts: et(D, '04:11'), src: 'delayed', origin: 'intrinio' },
    ] });
    assert.equal(r.origin, 'fmp'); assert.equal(r.src, 'live');
  });
  await t('서버 고르기: FMP 가 어제 애프터 체결을 주면(04:00 직후) Intrinio 오늘 체결 · 둘 다 없으면 0', () => {
    const r = L.pickExtendedLive({ session: 'pre', todayET: D, candidates: [{ price: 382.73, ts: et(PREV, '19:59'), src: 'live' }, { price: 384, ts: et(D, '04:00', 27), src: 'delayed' }] });
    assert.equal(r.price, 384); assert.equal(r.src, 'delayed');
    assert.equal(L.pickExtendedLive({ session: 'pre', todayET: D, candidates: [{ price: 382.73, ts: et(PREV, '19:59'), src: 'live' }, null] }).price, 0);
  });
  await t('FMP 응답 해석 — ms·초 단위 · 값 없음', () => {
    assert.deepEqual(FX.parseFmpExtTrade({ price: 383.88, timestamp: 1791793698000 }, 1), { price: 383.88, ts: 1791793698000, at: 1 });
    assert.equal(FX.parseFmpExtTrade({ price: 383.88, timestamp: 1791793698 }, 1)?.ts, 1791793698000);
    assert.equal(FX.parseFmpExtTrade({ price: 0, timestamp: 1 }, 1), null);
    assert.equal(FX.parseFmpExtTrade(null, 1), null);
  });
  await t('★ 캐시·상한 — 목록(maxFetch 0)은 벤더를 안 부른다 · 4초 안 재요청은 캐시 · 인스턴스 분당 상한(5)', async () => {
    fmpRow = { price: 383.88, tradeSize: 10, timestamp: Date.now() - 5000 };
    const a = await FX.getFmpExtTrades(['TSLA', 'NVDA'], { maxFetch: 0 });
    assert.equal(fmpCalls, 0); assert.deepEqual(Object.keys(a), []);
    const b = await FX.getFmpExtTrades(['TSLA'], { maxFetch: 1 });
    assert.equal(fmpCalls, 1); assert.equal(b.TSLA.price, 383.88);
    assert.ok(store.has('fmpx:TSLA'), '공유 캐시(EC2)에 쓴다');
    const c = await FX.getFmpExtTrades(['TSLA'], { maxFetch: 1 });
    assert.equal(fmpCalls, 1, '4초 안 — 캐시'); assert.equal(c.TSLA.price, 383.88);
    const d = await FX.getFmpExtTrades(['NVDA'], { maxFetch: 0 });
    assert.equal(d.NVDA, undefined);
    await FX.getFmpExtTrades(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], { maxFetch: 6 });
    assert.equal(fmpCalls, 5, '분당 상한 5 — 1 + 4 콜만');
  });
  await t('★ 스위치 — EXT_LIVE_FMP 가 1 이 아니면 벤더·캐시를 아예 안 쓴다(약관 2.2.2 — 표시 계약 전 기본 꺼짐)', async () => {
    const before = fmpCalls;
    process.env.EXT_LIVE_FMP = '';
    const r = await FX.getFmpExtTrades(['ZZZ'], { maxFetch: 1 });
    assert.deepEqual(r, {}); assert.equal(fmpCalls, before);
    process.env.EXT_LIVE_FMP = '1';
    const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ec2-price-ws.js'), 'utf8');
    assert.match(src, /if \(process\.env\.EXT_LIVE_FMP !== "1"\) return;/, '허브 폴러도 같은 스위치');
  });
  await t('★ 공유 캐시 — 다른 인스턴스·허브가 방금 받은 값을 읽는다(벤더 호출 없이)', async () => {
    const before = fmpCalls;
    store.set('fmpx:AMD', { price: 606.1568, ts: et(D, '04:28', 16), at: Date.now() });
    const r = await FX.getFmpExtTrades(['AMD'], { maxFetch: 0 });
    assert.equal(r.AMD.price, 606.1568); assert.equal(fmpCalls, before);
  });

  console.log('━━━ 9. 목록 · 허브 메시지 · 허브 스크립트 ━━━');
  await t('목록(wsTickUsable) — 프리 04:00:10 실시간 틱은 시세 확인 전에도 쓴다 · 어제 틱·시세보다 오래된 틱은 안 쓴다', () => {
    const now = et(D, '04:00', 20);
    const rest = { price: PREV_CLOSE, extendedPrice: 0, session: 'pre' };
    assert.equal(LQ.wsTickUsable(rest, { price: 384, changePct: 0.3, ts: now, tradeTs: et(D, '04:00', 10), src: 'live' }, 'pre', now), true);
    assert.equal(LQ.wsTickUsable(rest, { price: 382.73, changePct: 0, ts: now, tradeTs: et(PREV, '19:59'), src: 'delayed' }, 'pre', now), false);
    const rest2 = { price: PREV_CLOSE, extendedPrice: 383.9, extendedTime: iso(et(D, '04:20')), extendedSrc: 'live', extendedKind: 'live', session: 'pre' };
    assert.equal(LQ.wsTickUsable(rest2, { price: 384.19, changePct: 0, ts: now, tradeTs: et(D, '04:09'), src: 'delayed' }, 'pre', et(D, '04:24')), false);
    // 정규장은 예전 규칙(2% 가드)
    assert.equal(LQ.wsTickUsable({ price: 390, session: 'regular' }, { price: 391, changePct: 1, ts: now, tradeTs: et(D, '10:00'), src: 'delayed' }, 'reg', et(D, '10:00')), true);
  });
  await t('허브 메시지 읽기 — ts·src 가 있으면 싣고 옛 메시지는 undefined', () => {
    assert.deepEqual(readTradeMeta({ ts: 1791793698000, src: 'live' }), { tradeTs: 1791793698000, src: 'live' });
    assert.deepEqual(readTradeMeta({ price: 1 }), { tradeTs: undefined, src: undefined });
    assert.deepEqual(readTradeMeta({ ts: 'x', src: 'weird' }), { tradeTs: undefined, src: undefined });
  });
  await t('★ 허브(ec2-price-ws.js) — 체결 시각 단위 변환(ns·µs·ms·s) · src 는 «실측 지연 ≤ 60초»만 live · 메시지에 ts·src', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ec2-price-ws.js'), 'utf8');
    const m = /function tradeTsMs\(raw, nowMs\) \{[\s\S]*?\n\}/.exec(src);
    assert.ok(m, 'tradeTsMs 없음');
    // eslint-disable-next-line no-new-func
    const tradeTsMs = new Function(`${m![0]}; return tradeTsMs;`)() as (raw: unknown, now: number) => number;
    const now = 1791793698000;
    assert.equal(tradeTsMs(now * 1e6, now), now, 'ns');
    assert.equal(tradeTsMs(now * 1e3, now), now, 'µs');
    assert.equal(tradeTsMs(now, now), now, 'ms');
    assert.equal(tradeTsMs(now / 1000, now), now, 's');
    assert.equal(tradeTsMs(0, now), now, '못 읽으면 수신 시각');
    assert.equal(tradeTsMs((now - 3 * 86400000) * 1e6, now), now, '하루 넘게 벗어나면 수신 시각');
    assert.equal(tradeTsMs((now - 900000) * 1e6, now), now - 900000, '15분 지연 체결은 그 시각 그대로');
    assert.match(src, /_src: lagMs <= LIVE_MAX_LAG_MS \? "live" : "delayed"/);
    assert.match(src, /const LIVE_MAX_LAG_MS = 60000;/);
    assert.match(src, /ts: cur && cur\.ts > 0 \? cur\.ts : undefined,\s*\n\s*src: cur && cur\.src \? cur\.src : undefined,/);
    assert.match(src, /ts: cached\.ts > 0 \? cached\.ts : undefined,/);
    assert.match(src, /src: "delayed",/, 'REST 폴백은 delayed');
    assert.match(src, /restTs <= existing\.ts\)\) continue;/, 'REST 가 더 새로운 체결을 덮지 않는다');
  });
  await t('소스 고정 — 앱 Command·Flow 가 지연 표식을 그리고 시세 요청·목록·대시가 같은 함수를 거친다', () => {
    const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    for (const p of ['src/app/[locale]/app-view/cmd/page.tsx', 'src/app/[locale]/app-view/flow/page.tsx']) {
      const s = read(p);
      assert.match(s, /liveExtSrc: livePrice\?\.extendedSrc/, `${p}: liveExtSrc`);
      assert.match(s, /activeExtDelayed\s*\n\s*\? extDelayedText\(activeExtAsOf, locale\)/, `${p}: 지연 표식`);
    }
    assert.match(read('src/hooks/useLivePrice.ts'), /pickExtendedForApp\(/);
    assert.match(read('src/utils/liveQuote.ts'), /pickExtendedForApp\(/);
    assert.match(read('src/app/api/live/quotes/route.ts'), /pickExtendedLive\(/);
    assert.match(read('src/app/api/live/quotes/route.ts'), /extendedSrc: recon \? null/);
    assert.match(read('src/app/[locale]/app-view/dash/page.tsx'), /inExtWindow\(wsData\.tradeTs/);
  });

  console.log(`\n${n}/${n + failed} 통과`);
  if (failed) process.exit(1);
})();
