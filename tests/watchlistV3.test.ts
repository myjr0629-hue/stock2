import assert from 'node:assert/strict';
import { buildLineFacts, checkLineOutput } from '../src/lib/ai/watchlistLine';
import { stockFactsOf, quoteSessionValidUntil, quoteSessionLive } from '../src/lib/ai/watchlistStockFacts';
import { checkWatchlistV3Output, checkWatchlistV3Insight, watchlistMetricReasons, watchlistInternalReasons, buildWatchlistV3Prompt, chipFragments, factChips } from '../src/lib/ai/watchlistV3';
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
    assert.ok(watchlistMetricReasons('주가 $135', f).includes('v3:metric:quote-number'));
    assert.ok(watchlistMetricReasons('現在値$135', f).includes('v3:metric:quote-number'));
    assert.ok(checkWatchlistV3Insight('NVDA 장전 +3.2%, 양감마가 완충', 'ko', f, now).includes('v3:metric:quote-number'));
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
    // 모델 입력에 시세 가격·등락·수집 시각이 없다(36시간 저장 글에 지금 가격을 박지 않는다 · 입력 해시가 15분마다 바뀌지 않는다)
    const p = buildWatchlistV3Prompt(f);
    assert.doesNotMatch(p, /146|0\.69|inputAsOf|2026-10-21T12/);
    assert.equal(buildWatchlistV3Prompt(buildLineFacts('NVDA', { ...row, extendedPrice: 147.3, extendedChangePct: 1.5 }, now + 900_000)!), p);
    assert.match(p, /"sessionLabel"/);
});
test('관문 10241926 ①: 지표 이름과 숫자 사이 콜론·수식어로 결속을 우회하지 못한다 — 시세 숫자는 해석에 못 쓴다', () => {
    const cases: Record<'ko' | 'en' | 'ja', string[]> = {
        ko: ['NVDA 장전 주가: $135, 양감마가 완충', 'NVDA 장전 주가는 현재 $135로 양감마가 완충', 'NVDA 장전 $135 수준에서 양감마가 완충', 'NVDA 장전 주가 $146.00, 양감마가 완충', 'NVDA 장전 가격 = $135, 양감마가 완충'],
        en: ['NVDA pre-market: price: $135; positive gamma dampens swings', 'NVDA pre-market price is now $135; positive gamma dampens swings', 'NVDA pre-market $135 area; positive gamma dampens swings', 'NVDA pre-market, quote $146; positive gamma dampens swings'],
        ja: ['NVDA 寄り前、株価:$135で正ガンマが緩和', 'NVDA 寄り前、株価は現在$135、正ガンマが緩和', 'NVDA 寄り前、$135付近で正ガンマが緩和'],
    };
    for (const loc of ['ko', 'en', 'ja'] as const) for (const text of cases[loc]) {
        const r = checkWatchlistV3Insight(text, loc, f, now);
        assert.ok(r.some(x => /^v3:metric:(?:quote-number|unbound-price)$/.test(x)), `${loc} ${text} → ${r.join(',')}`);
        assert.equal(check({ ...good, insight: { ...insight, [loc]: text } }).ok, false, text);
    }
    // 같은 $135 라도 Put Floor 의 값으로 결속되면 정상(앞·뒤 모두)
    assert.deepEqual(watchlistMetricReasons('Put Floor: $135 위', f), []);
    assert.deepEqual(watchlistMetricReasons('$135 Put Floor 위', f), []);
    assert.deepEqual(watchlistMetricReasons('$135의 Put Floor', f), []);
    assert.deepEqual(checkWatchlistV3Insight('NVDA 장전 Put Floor $135 위에서 양감마가 변동을 완충', 'ko', f, now), []);
    assert.deepEqual(checkWatchlistV3Insight('NVDA pre-market: Put Floor $135 below; positive gamma dampens swings', 'en', f, now), []);
    // 다른 지표 값을 빌리면(예상 변동 자리에 장외 비중 40%) 이름과 숫자 사이가 떨어져 있어도 탈락
    assert.ok(watchlistMetricReasons('예상 변동은 대략 40%', f).includes('v3:metric:implied'));
    assert.ok(watchlistMetricReasons('Call Wall: $135', f).includes('v3:metric:cw'));
    // 이름 없는 ±% 는 예상 변동과 같을 때만
    assert.deepEqual(watchlistMetricReasons('±3.2% 범위', f), []);
    assert.ok(watchlistMetricReasons('5.5% 범위', f).includes('v3:metric:unbound-pct'));
    // 칩 줄의 날짜(10/20)는 지표 숫자로 결속하지 않는다
    assert.deepEqual(watchlistMetricReasons('장외 비중 40% (10/20)', f), []);
});
test('세션 기한: 장전→09:30 · 정규장→마감(조기 폐장 13:00) · 시간외→20:00 · 직전 종가→다음 개장', () => {
    const et = (iso: string) => Date.parse(iso);
    assert.equal(quoteSessionValidUntil({ session: 'pre' }, et('2026-10-21T12:00:00Z')), et('2026-10-21T13:30:00Z'));
    assert.equal(quoteSessionValidUntil({ session: 'reg' }, et('2026-10-21T15:00:00Z')), et('2026-10-21T20:00:00Z'));
    assert.equal(quoteSessionValidUntil({ session: 'reg' }, et('2026-11-27T15:00:00Z')), et('2026-11-27T18:00:00Z'), '조기 폐장 13:00 ET(EST)');
    assert.equal(quoteSessionValidUntil({ session: 'post' }, et('2026-10-21T21:00:00Z')), et('2026-10-22T00:00:00Z'));
    assert.equal(quoteSessionValidUntil({ session: 'closed' }, et('2026-10-24T12:00:00Z')), et('2026-10-26T13:30:00Z'), '토 → 월 09:30 ET');
    assert.equal(quoteSessionValidUntil({ session: 'closed' }, et('2026-11-25T23:00:00Z')), et('2026-11-27T14:30:00Z'), '추수감사절 휴장 건너뜀(EST)');
    assert.equal(quoteSessionLive({ session: 'pre' }, et('2026-10-21T12:00:00Z'), et('2026-10-21T16:00:00Z')), false);
    assert.equal(quoteSessionLive({ session: 'pre' }, et('2026-10-21T12:00:00Z'), et('2026-10-21T13:29:00Z')), true);
    assert.equal(quoteSessionLive(null, 0, 0), false);
});
test('칩 조각: 쪽을 사실로 미리 만든다 · 모델 칩 줄이 틀리면 사실 그대로의 칩 줄(같은 검사 통과) · 해석은 모델 것 그대로 검사', () => {
    const fr = chipFragments(f);
    assert.equal(fr.ko[0], 'Gamma Flip $140 위 {GF}, 양(+) 감마 구간');
    assert.ok(fr.ko.includes('Put Floor $135 위 {PF}') && fr.ko.includes('Call Wall $160까지 {CW}') && fr.ko.includes('Max Pain $155 아래 {MP}'));
    assert.ok(fr.en.includes('{PF} above Put Floor $135') && fr.ja.includes('Call Wall $160まで{CW}'));
    assert.match(buildWatchlistV3Prompt(f), /CHIP FRAGMENTS[\s\S]*ko: Gamma Flip \$140 위 \{GF\}/);
    // 쪽을 뒤집은 모델 칩 줄(Put Floor 아래) → 사실 칩 줄로 바뀌어 통과, 표식 남김
    const wrong = check({ ko: 'Put Floor $135 아래 {PF}', en: '{PF} below Put Floor $135', ja: 'Put Floor $135の{PF}下', insight });
    assert.equal(wrong.ok, true, wrong.reasons.join(','));
    assert.equal((wrong as any).chipFallback, true);
    assert.deepEqual(wrong.text, checkLineOutput(JSON.stringify(factChips(f)), f).text, '사실 칩 줄(길이 넘치면 뒤 조각부터 덜어 낸 것)');
    assert.equal(wrong.text!.ko, 'Gamma Flip $140 위 {GF}, 양(+) 감마 구간 · Max Pain $155 아래 {MP}');
    // 권유어 칩 줄도 사실 칩 줄로 — 모델 글이 화면에 나가지 않는다
    assert.doesNotMatch(check({ ...chips, ko: 'Put Floor $135 위 {PF} · 매수 구간', insight }).text!.ko, /매수/);
    // 해석이 틀리면 칩 대체와 무관하게 탈락
    assert.equal(check({ ko: 'Put Floor $135 아래 {PF}', en: chips.en, ja: chips.ja, insight: { ...insight, ko: 'NVDA 장전 주가 $146, 양감마가 완충' } }).ok, false);
    // 지형이 정상인 모델 칩 줄은 그대로(대체 표식 없음)
    assert.equal((check(good) as any).chipFallback, undefined);
});
test('해석 길이 = 화면 폭 46em(360폭 두 줄, 첫머리 포함) — 라틴 이름이 섞인 64자는 통과, 한글만 긴 글은 탈락', () => {
    const long = 'NVDA 장전 예상 변동 ±3.2%가 양감마 구간에서 완충되며 풋 플로어 위에서 움직임이 눌리고 변동이 줄어드는 자리';
    assert.ok(checkWatchlistV3Insight(long, 'ko', f, now).includes('v3:too-long'));
    const latin = 'NVDA 장전 예상 변동 ±3.2%가 Put Floor $135와 Gamma Flip $140 사이 양감마 자리';
    assert.ok([...latin].length > 48);
    assert.ok(!checkWatchlistV3Insight(latin, 'ko', f, now).some(r => /too-long|insight:format/.test(r)), checkWatchlistV3Insight(latin, 'ko', f, now).join(','));
    assert.ok(!checkWatchlistV3Insight(insight.ko, 'ko', f, now).includes('v3:too-long'));
    assert.ok(checkWatchlistV3Insight('NVDA 장전 예상 변동 ±3.2% · 양감마 완충 자리', 'ko', f, now).includes('insight:format'), '형식 문자는 계속 막는다');
    assert.match(buildWatchlistV3Prompt(f), /INSIGHT BUDGET[^\n]*ko ≤ 38/);
});
test('칩 줄 언어 간 숫자가 다르면 사실 칩 줄(세 언어 같은 조각 수)', () => {
    const r = check({ ko: chips.ko + ' · 장외 비중 40.0%', en: chips.en, ja: chips.ja, insight });
    assert.equal(r.ok, true, r.reasons.join(','));
    assert.equal((r as any).chipFallback, true);
    const sig = (t: string) => (t.match(/\$[\d.]+|[\d.]+%|\{[A-Z]+\}/g) || []).sort().join('|');
    assert.equal(new Set(['ko', 'en', 'ja'].map(l => sig((r.text as any)[l]))).size, 1);
});
console.log(`${n} passed`);
