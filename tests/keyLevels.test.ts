/**
 * 크로스섹터 keyLevels «입력에 있는 수준만» — src/lib/ai/keyLevels.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/keyLevels.test.ts
 * 출발점(10/9 운영 저장본): 입력 «S&P500: 7812 … US10Y: 5.24% … VIX3M: 17.77» 인데 keyLevels = S&P 지지 7,750 · 저항 7,900 · US10Y 5.30% · VIX 임계 17.0
 */
import assert from 'node:assert/strict';
import { groundKeyLevels, isGroundedLevel, enforceKeyLevels, sanitizeServedBrief, levelGroundText, KEYLEVELS_SCHEMA_EXAMPLE, KEYLEVELS_REQUIREMENT } from '@/lib/ai/keyLevels';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

const MACRO = 'VIX: 14.84 (-3.70%) | VIX3M: 17.77 (-1.71%) | VIX/VIX3M Ratio: 0.835 (CONTANGO ✓) | S&P500: 7812 (+0.59%) | NASDAQ: 27366 (+0.64%) | DOW: 51655 (+0.83%) | US10Y: 5.24% (+1bp) | Gold: 4216 (+1.43%)';
const FRI_LEVELS = [
    { label: 'S&P 500 Support', value: '7,750' },
    { label: 'S&P 500 Resistance', value: '7,900' },
    { label: 'US10Y Critical Level', value: '5.30%' },
    { label: 'VIX Threshold', value: '17.0' },
];

t('운영 10/9 저장본: 지어낸 4칸 전부 제거', () => {
    const r = groundKeyLevels(FRI_LEVELS, MACRO);
    assert.equal(r.kept.length, 0);
    assert.equal(r.dropped.length, 4);
});
t('입력에 찍힌 값은 남긴다: VIX3M 17.77 · 쉼표/소수 표기 차이(7,812 = 7812) · 퍼센트(5.24%)', () => {
    const lv = [{ label: 'VIX3M', value: '17.77' }, { label: 'S&P500 close', value: '7,812' }, { label: 'US10Y', value: '5.24%' }];
    assert.equal(groundKeyLevels(lv, MACRO).kept.length, 3);
});
t('반올림 표기만 허용: 17.8 ← 17.77 · 더 자세한 17.771 과 내림 7,810 ← 7,812 는 불일치', () => {
    assert.equal(isGroundedLevel({ label: 'VIX3M', value: '17.8' }, MACRO), true);
    assert.equal(isGroundedLevel({ label: 'VIX3M', value: '17.771' }, MACRO), false);
    assert.equal(isGroundedLevel({ label: 'S&P500', value: '7,810' }, MACRO), false);
});
t('옵션 구조 수준(Call Wall·Gamma Flip …)이 입력에 있으면 남는다', () => {
    const ground = `${MACRO}\nSPY options structure: Call Wall 790, Put Floor 770, Max Pain 780, Gamma Flip 775.5`;
    const lv = [{ label: 'SPY Call Wall', value: '790' }, { label: 'SPY Gamma Flip', value: '775.5' }, { label: 'SPY Max Pain', value: '781' }];
    const r = groundKeyLevels(lv, ground);
    assert.deepEqual(r.kept.map((x) => x.label), ['SPY Call Wall', 'SPY Gamma Flip']);
    assert.deepEqual(r.dropped.map((x) => x.label), ['SPY Max Pain']);
});
t('1~10 작은 정수도 수준 값으로는 면제하지 않는다(입력에 없는 «5»)', () => {
    assert.equal(isGroundedLevel({ label: 'X', value: '5' }, 'VIX: 14.84'), false);
});
t('숫자가 없거나 값이 문자열이 아닌 칸은 수준이 아니다', () => {
    assert.equal(isGroundedLevel({ label: 'S&P 500 Support', value: 'N/A' }, MACRO), false);
    assert.equal(isGroundedLevel({ label: 'S&P 500 Support', value: 7750 as any }, MACRO), false);
    assert.equal(isGroundedLevel(null, MACRO), false);
    assert.deepEqual(groundKeyLevels('x' as any, MACRO), { kept: [], dropped: [] });
});
t('뉴스 속 숫자는 근거가 아니다: levelGroundText 가 뉴스 구획을 뺀다', () => {
    const prompt = `## 13 Macro Indicators\n${MACRO}\n\n## Real-time Market News (from Polygon)\n1. S&P 500 at 10,000 or bust — Gold tests $4,200\n2. other\n\n## Upcoming Economic Events (FMP Live)\n- D-2 2026-10-13: CPI (HIGH)\n\n## 10 Sector Summaries\n[]`;
    const g = levelGroundText(prompt);
    assert.equal(/10,000|4,200/.test(g), false);
    assert.equal(/7812/.test(g), true);
    assert.equal(/2026-10-13/.test(g), true);
    assert.equal(isGroundedLevel({ label: 'S&P 500 Resistance', value: '10,000' }, g), false);
});
t('enforceKeyLevels: 제자리 제거 + 개수 반환, outlook 없으면 0', () => {
    const s: any = { outlook: { bias: 'BULLISH', keyLevels: [...FRI_LEVELS, { label: 'VIX3M', value: '17.77' }] } };
    assert.equal(enforceKeyLevels(s, MACRO), 4);
    assert.deepEqual(s.outlook.keyLevels, [{ label: 'VIX3M', value: '17.77' }]);
    assert.equal(enforceKeyLevels({}, MACRO), 0);
    assert.equal(enforceKeyLevels({ outlook: { keyLevels: 'x' } }, MACRO), 0);
});
t('sanitizeServedBrief: 저장본 사본에서 거른다(원본 불변) · 거를 게 없으면 같은 객체', () => {
    const brief: any = { success: true, structured: { outlook: { bias: 'NEUTRAL', keyLevels: [...FRI_LEVELS] } }, macroSnapshot: MACRO, macroIndicators: [{ key: 'VIX3M', value: 17.77 }], vixTermStructure: { vix: 14.84, vix3m: 17.77, ratio: 0.835 } };
    const r = sanitizeServedBrief(brief);
    assert.equal(r.dropped, 4);
    assert.deepEqual(r.brief.structured.outlook.keyLevels, []);
    assert.equal(brief.structured.outlook.keyLevels.length, 4);       // 원본 불변
    assert.equal(r.brief.structured.outlook.bias, 'NEUTRAL');          // 다른 칸 보존
    const ok: any = { structured: { outlook: { keyLevels: [{ label: 'VIX3M', value: '17.77' }] } }, macroSnapshot: MACRO };
    const r2 = sanitizeServedBrief(ok);
    assert.equal(r2.dropped, 0); assert.equal(r2.brief, ok);
    const none: any = { structured: { outlook: {} } };
    assert.equal(sanitizeServedBrief(none).brief, none);
});
t('프롬프트 조각: 지어낸 예시 수(5,800·6,200·25,000·20.0)가 더는 없고 «빈 배열이 정답» 문구가 있다', () => {
    assert.equal(/5,800|6,200|25,000|20\.0/.test(KEYLEVELS_SCHEMA_EXAMPLE + KEYLEVELS_REQUIREMENT), false);
    assert.equal(/return "keyLevels": \[\]/.test(KEYLEVELS_REQUIREMENT), true);
});

// ── Lambda 판(CommonJS, scripts/lambda-cross-sector/keyLevels.js)과 같은 문구·같은 판정 — 두 구현이 어긋나지 않게 ─────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-require-imports
const LAMBDA = require('../scripts/lambda-cross-sector/keyLevels');
t('Lambda 판: 프롬프트 문구가 TS 판과 글자까지 같다', () => {
    assert.equal(LAMBDA.SCHEMA_EXAMPLE, KEYLEVELS_SCHEMA_EXAMPLE);
    assert.equal(LAMBDA.REQUIREMENT, KEYLEVELS_REQUIREMENT);
});
t('Lambda 판: 같은 입력·같은 칸에서 TS 판과 같은 결론(운영 10/8·10/9 저장본 실측 포함)', () => {
    const cases: Array<[string, string]> = [
        ['7,750', MACRO], ['7,900', MACRO], ['5.30%', MACRO], ['17.0', MACRO], ['18.0 (VIX3M level)', MACRO],
        ['17.77', MACRO], ['17.8', MACRO], ['17.771', MACRO], ['7,812', MACRO], ['7812', MACRO], ['7,810', MACRO], ['5.24%', MACRO], ['5', MACRO], ['N/A', MACRO], ['0.835', MACRO],
    ];
    const cands = LAMBDA.groundNumbers(MACRO);
    for (const [value, ground] of cases) {
        const ts = isGroundedLevel({ label: 'x', value }, ground);
        const lam = LAMBDA.isGroundedLevel({ label: 'x', value }, cands);
        assert.equal(lam, ts, `value=${value} ts=${ts} lambda=${lam}`);
    }
    const s: any = { outlook: { keyLevels: [...FRI_LEVELS, { label: 'VIX3M', value: '17.77' }] } };
    assert.equal(LAMBDA.enforceKeyLevels(s, MACRO), 4);
    assert.deepEqual(s.outlook.keyLevels, [{ label: 'VIX3M', value: '17.77' }]);
    assert.equal(LAMBDA.enforceKeyLevels({}, MACRO), 0);
});

console.log(`\n${n} passed`);
