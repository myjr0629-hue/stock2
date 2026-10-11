/**
 * 지어낸 숫자 탐지(lib/ai/depthNumbers) — «해석의 깊이» 변형이 입력에 없는 숫자를 만들지 않는지 보는 검사기.
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/depthNumbers.test.ts
 */
import assert from 'node:assert/strict';
import { extractNumbers, checkNumberGrounding, checkOutputNumbers, textLeaves } from '@/lib/ai/depthNumbers';
import { depthDirectiveFor, DEPTH_PURPOSES, DEPTH_CORE } from '@/lib/ai/depthDirective';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };
const bad = (out: string, inp: string) => checkNumberGrounding(out, inp).ungrounded.map((u) => u.raw);

t('단위: 9,307만 달러 = 93,070,000 · $93M(반올림) 일치 · $95M 불일치', () => {
    assert.deepEqual(bad('약 9,307만 달러 규모의 콜', 'newOiNotional: 93070000'), []);
    assert.deepEqual(bad('about $93M of new calls', 'notional $93.07M'), []);
    assert.deepEqual(bad('about $95M of new calls', 'notional $93.07M'), ['$95M']);
    assert.deepEqual(bad('9307万ドル', 'notional 93,070,000'), []);
});
t('복합 단위 합산: 1조 2,300억 = $1.23T', () => {
    assert.deepEqual(bad('시가총액 1조 2,300억 달러', 'marketCap $1.23T'), []);
    assert.deepEqual(bad('시가총액 1조 2,400억 달러', 'marketCap $1.23T'), ['1조 2,400억']);
    assert.equal(extractNumbers('1조 2,300억')[0].value, 1.23e12);
});
t('영어 단어 단위(대소문자)·천만: $220 Million = $220M = 2억 2천만 달러', () => {
    assert.deepEqual(bad('secures a $220 million credit line', 'Secures $220 Million Committed Revolving Credit Facility'), []);
    assert.deepEqual(bad('2억 2천만 달러 규모 신용한도', 'Secures $220 Million Committed'), []);
    assert.deepEqual(bad('2億2,000万ドルの融資枠', 'Secures $220 Million Committed'), []);
    assert.deepEqual(bad('2.2억 달러', 'Secures $220 Million Committed'), []);
    assert.deepEqual(bad('$230 million credit line', 'Secures $220 Million Committed'), ['$230 million']);
});
t('접미 단위 x·d·h · 밑줄 앞뒤 · 이동평균 창 이름은 라벨', () => {
    assert.deepEqual(bad('레짐이 평균 3.7일의 1.6배 지속', 'avg_regime_duration="3.7d" streak_multiple="1.6x"'), []);
    assert.deepEqual(bad('볼린저 폭이 130세션 대비 37 백분위', 'BAND_WIDTH_PERCENTILE_VS_OWN_130_SESSIONS 37'), []);
    assert.deepEqual(bad('로이터 보도(14시간 전)', 'age 14h'), []);
    assert.deepEqual(bad('50일선 353.27 이 200일선 391.13 아래, SMA50 과 EMA20', 'sma 353.27 391.13'), []);
    assert.deepEqual(bad('SMA 50(498.77)이 SMA 200(433.75) 위, 200-day 선', 'sma 498.77 433.75'), []);
    assert.deepEqual(bad('평균 3.9일의 1.6배', 'avg 3.7d streak 1.6x'), ['3.9']);
});
t('이름 면제가 소수·단위의 일부를 먹지 않는다: $436.3M 의 «3M» 은 3개월물이 아니다', () => {
    assert.deepEqual(bad('총 GEX +$436.3M', 'totalGex 436276451'), []);
    assert.deepEqual(bad('3M 금리와 10Y 금리', 'x'), []);
});
t('소수는 반올림만 허용: 5.24 ↔ 5.2437 일치, 5.25 불일치', () => {
    assert.deepEqual(bad('10년물 5.24%', 'US10Y 5.2437'), []);
    assert.deepEqual(bad('10년물 5.25%', 'US10Y 5.24'), ['5.25%']);
    assert.deepEqual(bad('10년물 5.240%', 'US10Y 5.24'), []);
    assert.deepEqual(bad('10년물 5.241%', 'US10Y 5.24'), ['5.241%']);
});
t('정수는 내림 표기까지 허용, 부호는 보지 않는다', () => {
    assert.deepEqual(bad('가격 245', 'price 245.7'), []);
    assert.deepEqual(bad('하락 -3.8%', 'change 3.8'), []);
});
t('자리표·지수 이름·1~10 단독 정수는 면제, 소수/단위가 붙으면 면제 아님', () => {
    assert.deepEqual(bad('{PRICE} 가 {CALL_WALL} 아래, S&P 500 과 NASDAQ 100 에서 3개 팩터', 'nothing'), []);
    assert.deepEqual(bad('10Y 금리와 2s10s 스프레드, Form 4 와 8-K, Q3', 'nothing'), []);
    assert.deepEqual(bad('3.0배', 'nothing'), ['3.0배'].map((x) => x.replace('배', '')));
    assert.deepEqual(bad('7개 팩터와 12개 섹터', 'x 12'), []);
    assert.deepEqual(bad('12개 섹터', 'nothing'), ['12']);
});
t('차이를 새로 계산한 숫자는 불일치(모델은 새 숫자를 만들지 않는다)', () => {
    const inp = '현재가 7,714 / Put Floor 7,650 / Call Wall 7,850';
    assert.deepEqual(bad('현재가 7,714는 Put Floor 7,650 대비 64포인트 위', inp), ['64']);
    assert.deepEqual(bad('현재가 7,714는 Put Floor 7,650 위, Call Wall 7,850 아래', inp), []);
});
t('JSON 은 문자열 잎만 본다(키 이름 숫자 무시) · 한·일·영 같은 값 일치', () => {
    const out = JSON.stringify({ ko: '콜 우위 0.8, 가격 7,714', ja: 'コール優位0.8、価格7,714', en: 'call-heavy 0.8 at 7,714', riskLevel_2: 'HIGH' });
    assert.deepEqual(textLeaves(out).length, 4);
    const r = checkOutputNumbers(out, 'oiPcr 0.8, price 7714');
    assert.equal(r.ungrounded.length, 0); assert.ok(r.grounded >= 6);
    const r2 = checkOutputNumbers(out, 'oiPcr 0.9, price 7714');
    assert.equal(r2.ungrounded.length, 3);
});
t('시각·날짜 조각은 입력에 있어야 일치', () => {
    assert.deepEqual(bad('12:30 ET 발표', 'CPI 12:30 ET'), []);
    assert.deepEqual(bad('12:45 ET 발표', 'CPI 12:30 ET'), ['45']);
});
t('깊이 지시문: 용도 6개에 공통 + 칸 안내, 없는 용도는 빈 문자열(예전 그대로) · 권유·미래형 금지와 «규칙이 이긴다» 문장 포함', () => {
    assert.deepEqual([...DEPTH_PURPOSES].sort(), ['CrossSector', 'DeepAnalysis', 'FlowAI', 'Guardian', 'MorningBriefing', 'UC']);
    for (const p of DEPTH_PURPOSES) { const d = depthDirectiveFor(p); assert.ok(d.includes('<depth_standard>') && d.includes('<depth_slots>'), p); }
    assert.equal(depthDirectiveFor('WIM'), '');
    assert.ok(/no future tense/.test(DEPTH_CORE) && /those rules win/.test(DEPTH_CORE) && /never compute/.test(DEPTH_CORE));
});

console.log(`\n${n} passed`);
