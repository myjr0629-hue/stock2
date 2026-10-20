/**
 * «내 종목» AI 한 줄(2026-10-12) — 사실 만들기 · 출구 가드 · 자르기 · 화면 채우기/지형 판정 · 저장(캐시) · 실패 폴백 · 읽기 라우트 · 화면 쪽 읽기
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/watchlistAiLine.test.ts
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

// ── 모듈 바꿔 끼우기(서비스·라우트 import 보다 먼저): next/server after · 레디스(메모리) · 묶음 서비스(고정 행) · AI 호출(대본) ──
const afterCalls: Array<() => unknown> = [];
const nsPath = require.resolve('next/server');
const realNs = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...realNs, after: (fn: () => unknown) => { afterCalls.push(fn); } } } as unknown as Module;

const store = new Map<string, unknown>();
const ttls = new Map<string, number | undefined>();
const rcPath = require.resolve('../src/services/redisClient');
require.cache[rcPath] = {
  id: rcPath, filename: rcPath, loaded: true,
  exports: {
    getFromCache: async (k: string) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
    mgetFromCache: async (ks: string[]) => ks.map((k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null)),
    setInCache: async (k: string, v: unknown, ttl?: number) => { store.set(k, JSON.parse(JSON.stringify(v))); ttls.set(k, ttl); return true; },
  },
} as unknown as Module;

const batchRows: Record<string, any> = {};
let batchCalls = 0;
const bsPath = require.resolve('../src/services/watchlistBatchService');
require.cache[bsPath] = {
  id: bsPath, filename: bsPath, loaded: true,
  exports: {
    processWatchlistBatch: async (tickers: string[]) => {
      batchCalls++;
      return { results: tickers.filter((t) => batchRows[t]).map((t) => ({ ticker: t, realtime: JSON.parse(JSON.stringify(batchRows[t])) })), meta: {} };
    },
  },
} as unknown as Module;

import { FreshTierSkipped, inFreshTier } from '../src/lib/ai/freshTier';
type Script = { text?: string; throwSkip?: boolean; throwErr?: boolean };
const script: Script[] = [];
let aiCalls = 0;
let lastPrompt = '';
let sawFresh = false;
const bcPath = require.resolve('../src/services/bedrockClient');
require.cache[bcPath] = {
  id: bcPath, filename: bcPath, loaded: true,
  exports: {
    callBedrock: async (o: any) => {
      aiCalls++;
      lastPrompt = o.userPrompt;
      sawFresh = inFreshTier();
      const s = script.shift() ?? { throwSkip: true };
      if (s.throwErr) throw new Error('boom');
      if (s.throwSkip) throw new FreshTierSkipped(['a55:cap']);
      // 사다리처럼 validate 를 건다 — 못 넘으면 크레딧 전용 등급이라 «건너뜀»으로 던진다
      const g = o.validate ? o.validate(s.text!) : true;
      if (g && typeof g === 'object' && !g.ok) throw new FreshTierSkipped(['a55:guard', 'a55:guard']);
      return { text: s.text!, model: 'claude-haiku-5.5', usedFallback: false, elapsedMs: 1200, provider: 'a55' };
    },
  },
} as unknown as Module;

import { buildLineFacts, checkLineOutput, trimLine, normalizeLine, lineLength, WL_LINE_SYSTEM, buildLineUserPrompt } from '../src/lib/ai/watchlistLine';
import { aiLineState, fillAiLine, sideOf, sidesFor, distPct, fmtDistPct, type AiLineEntry } from '../src/lib/app/watchlistAiLine';
import { generateLines, readLines, entryOf, storedMatchesFacts, lineKey, failKey, WL_AI_TTL_SEC } from '../src/services/watchlistAiLineService';
import { LADDER_PURPOSES, TRACKED_PURPOSES } from '../src/lib/ai/llmLadder';
import { FUNNEL_STAGES, FUNNEL_SRCS } from '../src/lib/app/funnelSchema';
const route = require('../src/app/api/watchlist/ai-line/route');

let n = 0;
const tests: Array<[string, () => unknown]> = [];
const t = (name: string, fn: () => unknown) => tests.push([name, fn]);

// 운영 실측 행(2026-10-12 프리마켓, /api/watchlist/batch?mode=price&tickers=NVDA) — 프리장이라 화면 현물은 시간외 가격 229.75
const NVDA = {
  price: 229.28, session: 'pre', extendedPrice: 229.75,
  maxPain: 215, callWall: 250, putFloor: 220, gammaFlipLevel: 220,
  levelsChainDate: '2026-10-09', levelsExpiration: '2026-10-16', levelsSource: 'structure', levelsStaleReason: null, levelsRefPrice: 229.75,
  darkPoolPct: 43.8, darkPoolDate: '2026-10-09',
  impliedMovePct: 3.2, impliedMoveDef: 'atm-straddle-mid/1', impliedMoveExpiry: '2026-10-16',
  pcr: 0.74, gex: 214395616,
};
const GOOD = JSON.stringify({
  ko: 'Put Floor $220 위 {PF} · Max Pain $215 위 {MP} · 장외 비중 43.8%',
  en: '{PF} above Put Floor $220 · {MP} above Max Pain $215 · off-exchange 43.8%',
  ja: 'Put Floor $220の{PF}上 · Max Pain $215の{MP}上 · 場外比率43.8%',
  insight: { ko: '장외 비중은 방향 미확정, 감마 방어가 변수', en: 'Off-exchange share cannot confirm gamma support', ja: '場外比率だけで方向不明、ガンマ防御の維持が焦点' },
});

// ━━━ 1. 사실 ━━━
t('사실: 지도 조건과 같다 — 구조 한 벌·세 레벨·체인 날짜 · 가까운 레벨부터 · 프리장은 시간외 가격', () => {
  const f = buildLineFacts('nvda', NVDA)!;
  assert.equal(f.ticker, 'NVDA');
  assert.equal(f.spot, 229.75);
  assert.equal(f.chain, '2026-10-09');
  assert.deepEqual(f.order, ['pf', 'gf', 'mp', 'cw']);
  assert.deepEqual(f.sides, { mp: 'a', cw: 'b', pf: 'a', gf: 'a' });
  assert.match(f.factsText, /Max Pain \$215: price is ABOVE Max Pain — distance placeholder \{MP\}/);
  assert.match(f.factsText, /positive gamma zone/);
  assert.match(f.factsText, /Off-exchange share \(FINRA\) on 10\/9: 43\.8%/);
  assert.match(f.factsText, /implied move to the 10\/16 expiry: ±3\.2%/);
  assert.match(f.factsText, /inside the Put Floor–Call Wall range/);
  // P/C·GEX 크기는 싣지 않는다(정의 미확정·원천 다름)
  assert.doesNotMatch(f.factsText, /0\.74|214|P\/C|GEX/);
  // 거리 숫자는 사실에 없다 — 모델이 써도 숫자 대조에서 떨어진다
  assert.doesNotMatch(f.factsText, /4\.2|6\.4|8\.8/);
});
t('사실: 지도가 안 서는 행은 null(줄 없음) — 레벨 하나 없음·출처 다름·공급사 지연·가격 없음·체인 날짜 없음', () => {
  assert.equal(buildLineFacts('X', { ...NVDA, callWall: null }), null);
  assert.equal(buildLineFacts('X', { ...NVDA, levelsSource: 'analysis' }), null);
  assert.equal(buildLineFacts('X', { ...NVDA, levelsStaleReason: 'supplier-delay' }), null);
  assert.equal(buildLineFacts('X', { ...NVDA, price: null, extendedPrice: null }), null);
  assert.equal(buildLineFacts('X', { ...NVDA, levelsChainDate: null }), null);
  assert.equal(buildLineFacts('X', null), null);
  // Gamma Flip 은 없어도 된다(지도와 같다) · 정의 표식 없는 예상 변동은 버린다
  const f = buildLineFacts('X', { ...NVDA, gammaFlipLevel: null, impliedMoveDef: null })!;
  assert.deepEqual(f.order, ['pf', 'mp', 'cw']);
  assert.equal(f.implied, null);
});
t('사실: 레벨 위에 있으면(0.1% 안) 그 레벨의 자리표를 주지 않는다', () => {
  const f = buildLineFacts('X', { ...NVDA, session: 'reg', price: 220.1, extendedPrice: null })!;
  assert.equal(f.sides.pf, 'at');
  assert.match(f.factsText, /Put Floor \$220: price is AT this level/);
  assert.doesNotMatch(f.factsText, /\{PF\}/);
});
t('프롬프트: 시스템 예시 숫자는 근거가 아니다(FACTS 만 근거) · 사용자 글 = FACTS', () => {
  const f = buildLineFacts('NVDA', NVDA)!;
  assert.ok(WL_LINE_SYSTEM.includes('$180'));
  assert.ok(buildLineUserPrompt(f).startsWith(f.factsText));
  const copied = JSON.stringify({ ko: 'Max Pain $180 위 {MP}', en: '{MP} above Max Pain $180', ja: 'Max Pain $180の{MP}上' });
  const c = checkLineOutput(copied, f);
  assert.equal(c.ok, false);
  assert.ok(c.reasons.some((r) => r === 'ko:number:$180'), c.reasons.join());
});

// ━━━ 2. 출구 가드 ━━━
const F = () => buildLineFacts('NVDA', NVDA)!;
t('가드: 정상 글 통과(세 언어)', () => {
  const c = checkLineOutput(GOOD, F());
  assert.equal(c.ok, true, c.reasons.join());
  assert.equal(c.text!.ko, 'Put Floor $220 위 {PF} · Max Pain $215 위 {MP} · 장외 비중 43.8%');
});
t('가드: 지어낸 숫자(거리 직접 계산·입력에 없는 가격) → 실패', () => {
  const bad = JSON.stringify({ ko: 'Max Pain $215 위 6.4% · Call Wall $250', en: '{MP} above Max Pain $215', ja: 'Max Pain $215の{MP}上' });
  const c = checkLineOutput(bad, F());
  assert.equal(c.ok, false);
  assert.ok(c.reasons.includes('ko:number:6.4%'), c.reasons.join());
  const bad2 = JSON.stringify({ ko: 'Max Pain $216 위 {MP}', en: '{MP} above Max Pain $215', ja: 'Max Pain $215の{MP}上' });
  const r2 = checkLineOutput(bad2, F()).reasons;
  assert.ok(r2.includes('ko:price:$216'), r2.join());
});
t('가드: 금지어(권유·예측·목표) — 세 언어 · 공매도·空売り·예상 변동은 통과', () => {
  const mk = (ko: string, en = '{MP} above Max Pain $215', ja = 'Max Pain $215の{MP}上') => checkLineOutput(JSON.stringify({ ko, en, ja }), F());
  for (const w of ['매수 구간', '매도 압력', '추천', '목표가', '예측', '상승 전망', '예상 상단', '기회']) {
    const c = mk(`Max Pain $215 위 {MP} · ${w}`);
    assert.equal(c.ok, false, w);
    assert.ok(c.reasons.some((r) => r.startsWith('ko:forbidden')), `${w}: ${c.reasons.join()}`);
  }
  assert.equal(mk('Max Pain $215 위 {MP}', '{MP} above Max Pain $215, a buy zone').ok, false);
  assert.equal(mk('Max Pain $215 위 {MP}', 'price will test Max Pain $215 {MP}').ok, false);
  assert.equal(mk('Max Pain $215 위 {MP}', '{MP} above Max Pain $215', 'Max Pain $215の{MP}上 · 買いシグナル').ok, false);
  assert.equal(mk('Max Pain $215 위 {MP}', '{MP} above Max Pain $215', 'Max Pain $215の{MP}上 · 上昇予想').ok, false);
  assert.equal(mk('Max Pain $215 위 {MP} · 공매도 아님').ok, true);
  assert.equal(mk('Max Pain $215 위 {MP} · 옵션 예상 변동 ±3.2%').ok, true);
});
t('가드: 자리표 — 모르는 것·두 번·레벨 위(at) 레벨·짝 안 맞는 중괄호', () => {
  const mk = (ko: string, f = F()) => checkLineOutput(JSON.stringify({ ko, en: '{MP} above Max Pain $215', ja: 'Max Pain $215の{MP}上' }), f);
  assert.ok(mk('Max Pain $215 위 {XX}').reasons.includes('ko:placeholder:{XX}'));
  assert.ok(mk('Max Pain $215 위 {MP} · 다시 {MP}').reasons.includes('ko:placeholder-twice:{MP}'));
  assert.ok(mk('Max Pain $215 위 {MP} }').reasons.includes('ko:stray-brace'));
  const atF = buildLineFacts('X', { ...NVDA, session: 'reg', price: 220.1, extendedPrice: null })!;
  assert.ok(mk('Put Floor $220 위 {PF}', atF).reasons.includes('ko:placeholder:{PF}'));
});
t('가드: 언어 — 한국어 칸 영어만·일본어 칸 한글·영어 칸 가나 → 실패 · JSON 깨짐 → 실패', () => {
  const r1 = checkLineOutput(JSON.stringify({ ko: '{MP} above Max Pain $215', en: '{MP} above Max Pain $215', ja: 'Max Pain $215の{MP}上' }), F());
  assert.ok(r1.reasons.includes('ko:no-hangul'));
  const r2 = checkLineOutput(JSON.stringify({ ko: 'Max Pain $215 위 {MP}', en: '{MP} above Max Pain $215', ja: 'Max Pain $215 위 {MP}' }), F());
  assert.ok(r2.reasons.includes('ja:has-hangul'));
  const r3 = checkLineOutput(JSON.stringify({ ko: 'Max Pain $215 위 {MP}', en: 'Max Pain $215の{MP}上', ja: 'Max Pain $215の{MP}上' }), F());
  assert.ok(r3.reasons.includes('en:not-latin'));
  assert.deepEqual(checkLineOutput('{"ko":"Max Pain', F()).reasons, ['json']);
  assert.ok(checkLineOutput(JSON.stringify({ ko: 'Max Pain $215 위 {MP}', en: '' , ja: 'Max Pain $215の{MP}上' }), F()).reasons.includes('en:empty'));
});
t('가드: 음차 지표 이름은 영어로 되돌린다(콜월·マックスペイン) · 따옴표·마침표·다른 구분점 정리', () => {
  assert.equal(normalizeLine('«맥스페인 $215 위 {MP} | 콜월 $250까지 {CW}.»'), 'Max Pain $215 위 {MP} · Call Wall $250까지 {CW}');
  const c = checkLineOutput(JSON.stringify({ ko: '맥스 페인 $215 위 {MP}', en: '{MP} above Max Pain $215', ja: 'マックスペイン$215の{MP}上' }), F());
  assert.equal(c.ok, true, c.reasons.join());
  assert.equal(c.text!.ko, 'Max Pain $215 위 {MP}');
  assert.equal(c.text!.ja, 'Max Pain $215の{MP}上');
});
t('가드: 가격의 쪽(위/아래)이 사실과 다르면 실패 — 운영 표본 AMZN «Put Floor $250 아래»(사실은 위) · 감마 구간 · 말줄임', () => {
  const mk = (ko: string, en = '{MP} above Max Pain $215', ja = 'Max Pain $215の{MP}上') => checkLineOutput(JSON.stringify({ ko, en, ja }), F());
  assert.ok(mk('Max Pain $215 위 {MP} · Put Floor $220 아래 {PF}').reasons.includes('ko:side:Put Floor $220 아래'));
  assert.ok(mk('Max Pain $215 위 {MP}', '{MP} below Max Pain $215').reasons.includes('en:side:below Max Pain $215'));
  assert.ok(mk('Max Pain $215 위 {MP}', '{MP} above Max Pain $215', 'Max Pain $215の{MP}下').reasons.some((r) => r.startsWith('ja:side:')));
  assert.ok(mk('Max Pain $215 위 {MP} · 음(−) 감마 구간').reasons.includes('ko:side:음(−)'));
  assert.ok(mk('Max Pain $215 위 {MP}', '{MP} above Max Pain $215 · negative gamma zone').reasons.includes('en:side:negative gamma'));
  assert.equal(mk('Call Wall $250까지 {CW} · Gamma Flip $220 위 {GF}, 양(+) 감마 구간', '{CW} below Call Wall $250 · positive gamma zone', 'Call Wall $250まで{CW} · 正ガンマ圏').ok, true);
  assert.ok(mk('Call Wall $250 위 {CW}').reasons.includes('ko:side:Call Wall $250 위'));
  assert.ok(mk('Max Pain $215 위 {MP} · Put Floor $250 아래 {PF}…').reasons.includes('ko:ellipsis'));
});
t('자르기: 넘치면 뒤 조각부터 덜어 낸다(글자 중간은 자르지 않는다) · 조각 하나로도 넘치면 null', () => {
  const long = 'Put Floor $220 위 {PF} · Max Pain $215 위 {MP} · Call Wall $250까지 {CW}';
  assert.ok(lineLength(long) > 60);
  assert.equal(trimLine(long, 'ko'), 'Put Floor $220 위 {PF} · Max Pain $215 위 {MP}');
  assert.equal(trimLine('가'.repeat(70), 'ko'), null);
  // 마지막 조각의 덧붙인 구절부터 덜어 낸다(운영 표본 TSLA 한국어가 조각째 잘려 한 조각만 남았다)
  assert.equal(trimLine('Put Floor $380 위 {PF} · Gamma Flip $385 아래 {GF}, 음(−) 감마 구간', 'ko'), 'Put Floor $380 위 {PF} · Gamma Flip $385 아래 {GF}');
  const c = checkLineOutput(JSON.stringify({ ko: long, en: '{MP} above Max Pain $215', ja: 'Max Pain $215の{MP}上' }), F());
  assert.equal(c.ok, true, c.reasons.join());
  assert.equal(c.text!.ko, 'Put Floor $220 위 {PF} · Max Pain $215 위 {MP}');
});

// ━━━ 3. 화면 채우기·지형 판정 ━━━
const entry: AiLineEntry = {
  text: 'Max Pain $215 위 {MP} · Call Wall $250까지 {CW}', chain: '2026-10-09',
  lv: { mp: 215, cw: 250, pf: 220, gf: 220 }, sides: { mp: 'a', cw: 'b', pf: 'a', gf: 'a' }, at: 1,
};
const row = (price: number, over: Partial<{ maxPain: number; callWall: number; putFloor: number; gammaFlipLevel: number | null; chainDate: string }> = {}) => ({
  price, maxPain: 215, callWall: 250, putFloor: 220, gammaFlipLevel: 220 as number | null, chainDate: '2026-10-09', ...over,
});
t('채우기: 자리표를 «지금 가격» 거리로 — 가격이 움직이면 숫자도 따라간다(지도와 같은 가격)', () => {
  assert.equal(fillAiLine(entry, row(229.75)), 'Max Pain $215 위 6.4% · Call Wall $250까지 8.8%');
  assert.equal(fillAiLine(entry, row(235)), 'Max Pain $215 위 8.5% · Call Wall $250까지 6.4%');
  assert.equal(fmtDistPct(distPct(200, 210)), '5.0%');
});
t('지형 판정: 새 체인·레벨 변경·가격이 레벨을 건넘 → stale(그리지 않음) · 글/가격 없음 → none', () => {
  assert.equal(aiLineState(entry, row(229.75)), 'ok');
  assert.equal(aiLineState(entry, row(229.75, { chainDate: '2026-10-12' })), 'stale');
  assert.equal(aiLineState(entry, row(229.75, { callWall: 255 })), 'stale');
  assert.equal(aiLineState(entry, row(229.75, { gammaFlipLevel: null })), 'stale');
  assert.equal(aiLineState(entry, row(251)), 'stale');      // Call Wall 위로
  assert.equal(aiLineState(entry, row(219)), 'stale');      // Put Floor·Gamma Flip 아래로
  assert.equal(aiLineState(entry, row(220.1)), 'stale');    // Put Floor 위(0.1% 안) = 'at'
  assert.equal(fillAiLine(entry, row(251)), null);
  assert.equal(aiLineState(null, row(229.75)), 'none');
  assert.equal(aiLineState(entry, { ...row(229.75), price: null }), 'none');
  assert.equal(sideOf(220.1, 220), 'at');
  assert.deepEqual(sidesFor(229.75, { mp: 215, cw: 250, pf: 220, gf: null }), { mp: 'a', cw: 'b', pf: 'a' });
});
t('채우기: 값이 없는 레벨의 자리표·모르는 중괄호가 남으면 그리지 않는다', () => {
  const e2: AiLineEntry = { ...entry, text: 'Gamma Flip $220 위 {GF}', lv: { ...entry.lv, gf: null }, sides: { mp: 'a', cw: 'b', pf: 'a' } };
  assert.equal(fillAiLine(e2, row(229.75, { gammaFlipLevel: null })), null);
  const e3: AiLineEntry = { ...entry, text: 'Max Pain $215 위 {MP} {X}' };
  assert.equal(fillAiLine(e3, row(229.75)), null);
});

// ━━━ 4. 저장(캐시)·생성·실패 폴백 ━━━
t('사다리: WatchlistLine 은 추적·허용 목록에 있고 사고 끔·시간 12초·가드 실패 시 크레딧 한 번 더', () => {
  assert.ok(TRACKED_PURPOSES.includes('WatchlistLine'));
  assert.deepEqual(LADDER_PURPOSES.WatchlistLine, { effort: 'low', thinking: 'disabled', timeoutMs: 12_000, retries: 1 });
});
t('측정: 퍼널 닫힌 목록에 ai_seen·ai_tap·wl_ai', () => {
  assert.ok(FUNNEL_STAGES.includes('ai_seen' as any) && FUNNEL_STAGES.includes('ai_tap' as any));
  assert.ok(FUNNEL_SRCS.includes('wl_ai' as any));
});

async function asyncTests() {
  const reset = () => { store.clear(); ttls.clear(); script.length = 0; aiCalls = 0; batchCalls = 0; delete process.env.WL_AI_LINE_OFF; delete process.env.WL_AI_LINE_DAILY_CAP; };
  const at = async (name: string, fn: () => Promise<void>) => { reset(); await fn(); n++; console.log('ok -', name); };
  batchRows.NVDA = NVDA;
  batchRows.AAPL = { ...NVDA, price: 336.64, extendedPrice: 336.05, maxPain: 325, callWall: 340, putFloor: 300, gammaFlipLevel: 340, darkPoolPct: 40.4 };
  batchRows.THIN = { ...NVDA, callWall: null };   // 지도가 안 서는 종목

  await at('생성: 크레딧 전용 등급으로 부르고 저장(36시간) — 다음 읽기에 세 언어 · 종목 단위', async () => {
    script.push({ text: GOOD });
    const r = await generateLines(['NVDA']);
    assert.equal(r.out.NVDA, 'generated');
    assert.equal(aiCalls, 1);
    assert.equal(sawFresh, true, 'withFreshTier 안에서 불러야 AWS 로 넘어가지 않는다');
    assert.ok(lastPrompt.includes('FACTS — NVDA'));
    const s: any = store.get(lineKey('NVDA'));
    assert.equal(s.v, 1);
    assert.equal(s.chain, '2026-10-09');
    assert.equal(s.provider, 'a55');
    assert.equal(ttls.get(lineKey('NVDA')), WL_AI_TTL_SEC);
    const { lines } = await readLines(['NVDA']);
    assert.equal(entryOf(lines.NVDA, 'ja')!.text, 'Put Floor $220の{PF}上 · Max Pain $215の{MP}上 · 場外比率43.8%');
    assert.equal(entryOf(lines.NVDA, 'ko')!.chain, '2026-10-09');
  });
  await at('인사이트: 캐시 입출구·깨진 글/혼용 차단·실패 시 정상본 보존', async () => {
    script.push({ text: GOOD });
    await generateLines(['NVDA']);
    const saved: any = store.get(lineKey('NVDA'));
    assert.equal(entryOf(saved, 'ko')?.insight, JSON.parse(GOOD).insight.ko);
    assert.equal(entryOf({ ...saved, text: { ...saved.text, ko: saved.text.ko + '\uFFFD' } }, 'ko'), null);
    assert.equal(entryOf({ ...saved, text: { ...saved.text, ko: 'English prose mixed with one word 위' } }, 'ko'), null);
    assert.equal(entryOf({ ...saved, insight: { ...saved.insight, ko: saved.insight.ko + '\u0000' } }, 'ko')?.insight, undefined);
    script.push({ text: JSON.stringify({ ...JSON.parse(GOOD), insight: { ...JSON.parse(GOOD).insight, ko: '없는 사건을 지어낸 연준 금리 인하' } }) });
    store.delete('wlai:lock:NVDA');
    const r = await generateLines(['NVDA'], { force: true });
    assert.equal(r.out.NVDA, 'guard');
    assert.deepEqual(store.get(lineKey('NVDA')), saved);
  });

  await at('입력: 뉴스 펄스·회사 공지 보정 실적 캐시 중 해당 종목만 합성', async () => {
    const now = new Date().toISOString();
    store.set('guardian:news:digest:v2', { items: [
      { headline: 'NVDA supply agreement announced', publishedAt: now },
      { headline: 'OTHER irrelevant headline', publishedAt: now },
    ] });
    script.push({ text: GOOD });
    await generateLines(['NVDA']);
    assert.ok(lastPrompt.includes('NVDA supply agreement announced'));
    assert.ok(!lastPrompt.includes('OTHER irrelevant headline'));
    assert.ok(lastPrompt.includes('FINRA off-exchange share on 2026-10-09'));
  });

  await at('회귀: A/ET 무관 뉴스 제외·짧은 티커 태그만·경제 일정은 시장 맥락만', async () => {
    for (const ticker of ['A', 'ET']) {
      batchRows[ticker] = NVDA;
      const now = new Date().toISOString();
      store.set('guardian:news:digest:v2', { items: [
        { headline: 'A new Apple product launch', publishedAt: now },
        { headline: 'CPI report at 08:30 ET', publishedAt: now },
        { headline: 'Tagged company announcement', symbols: [ticker], publishedAt: now },
      ] });
      const day = new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      store.set('fmp:econ-calendar', { updatedAt: now, events: [{ date: day, time: '08:30', event: 'Economic release at 08:30 ET' }] });
      script.push({ text: GOOD });
      await generateLines([ticker]);
      assert.doesNotMatch(lastPrompt, /A new Apple product launch|CPI report/);
      assert.match(lastPrompt, /Tagged company announcement/);
      assert.match(lastPrompt, /MARKET CONTEXT ONLY \(not company evidence\): \[economic calendar;/);
    }
  });

  await at('관문 회귀: 내 종목 경제 일정 UTC→ET, 여름·겨울 경과 시 예정 근거 제거', async () => {
    const clock = Date.now;
    try {
      for (const [day, et] of [['2026-10-20', '08:30'], ['2026-12-01', '07:30']]) {
        let iso = `${day}T12:00:00Z`;
        Date.now = () => Date.parse(iso);
        store.clear();
        store.set('fmp:econ-calendar', { updatedAt: iso, events: [{ date: day, time: '12:30', event: 'Fixed macro release' }] });
        script.push({ text: GOOD });
        assert.equal((await generateLines(['NVDA'])).out.NVDA, 'generated');
        assert.match(lastPrompt, new RegExp(`MARKET CONTEXT ONLY.*${day} ${et} ET.*Fixed macro release`));
        assert.doesNotMatch(lastPrompt, /12:30 ET/);
        iso = `${day}T14:00:00Z`;
        store.delete('wlai:lock:NVDA');
        script.push({ text: GOOD });
        // 일정 경과는 입력 해시도 바꾸므로 같은 지형의 정기 확인에서도 옛 예정 근거를 재사용하지 않는다.
        assert.equal((await generateLines(['NVDA'], { cachedContextOnly: ['NVDA'] })).out.NVDA, 'generated');
        assert.doesNotMatch(lastPrompt, /Fixed macro release|12:30 ET/);
      }
    } finally { Date.now = clock; }
  });

  await at('회귀: WFC 08:00 ET 입력에는 07:00 발표됨·실제치, 타 종목 실적 제외', async () => {
    const clock = Date.now;
    Date.now = () => Date.parse('2026-10-13T12:00:00Z');
    try {
      batchRows.WFC = NVDA;
      store.set('market:earnings-calendar:v4', { generatedAt: new Date(Date.now()).toISOString(), rows: [
        { ticker: 'WFC', date: '2026-10-13', hour: 'bmo', epsActual: 1.6 },
        { ticker: 'OTHER', date: '2026-10-13', hour: 'amc' },
      ] });
      script.push({ text: GOOD });
      await generateLines(['WFC']);
      assert.match(lastPrompt, /07:00 ET\] WFC \(released; epsActual=1.6/);
      assert.doesNotMatch(lastPrompt, /WFC \(.*scheduled|OTHER/);
    } finally { Date.now = clock; }
  });

  await at('비용 회귀: 15분 입력 재확인 4회에도 모델 1회·새 뉴스 때만 재생성', async () => {
    const clock = Date.now;
    let now = clock();
    Date.now = () => now;
    try {
      script.push({ text: GOOD });
      await generateLines(['NVDA']);
      const generatedAt = (store.get(lineKey('NVDA')) as any).at;
      for (let i = 0; i < 4; i++) {
        now += 16 * 60_000;
        store.delete('wlai:lock:NVDA');
        assert.equal((await generateLines(['NVDA'], { cachedContextOnly: ['NVDA'] })).out.NVDA, 'fresh');
        assert.equal(entryOf(store.get(lineKey('NVDA')) as any, 'ko')?.insight, JSON.parse(GOOD).insight.ko);
        const j = await (await route.GET(new Request('http://x/api/watchlist/ai-line?t=NVDA&loc=ko'))).json();
        assert.deepEqual(j.pending, [], '입력 확인 시각부터 15분 계산');
      }
      assert.equal(aiCalls, 1);
      assert.equal(batchCalls, 1, '같은 뉴스/일정이면 가격 공급사 경로도 다시 부르지 않는다');
      assert.equal((store.get(lineKey('NVDA')) as any).at, generatedAt, '모델 생성 시각 유지');
      store.set('guardian:news:digest:v2', { items: [{ headline: 'New supply agreement', tickers: ['NVDA'], publishedAt: new Date(now).toISOString() }] });
      store.delete('wlai:lock:NVDA');
      script.push({ text: GOOD });
      assert.equal((await generateLines(['NVDA'], { cachedContextOnly: ['NVDA'] })).out.NVDA, 'generated');
      assert.equal(aiCalls, 2);
      assert.equal(batchCalls, 2);
    } finally { Date.now = clock; }
  });

  await at('캐시: 같은 지형이면 다시 부르지 않는다(fresh) · 가격이 레벨을 건너면 다시', async () => {
    script.push({ text: GOOD });
    await generateLines(['NVDA']);
    store.delete('wlai:lock:NVDA');
    const r2 = await generateLines(['NVDA']);
    assert.equal(r2.out.NVDA, 'fresh');
    assert.equal(aiCalls, 1);
    const f = buildLineFacts('NVDA', NVDA)!;
    assert.equal(storedMatchesFacts(store.get(lineKey('NVDA')) as any, f), true);
    const moved = buildLineFacts('NVDA', { ...NVDA, extendedPrice: 251 })!;
    assert.equal(storedMatchesFacts(store.get(lineKey('NVDA')) as any, moved), false);
    store.delete('wlai:lock:NVDA');
    batchRows.NVDA = { ...NVDA, extendedPrice: 251 };
    try {
      script.push({ text: GOOD });
      assert.equal((await generateLines(['NVDA'])).out.NVDA, 'generated', '지형 변경 경로는 캐시 확인만으로 건너뛰지 않는다');
      assert.equal(aiCalls, 2);
    } finally { batchRows.NVDA = NVDA; }
  });
  await at('잠금: 2분 안 같은 종목은 다시 만들지 않는다(locked)', async () => {
    script.push({ text: GOOD });
    await generateLines(['NVDA']);
    const r = await generateLines(['NVDA'], { force: true });
    assert.equal(r.out.NVDA, 'locked');
  });
  await at('실패 폴백: 가드를 못 넘으면 저장하지 않고 30분 쉰다 — 옛 글은 그대로', async () => {
    store.set(lineKey('NVDA'), { v: 1, t: 'NVDA', at: 1, chain: '2026-10-08', lv: { mp: 215, cw: 250, pf: 220, gf: 220 }, sides: {}, spot: 1, text: { ko: '옛 글 {MP}', en: 'old {MP}', ja: '古い{MP}' }, ms: 1 });
    script.push({ text: JSON.stringify({ ko: 'Max Pain $215 위 {MP} · 매수 구간', en: '{MP} above Max Pain $215', ja: 'Max Pain $215の{MP}上' }) });
    const r = await generateLines(['NVDA']);
    assert.equal(r.out.NVDA, 'guard');
    assert.ok(r.reasons.NVDA.some((x) => x.startsWith('ko:forbidden')));
    assert.equal((store.get(lineKey('NVDA')) as any).text.ko, '옛 글 {MP}');
    assert.ok(store.get(failKey('NVDA')));
    assert.equal(ttls.get(failKey('NVDA')), 30 * 60);
    store.delete('wlai:lock:NVDA');
    const again = await generateLines(['NVDA']);
    assert.equal(again.out.NVDA, 'cooling');
    assert.equal(aiCalls, 1);
  });
  await at('실패 폴백: 크레딧 불가(건너뜀) → 옛 글 유지 · 5분만 쉰다 · 예외(네트워크) → error', async () => {
    script.push({ throwSkip: true });
    const r = await generateLines(['NVDA']);
    assert.equal(r.out.NVDA, 'skipped');
    assert.equal(ttls.get(failKey('NVDA')), 5 * 60);
    assert.equal(store.get(lineKey('NVDA')), undefined);
    store.clear();
    script.push({ throwErr: true });
    assert.equal((await generateLines(['AAPL'])).out.AAPL, 'error');
  });
  await at('사실 부족(지도가 안 서는 종목)은 AI 를 부르지 않는다 — nodata · 30분 쉼', async () => {
    const r = await generateLines(['THIN', 'ZZZZ']);
    assert.equal(r.out.THIN, 'nodata');
    assert.equal(r.out.ZZZZ, 'nodata');
    assert.equal(aiCalls, 0);
    assert.ok(store.get(failKey('THIN')));
  });
  await at('비용 상한: 하루 상한에 닿으면 capped(부르지 않음) · 끄기 스위치 → off', async () => {
    process.env.WL_AI_LINE_DAILY_CAP = '1';
    script.push({ text: GOOD }, { text: GOOD });
    const r = await generateLines(['NVDA', 'AAPL']);
    assert.deepEqual(Object.values(r.out).sort(), ['capped', 'generated']);
    assert.equal(aiCalls, 1);
    reset();
    process.env.WL_AI_LINE_OFF = '1';
    assert.equal((await generateLines(['NVDA'])).out.NVDA, 'off');
    assert.equal(batchCalls, 0);
  });

  // ━━━ 5. 읽기 라우트 — 기다리지 않는다 ━━━
  await at('읽기: 저장된 글만 바로 준다 · 없는 종목은 응답 «뒤»에 만든다(pending) · 다음 읽기에 보인다', async () => {
    afterCalls.length = 0;
    script.push({ text: GOOD });
    const res = await route.GET(new Request('http://x/api/watchlist/ai-line?t=NVDA,bad!,THIN&loc=ko'));
    const j = await res.json();
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(j.lines, { NVDA: null, THIN: null });
    assert.deepEqual(j.pending, ['NVDA', 'THIN']);
    assert.equal(aiCalls, 0, '응답 전에는 AI 를 부르지 않는다');
    assert.equal(afterCalls.length, 1);
    await afterCalls[0]();
    assert.equal(aiCalls, 1);
    const j2 = await (await route.GET(new Request('http://x/api/watchlist/ai-line?t=NVDA,THIN&loc=ko'))).json();
    assert.equal(j2.lines.NVDA.text, 'Put Floor $220 위 {PF} · Max Pain $215 위 {MP} · 장외 비중 43.8%');
    assert.deepEqual(j2.pending, [], 'THIN 은 쉬는 중이라 다시 만들지 않는다');
  });
  await at('읽기: 화면이 «지형이 바뀌었다»(stale) 알려도 10분 안에 만든 글이면 다시 만들지 않는다 · 10분 지나면 만든다', async () => {
    afterCalls.length = 0;
    script.push({ text: GOOD });
    await generateLines(['NVDA']);
    store.delete('wlai:lock:NVDA');
    const j = await (await route.GET(new Request('http://x/api/watchlist/ai-line?t=NVDA&loc=en&stale=NVDA'))).json();
    assert.deepEqual(j.pending, []);
    (store.get(lineKey('NVDA')) as any).at = Date.now() - 11 * 60_000;
    const j2 = await (await route.GET(new Request('http://x/api/watchlist/ai-line?t=NVDA&loc=en&stale=NVDA'))).json();
    assert.deepEqual(j2.pending, ['NVDA']);
    assert.equal(j2.lines.NVDA.text, '{PF} above Put Floor $220 · {MP} above Max Pain $215 · off-exchange 43.8%', '다시 만드는 동안에도 옛 글은 준다(화면이 판정)');
  });
  await at('읽기: 끄기 스위치(환경변수·레디스 wlai:off — 재배포 없이) → 빈 응답·생성 없음', async () => {
    afterCalls.length = 0;
    process.env.WL_AI_LINE_OFF = '1';
    const j = await (await route.GET(new Request('http://x/api/watchlist/ai-line?t=NVDA&loc=ko'))).json();
    assert.deepEqual(j.lines, {});
    assert.equal(afterCalls.length, 0);
    delete process.env.WL_AI_LINE_OFF;
    script.push({ text: GOOD });
    await generateLines(['NVDA']);
    store.set('wlai:off', 1);
    const j2 = await (await route.GET(new Request('http://x/api/watchlist/ai-line?t=NVDA&loc=ko'))).json();
    assert.deepEqual(j2, { lines: {}, pending: [], off: true });
    assert.equal(afterCalls.length, 0);
    store.delete('wlai:lock:NVDA');
    assert.equal((await generateLines(['NVDA'], { force: true })).out.NVDA, 'off');
  });

  // ━━━ 6. 화면 쪽 읽기(useWatchlistAiLines) — 실패해도 다른 칸과 무관 ━━━
  const { _aiLinesTest, _resetAiLinesForTest, firstSeen } = require('../src/components/app/watchlist/useWatchlistAiLines');
  const g = globalThis as any;
  const realFetch = g.fetch;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await at('화면: 받은 글 저장 · 실패하면 받은 적 없는 종목만 «없음»(있던 글 유지) · 처음 보임은 한 번만', async () => {
    _resetAiLinesForTest();
    const e = { text: 'x {MP}', chain: '2026-10-09', lv: { mp: 1, cw: 2, pf: 1, gf: null }, sides: { mp: 'a' }, at: 1 };
    g.fetch = async () => ({ ok: true, json: async () => ({ lines: { NVDA: e, AAPL: null }, pending: [] }) });
    _aiLinesTest.load(['AAPL', 'NVDA'], 'ko');
    await wait(5);
    assert.equal(_aiLinesTest.mem().get('ko:NVDA').e.text, 'x {MP}');
    assert.equal(_aiLinesTest.mem().get('ko:AAPL').e, null);
    g.fetch = async () => { throw new Error('offline'); };
    _aiLinesTest.load(['NVDA', 'TSLA'], 'ko', { force: true });
    await wait(5);
    assert.equal(_aiLinesTest.mem().get('ko:NVDA').e.text, 'x {MP}', '실패해도 있던 글은 남는다');
    assert.equal(_aiLinesTest.mem().get('ko:TSLA').e, null);
    assert.equal(firstSeen('NVDA'), true);
    assert.equal(firstSeen('NVDA'), false);
    g.fetch = realFetch;
  });
}

(async () => {
  for (const [name, fn] of tests) { await fn(); n++; console.log('ok -', name); }
  await asyncTests();
  console.log(`\n${n} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
