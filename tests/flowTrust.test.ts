/**
 * Flow AI INTEL 신뢰 레이어 — src/lib/ai/flowTrust.ts : 재료 완결 게이트 · 프롬프트 · 출구 게이트 · 채움
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/flowTrust.test.ts
 *
 * 출발점 — 0단계 발견(2026-10-07, ~/Documents/signum-work/2026-10-07/app-accuracy-0): 화면이 종목 첫 응답 직후 AI 를 불러
 *   NVDA 재료가 «compositeScore −13(→−18)·P/C 0/N/A» 였다(같은 시각 화면 종합 +9~+15). 그 재료 그대로 만든 글이 14시간 캐시에 앉았다.
 */
import assert from 'node:assert/strict';
import {
    isTrustFlowData, flowTrustCacheKey, flowMaterialIssues, buildTrustFlowXml, TRUST_FLOW_SYSTEM,
    gateFlowAnalysis, fillFlowAnalysis, recheckStoredFlow, flowCorrective, flowTextSlots, staleBasisFromFlowData, staleNowFromFlowData,
} from '@/lib/ai/flowTrust';
import { flowTokensFromFlowData } from '@/lib/ai/flowTokens';
import { basisFromFlowData } from '@/lib/ai/flowNumbers';
import { flowStaleness } from '@/lib/ai/trustLayer';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

// 0단계 캡처 재료(조기) — payload-NVDA.json before/after
const EARLY_BEFORE = { ticker: 'NVDA', triggerReason: 'FIRST_LOAD', compositeScore: -13, factors: { pcRatio: { value: 0, score: 5 }, opi: { value: 47, score: -1, label: '' } }, currentPrice: 239.24 };
const EARLY_AFTER = { ticker: 'NVDA', compositeScore: -18, factors: { pcRatio: { value: 'N/A', score: 0, definition: 'put_over_call' }, opi: { value: 47, score: -1, label: '' } }, currentPrice: 239.24 };

// 완결 재료 — 운영 NVDA 10/7 (종합 +15 · P/C 0.62 · 순 프리미엄 +$158.5M)
const FULL = {
    trustLayer: 1, materialPhase: 'complete', ticker: 'NVDA', currentPrice: 239.24, compositeScore: 15, session: 'CLOSED', netPremium: 158_500_000,
    position: { zone: 'INSIDE_RANGE', putFloor: 230, callWall: 245, distToPut: '3.9%', distToCall: '2.4%' },
    regime: { gammaFlipLevel: 240, maxPain: 230, flipPercentage: '-0.3%', gexRegime: 'LOADED' },
    factors: {
        opi: { value: 47, score: -1, label: '' }, whale: { premium: '$4600K', premiumUsd: 4_600_000, score: 15, bias: 'BULLISH' },
        squeeze: { probability: 6, score: 0, label: '' }, ivSkew: { value: -2, score: 3, label: '' }, smartMoney: { score: -5, label: '' },
        dex: { value: 'N/A', score: 0, label: '' }, uoa: { score: 3, label: '' },
        pcRatio: { value: 0.62, score: 3, definition: 'put_over_call' }, gex: { pinStrength: 'N/A', score: 3, regime: 'LOADED' },
    },
    ruleVerdict: { status: 'neutral' },
};

t('신뢰 재료 표식과 캐시 칸 — 웹(표식 없음)은 v3·v4 그대로', () => {
    assert.equal(isTrustFlowData(FULL), true);
    assert.equal(isTrustFlowData(EARLY_BEFORE), false);
    assert.equal(isTrustFlowData(undefined), false);
    assert.equal(flowTrustCacheKey('nvda'), 'ai-flow-analysis:v5:NVDA');
});

// ── ① 재료 완결 게이트 ──────────────────────────────────────────────────────────
t('0단계 실측 — 조기 재료(종합 −13·P/C 0, −18·N/A)는 미완결', () => {
    const a = flowMaterialIssues({ ...EARLY_BEFORE, trustLayer: 1, materialPhase: 'partial' });
    assert.equal(a.ok, false);
    assert.ok(a.reasons.includes('phase:partial') && a.reasons.includes('pc'), a.reasons.join(','));
    const b = flowMaterialIssues({ ...EARLY_AFTER, trustLayer: 1, materialPhase: 'partial' });
    assert.ok(b.reasons.includes('pc'));
});
t('표식이 complete 여도 P/C 0·N/A 이면 미완결 — 숫자도 따로 본다', () => {
    assert.ok(flowMaterialIssues({ ...FULL, factors: { ...FULL.factors, pcRatio: { value: 0, score: 5 } } }).reasons.includes('pc'));
    assert.ok(flowMaterialIssues({ ...FULL, factors: { ...FULL.factors, pcRatio: { value: 'N/A', score: 0 } } }).reasons.includes('pc'));
    assert.ok(flowMaterialIssues({ ...FULL, currentPrice: 0 }).reasons.includes('price'));
    assert.ok(flowMaterialIssues({ ...FULL, compositeScore: undefined }).reasons.includes('composite'));
    assert.ok(flowMaterialIssues({ ...FULL, factors: { ...FULL.factors, opi: { value: 'N/A' } } }).reasons.includes('opi'));
});
t('완결 재료는 통과', () => {
    assert.deepEqual(flowMaterialIssues(FULL), { ok: true, reasons: [] });
});
t('종합 점수 0 은 «값 없음»이 아니다 — 0 점이 진짜일 수 있다', () => {
    assert.equal(flowMaterialIssues({ ...FULL, compositeScore: 0 }).ok, true);
});

// ── ② 프롬프트 ──────────────────────────────────────────────────────────────────
t('프롬프트 — 자리표 규칙과 현재 화면 값, OPI 는 0~100 눈금(47 = 균형), 구 «±50» 안내 없음', () => {
    const xml = buildTrustFlowXml('NVDA', FULL, '', 'FIRST_LOAD');
    assert.match(xml, /\{PRICE\} = \$239\.24/);
    assert.match(xml, /\{PC\} = 0\.62/);
    assert.match(xml, /\{COMPOSITE\} = \+15/);
    assert.match(xml, /gauge_state="BALANCED"/);
    assert.doesNotMatch(xml, /\+50=extreme_call_dominance/);
    assert.match(xml, /gamma_zone="SHORT_GAMMA\(price below flip\)"/);
    assert.match(TRUST_FLOW_SYSTEM, /never type the number/);
    assert.match(TRUST_FLOW_SYSTEM, /FORBIDDEN in every language/);
});

// ── ③ 출구 게이트 ───────────────────────────────────────────────────────────────
const TOK = flowTokensFromFlowData(FULL);
const BASIS = basisFromFlowData('NVDA', FULL);
const GOOD = {
    structuralThesis: {
        ko: 'OPI 게이지 {OPI} 은 균형 구간이고 P/C {PC} 로 콜 거래가 우세하다. 현물 {PRICE} 은 감마 플립 {GAMMA_FLIP} 아래 {DIST_FLIP} 에 있어 딜러 헤징이 숏 감마 쪽이다.',
        en: 'The OPI gauge at {OPI} is balanced while P/C of {PC} shows call volume leading. Spot at {PRICE} sits {DIST_FLIP} below the {GAMMA_FLIP} gamma flip, so dealer hedging is on the short-gamma side.',
        ja: 'OPIゲージ{OPI}は均衡圏で、P/C {PC}はコール出来高優位を示す。現物{PRICE}はガンマフリップ{GAMMA_FLIP}の{DIST_FLIP}下にあり、ディーラーのヘッジはショートガンマ側にある。',
    },
    factorHighlights: [{
        factor: 'Whale', impact: 'bull',
        insight: {
            ko: '고래 프리미엄 {WHALE_PREM} 이 콜 쪽으로 쏠려 있다.',
            en: 'Whale premium of {WHALE_PREM} leans toward calls.',
            ja: 'ホエールのプレミアム{WHALE_PREM}はコール側に偏っている。',
        },
    }],
    repricingCondition: {
        ko: '현물이 풋 플로어 {PUT_FLOOR} 아래에서 마감하는 상태가 구조가 바뀌는 조건이다.',
        en: 'Spot closing below the {PUT_FLOOR} put floor is the condition under which this structure changes.',
        ja: '現物がプットフロア{PUT_FLOOR}を下回って引ける状態が、この構造の変わる条件である。',
    },
    riskAssessment: 'MEDIUM', confidence: 'MEDIUM',
};

t('정상 글은 통과 — 자리표만 쓴 3개 국어', () => {
    const g = gateFlowAnalysis(GOOD, TOK, BASIS);
    assert.equal(g.ok, true, g.reasons.join(' | '));
    assert.equal(g.stripped, 0);
});
t('모델이 숫자를 직접 썼어도 재료와 같으면 자리표로 바뀐다 — 템플릿에 숫자 없음', () => {
    const a = JSON.parse(JSON.stringify(GOOD));
    a.structuralThesis.en = a.structuralThesis.en.replace('{PC}', '0.62').replace('{PRICE}', '$239.24');
    const g = gateFlowAnalysis(a, TOK, BASIS);
    assert.equal(g.ok, true, g.reasons.join(' | '));
    assert.match(g.analysis.structuralThesis.en, /\{PC\}/);
    assert.match(g.analysis.structuralThesis.en, /\{PRICE\}/);
});
t('0단계 실측 불일치 — 글 «P/C 1.93»·«스퀴즈 99%» 는 탈락', () => {
    const a = JSON.parse(JSON.stringify(GOOD));
    a.structuralThesis.ko = 'P/C 1.93 풋 헤비이고 스퀴즈 확률 99% 로 압축되어 있다.';
    const g = gateFlowAnalysis(a, TOK, BASIS);
    assert.equal(g.ok, false);
    assert.ok(g.reasons.some((r) => r.includes('metric:PC:1.93')), g.reasons.join('|'));
    assert.ok(g.reasons.some((r) => r.includes('metric:SQUEEZE:99')));
});
t('예측어 문장은 빠지고(남은 글이 쓸 만하면) 통과 — 빠진 건수가 기록된다', () => {
    const a = JSON.parse(JSON.stringify(GOOD));
    a.structuralThesis.ko += ' 상승 흐름이 이어질 것으로 전망된다.';
    a.structuralThesis.en += ' Upside is expected to follow.';
    a.structuralThesis.ja += ' 今後の見通しは明るい。';
    const g = gateFlowAnalysis(a, TOK, BASIS);
    assert.equal(g.ok, true, g.reasons.join(' | '));
    assert.equal(g.stripped, 3);
    assert.ok(!/전망/.test(g.analysis.structuralThesis.ko));
});
t('지어낸 자리표가 든 문장은 빠지고 통과 — 10/7 프리뷰 실측: ko highlight 에 {SMART_MONEY}', () => {
    const a = JSON.parse(JSON.stringify(GOOD));
    a.factorHighlights[0].insight.ko += ' 스마트머니 {SMART_MONEY} 는 약세다.';
    a.factorHighlights[0].insight.en += ' Smart money at {SMART_MONEY} is weak.';
    const g = gateFlowAnalysis(a, TOK, BASIS);
    assert.equal(g.ok, true, g.reasons.join(' | '));
    assert.ok(g.stripped >= 2);
    assert.doesNotMatch(JSON.stringify(g.analysis), /SMART_MONEY/);
});
t('예측어뿐인 칸(전부 빠져 빈 글)은 탈락 — 재생성 대상', () => {
    const a = JSON.parse(JSON.stringify(GOOD));
    a.repricingCondition.ko = '구조적 리프라이싱이 발생할 가능성이 높다.';
    const g = gateFlowAnalysis(a, TOK, BASIS);
    assert.equal(g.ok, false);
    assert.ok(g.reasons.some((r) => r.includes('repricingCondition:forecast')));
});
t('«RLSI 42 sits below 40» 류 — 재료의 OPI 47 에 «OPI is below 40» 이라 쓰면 탈락', () => {
    const a = JSON.parse(JSON.stringify(GOOD));
    a.structuralThesis.en = 'The OPI gauge is below 40, which marks put dominance, while spot sits under the gamma flip.';
    const g = gateFlowAnalysis(a, TOK, BASIS);
    assert.equal(g.ok, false);
    assert.ok(g.reasons.some((r) => r.includes('compare:OPI')), g.reasons.join('|'));
});
t('재료에 없는 자리표({WHALE_PREM} 인데 재료에 고래 값 없음)는 탈락', () => {
    const noWhale = flowTokensFromFlowData({ ...FULL, factors: { ...FULL.factors, whale: { premium: '$0K', score: 0, bias: 'NEUTRAL' } } });
    const g = gateFlowAnalysis(GOOD, noWhale, BASIS);
    assert.equal(g.ok, false);
    assert.ok(g.reasons.some((r) => r.includes('token-missing:WHALE_PREM')), g.reasons.join('|'));
});
t('한 언어에 다른 언어가 새면 탈락 — ko 칸에 영어 문장', () => {
    const a = JSON.parse(JSON.stringify(GOOD));
    a.structuralThesis.ko = 'The structure shows a balanced OPI gauge and call-led volume with dealers short gamma near the flip level today.';
    const g = gateFlowAnalysis(a, TOK, BASIS);
    assert.equal(g.ok, false);
    assert.ok(g.reasons.some((r) => r.startsWith('ko:language:')), g.reasons.join('|'));
});
t('직접 쓴 가격 수준이 재료와 다르면 탈락(기존 flowNumbers 규칙 유지) — «$250 콜 월»', () => {
    const a = JSON.parse(JSON.stringify(GOOD));
    a.structuralThesis.en = 'Spot at {PRICE} is held below a $250 call wall while P/C of {PC} stays call-led.';
    const g = gateFlowAnalysis(a, TOK, BASIS);
    assert.equal(g.ok, false);
    assert.ok(g.reasons.some((r) => r.startsWith('level:')), g.reasons.join('|'));
});

// ── ④ 채움(글 숫자 = 화면 숫자) ─────────────────────────────────────────────────────
t('채움 — 지금 요청한 화면 값으로(P/C 0.62 → 0.64, 가격 239.24 → 241.10), 없으면 생성 때 값', () => {
    const g = gateFlowAnalysis(GOOD, TOK, BASIS);
    const now = { ...TOK, PC: 0.64, PRICE: 241.1 };
    const a = fillFlowAnalysis(g.analysis, now, TOK);
    assert.deepEqual(a.missing, []);
    assert.match(a.analysis.structuralThesis.ko, /P\/C 0\.64/);
    assert.match(a.analysis.structuralThesis.ko, /\$241\.10/);
    assert.doesNotMatch(JSON.stringify(a.analysis), /\{[A-Z_]+\}/);
    const b = fillFlowAnalysis(g.analysis, null, TOK);
    assert.match(b.analysis.structuralThesis.en, /P\/C of 0\.62/);
});
t('flowTextSlots — 글 칸만(factor 이름은 글이 아니다)', () => {
    const slots = flowTextSlots(GOOD).map((s) => s.path);
    assert.deepEqual(slots, ['structuralThesis', 'repricingCondition', 'factorHighlights[0].insight']);
});

// ── ⑤ 저장본 재검사·낡음·교정 ─────────────────────────────────────────────────────────
t('저장본 재검사 — 정상은 통과, 예측어·풀리지 않는 자리표가 있으면 사유', () => {
    assert.deepEqual(recheckStoredFlow(GOOD, TOK), []);
    const bad = JSON.parse(JSON.stringify(GOOD));
    bad.structuralThesis.ko = '다음 주 반등이 임박했다 {PC}.';
    assert.ok(recheckStoredFlow(bad, TOK).some((r) => r.includes('forecast')));
    assert.ok(recheckStoredFlow(GOOD, { PRICE: 1 }).some((r) => r.endsWith(':token')));
});
t('낡음 — 생성 때 기준(저장)과 지금 요청 가격 비교: 감마 플립 $240 을 넘으면 stale', () => {
    const basisState = staleBasisFromFlowData(FULL);
    assert.equal(basisState.price, 239.24);
    assert.equal(flowStaleness(basisState, staleNowFromFlowData({ ...FULL, currentPrice: 240.4 })).level, 'stale');
    assert.equal(flowStaleness(basisState, staleNowFromFlowData({ ...FULL, currentPrice: 239.5 })).level, 'fresh');
    assert.equal(flowStaleness(basisState, staleNowFromFlowData({ ...FULL, session: 'REG' })).level, 'fresh');   // 세션 라벨만으로는 낡음이 아니다
});
t('교정 지시 — 사유 코드를 그대로 준다', () => {
    const c = flowCorrective(['ko:structuralThesis:metric:PC:1.93≠0.62']);
    assert.match(c, /metric:PC:1\.93/);
    assert.match(c, /never type those numbers/);
});

console.log(`\n${n} passed`);
