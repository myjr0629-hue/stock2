/**
 * 종목 AI 글 자리표 — src/lib/ai/flowTokens.ts : 채움 · 자동 자리표화 · 숫자로 박힌 지표 대조
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/flowTokens.test.ts
 *
 * 출발점(2026-10-07 0단계 발견 · 보고서 §5.2 ①): AI INTEL 글 «스퀴즈 99%·P/C 1.93·고래 프리미엄 $50.4M» ↔ 같은 화면 패널 «6%·1.62·+$158.5M»
 *   (조기 재료로 생성된 글이 캐시에 남았다). 아래 값은 운영 NVDA(10/7 화면)의 실제 값이다.
 */
import assert from 'node:assert/strict';
import {
    flowTokensFromFlowData, flowTokensFromDeepSnapshot, formatFlowToken, fillFlowTokens, hasFlowTokens,
    flowTokenRules, flowLiterals, checkFlowLiterals, tokenizeFlowLiterals, stripUnknownTokenSentences,
} from '@/lib/ai/flowTokens';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

// 운영 NVDA 10/7 (앱 화면이 보내는 재료 모양)
const FLOW = {
    ticker: 'NVDA', currentPrice: 239.24, compositeScore: 15, netPremium: 158_500_000,
    position: { putFloor: 230, callWall: 245 },
    regime: { gammaFlipLevel: 240, maxPain: 230 },
    factors: { opi: { value: 47, score: -1 }, pcRatio: { value: 0.62, score: 3, definition: 'put_over_call' }, squeeze: { probability: 6 }, whale: { premiumUsd: 4_600_000 } },
};
const TK = flowTokensFromFlowData(FLOW);

t('재료 → 자리표 값 (가격·수준·거리·P/C·점수·금액)', () => {
    assert.equal(TK.PRICE, 239.24);
    assert.equal(TK.CALL_WALL, 245);
    assert.equal(TK.PC, 0.62);
    assert.equal(TK.COMPOSITE, 15);
    assert.equal(TK.SQUEEZE, 6);
    assert.equal(TK.NET_PREM, 158_500_000);
    assert.equal(formatFlowToken('DIST_CALL', TK.DIST_CALL!), '2.4%');     // |245-239.24|/239.24
    assert.equal(formatFlowToken('DIST_PUT', TK.DIST_PUT!), '3.9%');       // |239.24-230|/239.24
    assert.equal(formatFlowToken('DIST_FLIP', TK.DIST_FLIP!), '0.3%');     // |239.24-240|/240
});
t('화면과 같은 표기 — «$239.24»·«$245»·«0.62»·«+15»·«6%»·«+$158.5M»', () => {
    assert.equal(formatFlowToken('PRICE', 239.24), '$239.24');
    assert.equal(formatFlowToken('CALL_WALL', 245), '$245');
    assert.equal(formatFlowToken('GAMMA_FLIP', 337.5), '$337.5');
    assert.equal(formatFlowToken('PC', 0.62), '0.62');
    assert.equal(formatFlowToken('COMPOSITE', 15), '+15');
    assert.equal(formatFlowToken('COMPOSITE', -18), '-18');
    assert.equal(formatFlowToken('SQUEEZE', 6.2), '6%');
    assert.equal(formatFlowToken('NET_PREM', 158_500_000), '+$158.5M');
    assert.equal(formatFlowToken('NET_PREM', -420_000), '-$420K');
});
t('채움 — 지금 화면 값 우선, 없으면 생성 때 값, 둘 다 없으면 자리표를 남기고 missing', () => {
    const tpl = '현물 {PRICE} 이 콜 월 {CALL_WALL} 아래 {DIST_CALL} 에 있고 P/C {PC}, 스퀴즈 {SQUEEZE}.';
    const f = fillFlowTokens(tpl, TK);
    assert.equal(f.text, '현물 $239.24 이 콜 월 $245 아래 2.4% 에 있고 P/C 0.62, 스퀴즈 6%.');
    assert.deepEqual(f.missing, []);
    // 지금 화면 값이 생성 때와 다르면 «지금 값» — 같은 화면의 숫자와 글이 같다
    const now = { ...TK, PC: 0.64, PRICE: 241.1 };
    assert.equal(fillFlowTokens('P/C {PC}, 현물 {PRICE}', now, TK).text, 'P/C 0.64, 현물 $241.10');
    // 지금 값이 비어 있으면 생성 때 값
    assert.equal(fillFlowTokens('P/C {PC}', {}, TK).text, 'P/C 0.62');
    // 둘 다 없으면 자리표가 남는다 → 호출자는 그 글을 쓰지 않는다
    const miss = fillFlowTokens('고래 {WHALE_PREM}, 맥스페인 {MAX_PAIN}', { MAX_PAIN: 230 }, {});
    assert.deepEqual(miss.missing, ['WHALE_PREM']);
    assert.ok(hasFlowTokens(miss.text));
});
t('모델이 단위를 또 붙인 실수는 삼킨다 — «{DIST_CALL}%»(→ 2.4% 한 번)·«${PRICE}»(→ $239.24 한 번)·단위 없는 자리표 뒤 «{PC}%» 는 그대로', () => {
    assert.equal(fillFlowTokens('콜 월 {DIST_CALL}% 위, 현물 ${PRICE} 에서', TK).text, '콜 월 2.4% 위, 현물 $239.24 에서');
    assert.equal(fillFlowTokens('범위 ({DIST_PUT} 대 {DIST_CALL})', TK).text, '범위 (3.9% 대 2.4%)');
    assert.equal(fillFlowTokens('P/C {PC}%p', TK).text, 'P/C 0.62%p');
});
t('지어낸 자리표({SMART_MONEY})가 든 문장만 뺀다 — 10/7 프리뷰 실측(token-unknown 으로 생성 전체가 탈락했다)', () => {
    const r = stripUnknownTokenSentences('P/C {PC} 로 콜 우위다. 스마트머니 {SMART_MONEY} 는 약세다. 현물 {PRICE} 은 플립 아래다.');
    assert.equal(r.removed.length, 1);
    assert.equal(r.usable, true);
    assert.equal(r.text, 'P/C {PC} 로 콜 우위다. 현물 {PRICE} 은 플립 아래다.');
    assert.equal(stripUnknownTokenSentences('P/C {PC}.').removed.length, 0);
    assert.equal(stripUnknownTokenSentences('{SMART_MONEY} 만 있는 한 문장.').usable, false);
});
t('소문자 이름의 지어낸 자리표({insider_net})도 모르는 자리표다 — 10/7 프리뷰 딥 분석 실측', () => {
    assert.equal(fillFlowTokens('임원 순매도({insider_net}) 와 P/C {PC}', TK).unknown, true);
    const r = stripUnknownTokenSentences('P/C {PC} 로 콜 거래가 우세하고 현물은 플립 아래에 있다. 임원 순매도({insider_net}) 가 있다.');
    assert.deepEqual([r.removed.length, r.usable, r.text], [1, true, 'P/C {PC} 로 콜 거래가 우세하고 현물은 플립 아래에 있다.']);
});
t('모르는 자리표({FOO})는 unknown 으로 표시 — 화면에 중괄호가 나가지 않게', () => {
    const f = fillFlowTokens('값 {FOO} 와 {PC}', TK);
    assert.equal(f.unknown, true);
});

// ── 숫자로 박힌 지표 ─────────────────────────────────────────────────────────────
t('실측 불일치(0단계) — 글 «P/C 1.93»·«스퀴즈 99%» ↔ 화면 0.62·6% 는 걸린다', () => {
    const bad = checkFlowLiterals('고래 프리미엄이 우세하고 P/C 1.93 풋 헤비, 스퀴즈 확률 99% 로 압축되어 있다.', TK);
    assert.equal(bad.length, 2, bad.join('|'));
    assert.ok(bad.some((b) => b.startsWith('metric:PC:1.93')));
    assert.ok(bad.some((b) => b.startsWith('metric:SQUEEZE:99')));
});
t('맞는 값은 통과 — «P/C 0.62»·«스퀴즈 6%»·«OPI 47»·«종합 +15»·en·ja', () => {
    assert.deepEqual(checkFlowLiterals('P/C 0.62, 스퀴즈 6%, OPI 47, 종합 점수 +15 로 중립이다.', TK), []);
    assert.deepEqual(checkFlowLiterals('The put/call ratio of 0.62 and squeeze probability of 6% with OPI 47 and a composite score of +15.', TK), []);
    assert.deepEqual(checkFlowLiterals('P/C比0.62、スクイーズ確率6%、OPI 47、総合スコア+15。', TK), []);
});
t('«OPI 스코어 -1» 같은 구성 점수는 지표 값이 아니다 — 대조하지 않는다', () => {
    assert.deepEqual(checkFlowLiterals('OPI +47 은 콜 우위처럼 보이지만 OPI 스코어 -1 로 감점되었다.', { OPI: 47 }), []);
    assert.deepEqual(checkFlowLiterals('OPI +47 / Score -1', { OPI: 47 }), []);
});
t('문턱·범위는 «지금 값» 주장이 아니다 — 운영 생성 실측(0.75 를 P/C 값으로 오인): «P/C below 0.75»·«P/C 0.75 미만»·«P/C (0.75–1.3)»', () => {
    assert.deepEqual(checkFlowLiterals('The put/call ratio below 0.75 marks call-heavy flow.', TK), []);
    assert.deepEqual(checkFlowLiterals('P/C 0.75 미만은 콜 우위 구간이다.', TK), []);
    assert.deepEqual(checkFlowLiterals('P/C 비율의 중립 범위(0.75~1.3)', TK), []);
    // 그래도 지금 값 주장은 잡는다
    assert.equal(checkFlowLiterals('P/C 0.75 로 중립이다.', TK).length, 1);
});
t('값을 모르는 지표는 판정하지 않는다', () => {
    assert.deepEqual(checkFlowLiterals('P/C 1.93', { PRICE: 100 }), []);
});
t('flowLiterals — 위치·단위 (스퀴즈 % 는 숫자에 포함하지 않는다)', () => {
    const lits = flowLiterals('스퀴즈 6%, P/C 0.62');
    assert.deepEqual(lits.map((l) => [l.key, l.written]), [['SQUEEZE', '6'], ['PC', '0.62']]);
});

// ── 자동 자리표화 ───────────────────────────────────────────────────────────────
t('모델이 숫자를 직접 썼어도 재료와 같으면 자리표로 — 가격·수준·P/C·스퀴즈·점수', () => {
    const raw = '현물 $239.24 이 콜 월 $245 아래이고 P/C 0.62, 스퀴즈 6%, 종합 +15.';
    const out = tokenizeFlowLiterals(raw, TK);
    assert.equal(out, '현물 {PRICE} 이 콜 월 {CALL_WALL} 아래이고 P/C {PC}, 스퀴즈 {SQUEEZE}, 종합 {COMPOSITE}.');
    assert.equal(fillFlowTokens(out, TK).text, raw);
});
t('다른 값은 그대로 둔다(출구 대조가 판정) — 같은 표기 수준 둘(콜 월=감마 플립 $240)은 건드리지 않는다', () => {
    assert.equal(tokenizeFlowLiterals('P/C 1.93', TK), 'P/C 1.93');
    const tk2 = flowTokensFromFlowData({ ...FLOW, position: { putFloor: 230, callWall: 240 }, regime: { gammaFlipLevel: 240 } });
    assert.equal(tokenizeFlowLiterals('$240 부근', tk2), '$240 부근');
});
t('금액·단위 붙은 값은 수준으로 보지 않는다 — «$245M»', () => {
    assert.equal(tokenizeFlowLiterals('프리미엄 $245M 이 콜 월 $245 에', TK), '프리미엄 $245M 이 콜 월 {CALL_WALL} 에');
});
t('부호 없는 «종합 15» 는 자리표(+15)로 바꾸지 않는다 — 부호가 생긴다', () => {
    assert.equal(tokenizeFlowLiterals('종합 15', TK), '종합 15');
});

// ── 딥 분석 snapshot ────────────────────────────────────────────────────────────
t('딥 분석 snapshot → 자리표 값', () => {
    const k = flowTokensFromDeepSnapshot({ price: 239.24, structure: { callWall: 245, putFloor: 230, maxPain: 230, gammaFlipLevel: 240, pcRatio: 0.84 }, flow: { netPremium: 158_500_000 } });
    assert.equal(k.PC, 0.84);
    assert.equal(k.NET_PREM, 158_500_000);
    assert.equal(formatFlowToken('MAX_PAIN', k.MAX_PAIN!), '$230');
});
t('프롬프트 규칙 — 값이 있는 자리표만, 지금 화면 값과 함께', () => {
    const r = flowTokenRules({ PRICE: 239.24, PC: 0.62 });
    assert.match(r, /\{PRICE\} = \$239\.24/);
    assert.match(r, /\{PC\} = 0\.62/);
    assert.doesNotMatch(r, /CALL_WALL/);
    assert.equal(flowTokenRules({}), '');
});

console.log(`\n${n} passed`);
