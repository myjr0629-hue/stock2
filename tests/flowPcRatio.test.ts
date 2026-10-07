/**
 * Flow 풋/콜 비율 — «P/C = 풋÷콜» 한 정의 (2026-10-07, 앱 강화 0단계 T2)
 *
 * 옛 결함(코드 확정): `flow/page.tsx` 의 pcRatio 가 `cVol / pVol`(= 콜÷풋, C/P)인데 같은 변수가 종합 점수 pcScore(≥2.0 → −5: P/C 관례)·
 *   OPI «P/C 압력» 레일(≤0.75 초록)·regimeInsight «P/C»·AI 페이로드(P/C 로 설명되는 입력)에 P/C 로 쓰였다 → 방향 반대로 합산.
 *   화면 증거: 콜 441K / 풋 272K 인데 «P/C 압력 1.62» 빨강. 올바른 P/C 는 272/441 = 0.62.
 *
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/flowPcRatio.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { putCallRatio, callPutRatio, pcScoreOf, pcBias, pcBiasOf, cpText, pcRailColor, PC_AI_DEFINITION } from '../src/lib/app/flowPcRatio';
import { flowAiCacheKey, flowDataDeclaresPutOverCall, FLOW_AI_CACHE_LEGACY, FLOW_AI_CACHE_PC_FIXED } from '../src/lib/ai/flowCacheKey';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n += 1; console.log(`  ✓ ${name}`); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const FLOW = read('src/app/[locale]/app-view/flow/page.tsx');

/** 옛 규칙 그대로(회귀 증명용): pcRatio = 콜÷풋, 점수·레일은 그것을 P/C 로 읽음 */
const oldPcRatio = (c: number, p: number) => (p > 0 ? Math.round(c / p * 100) / 100 : 0);
const oldPcScore = (r: number) => (r >= 2.0 ? -5 : r >= 1.3 ? -3 : r <= 0.5 ? 5 : r <= 0.75 ? 3 : 0);

t('정의: P/C = 풋÷콜, C/P = 콜÷풋 — 화면 증거(콜 441K·풋 272K) 0.62 / 1.62', () => {
  assert.equal(putCallRatio(272_000, 441_000), 0.62);
  assert.equal(callPutRatio(441_000, 272_000), 1.62);
  // 역수 관계(반올림 오차 이내)
  assert.ok(Math.abs(putCallRatio(272_000, 441_000)! * callPutRatio(441_000, 272_000)! - 1) < 0.01);
});

t('정의되지 않는 경우: 콜 0 → P/C null · 풋 0 → C/P null', () => {
  assert.equal(putCallRatio(100, 0), null);
  assert.equal(callPutRatio(100, 0), null);
  assert.equal(putCallRatio(0, 100), 0);     // 풋이 없는 것은 정의된 값 0.00
  assert.equal(callPutRatio(0, 100), 0);
  assert.equal(putCallRatio(-1, 100), null);
});

t('수리 전후: 같은 체인(콜 441K·풋 272K)에서 옛 점수 −3 → 새 점수 +3 (종합 6점 이동 — 리서치 NVDA 예)', () => {
  const oldScore = oldPcScore(oldPcRatio(441_000, 272_000));   // C/P 1.62 를 P/C 로 읽음 → −3
  const newScore = pcScoreOf(putCallRatio(272_000, 441_000)!, true);   // P/C 0.62 → +3
  assert.equal(oldScore, -3);
  assert.equal(newScore, 3);
  assert.equal(newScore - oldScore, 6);
});

t('점수 문턱: P/C ≥2.0 −5 · ≥1.3 −3 · ≤0.5 +5 · ≤0.75 +3 · 중간 0', () => {
  const cases: Array<[number, number]> = [[2.5, -5], [2.0, -5], [1.5, -3], [1.3, -3], [1.0, 0], [0.8, 0], [0.75, 3], [0.6, 3], [0.5, 5], [0.2, 5], [0, 5]];
  for (const [pc, sc] of cases) assert.equal(pcScoreOf(pc, true), sc, `P/C ${pc}`);
});

t('거래량을 모르면(콜 0·미로딩) 점수 0 — 옛 코드는 미로딩 0 을 «≤0.5 → +5» 로 읽어 데이터 없이 점수를 올렸다', () => {
  assert.equal(oldPcScore(0), 5, '옛 동작(결함)');
  assert.equal(pcScoreOf(0, false), 0);
  assert.equal(pcScoreOf(NaN, true), 0);
});

t('우위 판정은 P/C 문턱 하나 — 점수 부호와 «C/P RATIO» 카드 문구가 어떤 거래량에서도 모순하지 않는다', () => {
  let checked = 0;
  for (let c = 0; c <= 2000; c += 37) {
    for (let p = 0; p <= 2000; p += 41) {
      const bias = pcBiasOf(c, p);
      if (c === 0 && p === 0) { assert.equal(bias, null); continue; }
      const pc = putCallRatio(p, c);
      const score = pc === null ? null : pcScoreOf(pc, true);
      if (score !== null) {
        if (score > 0) assert.ok(bias === 'call' || bias === 'strongCall', `c${c} p${p}`);
        if (score < 0) assert.ok(bias === 'put' || bias === 'strongPut', `c${c} p${p}`);
        if (score === 0) assert.equal(bias, 'balanced', `c${c} p${p}`);
      } else {
        assert.equal(bias, 'strongPut');   // 콜 0 · 풋 있음
      }
      checked += 1;
    }
  }
  assert.ok(checked > 1000);
});

t('«C/P RATIO» 카드 숫자 글자: 콜÷풋 · 풋 0 이면 ∞ · 둘 다 0 이면 —', () => {
  assert.equal(cpText(441_000, 272_000), '1.62');
  assert.equal(cpText(441_000, 0), '∞');
  assert.equal(cpText(0, 0), '—');
  assert.equal(cpText(0, 50), '0.00');
});

t('OPI «P/C 압력» 레일 색: ≤0.75 초록 · ≥1.25 빨강 · 사이 노랑(레일 문턱 그대로) — 올바른 P/C 0.62 는 초록', () => {
  assert.equal(pcRailColor(0.62), '#10b981');
  assert.equal(pcRailColor(1.0), '#f59e0b');
  assert.equal(pcRailColor(1.3), '#f43f5e');
  assert.equal(pcBias(0.62), 'call');
});

t('flow/page.tsx: 비율은 거래량 상태에서 파생(setPcRatio·cVol / pVol 제거) — 종목이 바뀌어도 낡은 값이 남지 않는다', () => {
  assert.equal(/setPcRatio\b/.test(FLOW), false);
  assert.equal(/setPcRatioOI\b/.test(FLOW), false);
  assert.equal(/cVol\s*\/\s*pVol/.test(FLOW), false, '콜÷풋 을 pcRatio 로 만드는 식이 남아 있다');
  assert.ok(FLOW.includes('const pcRatio = putCallRatio(pcPutVol, pcCallVol) ?? 0;'));
  assert.ok(FLOW.includes('pcScoreOf(pcRatio, pcKnown)'));
});

t('flow/page.tsx: AI 페이로드가 P/C(풋÷콜)와 정의 선언을 보낸다 · «C/P RATIO» 카드는 C/P 를 보이고 우위는 P/C 문턱으로', () => {
  assert.ok(FLOW.includes("pcRatio: { value: pcKnown ? pcRatio : 'N/A', score: Math.round(pcScore), definition: PC_AI_DEFINITION }"));
  assert.equal(PC_AI_DEFINITION, 'put_over_call');
  assert.ok(FLOW.includes('C/P RATIO'), '카드 제목 유지');
  assert.ok(FLOW.includes('cpText(pcCallVol, pcPutVol)') && FLOW.includes('pcBiasOf(pcCallVol, pcPutVol)'));
  // [2026-10-07 정확성 2차] OI 칸은 rawChain(주간 만기 1개)의 합이 아니라 35일 이내 전 만기 합계(/api/app/oi-pcr → oiAll) — 같은 C/P·같은 P/C 문턱
  assert.ok(FLOW.includes('cpText(oiAll.callOI, oiAll.putOI)') && FLOW.includes('pcBiasOf(oiAll.callOI, oiAll.putOI)'));
  // 카드가 pcRatio(P/C)를 «콜 우위» 로 읽던 옛 문턱식이 남아 있지 않다
  assert.equal(/pcRatio\s*>=\s*1\.3\s*\?\s*'#10b981'/.test(FLOW), false);
});

t('AI 캐시 키: 정정 선언이 있는 재료(앱)는 v4 · 선언 없는 재료(웹·옛 앱)는 v3 그대로', () => {
  const appPayload = { factors: { pcRatio: { value: 0.62, score: 3, definition: 'put_over_call' } } };
  const webPayload = { factors: { pcRatio: { value: 1.62, score: -3 } } };
  assert.equal(FLOW_AI_CACHE_LEGACY, 'ai-flow-analysis:v3');
  assert.equal(FLOW_AI_CACHE_PC_FIXED, 'ai-flow-analysis:v4');
  assert.equal(flowAiCacheKey('nvda', appPayload), 'ai-flow-analysis:v4:NVDA');
  assert.equal(flowAiCacheKey('NVDA', webPayload), 'ai-flow-analysis:v3:NVDA');
  assert.equal(flowAiCacheKey('NVDA', undefined), 'ai-flow-analysis:v3:NVDA');
  assert.equal(flowAiCacheKey('NVDA', {}), 'ai-flow-analysis:v3:NVDA');
  assert.equal(flowDataDeclaresPutOverCall({ factors: { pcRatio: { definition: 'call_over_put' } } }), false);
});

t('라우트는 키를 flowAiCacheKey 로 고르고, 프롬프트의 P/C 정의(풋÷콜·>1.3 put_heavy)는 그대로다', () => {
  const route = read('src/app/api/flow/ai-analysis/route.ts');
  assert.ok(route.includes('const cacheKey = flowAiCacheKey(TICKER, flowData);'));
  assert.equal(/`ai-flow-analysis:v3:\$\{TICKER\}`/.test(route), false, '하드코딩 키가 남아 있다');
  assert.ok(route.includes('Put/Call ratio by volume. >1.3=put_heavy(bearish), <0.75=call_heavy(bullish).'));
});

t('웹 격리: 웹 화면·웹 AI 컴포넌트는 이번에 바뀌지 않았다(정의 선언 없음 → v3 유지)', () => {
  for (const f of ['src/components/FlowRadar.tsx', 'src/components/FlowAIAnalysis.tsx']) {
    assert.equal(read(f).includes('put_over_call'), false, f);
  }
});

console.log(`\n✅ flowPcRatio: ${n}건 통과`);
