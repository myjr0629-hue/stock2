// 모닝 브리핑 v2 — 사실 계약·출구 검사(순수 함수, 네트워크 없음). 실행: node -r ./scripts/offline-test-typescript.cjs tests/morningBriefingV2.test.ts
import assert from 'node:assert/strict';
import {
    morningNewsLines, morningCalendarLines, morningMetrics, buildMorningV2User, morningV2System, checkMorningV2, checkMorningLocale,
    numberSignature, type MorningFacts,
} from '@/lib/ai/morningBriefingV2';
import { INDEX_NAMES } from '@/lib/ai/tacticalIndexFacts';
import { aiLineFromText } from '@/lib/push/aiLine';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log(`ok ${name}`); };

// 2026-10-26(월) 08:00 ET 장전 — 10/23(금) 정규장 나스닥 +0.9 · S&P +0.5, 지금 선물 NQ −0.24 · ES −0.05
const asOf = '2026-10-26T12:00:00.000Z';
const nowMs = Date.parse(asOf);
const facts: MorningFacts = {
    v: 2, asOf, session: 'PRE',
    indexFacts: [
        { id: 'nq', name: INDEX_NAMES.nq, kind: 'futures', chgPct: -0.24, asOfET: '2026-10-26 07:58 ET', sessionDate: null, basis: { ko: '직전 정규장 마감 무렵(정산) 대비', en: 'vs prior settlement near previous cash close', ja: '前回通常取引終了頃の清算値比' } },
        { id: 'es', name: INDEX_NAMES.es, kind: 'futures', chgPct: -0.05, asOfET: '2026-10-26 07:58 ET', sessionDate: null, basis: { ko: '직전 정규장 마감 무렵(정산) 대비', en: 'vs prior settlement near previous cash close', ja: '前回通常取引終了頃の清算値比' } },
        { id: 'nasdaq', name: INDEX_NAMES.nasdaq, kind: 'spot', chgPct: 0.91, asOfET: '2026-10-23 16:00 ET', sessionDate: '2026-10-23', basis: { ko: '2026-10-23 정규장: 전 거래일 종가 대비', en: '2026-10-23 cash session vs previous trading close', ja: '2026-10-23通常取引: 前営業日終値比' } },
        { id: 'spx', name: INDEX_NAMES.spx, kind: 'spot', chgPct: 0.52, asOfET: '2026-10-23 16:00 ET', sessionDate: '2026-10-23', basis: { ko: '2026-10-23 정규장: 전 거래일 종가 대비', en: '2026-10-23 cash session vs previous trading close', ja: '2026-10-23通常取引: 前営業日終値比' } },
    ],
    news: morningNewsLines([
        { title: 'Treasury yields slip as investors weigh Fed path', publishedIso: '2026-10-26T10:15:00Z' },
        { title: 'Old story', publishedIso: '2026-10-24T10:15:00Z' },
        { title: 'Future story', publishedIso: '2026-10-26T13:15:00Z' },
    ], nowMs),
    events: morningCalendarLines([
        { date: '2026-10-26', time: '14:00:00', event: 'New Home Sales (Sep)', impact: 'HIGH', estimate: 0.7, previous: 0.65 },
        { date: '2026-10-26', time: '11:00:00', event: 'Chicago Fed Index', impact: 'HIGH', actual: 0.12 },
        { date: '2026-10-26', time: '15:00:00', event: 'Low impact', impact: 'LOW' },
    ], nowMs, '2026-10-26').upcoming,
    released: [],
    disclosures: [],
    metrics: morningMetrics({ rlsi: 28.7, rlsiTrend: [28.7, 28.7, 28.7], vix: 19.57, vix3m: 20.12, gexIndex: -12, gexLevel: 'NEUTRAL', breadthPct: 42.6,
        us10y: { level: 4.99, bp: 4 }, oil: { level: 100.65, chgPct: 1.19 }, gold: { level: 4040.8, chgPct: -0.48 } }),
};

const good = {
    ko: '10/23(금) 정규장 나스닥 종합 0.9%·S&P500 0.5% 상승, 지금 개장 전 나스닥100 선물 0.2% 약세·S&P500 선물 보합입니다. 10/26 06:15 ET 보도에 따르면 미 국채 금리가 연준 경로를 저울질하며 내렸고, 이와 맞물려 선물은 금요일 상승 뒤 숨을 고르고 있습니다. 미국 10년물 금리 4.99%(+4bp)와 WTI 유가 $100.65(+1.19%)가 함께 오르면서 성장주의 금리 부담과 물가 부담이 겹쳐 있습니다. 시장 건강도(RLSI 28.7)는 약하고 변동성 지수(VIX 19.57)는 경계 수준이며 옵션 포지션(GEX)은 중립이라, 금요일 반등을 받칠 힘이 약하고 흔들림을 줄여 주지도 않습니다. 다음 분기점은 10/26(월) 10:00 ET(한국 23:00) 예정된 New Home Sales (Sep)(신규 주택 판매)로, 예상보다 강하면 금리 부담이 커지고 약하면 줄어드는 구조입니다.',
    en: 'In the 10/23 cash session the Nasdaq Composite rose 0.9% and the S&P 500 rose 0.5%, while now premarket Nasdaq 100 futures are down 0.2% and S&P 500 futures are flat. A 10/26 06:15 ET report said Treasury yields slipped as investors weighed the Fed path, amid futures pausing after Friday\'s gains. The 10-year Treasury yield at 4.99% (+4bp) and WTI crude at $100.65 (+1.19%) together keep rate and inflation pressure on growth stocks. Market health (RLSI 28.7) is weak, the VIX volatility gauge at 19.57 is elevated and options positioning (GEX) is neutral, so the gauges conflict with Friday\'s rebound and offer no cushion for swings. The next test is the scheduled New Home Sales (Sep) at 10/26 (Mon) 10:00 ET: a stronger reading adds rate pressure, a softer one eases it.',
    ja: '10/23(金)の通常取引はナスダック総合0.9%・S&P500 0.5%上昇、現在の取引開始前はナスダック100先物0.2%下落・S&P500先物横ばいです。10/26 06:15 ETの報道によると米国債利回りは利下げ観測を背景に低下し、先物は金曜日の上昇の後で一服しています。米10年債利回り4.99%(+4bp)とWTI原油$100.65(+1.19%)がそろって上昇し、成長株への金利と物価の重荷が重なっています。市場の健全度(RLSI 28.7)は弱く、変動性指数(VIX 19.57)は警戒水準で、オプション・ポジション(GEX)は中立のため、金曜日の反発を支える力は乏しく値動きを和らげもしません。次の分岐点は10/26(月) 10:00 ET(日本時間 23:00)予定のNew Home Sales (Sep)(新築住宅販売)で、市場予想より強ければ金利の重荷が増し、弱ければ和らぐ構造です。',
};

test('뉴스 줄 — 미래·오래된 기사 제외, 공급사명 없음, ET 시각', () => {
    assert.equal(facts.news.length, 1);
    assert.match(facts.news[0], /^\[report; 2026-10-26T10:15:00\.000Z; 10\/26 06:15 ET\] Treasury yields slip/);
    assert.doesNotMatch(facts.news[0], /Polygon|FMP/);
});

test('일정 줄 — 오늘 HIGH 만, 지난 시각은 발표됨(예정 아님)', () => {
    const c = morningCalendarLines([
        { date: '2026-10-26', time: '14:00:00', event: 'New Home Sales (Sep)', impact: 'HIGH' },
        { date: '2026-10-26', time: '11:00:00', event: 'Chicago Fed Index', impact: 'HIGH', actual: 0.12 },
    ], Date.parse('2026-10-26T12:00:00Z'), '2026-10-26');
    assert.deepEqual(c.upcoming, ['[economic calendar; 2026-10-26 10:00 ET] New Home Sales Sep (scheduled; not a released result)']);
    assert.deepEqual(c.released, ['[released; 2026-10-26 07:00 ET] Chicago Fed Index actual 0.12']);
});

test('지표 — 감마 필드는 GammaShieldData 실제 이름(supportWall·resistanceWall·gammaFlipPoint), 없는 값은 칸 없음', () => {
    const m = morningMetrics({ gexIndex: 18, gexLevel: 'LONG_GAMMA', putFloor: 6800.4, callWall: 7100, gammaFlip: null });
    assert.deepEqual(m.map(x => x.id), ['optionsPositioning', 'optionsLevels']);
    assert.equal(m[1].value, 'S&P 500 put floor 6,800; call wall 7,100');
    assert.equal(m[0].reading, 'dealers cushion swings');
    assert.equal(morningMetrics({}).length, 0);
});

test('프롬프트 — 사실 칸 이름은 Tactical 검사기 모양, 예시 숫자 없음', () => {
    const u = buildMorningV2User(facts);
    for (const tag of ['SESSION: PRE', 'AS_OF: 2026-10-26T12:00:00.000Z', 'TODAY_NEWS: [', 'INDEX_FACTS: [', 'SCHEDULED_EVENTS: [', 'EVENT_TIMES: {', 'METRICS: {']) assert.ok(u.includes(tag), tag);
    assert.ok(u.indexOf('TODAY_NEWS:') < u.indexOf('INDEX_FACTS:'), '숫자 근거는 TODAY_NEWS 이후');
    assert.match(u, /10\/26\(월\) 10:00 ET\(한국 23:00\)/);
    const s = morningV2System('PRE', true);
    assert.ok(!/\{KO_FIRST\}|\{EN_FIRST\}|\{JA_FIRST\}/.test(s));
    assert.ok(!/12:30 ET|5,650|19,840/.test(s), '옛 스타일 예시의 숫자·일정이 없다');
    assert.ok(s.includes('<depth_standard>'), '사다리가 일반 깊이 지시를 덧붙이지 않게');
});

test('정상 3언어 글 통과', () => {
    const c = checkMorningV2(JSON.stringify(good), facts);
    assert.deepEqual(c.reasons, []);
    assert.ok(c.ok);
});

test('첫 문장 = 모닝 푸시 본문(90자 안·자르지 않음)', () => {
    for (const l of ['ko', 'en', 'ja'] as const) {
        const r = aiLineFromText(good[l], { locale: l, englishSource: good.en, currentYear: 2026 });
        assert.equal(r.reason, 'ok', l);
        if (l !== 'en') assert.ok(!r.line!.endsWith('…'), `${l} 잘림: ${r.line}`);
        else assert.match(r.line!, /Nasdaq Composite rose 0\.9%/);   // 영어는 110자 — 절 경계에서 잘려도 현물 결과는 남는다
    }
});

test('지수 값·방향·선물 누락은 탈락', () => {
    const wrongValue = good.ko.replace('나스닥 종합 0.9%', '나스닥 종합 1.9%');
    assert.ok(checkMorningLocale(wrongValue, 'ko', facts).includes('mb:index-value'));
    const noFutures = '10/23(금) 정규장 나스닥 종합 0.9%·S&P500 0.5% 상승입니다. ' + good.ko.split('. ').slice(1).join('. ');
    assert.ok(checkMorningLocale(noFutures, 'ko', facts).includes('mb:premarket-futures-required'));
});

test('지어낸 숫자·내부 라벨·RLSI 단독·권유·예측은 탈락', () => {
    assert.ok(checkMorningLocale(good.en.replace('4.99% (+4bp)', '4.95% (-19bp)'), 'en', facts).some(r => r.startsWith('mb:number')));
    assert.ok(checkMorningLocale(good.en.replace('Market health (RLSI 28.7) is weak', 'RLSI 28.7 is weak and the regime reads BEAR'), 'en', facts).includes('mb:internal-label'));
    assert.ok(checkMorningLocale(good.en.replace('Market health (RLSI 28.7)', 'RLSI 28.7'), 'en', facts).includes('mb:bare-rlsi'));
    assert.ok(checkMorningLocale(good.ko.replace('구조입니다.', '구조이므로 매수를 고려해 볼 만합니다.'), 'ko', facts).some(r => r.startsWith('mb:advice')));
    assert.ok(checkMorningLocale(good.en.replace('together keep rate', 'will likely keep rate'), 'en', facts).some(r => r.startsWith('mb:forecast')));
    assert.ok(checkMorningLocale(good.en.replace('a softer one eases it', 'a softer one will likely ease it'), 'en', facts).includes('mb:forecast:next'));
    assert.ok(checkMorningLocale(good.ko.replace('줄어드는 구조입니다.', '줄어들 것으로 전망됩니다.'), 'ko', facts).includes('mb:forecast:next'));
});

test('지표 이름 ↔ 값 결속 — 영어판만 금리·VIX 값을 맞바꾸거나 변화 부호를 뒤집으면 탈락(관문 10250102 ②)', () => {
    const swapped = good.en.replace('The 10-year Treasury yield at 4.99% (+4bp)', 'The 10-year Treasury yield at 19.57% (+4bp)').replace('VIX volatility gauge at 19.57', 'VIX volatility gauge at 4.99');
    assert.ok(checkMorningLocale(swapped, 'en', facts).some(r => r.startsWith('mb:metric-value')), JSON.stringify(checkMorningLocale(swapped, 'en', facts)));
    const flipped = good.en.replace('4.99% (+4bp)', '4.99% (-4bp)');
    assert.ok(checkMorningLocale(flipped, 'en', facts).includes('mb:metric-sign:us10y'));
    const koDir = good.ko.replace('미국 10년물 금리 4.99%(+4bp)와', '미국 10년물 금리는 4.99%로 4bp 내렸고');
    assert.ok(checkMorningLocale(koDir, 'ko', facts).includes('mb:metric-sign:us10y'));
    const koOk = good.ko.replace('미국 10년물 금리 4.99%(+4bp)와', '미국 10년물 금리는 4.99%로 4bp 올랐고');
    assert.ok(!checkMorningLocale(koOk, 'ko', facts).some(r => /metric/.test(r)), JSON.stringify(checkMorningLocale(koOk, 'ko', facts)));
    assert.ok(checkMorningV2(JSON.stringify({ ...good, en: flipped }), facts).reasons.includes('en:mb:metric-sign:us10y'));
    // 방향어가 숫자 앞에 와도(관문 10250112 ②) · 0bp 는 부호 없이 정상(관문 10250112 ①)
    assert.ok(checkMorningLocale(good.en.replace('The 10-year Treasury yield at 4.99% (+4bp) and WTI crude', 'The 10-year Treasury yield fell 4bp to 4.99% and WTI crude'), 'en', facts).includes('mb:metric-sign:us10y'));
    const flat: MorningFacts = { ...facts, metrics: morningMetrics({ rlsi: 28.7, rlsiTrend: [28.7, 28.7, 28.7], vix: 19.57, vix3m: 20.12, gexIndex: -12, gexLevel: 'NEUTRAL', breadthPct: 42.6, us10y: { level: 4.99, bp: 0 }, oil: { level: 100.65, chgPct: 1.19 }, gold: { level: 4040.8, chgPct: -0.48 } }) };
    const zero = (x: string) => x.replace('4.99%(+4bp)', '4.99%(0bp)').replace('4.99% (+4bp)', '4.99% (0bp)');
    assert.deepEqual(checkMorningV2(JSON.stringify({ ko: zero(good.ko), en: zero(good.en), ja: zero(good.ja) }), flat).reasons, []);
    // 조건문의 «would» 는 예측이 아니다(관문 ③)
    assert.ok(!checkMorningLocale(good.en.replace('a stronger reading adds rate pressure', 'a stronger reading would add rate pressure'), 'en', facts).includes('mb:forecast:next'));
});

test('지나간 일정·근거 없는 일정은 다음 분기점이 될 수 없다', () => {
    const cpi = good.en.replace('New Home Sales (Sep) at 10/26 (Mon) 10:00 ET', 'CPI at 10/26 (Mon) 08:30 ET');
    assert.ok(checkMorningLocale(cpi, 'en', facts).length > 0);
});

test('3언어 숫자 불일치는 탈락', () => {
    const c = checkMorningV2(JSON.stringify({ ...good, en: good.en.replace(' and WTI crude at $100.65 (+1.19%) together keep', ' together keeps') }), facts);
    assert.ok(c.reasons.includes('cross:numbers'));
    assert.deepEqual(numberSignature(good.ko), numberSignature(good.ja));
});

test('장중(REG) 첫 문장에 장전 말·어제 결과는 탈락', () => {
    const reg: MorningFacts = { ...facts, session: 'REG', indexFacts: facts.indexFacts.filter(f => f.kind === 'spot').map(f => ({ ...f, sessionDate: '2026-10-26' })) };
    const bad = '지금 개장 전 나스닥 종합은 전일 종가 대비 0.9%, S&P500은 0.5% 상승 중입니다. ' + good.ko.split('. ').slice(1).join('. ');
    assert.ok(checkMorningLocale(bad, 'ko', reg).includes('mb:session-mismatch'));
});

console.log(`morningBriefingV2: ${passed} passed`);
