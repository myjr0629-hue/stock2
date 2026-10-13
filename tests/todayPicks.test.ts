/**
 * «✦ AI 오늘 볼 것» (2026-10-13, feat/today-picks) — 선별 규칙 · 규칙 문장(3개 언어) · AI 출구 가드 · 저장/생성 흐름 · 읽기 API · 푸시 한 줄 · 끄기 스위치 · 계측
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx","resolveJsonModule":true}' tests/todayPicks.test.ts
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// ── 모듈 바꿔 끼우기(서비스 import 보다 먼저): 레디스(메모리) · AI(대본) · 다크풀 · 예상 변동 · 실적 일정 ──
const store = new Map<string, unknown>();
const ttls = new Map<string, number | undefined>();
const writes: string[] = [];
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = {
  id: rcPath, filename: rcPath, loaded: true,
  exports: {
    getFromCache: async (k: string) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
    mgetFromCache: async (ks: string[]) => ks.map((k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null)),
    setInCache: async (k: string, v: unknown, ttl?: number) => { store.set(k, JSON.parse(JSON.stringify(v))); ttls.set(k, ttl); writes.push(k); return true; },
    deleteFromCache: async (k: string) => { store.delete(k); return true; },
  },
} as unknown as Module;

import { FreshTierSkipped, inFreshTier } from '../src/lib/ai/freshTier';
type Script = { text?: string; throwSkip?: boolean; throwErr?: boolean };
const script: Script[] = [];
let aiCalls = 0;
let sawFresh = true;
const prompts: string[] = [];
const bcPath = require.resolve('../src/services/bedrockClient');
require.cache[bcPath] = {
  id: bcPath, filename: bcPath, loaded: true,
  exports: {
    callBedrock: async (o: any) => {
      aiCalls++;
      prompts.push(o.userPrompt);
      sawFresh = sawFresh && inFreshTier();
      const s = script.shift() ?? { throwSkip: true };
      if (s.throwErr) throw new Error('boom');
      if (s.throwSkip) throw new FreshTierSkipped(['a55:cap']);
      const g = o.validate ? o.validate(s.text!) : true;
      if (g && typeof g === 'object' && !g.ok) throw new FreshTierSkipped(['a55:guard', 'a55:guard']);
      return { text: s.text!, model: 'claude-haiku-5.5', usedFallback: false, elapsedMs: 1200, provider: 'a55' };
    },
  },
} as unknown as Module;

let darkRows: Record<string, any> = {};
const dpPath = require.resolve('../src/services/darkPool');
require.cache[dpPath] = { id: dpPath, filename: dpPath, loaded: true, exports: { getDarkPoolBatchChecked: async () => ({ ok: true, map: darkRows }) } } as unknown as Module;

let impliedRows: any[] = [];
const imPath = require.resolve('../src/services/impliedMoveService');
require.cache[imPath] = { id: imPath, filename: imPath, loaded: true, exports: { readImpliedMoveRows: async (reqs: any[]) => reqs.map((r) => impliedRows.find((x) => x.ticker === r.ticker) ?? { ticker: r.ticker, impliedMovePct: null, expiry: null, session: null }) } } as unknown as Module;

const ecPath = require.resolve('../src/lib/earningsConfirmed');
const realEc = require(ecPath);
const FIXT_EARN = [
  { ticker: 'UNH', date: '2026-10-13', hour: 'bmo', sourceKind: 'sec-8k', sourceUrl: 'https://x', announcedOn: '', verifiedAt: '', quote: '' },
  { ticker: 'GS', date: '2026-10-13', hour: 'bmo', sourceKind: 'sec-8k', sourceUrl: 'https://x', announcedOn: '', verifiedAt: '', quote: '' },
  { ticker: 'ASML', date: '2026-10-14', hour: 'bmo', sourceKind: 'sec-8k', sourceUrl: 'https://x', announcedOn: '', verifiedAt: '', quote: '' },
  { ticker: 'NFLX', date: '2026-10-20', hour: 'amc', sourceKind: 'sec-8k', sourceUrl: 'https://x', announcedOn: '', verifiedAt: '', quote: '' },
];
require.cache[ecPath] = { id: ecPath, filename: ecPath, loaded: true, exports: { ...realEc, CONFIRMED_EARNINGS: FIXT_EARN } } as unknown as Module;

import {
  whaleCandidates, darkCandidates, gammaCandidates, earningsCandidates, assemble, nextWeekdays, addDays,
  WHALE_MIN_NOTIONAL, type LevelRowIn, type EarnRowIn, type DarkRowIn, type OptionsEodBundle,
} from '../src/lib/todayPicks/select';
import { whatText, kindLabel, asOfText, fallbackWhy, pushLine, pushBody, ruleTexts, usd, factsForAi, angleHint, daysUntil, PUSH_PREFIX, UI } from '../src/lib/todayPicks/copy';
import { buildPickUserPrompt, checkPickWhy, checkPushLine, levelDirection, multiplierWords, TP_SYSTEM, TP_WHY_MAX } from '../src/lib/ai/todayPicksLine';
import { buildView, pushPickLine, pickedAtLabel, TODAY_APP_FROM, TODAY_APP_CODE } from '../src/lib/todayPicks/view';
import { bannedHit, scriptOk, PUSH_LINE_MAX } from '../src/lib/push/aiLine';
import { forecastHitsInSentence } from '../src/lib/ai/trustLayer';
import { isEtf } from '../src/lib/seo/etfSet';
import type { Cand, DarkFacts, EarnFacts, GammaFacts, PickFacts, WhaleFacts, TodayPicksDoc, Loc } from '../src/lib/todayPicks/types';
import * as svc from '../src/services/todayPicksService';
import { LADDER_PURPOSES, TRACKED_PURPOSES } from '../src/lib/ai/llmLadder';
import { FUNNEL_SRCS, isFunnelSrc } from '../src/lib/app/funnelSchema';
import { PV_GROUPS } from '../src/lib/marketing/pageViewHuman';

const route = require('../src/app/api/today-picks/route');
const cron = require('../src/app/api/cron/today-picks/route');

let n = 0;
const tests: Array<[string, () => unknown]> = [];
const t = (name: string, fn: () => unknown) => tests.push([name, fn]);
const LOCS: Loc[] = ['ko', 'en', 'ja'];
const noEtf = (x: string) => isEtf(x);

// ═══ 운영 실측 모양의 고정 입력(2026-10-12 마감 저장본) ═══
const BUNDLE = (extra: Record<string, any> = {}): OptionsEodBundle => ({
  date: '2026-10-12', prevDate: '2026-10-09',
  tickers: {
    INTC: { callOI: 2e6, putOI: 1.5e6, top: [
      { k: 115, e: '2026-10-23', t: 'C', oi: 39675, d: 35418 },          // 9.3배 · 명목 $407M
      { k: 120, e: '2026-10-23', t: 'C', oi: 40000, d: 30000 },
      { k: 100, e: '2026-10-12', t: 'P', oi: 9000, d: 5000 },           // 이미 만기(10/12) — 뺀다
    ] },
    AMZN: { callOI: 3e6, putOI: 1.9e6, top: [{ k: 275, e: '2026-10-30', t: 'C', oi: 29957, d: 24817 }] },   // 5.8배
    AAPL: { callOI: 2.6e6, putOI: 2.3e6, top: [{ k: 230, e: '2026-10-16', t: 'P', oi: 23125, d: 18594 }] },
    GOOGL: { callOI: 1e6, putOI: 1e6, top: [{ k: 420, e: '2026-10-16', t: 'C', oi: 27405, d: 12020 }] },   // 1.78배 — 새 포지션이 아니다
    SPY: { callOI: 5e6, putOI: 5e6, top: [{ k: 785, e: '2026-10-16', t: 'C', oi: 73902, d: 29592 }] },     // ETF — 뺀다
    THIN: { callOI: 1e4, putOI: 1e4, top: [{ k: 10, e: '2026-10-30', t: 'C', oi: 3000, d: 2500 }] },        // 명목 $2.5M — 문턱 아래
    ...extra,
  },
});

// ━━━ 1. 고래 ━━━
t('고래: 신규 명목 합 큰 순 · ETF·만기 지난 계약·미결제약정 2배 미만·문턱 아래는 뺀다 · 날짜는 열린 세션(prevDate)', () => {
  const c = whaleCandidates(BUNDLE(), { lastClosed: '2026-10-12', isEtf: noEtf });
  assert.deepEqual(c.map((x) => x.ticker), ['INTC', 'AMZN', 'AAPL']);
  assert.ok(c.every((x) => x.asOf === '2026-10-09' && (x.facts as WhaleFacts).openedOn === '2026-10-09'));
  const f = c[0].facts as WhaleFacts;
  assert.equal(f.best.strike, 115); assert.equal(f.best.expiry, '2026-10-23'); assert.equal(f.best.type, 'call'); assert.equal(f.best.added, 35418);
  assert.equal(f.jump, 9.3);                                    // 39675 ÷ (39675−35418)
  assert.equal(Math.round(f.notional), 35418 * 100 * 115 + 30000 * 100 * 120);   // 만기 지난 풋은 합에도 안 든다
  assert.equal(f.callPct, 100);
  assert.ok(WHALE_MIN_NOTIONAL === 100e6);
});
t('고래: 처음 생긴 계약(늘어나기 전 0)은 jump=null 로 통과 · prevDate 없으면 후보 없음 · 묶음이 비면 후보 없음', () => {
  const c = whaleCandidates(BUNDLE({ NEW: { top: [{ k: 80, e: '2026-12-18', t: 'C', oi: 15000, d: 15000 }] } }), { lastClosed: '2026-10-12', isEtf: noEtf });
  const x = c.find((y) => y.ticker === 'NEW')!;
  assert.equal((x.facts as WhaleFacts).jump, null);
  assert.deepEqual(whaleCandidates({ ...BUNDLE(), prevDate: undefined }, { lastClosed: '2026-10-12', isEtf: noEtf }), []);
  assert.deepEqual(whaleCandidates(null, { lastClosed: '2026-10-12', isEtf: noEtf }), []);
});

// ━━━ 2. 다크풀 ━━━
const D = (over: Partial<DarkRowIn> = {}): DarkRowIn => ({ ticker: 'BMY', pct: 35.6, volume: 8_041_637, volRatio: 2.29, volP: 100, date: '2026-10-12', marketAvg: 51.1, oi: 777_429, ...over });
t('다크풀: 20일 평균 1.5배 이상 · 백분위 90↑ · 100만 주↑ · 옵션 미결제약정 40만↑ — 이월된 행(날짜 이름)·ETF 는 뺀다 · 큰 배수 순', () => {
  const rows = [D(), D({ ticker: 'CMG', volRatio: 1.88, oi: 881_071, volP: 92 }), D({ ticker: 'MMED', volRatio: 4.69, oi: 253_235 }), D({ ticker: 'OLD', date: '2026-10-09', volRatio: 9 }),
    D({ ticker: 'LOW', volRatio: 1.2 }), D({ ticker: 'THINV', volume: 500_000 }), D({ ticker: 'P50', volP: 50 }), D({ ticker: 'SPYM', volRatio: 2.87, oi: 5e6 }), D({ ticker: 'NOOI', oi: null })];
  const c = darkCandidates(rows, { isEtf: noEtf });
  assert.deepEqual(c.map((x) => x.ticker), ['BMY', 'CMG']);
  assert.equal((c[0].facts as DarkFacts).ratio, 2.3); assert.equal(c[0].asOf, '2026-10-12');
});

// ━━━ 3. 감마 플립·Max Pain ━━━
const L = (ticker: string, spot: number, gf: number | null, mp: number | null, over: Partial<LevelRowIn> = {}): LevelRowIn =>
  ({ ticker, spot, expiration: '2026-10-16', chainDate: '2026-10-12', gammaFlip: gf, maxPain: mp, oi: 2_000_000, ...over });
const manyOld = (k: number) => Array.from({ length: k }, (_, i) => L(`X${i}`, 100, null, null, { chainDate: '2026-10-12', oi: 1 }));
t('감마: 감마 플립 ±1.0% · Max Pain ±0.6% · 유동성 40만↑… 50만↑ · 이번 주 만기 · 거리·쪽을 함께 담는다 · 종목당 하나', () => {
  const rows = [L('AMZN', 259.7, 260, 250), L('AAPL', 340.7, 340, 325), L('MU', 980, 850, 980), L('FAR', 100, 120, 130), L('THIN', 100, 100, null, { oi: 100_000 }),
    L('EXPD', 100, 100, null, { expiration: '2026-10-09' }), L('LATE', 100, 100, null, { expiration: '2026-10-30' }), L('NOCH', 100, 100, null, { chainDate: null }), L('PYPL', 56, 56, 53), ...manyOld(20)];
  const c = gammaCandidates(rows, { todayEt: '2026-10-12', isEtf: noEtf });
  assert.deepEqual(c.map((x) => x.ticker).sort(), ['AAPL', 'AMZN', 'MU', 'PYPL']);
  const amzn = c.find((x) => x.ticker === 'AMZN')!.facts as GammaFacts;
  assert.equal(amzn.level, 'gammaFlip'); assert.equal(amzn.side, 'b'); assert.equal(amzn.distPct, 0.12); assert.equal(amzn.levelPrice, 260);
  assert.equal((c.find((x) => x.ticker === 'AAPL')!.facts as GammaFacts).side, 'a');
  assert.equal((c.find((x) => x.ticker === 'MU')!.facts as GammaFacts).level, 'maxPain');
  assert.equal((c.find((x) => x.ticker === 'PYPL')!.facts as GammaFacts).side, 'at');
});
t('감마: 체인 날짜가 섞이면 가장 늦은 날짜(20종목 이상 공유)만 쓴다 · 4일 넘게 낡은 판본이면 후보 없음', () => {
  const mixed = [L('AMZN', 259.7, 260, null), L('OLDC', 100, 100, null, { chainDate: '2026-10-09' }), ...manyOld(20)];
  assert.deepEqual(gammaCandidates(mixed, { todayEt: '2026-10-12', isEtf: noEtf }).map((x) => x.ticker), ['AMZN']);
  const stale = [L('AMZN', 259.7, 260, null, { chainDate: '2026-10-05' }), ...manyOld(20).map((r) => ({ ...r, chainDate: '2026-10-05' }))];
  assert.deepEqual(gammaCandidates(stale, { todayEt: '2026-10-12', isEtf: noEtf }), []);
});

// ━━━ 4. 실적 ━━━
const E = (ticker: string, date: string, pct: number | null, over: Partial<EarnRowIn> = {}): EarnRowIn =>
  ({ ticker, date, hour: 'bmo', impliedPct: pct, impliedExpiry: '2026-10-16', session: '2026-10-12', done: false, ...over });
t('실적: 앞으로 평일 3일 안 · 끝난 발표·예상 변동 없는 행은 뺀다 · 이른 날 먼저, 같은 날이면 큰 변동 순', () => {
  const dates = nextWeekdays('2026-10-13', 3);
  assert.deepEqual(dates, ['2026-10-13', '2026-10-14', '2026-10-15']);
  const c = earningsCandidates([E('WFC', '2026-10-13', 4.6), E('UNH', '2026-10-13', 6.7), E('ASML', '2026-10-14', 9.9), E('DONE', '2026-10-13', 8, { done: true }), E('NONE', '2026-10-13', null), E('LATE', '2026-10-20', 9)], { dates });
  assert.deepEqual(c.map((x) => x.ticker), ['UNH', 'WFC', 'ASML']);
  assert.equal((c[0].facts as EarnFacts).impliedPct, 6.7);
});
t('날짜 도우미: 주말 건너뛰기 · 달력 더하기', () => {
  assert.deepEqual(nextWeekdays('2026-10-16', 3), ['2026-10-16', '2026-10-19', '2026-10-20']);
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(daysUntil('2026-10-13', '2026-10-23'), 10);
});

// ━━━ 5. 조립 ━━━
const W = (tk: string, notional: number, asOf = '2026-10-09'): Cand<WhaleFacts> => ({ id: `whale:${tk}`, kind: 'whale', ticker: tk, asOf, score: notional, facts: { kind: 'whale', openedOn: asOf, notional, callPct: 100, best: { type: 'call', strike: 100, expiry: '2026-10-23', added: 5000, oi: 6000, notional: notional / 2 }, jump: 6 } });
const Dk = (tk: string, ratio: number): Cand<DarkFacts> => ({ id: `darkpool:${tk}`, kind: 'darkpool', ticker: tk, asOf: '2026-10-12', score: ratio, facts: { kind: 'darkpool', date: '2026-10-12', pct: 40, ratio, volume: 5e6, marketAvg: 51 } });
const G = (tk: string, score: number): Cand<GammaFacts> => ({ id: `gamma:${tk}`, kind: 'gamma', ticker: tk, asOf: '2026-10-12', score, facts: { kind: 'gamma', level: 'gammaFlip', chainDate: '2026-10-12', expiry: '2026-10-16', spot: 100, levelPrice: 100.5, distPct: 0.5, side: 'b' } });
const Ea = (tk: string, date: string, score: number): Cand<EarnFacts> => ({ id: `earnings:${tk}`, kind: 'earnings', ticker: tk, asOf: '2026-10-12', score, facts: { kind: 'earnings', date, hour: 'bmo', etTime: null, impliedPct: 5, impliedExpiry: '2026-10-16', session: '2026-10-12' } });
t('조립: 종류마다 하나 + 5번째는 적게 뽑힌 종류 중 우선순위(고래) · 같은 종목은 한 번만 · 발표 임박 실적이 맨 앞', () => {
  const r = assemble({ whale: [W('INTC', 1.37e9), W('AMZN', 1.35e9), W('AAPL', 1.1e9)], darkpool: [Dk('BMY', 2.3)], gamma: [G('AMZN', 6.5), G('AAPL', 6.4), G('PYPL', 6.2)], earnings: [Ea('UNH', '2026-10-13', 306)] }, { earlyEarnDates: ['2026-10-13', '2026-10-14'] });
  assert.deepEqual(r.map((x) => x.id), ['earnings:UNH', 'whale:INTC', 'whale:AMZN', 'darkpool:BMY', 'gamma:AAPL']);   // AMZN 을 고래가 가져가면 감마는 AAPL 로 바뀐다
  assert.equal(new Set(r.map((x) => x.ticker)).size, 5);
});
t('조립: 후보가 모자라면 억지로 채우지 않는다 · 한 종류만 있으면 그 종류 후보 중 1위의 절반 이상만', () => {
  const r = assemble({ whale: [W('A', 1000), W('B', 900), W('C', 400)], darkpool: [], gamma: [], earnings: [] });
  assert.deepEqual(r.map((x) => x.ticker), ['A', 'B']);                       // C 는 1위의 40% — 약해서 제외
  assert.deepEqual(assemble({ whale: [], darkpool: [], gamma: [], earnings: [] }), []);
});
t('조립: 직전 문서가 같은 (종류·종목·자료 날짜)를 보였으면 다음 후보로 — 대안이 없으면 그대로', () => {
  const inp = { whale: [W('INTC', 3e9), W('AMZN', 2.9e9)], darkpool: [Dk('BMY', 2.3)], gamma: [], earnings: [] };
  const prev = [{ kind: 'whale' as const, ticker: 'INTC', asOf: '2026-10-09' }];
  assert.deepEqual(assemble(inp, { prev }).map((x) => x.id), ['whale:AMZN', 'whale:INTC', 'darkpool:BMY']);   // 새 종목이 앞, 보였던 종목은 뒤(다른 후보가 없을 때만 다시)
  const only = { whale: [W('INTC', 3e9)], darkpool: [], gamma: [], earnings: [] };
  assert.deepEqual(assemble(only, { prev }).map((x) => x.id), ['whale:INTC']);
  // 자료 날짜가 바뀌었으면(새 묶음) 같은 종목이어도 그대로 1위
  assert.deepEqual(assemble({ ...inp, whale: [W('INTC', 3e9, '2026-10-12'), W('AMZN', 2.9e9, '2026-10-12')] }, { prev }).map((x) => x.id)[0], 'whale:INTC');
});

// ━━━ 6. 규칙 문장(3개 언어) ━━━
const INTC: WhaleFacts = { kind: 'whale', openedOn: '2026-10-09', notional: 1_372_663_000, callPct: 100, best: { type: 'call', strike: 115, expiry: '2026-10-23', added: 35418, oi: 39675, notional: 407e6 }, jump: 9.3 };
const BMY: DarkFacts = { kind: 'darkpool', date: '2026-10-12', pct: 35.6, ratio: 2.3, volume: 8_041_637, marketAvg: 51.1 };
const AMZNg: GammaFacts = { kind: 'gamma', level: 'gammaFlip', chainDate: '2026-10-12', expiry: '2026-10-16', spot: 259.7, levelPrice: 260, distPct: 0.12, side: 'b' };
const AAPLg: GammaFacts = { kind: 'gamma', level: 'gammaFlip', chainDate: '2026-10-12', expiry: '2026-10-16', spot: 340.7, levelPrice: 340, distPct: 0.21, side: 'a' };
const PYPLg: GammaFacts = { kind: 'gamma', level: 'gammaFlip', chainDate: '2026-10-12', expiry: '2026-10-16', spot: 56, levelPrice: 56, distPct: 0, side: 'at' };
const MUg: GammaFacts = { kind: 'gamma', level: 'maxPain', chainDate: '2026-10-12', expiry: '2026-10-16', spot: 980, levelPrice: 980, distPct: 0, side: 'at' };
const UNH: EarnFacts = { kind: 'earnings', date: '2026-10-13', hour: 'bmo', etTime: null, impliedPct: 6.7, impliedExpiry: '2026-10-16', session: '2026-10-12' };
const NFLX: EarnFacts = { kind: 'earnings', date: '2026-10-20', hour: 'amc', etTime: null, impliedPct: 8.3, impliedExpiry: '2026-10-23', session: '2026-10-12' };
const ALL_FACTS: Array<[string, PickFacts]> = [['INTC', INTC], ['BMY', BMY], ['AMZN', AMZNg], ['AAPL', AAPLg], ['PYPL', PYPLg], ['MU', MUg], ['UNH', UNH], ['NFLX', NFLX]];

t('“무엇이” 문장: 운영 실측 INTC·BMY·AMZN·UNH — 한·일·영 고정 문자열(금융 공통어·금액은 영어 약어)', () => {
  assert.equal(whatText(INTC, 'ko'), '10/23 만기 $115 콜 +35,418계약 · 명목 $1.37B');
  assert.equal(whatText(INTC, 'ja'), '10/23満期 $115 コール +35,418枚 · 名目 $1.37B');
  assert.equal(whatText(INTC, 'en'), '10/23 $115 call +35,418 contracts · $1.37B notional');
  assert.equal(whatText(BMY, 'ko'), '다크풀 비중 35.6% · 거래량 20일 평균의 2.3배');
  assert.equal(whatText(BMY, 'ja'), 'ダークプール比率 35.6% · 出来高は20日平均の2.3倍');
  assert.equal(whatText(BMY, 'en'), 'Dark pool share 35.6% · volume 2.3× its 20-day avg');
  assert.equal(whatText(AMZNg, 'ko'), 'Gamma Flip $260 아래 0.12% · 10/16 만기');
  assert.equal(whatText(AAPLg, 'ja'), 'Gamma Flip $340の0.21%上 · 10/16満期');
  assert.equal(whatText(AMZNg, 'en'), '0.12% below Gamma Flip $260 · 10/16 expiry');
  assert.equal(whatText(PYPLg, 'ko'), '가격이 Gamma Flip $56 위치 · 10/16 만기');
  assert.equal(whatText(MUg, 'en'), 'Price at Max Pain $980 · 10/16 expiry');
  assert.equal(whatText(UNH, 'ko'), '10/13 장 시작 전 실적 · 옵션 예상 변동 ±6.7%');
  assert.equal(whatText(UNH, 'ja'), '10/13 寄り付き前 決算 · 想定変動幅 ±6.7%');
  assert.equal(whatText(NFLX, 'en'), 'Reports 10/20 after the close · implied move ±8.3%');
});
t('금액 약어: B/M/K — 억·億 환산이 없다', () => {
  assert.equal(usd(1_372_663_000), '$1.37B'); assert.equal(usd(407e6), '$407M'); assert.equal(usd(53.5e6), '$53.5M'); assert.equal(usd(8_700), '$9K'); assert.equal(usd(2e9), '$2B');
  for (const [tk, f] of ALL_FACTS) for (const l of LOCS) assert.doesNotMatch(whatText(f, l), /[억億万兆조]/, `${tk} ${l}`);
});
t('라벨·기준 날짜: 종류별 3개 언어 · 다크풀은 출처 FINRA 를 날짜 칸에 단다', () => {
  assert.equal(kindLabel(INTC, 'ko'), '고래 신규 포지션'); assert.equal(kindLabel(INTC, 'en'), 'WHALE NEW POSITION'); assert.equal(kindLabel(INTC, 'ja'), 'ホエール新規ポジション');
  assert.equal(kindLabel(AMZNg, 'ko'), 'Gamma Flip 근접'); assert.equal(kindLabel(MUg, 'ja'), 'Max Pain 接近'); assert.equal(kindLabel(UNH, 'en'), 'EARNINGS SOON');
  assert.equal(asOfText(INTC, '2026-10-09', 'ko'), '10/9 세션'); assert.equal(asOfText(BMY, '2026-10-12', 'en'), 'FINRA 10/12'); assert.equal(asOfText(AMZNg, '2026-10-12', 'ja'), '10/12基準');
});
t('규칙 문장 전수: 금지어·예측어·언어 체계 — 모든 종류 × 3개 언어 (what · fallback why · push)', () => {
  for (const [tk, f] of ALL_FACTS) {
    const r = ruleTexts(tk, f);
    for (const l of LOCS) {
      for (const [name, txt] of [['what', r.what[l]], ['why', r.fallback[l]], ['push', r.push[l]]] as const) {
        assert.equal(bannedHit(txt), null, `${tk} ${l} ${name}: ${bannedHit(txt)}`);
        assert.equal(forecastHitsInSentence(txt.replace(/^✦[^·]*·\s*/, ''), l).length, 0, `${tk} ${l} ${name} 예측어`);
        assert.ok(scriptOk(txt, l), `${tk} ${l} ${name} 문자 체계`);
        assert.doesNotMatch(txt, /P\/C|풋콜|put\/call/i, '정의 결정 대기 중인 P/C 는 쓰지 않는다');
      }
      assert.deepEqual(checkPushLine(r.push[l], l, PUSH_LINE_MAX[l]), [], `${tk} ${l} push 줄: ${r.push[l]}`);
      assert.ok(r.push[l].startsWith(PUSH_PREFIX[l]));
    }
  }
});
t('푸시 한 줄: INTC — ko 90자·en 110자 상한 안(기존 푸시 규칙)', () => {
  assert.equal(pushLine('INTC', INTC, 'ko'), '✦ 오늘 볼 것 · INTC 10/23 $115 콜 +35,418계약 (10/9 세션)');
  assert.equal(pushLine('INTC', INTC, 'ja'), '✦ 今日の注目 · INTC 10/23 $115 コール +35,418枚（10/9セッション）');
  assert.equal(pushLine('INTC', INTC, 'en'), '✦ Worth watching · INTC 10/23 $115 call +35,418 contracts (10/9 session)');
  assert.equal(pushBody('UNH', UNH, 'ko'), 'UNH 10/13 장 전 실적, 옵션 예상 변동 ±6.7%');
  assert.deepEqual(checkPushLine('x'.repeat(111), 'en', 110).includes('too-long'), true);
  assert.ok(checkPushLine('✦ 오늘 볼 것 · 이 종목을 매수하세요', 'ko', 90).some((r) => r.startsWith('banned')));
});

// ━━━ 7. AI 출구 가드 ━━━
const J = (ko: string, en: string, ja: string) => JSON.stringify({ ko, en, ja });
const TODAY = '2026-10-13';
const ck = (raw: string, tk: string, f: PickFacts) => checkPickWhy(raw, tk, f, 2026, TODAY);
t('가드 통과: 운영 실제 Haiku 5.5 출력(10/13 시험) — 고래·다크풀·감마(위/아래)·Max Pain·실적', () => {
  assert.ok(ck(J('한 행사가의 미결제약정이 하루 만에 크게 늘어 새 포지션이 열렸습니다', "One strike's open interest jumped in a single session, so new positions were opened", 'ある行使価格の建玉が一日で大きく増え、新規ポジションが開かれました'), 'INTC', INTC).ok);
  assert.ok(ck(J('한 행사가의 미결제약정이 하루 만에 열 배 가까이 늘어 새 포지션이 열렸습니다', "One strike's open interest jumped nearly tenfold in a session, so new positions were opened", 'ある行使価格の建玉が一日でほぼ十倍に増え、新規ポジションが開かれました'), 'INTC', INTC).ok);   // 9.3배 ≈ 열 배
  assert.ok(ck(J('장외 거래량이 최근 20일 평균의 2.3배로 늘어 거래소 밖 체결이 크게 늘었습니다', 'Off-exchange volume ran at 2.3 times its 20-day average, a sharp rise outside the exchanges', '場外の出来高が直近20日平均の2.3倍に膨らみ、取引所外の約定が大きく増えました'), 'BMY', BMY).ok);
  assert.ok(ck(J('Gamma Flip 바로 위라 딜러 헤지가 움직임을 줄이는 쪽입니다', 'Just above Gamma Flip, where dealer hedging tends to dampen moves', 'Gamma Flipのすぐ上で、ディーラーのヘッジが値動きを抑える側です'), 'AAPL', AAPLg).ok);
  assert.ok(ck(J('Gamma Flip 아래라 딜러 헤지가 움직임을 키우는 쪽입니다', 'Below Gamma Flip, where dealer hedging tends to amplify moves', 'Gamma Flipの下で、ディーラーのヘッジが値動きを増幅する側です'), 'AMZN', AMZNg).ok);
  assert.ok(ck(J('만기가 가까워 가격이 Max Pain 근처에 붙어 있는 경향이 보입니다', 'With expiry close, price sits near Max Pain, a tendency rather than a promise', '満期が近く、価格はMax Painの近くに張り付く傾向が見られます'), 'MU', MUg).ok);
  assert.ok(ck(J('발표를 낀 만기의 옵션이 이만큼의 움직임을 가격에 반영하고 있습니다', 'Options for the expiry containing the report price in a move of this size', '決算を含む満期のオプションが、この大きさの値動きを織り込んでいます'), 'UNH', UNH).ok);
});
t('가드: 사실에 없는 숫자(작은 정수 포함)·가격($)·날짜는 거절 — 세는 말 «1つ·1日» 은 허용', () => {
  const base = ['한 행사가의 미결제약정이 크게 늘었습니다', 'One strike open interest jumped', 'ある行使価格の建玉が大きく増えました'] as const;
  assert.equal(ck(J('미결제약정이 7배로 늘어 새 포지션이 열렸습니다', base[1], base[2]), 'INTC', INTC).ok, false);
  assert.ok(ck(J('미결제약정이 7배로 늘어 새 포지션이 열렸습니다', base[1], base[2]), 'INTC', INTC).reasons.some((r) => r.startsWith('ko:number:7')));
  assert.ok(ck(J(base[0], 'The $120 call open interest jumped', base[2]), 'INTC', INTC).reasons.some((r) => r.startsWith('en:price:$120')));
  assert.ok(ck(J(base[0], 'Open interest jumped by 12/31 expiry', base[2]), 'INTC', INTC).reasons.some((r) => r.startsWith('en:number')));
  assert.ok(ck(J(base[0], base[1], '1つの行使価格の建玉が1日で大きく増え、新規ポジションが開かれました'), 'INTC', INTC).ok, '개수 표현 1つ·1日');
  assert.ok(ck(J(base[0], base[1], '建玉が3つの満期で大きく増え、新規ポジションが開かれました'), 'INTC', INTC).reasons.some((r) => r.startsWith('ja:number:3')), '1 이외 숫자는 대조');
});
t('가드: 배수를 말로 써도 사실의 배수(±20%)와 맞아야 한다 — 두 배·五倍·tenfold·twice', () => {
  assert.deepEqual(multiplierWords('하루 만에 열 배 가까이, 두 배를 넘어', 'ko'), [10, 2]);
  assert.deepEqual(multiplierWords('一日でほぼ十倍、二倍を超え', 'ja'), [10, 2]);
  assert.deepEqual(multiplierWords('nearly tenfold, twice its norm, doubled, three times', 'en'), [10, 2, 2, 3]);
  const bad = ck(J('한 행사가의 미결제약정이 하루 만에 두 배로 늘어 새 포지션이 열렸습니다', "One strike's open interest jumped in a session, so new positions were opened", 'ある行使価格の建玉が一日で大きく増え、新規ポジションが開かれました'), 'INTC', INTC);
  assert.ok(bad.reasons.some((r) => r.startsWith('ko:multiple:2')));
  // 사실에 배수가 없는 종류(감마·실적)는 말로도 배수를 쓰지 못한다
  assert.ok(ck(J('발표를 낀 만기의 옵션이 두 배 큰 움직임을 반영하고 있습니다', 'Options for the expiry containing the report price in a move of this size', '決算を含む満期のオプションが、この大きさの値動きを織り込んでいます'), 'UNH', UNH).reasons.some((r) => r.startsWith('ko:multiple')));
});
t('가드: 감마 — 가격이 레벨의 반대쪽이라고 쓰거나 반대 기전을 쓰면 거절 · 같은 가격이면 위/아래 표현 금지', () => {
  // AMZN 은 Gamma Flip «아래» — 위라고 쓰면 거절, 줄인다(= 양의 감마 기전)고 써도 거절
  const up = ck(J('Gamma Flip 바로 위라 딜러 헤지가 움직임을 키우는 쪽입니다', 'Below Gamma Flip, where dealer hedging tends to amplify moves', 'Gamma Flipの下で、ディーラーのヘッジが値動きを増幅する側です'), 'AMZN', AMZNg);
  assert.ok(up.reasons.some((r) => r.startsWith('ko:dir:a')));
  const mech = ck(J('Gamma Flip 아래라 딜러 헤지가 움직임을 줄이는 쪽입니다', 'Below Gamma Flip, where dealer hedging tends to amplify moves', 'Gamma Flipの下で、ディーラーのヘッジが値動きを増幅する側です'), 'AMZN', AMZNg);
  assert.ok(mech.reasons.some((r) => r.startsWith('ko:mechanism:dampen')));
  assert.ok(ck(J('Gamma Flip 아래라 딜러 헤지가 움직임을 키우는 쪽입니다', 'Above Gamma Flip, where dealer hedging tends to dampen moves', 'Gamma Flipの下で、ディーラーのヘッジが値動きを増幅する側です'), 'AMZN', AMZNg).reasons.some((r) => r.startsWith('en:dir:a')));
  // 같은 가격(PYPL) — «바로 위»·«すぐ上»·«just above» 는 거절(10/13 시험에서 모델이 실제로 썼다)
  const at = ck(J('가격이 Gamma Flip 바로 위에 있어 딜러 헤지 성격이 바뀌는 분기점입니다', 'Price sits right at Gamma Flip, the point where dealer hedging flips regime', '価格はGamma Flipのちょうど上にあり、ディーラーのヘッジが切り替わる分岐点です'), 'PYPL', PYPLg);
  assert.ok(at.reasons.some((r) => r.startsWith('ko:dir')) && at.reasons.some((r) => r.startsWith('ja:dir')) && !at.reasons.some((r) => r.startsWith('en:dir')));
  assert.ok(ck(J('Gamma Flip에 딱 붙어 있어 딜러 헤지 성격이 바뀌는 분기점입니다', 'Price sits right at Gamma Flip, the point where dealer hedging flips regime', '価格はGamma Flipと同じ水準にあり、ディーラーのヘッジが切り替わる分岐点です'), 'PYPL', PYPLg).ok);
  // Max Pain 항목에 헤지 기전을 쓰면 거절
  assert.ok(ck(J('Max Pain 근처라 딜러 헤지가 움직임을 줄입니다', 'Near Max Pain where hedging dampens moves', 'Max Painの近くでヘッジが値動きを抑えます'), 'MU', MUg).reasons.some((r) => r.includes('mechanism:maxpain')));
  assert.equal(levelDirection('Gamma Flip 바로 위라 딜러 헤지가', 'ko'), 'a'); assert.equal(levelDirection('Gamma Flipの下で', 'ja'), 'b'); assert.equal(levelDirection('가격 위치가 중요합니다 Gamma Flip', 'ko'), null);
});
t('가드: 권유·예측·의도 추정·거절문·연도·말줄임·언어 혼입·길이 — 한 언어라도 걸리면 세 언어 모두 버린다', () => {
  const ok = [J('한 행사가의 미결제약정이 하루 만에 크게 늘어 새 포지션이 열렸습니다', "One strike's open interest jumped in a session, so new positions were opened", 'ある行使価格の建玉が一日で大きく増え、新規ポジションが開かれました')][0];
  assert.ok(ck(ok, 'INTC', INTC).ok);
  const bad = (ko: string, en: string, ja: string, needle: string, tk = 'INTC', f: PickFacts = INTC) => {
    const r = ck(J(ko, en, ja), tk, f);
    assert.equal(r.ok, false, needle); assert.ok(r.reasons.some((x) => x.includes(needle)), `${needle}: ${r.reasons.join('|')}`); assert.equal(r.text, undefined);
  };
  const KO = '한 행사가의 미결제약정이 크게 늘었습니다', EN = 'One strike open interest jumped', JA = 'ある行使価格の建玉が大きく増えました';
  bad('이 종목은 매수해 볼 만합니다', EN, JA, 'banned');
  bad(KO, 'You should buy this one', JA, 'forbidden');
  bad(KO, EN, '買いのチャンスです', 'forbidden');
  bad('큰손이 상승에 베팅한 것으로 보입니다', EN, JA, 'intent');
  bad(KO, 'Big players are accumulating shares', JA, 'intent');
  bad('앞으로 오를 가능성이 있습니다', EN, JA, 'forbidden');
  bad('이 흐름은 계속될 것입니다', EN, JA, 'forecast');
  bad('발표가 장 시작 전이라 옵션이 반영한 움직임이 개장 직후 나올 수 있습니다', EN, JA, 'hedge');
  bad(KO, 'The priced-in move could hit at the opening bell', JA, 'hedge');
  bad(KO, EN, '決算直後に値動きが出る可能性があります', 'hedge');
  bad('죄송합니다 답변할 수 없습니다', EN, JA, 'refusal');
  bad(KO, 'As an AI I cannot do this', JA, 'refusal');
  bad('2025년에도 비슷한 일이 있었습니다', EN, JA, 'year');
  bad('미결제약정이 크게 늘었습니다…', EN, JA, 'ellipsis');
  bad(KO, 'Open interest {MP} jumped', JA, 'ellipsis-or-brace');
  bad('미결제약정이 13.7억 달러 규모로 늘었습니다', EN, JA, 'unit-amount');
  bad(KO, '한 행사가의 미결제약정', JA, 'script');
  bad(KO, EN, 'ある行使価格の建玉が大きく増えました。한국어', 'script');
  bad('한 행사가의 미결제약정이 하루 만에 크게 늘어 새 포지션이 열렸고 그 규모는 평소의 몇 배에 이르는 이례적인 수준입니다', EN, JA, 'too-long');
  bad('', EN, JA, 'empty');
  assert.deepEqual(ck('not json', 'INTC', INTC).reasons, ['json']);
  assert.ok(ck('```json\n' + ok + '\n```', 'INTC', INTC).ok, '코드 펜스는 걷는다');
  assert.ok(TP_WHY_MAX.ko >= 50 && TP_WHY_MAX.en >= 96);
});
t('가드: 음차 지표 이름은 되돌린다(감마 플립 → Gamma Flip) — 금융 공통어는 번역하지 않는다', () => {
  const r = ck(J('감마 플립 바로 위라 딜러 헤지가 움직임을 줄이는 쪽입니다', 'Just above Gamma Flip, where dealer hedging tends to dampen moves', 'ガンマフリップのすぐ上で、ディーラーのヘッジが値動きを抑える側です'), 'AAPL', AAPLg);
  assert.ok(r.ok, r.reasons.join('|'));
  assert.match(r.text!.ko, /Gamma Flip/); assert.match(r.text!.ja, /Gamma Flip/);
});
t('프롬프트: 사실 글 — 숫자는 규칙이 만든 값만 · 며칠 남았는지·각도 포함 · 시스템 지시문의 금지선', () => {
  const p = buildPickUserPrompt('INTC', INTC, TODAY);
  assert.match(p, /FACTS — INTC/); assert.match(p, /10\/23 \$115 call, open interest \+35,418 contracts \(from 4,257 to 39,675, 9\.3x\)/);
  assert.match(p, /That expiry is 10 days away \(as of 10\/13\)/); assert.match(p, /ANGLE: Lead with how many times/); assert.match(p, /\$1\.37B, 100% calls/);
  assert.match(angleHint(AMZNg, TODAY), /just below|amplify/i); assert.match(angleHint(PYPLg, TODAY), /RIGHT AT/);
  assert.equal(factsForAi('INTC', INTC, TODAY).includes('P/C'), false);
  for (const w of ['buy', 'sell', 'recommend', 'forecast', 'predict', 'Never use the words', 'JSON', 'Gamma Flip']) assert.ok(TP_SYSTEM.includes(w), w);
  assert.ok(TP_SYSTEM.includes('Korean ≤ 38 characters'));
});

// ━━━ 8. 서비스: 읽기·선별·생성·저장 ━━━
const NOW_PM = Date.UTC(2026, 9, 12, 21, 55);   // 10/12 17:55 ET (EDT)
const NOW_AM = Date.UTC(2026, 9, 13, 12, 5);    // 10/13 08:05 ET
const realFetch = globalThis.fetch;
function stubWorld() {
  store.clear(); ttls.clear(); writes.length = 0; script.length = 0; aiCalls = 0; prompts.length = 0; sawFresh = true;
  (globalThis as any).fetch = async (url: string) => {
    const key = decodeURIComponent(String(url).split('key=')[1] || '');
    const fill = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`F${i}`, { callOI: 1000, putOI: 1000, top: [{ k: 10, e: '2026-10-30', t: 'C', oi: 500, d: 100 }] }]));   // 시장 전체를 말할 만한 표본(50종목↑)
    const val = key === 'intrinio:options:eod' ? BUNDLE({ ...fill, BMY: { callOI: 500_000, putOI: 277_429, top: [] } }) : null;
    return { ok: true, json: async () => ({ result: val == null ? null : JSON.stringify(val) }) } as any;
  };
  darkRows = { BMY: { ticker: 'BMY', pct: 35.6, volume: 8_041_637, volRatio: 2.29, volP: 100, date: '2026-10-12', marketAvg: 51.1 } };
  impliedRows = [{ ticker: 'UNH', impliedMovePct: 6.7, expiry: '2026-10-16', session: '2026-10-12' }, { ticker: 'GS', impliedMovePct: 4.2, expiry: '2026-10-16', session: '2026-10-12' }, { ticker: 'ASML', impliedMovePct: 5.6, expiry: '2026-10-16', session: '2026-10-12' }];
  // 구조 조각 + 레벨 판본(AMZN: 감마 플립 $260 아래 0.12%)
  const parts = Array.from({ length: 8 }, () => ({ rows: [] as any[], ts: NOW_PM }));
  parts[0].rows.push({ t: 'AMZN', px: 259.7, mp: 250, fl: 260, cw: 300, pf: 250 });
  for (let i = 0; i < 8; i++) store.set(`structure:part:v2:${i}`, parts[i]);
  const stored = { timestamp: NOW_PM, data: { ticker: 'AMZN', levelsProducer: 'structureService', expiration: '2026-10-16', chainDate: '2026-10-12', underlyingPrice: 259.7, maxPain: 250, gammaFlipLevel: 260, gammaFlipType: 'zero', levels: { callWall: 300, putFloor: 250 }, options_status: 'OK', structure: {} } };
  store.set('structure:v2:AMZN', stored);
}
const GOOD = (kind: 'whale' | 'dark' | 'gamma' | 'earn') => ({
  whale: J('한 행사가의 미결제약정이 하루 만에 크게 늘어 새 포지션이 열렸습니다', "One strike's open interest jumped in a session, so new positions were opened", 'ある行使価格の建玉が一日で大きく増え、新規ポジションが開かれました'),
  dark: J('장외 거래량이 평소 수준을 크게 웃돌아 거래소 밖 체결이 많았습니다', 'Off-exchange volume ran far above its usual level', '場外の出来高が平常を大きく上回り、取引所外の約定が多くなりました'),
  gamma: J('Gamma Flip 아래라 딜러 헤지가 움직임을 키우는 쪽입니다', 'Below Gamma Flip, where dealer hedging tends to amplify moves', 'Gamma Flipの下で、ディーラーのヘッジが値動きを増幅する側です'),
  earn: J('발표를 낀 만기의 옵션이 이만큼의 움직임을 가격에 반영하고 있습니다', 'Options for the expiry containing the report price in a move of this size', '決算を含む満期のオプションが、この大きさの値動きを織り込んでいます'),
}[kind]);

t('서비스(마감 뒤 슬롯): 읽기 전용 재료로 선별 → 항목마다 AI 한 번 → 저장(latest + 슬롯 키 · TTL 6일 · 공급사 호출 0 · 크레딧 전용 등급)', async () => {
  stubWorld();
  // 순서: 실적(내일 UNH) → 고래 INTC → 고래 AAPL(AMZN 은 감마가 쓰는 종목이고 감마엔 대안이 없다) → 다크풀 BMY → 감마 AMZN
  script.push({ text: GOOD('earn') }, { text: GOOD('whale') }, { text: GOOD('whale') }, { text: GOOD('dark') }, { text: GOOD('gamma') });
  const r = await svc.runPicks({ now: NOW_PM });
  assert.equal(r.status, 'generated'); assert.equal(r.slot, 'pm'); assert.equal(r.etDate, '2026-10-12');
  assert.deepEqual(r.counts, { whale: 3, darkpool: 1, gamma: 1, earnings: 3 } as any);
  assert.equal(r.items!.length, 5);
  assert.equal(aiCalls, 5); assert.ok(sawFresh, 'withFreshTier 안에서만 부른다(AWS 로 넘기지 않는다)');
  const doc = store.get(svc.TP_KEYS.latest) as TodayPicksDoc;
  assert.ok(doc && doc.v === 1 && doc.items.length === 5 && doc.slot === 'pm');
  assert.equal(ttls.get(svc.TP_KEYS.latest), svc.TP_DOC_TTL_SEC); assert.ok(store.has(svc.TP_KEYS.slot('2026-10-12', 'pm')));
  assert.deepEqual(doc.stamp, { opt: '2026-10-12', opened: '2026-10-09', finra: '2026-10-12', chain: '2026-10-12', earn: '2026-10-12' });
  assert.ok(doc.items.every((p) => p.whyAi && p.why.ko && p.why.en && p.why.ja && p.what.ko && p.push.en.startsWith('✦')));
  assert.equal(doc.items[0].kind, 'earnings');               // 오늘이 10/12(마감 뒤) → 앞으로 3평일: 10/12(발표 없음)·13·14 → 가장 이른 날 UNH
  assert.equal(doc.gen.ok, 5); assert.equal(doc.gen.fallback, 0);
  assert.equal(doc.items.map((p) => p.ticker).filter((x, i, a) => a.indexOf(x) === i).length, 5, '종목 중복 없음');
  // 쓴 키는 전부 todaypicks:* / 하루 호출 계수 / 잠금 — Upstash 로 가는 이름(복제 접두사)이 아니다
  for (const k of writes) assert.ok(/^(todaypicks:|perf:lock:todaypicks)/.test(k), k);
  assert.equal(store.has('perf:lock:todaypicks'), false, '잠금은 끝나면 푼다');
  assert.equal(store.get(svc.TP_KEYS.day('2026-10-12')), 5);
  assert.ok(prompts.every((p) => /^FACTS — [A-Z]+/.test(p)));
});
t('서비스: AI 가드 실패·크레딧 건너뜀·오류·하루 상한 → 그 항목만 규칙 해설(whyAi=false) — 카드는 비지 않는다', async () => {
  stubWorld();
  const BAD = J('이 종목은 매수해 볼 만합니다', 'Buy this', '買いです');
  script.push({ text: GOOD('earn') }, { text: BAD }, { throwSkip: true }, { throwErr: true }, { text: GOOD('gamma') });
  const r = await svc.runPicks({ now: NOW_PM });
  assert.equal(r.status, 'generated');
  const doc = store.get(svc.TP_KEYS.latest) as TodayPicksDoc;
  assert.equal(doc.items.length, 5);
  assert.deepEqual(doc.items.map((p) => p.whyAi), [true, false, false, false, true]);
  for (const p of doc.items.filter((x) => !x.whyAi)) assert.equal(p.why.ko, ruleTexts(p.ticker, p.facts).fallback.ko);
  assert.equal(doc.gen.ok, 2); assert.equal(doc.gen.fallback, 3); assert.ok((doc.gen.reasons || []).length === 3);
  // 하루 상한
  stubWorld(); store.set(svc.TP_KEYS.day('2026-10-12'), 60);
  const capped = await svc.runPicks({ now: NOW_PM });
  assert.equal(aiCalls, 0); assert.ok((store.get(svc.TP_KEYS.latest) as TodayPicksDoc).items.every((p) => !p.whyAi), '상한이면 AI 호출 없이 규칙 해설로 저장');
  assert.equal(capped.status, 'generated');
});
t('서비스: 같은 날 같은 자료면 다시 만들지 않는다(AI 호출 0) · force 면 만든다 · 날짜가 바뀌면 만든다', async () => {
  stubWorld();
  script.push(...Array.from({ length: 5 }, () => ({ text: GOOD('whale') })));
  assert.equal((await svc.runPicks({ now: NOW_PM })).status, 'generated');
  const before = aiCalls;
  const again = await svc.runPicks({ now: NOW_PM + 70 * 60_000 });
  assert.equal(again.status, 'fresh'); assert.equal(aiCalls, before);
  script.push(...Array.from({ length: 5 }, () => ({ text: GOOD('whale') })));
  assert.equal((await svc.runPicks({ now: NOW_PM + 70 * 60_000, force: true })).status, 'generated');
  const sameDay = (store.get(svc.TP_KEYS.latest) as TodayPicksDoc).items.map((p) => p.id);
  assert.equal(sameDay.length, 5);
  script.push(...Array.from({ length: 5 }, () => ({ text: GOOD('whale') })));
  assert.deepEqual((await svc.runPicks({ now: NOW_PM + 70 * 60_000, force: true }), (store.get(svc.TP_KEYS.latest) as TodayPicksDoc).items.map((p) => p.id)), sameDay, '같은 날 다시 만들어도 순위가 흔들리지 않는다(돌려 쓰기는 다른 날짜의 직전 문서만)');
  script.push(...Array.from({ length: 5 }, () => ({ text: GOOD('whale') })));
  const next = await svc.runPicks({ now: NOW_AM });
  assert.equal(next.status, 'generated'); assert.equal(next.slot, 'am'); assert.equal(next.etDate, '2026-10-13');
});
t('서비스: dry=1 은 저장·AI 호출·잠금 없이 고른 결과와 규칙 문장 문서만', async () => {
  stubWorld();
  const r = await svc.runPicks({ now: NOW_PM, dry: true });
  assert.equal(r.status, 'dry'); assert.equal(aiCalls, 0); assert.equal(writes.length, 0);
  assert.equal(r.doc!.items.length, 5); assert.ok(r.doc!.items.every((p) => !p.whyAi));
});
t('서비스: 재료를 못 읽으면 그 종류만 빠진다 — 묶음 없음 → 실적만 · 아무것도 없으면 empty(저장 안 함)', async () => {
  stubWorld();
  (globalThis as any).fetch = async () => ({ ok: false, json: async () => ({}) });
  script.push({ text: GOOD('earn') }, { text: GOOD('earn') }, { text: GOOD('earn') });
  const r = await svc.runPicks({ now: NOW_PM });
  assert.equal(r.status, 'generated'); assert.deepEqual(r.items!.map((x) => x.kind), ['earnings', 'earnings', 'earnings']); assert.ok(r.notes!.includes('bundle:none'));
  stubWorld(); (globalThis as any).fetch = async () => ({ ok: false, json: async () => ({}) }); impliedRows = [];
  const e = await svc.runPicks({ now: NOW_PM });
  assert.equal(e.status, 'empty'); assert.equal(store.has(svc.TP_KEYS.latest), false);
});
t('끄기 스위치: 레디스 todaypicks:off 또는 환경변수 → 생성 0 · 읽기는 빈 응답 · off=0 으로 켠다 · 크론 ?off=1', async () => {
  stubWorld();
  assert.equal(await svc.setOff(true), true);
  assert.equal((await svc.runPicks({ now: NOW_PM })).status, 'off'); assert.equal(aiCalls, 0);
  assert.deepEqual(await svc.readPicks(), { doc: null, off: true, ageMs: null });
  assert.equal(ttls.get(svc.TP_KEYS.off), svc.TP_OFF_TTL_SEC);
  await svc.setOff(false);
  assert.equal(store.has(svc.TP_KEYS.off), false);
  process.env.TODAY_PICKS_OFF = '1';
  assert.equal((await svc.runPicks({ now: NOW_PM })).status, 'off'); assert.equal((await svc.readPicks()).off, true);
  delete process.env.TODAY_PICKS_OFF;
  const j = await (await cron.GET(new Request('http://x/api/cron/today-picks?off=1'))).json();
  assert.equal(j.action, 'off'); assert.equal(store.has(svc.TP_KEYS.off), true);
  const j2 = await (await cron.GET(new Request('http://x/api/cron/today-picks?off=0'))).json();
  assert.equal(j2.action, 'on'); assert.equal(store.has(svc.TP_KEYS.off), false);
});
t('읽기: 문서가 5일보다 오래되면 없음 · 항목이 없으면 없음 · 크론 시간 창(ET 07:30~10:30 · 16:30~21:00)', async () => {
  stubWorld();
  const doc: TodayPicksDoc = { v: 1, slot: 'pm', etDate: '2026-10-09', at: Date.UTC(2026, 9, 9, 22, 0), stamp: { opt: null, opened: null, finra: null, chain: null, earn: null }, items: [{ id: 'whale:INTC', kind: 'whale', ticker: 'INTC', asOf: '2026-10-09', facts: INTC, ...(() => { const r = ruleTexts('INTC', INTC); return { what: r.what, why: r.fallback, push: r.push, whyAi: false }; })() }], gen: { calls: 0, ok: 0, fallback: 1, ms: 1 } };
  store.set(svc.TP_KEYS.latest, doc);
  assert.ok((await svc.readPicks(Date.UTC(2026, 9, 12, 12, 0))).doc, '금요일 마감 문서를 월요일 아침에도 읽는다');
  assert.equal((await svc.readPicks(Date.UTC(2026, 9, 20, 12, 0))).doc, null);
  store.set(svc.TP_KEYS.latest, { ...doc, items: [] });
  assert.equal((await svc.readPicks(Date.UTC(2026, 9, 12, 12, 0))).doc, null);
  assert.equal(svc.inWindow(Date.UTC(2026, 9, 13, 12, 0)), true);   // 08:00 EDT
  assert.equal(svc.inWindow(Date.UTC(2026, 9, 13, 11, 0)), false);  // 07:00 EDT — 아직
  assert.equal(svc.inWindow(Date.UTC(2026, 9, 12, 21, 55)), true);  // 17:55 EDT
  assert.equal(svc.inWindow(Date.UTC(2026, 9, 12, 20, 0)), false);  // 16:00 EDT — 마감 직후엔 자료 없음
  assert.equal(svc.inWindow(Date.UTC(2026, 10, 3, 13, 0)), true);   // 11/3 08:00 EST — 표준시에도 같은 크론이 맞는 시각에 돈다
  assert.equal(svc.inWindow(Date.UTC(2026, 10, 3, 12, 0)), false);  // 11/3 07:00 EST
  assert.equal(svc.slotOf(NOW_AM), 'am'); assert.equal(svc.slotOf(NOW_PM), 'pm');
});

// ━━━ 9. 읽기 API · 푸시 한 줄 ━━━
t('읽기 API: 그 언어 한 벌만(facts 없음) · 끄면 빈 응답 · no-store · 문서 없으면 빈 목록', async () => {
  stubWorld();
  script.push(...Array.from({ length: 5 }, () => ({ text: GOOD('whale') })));
  await svc.runPicks({ now: NOW_PM });
  const res = await route.GET(new Request('http://x/api/today-picks?loc=ja'));
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const j = await res.json();
  assert.equal(j.items.length, 5); assert.equal(j.off, false); assert.equal(j.pickedAt, pickedAtLabel((store.get(svc.TP_KEYS.latest) as TodayPicksDoc).at));
  assert.match(j.items[0].label, /決算間近|ホエール|ダークプール|Gamma Flip/);
  for (const it of j.items) { assert.deepEqual(Object.keys(it).sort(), ['ai', 'asOf', 'id', 'kind', 'label', 'ticker', 'what', 'why']); }
  assert.ok(j.hasFinra === true);                            // 다크풀 항목이 있다 → 출처 FINRA 필요
  assert.equal(JSON.stringify(j).includes('facts'), false);
  const ko = await (await route.GET(new Request('http://x/api/today-picks?loc=ko'))).json();
  assert.ok(scriptOk(ko.items[1].why, 'ko')); assert.ok(scriptOk((await (await route.GET(new Request('http://x/api/today-picks?loc=xx'))).json()).items[1].why, 'en'), '모르는 로케일은 영어');
  await svc.setOff(true);
  const off = await (await route.GET(new Request('http://x/api/today-picks?loc=ko'))).json();
  assert.deepEqual(off, { off: true, items: [], hasFinra: false });
  store.clear();
  assert.deepEqual(await (await route.GET(new Request('http://x/api/today-picks?loc=ko'))).json(), { off: false, items: [], hasFinra: false });
});
t('푸시 한 줄: 오늘(ET) 문서의 1번 항목만 · 어제 문서·문서 없음·가드 걸림은 줄 없음 · 상한은 기존 푸시 규칙(ko·ja 90 · en 110)', async () => {
  stubWorld();
  script.push(...Array.from({ length: 5 }, () => ({ text: GOOD('whale') })));
  await svc.runPicks({ now: NOW_PM });
  const doc = store.get(svc.TP_KEYS.latest) as TodayPicksDoc;
  for (const l of LOCS) {
    const r = pushPickLine(doc, l, '2026-10-12');
    assert.equal(r.reason, 'ok'); assert.equal(r.line, doc.items[0].push[l]); assert.ok([...r.line!].length <= PUSH_LINE_MAX[l]);
  }
  assert.equal(pushPickLine(doc, 'ko', '2026-10-13').reason, 'not-today');
  assert.equal(pushPickLine(null, 'ko', '2026-10-12').reason, 'no-doc');
  const tampered = { ...doc, items: [{ ...doc.items[0], push: { ...doc.items[0].push, ko: '✦ 오늘 볼 것 · 이 종목을 매수하세요' } }, ...doc.items.slice(1)] };
  assert.match(pushPickLine(tampered, 'ko', '2026-10-12').reason, /^guard:banned/);
  assert.equal(pushPickLine({ ...doc, items: [] }, 'en', '2026-10-12').reason, 'no-doc');
});
const PUSH = fs.readFileSync(path.join(__dirname, '../src/app/api/cron/push/route.ts'), 'utf8');
t('푸시 크론: 마감에만 «오늘 볼 것» 줄을 붙이고 모닝은 그대로 · 제목 불변 · 줄바꿈으로 잇는다 · 드라이런은 여전히 보내지도 쓰지도 않는다', () => {
  assert.ok(/if \(type !== 'closing'\) return null;/.test(PUSH), '모닝은 줄을 붙이지 않는다');
  assert.ok(/`\$\{ai\.line \|\| PUSH_CONTENT\[type\]\[l\]\.body\}\\n\$\{pick\.line\}`/.test(PUSH), 'AI 한 줄(없으면 정적 문구) 뒤 줄바꿈 + 오늘 볼 것');
  const a = PUSH.indexOf('if (dry) {'), b = PUSH.indexOf('return NextResponse.json({ ok: true, dry: true', a);
  assert.equal(/sendPushByType|setInCache|writeStats/.test(PUSH.slice(a, b)), false);
  assert.ok(/pickLinesFor\(type, todayET\)/.test(PUSH) && /await sendPushByType\(type, \{ bodies \}\)/.test(PUSH));
  assert.ok(/catch \(e: any\) \{[\s\S]*today-picks line failed — none/.test(PUSH), '읽기 실패는 발송을 막지 않는다');
  const SEND = fs.readFileSync(path.join(__dirname, '../src/lib/push/send.ts'), 'utf8');
  for (const title of ["'📊 장마감 리포트'", "'📊 Closing Report'", "'📊 クロージングレポート'"]) assert.ok(SEND.includes(`title: ${title}`), title);
});

// ━━━ 10. 연결·측정·정책 ━━━
t('사다리: TodayPicks 는 추적·허용 목록에 있고 사고 끔·12초·가드 실패 시 크레딧 한 번 더(내 종목 AI 한 줄과 같은 방식)', () => {
  assert.ok(TRACKED_PURPOSES.includes('TodayPicks'));
  assert.deepEqual(LADDER_PURPOSES.TodayPicks, { effort: 'low', thinking: 'disabled', timeoutMs: 12_000, retries: 1 });
});
t('측정: 퍼널 출처 today_picks(ai_seen·ai_tap 전용) · 웹 페이지뷰 그룹 today · 스크립트 목록 일치', () => {
  assert.ok(isFunnelSrc('today_picks') && (FUNNEL_SRCS as readonly string[]).includes('today_picks'));
  assert.ok((PV_GROUPS as readonly string[]).includes('today'));
  const mf = require('../scripts/mkt-funnel.js');
  assert.deepEqual(mf.SRCS, [...FUNNEL_SRCS]);
  const coupon = require('../src/lib/marketing/coupon');
  assert.equal(coupon.audienceLine(TODAY_APP_FROM, 'NAVERPRO', 'ko'), 'SIGNUM 웹 방문자 전용');
  assert.equal(TODAY_APP_FROM, 'today_picks'); assert.deepEqual(TODAY_APP_CODE, { ko: 'NAVERPRO', ja: 'NOTEJP', en: 'IHPRO' });
});
t('정책: 소스에 공급사 호출이 없다 — fetch 는 EC2 프록시(레디스) 읽기뿐 · Intrinio·FMP·Massive·벤더 클라이언트를 import 하지 않는다', () => {
  const SRC = fs.readFileSync(path.join(__dirname, '../src/services/todayPicksService.ts'), 'utf8');
  for (const bad of ['intrinioClient', 'intrinioRouter', 'massiveClient', 'finnhubClient', 'fmpNewsAdapter', 'fetchMassive', 'financialmodelingprep', 'warmMissingStructure', 'getStructureData']) assert.equal(SRC.includes(bad), false, bad);
  assert.equal((SRC.match(/fetch\(/g) || []).length, 1, 'fetch 는 proxyJson 하나(EC2 레디스)');
  assert.ok(/EC2_REDIS_PROXY_URL \|\| 'http:\/\/52\.23\.98\.13:8081'/.test(SRC));
});
t('화면 문구 점검: 대시보드 카드·웹 페이지·OG 가 같은 저장본(buildView)만 읽는다 · 카드 삽입은 한 군데 · 기존 카드 문구 변경 없음(diff 가 import 1줄 + 컴포넌트 1개)', () => {
  const DASH = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/app-view/dash/page.tsx'), 'utf8');
  assert.equal((DASH.match(/<TodayPicksCard/g) || []).length, 1);
  assert.ok(DASH.indexOf('<TodayPicksCard') < DASH.indexOf('<DashWatchlistSection') && DASH.indexOf('<TodayPicksCard') > DASH.indexOf('MARKET STATUS'), '마켓 스테이터스 아래 · 내 종목 위');
  const PAGE = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/today/page.tsx'), 'utf8');
  const OG = fs.readFileSync(path.join(__dirname, '../src/app/[locale]/today/opengraph-image.tsx'), 'utf8');
  for (const f of [PAGE, OG]) { assert.ok(f.includes('readPicks') && f.includes('buildView')); assert.equal(/runPicks|callBedrock|generate/.test(f.replace(/generateMetadata/g, '')), false, '크롤러·방문자 경로는 새 생성을 하지 않는다'); }
  const API = fs.readFileSync(path.join(__dirname, '../src/app/api/today-picks/route.ts'), 'utf8');
  assert.equal(/runPicks|callBedrock/.test(API), false);
  for (const l of LOCS) { assert.ok(UI[l].title && UI[l].how.length === 4 && UI[l].metaDesc(null) && UI[l].shareText('INTC 10/23 $115 call')); assert.doesNotMatch(UI[l].metaDesc('INTC'), /P\/C/); }
});

(async () => {
  for (const [name, fn] of tests) { await fn(); n++; console.log('ok -', name); }
  (globalThis as any).fetch = realFetch;
  console.log(`\n${n} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
