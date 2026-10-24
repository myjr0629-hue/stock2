// 뉴스 펄스 v3 — 지시·항목 검사(순수 함수). 실행: node -r ./scripts/offline-test-typescript.cjs tests/newsPulsePrompt.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NEWS_PULSE_SYSTEM, buildNewsPulseUser, checkPulseItem, checkPulseBatch, publicSource, pulseMarketFacts, type PulseArticle } from '@/lib/ai/newsPulsePrompt';
import { morningMetrics } from '@/lib/ai/morningBriefingV2';
import { INDEX_NAMES } from '@/lib/ai/tacticalIndexFacts';

let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log(`ok ${name}`); };

const art: PulseArticle = { id: 'fmp-stock-abc123', title: 'Bloom Energy raises Q4 guidance to $1.2 billion on data-center demand', desc: 'Revenue rose 35% to $800 million; capacity target above 5 GW.', source: 'Reuters', publishedET: '10/24 08:10 ET', ageMin: 42 };
const facts = pulseMarketFacts(
    [{ id: 'nq', name: INDEX_NAMES.nq, kind: 'futures', chgPct: -0.08, asOfET: '2026-10-24 08:00 ET', sessionDate: null, basis: { ko: '정산 대비', en: 'vs prior settlement near previous cash close', ja: '清算値比' } }],
    morningMetrics({ us10y: { level: 5.0, bp: 4 }, oil: { level: 103.27, chgPct: 3.82 }, vix: 19.45 }),
);
const good = {
    id: art.id, headline: 'Bloom Energy raises Q4 guidance',
    summaryKR: '블룸 에너지가 데이터센터 수요를 이유로 4분기 가이던스를 12억 달러로 높였고, 매출은 35% 늘어난 8억 달러입니다.',
    summaryEN: 'Bloom Energy raised Q4 guidance to $1.2 billion on data-center demand, with revenue up 35% to $800 million.',
    summaryJP: 'ブルーム・エナジーはデータセンター需要を理由に4Q見通しではなくガイダンスを12億ドルに引き上げ、売上高は35%増の8億ドルです。'.replace('見通しではなく', ''),
    analysisKR: '데이터센터 전력 수요가 분산형 발전 업체의 수주와 증설로 이어지는 구조라, 전력 인프라 종목의 실적 기대에 직접 닿습니다.',
    analysisEN: 'Data-center power demand flows into orders and capacity build-outs at distributed-generation suppliers, which ties directly into earnings expectations for power-infrastructure stocks.',
    analysisJP: 'データセンターの電力需要が分散型発電企業の受注と増設につながる構造で、電力インフラ銘柄の業績期待に直接結びついています。',
    category: 'SECTOR', impact: 'BULLISH', urgency: 4,
};

test('시장 사실 — 선물은 이름·현물/선물·기준을 단다(«NASDAQ 100» 만 넘기지 않는다)', () => {
    assert.match(facts[0], /^Nasdaq 100 futures -0\.08% \(futures; vs prior settlement/);
    assert.ok(facts.some(f => f === 'the 10-year Treasury yield: 5.00% (+4bp vs previous close)'));
});

test('지시 — IF→THEN·«주목할 필요» 요구가 없고 금지로 바뀌었다 · 기사 id 그대로', () => {
    assert.doesNotMatch(NEWS_PULSE_SYSTEM, /use "IF → THEN" format|~에 주목할 필요가 있습니다", "~할 가능성을 시사합니다/);
    assert.match(NEWS_PULSE_SYSTEM, /Never write IF\/THEN/);
    assert.match(NEWS_PULSE_SYSTEM, /Copy each selected article's "id" EXACTLY/);
    const u = buildNewsPulseUser([art], facts, '2026-10-24T12:52:00.000Z');
    assert.ok(u.includes('MARKET_FACTS: [') && u.includes('"publishedET":"10/24 08:10 ET"'));
});

test('출처 칸 — 내부 공급사 이름은 비운다', () => {
    assert.equal(publicSource('FMP'), '');
    assert.equal(publicSource('fmp-stock'), '');
    assert.equal(publicSource('Reuters'), 'Reuters');
});

test('정상 항목 통과', () => {
    assert.deepEqual(checkPulseItem(good, art, facts).reasons, []);
});

test('조건·예측·독자 할 일 해석은 탈락(옛 운영 120건 중 115건의 말투)', () => {
    const bad = { ...good, analysisKR: '만약 AI 데이터센터 전력 수요가 확대된다면, 분산형 발전 업체의 실적이 개선될 수 있습니다.' };
    assert.ok(checkPulseItem(bad, art, facts).reasons.includes('analysisKR:conditional-or-forecast'));
    const bad2 = { ...good, analysisEN: 'IF data-center demand persists, THEN power stocks may re-rate.' };
    assert.ok(checkPulseItem(bad2, art, facts).reasons.includes('analysisEN:conditional-or-forecast'));
    const bad3 = { ...good, analysisJP: 'もしデータセンター需要が続けば、電力株の再評価が予想されます。' };
    assert.ok(checkPulseItem(bad3, art, facts).reasons.includes('analysisJP:conditional-or-forecast'));
    const todo = { ...good, analysisKR: '전력 인프라 종목의 밸류에이션이 이미 반영됐는지 점검할 필요가 있습니다.' };
    assert.ok(checkPulseItem(todo, art, facts).reasons.includes('analysisKR:conditional-or-forecast'));
});

test('지어낸 숫자·id 불일치·언어 혼입·3언어 숫자 불일치는 탈락', () => {
    assert.ok(checkPulseItem({ ...good, summaryEN: good.summaryEN.replace('35%', '45%') }, art, facts).reasons.some(r => r.startsWith('summaryEN:number')));
    assert.deepEqual(checkPulseItem(good, undefined, facts).reasons, ['pulse:id-mismatch']);
    assert.ok(checkPulseItem({ ...good, summaryKR: 'Bloom Energy raised guidance to $1.2 billion and revenue grew 35%.' }, art, facts).reasons.includes('summaryKR:script'));
    assert.ok(checkPulseItem({ ...good, summaryJP: good.summaryJP.replace('、売上高は35%増の8億ドルです', 'です') }, art, facts).reasons.includes('summary:cross-numbers'));
});

test('배열 — 80% 이상 통과해야 응답을 쓴다 · 중복 id 탈락', () => {
    const ok = checkPulseBatch(JSON.stringify([good]), [art], facts);
    assert.ok(ok.ok, JSON.stringify(ok.reasons));
    const dup = checkPulseBatch(JSON.stringify([good, good]), [art], facts);
    assert.ok(!dup.ok);
    assert.ok(!checkPulseBatch('not json', [art], facts).ok);
    // 적격 기사 0건([])은 정상 — 다음 단을 부르지 않는다 · 라우트는 v3 실패 때 원문 대체 항목을 저장하지 않는다(관문 10250319)
    assert.ok(checkPulseBatch('[]', [art], facts).ok);
    // 범위 금액을 정확히 풀어 쓰면 통과(관문 10250345 ②)
    const rangeArt = { ...art, desc: 'Capex guidance of $10-$12 billion for next year.' };
    const rangeItem = { ...good, summaryKR: '블룸 에너지는 내년 설비투자 가이던스를 100억~120억 달러로 제시했습니다.', summaryEN: 'Bloom Energy guided capex of $10-$12 billion for next year.', summaryJP: 'ブルーム・エナジーは来年の設備投資見通しではなく計画を100億～120億ドルと示しました。'.replace('見通しではなく', '') };
    assert.ok(!checkPulseItem(rangeItem, rangeArt, facts).reasons.some(r => /number/.test(r)), JSON.stringify(checkPulseItem(rangeItem, rangeArt, facts).reasons));

    const src = fs.readFileSync(path.join(__dirname, '../src/app/api/guardian/news-digest/route.ts'), 'utf8');
    assert.match(src, /let parsed = parsePulseArray\(bedrockResult\.text, v3\);/);
    assert.match(src, /if \(v3\) return \[\];\n\s+\/\/ Fallback: return raw top items without AI/);
    // 드라이런은 매크로 공유 캐시 읽기만(관문 10250345 ①)
    assert.match(src, /getMarketFacts\(true\)/);
    assert.doesNotMatch(src.slice(src.indexOf('async function dryCompare'), src.indexOf('export async function GET')), /getMacroContext\(baseUrl\)/);
});

test('라우트 배선 — v3 항목 검사로 거르고, 원문 id 가 없으면 다른 기사(articles[i])에 붙이지 않는다', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/app/api/guardian/news-digest/route.ts'), 'utf8');
    assert.match(src, /validate: v3 \? \(text: string\) => checkPulseBatch\(text, pulseInputs, marketFacts\) : newsDigestGate/);
    assert.match(src, /const matchedArticle = v3 \? articles\.find\(a => String\(a\.id\) === String\(item\.id\)\) : \(articles\.find\(a => a\.id === item\.id\) \|\| articles\[i\]\)/);
    assert.match(src, /if \(searchParams\.get\('dry'\) === 'compare'\) \{\n\s+if \(!adminAuthorized\(req\.headers\)\)/);
});

console.log(`newsPulsePrompt: ${passed} passed`);
