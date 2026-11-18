/**
 * «✦ AI 오늘 볼 것» 넓힌 선별(2026-11-18, 대표 «특정한 사용자(옵션·맥스페인·다크풀)한테만 알리려 하지 마») —
 * 종류(큰 폭 등락·예상 변동 없는 실적) · 순위 한도(전체 상위 3개 중 옵션 계열 ≤1 · 홈 2개) · 세션·분할 보정 · AI 대체 문장 · 옛 저장본 · 끄기 스위치.
 * 실행: npx tsx tests/todayPicksBroad.test.ts
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

const realFetch = globalThis.fetch;
let unexpectedFetches = 0;
// 기본: 모든 fetch 는 실패(프록시 묶음 없음). 시세 API 는 시험마다 quoteData 로 답한다.
let quoteData: Record<string, any> | null = null;
let quoteCalls = 0;
const mockFetch: typeof fetch = async (input: any) => {
  const url = String(input);
  if (url.includes('/api/live/quotes')) {
    quoteCalls++;
    if (!quoteData) throw new Error('quotes down');
    const syms = new URL(url).searchParams.get('symbols')!.split(',');
    const data: Record<string, any> = {};
    for (const s of syms) if (quoteData[s]) data[s] = quoteData[s];
    return { ok: true, json: async () => ({ data, session: 'post' }) } as any;
  }
  if (url.includes('/get?key=')) return { ok: false, json: async () => ({}) } as any;   // EC2 프록시(옵션 묶음) 없음
  unexpectedFetches++;
  throw new Error('broad 시험: 모의하지 않은 fetch ' + url);
};
globalThis.fetch = mockFetch;

const store = new Map<string, unknown>();
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = {
  id: rcPath, filename: rcPath, loaded: true,
  exports: {
    getFromCache: async (k: string) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
    mgetFromCache: async (ks: string[]) => ks.map((k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null)),
    setInCache: async (k: string, v: unknown) => { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    deleteFromCache: async (k: string) => { store.delete(k); return true; },
  },
} as unknown as Module;

let eodMock: { date: string; rows: Map<string, { c: number; chgPct: number; v: number }> } | null = null;
const eodPath = require.resolve('../src/services/eodSnapshot');
require.cache[eodPath] = { id: eodPath, filename: eodPath, loaded: true, exports: { EOD_SNAPSHOT_KEY: 'intrinio:eod:snapshot', readEodCloses: async () => eodMock } } as unknown as Module;

import { FreshTierSkipped } from '../src/lib/ai/freshTier';
const script: Array<{ text?: string }> = [];
let aiCalls = 0;
const systems: string[] = [];
const bcPath = require.resolve('../src/services/bedrockClient');
require.cache[bcPath] = {
  id: bcPath, filename: bcPath, loaded: true,
  exports: {
    callBedrock: async (o: any) => {
      aiCalls++; systems.push(o.system);
      const s = script.shift();
      if (!s) throw new FreshTierSkipped(['a55:cap']);
      const g = o.validate ? o.validate(s.text!) : { ok: true };
      if (!g.ok) throw new FreshTierSkipped(['a55:guard']);
      return { text: s.text!, provider: 'a55' };
    },
  },
} as unknown as Module;
const dpPath = require.resolve('../src/services/darkPool');
require.cache[dpPath] = { id: dpPath, filename: dpPath, loaded: true, exports: { getDarkPoolBatchChecked: async () => ({ ok: true, map: {} }) } } as unknown as Module;
const imPath = require.resolve('../src/services/impliedMoveService');
require.cache[imPath] = { id: imPath, filename: imPath, loaded: true, exports: { readImpliedMoveRows: async (reqs: any[]) => reqs.map((r) => (r.ticker === 'WMT' ? { ticker: 'WMT', impliedMovePct: 6.9, expiry: '2026-11-20', session: '2026-11-18' } : { ticker: r.ticker, impliedMovePct: null, expiry: null, session: null })) } } as unknown as Module;
const ecPath = require.resolve('../src/lib/earningsConfirmed');
const realEc = require(ecPath);
const FIXT_EARN = [
  { ticker: 'NVDA', date: '2026-11-17', hour: 'amc', sourceKind: 'company-pr', sourceUrl: 'https://x', announcedOn: '', verifiedAt: '', quote: '' },
  { ticker: 'TJX', date: '2026-11-18', hour: 'bmo', sourceKind: 'company-pr', sourceUrl: 'https://x', announcedOn: '', verifiedAt: '', quote: '' },
  { ticker: 'PANW', date: '2026-11-18', hour: 'amc', sourceKind: 'company-pr', sourceUrl: 'https://x', announcedOn: '', verifiedAt: '', quote: '' },
  { ticker: 'WMT', date: '2026-11-19', hour: 'bmo', sourceKind: 'ir-site', sourceUrl: 'https://x', announcedOn: '', verifiedAt: '', quote: '' },
  { ticker: 'ACME', date: '2026-11-19', hour: '', sourceKind: 'ir-site', sourceUrl: 'https://x', announcedOn: '', verifiedAt: '', quote: '' },
];
require.cache[ecPath] = { id: ecPath, filename: ecPath, loaded: true, exports: { ...realEc, CONFIRMED_EARNINGS: FIXT_EARN } } as unknown as Module;

import type { Cand, EarnFacts, MoverFacts, TodayPicksDoc } from '../src/lib/todayPicks/types';
import { isEtf } from '../src/lib/seo/etfSet';
import { checkPushLine } from '../src/lib/ai/todayPicksLine';
import { bannedHit, scriptOk, PUSH_LINE_MAX } from '../src/lib/push/aiLine';
import { forecastHitsInSentence } from '../src/lib/ai/trustLayer';

const sel = require('../src/lib/todayPicks/select') as typeof import('../src/lib/todayPicks/select');
const copy = require('../src/lib/todayPicks/copy') as typeof import('../src/lib/todayPicks/copy');
const cp = require('../src/lib/todayPicks/cardPick') as typeof import('../src/lib/todayPicks/cardPick');
const view = require('../src/lib/todayPicks/view') as typeof import('../src/lib/todayPicks/view');
const v2 = require('../src/lib/ai/todayPicksV2') as typeof import('../src/lib/ai/todayPicksV2');
const svc = require('../src/services/todayPicksService') as typeof import('../src/services/todayPicksService');

const LOCS = ['ko', 'en', 'ja'] as const;
const tests: Array<[string, () => unknown]> = [];
const t = (name: string, fn: () => unknown) => tests.push([name, fn]);

// 시각: 11/18(수) 17:00 ET(마감 뒤) · 11/19 03:30 ET(조기판) · 11/18 11:00 ET(장중)
const PM = Date.parse('2026-11-18T22:00:00Z');
const PRE = Date.parse('2026-11-19T08:30:00Z');
const MID = Date.parse('2026-11-18T16:00:00Z');
const row = (ticker: string, price: number, chg: number, value: number, extra: Record<string, unknown> = {}) => ({ ticker, price, changePercent: chg, volume: value / price, value, up: chg >= 0, spark: null, prevClose: null, prevCloseSource: 'snapshot', ...extra });
function seedMovers(ts: number) {
  const value = [row('NVDA', 160, 4.8, 60e9), row('MSFT', 506, -2.3, 14e9), row('SPY', 730, -1.0, 50e9), row('AAPL', 350, -0.3, 13e9), row('TSM', 360, -3.7, 9e9)];
  const gainers = [row('GTBP', 15, 205, 2e9), row('PENY', 3, 40, 1.5e9), row('SMOL', 20, 12, 4e8), row('BILL', 65, 12.6, 1.2e9), row('NVDA', 160, 4.8, 60e9)];
  const losers = [row('MSFT', 506, -2.3, 14e9), row('TSM', 360, -3.7, 9e9), row('CRWD', 400, -6.1, 3.5e9)];
  store.set('market:movers:all:v4', null as any); store.delete('market:movers:all:v4');
  store.set('market:movers:last_good:v4', { value, gainers, losers, ts });
}
const Q = (price: number, chg: number, date = '2026-11-18') => ({ regularDate: date, regularKind: 'close', price, regChangePct: chg, changePercent: chg });
const eodOf = (date: string, rows: Array<[string, number, number, number]>) => ({ date, rows: new Map(rows.map(([tk, c, chg, v]) => [tk, { c, chgPct: chg, v }])) });
// applyRegularClose 는 200종목 미만이면 EOD 를 믿지 않는다 → 채움 행
const filler = (n: number): Array<[string, number, number, number]> => Array.from({ length: n }, (_, i) => [`F${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26) % 26)}X`, 10, 0.1, 20000]);

function reset() { store.clear(); script.length = 0; aiCalls = 0; systems.length = 0; quoteData = null; quoteCalls = 0; eodMock = null; delete process.env.TODAY_PICKS_BROAD; }

// ━━━ 1. 종류 ━━━
t('큰 폭 등락 후보: 거래대금 문턱($8B·±2% / $3B·±3% / $1B·±5%) · 주가 $5↑ · ETF 제외 · 같은 종목 한 번 · 점수 = 크기×규모(근거 1.5배)', () => {
  const r = (ticker: string, price: number, changePct: number, value: number, ev: Partial<MoverFacts> = {}) => ({ ticker, session: '2026-11-18', price, changePct, value, earnings: null, news: null, ...ev });
  const c = sel.moverCandidates([
    r('MSFT', 506, -2.3, 14e9), r('AAPL', 350, -1.9, 13e9), r('AVGO', 340, 2.5, 5e9), r('CRWD', 400, -6.1, 3.5e9), r('BILL', 65, 12.6, 1.2e9),
    r('SMOL', 20, 12, 4e8), r('PENY', 3, 40, 1.5e9), r('SPY', 730, -3.1, 50e9), r('MSFT', 506, -2.3, 14e9),
    r('NVDA', 160, 4.8, 60e9, { earnings: { date: '2026-11-17', hour: 'amc' } }),
  ], { isEtf });
  assert.deepEqual(c.map((x) => x.ticker), ['NVDA', 'BILL', 'CRWD', 'MSFT']);   // NVDA 4.8×log(600)×1.5(실적 근거)=20 > BILL 12.6×log(12)=13.6
  assert.ok(c.every((x) => x.kind === 'mover' && x.asOf === '2026-11-18' && (x.facts as MoverFacts).session === '2026-11-18'));
  assert.equal((c[3].facts as MoverFacts).changePct, -2.3);
  assert.equal(sel.moverEligible({ ticker: 'AVGO', price: 340, changePct: 3.1, value: 5e9 }, isEtf), true);
  assert.equal(sel.moverEligible({ ticker: 'AVGO', price: 340, changePct: 2.9, value: 5e9 }, isEtf), false);
  assert.ok(sel.moverScore({ changePct: 4, value: 1e10, news: { headline: 'x' } }) > sel.moverScore({ changePct: 4, value: 1e10 }));
});

t('넓힌 실적: 오늘·내일 발표면 예상 변동이 없어도 후보 · 끝난 발표·창 밖·ETF 제외 · 예상 변동은 있으면 보조 정보', () => {
  const E = (ticker: string, date: string, hour: 'bmo' | 'amc' | '', implied: number | null, extra: Record<string, unknown> = {}) =>
    ({ ticker, date, hour, etTime: null, impliedPct: implied, impliedExpiry: implied != null ? '2026-11-20' : null, session: implied != null ? '2026-11-18' : null, done: false, ...extra });
  const c = sel.earningsCandidatesBroad([E('PANW', '2026-11-18', 'amc', null, { oi: 900_000 }), E('TJX', '2026-11-18', 'bmo', null, { done: true }), E('WMT', '2026-11-19', 'bmo', 6.9, { oi: 2e6 }),
    E('ACME', '2026-11-19', '', null), E('LATE', '2026-11-20', 'bmo', 5), E('SPY', '2026-11-18', 'bmo', null)], { dates: ['2026-11-18', '2026-11-19'], isEtf });
  assert.deepEqual(c.map((x) => x.ticker), ['PANW', 'WMT', 'ACME']);
  const panw = c[0].facts as EarnFacts;
  assert.equal(panw.impliedPct, null); assert.equal(panw.impliedExpiry, null);
  assert.equal((c[1].facts as EarnFacts).impliedPct, 6.9);
  for (const l of LOCS) {
    assert.doesNotMatch(copy.whatText(panw, l), /옵션|implied|想定|±/, '예상 변동이 없으면 숫자 칸은 일정만');
    assert.match(copy.whatText(c[1].facts, l), /±6\.9%/, '있으면 보조 정보로 뒤에');
    assert.ok(/11\/18/.test(copy.whatText(panw, l)) && /(장 마감 후|after the close|引け後)/.test(copy.whatText(panw, l)), '발표 시점');
  }
  assert.equal(copy.asOfText(panw, '2026-11-18', 'ko'), '회사 공지');
  assert.equal(copy.asOfText(c[1].facts, c[1].asOf, 'ko'), '11/18 기준');
});

// ━━━ 2. 순위 한도 ━━━
const M = (tk: string, score: number, session = '2026-11-18'): Cand<MoverFacts> => ({ id: `mover:${tk}`, kind: 'mover', ticker: tk, asOf: session, score, facts: { kind: 'mover', session, changePct: score, price: 100, value: 1e10, earnings: null, news: null } });
const E2 = (tk: string, date: string, score: number): Cand<EarnFacts> => ({ id: `earnings:${tk}`, kind: 'earnings', ticker: tk, asOf: date, score, facts: { kind: 'earnings', date, hour: 'amc', etTime: null, impliedPct: null, impliedExpiry: null, session: null } });
const W = (tk: string, score: number): Cand => ({ id: `whale:${tk}`, kind: 'whale', ticker: tk, asOf: '2026-11-17', score, facts: { kind: 'whale', openedOn: '2026-11-17', notional: score, callPct: 80, best: { type: 'call', strike: 100, expiry: '2026-12-18', added: 5000, oi: 6000, notional: score }, jump: 6 } });
const D = (tk: string, score: number): Cand => ({ id: `darkpool:${tk}`, kind: 'darkpool', ticker: tk, asOf: '2026-11-17', score, facts: { kind: 'darkpool', date: '2026-11-17', pct: 50, ratio: score, volume: 2e6, marketAvg: 45 } });
const G = (tk: string, score: number): Cand => ({ id: `gamma:${tk}`, kind: 'gamma', ticker: tk, asOf: '2026-11-17', score, facts: { kind: 'gamma', level: 'gammaFlip', chainDate: '2026-11-17', expiry: '2026-11-20', spot: 100, levelPrice: 100.5, distPct: 0.5, side: 'b' } });
const OPT = new Set(['whale', 'darkpool', 'gamma']);
const optIn = (xs: readonly { kind: string }[]) => xs.filter((x) => OPT.has(x.kind)).length;
const early = ['2026-11-18', '2026-11-19'];

t('조립: 일반 ≥3 → 상위 3개 일반·옵션 계열은 4~5위(종류 다르게) · 마감판은 큰 폭 등락부터 번갈아 · 같은 종목 한 번', () => {
  const r = sel.assembleBroad({ mover: [M('NVDA', 9), M('MSFT', 5), M('TSM', 4)], earnings: [E2('PANW', '2026-11-18', 2000), E2('WMT', '2026-11-19', 1000)], whale: [W('NVDA', 3e9), W('AMZN', 2e9)], darkpool: [D('BMY', 3)], gamma: [G('CRM', 6)] }, { earlyEarnDates: early, slot: 'pm' });
  assert.deepEqual(r.map((x) => x.id), ['mover:NVDA', 'earnings:PANW', 'mover:MSFT', 'whale:AMZN', 'darkpool:BMY']);
  assert.equal(optIn(r.slice(0, 3)), 0);
  assert.equal(new Set(r.map((x) => x.ticker)).size, r.length, '종목 중복 없음 — 고래 1위 NVDA 는 큰 폭 등락이 가져가 고래 2위 AMZN');
});
t('조립: 조기·아침판은 오늘 발표 실적부터 · 일반 2개면 3위 하나만 옵션 계열 · 1개면 2개만 · 0개면 옵션 계열 1개만(억지로 채우지 않는다)', () => {
  const pre = sel.assembleBroad({ mover: [M('NVDA', 9), M('MSFT', 5)], earnings: [E2('PANW', '2026-11-18', 2000)], whale: [W('AMZN', 2e9)], darkpool: [], gamma: [] }, { earlyEarnDates: early, slot: 'pre' });
  assert.deepEqual(pre.map((x) => x.id).slice(0, 3), ['earnings:PANW', 'mover:NVDA', 'mover:MSFT']);
  const two = sel.assembleBroad({ mover: [M('NVDA', 9)], earnings: [E2('PANW', '2026-11-18', 2000)], whale: [W('AMZN', 2e9), W('META', 1.9e9)], darkpool: [D('BMY', 3)], gamma: [G('CRM', 6)] }, { earlyEarnDates: early, slot: 'pm' });
  assert.equal(optIn(two.slice(0, 3)), 1); assert.deepEqual(two.slice(0, 2).map((x) => x.kind), ['mover', 'earnings']); assert.equal(two.length, 5);
  const one = sel.assembleBroad({ mover: [M('NVDA', 9)], earnings: [], whale: [W('AMZN', 2e9), W('META', 1.9e9)], darkpool: [D('BMY', 3)], gamma: [G('CRM', 6)] }, { earlyEarnDates: early, slot: 'pm' });
  assert.deepEqual(one.map((x) => x.id), ['mover:NVDA', 'whale:AMZN']);
  const none = sel.assembleBroad({ mover: [], earnings: [], whale: [W('AMZN', 2e9)], darkpool: [D('BMY', 3)], gamma: [G('CRM', 6)] }, { earlyEarnDates: early, slot: 'pm' });
  assert.deepEqual(none.map((x) => x.id), ['whale:AMZN']);
  assert.deepEqual(sel.assembleBroad({ mover: [], earnings: [], whale: [], darkpool: [], gamma: [] }), []);
  // 큰 폭 등락은 최대 3개 — 나머지는 실적·옵션 계열에 자리
  const many = sel.assembleBroad({ mover: [M('A', 9), M('B', 8), M('C', 7), M('D', 6), M('E', 5)], earnings: [], whale: [], darkpool: [], gamma: [] }, { slot: 'pm' });
  assert.deepEqual(many.map((x) => x.ticker), ['A', 'B', 'C']);
  // 직전 다른 날 문서가 같은 (종류·종목·세션)을 보였으면 뒤로
  const rot = sel.assembleBroad({ mover: [M('NVDA', 9), M('MSFT', 5)], earnings: [], whale: [], darkpool: [], gamma: [] }, { slot: 'pre', prev: [{ kind: 'mover', ticker: 'NVDA', asOf: '2026-11-18' }] });
  assert.deepEqual(rot.map((x) => x.ticker), ['MSFT', 'NVDA']);
});
t('홈 카드 2개: 일반 항목이 둘 이상이면 옵션 계열 0개 · 하나면 옵션 계열 최대 1개 · 순서 유지', () => {
  const k = (kind: string, id: string) => ({ kind, id });
  assert.deepEqual(cp.cardItems([k('mover', 'NVDA'), k('mover', 'MSFT'), k('earnings', 'PANW'), k('whale', 'AMZN')], 2, true).map((x) => x.id), ['NVDA', 'PANW']);
  assert.deepEqual(cp.cardItems([k('mover', 'NVDA'), k('mover', 'MSFT'), k('whale', 'AMZN'), k('darkpool', 'BMY')], 2, true).map((x) => x.id), ['NVDA', 'MSFT']);
  assert.deepEqual(cp.cardItems([k('mover', 'NVDA'), k('whale', 'AMZN'), k('darkpool', 'BMY')], 2, true).map((x) => x.id), ['NVDA', 'AMZN']);
  assert.deepEqual(cp.cardItems([k('whale', 'AMZN'), k('earnings', 'UNH'), k('darkpool', 'BMY')], 2, true).map((x) => x.id), ['AMZN', 'UNH']);
  assert.deepEqual(cp.cardItems([k('earnings', 'UNH'), k('whale', 'INTC'), k('earnings', 'GS')], 2, true).map((x) => x.id), ['UNH', 'GS']);
  assert.deepEqual(cp.cardItems([k('gamma', 'C'), k('whale', 'D')], 2, true).map((x) => x.id), ['C'], '넓힌 문서에서 일반 0개면 옵션 계열 1개');
  // 옛 저장본·끄기 스위치 문서(broad=false)는 예전 규칙 그대로
  assert.deepEqual(cp.cardItems([k('whale', 'INTC'), k('whale', 'AMZN'), k('darkpool', 'BMY')]).map((x) => x.id), ['INTC', 'BMY']);
  assert.deepEqual(cp.cardItems([k('earnings', 'UNH'), k('whale', 'INTC'), k('earnings', 'GS')]).map((x) => x.id), ['UNH', 'INTC']);
  for (const items of [[k('mover', 'A'), k('earnings', 'B'), k('gamma', 'C')], [k('earnings', 'B'), k('gamma', 'C'), k('whale', 'D')], [k('gamma', 'C'), k('whale', 'D')]]) {
    const out = cp.cardItems(items, 2, true); const gen = items.filter((x) => !OPT.has(x.kind)).length;
    assert.ok(gen >= 2 ? optIn(out) === 0 : optIn(out) <= 1, JSON.stringify(out));
  }
});

// ━━━ 3. 세션·분할 보정 ━━━
t('세션(마감 뒤 스냅샷): 그 세션 날짜·마감 30분 전 이후 + 시세 API 정규장 종가(같은 날짜) 대조 → 대조값 사용 · 대조 못 하면 뺀다 · 차이 1%p 초과·분할 의심·ETF·문턱 밖 제외', async () => {
  reset();
  seedMovers(Date.parse('2026-11-18T21:30:00Z'));
  eodMock = eodOf('2026-11-17', [...filler(260)]);   // T+1 — 아직 전날치 → 덮지 않는다
  quoteData = { NVDA: Q(160.2, 4.9), MSFT: Q(505.9, -2.31), TSM: Q(359.7, -1.5), CRWD: Q(400, -6.1, '2026-11-17') };
  const lm = await svc.loadMovers(PM);
  assert.equal(lm.session, '2026-11-18');
  assert.deepEqual(lm.rows.map((r) => r.ticker).sort(), ['MSFT', 'NVDA']);
  const nvda = lm.rows.find((r) => r.ticker === 'NVDA')!;
  assert.equal(nvda.price, 160.2); assert.equal(nvda.changePct, 4.9, '숫자는 정규장 종가 대조값');
  assert.equal(nvda.shownValue, null, '마감 뒤 스냅샷의 거래대금은 표시하지 않는다(시간외·장중 혼입)');
  assert.ok(lm.notes.includes('movers:drift:TSM'), 'TSM 캐시 −3.7 vs 종가 −1.5 → 다른 값이면 뺀다');
  assert.ok(lm.notes.includes('movers:unverified:CRWD'), '시세의 정규장 날짜가 다르면 스냅샷 행은 쓰지 않는다');
  assert.ok(!lm.rows.some((r) => ['GTBP', 'SPY', 'PENY', 'SMOL', 'AAPL'].includes(r.ticker)), '분할 의심(+205% · $15)·ETF·$5 미만·문턱 밖 제외');
  assert.equal(nvda.earnings?.hour, 'amc', '전 거래일(11/17) 장 마감 후 회사 공지 실적');
  assert.equal(quoteCalls, 1, '시세 API 한 번');
  // 시세 API 장애 → 스냅샷 행은 전부 뺀다(전날·장중 값을 오늘로 쓰지 않는다)
  quoteData = null;
  const down = await svc.loadMovers(PM);
  assert.deepEqual(down.rows, []); assert.ok(down.notes.includes('movers:quotes-unavailable'));
});
t('세션(조기판 03:30 ET): 자정 뒤 스냅샷은 버리고 EOD(마지막으로 끝난 세션)가 맞을 때만 — 항목 날짜는 11/18, 문장은 «11/18 종가»(오늘이라 하지 않는다) · EOD 가 밀리면 0', async () => {
  reset();
  seedMovers(Date.parse('2026-11-19T07:50:00Z'));   // 02:50 ET — 새 세션으로 리셋된 스냅샷
  eodMock = eodOf('2026-11-18', [['NVDA', 160.2, 4.9, 375e6], ['MSFT', 505.9, -2.3, 27.7e6], ['AAPL', 350, -0.3, 37e6], ...filler(260)]);
  const lm = await svc.loadMovers(PRE);
  assert.equal(lm.session, '2026-11-18');
  assert.deepEqual(lm.rows.map((r) => r.ticker), ['NVDA', 'MSFT'], 'EOD 행(시세 API 없어도 확정 종가)');
  assert.equal(lm.rows[0].shownValue, 160.2 * 375e6, 'EOD 확정 거래대금은 표시');
  const c = sel.moverCandidates(lm.rows, { isEtf });
  for (const x of c) for (const l of LOCS) {
    const f = x.facts as MoverFacts;
    const text = [copy.whatText(f, l), copy.asOfText(f, x.asOf, l), copy.pushBody(x.ticker, f, l), copy.fallbackWhy(f, l)].join(' | ');
    assert.doesNotMatch(text, /오늘|today|今日|本日/i, text);
    assert.match(copy.asOfText(f, x.asOf, l), /11\/18/);
  }
  // 무버 목록(거래대금 상위 30 · 등락률 상위 30)에 못 드는 대형주 큰 폭 하락도 같은 세션 EOD 전 종목에서 후보가 된다
  const bigFlat: Array<[string, number, number, number]> = Array.from({ length: 35 }, (_, i) => [`BG${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`, 100, 0.1, 5e7]);
  const smallCrash: Array<[string, number, number, number]> = Array.from({ length: 35 }, (_, i) => [`SC${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`, 4, -30, 5e6]);
  eodMock = eodOf('2026-11-18', [['CRM', 220, -9.4, 1.2e7], ...bigFlat, ...smallCrash, ...filler(200)]);
  const wide = await svc.loadMovers(PRE);
  assert.deepEqual(wide.rows.map((r) => r.ticker), ['CRM'], 'CRM −9.4%·$2.6B — 목록 밖이지만 같은 세션 EOD 에 있다');
  eodMock = eodOf('2026-11-17', [...filler(260)]);
  const lag = await svc.loadMovers(PRE);
  assert.deepEqual(lag.rows, [], 'EOD 가 전날치(T+1)면 자정 뒤 스냅샷도 못 쓰니 0');
  assert.deepEqual((await svc.loadMovers(MID)).notes, ['movers:regular-open'], '장중에는 «끝난 세션»이 아니라 0');
});
t('근거: 종목 태그(2개 이하)·그 세션 전 거래일 마감 뒤 기사만 · 시장 전체 기사·옛 기사 제외', async () => {
  reset();
  seedMovers(Date.parse('2026-11-18T21:30:00Z'));
  quoteData = { NVDA: Q(160.2, 4.9), MSFT: Q(505.9, -2.31) };
  store.set('guardian:news:digest:v2', { items: [
    { headline: 'Stock Market: Will S&P 500 Open Up or Down Today?', tickers: ['MSFT'], publishedAt: '2026-11-18T12:00:00Z' },
    { headline: 'Microsoft cuts cloud prices for AI customers', tickers: ['MSFT'], publishedAt: '2026-11-17T18:00:00Z' },
    { headline: 'Microsoft unveils new AI agent platform at developer event', tickers: ['MSFT'], publishedAt: '2026-11-18T15:00:00Z' },
  ] });
  const lm = await svc.loadMovers(PM);
  assert.equal(lm.rows.find((r) => r.ticker === 'MSFT')!.news?.headline, 'Microsoft unveils new AI agent platform at developer event');
  assert.equal(lm.rows.find((r) => r.ticker === 'NVDA')!.news, null);
  // 세션 마감 뒤 나온 보도는 끝난 등락의 근거가 아니다(관문 11/18)
  store.set('guardian:news:digest:v2', { items: [{ headline: 'Microsoft names new cloud chief after the bell', tickers: ['MSFT'], publishedAt: '2026-11-18T21:20:00Z' }] });
  const after = await svc.loadMovers(PM);
  assert.equal(after.rows.find((r) => r.ticker === 'MSFT')!.news, null);
});

t('발표가 이미 나왔나(넓힌 선별): 공지 시각 → 그 시각 · 개장 전 → 09:30 · 장 마감 후·미정 → 정규장 마감 · 같은 날 후보 0이면 직전 문서에서 끝난 실적만 걷어 낸다', async () => {
  const at = (hhmm: string) => Date.parse(`2026-11-18T${hhmm}:00-05:00`);
  assert.equal(svc.releasedBroad({ date: '2026-11-18', hour: 'amc', etTime: '16:20' }, at('16:19')), false);
  assert.equal(svc.releasedBroad({ date: '2026-11-18', hour: 'amc', etTime: '16:20' }, at('16:20')), true);
  assert.equal(svc.releasedBroad({ date: '2026-11-18', hour: 'amc' }, at('15:59')), false);
  assert.equal(svc.releasedBroad({ date: '2026-11-18', hour: 'amc' }, at('16:00')), true);
  assert.equal(svc.releasedBroad({ date: '2026-11-18', hour: 'bmo' }, at('09:30')), true);
  assert.equal(svc.releasedBroad({ date: '2026-11-19', hour: 'bmo' }, at('20:00')), false);
  assert.equal(svc.releasedBroad({ date: '2026-11-17', hour: 'amc' }, at('08:00')), true);
  // 직전 같은 날 문서 [PANW 실적(장 마감 후), 큰 폭 등락] · 지금 후보 0 → PANW 만 걷어 낸 문서로 바꾼다
  reset();
  const prevDoc: TodayPicksDoc = { v: 1, slot: 'pm', etDate: '2026-11-18', at: at('16:30'), stamp: { opt: null, opened: null, finra: null, chain: null, earn: '2026-11-18', sel: 'broad1' }, sel: 'broad1',
    items: [
      { id: 'earnings:PANW', kind: 'earnings', ticker: 'PANW', asOf: '2026-11-18', facts: { kind: 'earnings', date: '2026-11-18', hour: 'amc', etTime: null, impliedPct: null, impliedExpiry: null, session: null }, what: { ko: 'a', en: 'a', ja: 'a' }, why: { ko: 'b', en: 'b', ja: 'b' }, whyAi: false, push: { ko: 'c', en: 'c', ja: 'c' } },
      { id: 'mover:MSFT', kind: 'mover', ticker: 'MSFT', asOf: '2026-11-17', facts: MV({ session: '2026-11-17' }), what: { ko: 'a', en: 'a', ja: 'a' }, why: { ko: 'b', en: 'b', ja: 'b' }, whyAi: false, push: { ko: 'c', en: 'c', ja: 'c' } },
    ], gen: { calls: 0, ok: 0, fallback: 2, ms: 1 } };
  store.set('todaypicks:v1:latest', prevDoc);
  // 실적 일정 모의에서 오늘·내일 후보가 모두 끝난 시각(목 11/19 장 마감 뒤 + 무버 없음)이 아니라, 같은 날(11/18) 19:00 ET · 무버 캐시 없음 · 실적은 WMT(11/19)만 남는다 → 후보가 있으므로 새로 만든다
  const r = await svc.runPicks({ now: at('19:00'), force: true, noAi: true });
  assert.equal(r.status, 'generated');
  assert.ok(!(store.get('todaypicks:v1:latest') as TodayPicksDoc).items.some((p) => p.ticker === 'PANW'));
  // 후보 0(내일 실적도 끝난 시각으로 흉내: 11/19 19:00 ET, 무버·옵션 없음) + 같은 날 직전 문서에 끝난 실적 → pruned
  const at19 = Date.parse('2026-11-19T19:00:00-05:00');
  store.set('todaypicks:v1:latest', { ...prevDoc, etDate: '2026-11-19', items: [{ ...prevDoc.items[0], id: 'earnings:WMT', ticker: 'WMT', facts: { ...prevDoc.items[0].facts, date: '2026-11-19', hour: 'bmo' } }, prevDoc.items[1]] });
  const p = await svc.runPicks({ now: at19, force: true, noAi: true });
  assert.equal(p.status, 'pruned');
  const left = store.get('todaypicks:v1:latest') as TodayPicksDoc;
  assert.deepEqual(left.items.map((x) => x.id), ['mover:MSFT'], '끝난 실적만 빠지고 나머지 항목·문장은 그대로');
  // 읽기에서도: 넓힌 문서의 끝난 실적은 보이지 않는다(크론 사이·다음 날) · 옛 문서는 그대로 · 모두 끝났으면 문서 없음
  store.set('todaypicks:v1:latest', prevDoc);
  const r1 = await svc.readPicks(at('15:50'));
  assert.deepEqual(r1.doc!.items.map((x) => x.id), ['earnings:PANW', 'mover:MSFT'], '15:50 — 아직 발표 전(장 마감 후 발표·시각 미정 → 16:00)');
  const r2 = await svc.readPicks(Date.parse('2026-11-19T08:00:00-05:00'));
  assert.deepEqual(r2.doc!.items.map((x) => x.id), ['mover:MSFT'], '다음 날 — 끝난 실적 숨김');
  store.set('todaypicks:v1:latest', { ...prevDoc, sel: undefined });
  assert.equal((await svc.readPicks(Date.parse('2026-11-19T08:00:00-05:00'))).doc!.items.length, 2, '옛 문서는 그대로');
  store.set('todaypicks:v1:latest', { ...prevDoc, items: [prevDoc.items[0]] });
  assert.equal((await svc.readPicks(Date.parse('2026-11-19T08:00:00-05:00'))).doc, null);
});

// ━━━ 4. 문장·AI ━━━
const MV = (ev: Partial<MoverFacts> = {}): MoverFacts => ({ kind: 'mover', session: '2026-11-18', changePct: -2.3, price: 505.9, value: 14e9, earnings: null, news: null, ...ev });
t('규칙 문장(큰 폭 등락·넓힌 실적): 3개 언어 금지어·예측어·언어 체계 · 옵션 용어 없음 · 푸시 상한', () => {
  const facts = [MV(), MV({ changePct: 4.9, earnings: { date: '2026-11-17', hour: 'amc' } }), MV({ news: { headline: 'x', publishedAt: '' } }), MV({ earnings: { date: '2026-11-18', hour: 'bmo' } }),
    { kind: 'earnings', date: '2026-11-18', hour: 'amc', etTime: null, impliedPct: null, impliedExpiry: null, session: null } as EarnFacts,
    { kind: 'earnings', date: '2026-11-19', hour: '', etTime: '08:00', impliedPct: null, impliedExpiry: null, session: null } as EarnFacts];
  for (const f of facts) for (const l of LOCS) {
    for (const s of [copy.whatText(f, l), copy.fallbackWhy(f, l), copy.pushLine('MSFT', f, l)]) {
      assert.equal(bannedHit(s), null, s); assert.ok(scriptOk(s, l), s);
      assert.deepEqual(forecastHitsInSentence(s.replace(/^✦[^·]*·\s*/, ''), l), [], s);
    }
    assert.doesNotMatch(copy.fallbackWhy(f, l), /옵션|option|オプション|미결제|建玉|다크풀|dark pool|Gamma|Max Pain/i);
    assert.deepEqual(checkPushLine(copy.pushLine('MSFT', f, l), l, PUSH_LINE_MAX[l]), []);
  }
  assert.equal(copy.whatText(MV(), 'ko'), '종가 $505.9 (-2.3%) · 거래대금 $14B');
  assert.equal(copy.whatText(MV(), 'en'), 'Closed $505.9 (-2.3%) · $14B traded');
  assert.equal(copy.pushLine('MSFT', MV(), 'ko'), '✦ 오늘 볼 것 · MSFT 11/18 종가 -2.3%');
  assert.equal(copy.kindLabel(MV(), 'ko'), '큰 폭 하락'); assert.equal(copy.kindLabel(MV({ changePct: 3 }), 'en'), 'BIG MOVE UP');
  assert.equal(copy.asOfText(MV(), '2026-11-18', 'ja'), '11/18終値');
  assert.equal(copy.fallbackWhy(MV(), 'ko'), '움직임을 설명하는 보도는 확인되지 않았습니다');
  assert.equal(copy.whatText(facts[5], 'en'), 'Reports 11/19 08:00 ET');
  assert.equal(copy.whatText(MV({ value: null }), 'ko'), '종가 $505.9 (-2.3%)', '확정 거래대금이 없으면(마감 뒤 스냅샷) 쓰지 않는다');
  assert.doesNotMatch(copy.factsForAi('MSFT', MV({ value: null })), /Dollar volume/);
  // 옛 선별(끄기 스위치)의 실적 규칙 해설은 예전 문장 그대로 · 넓힌 선별만 일정 문장
  const ef = { kind: 'earnings', date: '2026-11-18', hour: 'amc', etTime: null, impliedPct: 5, impliedExpiry: '2026-11-20', session: '2026-11-18' } as EarnFacts;
  assert.equal(copy.fallbackWhy(ef, 'ko'), '발표 직후 움직임의 크기를 옵션 시장이 미리 가격에 담았습니다');
  assert.equal(copy.fallbackWhy(ef, 'ko', true), '회사가 공지한 장 마감 후 발표 일정입니다');
});
t('AI 가드(큰 폭 등락): 통과 예 · 옵션 용어·«오늘»·원인 단정·방향 뒤집기·사실 밖 숫자는 세 언어 모두 버린다', () => {
  const f = MV({ changePct: 4.9, price: 160.2, value: 60e9, earnings: { date: '2026-11-17', hour: 'amc' } });
  const ok = JSON.stringify({ ko: '실적 발표 뒤 첫 정규장에서 크게 올랐습니다', en: 'Rose sharply in the first session after its earnings report', ja: '決算発表後の最初の通常取引で大きく上昇しました' });
  assert.deepEqual(v2.checkPickV2Why(ok, 'NVDA', f, 2026, '2026-11-18').reasons, []);
  const bad = (ko: string) => v2.checkPickV2Why(JSON.stringify({ ko, en: 'Rose sharply in the first session after its earnings report', ja: '決算発表後の最初の通常取引で大きく上昇しました' }), 'NVDA', f, 2026, '2026-11-18');
  assert.ok(bad('오늘 실적 발표 뒤 크게 올랐습니다').reasons.some((r) => r.includes('today')));
  assert.ok(bad('실적 발표 때문에 크게 올랐습니다').reasons.some((r) => r.includes('cause')));
  assert.ok(bad('실적 발표 뒤 첫 정규장에서 크게 내렸습니다').reasons.some((r) => r.includes('dir:down')));
  assert.ok(bad('실적 뒤 옵션 거래가 크게 늘며 올랐습니다').reasons.some((r) => r.includes('jargon')));
  assert.ok(bad('실적 발표 뒤 7.5% 올랐습니다').reasons.some((r) => r.includes('number')));
  // 보도 헤드라인이 AI(주제어)를 담을 때만 그 낱말 허용(11/18 실모델) — 아니면 옛 금지어 그대로
  const ai = JSON.stringify({ ko: '인공지능 기업 인수 계획 보도가 있었습니다', en: 'A report said it plans to buy an AI firm', ja: 'AI企業の買収計画が報じられました' });
  const withAi = MV({ changePct: -5.8, news: { headline: 'Workday announces intent to acquire Honeydew for semantic layer AI and business intelligence', publishedAt: '2026-11-18T07:00:00Z' } });
  assert.ok(!v2.checkPickV2Why(ai, 'WDAY', withAi, 2026, '2026-11-18').reasons.some((r) => r.includes('forbidden:AI')));
  const noAi = MV({ changePct: -5.8, news: { headline: 'Workday announces intent to acquire Honeydew', publishedAt: '2026-11-18T07:00:00Z' } });
  assert.ok(v2.checkPickV2Why(ai, 'WDAY', noAi, 2026, '2026-11-18').reasons.some((r) => r.includes('forbidden:AI')));
  assert.equal(v2.systemFor(f), v2.TP_V2_MOVER_SYSTEM);
  assert.equal(v2.systemFor({ kind: 'darkpool', date: '2026-11-17', pct: 50, ratio: 2, volume: 2e6, marketAvg: 45 }), v2.TP_V2_SYSTEM, '기존 종류의 지시문은 그대로');
  const p = v2.buildPickV2Prompt('NVDA', f, '2026-11-18');
  assert.ok(p.includes('regular-session close on 11/18') && p.includes('UP (rose)') && p.includes('after the prior close'));
  assert.ok(svc.ruleOnly({ id: 'mover:X', kind: 'mover', ticker: 'X', asOf: '2026-11-18', score: 1, facts: MV() }, true));
  assert.ok(!svc.ruleOnly({ id: 'mover:X', kind: 'mover', ticker: 'X', asOf: '2026-11-18', score: 1, facts: f }, true));
  assert.ok(svc.ruleOnly({ id: 'earnings:X', kind: 'earnings', ticker: 'X', asOf: '2026-11-18', score: 1, facts: { kind: 'earnings', date: '2026-11-18', hour: 'amc', etTime: null, impliedPct: 5, impliedExpiry: '2026-11-20', session: '2026-11-18' } }, true));
  assert.ok(!svc.ruleOnly({ id: 'earnings:X', kind: 'earnings', ticker: 'X', asOf: '2026-11-18', score: 1, facts: { kind: 'earnings', date: '2026-11-18', hour: 'amc', etTime: null, impliedPct: 5, impliedExpiry: '2026-11-20', session: '2026-11-18' } }, false), '옛 선별은 그대로 AI');
});

// ━━━ 5. 생성 흐름·스위치·옛 저장본 ━━━
t('생성(마감 뒤): 넓힌 선별 문서(sel=broad1) · 근거 있는 큰 폭 등락만 AI(전용 지시문) · 실적·근거 없는 등락은 규칙 문장(AI 0) · 가드 실패면 규칙 문장', async () => {
  reset();
  seedMovers(Date.parse('2026-11-18T21:30:00Z'));
  quoteData = { NVDA: Q(160.2, 4.9), MSFT: Q(505.9, -2.31) };
  script.push({ text: JSON.stringify({ ko: '실적 발표 뒤 첫 정규장에서 크게 올랐습니다', en: 'Rose sharply in the first session after its earnings report', ja: '決算発表後の最初の通常取引で大きく上昇しました' }) });
  const r = await svc.runPicks({ now: PM, force: true });
  assert.equal(r.status, 'generated');
  const doc = store.get('todaypicks:v1:latest') as TodayPicksDoc;
  assert.equal(doc.sel, 'broad1'); assert.equal(doc.stamp.sel, 'broad1'); assert.match(String(doc.stamp.mov), /^2026-11-18\|NVDA/);
  // 17:00 ET — PANW(오늘 장 마감 후)는 이미 나온 발표라 빠진다(releasedBroad) · 일반 항목만 4개(옵션 묶음 없음)
  assert.deepEqual(doc.items.map((p) => p.id), ['mover:NVDA', 'earnings:WMT', 'mover:MSFT', 'earnings:ACME']);
  assert.equal(aiCalls, 1, 'NVDA(실적 근거)만 AI'); assert.equal(systems[0], v2.TP_V2_MOVER_SYSTEM);
  assert.equal(doc.items[0].whyAi, true);
  assert.equal(doc.items[2].why.ko, '움직임을 설명하는 보도는 확인되지 않았습니다'); assert.equal(doc.items[2].whyAi, false);
  assert.equal(doc.items[1].why.ko, '회사가 공지한 개장 전 발표 일정입니다');
  assert.equal(doc.items[3].why.ko, '회사가 공지한 발표일이며 시각은 정해지지 않았습니다');
  assert.equal(doc.gen.calls, 1);
  assert.equal(view.pushPickLine(doc, 'ko', '2026-11-18').line, '✦ 오늘 볼 것 · NVDA 11/18 종가 +4.9%', '푸시 1번 줄이 새 종류도 처리');
  assert.equal(view.buildView(doc, 'ko').sel, 'broad1');
  assert.equal(doc.items[0].what.ko, '종가 $160.2 (+4.9%)');
  assert.equal(doc.stamp.ern, 'WMT,ACME');
  // 가드 실패 → 규칙 문장
  script.push({ text: JSON.stringify({ ko: '오늘 실적 때문에 크게 올랐습니다', en: 'Rose today because of earnings', ja: '今日決算のため上昇しました' }) });
  await svc.runPicks({ now: PM, force: true });
  const doc2 = store.get('todaypicks:v1:latest') as TodayPicksDoc;
  assert.equal(doc2.items[0].whyAi, false); assert.equal(doc2.items[0].why.ko, '전 거래일 장 마감 후 회사가 실적을 발표했습니다');
  // 같은 자료면 다시 만들지 않는다 · 큰 폭 등락 종목이 바뀌면 다시 만든다
  aiCalls = 0;
  const again = await svc.runPicks({ now: PM });
  assert.equal(again.status, 'fresh'); assert.equal(aiCalls, 0);
  quoteData = { NVDA: Q(160.2, 4.9) };
  const changed = await svc.runPicks({ now: PM });
  assert.equal(changed.status, 'generated', 'stamp.mov 가 바뀌면 다시 만든다');
});
t('끄기 스위치: Redis todaypicks:broad:off 또는 TODAY_PICKS_BROAD=0 → 옛 선별(큰 폭 등락 없음·sel 없음·실적은 예상 변동 필수) · 크론 ?broad=0/1', async () => {
  reset();
  seedMovers(Date.parse('2026-11-18T21:30:00Z'));
  quoteData = { NVDA: Q(160.2, 4.9), MSFT: Q(505.9, -2.31) };
  assert.equal(await svc.broadOn(), true, '기본 켜짐');
  await svc.setBroad(false);
  assert.equal(await svc.broadOn(), false);
  const r = await svc.runPicks({ now: PM, force: true, noAi: true });
  const doc = store.get('todaypicks:v1:latest') as TodayPicksDoc;
  assert.equal(r.status, 'generated'); assert.equal(doc.sel, undefined); assert.equal(doc.stamp.sel, undefined);
  assert.deepEqual(doc.items.map((p) => p.id), ['earnings:WMT'], '옛 선별: 예상 변동 있는 실적만(옵션 묶음 없음)');
  await svc.setBroad(true);
  assert.equal(await svc.broadOn(), true);
  process.env.TODAY_PICKS_BROAD = '0';
  assert.equal(await svc.broadOn(), false);
  delete process.env.TODAY_PICKS_BROAD;
  const route = require('../src/app/api/cron/today-picks/route');
  const off = await (await route.GET(new Request('http://x/api/cron/today-picks?broad=0'))).json();
  assert.deepEqual(off, { ok: true, broad: false, action: 'broad-off' });
  const on = await (await route.GET(new Request('http://x/api/cron/today-picks?broad=1'))).json();
  assert.deepEqual(on, { ok: true, broad: true, action: 'broad-on' });
});
t('옛 저장본: sel 없는 문서(예상 변동 있는 실적·고래·다크풀·감마)는 그대로 읽힌다 — 뷰·푸시·카드', () => {
  const old: TodayPicksDoc = { v: 1, slot: 'pm', etDate: '2026-11-17', at: Date.parse('2026-11-17T23:05:00Z'), stamp: { opt: '2026-11-17', opened: '2026-11-14', finra: '2026-11-14', chain: '2026-11-17', earn: '2026-11-17' },
    items: [
      { id: 'earnings:HD', kind: 'earnings', ticker: 'HD', asOf: '2026-11-17', facts: { kind: 'earnings', date: '2026-11-18', hour: 'bmo', etTime: null, impliedPct: 4.1, impliedExpiry: '2026-11-21', session: '2026-11-17' },
        what: { ko: '11/18 장 시작 전 실적 · 옵션 예상 변동 ±4.1%', en: 'Reports 11/18 before the open · implied move ±4.1%', ja: '11/18 寄り付き前 決算 · 想定変動幅 ±4.1%' },
        why: { ko: '옛 AI 문장', en: 'old AI line', ja: '旧AI' }, whyAi: true, push: { ko: '✦ 오늘 볼 것 · HD 11/18 장 전 실적, 옵션 예상 변동 ±4.1%', en: '✦ Worth watching · HD reports 11/18 pre-market, implied move ±4.1%', ja: '✦ 今日の注目 · HD 11/18 寄り前 決算、想定変動幅 ±4.1%' } },
      { id: 'whale:META', kind: 'whale', ticker: 'META', asOf: '2026-11-14', facts: { kind: 'whale', openedOn: '2026-11-14', notional: 5e8, callPct: 90, best: { type: 'call', strike: 700, expiry: '2026-12-19', added: 5000, oi: 6000, notional: 3.5e8 }, jump: 6 },
        what: { ko: 'x', en: 'x', ja: 'x' }, why: { ko: 'y', en: 'y', ja: 'y' }, whyAi: false, push: { ko: 'z', en: 'z', ja: 'z' } },
    ], gen: { calls: 2, ok: 2, fallback: 0, ms: 1000 } };
  const v = view.buildView(old, 'ko');
  assert.equal(v.items.length, 2); assert.equal(v.items[0].what, '11/18 장 시작 전 실적 · 옵션 예상 변동 ±4.1%', '저장 문장 그대로'); assert.equal(v.items[0].why, '옛 AI 문장');
  assert.equal(v.items[0].label, '실적 임박'); assert.equal(v.items[0].asOf, '11/17 기준');
  assert.match(v.items[1].what, /12\/19 만기 \$700 콜/);
  assert.deepEqual(cp.cardItems(v.items, 2, v.sel === 'broad1').map((x) => x.ticker), ['HD', 'META']); assert.equal(v.sel, undefined);
  assert.equal(view.pushPickLine(old, 'ko', '2026-11-17').line, '✦ 오늘 볼 것 · HD 11/18 장 전 실적, 옵션 예상 변동 ±4.1%');
});

(async () => {
  let n = 0;
  try {
    for (const [name, fn] of tests) {
      await fn();
      assert.equal(unexpectedFetches, 0, `${name}: 모의하지 않은 fetch`);
      n++; console.log('ok -', name);
    }
  } finally { globalThis.fetch = realFetch; }
  console.log(`\n${n} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
