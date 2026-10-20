/** 순수 사실·프롬프트·출구 검사. 네트워크/모델/저장소 호출 없음. */
import assert from 'node:assert/strict';
import { buildTacticalFacts, tacticalFactReasons, tacticalPromptFacts } from '../src/lib/ai/tacticalFacts';
import { buildTacticalPrompt, checkTacticalOutput, checkTacticalStored, datedHeadline } from '../src/lib/ai/tacticalPrompt';

const asOf = '2026-10-20T15:00:00.000Z';
const ctx = {
    asOf, rlsiScore: 34, nasdaqChange: -0.3, vix: 18.4, us10y: 5.15, us10yChangeBp: 6, tltChangePct: -0.74,
    dxy: 101.8, marketNewsHeadlines: [datedHeadline({ title: 'Treasury auction draws weak demand', published_utc: '2026-10-20T14:00:00Z' }, 'WIRE', new Date(asOf))!],
    scheduledEvents: ['[economic calendar; 2026-10-21 08:30 ET] Import prices (scheduled; not a released result)'],
};
const facts = buildTacticalFacts(ctx);
let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`ok - ${name}`); }
const match = (text: string, expected = facts) => tacticalFactReasons(text, expected);
const bad = (text: string, expected = facts) => assert.ok(match(text, expected).length, text);
const good = (text: string, expected = facts) => assert.deepEqual(match(text, expected), [], text);

test('입력의 값·부호·크기·방향·기준일, 수준은 방향 미확인', () => {
    assert.deepEqual(facts.metrics.us10yChangeBp, { value: 6, sign: 1, magnitude: 6, direction: 'up', asOfDate: '2026-10-20' });
    assert.equal(facts.metrics.tltChangePct.direction, 'down');
    assert.equal(facts.metrics.tltChangePct.magnitude, 0.74);
    assert.equal(facts.metrics.us10y.direction, null);
    assert.equal(facts.metrics.dxy.direction, null);
    assert.equal(buildTacticalFacts({ ...ctx, metricsAsOf: '2026-10-19T15:00:00Z' }).metrics.us10yChangeBp.asOfDate, '2026-10-19');
    assert.equal(buildTacticalFacts({ ...ctx, us10yChangeBp: 0 }).metrics.us10yChangeBp.direction, 'flat');
    assert.equal(buildTacticalFacts({ ...ctx, us10yChangeBp: NaN }).metrics.us10yChangeBp, undefined);
});
test('세 언어 프롬프트의 facts는 완전히 동일, 숫자·사실을 모델이 정하지 않는 계약', () => {
    for (const l of ['ko', 'en', 'ja'] as const) {
        const prompt = buildTacticalPrompt(ctx, l, facts);
        assert.deepEqual(tacticalPromptFacts(prompt), facts);
        assert.match(prompt, /never decide, invert or recalculate/);
    }
});
test('뉴스 id·발행 절대시각과 다음 일정 절대시각·정확도', () => {
    assert.equal(facts.news[0].publishedAt, '2026-10-20T14:00:00.000Z');
    assert.match(facts.news[0].id, /^news:[a-f0-9]{16}$/);
    assert.equal(facts.news[0].id, buildTacticalFacts(ctx).news[0].id);
    assert.equal(facts.events[0].at, '2026-10-21T12:30:00.000Z');
    assert.equal(facts.events[0].exact, true);
    const boundary = buildTacticalFacts({ ...ctx, scheduledEvents: ['[earnings calendar; 2026-10-21; AMC timing boundary 16:00 ET; exact release time unknown] INTC (scheduled; not a released result)'] }).events[0];
    assert.equal(boundary.at, '2026-10-21T20:00:00.000Z');
    assert.equal(boundary.exact, false);
    assert.equal(buildTacticalFacts({ ...ctx, asOf: '2026-10-21T12:30:00Z' }).events.length, 0);
});
test('회귀: ko 상승 vs en fall·ja 下落, 숫자가 없어도 반대 방향 탈락', () => {
    good('금리 상승 우려가 보도됐습니다.');
    bad('Rates fall after the report.');
    bad('金利下落が報じられました。');
    const down = buildTacticalFacts({ ...ctx, us10yChangeBp: -6 });
    bad('금리 상승 우려가 보도됐습니다.', down);
    good('Rates fall after the report.', down);
    good('金利下落が報じられました。', down);
});
test('up/down/flat 세 언어 일치', () => {
    for (const [value, text] of [[6, ['금리 상승', 'Yields rise', '金利上昇']], [-6, ['금리 하락', 'Yields fall', '金利下落']], [0, ['금리 보합', 'Yields are flat', '金利横ばい']]] as const) {
        const f = buildTacticalFacts({ ...ctx, us10yChangeBp: value });
        for (const s of text) good(s, f);
    }
    bad('Yields are flat');
});
test('여러 지표의 반대 방향·영어 전치 수식어를 올바른 주어에 결합', () => {
    for (const s of ['금리 상승과 TLT 하락이 연결됩니다.', 'Higher yields and falling TLT are consistent.', '金利上昇とTLT下落は整合的です。']) good(s);
    bad('Yields fall while TLT rises.');
    bad('금리 하락과 TLT 상승이 연결됩니다.');
    good('TLT -0.74%는 금리 상승과 연결됩니다.');
});
test('관문 회귀: 세 언어 앞 수식 방향어도 up/down/flat 사실과 대조', () => {
    const phrases = [
        [6, ['상승한 금리', 'Rising yields', '上昇した金利']],
        [-6, ['하락한 금리', 'Falling yields', '下落した金利']],
        [0, ['보합인 금리', 'Flat yields', '横ばいの金利']],
    ] as const;
    for (const [value, texts] of phrases) {
        const f = buildTacticalFacts({ ...ctx, us10yChangeBp: value });
        for (const [other, others] of phrases) for (const text of others) {
            if (value === other) good(text, f); else bad(text, f);
        }
        for (const text of texts) good(text, f);
    }
    for (const text of ['TLT 하락과 상승한 금리', 'Falling TLT and rising yields', 'TLT下落と上昇した金利']) good(text);
    for (const text of ['TLT 하락과 하락한 금리', 'Falling TLT and falling yields', 'TLT下落と下落した金利']) bad(text);
});
test('관문 회귀: 정책금리 보도는 10년물과 별도 사실, 세 언어 모두 같은 뉴스 방향 사용', () => {
    const reports = ['Policy rates are lower after the decision', '정책금리가 하락했습니다', '政策金利が下落しました'];
    const claims = ['Policy rates are lower', '정책금리 하락', '政策金利下落', 'Lower policy rates', '하락한 정책금리', '下落した政策金利'];
    for (const title of reports) {
        const f = buildTacticalFacts({ ...ctx, marketNewsHeadlines: [datedHeadline({ title, published_utc: '2026-10-20T14:00:00Z' }, 'WIRE', new Date(asOf))!] });
        assert.deepEqual(f.news[0].directions, [{ key: 'policyRateChange', direction: 'down' }]);
        for (const text of claims) good(text, f);
        for (const text of ['Policy rates are higher', '정책금리 상승', '政策金利上昇', 'Yields fall', '금리 하락', '金利下落']) bad(text, f);
    }
    for (const text of claims) bad(text); // 정책금리 근거가 없으면 10년물로 대신 검증하지 않는다.
});
test('부호 없는 수준·TLT만으로 금리 방향과 달러 강세를 만들 수 없음', () => {
    const level = buildTacticalFacts({ ...ctx, us10yChangeBp: undefined });
    bad('Yields rise.', level);
    bad('금리 하락', level);
    bad('金利上昇', level);
    for (const s of ['달러 강세', 'The dollar is stronger.', 'ドル強含み']) bad(s, level);
    good('TLT 하락', level);
    good('금리 방향은 미확인입니다.', level);
});
test('nasdaq 강세/약세·rise/fall·上昇/下落은 입력 부호와 대조', () => {
    for (const s of ['나스닥 약세', 'NASDAQ falls', 'ナスダック下落']) good(s);
    for (const s of ['나스닥 강세', 'NASDAQ rises', 'ナスダック上昇']) bad(s);
});
test('현재 값과 반대인 뉴스 방향이 관측값을 덮을 수 없음', () => {
    const f = buildTacticalFacts({ ...ctx, marketNewsHeadlines: [datedHeadline({ title: 'Yields fall', published_utc: '2026-10-20T14:00:00Z' }, 'WIRE', new Date(asOf))!] });
    bad('Yields fall', f);
    const onlyNews = buildTacticalFacts({ ...ctx, us10yChangeBp: undefined, marketNewsHeadlines: f.news.map(n => n.text) });
    good('Yields fall', onlyNews);
    bad('Yields rise', onlyNews);
    assert.deepEqual(onlyNews.news[0].directions, [{ key: 'us10yChangeBp', direction: 'down' }]);
    const speculative = buildTacticalFacts({ ...ctx, us10yChangeBp: undefined, marketNewsHeadlines: [datedHeadline({ title: 'Concerns yields fall', published_utc: '2026-10-20T14:00:00Z' }, 'WIRE', new Date(asOf))!] });
    assert.deepEqual(speculative.news[0].directions, []);
    bad('Yields fall', speculative);
});
test('조건·미확인·부정은 실제 움직임과 구별하고 다른 주어 약화를 금리에 붙이지 않음', () => {
    good('금리 상승과 수요 약화가 함께 보도됐습니다.');
    good('If yields fall, options support is the next test.');
    good('금리가 하락할 경우 감마 방어가 다음 확인 기준입니다.');
    good('金利下落ならガンマ防御が次の確認基準です。');
    good('금리 하락은 미확인입니다.');
    good('Yields are not falling.');
    bad('Yields are not rising.');
    bad('금리 상승이 아닙니다.');
});
test('생성·저장본·복구 출구 전부 동일 방향 검사 적용', () => {
    const outputs = {
        ko: 'WIRE 10:00 ET 보도한 국채 입찰 수요 약화는 금리 상승과 연결해 해석됩니다. 얇은 감마 방어는 충격 흡수력이 제한적입니다. 다음 확인 기준은 미확인입니다.',
        en: 'WIRE reported weak Treasury auction demand at 10:00 ET. Rising yields and thin dealer gamma leave limited absorption. The next test is unconfirmed.',
        ja: 'WIREの10:00 ETの国債入札需要低迷の報道は金利上昇と整合的です。薄いガンマ防御は衝撃吸収力が限定的です。次の確認基準は未確認です。',
    };
    for (const l of ['ko', 'en', 'ja'] as const) {
        const p = buildTacticalPrompt(ctx, l);
        assert.deepEqual(checkTacticalOutput(outputs[l], l, p), [], l);
        assert.deepEqual(checkTacticalStored(outputs[l], p), [], l);
        const wrong = outputs[l].replace(/상승|Rising|上昇/, l === 'ko' ? '하락' : l === 'en' ? 'Falling' : '下落');
        for (const reasons of [checkTacticalOutput(wrong, l, p), checkTacticalStored(wrong, p)]) assert.ok(reasons.some(r => r.startsWith('tactical:facts-direction:')));
    }
});
test('관문 회귀: 앞 수식 반전 완성 문장은 생성·저장 출구 모두 거부', () => {
    const outputs = {
        ko: 'WIRE 보도한 국채 입찰 수요 약화는 상승한 금리와 연결해 해석됩니다. 얇은 감마 방어는 충격 흡수력이 제한적입니다. 다음 확인 기준은 미확인입니다.',
        en: 'WIRE reported weak Treasury auction demand. Rising yields and thin dealer gamma leave limited absorption. The next test is unconfirmed.',
        ja: 'WIREの国債入札需要低迷の報道は上昇した金利と整合的です。薄いガンマ防御は衝撃吸収力が限定的です。次の確認基準は未確認です。',
    };
    for (const l of ['ko', 'en', 'ja'] as const) {
        const p = buildTacticalPrompt(ctx, l);
        assert.deepEqual(checkTacticalOutput(outputs[l], l, p), [], l);
        assert.deepEqual(checkTacticalStored(outputs[l], p), [], l);
        const wrong = outputs[l].replace(/상승한|Rising|上昇した/, l === 'ko' ? '하락한' : l === 'en' ? 'Falling' : '下落した');
        for (const reasons of [checkTacticalOutput(wrong, l, p), checkTacticalStored(wrong, p)]) {
            assert.ok(reasons.includes('tactical:facts-direction:us10yChangeBp:up:down'), `${l}: ${reasons}`);
        }
    }
});
test('관문 회귀: 정책금리 하락 뉴스와 10년물 상승이 함께 있어도 정상 생성·저장본 허용', () => {
    const policy = { ...ctx, marketNewsHeadlines: [datedHeadline({ title: 'Policy rates are lower after the decision', published_utc: '2026-10-20T14:00:00Z' }, 'WIRE', new Date(asOf))!] };
    const outputs = {
        ko: 'WIRE 보도에서 정책금리 하락이 확인됐습니다. 상승한 금리와 얇은 감마 방어는 충격 흡수력이 제한적입니다. 다음 확인 기준은 미확인입니다.',
        en: 'WIRE reported policy rates are lower after the decision. Rising yields and thin dealer gamma leave limited absorption. The next test is unconfirmed.',
        ja: 'WIREの報道で政策金利下落が確認されました。上昇した金利と薄いガンマ防御は衝撃吸収力が限定的です。次の確認基準は未確認です。',
    };
    for (const l of ['ko', 'en', 'ja'] as const) {
        const p = buildTacticalPrompt(policy, l);
        assert.deepEqual(checkTacticalOutput(outputs[l], l, p), [], l);
        assert.deepEqual(checkTacticalStored(outputs[l], p), [], l);
    }
});
console.log(`${passed} passed`);
