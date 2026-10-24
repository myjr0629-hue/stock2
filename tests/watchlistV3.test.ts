import assert from 'node:assert/strict';
import { buildLineFacts } from '../src/lib/ai/watchlistLine';
import { stockFactsOf } from '../src/lib/ai/watchlistStockFacts';
import { checkWatchlistV3Output, checkWatchlistV3Insight, watchlistMetricReasons, watchlistInternalReasons, buildWatchlistV3Prompt } from '../src/lib/ai/watchlistV3';
const row = { price: 145, changePct: -1.2, session: 'pre', extendedPrice: 146, extendedChangePct: 0.69, maxPain: 155, callWall: 160, putFloor: 135, gammaFlipLevel: 140, levelsChainDate: '2026-10-20', levelsExpiration: '2026-10-30', levelsSource: 'structure', darkPoolPct: 40, darkPoolDate: '2026-10-20', impliedMovePct: 3.2, impliedMoveDef: 'atm-straddle-mid/1', impliedMoveExpiry: '2026-10-30' };
const now = Date.parse('2026-10-21T12:00:00Z');
const f = buildLineFacts('NVDA', row, now)!;
const chips = { ko: 'Put Floor $135 위 {PF}', en: '{PF} above Put Floor $135', ja: 'Put Floor $135の{PF}上' };
const insight = { ko: 'NVDA 장전 예상 변동 ±3.2%, 양감마가 완충', en: 'NVDA pre-market implied move ±3.2%; positive gamma dampens swings', ja: 'NVDA 寄り前の想定変動幅±3.2%、正ガンマが緩和' };
const good = { ...chips, insight };
const check = (obj: unknown) => checkWatchlistV3Output(JSON.stringify(obj), f);
let n = 0;
function test(name: string, fn: () => void) { fn(); n++; console.log('ok -', name); }
test('세션 가격·등락 기준·관측 시각 미상·수집 시각 분리', () => {
    assert.equal(f.quote.price, 146); assert.equal(f.quote.changePct, 0.69);
    assert.equal(f.quote.comparisonBasis, 'regular-close'); assert.equal(f.quote.observedAt, null);
    assert.equal(f.quote.inputAsOf, '2026-10-21T12:00:00.000Z');
    const reg = buildLineFacts('NVDA', { ...row, session: 'reg' }, now)!;
    assert.equal(reg.quote.price, 145); assert.equal(reg.quote.changePct, -1.2);
    assert.equal(reg.quote.comparisonBasis, 'previous-regular-close');
    assert.equal(buildLineFacts('NVDA', { ...row, session: 'closed' }, now)!.quote.session, 'closed');
    assert.equal(buildLineFacts('NVDA', { ...row, extendedPrice: null }, now)!.quote.session, 'closed');
    assert.equal(buildLineFacts('NVDA', { ...row, session: 'reg', missingFields: ['changePct'] }, now)!.quote.changePct, null);
    assert.equal(buildLineFacts('NVDA', { ...row, extendedChangePct: null }, now)!.quote.changePct, null);
    assert.equal(buildLineFacts('NVDA', { ...row, session: 'post' }, now)!.quote.session, 'post');
    const unknown = buildLineFacts('NVDA', { ...row, session: undefined }, now)!;
    assert.equal(unknown.quote.session, 'reference');
    assert.equal(stockFactsOf(f).contractVersion, 3); assert.equal(stockFactsOf(f).levels[0].chainDate, '2026-10-20');
});
test('주체·세션·숫자·감마 근거를 담은 정상 3언어 통과', () => {
    const c = check(good); assert.equal(c.ok, true, c.reasons.join(',')); assert.deepEqual(c.insight, insight);
});
test('결손·일부 언어 실패는 후보 전체 거절', () => {
    for (const value of [null, { ko: insight.ko }, { ...insight, en: '' }]) assert.equal(check({ ...chips, insight: value }).ok, false);
    assert.equal(check(null).ok, false);
    assert.equal(check({ options_map: chips, insight }).ok, true);
});
test('잘못된 주체·세션·같은 입력 안 다른 지표 숫자 차용 거절', () => {
    for (const ko of [insight.ko.replace('NVDA', 'AAPL'), insight.ko.replace('장전', '시간외'), insight.ko.replace('3.2', '40'), insight.ko.replace('3.2', '3.3')]) assert.equal(check({ ...good, insight: { ...insight, ko } }).ok, false, ko);
    assert.ok(check({ ...good, insight: { ...insight, ko: insight.ko.replace('3.2', '40') } }).reasons.includes('ko:v3:metric:implied'));
});
test('언어 간 숫자·부호 불일치, 내부 라벨·권유·숫자 없는 일반론 차단', () => {
    for (const ko of ['NVDA 장전 양감마가 움직임을 누르는 자리', 'NVDA 장전 GEX 예상 변동 ±3.2% 완충', 'NVDA 장전 예상 변동 ±3.2% 매수하세요', 'NVDA 장전 예상 변동 ±3.2% 시간외 준비 중']) assert.equal(check({ ...good, insight: { ...insight, ko } }).ok, false, ko);
    const changed = check({ ...good, insight: { ...insight, en: insight.en.replace('±3.2%', '3.2%') } });
    assert.ok(changed.reasons.includes('v3:locale-numbers'));
    assert.equal(check({ ...good, ko: chips.ko + ' · STOCK_FACTS' }).ok, false);
});
test('정상 문장 오탈락 방지: 준비 중·매개·자료 같은 일반어는 내부 라벨 아님', () => {
    for (const label of ['STOCK_FACTS', 'inputAsOf', 'changePct', 'impliedMove']) assert.deepEqual(watchlistInternalReasons(label), ['v3:internal-label']);
    assert.deepEqual(watchlistInternalReasons('implied move'), []);
    for (const s of ['NVDA 장전 실적 준비 중, 예상 변동 ±3.2%가 완충', '요인과 근거 데이터의 관계', 'Facts about the business']) assert.deepEqual(watchlistInternalReasons(s), []);
    assert.equal(checkWatchlistV3Insight(insight.ko.replace('양감마가 완충', '양감마가 변동 완충'), 'ko', f, now).length, 0);
    assert.deepEqual(checkWatchlistV3Insight(insight.ko.replace('NVDA ', 'NVDA는 '), 'ko', f, now), []);
    assert.deepEqual(checkWatchlistV3Insight(insight.ja.replace('NVDA ', 'NVDAは'), 'ja', f, now), []);
});
test('숫자 계약: 역순 주어·레벨 교체·콜/풋 비중 교체·숫자 나열 차단', () => {
    assert.deepEqual(watchlistMetricReasons('off-exchange 40%', f), []);
    assert.ok(watchlistMetricReasons('40%의 예상 변동', f).includes('v3:metric:implied'));
    assert.ok(watchlistMetricReasons('주가 $135', f).includes('v3:metric:quote-price'));
    assert.ok(watchlistMetricReasons('現在値$135', f).includes('v3:metric:quote-price'));
    assert.ok(checkWatchlistV3Insight('NVDA 장전 +3.2%, 양감마가 완충', 'ko', f, now).includes('v3:metric:quote-change'));
    assert.ok(watchlistMetricReasons('Call Wall $135', f).includes('v3:metric:cw'));
    const flow = { ...f, contextText: '[options flow; EOD 2026-10-20; contract volume x close, trade direction unknown] NVDA large-premium (>= $50k) contracts: 10; calls 70% / puts 30% of that premium (not net buying)' };
    assert.deepEqual(watchlistMetricReasons('calls 70% / puts 30%', flow), []);
    assert.ok(watchlistMetricReasons('calls 30%', flow).includes('v3:metric:flow-calls'));
    const flowFacts = { ...flow, topLine: 'TOP EVIDENCE [flow]: dated EOD options flow, trade direction unknown' };
    assert.deepEqual(checkWatchlistV3Insight('NVDA pre-market EOD calls 70%; positive gamma dampens swings', 'en', flowFacts, now), []);
    assert.deepEqual(checkWatchlistV3Insight('NVDA pre-market calls 70% at last close; positive gamma dampens swings', 'en', flowFacts, now), []);
    assert.ok(checkWatchlistV3Insight('NVDA 장전 예상 변동 ±3.2%', 'ko', f, now).includes('v3:no-interpretation'));
});
test('저장 당시 사실으로 검사: 생성 시각이 달라도 숫자를 현재 값으로 바꾸지 않음', () => {
    assert.deepEqual(checkWatchlistV3Insight(insight.ko, 'ko', f, now + 3600_000), []);
    assert.match(buildWatchlistV3Prompt(f), /"observedAt": null/);
});
console.log(`${n} passed`);
