/**
 * 딥 분석 예열 복구 (2026-10-12, REPORT §3 ④)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/deepWarm.test.ts
 *
 * 지키는 것:
 *   1. 재료 — 화면(app-view/cmd)과 예열이 같은 함수(buildDeepSnapshot·computeGexStats)를 쓴다(화면 소스가 이 함수를 부른다) ·
 *      예열 재료는 신뢰 경로의 재료 완결 게이트를 넘는다 · 시세가 없거나 unified 가 부분 응답이면 부르지 않는다(9/10 «데이터 부재» 사고 재발 방지)
 *   2. 계획 — 라운드 창(뉴욕 09:35·10:35, 서머타임·표준시 모두) · 하루 한 번 · Sonnet 일일 상한의 50% 안에서만(날아가는 생성까지 셈) ·
 *      25분 안에 만든 캐시는 부르지 않는다
 *   3. 라우트 — 크론 비밀로 인증된 WARM 만 크레딧 전용(withFreshTier) · 예열 실패는 사용자 «쉬기» 키·폴백 캐시를 쓰지 않는다 ·
 *      WARM 은 캐시를 무시하는 트리거가 아니다 · 예열 크론 등록(평일 13~16시 UTC 5분)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.EC2_REDIS_PROXY_KEY = 'test-proxy';
const routes = new Map<string, unknown>();
(globalThis as any).fetch = async (url: string) => {
  const u = new URL(url);
  const key = u.pathname + (u.searchParams.get('type') ? `?type=${u.searchParams.get('type')}` : '');
  if (routes.has(key)) return Response.json(routes.get(key));
  return new Response('not found', { status: 404 });
};

const DS = require('../src/lib/ai/deepSnapshot') as typeof import('../src/lib/ai/deepSnapshot');
const DT = require('../src/lib/ai/deepTrust') as typeof import('../src/lib/ai/deepTrust');
const WP = require('../src/lib/ai/deepWarmPlan') as typeof import('../src/lib/ai/deepWarmPlan');
const WS = require('../src/services/deepWarmService') as typeof import('../src/services/deepWarmService');
const CP = require('../src/lib/ai/creditPacing') as typeof import('../src/lib/ai/creditPacing');

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const ta = async (name: string, fn: () => Promise<void>) => { await fn(); n++; console.log(`  ✓ ${name}`); };
const ms = (iso: string) => Date.parse(iso);
const src = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const UNIFIED = {
  alpha: { score: 66, grade: 'B' }, smartFlow: 64,
  structure: { netGex: -7e7, gammaFlipLevel: 220, pcRatio: 0.8, levels: { callWall: 250, putFloor: 220 }, maxPain: 215, underlyingPrice: 229.7 },
  volatility: { squeezeRisk: 'LOW', squeezeScore: 12, regime: 'CALM', regimeScore: 30 },
  sma: { cross: 'GOLDEN', sma50: 210, sma200: 180, phase: 'UPTREND' },
  fundamentals: { score: 70, grade: 'B', breakdown: { pe: { value: 45 } } },
  analyst: { bullishPct: 88 }, squeeze: { status: 'NORMAL', siPercent: 1.1 },
  earnings: { daysUntilEarnings: 0, nextEarningsDate: '2026-11-19', epsEstimate: 1.2 },
  related: { topRelated: [{ ticker: 'AMD' }, { ticker: 'AVGO' }] },
};
const TICKER = { ticker: 'NVDA', session: 'REG', price: 229.7, display: { price: 229.7, changePctPct: 1.25 }, flow: { netPremium: 2.37e8 } };

(async () => {
  console.log('━━━ 1. 재료 ━━━');
  t('buildDeepSnapshot — 화면과 같은 모양 · 신뢰 경로 표식 · 재료 완결 게이트 통과', () => {
    const s = DS.buildDeepSnapshot({ ticker: 'NVDA', price: 229.7, priceChange: 1.25, session: 'REG', unified: UNIFIED, rawTickerData: TICKER, insider: { net30d: -5e6, buyCount: 0, sellCount: 3, sentiment: 'CAUTIOUS' }, technicals: { adx: { value: 25 }, obv: {}, bb: {}, atr: {}, volPremium: {}, extra: 1 }, creditSpread: { value: 3.1 } });
    assert.equal(DT.isTrustDeepSnapshot(s), true);
    assert.equal(s.materialPhase, 'complete');
    assert.deepEqual(DT.deepMaterialIssues(s), { ok: true, reasons: [] });
    assert.equal(s.structure.callWall, 250); assert.equal(s.structure.putFloor, 220); assert.equal(s.structure.maxPain, 215); assert.equal(s.structure.gammaFlipLevel, 220);
    assert.equal(s.flow.netPremium, 2.37e8);
    assert.equal(s.earnings.daysUntil, 0, '실적 당일 0 은 0(9/30 «999» 사고)');
    assert.deepEqual(s.relatedTickers, ['AMD', 'AVGO']);
    assert.equal((s.technicals as any).extra, undefined, '지표는 다섯 개만');
    assert.equal(s.institutional.activity, 'CAUTIOUS');
    assert.deepEqual(s.creditSpread, { value: 3.1 });
  });
  t('화면이 같은 함수를 쓴다 — app-view/cmd 가 buildDeepSnapshot·computeGexStats 를 부르고 옛 인라인 재료는 없다', () => {
    const page = src('src/app/[locale]/app-view/cmd/page.tsx');
    assert.match(page, /const snapshot = buildDeepSnapshot\(\{/);
    assert.match(page, /computeGexStats\(res\.data \|\| \[\]\)/);
    assert.ok(!/trustLayer: 1,\s*\n\s*materialPhase: 'complete'/.test(page), '옛 인라인 재료가 남아 있지 않다');
  });
  t('computeGexStats — 정규장 마지막 기록 하루 1개 · 하루치 2개 미만이면 null', () => {
    assert.equal(DS.computeGexStats([]), null);
    assert.equal(DS.computeGexStats([{ timestamp: ms('2026-10-08T15:00:00Z'), gex: 1, gammaRegime: 'POSITIVE' }]), null);
    const rows = [
      { timestamp: ms('2026-10-07T15:00:00Z'), gex: -5, gammaRegime: 'NEGATIVE', callWall: 240, price: 220 },
      { timestamp: ms('2026-10-07T19:00:00Z'), gex: -4, gammaRegime: 'NEGATIVE', callWall: 240, price: 221 },
      { timestamp: ms('2026-10-08T19:00:00Z'), gex: 3, gammaRegime: 'POSITIVE', callWall: 250, price: 230 },
      { timestamp: ms('2026-10-09T19:00:00Z'), gex: 6, gammaRegime: 'POSITIVE', callWall: 250, price: 229 },
      { timestamp: ms('2026-10-10T19:00:00Z'), gex: 9, gammaRegime: 'POSITIVE', callWall: 250, price: 231 },   // 토요일 — 빠진다
    ];
    const g = DS.computeGexStats(rows)!;
    assert.equal(g.totalDays, 3); assert.equal(g.latestRegime, 'POSITIVE'); assert.equal(g.streakDays, 2);
    assert.equal(g.flipEvents.length, 1); assert.equal(g.flipEvents[0].from, 'NEGATIVE');
    assert.equal(g.percentile, 67); assert.equal(g.callWallAccuracy, 100);
  });
  await ta('buildWarmMaterial — 화면과 같은 엔드포인트로 모은다 · 시세 없음/unified 부분 응답은 부르지 않는다', async () => {
    routes.clear();
    routes.set('/api/live/ticker', TICKER);
    routes.set('/api/command/unified', UNIFIED);
    routes.set('/api/command/insider', { insider: { net30d: 0, buyCount: 1, sellCount: 1, sentiment: 'NEUTRAL' } });
    routes.set('/api/live/technicals', { adx: { value: 20 }, obv: {}, bb: {}, atr: {}, volPremium: {} });
    routes.set('/api/market/macro', { creditSpread: { value: 3 } });
    routes.set('/api/history?type=gex', { data: [] });
    const ok = await WS.buildWarmMaterial('nvda', 'https://x.test');
    assert.ok(!('error' in ok));
    if (!('error' in ok)) {
      assert.equal(ok.snapshot.ticker, 'NVDA'); assert.equal(ok.snapshot.session, 'REG'); assert.equal(ok.snapshot.price, 229.7); assert.equal(ok.snapshot.priceChange, 1.25);
      assert.deepEqual(DT.deepMaterialIssues(ok.snapshot), { ok: true, reasons: [] });
      assert.equal(ok.gexStats, null);
    }
    routes.set('/api/command/unified', { ...UNIFIED, _isPartial: true });
    assert.deepEqual(await WS.buildWarmMaterial('NVDA', 'https://x.test'), { error: 'unified-partial' });
    routes.set('/api/command/unified', UNIFIED);
    routes.set('/api/live/ticker', { ...TICKER, price: 0, display: { price: 0 } });
    assert.deepEqual(await WS.buildWarmMaterial('NVDA', 'https://x.test'), { error: 'no-price' });
  });

  console.log('━━━ 2. 계획 ━━━');
  t('대상 — 인기 종목 상위 20(PREWARM_TICKERS 앞 20, NVDA 부터)', () => {
    assert.equal(WP.DEEP_WARM_TICKERS.length, 20); assert.equal(WP.DEEP_WARM_TICKERS[0], 'NVDA');
    assert.deepEqual([...WP.DEEP_WARM_TICKERS], CP.PREWARM_TICKERS.slice(0, 20));
  });
  t('라운드 — 뉴욕 09:35~10:30 «open», 10:35~11:30 «r2» · 서머타임(EDT)·표준시(EST) · 이미 돈 라운드는 빠진다', () => {
    const none = new Set<string>();
    assert.equal(WP.dueRound(ms('2026-10-12T13:34:00Z'), none), null, 'EDT 09:34');
    assert.equal(WP.dueRound(ms('2026-10-12T13:35:00Z'), none)?.id, 'open');
    assert.equal(WP.dueRound(ms('2026-10-12T14:29:00Z'), none)?.id, 'open');
    assert.equal(WP.dueRound(ms('2026-10-12T14:31:00Z'), none), null, '10:31 — 사이');
    assert.equal(WP.dueRound(ms('2026-10-12T14:40:00Z'), none)?.id, 'r2');
    assert.equal(WP.dueRound(ms('2026-10-12T13:40:00Z'), new Set(['open'])), null, '하루 한 번');
    assert.equal(WP.dueRound(ms('2026-11-16T14:36:00Z'), none)?.id, 'open', 'EST 09:36 = 14:36 UTC');
    // 크론(평일 13~16시 UTC 5분)이 두 계절의 창을 모두 덮는다
    const v = JSON.parse(src('vercel.json')).crons as Array<{ path: string; schedule: string }>;
    assert.deepEqual(v.filter((c) => c.path === '/api/cron/ai-warm').map((c) => c.schedule), ['*/5 13-16 * * 1-5']);
  });
  t('상한 — Sonnet 일일 상한 $3.5 의 50%($1.75) 안에서만 · 날아가는 생성까지 센다', () => {
    assert.equal(WP.warmBudgetAllows(0, 3.5), true);
    assert.equal(WP.warmBudgetAllows(1.69, 3.5), true, '1.69 + 0.06 = 1.75');
    assert.equal(WP.warmBudgetAllows(1.70, 3.5), false);
    assert.equal(WP.warmBudgetAllows(1.60, 3.5, 2), false, '1.60 + 3×0.06 > 1.75');
    assert.equal(WP.warmBudgetAllows(0, 0), false, '상한 없음 = 안 돈다');
    assert.equal(WP.warmBudgetAllows(Number.POSITIVE_INFINITY, 3.5), false, '사용액을 못 읽으면 안 돈다');
    // 20종목 전부 생성해도 예상 $1.2 — 예열 몫 안
    assert.ok(WP.DEEP_WARM_TICKERS.length * WP.DEEP_WARM_EST_CALL_USD <= 3.5 * WP.DEEP_WARM_SHARE);
  });
  t('분리 모드(2026-10-12 대표 결정) — 예열 자신의 몫 $0.7 안에서만 · 수요 상위 10 · 개장 직후 1회(open 만)', () => {
    assert.equal(WP.DEEP_WARM_TOP_N, 10);
    assert.equal(WP.warmOwnBudgetAllows(0, 0.7), true);
    assert.equal(WP.warmOwnBudgetAllows(0.64, 0.7), true, '0.64 + 0.06 = 0.70');
    assert.equal(WP.warmOwnBudgetAllows(0.65, 0.7), false);
    assert.equal(WP.warmOwnBudgetAllows(0.55, 0.7, 2), false, '0.55 + 3×0.06 > 0.70');
    assert.equal(WP.warmOwnBudgetAllows(0, 0), false, '몫 없음 = 안 돈다');
    assert.equal(WP.warmOwnBudgetAllows(Number.POSITIVE_INFINITY, 0.7), false, '사용액을 못 읽으면 안 돈다');
    assert.ok(WP.DEEP_WARM_TOP_N * 0.054 < 0.7 && WP.DEEP_WARM_TOP_N * WP.DEEP_WARM_EST_CALL_USD <= 0.7 + 1e-9, '10종목 실측 $0.54 · 예상 $0.60 이 몫 안');
    const none = new Set<string>();
    assert.equal(WP.dueRound(ms('2026-10-12T14:40:00Z'), none, { openOnly: true }), null, '분리 모드는 10:35 라운드가 없다');
    assert.equal(WP.dueRound(ms('2026-10-12T13:40:00Z'), none, { openOnly: true })?.id, 'open');
    assert.equal(WP.dueRound(ms('2026-10-12T14:40:00Z'), none)?.id, 'r2', '스위치를 끄면 옛 2라운드');
    const et = (m: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(m));
    assert.deepEqual(WP.recentEtDays(ms('2026-10-13T13:40:00Z'), 3, et), ['2026-10-13', '2026-10-12', '2026-10-11']);
    assert.equal(WP.recentEtDays(ms('2026-11-02T14:40:00Z'), 7, et).length, new Set(WP.recentEtDays(ms('2026-11-02T14:40:00Z'), 7, et)).size, '서머타임 경계에서도 같은 날이 겹치지 않는다');
  });
  t('분리 모드 배선 — 라우트가 수요 상위·예열 몫·스위치를 쓰고, 사다리·관리자에 스위치가 있다', () => {
    const w = src('src/app/api/cron/ai-warm/route.ts');
    assert.match(w, /loadDemandTop\(recentEtDays\(t0, 7, etDateOf\), DEEP_WARM_TOP_N\)/); assert.match(w, /warmOwnBudgetAllows\(ws, sep\.warmCapUsd, inflight\)/);
    assert.match(w, /warmSeparationOn\(\)/); assert.match(w, /skipped: 'no-demand'/);
    const l = src('src/lib/ai/llmLadder.ts');
    assert.match(l, /warmDailyCapUsd: 0\.7/); assert.match(l, /llm:warmsep:off/); assert.match(l, /sonnet-warmcap/);
    assert.match(src('src/app/api/admin/ai-ladder/route.ts'), /action === 'warm-sep'/);
    assert.match(src('src/app/api/command/deep-analysis/route.ts'), /noteDeepView\(TICKER, etDay\)/);
  });
  t('캐시 — 25분 안에 만든 신뢰 경로 저장본이면 부르지 않는다', () => {
    const now = ms('2026-10-12T14:00:00Z');
    assert.equal(WP.warmCacheFresh({ trust: 1, tpl: {}, generatedAt: '2026-10-12T13:40:00Z' }, now), true);
    assert.equal(WP.warmCacheFresh({ trust: 1, tpl: {}, generatedAt: '2026-10-12T13:30:00Z' }, now), false, '30분');
    assert.equal(WP.warmCacheFresh({ generatedAt: '2026-10-12T13:59:00Z' }, now), false, '옛 v2 모양은 아니다');
    assert.equal(WP.warmCacheFresh(null, now), false);
  });

  console.log('━━━ 3. 라우트 연결 ━━━');
  t('딥 분석 라우트 — 인증된 WARM 만 크레딧 전용 · 실패해도 쉬기 키·폴백 캐시 없음 · WARM 은 캐시 무시 트리거가 아니다', () => {
    const r = src('src/app/api/command/deep-analysis/route.ts');
    assert.match(r, /warmReq = triggerReason === 'WARM' && isWarmAuthorized\(req\)/);
    assert.match(r, /req\.headers\.get\('authorization'\) === `Bearer \$\{secret\}`/);
    assert.match(r, /warmReq \? withFreshTier\(\(\) => callBedrock\(args\), \{ sonnet: true \}\) : callBedrock\(args\)/);
    assert.equal((r.match(/await callB\(/g) || []).length, 2, '생성 호출 두 곳(첫 생성·교정 재생성) 모두');
    const iCatch = r.indexOf("console.error('[DeepAnalysis] Error:'");
    const iWarm = r.indexOf("error: 'warm_failed'", iCatch);
    const iFail = r.indexOf('ai-deep-analysis:fail:', iCatch);
    assert.ok(iCatch > 0 && iWarm > iCatch && iWarm < iFail, '예열 실패는 쉬기 키보다 먼저 돌아간다');
    assert.match(r, /forceRefresh = triggerReason === 'PRICE_MOVE' \|\| triggerReason === 'GAMMA_FLIP' \|\| triggerReason === 'MANUAL_REFRESH'/);
  });
  t('예열 크론 — 인증 · 라운드·상한·캐시 확인 뒤에만 부른다 · 결과를 남긴다', () => {
    const w = src('src/app/api/cron/ai-warm/route.ts');
    assert.match(w, /Bearer \$\{cronSecret\}/);
    assert.match(w, /dueRound\(t0, done, \{ openOnly: sep\.on \}\)/); assert.match(w, /warmBudgetAllows\(spent, cap, inflight\)/); assert.match(w, /warmCacheFresh\(cachedVals\[i\], t0\)/);
    assert.match(w, /sonnetSpentTodayUsd\(\)/); assert.match(w, /setInCache\(LAST_KEY, summary/);
    assert.match(src('src/services/deepWarmService.ts'), /triggerReason: 'WARM'/);
  });

  console.log(`\n${n}건 통과`);
})().catch((e) => { console.error(e); process.exit(1); });
