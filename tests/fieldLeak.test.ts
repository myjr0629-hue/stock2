/**
 * 내부 필드명 누출 검사 — src/lib/ai/fieldLeak.ts + UC 출구(ucCardsGate · enforceLean)
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/fieldLeak.test.ts
 * 출발점(10/11 표본): UC tickerRead «… oiPcr 0.75 …» 같은 내부 필드명이 화면 문구로 샜다(현행 2/30 · 깊이 3/30).
 */
import assert from 'node:assert/strict';
import { findFieldNameLeaks, camelKeysOf, findLeaksInFields, INTERNAL_FIELD_NAMES } from '@/lib/ai/fieldLeak';
import { ucCardsGate, enforceLean, buildSystem } from '../src/app/api/undercurrent/shared';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

t('운영 실측형: «oiPcr 0.75» · 한국어/일본어 글 속 · 어미가 붙은 경우', () => {
    assert.deepEqual(findFieldNameLeaks('콜이 우세하며 oiPcr 0.75 수준이다'), ['oiPcr']);
    assert.deepEqual(findFieldNameLeaks('oiPcr는 0.75이고 volumePutCallRatio는 0.4'), ['oiPcr', 'volumePutCallRatio']);
    assert.deepEqual(findFieldNameLeaks('建玉のoiPcrは0.75'), ['oiPcr']);
    assert.deepEqual(findFieldNameLeaks('The oiPcr of 0.75 shows call-heavy positioning'), ['oiPcr']);
});
t('일반형: darkPoolPct · newOiNotionalText (두 마디 이상 camelCase) · 대소문자 변형 OIPCR', () => {
    assert.deepEqual(findFieldNameLeaks('darkPoolPct 42%'), ['darkPoolPct']);
    assert.deepEqual(findFieldNameLeaks('fooBarBaz is internal'), ['fooBarBaz']);
    assert.deepEqual(findFieldNameLeaks('OIPCR 0.75'), ['OIPCR']);
});
t('오탐 없음: 브랜드·약어·금융 공통어·사람이 읽는 표현', () => {
    for (const ok of [
        'Apple iPhone 17 and iPad demand', 'eBay and iShares ETF flows', 'iRobot', 'macOS', 'YouTube and OpenAI', 'ChatGPT', 'McDonald',
        'P/C 0.75 — put-heavy', '풋÷콜 0.75', 'Max Pain 330, Call Wall 340, Put Floor 320', 'Gamma Flip', 'S&P 500', 'GEX RSI VIX3M', 'put/call ratio of 0.75',
        'NVDA 콜옵션 신규 포지션', '맥스페인', 'AMD vs Qualcomm', '2s10s', 'Form 4',
    ]) assert.deepEqual(findFieldNameLeaks(ok), [], ok);
});
t('입력 JSON 의 키를 추가 키로 — 목록에 없는 한 마디 키도 잡는다', () => {
    const input = '{"money":{"fooBar":1,"price":300,"oiPcr":0.75}}';
    const keys = camelKeysOf(input);
    assert.deepEqual(keys.sort(), ['fooBar', 'oiPcr']);
    assert.deepEqual(findFieldNameLeaks('fooBar is high', keys), ['fooBar']);
    assert.deepEqual(findFieldNameLeaks('fooBar is high'), []);
});
t('findLeaksInFields: 지정 칸만 본다', () => {
    assert.deepEqual(findLeaksInFields({ moneyRead: 'oiPcr 0.8', other: 'maxPain' }, ['moneyRead']), ['oiPcr']);
    assert.deepEqual(findLeaksInFields(null, ['x']), []);
});
t('내부 이름 목록은 전부 camelCase(대문자 포함) — 일반 영단어를 막지 않는다', () => {
    for (const k of INTERNAL_FIELD_NAMES) assert.equal(/[a-z][A-Z]/.test(k), true, k);
});

// ── UC 출구 ───────────────────────────────────────────────────────────────────
const cardOk = { plainTitle: '애플 신제품 발표', whyItMatters: '아이폰 수요가 실적에 영향을 줄 수 있다.', moneyRead: '옵션 포지션은 콜 쪽이 우세합니다(풋÷콜 0.75).', moneyMood: 'bullish', divergence: false, tag: '실적' };
const j = (o: unknown) => JSON.stringify(o);

t('ucCardsGate: 깨끗한 응답 통과 · moneyRead/whyItMatters/tickerRead 어디든 누출이면 거절', () => {
    const gate = ucCardsGate('ko', 1);
    assert.equal(gate(j({ cards: [cardOk] })), true);
    assert.equal(gate(j({ tickerRead: '콜이 우세합니다', cards: [cardOk] })), true);
    assert.equal(gate(j({ cards: [{ ...cardOk, moneyRead: '옵션 포지션 oiPcr 0.75 로 콜 우세' }] })), false);
    assert.equal(gate(j({ cards: [{ ...cardOk, whyItMatters: 'darkPoolPct 가 높아 관심이 필요하다.' }] })), false);
    assert.equal(gate(j({ tickerRead: 'oiPcr 0.75 로 콜 쪽이 우세', cards: [cardOk] })), false);
});
t('enforceLean: 마지막 단의 누출은 칸 단위로 고친다 — moneyRead/tickerRead → 사실 문장, whyItMatters → 비움', () => {
    const money = { oiPcr: 0.75, volumePcr: 2.0, price: 300 } as any;
    const cards: any[] = [{ ...cardOk, moneyRead: 'oiPcr 0.75 로 콜 우세', whyItMatters: 'maxPain 근처', plainTitle: 'oiPcr 기사', money }];
    const box: any = { tickerRead: '콜이 우세한 oiPcr 0.75' };
    const fixed = enforceLean('ko', cards, { sourceOf: () => ({ title: 'Apple unveils product' }), extra: { box, field: 'tickerRead', money } });
    assert.equal(fixed, 4);
    assert.equal(findFieldNameLeaks(cards[0].moneyRead).length, 0);
    assert.equal(cards[0].whyItMatters, null);
    assert.equal(cards[0].plainTitle, 'Apple unveils product');
    assert.equal(findFieldNameLeaks(box.tickerRead).length, 0);
    // 깨끗한 칸은 그대로
    const clean: any[] = [{ ...cardOk, money }];
    assert.equal(enforceLean('ko', clean, { extra: { box: { tickerRead: '콜 쪽이 우세합니다' }, field: 'tickerRead', money } }), 0);
});
t('UC system 프롬프트: 키 이름을 쓰지 말고 P/C 로 쓰라는 규칙이 있다(3개 언어 공통)', () => {
    for (const loc of ['ko', 'en', 'ja'] as const) {
        const s = buildSystem(loc);
        assert.equal(/INTERNAL KEY NAMES/.test(s), true);
        assert.equal(/"P\/C" plus its number/.test(s), true);
    }
});

console.log(`\n${n} passed`);
