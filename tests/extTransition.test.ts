/**
 * 장 전환 구간의 시간외 칸 · 차트 시간외 구간 — «끊기면 실패»하는 시험 (2026-10-05 대표 지적 재발 방지)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/extTransition.test.ts
 *
 * 사고: 대표 10/5 09:32 ET 캡처(앱 Command NVDA·MU, MARKET OPEN) — 큰 가격 옆 PRE 칸(과 칸 안의 미니 차트)이 없었고 10:0x ET 엔 다시 보였다.
 *   원인 a4a28d88b(9/26 작성 · 9/30 10:26 KST 운영 반영): 프리 종가는 «확정 09:47 ET» 전엔 null(services/extendedSessionClose.ts
 *   isExtCloseFinal) → /api/live/ticker·/api/live/quotes 둘 다 정규장에 PRE 값을 비웠고, 화면(calcPriceDisplay → hasExt)은 칸을 숨겼다.
 *   같은 규칙으로 애프터 첫 체결 전(15분 지연 피드 16:00~16:15 ET)에도 칸이 사라졌다.
 *
 * 지키는 것
 *   1. 서버 고르기(pickRegularPreClose): 확정 > 잠정(지연 피드의 오늘 프리 체결) > 기억해 둔 잠정값 — 날짜·체결 시각 창은 그대로
 *   2. 잠정값 기억·읽기(Redis 모의): 날짜 키 · 같은 체결은 다시 안 쓴다 · 창 밖·다른 날짜는 안 쓴다
 *   3. 화면(calcPriceDisplay): 03:59·04:05·09:29·09:30·09:31·09:45·09:47·15:59·16:01 ET 의 칸 표시 여부·라벨·값·기준 시각·잇기
 *   4. 매분 훑기: 03:50~04:25 · 09:20~09:55 · 15:50~16:25 ET 에 칸이 «한 번도» 사라지지 않는다(15분 지연 피드 모형)
 *   5. 차트(maskOneDaySessions): 09:29·09:31·09:45·15:59·16:01·16:20 ET 에 오늘 프리 구간이 남고 정규장·애프터가 잇따른다
 *   6. 소스 고정: 두 문(/api/live/ticker · /api/live/quotes)과 앱 Command·Flow 가 이 경로를 거친다
 */
process.env.INTRINIO_API_KEY = process.env.INTRINIO_API_KEY || 'test-key';
process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
process.env.EC2_REDIS_PROXY_KEY = 'k';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.KV_REST_API_URL;

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ── Redis(EC2 프록시) 모의 — get · mget · set ─────────────────────────────
const store = new Map<string, unknown>();
let setCalls = 0;
(globalThis as any).fetch = async (input: any, init?: any) => {
  const url = String(input);
  const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('http://ec2.test/get?')) {
    const key = new URL(url).searchParams.get('key') || '';
    return json({ result: store.has(key) ? store.get(key) : null });
  }
  if (url.startsWith('http://ec2.test/mget?')) {
    const keys = (new URL(url).searchParams.get('keys') || '').split(',').map(decodeURIComponent);
    return json({ results: keys.map((k) => (store.has(k) ? store.get(k) : null)) });
  }
  if (url.startsWith('http://ec2.test/set')) {
    setCalls++;
    const b = JSON.parse(String(init?.body || '{}'));
    store.set(b.key, b.value);
    return json({ ok: true });
  }
  return new Response('{}', { status: 404 });
};

let n = 0;
let failed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
  try { await fn(); n++; console.log(`  ✓ ${name}`); }
  catch (e: any) { failed++; console.log(`  ✗ ${name}\n      ${String(e?.message || e).split('\n').join('\n      ')}`); }
};
const tick = () => new Promise((r) => setTimeout(r, 30));

// ET 벽시계 → epoch ms (10월 = EDT, UTC-4)
const D = '2026-10-05';            // 월요일
const PREV = '2026-10-02';         // 직전 거래일(금)
const et = (date: string, hhmm: string, ss = 0, ms = 0) => {
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h + 4, m, ss, ms);
};

(async () => {
  const svc = await import('../src/services/extendedSessionClose');
  const { calcPriceDisplay, etHhmmOf } = await import('../src/utils/calcPriceDisplay');
  const { maskOneDaySessions } = await import('../src/services/stockApi');
  const cal = await import('../src/lib/marketCalendar');

  // 실측값(운영 10/5): NVDA 프리 종가 = 통합 테이프 마지막 Form T 236.36 @ 09:30:01.815 ET · 전일 종가 233.95
  const PREV_CLOSE = 233.95;
  const FINAL: import('../src/services/extendedSessionClose').ExtSessionClose = {
    kind: 'pre', date: D, price: 236.36, time: new Date(et(D, '09:30', 1, 815)).toISOString(), source: 'utp_delayed',
  };

  // 직전 거래일(금) 애프터 종가(확정 — 통합 테이프 마지막 Form T) · 마감 중 «POST (CLOSED)» 칸의 값
  const PREV_POST = 236.9;
  const PREV_POST_TIME = new Date(et(PREV, '19:59', 50)).toISOString();
  const putPrevPost = (sym: string) => store.set(`ext:close:v1:post:${sym}:${PREV}`, { p: PREV_POST, t: PREV_POST_TIME, src: 'utp_delayed' });

  // ── 15분 지연 피드 모형 ── 벽시계 W 에 스냅샷의 «마지막 체결» = W−15분 직전 체결
  //   프리 04:00~09:29:59 매분 체결(가격 = 235 + 분/1000) · 정규장 09:30 부터 매분(가격 236.5 + …) · 애프터 16:00 부터 매분(238 + …)
  const tradeAt = (ms: number) => {
    const m = Math.floor((ms - et(D, '00:00')) / 60000);   // ET 자정부터 분
    if (m < 240) return null;                              // 04:00 전: 오늘 체결 없음(지연 피드는 어제 애프터를 준다 — 아래)
    if (m < 570) return { p: +(235 + (m - 240) / 1000).toFixed(3), t: et(D, '00:00') + m * 60000 + 59_000 };
    if (m < 960) return { p: +(236.5 + (m - 570) / 1000).toFixed(3), t: et(D, '00:00') + m * 60000 + 30_000 };
    if (m < 1200) return { p: +(238 + (m - 960) / 1000).toFixed(3), t: et(D, '00:00') + m * 60000 + 20_000 };
    return null;
  };
  const delayedSnapshot = (W: number) => {
    const seen = W - 15 * 60_000;
    const tr = tradeAt(seen);
    if (tr && tr.t <= seen) return tr;
    // 같은 분의 체결 시각이 아직 안 지났으면 한 분 앞
    const prev = tradeAt(seen - 60_000);
    return prev ?? { p: 236.9, t: et(PREV, '19:59', 50) };   // 오늘 체결 전 = 어제 애프터 마지막 체결
  };
  const sessionOf = (W: number): 'CLOSED' | 'PRE' | 'REG' | 'POST' => {
    const m = Math.floor((W - et(D, '00:00')) / 60000);
    return m < 240 ? 'CLOSED' : m < 570 ? 'PRE' : m < 960 ? 'REG' : m < 1200 ? 'POST' : 'CLOSED';
  };

  /** /api/live/quotes 한 종목(route.ts 와 같은 규칙) — 정규장 PRE CLOSE 는 pickRegularPreClose · 프리/애프터는 체결 시각 창 */
  const recalled = async (sym: string, W: number, snap: { p: number; t: number }) => {
    const final = svc.isExtCloseFinal(D, 'pre', W) ? FINAL : undefined;
    const snapPre = svc.isTradeInExtSession(snap.t, D, 'pre');
    if (final || snapPre) return null;
    const [r] = await svc.recallProvisionalPreCloses([sym], D);
    return r;
  };
  const serverQuote = async (W: number, sym = 'NVDA') => {
    const snap = delayedSnapshot(W);
    const s = sessionOf(W);
    if (s === 'CLOSED') {
      // 마감(자정~04:00) — 화면 날짜(직전 거래일)의 애프터 종가(확정) · route.ts closeMap(post)
      const [pc] = await svc.peekExtendedSessionCloses([sym], cal.shownRegularSessionDate(W), 'post');
      return { session: 'closed', price: 236.0, extendedPrice: pc?.price ?? 0, extendedLabel: pc ? 'POST' : undefined, extendedKind: pc ? 'close' : null, extendedTime: pc?.time ?? null };
    }
    if (s === 'PRE') {
      const ok = svc.isTradeInExtSession(snap.t, D, 'pre');
      return { session: 'pre', price: PREV_CLOSE, extendedPrice: ok ? snap.p : 0, extendedLabel: 'PRE', extendedKind: ok ? 'live' : null, extendedTime: ok ? new Date(snap.t).toISOString() : null };
    }
    if (s === 'POST') {
      const ok = svc.isTradeInExtSession(snap.t, D, 'post');
      return { session: 'post', price: 237.2, extendedPrice: ok ? snap.p : 0, extendedLabel: 'POST', extendedKind: ok ? 'live' : null, extendedTime: ok ? new Date(snap.t).toISOString() : null };
    }
    const final = svc.isExtCloseFinal(D, 'pre', W) ? FINAL : undefined;
    const snapPre = svc.isTradeInExtSession(snap.t, D, 'pre');
    const pc = svc.pickRegularPreClose({ today: D, final, snapPrice: snapPre ? snap.p : 0, snapTradeMs: snap.t, recalled: await recalled(sym, W, snap) });
    if (pc?.source === 'snapshot') { svc.rememberProvisionalPreClose(sym, D, pc.price, snap.t); await tick(); }
    return { session: 'regular', price: snap.p, extendedPrice: pc?.price ?? 0, extendedLabel: pc ? 'PRE' : undefined, extendedKind: pc?.kind ?? null, extendedTime: pc?.time ?? null };
  };
  /** /api/live/ticker 의 extended(route.ts 와 같은 규칙) — 정규장·애프터 PRE CLOSE 는 pickRegularPreClose */
  const serverTickerExtended = async (W: number, sym = 'NVDA') => {
    const snap = delayedSnapshot(W);
    const s = sessionOf(W);
    if (s === 'CLOSED') {
      const [pc] = await svc.peekExtendedSessionCloses([sym], cal.shownRegularSessionDate(W), 'post');
      return { prePrice: null, preKind: null, preTime: null, postPrice: pc?.price ?? null };
    }
    if (s === 'PRE') {
      const ok = svc.isTradeInExtSession(snap.t, D, 'pre');
      // route.ts: 첫 프리 체결 전엔 직전 거래일 애프터 종가(저장된 확정값)를 prevPost* 로 따로 싣는다
      let prevPostPrice: number | null = null;
      if (!ok) {
        const prevDate = cal.shownRegularSessionDate(W);
        const [pc] = await svc.peekExtendedSessionCloses([sym], prevDate, 'post');
        if (pc && pc.price > 0 && pc.date === prevDate) prevPostPrice = pc.price;
      }
      return { prePrice: ok ? snap.p : null, preKind: ok ? 'live' : null, preTime: ok ? new Date(snap.t).toISOString() : null, postPrice: null, prevPostPrice };
    }
    const final = svc.isExtCloseFinal(D, 'pre', W) ? FINAL : undefined;
    const snapPre = s === 'REG' && svc.isTradeInExtSession(snap.t, D, 'pre');
    const pc = svc.pickRegularPreClose({ today: D, final, snapPrice: snapPre ? snap.p : 0, snapTradeMs: snap.t, recalled: await recalled(sym, W, snap) });
    if (pc?.source === 'snapshot') { svc.rememberProvisionalPreClose(sym, D, pc.price, snap.t); await tick(); }
    const postOk = s === 'POST' && svc.isTradeInExtSession(snap.t, D, 'post');
    return { prePrice: pc?.price ?? null, preKind: pc?.kind ?? null, preTime: pc?.time ?? null, postPrice: postOk ? snap.p : null };
  };
  /** 앱 Command·Flow 가 그리는 칸(같은 입력 모양) */
  const screen = async (W: number, sym = 'NVDA') => {
    const q = await serverQuote(W, sym);
    const ext = await serverTickerExtended(W, sym);
    const s = sessionOf(W);
    const r = calcPriceDisplay({
      session: s,
      livePrice: q.price,
      liveExtPrice: q.extendedPrice,
      liveExtLabel: q.extendedLabel ? (s === 'CLOSED' ? `${q.extendedLabel} (CLOSED)` : q.extendedLabel) : undefined,   // 앱 Command·Flow 와 같다
      liveExtKind: q.extendedKind,
      liveExtTime: q.extendedTime,
      prevRegularClose: PREV_CLOSE,
      regularCloseToday: s === 'POST' ? 237.2 : s === 'CLOSED' ? 236.0 : null,
      extended: ext,
      prices: { prePrice: ext.prePrice, postPrice: ext.postPrice },
    });
    const visible = r.activeExtPrice > 0 && !!r.activeExtLabel;   // 화면의 hasExt 와 같은 식
    return { ...r, visible, q, ext };
  };

  console.log('━━━ 1. 서버 고르기 — pickRegularPreClose ━━━');
  await t('확정값이 있으면 언제나 확정(테이프) — kind close', () => {
    const r = svc.pickRegularPreClose({ today: D, final: FINAL, snapPrice: 235.3, snapTradeMs: et(D, '09:20') })!;
    assert.equal(r.kind, 'close'); assert.equal(r.source, 'tape'); assert.equal(r.price, 236.36);
  });
  await t('★ 09:31 ET(확정 전) — 지연 피드 마지막 체결이 오늘 프리 체결(09:16)이면 그 값이 잠정 PRE CLOSE(kind live·체결 시각)', () => {
    const r = svc.pickRegularPreClose({ today: D, final: undefined, snapPrice: 235.316, snapTradeMs: et(D, '09:16', 59) })!;
    assert.equal(r.kind, 'live'); assert.equal(r.source, 'snapshot'); assert.equal(r.price, 235.316);
    assert.equal(etHhmmOf(r.time), '09:16');
  });
  await t('★ 정규장 체결(09:30 이후)은 PRE 값이 아니다 — 916.26 사고 규칙 유지', () => {
    assert.equal(svc.pickRegularPreClose({ today: D, final: undefined, snapPrice: 236.5, snapTradeMs: et(D, '09:30', 30) }), null);
  });
  await t('★ 어제 애프터 체결은 오늘 PRE 값이 아니다 — 날짜 규칙 유지', () => {
    assert.equal(svc.pickRegularPreClose({ today: D, final: undefined, snapPrice: 236.9, snapTradeMs: et(PREV, '19:59', 50) }), null);
  });
  await t('어댑터가 «시간외 체결 아님»이라 하면 쓰지 않는다', () => {
    assert.equal(svc.pickRegularPreClose({ today: D, final: undefined, snapPrice: 235.3, snapTradeMs: et(D, '09:16'), snapHasExt: false }), null);
  });
  await t('다른 날짜의 확정값은 쓰지 않는다', () => {
    assert.equal(svc.pickRegularPreClose({ today: D, final: { ...FINAL, date: PREV } }), null);
  });
  await t('기억해 둔 잠정값 — 같은 날 프리 창 안의 체결만', () => {
    const ok = svc.pickRegularPreClose({ today: D, final: undefined, snapPrice: 236.5, snapTradeMs: et(D, '09:30', 30), recalled: { p: 235.329, t: new Date(et(D, '09:29', 59)).toISOString() } })!;
    assert.equal(ok.source, 'recalled'); assert.equal(ok.kind, 'live'); assert.equal(ok.price, 235.329);
    assert.equal(svc.pickRegularPreClose({ today: D, recalled: { p: 236.6, t: new Date(et(D, '09:31')).toISOString() } }), null, '정규장 체결 기억값');
    assert.equal(svc.pickRegularPreClose({ today: D, recalled: { p: 235.1, t: new Date(et(PREV, '09:29')).toISOString() } }), null, '어제 기억값');
  });

  console.log('━━━ 2. 잠정값 기억·읽기(Redis 모의) ━━━');
  await t('기억 → 같은 날짜로 읽힌다 · 다른 날짜 키로는 없다', async () => {
    svc.rememberProvisionalPreClose('TST', D, 101.5, et(D, '09:20', 10));
    await tick();
    const [a] = await svc.recallProvisionalPreCloses(['TST'], D);
    assert.equal(a?.p, 101.5);
    const [b] = await svc.recallProvisionalPreCloses(['TST'], PREV);
    assert.equal(b, null);
  });
  await t('같은 체결·20초 안의 새 체결은 다시 쓰지 않는다(비용) · 창 밖 체결은 아예 쓰지 않는다', async () => {
    const before = setCalls;
    svc.rememberProvisionalPreClose('TST', D, 101.5, et(D, '09:20', 10));   // 같은 체결
    svc.rememberProvisionalPreClose('TST', D, 101.6, et(D, '09:20', 20));   // 20초 안
    svc.rememberProvisionalPreClose('TS2', D, 50, et(D, '09:31'));          // 정규장 체결
    svc.rememberProvisionalPreClose('TS3', D, 50, et(PREV, '09:20'));       // 다른 날짜 체결
    await tick();
    assert.equal(setCalls, before);
  });

  console.log('━━━ 3. 화면 — 전환 시각별 칸(표시·라벨·값·기준 시각) ━━━');
  putPrevPost('NVDA');
  await t('03:59 ET(마감) — 직전 거래일 애프터 종가 «POST (CLOSED)»', async () => {
    const r = await screen(et(D, '03:59'));
    assert.ok(r.visible); assert.equal(r.activeExtLabel, 'POST (CLOSED)'); assert.equal(r.activeExtPrice, PREV_POST);
  });
  await t('★ 04:05 ET(프리 · 지연 피드엔 아직 오늘 프리 체결 없음) — 칸이 있다: «POST (CLOSED)» 를 잇는다(예전: 칸 없음)', async () => {
    const r = await screen(et(D, '04:05'));
    assert.equal(r.q.extendedPrice, 0, '모형: 시세에 오늘 프리 체결 없음');
    assert.ok(r.visible, '칸이 사라졌다');
    assert.equal(r.activeExtLabel, 'POST (CLOSED)'); assert.equal(r.activeExtPrice, PREV_POST); assert.equal(r.activeExtCarry, true);
    assert.ok(Math.abs(r.activeExtPct - ((PREV_POST / PREV_CLOSE - 1) * 100)) < 1e-9, '등락 기준 = 그날(직전 거래일) 정규장 종가');
  });
  await t('04:16 ET — 첫 프리 체결이 확인되면 «PRE» 로 바뀐다', async () => {
    const r = await screen(et(D, '04:16', 30));
    assert.ok(r.visible); assert.equal(r.activeExtLabel, 'PRE'); assert.equal(r.activeExtCarry, false);
  });
  await t('09:29 ET(프리) — «PRE» 칸 · 지연 피드 체결가(09:14) · 기준 시각 없음(진행 중 세션)', async () => {
    const r = await screen(et(D, '09:29'));
    assert.ok(r.visible); assert.equal(r.activeExtLabel, 'PRE'); assert.equal(r.activeExtAsOf, null); assert.equal(r.activeExtCarry, false);
  });
  for (const hhmm of ['09:30', '09:31', '09:32']) {
    await t(`★ ${hhmm} ET(정규장 · 확정 전) — 칸이 있다: «PRE CLOSE» 잠정값 + 기준 시각(예전: 칸 없음)`, async () => {
      const W = et(D, hhmm, 5);
      const r = await screen(W);
      assert.ok(r.visible, '칸이 사라졌다');
      assert.equal(r.activeExtLabel, 'PRE CLOSE');
      assert.equal(r.activeExtType, 'PRE_CLOSE');
      assert.equal(r.activeExtAsOf, etHhmmOf(delayedSnapshot(W).t), '기준 시각 = 지연 피드의 마지막 프리 체결 시각');
      assert.ok(r.activeExtPctKnown);
      assert.ok(Math.abs(r.activeExtPct - ((r.activeExtPrice / PREV_CLOSE - 1) * 100)) < 1e-9, '등락 기준 = 전일 종가');
    });
  }
  await t('★ 09:45:30 ET — 지연 피드가 정규장으로 넘어가도(마지막 체결 09:30) 기억해 둔 잠정값(09:29)으로 칸이 남는다', async () => {
    for (let w = et(D, '09:33'); w <= et(D, '09:45'); w += 60_000) await screen(w);   // 그 사이 화면들이 폴링한다
    const W = et(D, '09:45', 30);
    assert.equal(svc.isTradeInExtSession(delayedSnapshot(W).t, D, 'pre'), false, '모형: 이 시각 스냅샷은 정규장 체결');
    const r = await screen(W);
    assert.ok(r.visible, '칸이 사라졌다');
    assert.equal(r.activeExtLabel, 'PRE CLOSE');
    assert.equal(r.activeExtAsOf, '09:29');
  });
  await t('★ 09:47 ET — 확정값(테이프 마지막 Form T 236.36)으로 바뀌고 기준 시각 표식이 사라진다', async () => {
    const r = await screen(et(D, '09:47', 0));
    assert.ok(r.visible); assert.equal(r.activeExtLabel, 'PRE CLOSE'); assert.equal(r.activeExtPrice, 236.36); assert.equal(r.activeExtAsOf, null);
  });
  await t('15:59 ET(정규장) — PRE CLOSE 확정값', async () => {
    const r = await screen(et(D, '15:59'));
    assert.ok(r.visible); assert.equal(r.activeExtLabel, 'PRE CLOSE'); assert.equal(r.activeExtPrice, 236.36); assert.equal(r.activeExtCarry, false);
  });
  await t('★ 16:01 ET(애프터 · 지연 피드엔 아직 애프터 체결 없음) — 칸이 있다: 오늘 PRE CLOSE 를 잇는다(activeExtCarry · 예전: 칸 없음)', async () => {
    const r = await screen(et(D, '16:01'));
    assert.equal(r.q.extendedPrice, 0, '모형: 시세에 애프터 체결 없음');
    assert.ok(r.visible, '칸이 사라졌다');
    assert.equal(r.activeExtLabel, 'PRE CLOSE'); assert.equal(r.activeExtPrice, 236.36); assert.equal(r.activeExtCarry, true);
  });
  await t('16:16 ET — 첫 애프터 체결이 확인되면 «POST» 로 바뀐다(기준 = 오늘 정규장 종가)', async () => {
    const r = await screen(et(D, '16:16', 30));
    assert.ok(r.visible); assert.equal(r.activeExtLabel, 'POST'); assert.equal(r.activeExtCarry, false);
    assert.ok(Math.abs(r.activeExtPct - ((r.activeExtPrice / 237.2 - 1) * 100)) < 1e-9);
  });
  await t('애프터 전환 순간 폴링이 아직 정규장 응답(라벨 PRE)이어도 «PRE CLOSE» 로 잇는다(«PRE» 로 보이지 않는다)', () => {
    const r = calcPriceDisplay({ session: 'POST', livePrice: 237.2, liveExtPrice: 236.36, liveExtLabel: 'PRE', prevRegularClose: PREV_CLOSE, regularCloseToday: 237.2 });
    assert.equal(r.activeExtLabel, 'PRE CLOSE'); assert.equal(r.activeExtCarry, true);
  });
  await t('정규장 확정값(kind close)엔 기준 시각을 붙이지 않는다 · 시간외 값이 아예 없으면 칸도 없다(지어내지 않는다)', () => {
    const a = calcPriceDisplay({ session: 'REG', livePrice: 237, liveExtPrice: 236.36, liveExtLabel: 'PRE', liveExtKind: 'close', liveExtTime: FINAL.time, prevRegularClose: PREV_CLOSE });
    assert.equal(a.activeExtAsOf, null);
    const b = calcPriceDisplay({ session: 'REG', livePrice: 237, prevRegularClose: PREV_CLOSE, extended: {}, prices: {} });
    assert.equal(b.activeExtPrice, 0);
  });

  console.log('━━━ 4. 매분 훑기 — 칸이 «한 번도» 사라지지 않는다 ━━━');
  store.clear();
  for (const [from, to, label] of [['03:50', '04:25', '마감 → 프리'], ['09:20', '09:55', '프리 → 정규장'], ['15:50', '16:25', '정규장 → 애프터']] as const) {
    await t(`★ ${from}~${to} ET 매분(${label}) — 칸이 늘 있다 · 라벨이 세션과 맞다`, async () => {
      const gaps: string[] = [];
      const bad: string[] = [];
      for (let W = et(D, from); W <= et(D, to); W += 60_000) {
        const sym = `SWP${from.slice(0, 2)}`;   // 종목을 나눠 앞 절의 기억값·쓰기 간격과 섞이지 않게
        if (W === et(D, from)) putPrevPost(sym);
        const r = await screen(W, sym);
        const s = sessionOf(W);
        const hhmm = etHhmmOf(W);
        if (!r.visible) gaps.push(hhmm!);
        const want = s === 'CLOSED' ? ['POST (CLOSED)'] : s === 'PRE' ? ['PRE', 'POST (CLOSED)'] : s === 'REG' ? ['PRE CLOSE'] : ['PRE CLOSE', 'POST'];
        if (r.visible && !want.includes(r.activeExtLabel)) bad.push(`${hhmm} ${r.activeExtLabel}`);
        if (s === 'REG' && r.visible && (W < et(D, '09:47')) !== (r.activeExtAsOf !== null)) bad.push(`${hhmm} 기준시각 ${r.activeExtAsOf}`);
      }
      assert.deepEqual(gaps, [], `칸이 사라진 분: ${gaps.join(', ')}`);
      assert.deepEqual(bad, [], `라벨·표식이 틀린 분: ${bad.join(', ')}`);
    });
  }

  console.log('━━━ 5. 차트 — 1D 세션 마스크(maskOneDaySessions) ━━━');
  // 행: 직전 거래일(금) 정규장·애프터 + 오늘 프리(EC2 기록 5분 봉 04:00~09:25) + 지연 피드로 «이미 보이는» 오늘 정규장·애프터 1분 봉
  const iso = (ms: number) => new Date(ms).toISOString();
  const rowsAt = (W: number) => {
    const rows: any[] = [];
    for (let m = 570; m < 960; m += 1) rows.push({ date: iso(et(PREV, '00:00') + m * 60000), close: 233 + m / 1000, open: 233, high: 234, low: 232, volume: 1000 });
    for (let m = 960; m < 1200; m += 5) rows.push({ date: iso(et(PREV, '00:00') + m * 60000), close: 234, open: 234, high: 234, low: 234, volume: 10 });
    const seen = W - 15 * 60_000;
    for (let m = 240; m < 570; m += 5) { const ms = et(D, '00:00') + m * 60000; if (ms <= W) rows.push({ date: iso(ms), close: 235 + m / 1000, open: 235, high: 235.5, low: 234.5, volume: 500 }); }
    for (let m = 570; m < 1200; m += 1) { const ms = et(D, '00:00') + m * 60000; if (ms + 60_000 <= seen) rows.push({ date: iso(ms), close: 236.5, open: 236.5, high: 236.6, low: 236.4, volume: 900 }); }
    return rows.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  };
  const chartAt = (hhmm: string) => {
    const W = et(D, hhmm);
    const out = maskOneDaySessions(rowsAt(W), W).filter((r: any) => !r._gapBreak);
    const c: Record<string, number> = {};
    for (const r of out) c[r.session] = (c[r.session] || 0) + 1;
    return { out, c, dates: [...new Set(out.map((r: any) => r.etDate))], dbg: (maskOneDaySessions(rowsAt(W), W) as any).sessionMaskDebug };
  };
  await t('09:29 ET(프리) — 오늘 프리 구간만(어제 차트로 돌아가지 않는다)', () => {
    const { c, dates, dbg } = chartAt('09:29');
    assert.deepEqual(dates, [D]); assert.ok((c.PRE || 0) > 50); assert.equal(c.REG || 0, 0); assert.equal(dbg.currentSession, 'PRE');
  });
  await t('★ 09:31 ET(정규장 · 정규장 봉은 아직 지연 중) — 오늘 프리 구간이 차트에 남는다', () => {
    const { c, dates, dbg } = chartAt('09:31');
    assert.deepEqual(dates, [D]); assert.ok((c.PRE || 0) > 50, '프리 구간이 사라졌다'); assert.equal(dbg.currentSession, 'REG');
  });
  await t('★ 09:45 ET — 프리 구간 + 정규장 첫 봉이 이어진다', () => {
    const { c } = chartAt('09:46');
    assert.ok((c.PRE || 0) > 50); assert.ok((c.REG || 0) >= 1);
  });
  await t('15:59 ET — 프리 + 정규장', () => {
    const { c } = chartAt('15:59');
    assert.ok((c.PRE || 0) > 50); assert.ok((c.REG || 0) > 300);
  });
  await t('★ 16:01 ET(애프터 봉은 아직 지연 중) — 프리 + 정규장이 그대로 남는다', () => {
    const { c, dbg } = chartAt('16:01');
    assert.ok((c.PRE || 0) > 50); assert.ok((c.REG || 0) > 300); assert.equal(dbg.currentSession, 'POST');
  });
  await t('16:20 ET — 프리 + 정규장 + 애프터가 이어진다', () => {
    const { c } = chartAt('16:20');
    assert.ok((c.PRE || 0) > 50); assert.ok((c.REG || 0) > 300); assert.ok((c.POST || 0) >= 1);
  });

  console.log('━━━ 6. 소스 고정 — 이 경로를 거친다 ━━━');
  await t('세 문(/api/live/ticker · /api/live/quotes · /api/intel/fast)이 정규장 PRE CLOSE 를 pickRegularPreClose 로 고르고 잠정값을 기억한다', () => {
    const root = path.join(__dirname, '..');
    for (const f of ['src/app/api/live/ticker/route.ts', 'src/app/api/live/quotes/route.ts', 'src/app/api/intel/fast/route.ts']) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      assert.ok(src.includes('pickRegularPreClose('), `${f}: pickRegularPreClose 를 부른다`);
      assert.ok(src.includes('rememberProvisionalPreClose('), `${f}: 잠정값을 기억한다`);
      assert.ok(src.includes('recallProvisionalPreCloses('), `${f}: 기억값을 읽는다`);
    }
    const q = fs.readFileSync(path.join(root, 'src/app/api/live/quotes/route.ts'), 'utf8');
    assert.ok(/extendedKind:/.test(q) && /extendedTime:/.test(q), 'quotes 가 값의 종류·체결 시각을 싣는다');
  });
  await t('앱 Command·Flow 가 잠정 표식(activeExtAsOf)을 그리고, 잇는 값(activeExtCarry)은 차트 «지금 가격»으로 쓰지 않는다', () => {
    const root = path.join(__dirname, '..');
    for (const f of ['src/app/[locale]/app-view/cmd/page.tsx', 'src/app/[locale]/app-view/flow/page.tsx']) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      assert.ok(src.includes('liveExtKind: livePrice?.extendedKind'), `${f}: 값 종류를 넘긴다`);
      assert.ok(src.includes('heroExtAsOf'), `${f}: 기준 시각을 그린다`);
    }
    const cmd = fs.readFileSync(path.join(root, 'src/app/[locale]/app-view/cmd/page.tsx'), 'utf8');
    assert.ok(/activeExtPrice > 0 && !activeExtCarry/.test(cmd), 'Command 차트 «지금 가격»에서 잇는 값을 뺀다');
    const hook = fs.readFileSync(path.join(root, 'src/hooks/useLivePrice.ts'), 'utf8');
    assert.ok(hook.includes('extendedKind') && hook.includes('extendedTime'), 'useLivePrice 가 값 종류·체결 시각을 넘긴다');
  });

  console.log(`\n${n}/${n + failed} 통과${failed ? ` — 실패 ${failed}` : ''}`);
  if (failed) process.exit(1);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
