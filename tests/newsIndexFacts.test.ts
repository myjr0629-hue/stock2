/**
 * 뉴스 요약(news-digest) «지수 이름 + 숫자 = 원천 값» — src/lib/ai/indexFacts.ts
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/newsIndexFacts.test.ts
 * 출발점(2026-10-18 감사 P1-6): marketContext «NASDAQ 100: 29392 (-2.50%) | S&P 500: 7704 (-1.11%)», 분석문 «S&P 500 -1.11%».
 *   원천 — S&P 500 현물 종가 /api/market/index-close spx 7659.44 (-1.09%) · 7704.25 는 선물 ES=F(macro.factors.spx.symbolUsed) · 29392 는 NQ=F.
 */
import assert from 'node:assert/strict';
import { buildIndexFacts, indexContextParts, indexClaimProblems, guardIndexClaims, indexSourceNums } from '@/lib/ai/indexFacts';

let n = 0;
let failed = 0;
const t = (name: string, fn: () => void) => {
    try { fn(); n++; console.log('ok -', name); }
    catch (e) { failed++; process.exitCode = 1; console.error('FAIL -', name, e); }
};

const SPOT = { spx: { price: 7659.44, changePct: -1.09 }, nasdaq: { price: 28420.12, changePct: -2.31 } };
const MACRO = {
    spx: { level: 7704.25, chgPct: -1.11, symbolUsed: 'ES=F' },
    nasdaq100: { level: 29392.0, chgPct: -2.5, symbolUsed: 'NQ=F' },
};
const FACTS = buildIndexFacts(SPOT, MACRO);

t('프롬프트 지수 줄 — 현물 S&P 500 은 화면 값(7659.44, -1.09%), 선물은 «futures»로 이름 붙고 «S&P 500: 7704» 는 없다', () => {
    const text = indexContextParts(FACTS).join(' | ');
    assert.ok(text.includes('S&P 500 index: 7659.44 (-1.09%)'), text);
    assert.ok(/Nasdaq-100 futures \(NQ=F\): 29392 \(-2\.50%\)/.test(text), text);
    assert.ok(!/S&P 500: 7704/.test(text) && !text.includes('7704'), text);
    assert.ok(!/NASDAQ 100: 29392/.test(text), text);
});
t('현물이 없으면 S&P 는 «S&P 500 futures (ES=F)» 로만 쓴다', () => {
    const text = indexContextParts(buildIndexFacts(null, MACRO)).join(' | ');
    assert.ok(text.includes('S&P 500 futures (ES=F): 7704 (-1.11%)'), text);
    assert.ok(!/S&P 500 index/.test(text), text);
});
t('감사 P1-6 — «S&P 500 -1.11%»(선물 값을 지수로)·«S&P 500 은 7704»는 걸린다', () => {
    assert.ok(indexClaimProblems('Stocks slid as the S&P 500 -1.11% pushed yields lower.', FACTS).length > 0);
    assert.ok(indexClaimProblems('S&P 500은 7704 부근으로 하락했다.', FACTS).length > 0);
    assert.ok(indexClaimProblems('S&P 500は7,704まで下落し、1.11%安となった。', FACTS).length > 0);
});
t('현물 값과 같은 문장(-1.09% · 1.1% · 7,659 · 7659.44)은 통과', () => {
    for (const s of ['The S&P 500 fell 1.09% to 7,659.44.', 'S&P 500 -1.1% on the day.', 'S&P 500 지수는 7,659로 마감했다.', 'S&P 500は1.09%下落した。', 'S&P 500 slid 1%, extending losses.']) {
        assert.deepEqual(indexClaimProblems(s, FACTS), [], s);
    }
});
t('«futures»/«선물»/«先物» 표기가 붙은 선물 값은 선물 값과 맞으면 통과, 틀리면 걸린다', () => {
    assert.deepEqual(indexClaimProblems('Nasdaq-100 futures fell 2.5% to 29,392.', FACTS), []);
    assert.deepEqual(indexClaimProblems('나스닥 100 선물은 2.50% 하락했다.', FACTS), []);
    assert.ok(indexClaimProblems('Nasdaq-100 futures fell 3.9%.', FACTS).length > 0);
    // 선물 사실이 프롬프트에 없던 S&P 선물은 판정하지 않는다
    assert.deepEqual(indexClaimProblems('S&P 500 futures were lower.', FACTS), []);
});
t('이름 없는 «나스닥 100» 숫자는 현물이 없으니 걸리고(선물 값을 지수로), «나스닥 종합» 은 현물과 맞으면 통과', () => {
    assert.ok(indexClaimProblems('나스닥 100은 2.50% 하락했다.', FACTS).length > 0);
    assert.deepEqual(indexClaimProblems('나스닥 종합지수는 2.31% 하락했다.', FACTS), []);
    assert.deepEqual(indexClaimProblems('Nasdaq Composite fell 2.3% to 28,420.', FACTS), []);
});
t('원문 기사에 있던 숫자는 허용한다(기사가 말한 장중 수치)', () => {
    const src = 'The S&P 500 was down 1.25% at midday, Dow off 400 points';
    const nums = indexSourceNums(src);
    assert.deepEqual(indexClaimProblems('S&P 500 was down 1.25% at midday.', FACTS, nums), []);
    assert.ok(indexClaimProblems('S&P 500 was down 1.25% at midday.', FACTS, []).length > 0);
});
t('연도·날짜·무관한 숫자는 지수 값으로 읽지 않는다', () => {
    for (const s of ['2026년 S&P 500 실적 시즌이 시작됐다.', 'S&P 500 companies reported 87% beats.'.replace('87%', 'strong'), 'The S&P 500 has 11 sectors; 2026 outlook.']) {
        assert.deepEqual(indexClaimProblems(s, FACTS), [], s);
    }
});
t('지수 값이 아예 없던 날(사실 0건)은 숫자 주장 전부가 걸린다 — 원문에 없으면', () => {
    assert.ok(indexClaimProblems('S&P 500 fell 1.11%.', []).length > 0);
    assert.deepEqual(indexClaimProblems('S&P 500 fell sharply.', []), []);
});
t('guardIndexClaims — 항목: 틀린 분석문이 있으면 사유를 돌려주고, 맞으면 null. 저장된 사실이 없는 옛 항목도 검사한다', () => {
    const bad = { headline: 'Stocks slide', summaryEN: 'Wall Street fell.', analysisEN: 'IF the S&P 500 -1.11% persists, THEN yields may fall.', analysisKR: '', summaryKR: '', summaryJP: '', analysisJP: '' };
    assert.ok(guardIndexClaims(bad as any, FACTS, []));
    const ok = { ...bad, analysisEN: 'IF the S&P 500 -1.09% persists, THEN yields may fall.' };
    assert.equal(guardIndexClaims(ok as any, FACTS, []), null);
    assert.ok(guardIndexClaims(bad as any, undefined, undefined));    // 옛 항목(저장된 사실 없음) — 근거 없는 지수 숫자는 제외
});
t('관문 1 — S&P 뒤의 VIX 등락률 때문에 정상 항목을 제외하지 않는다', () => {
    const summaryEN = 'S&P 500 fell 1.09%; VIX rose 5.00%.';
    assert.equal(guardIndexClaims({ summaryEN }, FACTS, []), null);
});
t('관문 3 — _idx 없는 옛 캐시의 원문에 없는 선물 수준값을 현물로 내보내지 않는다', () => {
    assert.ok(guardIndexClaims({ summaryKR: 'S&P 500은 7704 부근으로 하락했다.' }, undefined, undefined));
});
t('관문 4 — 원문에 있는 소수점 수준값 전체를 대조한다', () => {
    const summaryEN = 'The S&P 500 fell to 7,600.25 at midday.';
    assert.equal(guardIndexClaims({ summaryEN }, FACTS, indexSourceNums(summaryEN)), null);
});
t('관문 5 — 부호 없는 퍼센트도 상승·하락 방향이 반대면 거절한다', () => {
    assert.ok(indexClaimProblems('S&P 500은 1.09% 상승했다.', FACTS).length > 0);
});
t('다른 자산·문장의 수치를 지수에 붙이지 않고, 실제 지수 오류는 계속 거절한다', () => {
    for (const s of [
        'S&P 500 fell 1.09%, VIX rose 5.00%.',
        'S&P 500 fell 1.09% and VIX rose 5.00%.',
        'S&P 500 fell 1.09% while gold gained 3.00%.',
        'S&P 500은 1.09% 하락했다; VIX는 5.00% 상승했다.',
        'S&P 500は1.09%下落した。VIXは5.00%上昇した。',
        'S&P 500 fell to 7,659.44; gold rose to 3,000.',
    ]) assert.equal(guardIndexClaims({ summaryEN: s }, FACTS, []), null, s);
    assert.ok(guardIndexClaims({ summaryEN: 'S&P 500 fell 2.09%; VIX rose 5.00%.' }, FACTS, []));
});
t('숫자 방향 — 한·영·일의 상승/하락·명시 부호·반올림을 유지한다', () => {
    for (const s of ['S&P 500 rose 1.09%.', 'S&P 500は1.09%上昇した。']) {
        assert.ok(indexClaimProblems(s, FACTS).length, s);
    }
    const rising = FACTS.map(f => ({ ...f, chgPct: Math.abs(f.chgPct) }));
    for (const s of ['S&P 500 fell 1.09%.', 'S&P 500은 1.09% 하락했다.', 'S&P 500は1.09%下落した。']) {
        assert.ok(indexClaimProblems(s, rising).length, s);
    }
    for (const s of ['S&P 500 rose 1.09%.', 'S&P 500은 1.1% 상승했다.', 'S&P 500は1.09%上昇した。']) {
        assert.deepEqual(indexClaimProblems(s, rising), [], s);
    }
    assert.ok(indexClaimProblems('S&P 500 +1.09%.', FACTS).length);
    assert.deepEqual(indexClaimProblems('S&P 500 -1.09%.', FACTS), []);
});
t('옛 캐시 — 명확한 수준만 검사하고 날짜·건수·원문 수준은 보존한다', () => {
    for (const s of ['S&P 500 closed at 7,704.', 'S&P 500は7,704まで下落した。']) {
        assert.ok(guardIndexClaims({ summaryEN: s }, undefined, undefined), s);
    }
    for (const s of ['S&P 500 companies employ 7704 workers.', 'S&P 500은 2026년 실적을 발표했다.', 'S&P 500 has 11 sectors; 2026 outlook.']) {
        assert.equal(guardIndexClaims({ summaryEN: s }, undefined, undefined), null, s);
    }
    const s = 'S&P 500 closed at 7,600.25.';
    assert.equal(guardIndexClaims({ summaryEN: s }, undefined, indexSourceNums(s)), null);
});
t('소수점 원문 — 쉼표 없는 표현도 허용하되 다른 소수부는 면제하지 않는다', () => {
    const nums = indexSourceNums('S&P 500 fell to 7,600.25 at midday.');
    assert.ok(nums.includes('7600.25'));
    assert.deepEqual(indexClaimProblems('S&P 500 fell to 7600.25.', FACTS, nums), []);
    assert.ok(indexClaimProblems('S&P 500 fell to 7,600.75.', FACTS, nums).length);
});
t('뉴스 7개 필드 모두 정상 혼합 지표는 보존하고 옛 캐시 수준 오류는 거절한다', () => {
    for (const field of ['headline', 'summaryKR', 'summaryEN', 'summaryJP', 'analysisKR', 'analysisEN', 'analysisJP']) {
        assert.equal(guardIndexClaims({ [field]: 'S&P 500 fell 1.09%; VIX rose 5.00%.' }, FACTS, []), null, field);
        assert.ok(guardIndexClaims({ [field]: 'S&P 500은 7704 부근으로 하락했다.' }, undefined, undefined), field);
    }
});
t('3차 관문 1a — 원문 선물 숫자가 현물 오기를 면제하지 않는다', () => {
    const nums = indexSourceNums('S&P 500 futures fell 1.11% to 7,704.25.');
    for (const summaryEN of ['S&P 500 fell 1.11%.', 'S&P 500 fell to 7,704.25.', 'S&P 500 fell 1.11% to 7,704.25.']) {
        assert.ok(guardIndexClaims({ summaryEN }, FACTS, nums), summaryEN);
    }
});
t('3차 관문 1b — 원문 등락률의 방향을 뒤집으면 거절한다', () => {
    const nums = indexSourceNums('S&P 500 fell 1.09%.');
    assert.ok(guardIndexClaims({ summaryEN: 'S&P 500 rose 1.09%.' }, FACTS, nums));
});
for (const [locale, summary] of [
    ['ko', 'S&P 500은 1.09% 하락했고 VIX는 5.00% 상승했다.'],
    ['ja', 'S&P 500は1.09%下落し、VIXは5.00%上昇した。'],
] as const) t(`3차 관문 3 — ${locale} 혼합 지표 정상 문장을 보존한다`, () => {
    assert.equal(guardIndexClaims({ summaryEN: summary }, FACTS, []), null);
});
t('3차 관문 4 — 쉼표 뒤 같은 지수의 잘못된 등락률도 검사한다', () => {
    assert.ok(guardIndexClaims({ summaryEN: 'S&P 500 fell to 7,659.44, down 1.11%.' }, FACTS, []));
});
t('원문 근거 — 같은 지수·종류·방향인 장중 수치·다국어 번역은 보존한다', () => {
    const nums = indexSourceNums('S&P 500 fell 1.25% to 7,600.25 at midday.');
    for (const summaryEN of [
        'S&P 500 fell 1.25% to 7,600.25 at midday.',
        'S&P 500은 1.25% 하락했고 VIX는 5.00% 상승했다.',
        'S&P 500は1.25%下落し、VIXは5.00%上昇した。',
        'S&P 500 closed at 7,600.25.',
    ]) assert.equal(guardIndexClaims({ summaryEN }, FACTS, nums), null, summaryEN);
    const futures = buildIndexFacts(null, MACRO);
    const fnums = indexSourceNums('S&P 500 futures fell 1.25% to 7,600.25.');
    assert.deepEqual(indexClaimProblems('S&P 500 선물은 1.25% 하락했다.', futures, fnums), []);
    assert.ok(indexClaimProblems('S&P 500 선물은 1.25% 상승했다.', futures, fnums).length);
});
t('원문 근거 — 다른 지수·VIX 숫자·옛 숫자 목록은 면제하지 않는다', () => {
    for (const nums of [
        indexSourceNums('Nasdaq Composite fell 1.11% to 7,704.25.'),
        indexSourceNums('S&P 500 fell 1.09%; VIX rose 1.11%.'),
        ['1.11%', '7704.25'],
    ]) assert.ok(indexClaimProblems('S&P 500 fell 1.11%.', FACTS, nums).length);
    assert.deepEqual(indexClaimProblems('S&P 500 fell 1.09%.', FACTS, ['1.09%']), []);
});
t('절 경계 — 다른 자산과 나란히 있어도 실제 지수 오류는 거절한다', () => {
    for (const summaryEN of [
        'S&P 500은 1.11% 하락했고 VIX는 5.00% 상승했다.',
        'S&P 500は1.11%下落し、VIXは5.00%上昇した。',
        'S&P 500은 1.09% 상승했고 VIX는 5.00% 하락했다.',
        'S&P 500は1.09%上昇し、VIXは5.00%下落した。',
    ]) assert.ok(guardIndexClaims({ summaryEN }, FACTS, []), summaryEN);
    for (const summaryEN of [
        'S&P 500 fell to 7,659.44, down 1.09%.',
        'S&P 500 fell 1.09%, VIX rose 5.00%.',
        'S&P 500は1.09%下落しVIXは5.00%上昇した。',
    ]) assert.equal(guardIndexClaims({ summaryEN }, FACTS, []), null, summaryEN);
});
for (const suffix of [', a decline of 1.11%.', ' and was down 1.11%.', ', representing a decline of 1.11%.']) t(`4차 관문 2 — 같은 주어 보충 등락률 거절: ${suffix}`, () => {
    assert.ok(indexClaimProblems(`S&P 500 fell to 7,659.44${suffix}`, FACTS).length);
    assert.deepEqual(indexClaimProblems(`S&P 500 fell to 7,659.44${suffix.replace('1.11', '1.09')}`, FACTS), []);
});
for (const summary of ['Nasdaq fell 1.25% at midday.', '나스닥은 장중 1.25% 하락했다.', 'ナスダックは日中1.25%下落した。']) t(`4차 관문 3 — Composite 원문과 Nasdaq 번역의 동일 지수 근거: ${summary}`, () => {
    const nums = indexSourceNums('Nasdaq Composite fell 1.25% at midday.');
    assert.deepEqual(indexClaimProblems(summary, FACTS, nums), []);
    assert.ok(indexClaimProblems(summary.replace('1.25', '1.35'), FACTS, nums).length);
    assert.ok(indexClaimProblems(summary.replace(/fell|하락|下落/, 'rose'), FACTS, nums).length);
});
t('Nasdaq 근거 — 옛 v2 별칭은 양방향 호환, Nasdaq-100·선물 근거와는 분리', () => {
    assert.deepEqual(indexClaimProblems('Nasdaq Composite fell 1.25%.', FACTS, ['idx:v2:4:spot:pct:1.25:-1']), []);
    assert.deepEqual(indexClaimProblems('Nasdaq fell 1.25%.', FACTS, ['idx:v2:2:spot:pct:1.25:-1']), []);
    assert.ok(indexClaimProblems('Nasdaq fell 1.25%.', FACTS, indexSourceNums('Nasdaq-100 fell 1.25%.')).length);
    assert.ok(indexClaimProblems('Nasdaq fell 1.25%.', FACTS, indexSourceNums('Nasdaq Composite futures fell 1.25%.')).length);
});
// ── 5차 관문(10/18 16:22) — ① 쉼표 뒤 분사구 등락률 ③ Nasdaq 선물 별칭 ────────────────────────────
for (const suffix of [', marking a 1.11% drop.', ', posting a 1.11% loss.', ', settling 1.11% lower.', ', losing 1.11%.', ', shedding 1.11%.', ', dropping 1.11%.', ', sliding 1.11%.', ', off 1.11%.', ', -1.11%.', ', or 1.11%.', ', for a loss of 1.11%.', ', closing down 1.11%.', ', ending 1.11% lower.', ' and ended down 1.11%.', ' and closed 1.11% lower.']) t(`5차 관문 1 — 쉼표·and 뒤 같은 주어 분사·보충 등락률 거절: ${suffix}`, () => {
    assert.ok(indexClaimProblems(`S&P 500 closed at 7,659.44${suffix}`, FACTS).length, suffix);
    assert.deepEqual(indexClaimProblems(`S&P 500 closed at 7,659.44${suffix.replace('1.11', '1.09')}`, FACTS), [], suffix);
});
t('5차 관문 1 — 상승 분사(gaining/adding)도 방향까지 대조', () => {
    const rising = FACTS.map(f => ({ ...f, chgPct: Math.abs(f.chgPct) }));
    for (const s of ['S&P 500 closed at 7,659.44, gaining 1.09%.', 'S&P 500 closed at 7,659.44, adding 1.09%.', 'S&P 500 closed at 7,659.44, up 1.09%.']) {
        assert.deepEqual(indexClaimProblems(s, rising), [], s);
        assert.ok(indexClaimProblems(s, FACTS).length, s);           // 실제는 −1.09% — 방향 반대
        assert.ok(indexClaimProblems(s.replace('1.09', '1.11'), rising).length, s);
    }
});
t('5차 관문 1 — 한·일 쉼표·연결어미 뒤 숫자로 시작하는 같은 주어 보충도 검사', () => {
    for (const s of [
        'S&P 500은 7,659.44에 마감, 1.11% 하락했다.',
        'S&P 500은 7,659.44로 마감했으며 1.11% 하락했다.',
        'S&P 500은 7,659.44로 마감했고 전일 대비 1.11% 내렸다.',
        'S&P 500は7,659.44で終了し、1.11%下落した。',
        'S&P 500は7,659.44で引け、前日比1.11%安となった。',
    ]) {
        assert.ok(indexClaimProblems(s, FACTS).length, s);
        assert.deepEqual(indexClaimProblems(s.replace('1.11', '1.09'), FACTS), [], s);
    }
});
t('5차 관문 1 — 새 주어·원인 절의 다른 숫자는 지수에 붙이지 않는다(오탐 방지)', () => {
    for (const s of [
        'S&P 500 closed at 7,659.44, VIX rose 5.00%.',
        'S&P 500 closed at 7,659.44, while VIX rose 5.00%.',
        'S&P 500 fell 1.09%, the Dow lost 0.80%.',
        'S&P 500 fell 1.09%, Treasury yields rose 2.00%.',
        'S&P 500 fell 1.09%, led by Tesla, which dropped 3.00%.',
        'S&P 500 fell 1.09%, as Nvidia slid 3.00%.',
        'S&P 500 fell 1.09%, and VIX jumped 5.00%.',
        'S&P 500은 1.09% 하락했고, VIX는 5.00% 상승했다.',
        'S&P 500은 1.09% 하락했고 애플이 3.00% 올랐다.',
        'S&P 500은 1.09% 하락, 엔비디아는 3.00% 떨어졌다.',
        'S&P 500は1.09%下落し、VIXは5.00%上昇した。',
        'S&P 500は1.09%下落、エヌビディアは3.00%安。',
        'S&P 500 fell 1.09%, ending a 2.50% rally.',
        'S&P 500 fell 1.09%, trading volume rose 20.00%.',
        "S&P 500 fell 1.09%, adding to Thursday's 0.50% loss.",
        'S&P 500 fell 1.09%, erasing a 3.00% rally.',
        'S&P 500 fell 1.09%, closing prices for Tesla dropped 3.00%.',
    ]) assert.equal(guardIndexClaims({ summaryEN: s }, FACTS, []), null, s);
});
for (const [src, summary] of [
    ['Nasdaq-100 futures fell 1.25% at midday.', 'Nasdaq futures fell 1.25% at midday.'],
    ['Nasdaq futures fell 1.25% at midday.', 'Nasdaq-100 futures fell 1.25% at midday.'],
    ['Nasdaq-100 futures fell 1.25% at midday.', '나스닥 선물은 장중 1.25% 하락했다.'],
    ['Nasdaq-100 futures fell 1.25% at midday.', 'ナスダック先物は日中1.25%下落した。'],
    ['Nasdaq-100 futures fell 1.25% at midday.', '나스닥 100 선물은 장중 1.25% 하락했다.'],
] as const) t(`5차 관문 3 — Nasdaq-100 선물 ↔ Nasdaq 선물 원문 근거: ${summary}`, () => {
    const nums = indexSourceNums(src);
    assert.deepEqual(indexClaimProblems(summary, FACTS, nums), [], summary);
    assert.ok(indexClaimProblems(summary.replace('1.25', '1.35'), FACTS, nums).length, summary);
    assert.ok(indexClaimProblems(summary.replace(/fell|하락|下落/, 'rose'), FACTS, nums).length, summary);
});
t('5차 관문 3 — 선물 별칭은 현물로 새지 않는다(선물 근거로 현물 오기 면제 금지)', () => {
    const nums = indexSourceNums('Nasdaq-100 futures fell 1.25% at midday.');
    for (const s of ['Nasdaq fell 1.25% at midday.', 'Nasdaq-100 fell 1.25% at midday.', 'Nasdaq Composite fell 1.25%.']) {
        assert.ok(indexClaimProblems(s, FACTS, nums).length, s);
    }
    // 옛 v2 저장 형식(그룹 4 선물)도 Nasdaq-100 선물 근거로 읽는다
    assert.deepEqual(indexClaimProblems('Nasdaq-100 futures fell 1.25%.', FACTS, ['idx:v2:4:futures:pct:1.25:-1']), []);
    assert.deepEqual(indexClaimProblems('Nasdaq futures fell 1.25%.', FACTS, ['idx:v2:3:futures:pct:1.25:-1']), []);
    // 원천 선물 값과 맞는 Nasdaq 선물은 근거 없이도 통과, 틀리면 거절
    assert.deepEqual(indexClaimProblems('Nasdaq futures fell 2.50%.', FACTS), []);
    assert.ok(indexClaimProblems('Nasdaq futures fell 1.25%.', FACTS).length);
});
console.log(`\n${n} passed, ${failed} failed`);
