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
console.log(`\n${n} passed, ${failed} failed`);
