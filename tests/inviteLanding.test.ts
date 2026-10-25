/**
 * 공유 카드 «받는 쪽 웹 페이지 + OG 카드» 뷰 모델 (2026-10-14, feat/viral-loop) — lib/invite/landing.ts 의 순수 부분
 * 실행: cd /Users/eunhoon/signum-worktrees/viral-loop && node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/inviteLanding.test.ts
 *
 * 지키는 것:
 *   1. 주소 검사 — 종류는 정확히 pick|line|earn, 티커는 형식(^[A-Z][A-Z0-9.]{0,6}$)에 맞을 때만 · via 는 ios|android|web 아니면 web
 *   2. pick — 이 종목 항목을 큰 카드로(라벨 칩·기준일·what·✦AI 는 AI 가 쓴 줄에만), 나머지 최대 4개 «함께 보기» · 항목이 돌았으면 «지금 목록에 없음» + 목록 전체 · 목록 없음·끄기 = 대체
 *   3. line — 자리표를 «글 쓴 때의 가격» 기준 거리 %로 채운다(기준가·레벨 숫자·기준 시각·체인 기준일 같이) · 저장본 없음·언어 글 없음·지형 바뀜·채울 수 없음·끄기 = 대체(생성 안 함)
 *   4. earn — 이번 주 행 선택 · 옵션 반영 변동폭 + 기준(만기·세션) · EPS/매출 추정·AI 관전 포인트(숫자 대조 통과분만) · 행 없음/발표 끝/변동폭 없음 = 대체 + 이번 주 다른 발표
 *   5. CTA — href 에 from·ref·l 이 맞게, code 는 선물 코드가 live 일 때만 · code 없으면 쿠폰 문구 없음 · 쿠폰 문구는 «무료» 문장 안에 자동 갱신 고지, 가격 숫자·선착순 없음
 *   6. 문구 — 금융 공통어 번역 금지 · 자리표({…}) 잔류 없음 · 가짜 희소성 단어 없음 · 서비스(레디스) 모듈을 올리지 않는다
 *   7. 읽기 — 의존 주입으로 가짜 값만 넣는다(실서버·실Redis 호출 0) · 읽기 실패는 던지지 않고 대체 화면
 */
import assert from 'node:assert/strict';

import {
  canonicalPathOf, cardPathOf, clipText, composeEarn, composeLine, composePick, fallbackView, landingCta, loadLanding,
  appSourceEarn, ogCardOf, ogGlyphs, parseLandingParams, pickEarnExtra, viaOf,
  type EarnExtra, type LandingDeps, type LandingView,
} from '../src/lib/invite/landing';
import { INVITE_LANGS, SHARE_KINDS, type InviteLang, type ShareKind } from '../src/lib/invite/kinds';
import { giftConfig } from '../src/lib/gift/giftConfig';
import { ruleTexts, UI } from '../src/lib/todayPicks/copy';
import { sidesFor, type AiLineEntry } from '../src/lib/app/watchlistAiLine';
import { EARNINGS_IMPLIED_KEY, type ImpliedPack } from '../src/lib/earnings/earningsImplied';
import type { EarningsWeekData, EarningsWeekRow } from '../src/services/earningsWeekService';
import type { StoredLine } from '../src/services/watchlistAiLineService';
import type { PickFacts, TodayPick, TodayPicksDoc } from '../src/lib/todayPicks/types';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };

const LANGS = INVITE_LANGS as readonly InviteLang[];
const REF = 'k7m2q9x4tb';          // 형식 맞는 익명 id(10자·숫자 포함)
const CODE = 'GIFTTESTPRO';        // 형식 규칙만 맞춘 «가짜» — 진짜 코드 값이 아니다

// ── 고정 자료: 오늘 볼 것 ──────────────────────────────────────────────────────
const F_WHALE: PickFacts = { kind: 'whale', openedOn: '2026-10-09', notional: 2.6e9, callPct: 80, best: { type: 'call', strike: 215, expiry: '2026-10-16', added: 12000, oi: 15000, notional: 258_000_000 }, jump: 5.2 };
const F_DARK: PickFacts = { kind: 'darkpool', date: '2026-10-09', pct: 43.8, ratio: 2.4, volume: 1e7, marketAvg: 40 };
const F_GAMMA: PickFacts = { kind: 'gamma', level: 'maxPain', chainDate: '2026-10-09', expiry: '2026-10-16', spot: 229.1, levelPrice: 215, distPct: 6.2, side: 'a' };
const F_EARN: PickFacts = { kind: 'earnings', date: '2026-10-14', hour: 'amc', etTime: null, impliedPct: 4.3, impliedExpiry: '2026-10-16', session: '2026-10-09' };

function pick(ticker: string, facts: PickFacts, ai: boolean): TodayPick {
  const r = ruleTexts(ticker, facts);
  return {
    id: `${facts.kind}:${ticker}`, kind: facts.kind, ticker, asOf: '2026-10-09', facts, what: r.what,
    why: ai ? { ko: `${ticker} 새 계약이 한 만기에 몰렸습니다`, en: `${ticker} new contracts piled into one expiry`, ja: `${ticker}の新規建玉が特定の満期に集中しました` } : r.fallback,
    whyAi: ai, push: r.push,
  };
}
const DOC: TodayPicksDoc = {
  v: 1, slot: 'pm', etDate: '2026-10-09', at: Date.UTC(2026, 9, 9, 22, 0),
  stamp: { opt: null, opened: null, finra: null, chain: null, earn: null },
  items: [pick('INTC', F_WHALE, true), pick('AMD', F_DARK, false), pick('NVDA', F_GAMMA, true), pick('GS', F_EARN, true), pick('MU', F_WHALE, false), pick('TSLA', F_DARK, false)],
  gen: { calls: 0, ok: 0, fallback: 0, ms: 1 },
} as unknown as TodayPicksDoc;

// ── 고정 자료: 내 종목 AI 한 줄 ────────────────────────────────────────────────
const LV = { mp: 215, cw: 250, pf: 200, gf: null };
const SPOT = 229.1;
const AT = Date.UTC(2026, 9, 13, 21, 55);     // 뉴욕 10/13(화) 17:55
function storedLine(over: Partial<StoredLine> = {}): StoredLine {
  return {
    v: 1, t: 'NVDA', at: AT, chain: '2026-10-09', lv: LV, sides: sidesFor(SPOT, LV), spot: SPOT,
    text: {
      ko: '가격이 Max Pain {MP} 위, Call Wall까지 {CW}',
      en: 'Price sits {MP} above Max Pain, {CW} below the Call Wall',
      ja: '価格はMax Painの{MP}上、Call Wallまで{CW}',
    },
    ms: 1, ...over,
  } as StoredLine;
}
/** services/watchlistAiLineService.entryOf 와 같은 모양(서비스를 올리지 않으려고 시험 안에서 만든다) */
const entryOf = (s: StoredLine | null, l: InviteLang): AiLineEntry | null => (s && s.text && s.text[l] ? { text: s.text[l], chain: s.chain, lv: s.lv, sides: s.sides, at: s.at } : null);
const lineView = (l: InviteLang, s: StoredLine | null = storedLine(), off = false) => composeLine(s, entryOf(s, l), off, 'NVDA', l);

// ── 고정 자료: 실적 주간 ───────────────────────────────────────────────────────
const NOW = Date.UTC(2026, 9, 13, 15, 0);     // 뉴욕 10/13(화) 11:00 — GS(10/13 장전)는 이미 발표 완료
function row(over: Partial<EarningsWeekRow>): EarningsWeekRow {
  return {
    ticker: 'X', date: '2026-10-15', hour: 'bmo', etTime: null,
    impliedMovePct: null, impliedExpiry: null, impliedBasis: null, impliedSession: null, impliedAsOf: null, straddle: null, strike: null, spot: null, impliedReason: null,
    maxPain: null, callWall: null, putFloor: null, levelsExpiry: null, levelsChainDate: null, levelsAsOf: null, ...over,
  };
}
const WEEK: EarningsWeekData = {
  range: { start: '2026-10-12', end: '2026-10-16', today: '2026-10-13', rolled: false },
  rows: [
    row({ ticker: 'GS', date: '2026-10-13', hour: 'bmo', impliedMovePct: 3.1, impliedExpiry: '2026-10-16', impliedBasis: 'eod', impliedSession: '2026-10-09', spot: 600 }),
    row({ ticker: 'NFLX', date: '2026-10-14', hour: 'amc', impliedMovePct: 6.2, impliedExpiry: '2026-10-16', impliedBasis: 'eod', impliedSession: '2026-10-09', spot: 1100 }),
    row({ ticker: 'ASML', date: '2026-10-14', hour: 'bmo' }),
    row({ ticker: 'TSM', date: '2026-10-15', hour: 'bmo', impliedMovePct: 4.3, impliedExpiry: '2026-10-16', impliedBasis: 'eod', impliedSession: '2026-10-09', spot: 332.99 }),
    row({ ticker: 'JPM', date: '2026-10-15', hour: 'bmo', impliedMovePct: 2.2, impliedExpiry: '2026-10-16', impliedBasis: 'eod', impliedSession: '2026-10-09', spot: 300 }),
    row({ ticker: 'ABT', date: '2026-10-16', hour: 'bmo', impliedMovePct: 3.5, impliedExpiry: '2026-10-16', impliedBasis: 'eod', impliedSession: '2026-10-09', spot: 130 }),
    row({ ticker: 'SAP', date: '2026-10-16', hour: 'amc', impliedMovePct: 2.9, impliedExpiry: '2026-10-23', impliedBasis: 'eod', impliedSession: '2026-10-09', spot: 250 }),
  ],
  pending: [], listVerifiedAt: '2026-10-12T00:00:00Z', dataSession: '2026-10-09', dataBasis: 'eod', dataAt: Date.UTC(2026, 9, 10, 4, 7), generatedAt: NOW,
};
const CAL_ROWS = [
  { ticker: 'TSM', date: '2026-10-15', hour: 'bmo', epsEstimate: 2.66, revenueEstimate: 3.4e10, quarter: 3, year: 2026 },
  { ticker: 'TSM', date: '2027-01-15', hour: 'bmo', epsEstimate: 9.99, revenueEstimate: 1e10, quarter: 4, year: 2026 },     // 다음 분기 행 — 쓰지 않는다
];
const PACK = {
  entries: {
    'TSM|2026-10-15': {
      ko: { name: '타이완 반도체', watch: 'EPS 추정 {EPS}, 매출 추정 {REV}를 앞두고 발표를 기다립니다' },
      en: { name: 'TSMC', watch: 'Awaiting the report against an EPS estimate of {EPS} and revenue of {REV}' },
      ja: { name: 'TSMC', watch: 'EPS予想{EPS}、売上予想{REV}で発表を待ちます' },
    },
  },
};
const EXTRA: EarnExtra | null = pickEarnExtra(CAL_ROWS, PACK, { ticker: 'TSM', date: '2026-10-15' });
const earnView = (l: InviteLang, ticker = 'TSM', extra: EarnExtra | null = EXTRA, week: EarningsWeekData | null = WEEK) => composeEarn(week, extra, ticker, l, NOW);

// ── 앱과 같은 원천(이번 주 목록 밖): 캘린더 행(회사 공지를 입힌 것) · 변동폭 묶음 · 브리프 팩 ──
const OVER = [
  { ticker: 'META', date: '2026-10-08', hour: 'amc', epsEstimate: 5.1, revenueEstimate: 4.0e10, quarter: 2, year: 2026, dateStatus: 'confirmed' },     // 이미 지난 행
  { ticker: 'META', date: '2026-10-22', hour: 'amc', epsEstimate: 6.01, revenueEstimate: 5.1e10, quarter: 3, year: 2026, dateStatus: 'confirmed' },
  { ticker: 'AMZN', date: '2026-10-29', hour: 'amc', epsEstimate: 1.5, revenueEstimate: 1.6e11, quarter: 3, year: 2026, dateStatus: 'est' },
  { ticker: 'KO', date: '2026-10-21', hour: 'bmo', epsEstimate: 0.8, revenueEstimate: 1.2e10, quarter: 3, year: 2026 },
  { ticker: 'PEP', date: '2026-10-21', hour: 'bmo', epsEstimate: 2.2, revenueEstimate: 2.4e10, quarter: 3, year: 2026, dateStatus: 'confirmed' },    // 변동폭 칸 없음
  { ticker: 'OLD', date: '2026-10-09', hour: 'bmo', epsEstimate: 1, revenueEstimate: 1e9, quarter: 3, year: 2026, dateStatus: 'confirmed' },       // 전부 지난 종목
];
const IMPLIED: ImpliedPack = {
  v: 1, at: Date.UTC(2026, 9, 13, 14, 0), day: '2026-10-13',
  cells: {
    'META|2026-10-22': { p: 5.8, e: '2026-10-23', b: 'eod', s: '2026-10-12', r: null },
    'AMZN|2026-10-29': { p: 4.9, e: '2026-10-30', b: 'eod', s: '2026-10-12', r: null },
    'KO|2026-10-21': { p: 2.4, e: '2026-10-23', b: 'eod', s: '2026-10-12', r: null },
    'OLD|2026-10-09': { p: 3.3, e: '2026-10-09', b: 'eod', s: '2026-10-08', r: null },
  },
};
const PACK2 = {
  entries: {
    'META|2026-10-22': {
      ko: { name: '메타', watch: 'EPS 추정 {EPS}, 매출 추정 {REV} 대비 발표를 지켜봅니다' },
      en: { name: 'Meta', watch: 'Watching the report against an EPS estimate of {EPS}' },
      ja: { name: 'メタ', watch: 'EPS予想{EPS}に対する発表に注目します' },
    },
  },
};
const appEarn = (l: InviteLang, ticker: string, over: unknown = OVER, implied: ImpliedPack | null = IMPLIED, week: EarningsWeekData | null = WEEK) => {
  const r = appSourceEarn(over, implied, PACK2, ticker, NOW);
  return composeEarn(week, r.extra, ticker, l, NOW, r.alt);
};

/** 뷰 안의 모든 문자열(JSON 문법의 중괄호와 섞이지 않게) */
const allStrings = (x: unknown): string[] => (typeof x === 'string' ? [x] : Array.isArray(x) ? x.flatMap(allStrings) : x && typeof x === 'object' ? Object.values(x).flatMap(allStrings) : []);

// 서비스(레디스·AI 클라이언트) 모듈을 올리지 않았는가 — 아래 시험은 전부 순수 부분이다
const loadedServices = () => Object.keys(require.cache).filter((k) => /\/src\/services\/(redisClient|todayPicksService|watchlistAiLineService|earningsWeekService|earningsCalendarService|bedrockClient)\./.test(k));

(async () => {
  console.log('1. 주소 검사');
  t('종류는 정확히 pick|line|earn — 대문자·복수형·모르는 값은 null', () => {
    for (const k of SHARE_KINDS) assert.deepEqual(parseLandingParams(k, 'NVDA'), { kind: k, ticker: 'NVDA' });
    for (const bad of ['PICK', 'picks', 'x', '', 'pick ', 'earnings', undefined, null, 1]) assert.equal(parseLandingParams(bad, 'NVDA'), null, String(bad));
  });
  t('티커 형식 — 소문자는 대문자로, BRK.B 허용, 숫자 시작·8자 이상·공백·태그는 null', () => {
    assert.equal(parseLandingParams('line', 'nvda')?.ticker, 'NVDA');
    assert.equal(parseLandingParams('line', 'BRK.B')?.ticker, 'BRK.B');
    for (const bad of ['1ABC', 'TOOLONGTK', 'A B', '', '<script>', 'NV/DA', '../x', undefined, 7, 'A,B']) assert.equal(parseLandingParams('line', bad), null, String(bad));
  });
  t('via — ios|android|web, 없음·모름·배열은 web / 배열이면 첫 값', () => {
    assert.equal(viaOf('ios'), 'ios'); assert.equal(viaOf('android'), 'android'); assert.equal(viaOf('web'), 'web');
    assert.equal(viaOf(undefined), 'web'); assert.equal(viaOf('desktop'), 'web'); assert.equal(viaOf(['android', 'ios']), 'android'); assert.equal(viaOf(''), 'web');
  });
  t('canonical — pick→/{l}/today · earn→/{l}/earnings-week · line→FLOW_TICKERS 에 있으면 /{l}/flow/{T}, 아니면 null', () => {
    assert.equal(canonicalPathOf('pick', 'INTC', 'ko'), '/ko/today');
    assert.equal(canonicalPathOf('earn', 'TSM', 'ja'), '/ja/earnings-week');
    assert.equal(canonicalPathOf('line', 'NVDA', 'en'), '/en/flow/NVDA');
    assert.equal(canonicalPathOf('line', 'ZZZZZ', 'en'), null);
    assert.equal(cardPathOf('line', 'BRK.B', 'ko'), '/ko/s/line/BRK.B');
  });
  t('clipText — 코드포인트 기준(이모지·한글 안 깨짐), 짧으면 그대로', () => {
    assert.equal(clipText('가나다라마', 3), '가나…'); assert.equal(clipText('가나다', 3), '가나다'); assert.equal(clipText('😀😀😀😀', 3), '😀😀…'); assert.equal(clipText('', 5), '');
  });

  console.log('2. pick — 오늘 볼 것');
  t('항목 있음 — 라벨 칩·what·기준일·선별 시각·✦AI(AI 줄에만)·나머지 최대 4개', () => {
    const v = composePick(DOC, false, 'INTC', 'ko');
    assert.equal(v.ok, true); assert.equal(v.fallbackReason, undefined);
    assert.equal(v.chip, '고래 신규 포지션');
    assert.equal(v.headline, '10/16 만기 $215 콜 +12,000계약 · 명목 $258M');
    assert.equal(v.headlineAi, false);
    assert.deepEqual(v.aiLine, { text: 'INTC 새 계약이 한 만기에 몰렸습니다', ai: true });
    assert.equal(v.aiBadge, true);
    assert.match(v.asOf, /^10\/9 세션 · 선별 시각 10\/9 18:00 ET$/);
    assert.equal(v.others.length, 4, '6개 중 자기 제외 5개 → 4개 상한');
    assert.ok(v.others.every((o) => o.ticker !== 'INTC'));
    assert.deepEqual(v.others.map((o) => o.ticker), ['AMD', 'NVDA', 'GS', 'MU']);
    assert.equal(v.others[1].href, '/ko/flow/NVDA', 'FLOW_TICKERS 에 있는 종목은 링크');
    assert.match(v.title, /^INTC · 고래 신규 포지션 — 오늘 볼 것 \| SIGNUM HQ$/);
    assert.equal(v.canonicalPath, '/ko/today');
    assert.equal(v.othersTitle, '함께 보기');
  });
  t('예전 고래 합계 문장도 공유 카드·OG 입력에서는 단일 계약 명목으로 표시(저장본 불변)', () => {
    const legacy = JSON.parse(JSON.stringify(DOC)) as TodayPicksDoc;
    legacy.items[0].what.ko = '10/16 만기 $215 콜 +12,000계약 · 명목 $2.6B';
    const original = JSON.stringify(legacy);
    const view = composePick(legacy, false, 'INTC', 'ko');
    assert.equal(view.headline, '10/16 만기 $215 콜 +12,000계약 · 명목 $258M');
    assert.equal(ogCardOf(view, 'ko').headline, view.headline);
    assert.equal(JSON.stringify(legacy), original);
  });
  t('규칙 문장(AI 못 쓴 줄)은 ✦AI 표식 없음 · 다크풀 항목은 출처 FINRA 를 싣는다', () => {
    const v = composePick(DOC, false, 'AMD', 'ko');
    assert.equal(v.aiLine!.ai, false); assert.equal(v.aiBadge, false);
    assert.equal(v.aiLine!.text, ruleTexts('AMD', F_DARK).fallback.ko, '저장된 규칙 문장 그대로');
    assert.ok(v.facts.includes(UI.ko.sourceFinra));
    assert.match(v.asOf, /^FINRA 10\/9 · /);
  });
  t('항목이 돌았다 — 지금 목록에 없다는 사실 한 줄 + 오늘 목록 전체(대체 화면)', () => {
    for (const l of LANGS) {
      const v = composePick(DOC, false, 'ZZZ', l);
      assert.equal(v.ok, false); assert.equal(v.fallbackReason, 'rotated');
      assert.ok(v.fallbackText!.includes('ZZZ'), l);
      assert.equal(v.others.length, 6, '목록 전체'); assert.equal(v.othersTitle, UI[l].title);
      assert.equal(v.headline, '');
    }
    assert.match(composePick(DOC, false, 'ZZZ', 'ko').fallbackText!, /지금 목록에 ZZZ 항목이 없습니다/);
    assert.doesNotMatch(composePick(DOC, false, 'ZZZ', 'ko').fallbackText!, /지난 목록에 있었/, '주소만으로 만들 수 있는 링크라 «있었다»고 단정하지 않는다');
  });
  t('목록 없음·끄기 → 대체(생성 안 함) — 문구는 «아직 없습니다»', () => {
    const none = composePick(null, false, 'INTC', 'ko');
    assert.equal(none.ok, false); assert.equal(none.fallbackReason, 'no-list'); assert.equal(none.fallbackText, UI.ko.empty);
    const off = composePick(DOC, true, 'INTC', 'en');
    assert.equal(off.fallbackReason, 'off'); assert.equal(off.fallbackText, UI.en.empty); assert.equal(off.others.length, 0);
    assert.equal(composePick({ ...DOC, items: [] }, false, 'INTC', 'ja').fallbackReason, 'no-list');
  });

  console.log('3. line — 내 종목 AI 한 줄');
  t('자리표를 글 쓴 때의 가격 기준 거리 %로 채운다 (229.1 → Max Pain 215 = 6.2%, Call Wall 250 = 9.1%)', () => {
    const ko = lineView('ko');
    assert.equal(ko.ok, true);
    assert.equal(ko.headline, '가격이 Max Pain 6.2% 위, Call Wall까지 9.1%');
    assert.equal(ko.headlineAi, true); assert.equal(ko.aiBadge, true);
    assert.equal(lineView('en').headline, 'Price sits 6.2% above Max Pain, 9.1% below the Call Wall');
    assert.equal(lineView('ja').headline, '価格はMax Painの6.2%上、Call Wallまで9.1%');
    for (const l of LANGS) assert.ok(allStrings(lineView(l)).every((x) => !/[{}]/.test(x)), `${l} 자리표 잔류`);
  });
  t('숫자 — 기준가·Max Pain·Call Wall·Put Floor(+Gamma Flip 있으면) · 라벨은 번역하지 않는다', () => {
    for (const l of LANGS) {
      const v = lineView(l);
      assert.deepEqual(v.rows.map((r) => r.value), ['$229.10', '$215', '$250', '$200'], l);
      assert.deepEqual(v.rows.slice(1).map((r) => r.label), ['Max Pain', 'Call Wall', 'Put Floor'], l);
    }
    assert.equal(lineView('ko').rows[0].label, '기준가');
    const lv4 = { mp: 215, cw: 250, pf: 200, gf: 225 };
    const s4 = storedLine({ lv: lv4, sides: sidesFor(SPOT, lv4), text: { ko: '가격이 Gamma Flip {GF} 위', en: 'x {GF}', ja: 'y {GF}' } });
    const v4 = composeLine(s4, entryOf(s4, 'ko'), false, 'NVDA', 'ko');
    assert.equal(v4.headline, '가격이 Gamma Flip 1.8% 위');
    assert.deepEqual(v4.rows.map((r) => r.label), ['기준가', 'Max Pain', 'Call Wall', 'Put Floor', 'Gamma Flip']);
    assert.equal(v4.rows[4].value, '$225');
  });
  t('기준 시각(ET 벽시계 + 한국) · 옵션 체인 기준일을 같이 표시', () => {
    const ko = lineView('ko');
    assert.equal(ko.asOf, '기준 시각 뉴욕 10/13(화) 17:55 · 한국 10/14(수) 06:55');
    assert.deepEqual(ko.facts, ['옵션 체인 기준일 10/9(금)']);
    assert.equal(lineView('en').asOf, 'As of NY 10/13 (Tue) 17:55 · Korea 10/14 (Wed) 06:55');
    assert.deepEqual(lineView('en').facts, ['Options chain as of 10/9 (Fri)']);
    assert.match(lineView('ja').asOf, /^基準時刻 NY 10\/13\(火\) 17:55 · 日本 10\/14\(水\) 06:55$/);
  });
  t('채울 수 없으면 대체 — 저장본 없음 · 이 언어 글 없음 · 지형 바뀜 · 채울 수 없는 자리표 · 끄기', () => {
    const fb = (v: LandingView, why: string) => { assert.equal(v.ok, false, why); assert.equal(v.fallbackReason, why === '끄기' ? 'off' : 'no-line', why); assert.ok(v.fallbackText!.includes('NVDA'), why); assert.equal(v.headline, '', why); assert.equal(v.rows.length, 0, why); };
    fb(composeLine(null, null, false, 'NVDA', 'ko'), '저장본 없음');
    const noJa = storedLine({ text: { ko: '가격이 Max Pain {MP} 위', en: 'x', ja: '' } as StoredLine['text'] });
    fb(composeLine(noJa, entryOf(noJa, 'ja'), false, 'NVDA', 'ja'), '이 언어 글 없음');
    // 글을 쓴 뒤 가격이 Max Pain 아래로 내려온 지형 — 저장된 쪽(a)과 지금 쪽(b)이 달라 그리지 않는다
    const crossed = storedLine({ spot: 210, sides: sidesFor(SPOT, LV) });
    fb(composeLine(crossed, entryOf(crossed, 'ko'), false, 'NVDA', 'ko'), '지형 바뀜');
    const noGf = storedLine({ text: { ko: 'Gamma Flip {GF} 위', en: 'x', ja: 'y' } });
    fb(composeLine(noGf, entryOf(noGf, 'ko'), false, 'NVDA', 'ko'), '채울 수 없는 자리표');
    fb(composeLine(storedLine(), entryOf(storedLine(), 'ko'), true, 'NVDA', 'ko'), '끄기');
    fb(composeLine(storedLine({ spot: NaN as unknown as number }), entryOf(storedLine(), 'ko'), false, 'NVDA', 'ko'), '가격 없음');
  });
  t('체인 날짜가 글과 다르면(entry.chain ≠ stored.chain) 그리지 않는다', () => {
    const s = storedLine();
    const e = { ...entryOf(s, 'ko')!, chain: '2026-10-08' };
    assert.equal(composeLine(s, e, false, 'NVDA', 'ko').fallbackReason, 'no-line');
  });

  console.log('4. earn — 실적 옵션 반영 변동폭');
  t('이번 주 행 선택 — 발표일·시간 · 옵션 반영 변동폭 + 기준(만기·세션) · 기준가', () => {
    const v = earnView('ko');
    assert.equal(v.ok, true);
    assert.deepEqual(v.hero, { value: '±4.3%', label: '옵션 반영 변동폭', note: '10/16 만기 · 10/9 세션' });
    assert.equal(v.headline, '10/15(목) 장전 실적 발표');
    assert.deepEqual(v.rows[0], { label: '발표(뉴욕 · 한국)', value: '10/15(목) 장전', note: '한국 10/15(목) 저녁~밤' });
    assert.deepEqual(v.rows[1], { label: '기준가', value: '$332.99' });
    assert.match(v.asOf, /^옵션 숫자 기준: 뉴욕 10\/9\(금\) 마감 호가 · 계산 시각 뉴욕 10\/10\(토\) 00:07 · 한국 10\/10\(토\) 13:07$/);
    assert.equal(v.canonicalPath, '/ko/earnings-week');
    assert.match(v.title, /^TSM 실적 10\/15\(목\) — 옵션 반영 변동폭 ±4\.3% \| SIGNUM HQ$/);
    // 세 언어 라벨은 앱 실적 화면과 같다
    assert.equal(earnView('en').hero!.label, 'Options-implied move'); assert.equal(earnView('en').hero!.note, '10/16 expiry · 10/9 session');
    assert.equal(earnView('ja').hero!.label, 'オプション織り込み変動幅'); assert.equal(earnView('ja').hero!.note, '10/16満期 · 10/9セッション');
    assert.equal(earnView('en').headline, 'Reports 10/15 (Thu) before open');
  });
  t('EPS/매출 추정(표와 같은 서식) · 회사명 · AI 관전 포인트(자리표를 같은 행 값으로 채움, ✦AI)', () => {
    const v = earnView('ko');
    assert.deepEqual(v.rows.slice(2).map((r) => [r.label, r.value, r.note]), [['EPS 추정', '$2.66', 'Q3 FY26'], ['매출 추정', '$34.0B', undefined]]);
    assert.equal(v.name, 'TSMC');
    assert.deepEqual(v.aiLine, { text: 'EPS 추정 $2.66, 매출 추정 $34.0B를 앞두고 발표를 기다립니다', ai: true });
    assert.equal(v.aiBadge, true);
    assert.equal(earnView('en').aiLine!.text, 'Awaiting the report against an EPS estimate of $2.66 and revenue of $34.0B');
    assert.equal(earnView('ja').rows[2].label, 'EPS予想');
  });
  t('추정치·브리프가 없으면 그 줄만 빠진다(카드는 그대로) · 다음 분기 행의 추정치는 붙지 않는다', () => {
    const v = earnView('ko', 'TSM', null);
    assert.equal(v.ok, true); assert.deepEqual(v.rows.map((r) => r.label), ['발표(뉴욕 · 한국)', '기준가']);
    assert.equal(v.aiLine, undefined); assert.equal(v.name, undefined); assert.equal(v.aiBadge, false);
    assert.equal(EXTRA!.eps, 2.66, '2027-01-15 행(EPS 9.99)이 아니라 이 발표에 가까운 행');
    // ±30일 밖 행뿐이면 추정치가 없다 → {EPS}·{REV} 를 채울 수 없어 관전 포인트는 나가지 않고(회사명만), 추정치 줄도 없다
    const far = pickEarnExtra([CAL_ROWS[1]], PACK, { ticker: 'TSM', date: '2026-10-15' })!;
    assert.deepEqual([far.eps, far.rev, far.quarter], [null, null, null]);
    assert.equal(far.brief?.ko?.watch, undefined); assert.equal(far.brief?.ko?.name, 'TSMC');
    assert.equal(pickEarnExtra([], null, { ticker: 'TSM', date: '2026-10-15' }), null, '캘린더 행도 브리프도 없으면 null');
  });
  t('관전 포인트의 숫자가 표와 다르면(가드) 문구를 내보내지 않는다 — 이름만 남는다', () => {
    const bad = { entries: { 'TSM|2026-10-15': { en: { name: 'TSMC' }, ko: { name: '타이완 반도체', watch: 'EPS 추정 $9.99를 앞두고 있습니다' } } } };
    const x = pickEarnExtra(CAL_ROWS, bad, { ticker: 'TSM', date: '2026-10-15' })!;
    assert.deepEqual(x.brief, { en: { name: 'TSMC' }, ko: { name: 'TSMC' } });
    const v = earnView('ko', 'TSM', x);
    assert.equal(v.aiLine, undefined); assert.equal(v.name, 'TSMC'); assert.equal(v.aiBadge, false);
  });
  t('날짜가 FMP 와 달라진 행(dateFrom)도 옛 날짜 키의 글을 찾는다', () => {
    const cal = [{ ticker: 'TSM', date: '2026-10-14', hour: 'bmo', epsEstimate: 2.66, revenueEstimate: 3.4e10, quarter: 3, year: 2026 }];
    const x = pickEarnExtra(cal, { entries: { 'TSM|2026-10-14': PACK.entries['TSM|2026-10-15'] } }, { ticker: 'TSM', date: '2026-10-15' })!;
    assert.equal(x.eps, 2.66); assert.ok(x.brief?.ko?.watch?.includes('$2.66'));
  });
  t('행 없음·발표 끝·변동폭 없음·읽기 실패 → 대체 + 이번 주 다른 발표(변동폭 큰 순, 최대 4, 끝난 것·자기 제외)', () => {
    const none = earnView('ko', 'ZZZ');
    assert.equal(none.ok, false); assert.equal(none.fallbackReason, 'no-row'); assert.ok(none.fallbackText!.includes('ZZZ'));
    assert.deepEqual(none.others.map((o) => o.ticker), ['NFLX', 'TSM', 'ABT', 'SAP'], 'GS(발표 끝)·ASML(변동폭 없음) 제외, 변동폭 큰 순');
    assert.equal(none.others[0].text, '±6.2% · 10/14(수)');
    const done = earnView('ko', 'GS');
    assert.equal(done.fallbackReason, 'done'); assert.equal(done.chip, '발표 완료'); assert.equal(done.hero, undefined);
    assert.ok(done.fallbackText!.includes('10/13(화)')); assert.ok(done.others.every((o) => o.ticker !== 'GS'));
    const nm = earnView('ko', 'ASML');
    assert.equal(nm.fallbackReason, 'no-move'); assert.equal(nm.rows[0].value, '10/14(수) 장전');
    assert.equal(composeEarn(null, null, 'TSM', 'ko', NOW).fallbackReason, 'read-failed');
    // 오늘 발표(아직)는 칩 «오늘 발표»
    assert.equal(composeEarn({ ...WEEK, rows: [row({ ticker: 'TODAY', date: '2026-10-13', hour: 'amc', impliedMovePct: 5, impliedExpiry: '2026-10-16', impliedSession: '2026-10-09', spot: 10 })] }, null, 'TODAY', 'ko', NOW).chip, '오늘 발표');
  });
  t('공지 시각이 있으면 «16:05 ET» 로 표기, 영어 문장도 시각은 그대로', () => {
    const w = { ...WEEK, rows: [row({ ticker: 'NFLX', date: '2026-10-15', hour: 'amc', etTime: '16:05', impliedMovePct: 6.2, impliedExpiry: '2026-10-16', impliedSession: '2026-10-09', spot: 1100 })] };
    assert.equal(composeEarn(w, null, 'NFLX', 'en', NOW).headline, 'Reports 10/15 (Thu) 16:05 ET');
    assert.equal(composeEarn(w, null, 'NFLX', 'ko', NOW).rows[0].value, '10/15(목) 16:05 ET');
  });

  t('[T30] 공유 카드도 TER→Teradata 혼동을 차단하고 정상 Teradyne 글과 실적 숫자는 보존한다', () => {
    const r = { ticker: 'TER', date: '2026-10-27', epsEstimate: 2.66, revenueEstimate: 1e9 };
    const wrong = { en: { name: 'Teradata', watch: 'Data warehousing customer subscriptions' }, ko: { name: '테라도스', watch: '데이터 웨어하우스 구독 고객 수' } };
    const bad = pickEarnExtra([r], { entries: { 'TER|2026-10-27': wrong } }, r)!;
    assert.equal(bad.brief, undefined);
    assert.equal(bad.eps, 2.66); assert.equal(bad.rev, 1e9);
    const noEnglish = pickEarnExtra([r], { entries: { 'TER|2026-10-27': { ko: wrong.ko } } }, r)!;
    assert.equal(noEnglish.brief, undefined, '영어가 없는 오염본도 공통 회사 가드로 거절');
    assert.equal(noEnglish.eps, 2.66); assert.equal(noEnglish.rev, 1e9);
    const correct = { en: { name: 'Teradyne', watch: 'Semiconductor test equipment demand' }, ko: { name: '테라도스', watch: '반도체 테스트 장비 수요' } };
    const clean = pickEarnExtra([r], { entries: { 'TER|2026-10-27': correct } }, r)!;
    assert.equal(clean.brief!.ko!.name, '테라다인', '회사명은 정식명 표가 이긴다');
    assert.equal(clean.brief!.ko!.watch, '반도체 테스트 장비 수요');
  });
  console.log('4b. earn — 이번 주 밖 행은 «앱과 같은 원천»에서 읽는다');
  t('이번 주 목록에 없는 종목 — 가장 가까운 «아직 안 지난» 행 + 변동폭 묶음 + 브리프로 같은 카드(발표일·시간·변동폭·기준·EPS/매출·✦AI)', () => {
    const v = appEarn('ko', 'META');
    assert.equal(v.ok, true); assert.equal(v.fallbackReason, undefined);
    assert.deepEqual(v.hero, { value: '±5.8%', label: '옵션 반영 변동폭', note: '10/23 만기 · 10/12 세션' });
    assert.equal(v.headline, '10/22(목) 장후 실적 발표', '10/8 에 이미 지난 행이 아니라 10/22 행');
    assert.deepEqual(v.rows.map((r) => [r.label, r.value]), [['발표(뉴욕 · 한국)', '10/22(목) 장후'], ['EPS 추정', '$6.01'], ['매출 추정', '$51.0B']], '기준가는 이 원천에 없어 줄을 만들지 않는다');
    assert.equal(v.rows[1].note, 'Q3 FY26');
    assert.equal(v.name, '메타'); assert.equal(v.aiLine!.ai, true); assert.ok(v.aiLine!.text.includes('$6.01') && v.aiLine!.text.includes('$51.0B'));
    assert.match(v.asOf, /^옵션 숫자 기준: 뉴욕 10\/12\(월\) 마감 호가 · 계산 시각 뉴욕 10\/13\(화\) 10:00 · 한국 10\/13\(화\) 23:00$/);
    assert.deepEqual(v.facts, [], '회사 공지 행에는 «바뀔 수 있다» 문구가 없다');
    assert.deepEqual(v.others.map((o) => o.ticker), ['NFLX', 'TSM', 'ABT', 'SAP'], '함께 보기는 이번 주 목록에서 그대로');
    assert.equal(v.canonicalPath, '/ko/earnings-week');
    assert.equal(appEarn('en', 'META').hero!.note, '10/23 expiry · 10/12 session');
    assert.equal(appEarn('ja', 'META').aiLine!.text, 'EPS予想$6.01に対する発表に注目します');
    // OG 카드 묶음 — 기준가 없이 EPS·매출만
    assert.deepEqual(ogCardOf(v, 'ko').stats.map((s) => s.value), ['$6.01', '$51.0B']);
  });
  t('날짜가 회사 공지 전일 수 있으면(est·모름) 그 사실 한 줄 — 앱 실적 화면과 같은 말', () => {
    assert.deepEqual(appEarn('ko', 'AMZN').facts, ['회사 공지 전 — 날짜가 바뀔 수 있습니다']);
    assert.deepEqual(appEarn('ko', 'KO').facts, ['발표일·추정치는 발표 전까지 바뀔 수 있습니다']);
    assert.deepEqual(appEarn('en', 'AMZN').facts, ['Not yet announced by the company — the date may change']);
    assert.deepEqual(appEarn('ja', 'KO').facts, ['発表日・予想は発表まで変わることがあります']);
  });
  t('이번 주 목록에 행이 있으면 그 행이 우선(원천이 바뀌지 않는다) · 앱 원천은 추정치 없는 행도 변동폭만으로 그린다', () => {
    const r = appSourceEarn(OVER, IMPLIED, PACK2, 'META', NOW);
    const v = composeEarn(WEEK, EXTRA, 'TSM', 'ko', NOW, r.alt);       // alt 가 있어도 TSM 은 이번 주 행
    assert.equal(v.hero!.value, '±4.3%'); assert.equal(v.rows[1].value, '$332.99');
    const noEst = appSourceEarn([{ ticker: 'KO', date: '2026-10-21', hour: 'bmo' }], IMPLIED, null, 'KO', NOW);
    const k = composeEarn(WEEK, noEst.extra, 'KO', 'ko', NOW, noEst.alt);
    assert.equal(k.ok, true); assert.equal(k.hero!.value, '±2.4%'); assert.deepEqual(k.rows.map((x) => x.label), ['발표(뉴욕 · 한국)']); assert.equal(k.aiLine, undefined);
  });
  t('그래도 변동폭이 없으면 대체 — 묶음 칸 없음 · 만기 지남 · 전부 지남(발표 완료) · 행 없음 · 둘 다 못 읽음', () => {
    const noCell = appEarn('ko', 'PEP');
    assert.equal(noCell.ok, false); assert.equal(noCell.fallbackReason, 'no-move'); assert.equal(noCell.rows[0].value, '10/21(수) 장전');
    assert.equal(appEarn('ko', 'PEP', OVER, null).fallbackReason, 'no-move', '묶음 자체가 없을 때');
    const expired: ImpliedPack = { ...IMPLIED, cells: { 'KO|2026-10-21': { p: 2.4, e: '2026-10-12', b: 'eod', s: '2026-10-09', r: null } } };
    assert.equal(appEarn('ko', 'KO', OVER, expired).fallbackReason, 'no-move', '만기가 지난 값은 쓰지 않는다(앱과 같은 규칙)');
    const done = appEarn('ko', 'OLD');
    assert.equal(done.fallbackReason, 'done'); assert.ok(done.fallbackText!.includes('10/9(금)'));
    assert.equal(appEarn('ko', 'ZZZ').fallbackReason, 'no-row');
    assert.deepEqual(appSourceEarn(OVER, IMPLIED, PACK2, 'ZZZ', NOW), { alt: null, extra: null });
    assert.deepEqual(appSourceEarn(null, IMPLIED, PACK2, 'META', NOW), { alt: null, extra: null });
    assert.equal(appEarn('ko', 'META', OVER, IMPLIED, null).ok, true, '이번 주 목록을 못 읽어도 앱 원천 행이 있으면 그린다(함께 보기만 빈다)');
    assert.equal(appEarn('ko', 'META', OVER, IMPLIED, null).others.length, 0);
    assert.equal(composeEarn(null, null, 'ZZZ', 'ko', NOW, null).fallbackReason, 'read-failed');
  });
  t('회사 공지 목록에 발표 시각이 있으면 «16:05 ET» 로 — 앱 원천 행도 같다', () => {
    const conf = [{ ticker: 'META', date: '2026-10-22', hour: 'amc', etTime: '16:05' }] as unknown as Parameters<typeof appSourceEarn>[5];
    const r = appSourceEarn(OVER, IMPLIED, PACK2, 'META', NOW, conf);
    assert.equal(composeEarn(WEEK, r.extra, 'META', 'en', NOW, r.alt).headline, 'Reports 10/22 (Thu) 16:05 ET');
  });

  console.log('5. CTA');
  t('href — from=share_<kind> · ref · l(ko/ja만) · code(선물 코드 live 일 때만)', () => {
    const live = giftConfig({ GIFT_PROMO_CODE: CODE }, Date.UTC(2026, 9, 14));
    assert.equal(live.live, true, '시험용 가짜 코드는 형식 규칙을 통과한다');
    for (const kind of SHARE_KINDS as readonly ShareKind[]) {
      const u = new URL(landingCta(kind, 'ko', { ref: REF, gift: live }).href);
      assert.equal(u.origin + u.pathname, 'https://www.signumhq.com/app');
      assert.equal(u.searchParams.get('from'), `share_${kind}`);
      assert.equal(u.searchParams.get('ref'), REF);
      assert.equal(u.searchParams.get('l'), 'ko');
      assert.equal(u.searchParams.get('code'), CODE);
    }
    const ja = new URL(landingCta('earn', 'ja', { ref: REF, gift: live }).href);
    assert.equal(ja.searchParams.get('l'), 'ja');
    const en = new URL(landingCta('line', 'en', { ref: REF, gift: live }).href);
    assert.equal(en.searchParams.get('l'), null, '영어는 기본값이라 l 을 붙이지 않는다');
    assert.equal(en.searchParams.get('from'), 'share_line');
  });
  t('ref 형식 밖(분류 이름·짧음·없음)은 붙이지 않는다 · 대문자는 소문자로 정규화', () => {
    for (const bad of ['google', 'threads', 'abc', '', null, undefined, 'ABCDEFGHIJ']) {
      assert.equal(new URL(landingCta('pick', 'ko', { ref: bad as string | null | undefined }).href).searchParams.get('ref'), null, String(bad));
    }
    assert.equal(new URL(landingCta('pick', 'ko', { ref: REF.toUpperCase() }).href).searchParams.get('ref'), REF);
  });
  t('code 가 없으면(선물 꺼짐·미설정) code 파라미터도 쿠폰 문구도 없다', () => {
    for (const gift of [{ live: false } as const, null, undefined, giftConfig({}, Date.UTC(2026, 9, 14)), giftConfig({ GIFT_PROMO_CODE: CODE }, Date.UTC(2026, 10, 2))]) {
      const c = landingCta('pick', 'ko', { ref: REF, gift });
      assert.equal(new URL(c.href).searchParams.get('code'), null);
      assert.equal(c.codeLine, undefined);
      assert.equal(JSON.stringify(c).includes('PRO'), false, '쿠폰 문구(PRO 1개월 무료)가 없다');
    }
  });
  t('쿠폰 문구 — 받는 사람 관점 · 자동 갱신 고지는 «무료» 문장 안 · 가격 숫자·선착순·남은 수·타이머·전원 증정 없음', () => {
    const live = { live: true, code: CODE } as const;
    assert.equal(landingCta('pick', 'ko', { gift: live }).codeLine, '링크로 설치하면 PRO 1개월 무료 — 이후 자동 갱신, 언제든 해지');
    assert.equal(landingCta('pick', 'en', { gift: live }).codeLine, 'Install via this link for PRO free for the first month — then auto-renews, cancel anytime');
    assert.equal(landingCta('pick', 'ja', { gift: live }).codeLine, 'このリンクから始めるとPRO 1か月無料 — 以降は自動更新、いつでも解約可');
    for (const l of LANGS) {
      const line = landingCta('line', l, { gift: live }).codeLine!;
      assert.doesNotMatch(line, /[.。]\s*\S/, `${l} 한 문장`);
      assert.deepEqual(line.match(/\d+/g) ?? [], l === 'en' ? [] : ['1'], `${l} 숫자는 «1개월» 의 1 뿐(가격 없음)`);
      assert.match(line, /(자동 갱신|auto-renews|自動更新)/);
      assert.doesNotMatch(line, /선착순|전원|남은|타이머|先着|全員|残り|first[- ]come|limited|hurry|everyone|\$|₩|¥/i);
    }
  });
  t('CTA 라벨 — 앱에서 이어 보기 / Continue in the app / アプリで続きを見る', () => {
    assert.equal(landingCta('pick', 'ko').label, '앱에서 이어 보기');
    assert.equal(landingCta('pick', 'en').label, 'Continue in the app');
    assert.equal(landingCta('pick', 'ja').label, 'アプリで続きを見る');
  });

  console.log('6. 문구·OG 카드');
  t('금융 공통어는 ko·ja 화면에서도 번역하지 않는다 — 표/설명 어디에도 번역어가 없다', () => {
    for (const l of LANGS) {
      const all = JSON.stringify([lineView(l), earnView(l), composePick(DOC, false, 'NVDA', l), composePick(DOC, false, 'ZZZ', l)]);
      assert.doesNotMatch(all, /맥스페인|マックスペイン|콜월|コールウォール|풋플로어|プットフロア|감마 플립|ガンマフリップ|맥스 페인/, l);
    }
    assert.ok(lineView('ko').explain[0][0].includes('Max Pain') && lineView('ja').explain[0][0].includes('Put Floor'));
  });
  t('가짜 희소성·후기·수익 약속 단어가 어떤 화면에도 없다', () => {
    const FORBID = /선착순|전원 증정|남은 \d|타이머|한정|先着|全員|残り\d|限定|first[- ]come|limited (time|offer)|while supplies|hurry|testimonial|후기|수익 보장|必ず儲|guaranteed (profit|return)/i;
    const views: LandingView[] = [];
    for (const l of LANGS) {
      views.push(lineView(l), earnView(l), earnView(l, 'GS'), earnView(l, 'ASML'), earnView(l, 'ZZZ'), composePick(DOC, false, 'INTC', l), composePick(DOC, false, 'ZZZ', l), composePick(null, false, 'INTC', l), lineView(l, null));
      for (const k of SHARE_KINDS) views.push(fallbackView(k, 'NVDA', l, 'read-failed'));
    }
    for (const v of views) assert.doesNotMatch(JSON.stringify(v), FORBID, `${v.kind}/${v.lang}/${v.fallbackReason ?? 'ok'}`);
  });
  t('대체 화면도 제목·설명·CTA 가 있고 던지지 않는다 — 읽기 실패 문구 3언어', () => {
    for (const l of LANGS) for (const k of SHARE_KINDS) {
      const v = fallbackView(k, 'NVDA', l, 'read-failed');
      assert.equal(v.ok, false); assert.ok(v.title.includes('SIGNUM HQ') && v.description.length > 10 && v.fallbackText!.length > 10, `${k}/${l}`);
      assert.equal(v.kindName.length > 0, true);
    }
    assert.match(fallbackView('pick', 'X', 'ko', 'read-failed').fallbackText!, /불러오지 못했습니다/);
  });
  t('OG 카드 묶음 — 대체/없음은 «종류 제목 + 브랜드»만, 글자 상한, 글꼴 서브셋에 쓰는 글자가 다 들어간다', () => {
    const none = ogCardOf(null, 'ko');
    assert.equal(none.data, false); assert.equal(none.ticker, ''); assert.equal(none.kindName, '');
    const fb = ogCardOf(composePick(null, false, 'INTC', 'ko'), 'ko');
    assert.equal(fb.data, false); assert.equal(fb.kindName, '오늘 볼 것'); assert.equal(fb.headline, ''); assert.equal(fb.stats.length, 0);
    const line = ogCardOf(lineView('ko'), 'ko');
    assert.equal(line.data, true); assert.equal(line.headlineAi, true); assert.equal(line.aiBadge, true);
    assert.deepEqual(line.stats.map((s) => s.value), ['$229.10', '$215', '$250', '$200']);
    const earn = ogCardOf(earnView('ko'), 'ko');
    assert.equal(earn.hero!.value, '±4.3%'); assert.equal(earn.hero!.note, '10/16 만기 · 10/9 세션');
    assert.deepEqual(earn.stats.map((s) => s.value), ['$332.99', '$2.66', '$34.0B'], '발표 줄은 headline 이 말한다 — 나머지 숫자 3개');
    const pk = ogCardOf(composePick(DOC, false, 'INTC', 'ko'), 'ko');
    assert.equal(pk.chip, '고래 신규 포지션'); assert.equal(pk.aiLine!.ai, true);
    for (const c of [line, earn, pk]) {
      assert.ok(Array.from(c.headline).length <= 80); assert.ok(Array.from(c.aiLine?.text ?? '').length <= 80);
      const g = ogGlyphs(c);
      for (const ch of new Set(Array.from(`${c.ticker}${c.headline}${c.asOf}${c.foot}`))) assert.ok(g.includes(ch), `글꼴 서브셋에 «${ch}» 없음`);
    }
    const long = { ...lineView('ko'), headline: '가'.repeat(300) };
    assert.ok(Array.from(ogCardOf(long, 'ko').headline).length <= 80);
    assert.ok(Array.from(ogCardOf({ ...long, lang: 'en' }, 'en').headline).length <= 140);
  });

  console.log('7. 읽기 — 의존 주입(실서버 0)');
  const calls: string[] = [];
  const deps: LandingDeps = {
    picks: async () => { calls.push('picks'); return { doc: DOC, off: false }; },
    line: async (tk, l) => { calls.push(`line:${tk}:${l}`); const s = storedLine(); return { stored: s, entry: entryOf(s, l), off: false }; },
    earn: async (tk) => { calls.push(`earn:${tk}`); return { week: WEEK, extra: EXTRA }; },
  };
  await ta('종류별로 해당 읽기만 부르고 뷰를 만든다', async () => {
    const p = await loadLanding('pick', 'intc', 'ko', deps, NOW);
    assert.equal(p.ok, true); assert.equal(p.ticker, 'INTC');
    const l = await loadLanding('line', 'NVDA', 'ja', deps, NOW);
    assert.equal(l.headline, '価格はMax Painの6.2%上、Call Wallまで9.1%');
    const e = await loadLanding('earn', 'TSM', 'en', deps, NOW);
    assert.equal(e.hero!.value, '±4.3%');
    assert.deepEqual(calls, ['picks', 'line:NVDA:ja', 'earn:TSM']);
  });
  await ta('티커가 형식 밖이면 읽기를 부르지 않고 bad-input', async () => {
    calls.length = 0;
    for (const k of SHARE_KINDS) { const v = await loadLanding(k, '<x>', 'ko', deps, NOW); assert.equal(v.fallbackReason, 'bad-input'); assert.equal(v.ok, false); }
    assert.deepEqual(calls, []);
  });
  await ta('읽기가 던지면 던지지 않고 read-failed 대체 화면 · 모르는 언어는 영어', async () => {
    const boom: LandingDeps = { picks: async () => { throw new Error('redis down'); }, line: async () => { throw new Error('x'); }, earn: async () => { throw new Error('y'); } };
    for (const k of SHARE_KINDS) { const v = await loadLanding(k, 'NVDA', 'ko', boom, NOW); assert.equal(v.fallbackReason, 'read-failed'); assert.equal(v.ok, false); assert.equal(v.fallbackText, '지금은 이 카드를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.'); }
    assert.equal((await loadLanding('pick', 'INTC', 'fr', deps, NOW)).lang, 'en');
    assert.equal((await loadLanding('pick', 'INTC', undefined, deps, NOW)).lang, 'en');
  });
  t('이 시험은 레디스·AI·서비스 모듈을 올리지 않았다(순수 부분만)', () => {
    assert.deepEqual(loadedServices(), []);
  });

  console.log('8. 실서비스 읽기 경로 — 가짜 레디스·가짜 fetch·AI 금지 (공급사 호출 0 · AI 0 · 쓰기 0)');
  await ta('makeDefaultDeps 로 세 종류를 끝까지 읽는다 — 읽기만, 새 생성 없음', async () => {
    const { makeDefaultDeps } = await import('../src/lib/invite/landing');
    const store = new Map<string, unknown>();
    const reads: string[] = [];
    const writes: string[] = [];
    const fetches: string[] = [];
    (globalThis as { fetch: unknown }).fetch = async (u: unknown) => { fetches.push(String(u)); throw new Error('network blocked in test'); };
    const stubMod = (rel: string, exports: object) => { const p = require.resolve(rel); require.cache[p] = { id: p, filename: p, loaded: true, exports } as unknown as NodeJS.Module; };
    const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
    stubMod('../src/services/redisClient', {
      getFromCache: async (k: string) => { reads.push(k); return store.has(k) ? clone(store.get(k)) : null; },
      mgetFromCache: async (ks: string[]) => { reads.push(...ks); return ks.map((k) => (store.has(k) ? clone(store.get(k)) : null)); },
      setInCache: async (k: string) => { writes.push(k); return true; },
      deleteFromCache: async (k: string) => { writes.push(`del:${k}`); return true; },
    });
    const boom = (what: string) => async () => { throw new Error(`${what} must not be called`); };
    stubMod('../src/services/bedrockClient', { callBedrock: boom('AI') });
    stubMod('../src/services/darkPool', { getDarkPoolBatchChecked: boom('dark pool vendor') });
    stubMod('../src/services/impliedMoveService', { readImpliedMoveRows: boom('implied move vendor') });
    stubMod('../src/services/watchlistBatchService', { processWatchlistBatch: boom('watchlist batch (generation)') });
    stubMod('../src/services/earningsWeekService', { getEarningsWeek: async () => WEEK });
    const { EARNINGS_CALENDAR_CACHE_KEY } = await import('../src/services/earningsCalendarService');
    const { EARNINGS_BRIEF_KEY } = await import('../src/lib/earnings/earningsBrief');
    const { TP_KEYS } = await import('../src/services/todayPicksService');
    const { lineKey } = await import('../src/services/watchlistAiLineService');

    store.set(TP_KEYS.latest, { ...DOC, at: Date.now() - 3600_000 });
    store.set(lineKey('NVDA'), storedLine());
    store.set(EARNINGS_CALENDAR_CACHE_KEY, { ok: true, rows: CAL_ROWS });
    store.set(EARNINGS_BRIEF_KEY, PACK);

    const deps = makeDefaultDeps();
    const pk = await loadLanding('pick', 'INTC', 'ko', deps);
    assert.equal(pk.ok, true); assert.equal(pk.chip, '고래 신규 포지션');
    const ln = await loadLanding('line', 'NVDA', 'ko', deps);
    assert.equal(ln.ok, true); assert.equal(ln.headline, '가격이 Max Pain 6.2% 위, Call Wall까지 9.1%');
    assert.deepEqual(ln.rows.map((r) => r.value), ['$229.10', '$215', '$250', '$200']);
    const er = await loadLanding('earn', 'TSM', 'ko', deps, NOW);
    assert.equal(er.ok, true); assert.equal(er.hero!.value, '±4.3%'); assert.equal(er.name, 'TSMC');
    assert.deepEqual(er.rows.slice(2).map((r) => r.value), ['$2.66', '$34.0B']);
    assert.ok(er.aiLine!.text.includes('$2.66'));

    // 저장본이 없으면 «생성하지 않고» 대체 화면
    const none = await loadLanding('line', 'AMD', 'ko', deps);
    assert.equal(none.fallbackReason, 'no-line');
    store.delete(TP_KEYS.latest);
    assert.equal((await loadLanding('pick', 'INTC', 'ko', deps)).fallbackReason, 'no-list');
    // 끄기 스위치
    store.set(TP_KEYS.latest, { ...DOC, at: Date.now() }); store.set(TP_KEYS.off, '1'); store.set('wlai:off', '1');
    assert.equal((await loadLanding('pick', 'INTC', 'ko', deps)).fallbackReason, 'off');
    assert.equal((await loadLanding('line', 'NVDA', 'ko', deps)).fallbackReason, 'off');


    // ── 이번 주 목록 밖 종목 — 앱과 같은 원천(캘린더 캐시 + 변동폭 묶음 + 브리프 팩)을 읽기만 한다 ──
    const { etDateOf } = await import('../src/lib/marketCalendar');
    const { CONFIRMED_EARNINGS } = await import('../src/lib/earningsConfirmed');
    // 갱신·생성·공급사로 가는 문은 불리면 시험이 실패하도록 막아 둔다
    const forbidden: string[] = [];
    const trap = (mod: string, names: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const m = require(mod) as Record<string, unknown>;
      for (const k of names) m[k] = async () => { forbidden.push(`${mod}#${k}`); throw new Error(`${k} must not be called`); };
    };
    trap('../src/services/earningsCalendarService', ['getMarketEarningsCalendar', 'earningsCalendarRowsFor', 'unifyEarningsList']);
    trap('../src/services/earningsImpliedService', ['refreshImpliedPack', 'buildImpliedPack']);
    const T = 'ZZQA';
    assert.equal(CONFIRMED_EARNINGS.some((c) => c.ticker === T), false, '시험 티커는 회사 공지 목록에 없다');
    const real = Date.now();
    const ymd = (days: number) => etDateOf(real + days * 86_400_000);
    const d1 = ymd(10), ex = ymd(12), sess = ymd(-1);
    store.set(EARNINGS_CALENDAR_CACHE_KEY, { ok: true, rows: [...CAL_ROWS, { ticker: T, date: d1, hour: 'bmo', epsEstimate: 1.25, revenueEstimate: 2.5e9, quarter: 3, year: 2026 }] });
    store.set(EARNINGS_BRIEF_KEY, { entries: { ...PACK.entries, [`${T}|${d1}`]: { ko: { name: '시험회사', watch: 'EPS 추정 {EPS} 대비 발표를 지켜봅니다' } } } });
    store.set(EARNINGS_IMPLIED_KEY, { v: 1, at: real - 600_000, day: etDateOf(real), cells: { [`${T}|${d1}`]: { p: 7.4, e: ex, b: 'eod', s: sess, r: null } } });
    const alt = await loadLanding('earn', T, 'ko', deps);
    assert.equal(alt.ok, true, JSON.stringify([alt.fallbackReason, alt.fallbackText]));
    assert.equal(alt.hero!.value, '±7.4%'); assert.equal(alt.name, '시험회사');
    assert.deepEqual(alt.rows.slice(1).map((r) => r.value), ['$1.25', '$2.5B']);
    assert.ok(alt.aiLine!.text.includes('$1.25'));
    assert.equal(alt.facts.length, 1, '공지 목록 밖 날짜는 «바뀔 수 있다» 한 줄');
    store.delete(EARNINGS_IMPLIED_KEY);
    assert.equal((await loadLanding('earn', T, 'ko', deps)).fallbackReason, 'no-move', '묶음이 없으면 대체 — 새로 만들지 않는다');
    assert.equal((await loadLanding('earn', 'ZZQB', 'ko', deps)).fallbackReason, 'no-row');

    assert.deepEqual(forbidden, [], '캘린더 만들기(getMarketEarningsCalendar)·변동폭 묶음 갱신(refreshImpliedPack)은 부르지 않는다');
    assert.deepEqual(writes, [], '레디스 쓰기 0');
    assert.deepEqual(fetches, [], '공급사·네트워크 호출 0');
    assert.ok(reads.includes(EARNINGS_CALENDAR_CACHE_KEY) && reads.includes(EARNINGS_BRIEF_KEY), '캘린더 «캐시»를 읽는다(getMarketEarningsCalendar 를 부르지 않는다)');
  });

  console.log(`\ninviteLanding: ${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
