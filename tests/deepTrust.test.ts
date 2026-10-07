/**
 * Command AI 딥 분석 신뢰 레이어 — src/lib/ai/deepTrust.ts (+ trustCache.presentTrust)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/deepTrust.test.ts
 *
 * 문장은 운영 실측(2026-10-07 NVDA 딥 분석 캐시)에서 가져왔다 — 뉴스 인용 «2027년 NVIDIA가 빛날 것으로 예상»은 통과, 내부 예측어는 걸림.
 */
import assert from 'node:assert/strict';
import {
    isTrustDeepSnapshot, deepTrustCacheKey, deepMaterialIssues, deepTextSlots, trustDeepSystem, trustDeepUserPrompt,
    gateDeepAnalysis, fillDeepAnalysis, recheckStoredDeep, staleBasisFromDeepSnapshot, staleNowFromDeepSnapshot, TRUST_DEEP_RULES,
} from '@/lib/ai/deepTrust';
import { flowTokensFromDeepSnapshot } from '@/lib/ai/flowTokens';
import { basisFromDeepSnapshot } from '@/lib/ai/deepNumbers';
import { presentTrust } from '@/lib/ai/trustCache';
import { flowStaleness } from '@/lib/ai/trustLayer';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const SNAP: any = {
    trustLayer: 1, materialPhase: 'complete', ticker: 'NVDA', price: 239.24, session: 'CLOSED',
    structure: { callWall: 245, putFloor: 230, maxPain: 230, gammaFlipLevel: 240, pcRatio: 0.84, netGex: 516.6e6 },
    flow: { netPremium: 158_500_000 }, sma: { sma50: 218.92, sma200: 201.02 }, volatility: { regime: 'CALM' }, technicals: { adx: { value: 18.63 } },
};
const TK = flowTokensFromDeepSnapshot(SNAP);
const BASIS = basisFromDeepSnapshot('NVDA', SNAP);

t('표식·캐시 칸 — 웹(표식 없음)은 v2 그대로', () => {
    assert.equal(isTrustDeepSnapshot(SNAP), true);
    assert.equal(isTrustDeepSnapshot({ price: 1 }), false);
    assert.equal(deepTrustCacheKey('nvda'), 'ai-deep-analysis:v3:NVDA');
});
t('재료 완결 — 정착 표식·가격·지표 그룹 3개 이상', () => {
    assert.equal(deepMaterialIssues(SNAP).ok, true);
    assert.ok(deepMaterialIssues({ ...SNAP, materialPhase: 'partial' }).reasons.includes('phase:partial'));
    assert.ok(deepMaterialIssues({ ...SNAP, price: 0 }).reasons.includes('price'));
    assert.ok(deepMaterialIssues({ trustLayer: 1, materialPhase: 'complete', price: 100, structure: { callWall: 1 } }).reasons.includes('groups'));
});

const GOOD = {
    currentState: { ko: '중립 — 현물 {PRICE} 이 감마 플립 {GAMMA_FLIP} 아래 {DIST_FLIP} 에 있다.', en: 'NEUTRAL — spot {PRICE} sits {DIST_FLIP} below the {GAMMA_FLIP} gamma flip.', ja: '中立 — 現物{PRICE}はガンマフリップ{GAMMA_FLIP}の{DIST_FLIP}下にある。' },
    sections: [
        { title: { ko: '옵션 포지셔닝', en: 'Options Positioning', ja: 'オプションポジショニング' },
          content: { ko: 'P/C {PC} 로 콜 거래가 우세하고 순 프리미엄은 {NET_PREM} 이다. 콜 월 {CALL_WALL} 까지 {DIST_CALL}.', en: 'P/C of {PC} shows call-led volume with net premium at {NET_PREM}; the call wall {CALL_WALL} is {DIST_CALL} away.', ja: 'P/C {PC}でコール出来高が優位、純プレミアムは{NET_PREM}。コールウォール{CALL_WALL}まで{DIST_CALL}。' } },
    ],
    keyInsight: { ko: '황금교차(SMA50 $218.92 > SMA200 $201.02)와 중립 감마가 공존한다.', en: 'A golden cross (SMA50 $218.92 > SMA200 $201.02) coexists with neutral gamma.', ja: 'ゴールデンクロス(SMA50 $218.92 > SMA200 $201.02)と中立ガンマが共存している。' },
};

t('글 칸 — 섹션 제목은 글이 아니다', () => {
    assert.deepEqual(deepTextSlots(GOOD).map((s) => s.path), ['currentState', 'sections[0].content', 'keyInsight']);
});
t('정상 글은 통과 — 자리표 + 이동평균 같은 데이터 값은 그대로', () => {
    const g = gateDeepAnalysis(GOOD, TK, BASIS);
    assert.equal(g.ok, true, g.reasons.join(' | '));
});
t('실측 — 뉴스 인용(«Barron\'s … 2027년 NVIDIA가 빛날 것으로 예상»)은 통과(연도 검사도 끈다)', () => {
    const a = JSON.parse(JSON.stringify(GOOD));
    a.sections[0].content.ko += ' Barron\'s 기사는 "2027년 NVIDIA가 빛날 것으로 예상"이라 평가하고 있다.';
    const g = gateDeepAnalysis(a, TK, BASIS);
    assert.equal(g.ok, true, g.reasons.join(' | '));
    assert.equal(g.stripped, 0);
});
t('내부 예측어는 빠진다 — «구조적 재가격 결정이 일어날 수 있다»는 통과, «상승 모멘텀이 이어질 것이다» 는 제거', () => {
    const a = JSON.parse(JSON.stringify(GOOD));
    a.sections[0].content.ko += ' 감마 구조가 상승 모멘텀을 이어갈 것이다.';
    a.sections[0].content.en += ' Momentum will continue to build above the flip.';
    const g = gateDeepAnalysis(a, TK, BASIS);
    assert.equal(g.ok, true, g.reasons.join(' | '));
    assert.equal(g.stripped, 2);
});
t('가격 수준이 재료와 다르면 탈락 — «$260 콜 월»', () => {
    const a = JSON.parse(JSON.stringify(GOOD));
    a.sections[0].content.en = 'Spot {PRICE} is capped by a $260 call wall while P/C of {PC} stays call-led.';
    const g = gateDeepAnalysis(a, TK, BASIS);
    assert.equal(g.ok, false);
    assert.ok(g.reasons.some((r) => r.startsWith('level:')));
});
t('채움 — 지금 화면 값(P/C 0.84 → 0.86)', () => {
    const g = gateDeepAnalysis(GOOD, TK, BASIS);
    const f = fillDeepAnalysis(g.analysis, { ...TK, PC: 0.86 }, TK);
    assert.match(f.analysis.sections[0].content.ko, /P\/C 0\.86/);
    assert.deepEqual(f.missing, []);
});
t('저장본 재검사·presentTrust — 낡았을 때 생성 시각 표기 + 방향 서술 문장 제거', () => {
    const g = gateDeepAnalysis(GOOD, TK, BASIS);
    const stored = { tpl: g.analysis, basisTokens: TK, generatedAt: '2026-10-07T15:05:00Z', ticker: 'NVDA', session: 'CLOSED', trust: 1 };
    assert.deepEqual(recheckStoredDeep(g.analysis, TK), []);
    const plain = presentTrust(stored, deepTextSlots, TK, 'plain', 'currentState')!;
    assert.doesNotMatch(plain.analysis.currentState.ko, /\(생성/);
    const stale = presentTrust(stored, deepTextSlots, TK, 'stale', 'currentState')!;
    assert.match(stale.analysis.currentState.en, /\(as of 11:05 ET\)$/);
    assert.equal(stale.meta.staleMode, 'stale');
    // 방향·위치 서술(«below»·«아래»)만 있는 헤드라인은 usable 이 아니므로 그대로 둔다(문장을 비우지 않는다)
    assert.ok(stale.analysis.currentState.en.length > 10);
    // 자리표를 채울 수 없으면 null(호출자가 생성으로 넘어간다)
    assert.equal(presentTrust({ ...stored, basisTokens: {} }, deepTextSlots, null, 'plain'), null);
});
t('낡음 — 기준·지금 모양(structure 가격 수준 · session)', () => {
    const b = staleBasisFromDeepSnapshot(SNAP);
    assert.equal(b.gammaFlip, 240);
    assert.equal(flowStaleness(b, staleNowFromDeepSnapshot({ ...SNAP, price: 241 })).level, 'stale');
});
t('프롬프트 — 원문 critical_rules 끝에 규칙 추가, 자리표 규칙은 XML 끝', () => {
    const legacy = 'You are X.\n<critical_rules>\n- A\n</critical_rules>';
    const out = trustDeepSystem(legacy);
    assert.match(out, /- A\n- NUMBERS \(TOKENS\)/);
    assert.ok(out.trim().endsWith('</critical_rules>'));
    assert.match(TRUST_DEEP_RULES, /NO FORECASTS/);
    const u = trustDeepUserPrompt('<ticker_analysis>\n  <x/>\n</ticker_analysis>', TK);
    assert.match(u, /<number_tokens>[\s\S]*\{PC\} = 0\.84[\s\S]*<\/ticker_analysis>$/);
});

console.log(`\n${n} passed`);
