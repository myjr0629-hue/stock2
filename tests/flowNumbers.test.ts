/**
 * 종목별 AI 분석 «글 속 가격 = 그 종목 화면 가격» — src/lib/ai/flowNumbers.ts · /api/flow/ai-analysis 입구·출구·캐시
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/flowNumbers.test.ts
 *
 * 출발점(2026-10-04 운영 실측, 캐시 8종목 × 3개 국어 = 24행 중 15행): AAPL 글에 PLTR 값($200 콜 벽·$170 풋 플로어·현물 $188.75),
 *   MSFT 글에 NVDA 값($235/$220), META←AAPL, GOOGL←MSFT, AMD←GOOGL — 앱이 종목을 넘긴 첫 렌더에 이전 종목 재료를 보냈다.
 */
import assert from 'node:assert/strict';
import { basisFromFlowData, checkFlowAnalysis, checkFlowText, enrichmentLevels, flowPriceMatchesServer, priceLevelsInText } from '@/lib/ai/flowNumbers';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

// 운영 화면 값(10/3 종가, /api/live/ticker)
const AAPL = basisFromFlowData('AAPL', { currentPrice: 333.69, position: { callWall: 340, putFloor: 330 }, regime: { maxPain: 330, gammaFlipLevel: 337.5 } });
const NVDA = basisFromFlowData('nvda', { currentPrice: 233.95, position: { callWall: 235, putFloor: 220 }, regime: { maxPain: 0, gammaFlipLevel: 235 }, alphaTrade: { strike: 240, premium: 3.1 } });

// 운영 캐시에 실제로 앉아 있던 문장
const AAPL_POISONED_KO = 'AAPL 옵션 구조는 기관 강세 포지셔닝(고래 프리미엄 $4.7M, OPI +39)과 시장 중립성 사이의 긴장을 드러낸다. $200 콜 벽과 $170 풋 플로어 사이의 좁은 범위는 딜러 감마 헤징이 현물 가격을 $188.75 근처에 고정시키고 있음을 시사하며';
const NVDA_OK_KO = 'NVDA 옵션 구조는 중립적 균형 상태를 나타내며, OPI +38(온건한 콜 우위)과 스마트머니 -5의 상충이 기관 포지셔닝의 불확실성을 반영한다. 콜 월($235, 0.4% 거리)과 풋 플로어($220, 6.0% 거리)의 비대칭 구조는';
const NVDA_OK_EN = "The asymmetric architecture—call wall at $235 (0.4% away) versus put floor at $220 (6.0% away)—indicates that upside constraint is tighter. Whale premium of $4.6M and insider selling of $785.9 million matter less.";

t('다른 종목 값으로 쓴 글(AAPL←PLTR)은 걸린다', () => {
    const bad = checkFlowText(AAPL_POISONED_KO, AAPL);
    assert.ok(bad.length >= 3, bad.join(' | '));
});
t('맞는 글(NVDA 콜월·풋플로어·거리%)은 통과한다', () => {
    assert.deepEqual(checkFlowText(NVDA_OK_KO, NVDA), []);
    assert.deepEqual(checkFlowText(NVDA_OK_EN, NVDA), []);
});
t('거리 %가 틀리면 걸린다 — «$220, 1.2% 거리»(실제 6.0%)', () => {
    const bad = checkFlowText('풋 플로어($220, 1.2% 거리)가 가깝다.', NVDA);
    assert.equal(bad.length, 1); assert.match(bad[0], /distance/);
});
t('반올림은 허용한다 — $188.75 → «$189»·«약 $190»(±1.5%)', () => {
    const pltr = basisFromFlowData('PLTR', { currentPrice: 188.75, position: { callWall: 200, putFloor: 170 }, regime: { gammaFlipLevel: 190 } });
    assert.deepEqual(checkFlowText('현물 $189 부근, 감마 플립 약 $190.', pltr), []);
});
t('금액·목표가·이동평균은 가격 수준으로 세지 않는다', () => {
    const hits = priceLevelsInText('고래 $240M, 내부자 매도 $250 million, street target $300, SMA50 $210, 목표가 $280, $1.2B 순유입', 233.95);
    assert.deepEqual(hits.map((h) => h.value), []);
});
t('알파 행사가·애널리스트 목표가(보강 재료)는 허용 값이다', () => {
    const b = { ...NVDA, extras: [...NVDA.extras, ...enrichmentLevels('<analyst target_median="$262.5" count="40" />')] };
    assert.deepEqual(checkFlowText('$240 콜 행사가로 들어온 흐름, 스트리트 중간값 $262.5 와의 괴리.', b), []);
});
t('3개 국어 묶음 — 한 언어만 틀려도 ok=false, 틀린 언어를 알려준다', () => {
    const analysis = {
        structuralThesis: { ko: NVDA_OK_KO, en: NVDA_OK_EN, ja: 'コールウォール$235とプットフロア$170の間で…' },
        factorHighlights: [{ factor: 'GEX', insight: { ko: '감마 플립 $235.', en: 'Gamma flip $235.', ja: 'ガンマフリップ$235。' } }],
        repricingCondition: { ko: '$235 돌파 시', en: 'Above $235', ja: '$235超え' },
    };
    const r = checkFlowAnalysis(analysis, NVDA);
    assert.equal(r.ok, false); assert.deepEqual(r.badLocales, ['ja']);
    analysis.structuralThesis.ja = 'コールウォール$235とプットフロア$220の間で…';
    assert.equal(checkFlowAnalysis(analysis, NVDA).ok, true);
});
t('입구 — 요청 가격이 서버 가격(정규장·시간외·전일 종가)과 3% 넘게 다르면 거절', () => {
    assert.equal(flowPriceMatchesServer(188.75, [333.69, 334.1, 330.2]), false);   // AAPL 요청에 PLTR 가격
    assert.equal(flowPriceMatchesServer(334.5, [333.69, 334.1, 330.2]), true);
    assert.equal(flowPriceMatchesServer(240.1, [233.95, 241.0, 230.86]), true);    // 시간외 가격과 맞으면 통과
    assert.equal(flowPriceMatchesServer(200, []), true);                          // 서버 가격을 모르면 판정 안 함(출구 대조가 남는다)
    assert.equal(flowPriceMatchesServer(0, [233.95]), false);
});
t('basis — 0·N/A 는 없는 값, 티커는 대문자', () => {
    assert.equal(NVDA.ticker, 'NVDA'); assert.equal(NVDA.maxPain, null);
    assert.deepEqual(NVDA.extras, [240, 3.1]);
    assert.equal(basisFromFlowData('X', { currentPrice: 'N/A' }).price, 0);
});
t('재생성 실측(10/4 23:20Z) — «$190 … 1.25% above»(실제 0.66%, $1.25 를 % 로 씀)는 걸리고, 맞는 거리 문장은 통과', () => {
    const pltr = basisFromFlowData('PLTR', { currentPrice: 188.75, position: { callWall: 200, putFloor: 170 }, regime: { gammaFlipLevel: 190 } });
    assert.equal(checkFlowText('Gamma flip level $190 sits just 1.25% above current price $188.75; SHORT_GAMMA regime.', pltr).length, 1);
    assert.equal(checkFlowText('$190 감마 플립 레벨은 현재 가격 $188.75에서 단 1.25% 상방에 위치하며', pltr).length, 1);
    assert.deepEqual(checkFlowText('Asymmetric distance between $200 call wall and $170 put floor (6.0% vs 9.9%) reveals hedging.', pltr), []);
    assert.deepEqual(checkFlowText('감마 플립 레벨($337.5)이 현재 가격($333.69)으로부터 1.1% 상방에 위치한 구조는', AAPL), []);
    assert.deepEqual(checkFlowText('Gamma flip $190 sits 0.7% above spot; squeeze probability 45% higher than usual.', pltr), []);
    assert.deepEqual(checkFlowText('현물 $188.75 위 $190 감마 플립이 있고, 콜월은 6% 위에 있다.', pltr), []);   // 수준 이름만 쓴 거리(콜월 5.96%) — 10/4 오탐
});
console.log(`\n${n} passed`);
