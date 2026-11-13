// «실적 발표 직후» 알림(earnings_flash) — 발표 전 미발송 · 발표 후 1회 · 가격/기대값 없음 미발송 · 중복 0 · 상한 분리 · 언어별 문구 · 설정 존중
import assert from 'node:assert/strict';
import {
  runEarningsFlash, flashCopy, flashPath, quoteFromSnapshot, judgeMove, snapFromImplied, snapUsable, captureEntries, dueEntries, flashEntries, resolveFlashMode,
  FLASH_KEYS, FLASH_CFG, type FlashDeps, type FlashQuote, type FlashReaders, type ImpliedRowLike, type FlashEntry,
} from '../src/lib/signals/earningsFlash';

import { signalTapPath } from '../src/lib/app/signalTap';
import { SIG_KEYS, devKey } from '../src/lib/signals/plan';
import type { ConfirmedEarnings } from '../src/lib/earningsConfirmed';
import { FakeStore, FakeKv, FakeSender, IOS_TOKEN, IOS_TOKEN2, AND_TOKEN } from './_signalsFixtures';

let passed = 0;
const tests: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

// 11월 = EST(UTC−5)
const ET = (day: string, hh: number, mm = 0): number => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d, hh + 5, mm); };
const D = '2026-11-17';
const ce = (ticker: string, hour: 'amc' | 'bmo' | '', etTime?: string, date = D): ConfirmedEarnings =>
  ({ ticker, date, hour, ...(etTime ? { etTime } : {}), sourceKind: 'company-pr', sourceUrl: 'https://example.com', announcedOn: '2026-10-28', verifiedAt: '2026-11-09T00:00:00Z', quote: '' });
const LIST = [ce('NVDA', 'amc', '16:20'), ce('DIS', 'bmo'), ce('HD', '')];
const NV: FlashEntry = { ticker: 'NVDA', date: D, hour: 'amc', etTime: '16:20' };
const DIS: FlashEntry = { ticker: 'DIS', date: D, hour: 'bmo', etTime: null };

const implied = (o: Partial<ImpliedRowLike> = {}): ImpliedRowLike => ({ impliedMovePct: 6.24, expiry: '2026-11-20', asOf: ET(D, 15, 30), session: D, basis: 'live', ...o });
const postQuote = (o: Partial<FlashQuote> = {}): FlashQuote => ({
  session: 'POST', regularDate: D, regularClose: 200, prevClose: 198, regularTradeMs: ET(D, 16, 0), extendedPrice: 206, extendedTradeMs: ET(D, 16, 36), stale: false, ...o,
});
const regQuote = (o: Partial<FlashQuote> = {}): FlashQuote => ({
  session: 'REG', regularDate: D, regularClose: 97, prevClose: 100, regularTradeMs: ET(D, 10, 4), extendedPrice: null, extendedTradeMs: null, stale: false, ...o,
});

/** 저장소 호출을 센다 */
class CountStore extends FakeStore {
  calls = 0;
  async get(k: string) { this.calls++; return super.get(k); }
  async mget(keys: string[]) { this.calls++; return super.mget(keys); }
  async smembers(k: string) { this.calls++; return super.smembers(k); }
}

interface Rig { store: CountStore; kv: FakeKv; sender: FakeSender; deps: FlashDeps; quotes: string[]; impliedCalls: number; reserved: number[] }
function rig(f: { implied?: Record<string, ImpliedRowLike | null>; quote?: Record<string, FlashQuote | null>; actuals?: Record<string, unknown>; reserve?: number | null } = {}): Rig {
  const store = new CountStore(), kv = new FakeKv(), sender = new FakeSender();
  const r: Rig = { store, kv, sender, deps: null as any, quotes: [], impliedCalls: 0, reserved: [] };
  const readers: FlashReaders = {
    async implied(entries) { r.impliedCalls++; return new Map(entries.filter((e) => f.implied?.[e.ticker]).map((e) => [e.ticker, f.implied![e.ticker]!])); },
    async actuals(entries) { return new Map(entries.filter((e) => f.actuals?.[`${e.ticker}|${e.date}`]).map((e) => [`${e.ticker}|${e.date}`, f.actuals![`${e.ticker}|${e.date}`]])); },
    async quote(ticker) { r.quotes.push(ticker); return f.quote?.[ticker] ?? null; },
  };
  const reserve = f.reserve === null ? null : async (_k: string, n: number, _cap: number) => { r.reserved.push(n); return f.reserve ?? n; };
  r.deps = { store, kv, readers, sender, reserve, log: () => {} };
  return r;
}
const run = (r: Rig, now: number, extra: Partial<Parameters<typeof runEarningsFlash>[1]> = {}) =>
  runEarningsFlash(r.deps, { now, kind: 'cron', list: LIST, envMode: null, signalEnvMode: null, ...extra });
const dev = (r: Rig, token: string, tickers: string[], rec: Record<string, unknown> = {}) => r.store.addDevice(token, { watchlist: { t: tickers }, tz: 'Asia/Seoul', ...rec });
const snapKey = FLASH_KEYS.exp('NVDA', D);
/** 발표 전 마감 30분 안(15:35 ET)에 뜬 값 */
const putSnap = (r: Rig, o: Record<string, unknown> = {}) => r.store.m.set(snapKey, JSON.stringify({ pct: 6.2, expiry: '2026-11-20', session: D, asOf: ET(D, 15, 35), capturedAt: ET(D, 15, 35), src: 'snap', ...o }));

// ── 창 ──
t('창 — 장후 16:20 발표는 16:30 ET 체결부터·20:00 전까지 · 장전은 10:00~11:30 · 시각 미공지는 대상 아님', () => {
  const es = flashEntries(LIST);
  assert.deepEqual(es.map((e) => e.ticker), ['NVDA', 'DIS']);
  assert.deepEqual(dueEntries(es, ET(D, 16, 25)).map((e) => e.ticker), []);
  assert.deepEqual(dueEntries(es, ET(D, 16, 35)).map((e) => e.ticker), ['NVDA']);
  assert.deepEqual(dueEntries(es, ET(D, 19, 50)).map((e) => e.ticker), ['NVDA']);
  assert.deepEqual(dueEntries(es, ET(D, 20, 0)).map((e) => e.ticker), []);
  assert.deepEqual(dueEntries(es, ET(D, 9, 50)).map((e) => e.ticker), []);
  assert.deepEqual(dueEntries(es, ET(D, 10, 5)).map((e) => e.ticker), ['DIS']);
  assert.deepEqual(dueEntries(es, ET(D, 11, 30)).map((e) => e.ticker), []);
  // 뜨기: NVDA = 발표일 15:30~16:00 · DIS(장전 11/17) = 전 거래일 11/16 15:30~16:00
  assert.deepEqual(captureEntries(es, ET(D, 15, 35)).map((e) => e.ticker), ['NVDA']);
  assert.deepEqual(captureEntries(es, ET('2026-11-16', 15, 50)).map((e) => e.ticker), ['DIS']);
  assert.deepEqual(captureEntries(es, ET(D, 15, 20)).map((e) => e.ticker), []);
  assert.deepEqual(captureEntries(es, ET(D, 16, 0)).map((e) => e.ticker), []);
});

t('할 일 없는 회차 — 저장소 호출 0·공급사 0', async () => {
  const r = rig();
  dev(r, IOS_TOKEN, ['NVDA']);
  const rep = await run(r, ET(D, 14, 5));
  assert.equal(rep.status, 'idle'); assert.equal(r.store.calls, 0); assert.equal(r.quotes.length, 0); assert.equal(r.sender.calls, 0);
});

// ── 예상값 뜨기 ──
t('뜨기 — 15:35 ET 화면 값(세션=발표일·live·발표 뒤 첫 만기) 저장 · 다른 세션·오래된 값·발표일 만기는 버림', async () => {
  const r = rig({ implied: { NVDA: implied() } });
  dev(r, IOS_TOKEN, ['NVDA']);
  const rep = await run(r, ET(D, 15, 35));
  assert.deepEqual(rep.captured, ['NVDA|2026-11-17:6.2']);
  const s = JSON.parse(String(r.store.m.get(snapKey)));
  assert.equal(s.pct, 6.2); assert.equal(s.session, D); assert.equal(r.sender.calls, 0); assert.equal(r.quotes.length, 0);
  assert.equal(snapFromImplied(NV, implied({ session: '2026-11-16' }), ET(D, 15, 35)).ok, false);
  assert.equal(snapFromImplied(NV, implied({ asOf: ET(D, 13, 0) }), ET(D, 15, 35)).ok, false);
  assert.equal(snapFromImplied(NV, implied({ expiry: D }), ET(D, 15, 35)).ok, false);
  assert.equal(snapFromImplied(DIS, implied({ expiry: D, session: '2026-11-16', asOf: ET('2026-11-16', 15, 40) }), ET('2026-11-16', 15, 45)).ok, true, '장전은 발표일 만기 포함');
  // 종목을 담은 기기가 없으면 읽지도 않는다
  const r2 = rig({ implied: { NVDA: implied() } });
  dev(r2, IOS_TOKEN, ['AAPL']);
  await run(r2, ET(D, 15, 35));
  assert.equal(r2.impliedCalls, 0); assert.equal(r2.store.m.has(snapKey), false);
});

t('떠 둔 값 — 발표 뒤에 뜬 값(장후)·전 거래일 마감 뒤 값(장전)은 쓰지 않는다 · Upstash 자동 해석(객체)도 받는다', () => {
  const ok = { pct: 6.2, expiry: '2026-11-20', session: D, asOf: ET(D, 15, 35), capturedAt: ET(D, 15, 35), src: 'snap' };
  assert.equal(snapUsable(NV, JSON.stringify(ok))?.pct, 6.2);
  assert.equal(snapUsable(NV, ok)?.pct, 6.2);
  assert.equal(snapUsable(NV, { ...ok, capturedAt: ET(D, 16, 25) }), null);
  assert.equal(snapUsable(NV, { ...ok, session: '2026-11-16' }), null);
  const dis = { ...ok, session: '2026-11-16', expiry: D, asOf: ET('2026-11-16', 15, 40), capturedAt: ET('2026-11-16', 15, 45) };
  assert.equal(snapUsable(DIS, dis)?.pct, 6.2);
  assert.equal(snapUsable(DIS, { ...dis, capturedAt: ET('2026-11-16', 18, 0) }), null);
});

// ── 발표 전 미발송 · 발표 후 1회 ──
t('발표 전·발표 직후 체결(16:20)은 판정하지 않는다 — 발송 0·고정 0', async () => {
  const r = rig({ quote: { NVDA: postQuote({ extendedTradeMs: ET(D, 16, 21) }) } });
  dev(r, IOS_TOKEN, ['NVDA']); putSnap(r);
  const before = await run(r, ET(D, 16, 10));
  assert.equal(before.status, 'idle'); assert.equal(r.quotes.length, 0);
  const rep = await run(r, ET(D, 16, 35));
  assert.equal(rep.events[0].reason, 'no_trade_after_release'); assert.equal(r.sender.calls, 0);
  assert.equal(r.store.m.has(FLASH_KEYS.ev('NVDA', D)), false);
});

t('발표 뒤 첫 판정 회차에 1회 — NVDA 담은 기기만 · 다음 회차 중복 0·공급사 재호출 0', async () => {
  const r = rig({ quote: { NVDA: postQuote() } });
  dev(r, IOS_TOKEN, ['NVDA', 'AAPL']); dev(r, IOS_TOKEN2, ['AAPL']); dev(r, AND_TOKEN, ['NVDA'], { locale: 'en', tz: 'America/New_York' });
  putSnap(r);
  const rep = await run(r, ET(D, 16, 50));
  assert.equal(rep.status, 'ok'); assert.deepEqual(rep.sent, { items: 2, ok: 2, fail: 0, dead: 0, claimLost: 0 });
  const ko = r.sender.items.find((i) => i.token === IOS_TOKEN)!;
  assert.deepEqual({ title: ko.title, body: ko.body }, { title: '⚡ NVDA 실적 발표', body: '옵션 예상 ±6.2% · 시간외 +3.0% (잠정 · 범위 안)' });
  assert.deepEqual(ko.data, { type: 'wl_signal', path: '/app-view/cmd?t=NVDA', ev: 'earnings_flash', t: 'NVDA', src: 'push_sig_earn', locale: 'ko' });
  assert.equal(ko.quiet, true, 'KST 06:50 = 현지 조용한 시간 → 소리 없이');
  const en = r.sender.items.find((i) => i.token === AND_TOKEN)!;
  assert.deepEqual({ title: en.title, body: en.body }, { title: '⚡ NVDA earnings out', body: 'Implied ±6.2% · after hours +3.0% (provisional · within range)' });
  assert.equal(en.platform, 'android'); assert.equal(en.quiet, false);
  assert.equal(r.sender.items.some((i) => i.token === IOS_TOKEN2), false);
  assert.equal(r.quotes.length, 1);
  // 다음 회차 — 값은 고정, 같은 기기 다시 안 보냄, 시세도 다시 안 읽음
  const again = await run(r, ET(D, 18, 5));
  assert.equal(again.sent, undefined); assert.equal(r.sender.items.length, 2); assert.equal(r.quotes.length, 1);
  // 새로 NVDA 를 담은 기기는 같은(고정된) 숫자로
  dev(r, 'c'.repeat(64), ['NVDA'], { locale: 'ja' });
  r.deps.readers.quote = async () => postQuote({ extendedPrice: 190 });
  const late = await run(r, ET(D, 18, 20));
  assert.equal(late.sent?.ok, 1);
  assert.equal(r.sender.items[2].body, '想定変動幅 ±6.2% · 時間外 +3.0%（暫定・範囲内）');
  assert.equal(r.sender.items[2].title, '⚡ NVDA 決算発表');
});

// ── 기대값·가격 없음 → 미발송 ──
t('예상값이 없으면(떠 둔 값·실적 기록 모두 없음) 시세도 읽지 않고 보내지 않는다', async () => {
  const r = rig({ quote: { NVDA: postQuote() } });
  dev(r, IOS_TOKEN, ['NVDA']);
  const rep = await run(r, ET(D, 16, 50));
  assert.equal(rep.events[0].reason, 'no_expected'); assert.equal(r.quotes.length, 0); assert.equal(r.sender.calls, 0);
});

t('가격이 없거나·낡았거나·다른 날 본장이면 보내지 않는다(고정도 안 함 → 다음 회차가 다시 본다)', async () => {
  for (const [q, why] of [[null, 'no_quote'], [postQuote({ stale: true }), 'quote_stale'], [postQuote({ regularDate: '2026-11-16' }), 'regular_2026-11-16'],
    [postQuote({ extendedPrice: null, extendedTradeMs: null }), 'no_price'], [postQuote({ session: 'CLOSED' }), 'session_CLOSED']] as const) {
    const r = rig({ quote: { NVDA: q as FlashQuote | null } });
    dev(r, IOS_TOKEN, ['NVDA']); putSnap(r);
    const rep = await run(r, ET(D, 16, 50));
    assert.equal(rep.events[0].reason, why); assert.equal(r.sender.calls, 0); assert.equal(r.store.m.has(FLASH_KEYS.ev('NVDA', D)), false);
  }
  assert.equal(judgeMove(NV, postQuote({ extendedPrice: 400 }), ET(D, 16, 50)).ok, false, '50% 넘는 등락은 틱 오류');
});

t('하루 공급사 예약을 못 받으면 시세를 읽지 않는다 · 예약은 종목당 4호출', async () => {
  const r = rig({ quote: { NVDA: postQuote() }, reserve: 0 });
  dev(r, IOS_TOKEN, ['NVDA']); putSnap(r);
  const rep = await run(r, ET(D, 16, 50));
  assert.equal(r.quotes.length, 0); assert.equal(rep.events[0].reason, 'quote_cap'); assert.deepEqual(r.reserved, [FLASH_CFG.vendorCallsPerQuote]);
  const r2 = rig({ quote: { NVDA: postQuote() }, reserve: null });
  dev(r2, IOS_TOKEN, ['NVDA']); putSnap(r2);
  await run(r2, ET(D, 16, 50));
  assert.equal(r2.quotes.length, 0, '예약 수단이 없으면 부르지 않는다');
});

// ── 장전 ──
t('장전(DIS) — 실적 기록의 전 거래일 EOD 예상값 · 10:00 ET 뒤 정규장 체결 · «장 초반» 문구 · 범위 밖', async () => {
  const actual = { v: 1, ticker: 'DIS', date: D, hour: 'bmo', at: ET(D, 6, 20), actual: null,
    expected: { pct: 2.6, method: 'weekly', straddlePct: 2.6, expiry: '2026-11-20', session: '2026-11-16', basis: 'eod', strike: 100, straddle: 2.6, spot: 100, capturedAt: ET(D, 6, 20), src: 'page' } };
  const r = rig({ quote: { DIS: regQuote() }, actuals: { 'DIS|2026-11-17': actual } });
  dev(r, IOS_TOKEN, ['DIS']);
  assert.equal((await run(r, ET(D, 9, 50))).status, 'idle');
  const rep = await run(r, ET(D, 10, 5));
  assert.equal(rep.sent?.ok, 1);
  assert.equal(r.sender.items[0].body, '옵션 예상 ±2.6% · 장 초반 −3.0% (잠정 · 범위 밖)');
  assert.equal(r.sender.items[0].data.path, '/app-view/cmd?t=DIS');
  // 10:00 전 체결·전 거래일 본장 → 판정 안 함
  assert.equal(judgeMove(DIS, regQuote({ regularTradeMs: ET(D, 9, 58) }), ET(D, 10, 5)).ok, false);
  assert.equal(judgeMove(DIS, regQuote({ session: 'PRE' }), ET(D, 10, 5)).ok, false);
});

// ── 상한 분리 ──
t('하루 상한은 이 알림 전용 — 무료 신호 상한이 차도 받는다 · 무료 신호 키는 쓰지 않는다 · 전용 상한이 차면 건너뛴다', async () => {
  const r = rig({ quote: { NVDA: postQuote() } });
  dev(r, IOS_TOKEN, ['NVDA']); dev(r, IOS_TOKEN2, ['NVDA']); putSnap(r);
  r.store.m.set(SIG_KEYS.cap(D, devKey(IOS_TOKEN)), 3);
  r.store.m.set(FLASH_KEYS.cap(D, devKey(IOS_TOKEN2)), FLASH_CFG.deviceDailyCap);
  const rep = await run(r, ET(D, 16, 50));
  assert.equal(rep.sent?.ok, 1); assert.equal(r.sender.items[0].token, IOS_TOKEN);
  assert.equal(r.store.m.get(SIG_KEYS.cap(D, devKey(IOS_TOKEN))), 3, '무료 신호 상한 그대로');
  assert.ok(r.store.writes.every((w) => !/push:sig:(cap|s|c):/.test(w)), `무료 신호 장부에 쓰지 않는다: ${r.store.writes.join(' ')}`);
  assert.equal(r.store.m.get(FLASH_KEYS.cap(D, devKey(IOS_TOKEN))), 1);
});

// ── 설정·모드 ──
t('마스터 알림 끔·«내 종목 신호» 끔·시스템 권한 꺼짐 기기는 받지 않는다', async () => {
  const r = rig({ quote: { NVDA: postQuote() } });
  dev(r, IOS_TOKEN, ['NVDA'], { preferences: { enabled: false } });
  dev(r, IOS_TOKEN2, ['NVDA'], { preferences: { signals: false } });
  dev(r, AND_TOKEN, ['NVDA'], { notifPerm: false });
  putSnap(r);
  const rep = await run(r, ET(D, 16, 50));
  assert.equal(rep.status, 'no-devices'); assert.equal(r.sender.calls, 0); assert.equal(r.quotes.length, 0);
});

t('모드 — 전용 off·무료 신호 비상 off·환경 off 는 0 · dry 는 판정만(발송·장부·고정 0) · 기본 live', async () => {
  assert.equal(resolveFlashMode(null, null, null, null), 'live');
  assert.equal(resolveFlashMode('dry', null, null, 'live'), 'dry');
  assert.equal(resolveFlashMode('live', null, null, 'off'), 'off');
  for (const setup of [(r: Rig) => r.store.m.set(FLASH_KEYS.mode, 'off'), (r: Rig) => r.store.m.set(SIG_KEYS.mode, 'off')]) {
    const r = rig({ quote: { NVDA: postQuote() } });
    dev(r, IOS_TOKEN, ['NVDA']); putSnap(r); setup(r);
    const rep = await run(r, ET(D, 16, 50));
    assert.equal(rep.status, 'off'); assert.equal(r.sender.calls, 0); assert.equal(r.quotes.length, 0);
  }
  const r = rig({ quote: { NVDA: postQuote() } });
  dev(r, IOS_TOKEN, ['NVDA']); putSnap(r); r.store.m.set(FLASH_KEYS.mode, 'dry');
  const rep = await run(r, ET(D, 16, 50));
  assert.equal(rep.mode, 'dry'); assert.equal(r.sender.calls, 0); assert.equal(rep.events[0].recipients, 1);
  assert.equal(r.store.ledgerKeys().filter((k) => k !== FLASH_KEYS.mode && k !== snapKey).length, 0, `dry 는 장부·고정 0: ${r.store.ledgerKeys().join(' ')}`);
  assert.equal(rep.samples[0].ko.body, '옵션 예상 ±6.2% · 시간외 +3.0% (잠정 · 범위 안)');
});

t('미리보기 — 아무것도 쓰지 않는다(잠금·뜨기·고정·장부·통계 0) · 가짜 기기 표본', async () => {
  const r = rig({ quote: { NVDA: postQuote() } });
  putSnap(r);
  const before = r.store.writes.length;
  const rep = await run(r, ET(D, 16, 50), { kind: 'preview', sim: { tickers: ['NVDA'], only: true } });
  assert.equal(r.store.writes.length, before); assert.equal(r.kv.writes.length, 0); assert.equal(r.sender.calls, 0);
  assert.equal(rep.events[0].recipients, 1);
});

// ── 겹침·경합·발송 결과 ──
t('겹침 — 잠금이 있으면 아무것도 안 한다 · 다른 회차가 먼저 고정한 값을 그대로 쓴다', async () => {
  const r = rig({ quote: { NVDA: postQuote() } });
  dev(r, IOS_TOKEN, ['NVDA']); putSnap(r);
  r.store.m.set(FLASH_KEYS.lock, '1');
  assert.equal((await run(r, ET(D, 16, 50))).status, 'locked');
  r.store.m.delete(FLASH_KEYS.lock);
  // 다른 회차가 먼저 고정(−1.5%) — 이번 회차는 그 값으로 보낸다
  r.store.m.set(FLASH_KEYS.ev('NVDA', D), JSON.stringify({ v: 1, ticker: 'NVDA', date: D, hour: 'amc', expectedPct: 6.2, expectedSrc: 'snap', movePct: -1.5, base: 200, price: 197, priceAtMs: ET(D, 16, 33), decidedAt: ET(D, 16, 35) }));
  await run(r, ET(D, 16, 50));
  assert.equal(r.quotes.length, 0); assert.equal(r.sender.items[0].body, '옵션 예상 ±6.2% · 시간외 −1.5% (잠정 · 범위 안)');
});

t('발송 실패(fail)도 장부를 둔다(다시 보내면 중복 위험) · 죽은 토큰은 정리', async () => {
  const r = rig({ quote: { NVDA: postQuote() } });
  dev(r, IOS_TOKEN, ['NVDA']); dev(r, AND_TOKEN, ['NVDA']); putSnap(r);
  r.sender.failIds = (it) => (it.token === IOS_TOKEN ? 'fail' : 'dead');
  const rep = await run(r, ET(D, 16, 50));
  assert.deepEqual(rep.sent, { items: 2, ok: 0, fail: 1, dead: 1, claimLost: 0 });
  assert.equal(r.store.m.has(`push:tokens:${AND_TOKEN}`), false);
  r.sender.failIds = null;
  await run(r, ET(D, 18, 5));
  assert.equal(r.sender.items.length, 2, '같은 기기에 다시 보내지 않는다');
});

t('모닝·마감 푸시 겹침 금지 창(21:55~22:55Z)에는 아무것도 안 한다 — 다음 회차가 이어받는다', async () => {
  const r = rig({ quote: { NVDA: postQuote() } });
  dev(r, IOS_TOKEN, ['NVDA']); putSnap(r);
  const rep = await run(r, ET(D, 17, 5));   // 22:05Z
  assert.equal(rep.status, 'blackout'); assert.equal(r.store.calls, 0); assert.equal(r.quotes.length, 0);
  assert.equal((await run(r, ET(D, 18, 5))).sent?.ok, 1);
});

t('같은 종목 쿨다운(5일) — 다른 발표일로 고쳐져도 다시 보내지 않는다', async () => {
  const r = rig({ quote: { NVDA: postQuote() } });
  dev(r, IOS_TOKEN, ['NVDA']); putSnap(r);
  r.store.m.set(FLASH_KEYS.cool(devKey(IOS_TOKEN), 'NVDA'), '1');
  const rep = await run(r, ET(D, 16, 50));
  assert.equal(rep.sent, undefined); assert.equal(r.sender.calls, 0);
});

// ── 문구·탭·시세 변환 ──
t('문구 — 범위 밖·음수·0 · 보이는 소수 1자리끼리 모순 없음 · 탭 경로는 닫힌 목록', () => {
  const ev = { ticker: 'NVDA', hour: 'amc' as const, expectedPct: 6.2 };
  assert.equal(flashCopy({ ...ev, movePct: -8.04 }, 'ko').body, '옵션 예상 ±6.2% · 시간외 −8.0% (잠정 · 범위 밖)');
  assert.equal(flashCopy({ ...ev, movePct: 6.24 }, 'ko').body, '옵션 예상 ±6.2% · 시간외 +6.2% (잠정 · 범위 안)');
  assert.equal(flashCopy({ ...ev, movePct: 6.26 }, 'en').body, 'Implied ±6.2% · after hours +6.3% (provisional · outside range)');
  assert.equal(flashCopy({ ...ev, movePct: 0.01 }, 'ja').body, '想定変動幅 ±6.2% · 時間外 0.0%（暫定・範囲内）');
  assert.equal(signalTapPath(flashPath('NVDA')), '/app-view/cmd?t=NVDA');
  assert.equal(signalTapPath('/app-view/cmd?t=NVDA&x=1'), null);
  assert.equal(signalTapPath('/app-view/cmd?t=nvda'), null);
  assert.equal(signalTapPath('https://evil.example/app-view/cmd?t=NVDA'), null);
  assert.equal(signalTapPath('/app-view/flow?t=NVDA&from=sig'), '/app-view/flow?t=NVDA&from=sig', '기존 경로 그대로');
  assert.equal(signalTapPath('/app-view/earnings'), '/app-view/earnings');
});

t('시세 변환 — getTickerSnapshot 모양에서 시간외 체결 시각·본장 날짜·낡음', () => {
  const snap = { status: 'OK', ticker: { lastTrade: { p: 206, t: ET(D, 16, 36) * 1e6 }, _rtStale: false,
    _intrinio: { session: 'POST', regularDate: D, regularClose: 200, prevClose: 198, regularLastTime: new Date(ET(D, 16, 0)).toISOString(), extendedPrice: 206, hasExtendedTrade: true } } };
  assert.deepEqual(quoteFromSnapshot(snap), postQuote());
  const noExt = quoteFromSnapshot({ ...snap, ticker: { ...snap.ticker, _intrinio: { ...snap.ticker._intrinio, hasExtendedTrade: false } } })!;
  assert.equal(noExt.extendedPrice, null); assert.equal(noExt.extendedTradeMs, null);
  assert.equal(quoteFromSnapshot({ status: 'NOT_FOUND', ticker: null }), null);
  assert.equal(quoteFromSnapshot({ ...snap, ticker: { ...snap.ticker, _rtStale: true } })!.stale, true);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { console.error(`  ✗ ${name}\n`, e); process.exitCode = 1; }
  }
  console.log(`${passed}/${tests.length} 통과`);
})();
