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
        assert.ok(prompt.includes({
            ko: '금리·수익률 방향은 부정문·조건문으로 쓰지 말고 [입력 사실]의 방향 그대로 평서문으로 쓰세요.',
            en: 'State rate and yield directions in affirmative declarative sentences exactly as given in [input facts]; do not use negation or conditionals for these directions.',
            ja: '金利・利回りの方向は否定文・条件文にせず、[入力事実]の方向どおりに肯定の平叙文で書いてください。',
        }[l]));
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
test('미확인·다른 주어 약화를 금리 방향으로 만들지 않음', () => {
    good('금리 상승과 수요 약화가 함께 보도됐습니다.');
});
test('관문 7차 회귀: «미확인» 문구로 반대 방향 금리 주장을 우회하지 못함', () => {
    const up = buildTacticalFacts({ ...ctx, us10yChangeBp: 6 });
    for (const text of ['금리 하락은 미확인 재료에 따른 반응입니다', '金利下落は未確認の材料への反応です', '금리 하락은 미확인입니다.']) bad(text, up);
});
test('관문 회귀: 부정된 상승·하락 6문장은 사실 부호와 무관하게 판정 불가', () => {
    for (const value of [6, -6, 0, undefined]) {
        const f = buildTacticalFacts({ ...ctx, us10yChangeBp: value });
        for (const text of [
            '금리는 상승하지 않았다', '金利は上昇しなかった', "Yields aren't rising",
            '금리는 하락하지 않았다', '金利は下落しなかった', "Yields aren't falling",
        ]) assert.ok(match(text, f).some(r => r.includes(':unverifiable:')), text);
    }
});
test('금리 방향과 같은 절의 부정·조건 표지는 모두 fail-closed', () => {
    for (const text of [
        '금리는 안 상승합니다', '금리는 상승하지 못했습니다', '금리 상승이 아닙니다',
        '상승하지 않은 금리', '하락하지 않은 금리', '上昇しなかった金利', 'Not rising yields',
        '금리가 상승할 경우', '금리가 상승하면 충격을 확인합니다', '금리가 상승이라면', '금리가 상승한다면',
        '金利は上昇しない', '金利は上昇しません', '金利は上昇せず',
        '金利上昇の場合', '金利上昇なら', '金利が上昇すれば', '金利が上昇したら',
        'Yields are not rising', 'Yields are never higher', 'Yields are no longer rising', 'Yields aren’t rising',
        'If yields rise', 'Unless yields rise', 'Yields should rise', 'Yields would rise', 'Yields could rise',
        'If yields fall, options support is the next test.', '금리가 하락할 경우 감마 방어가 다음 확인 기준입니다.',
        '金利下落ならガンマ防御が次の確認基準です。', 'Yields are not falling.',
        'If rising yields are unconfirmed', // 미확인 표현도 부정·가정 방향 검사를 우회하지 못한다.
    ]) assert.ok(match(text).some(r => r.includes(':unverifiable:')), text);
});
test('관문 회귀: 뒤 조건절과 무관하게 앞 관측절의 반전 검사, 정상 관측은 통과', () => {
    const pairs = [
        ['금리는 하락했으며 감마가 약한 경우 충격 흡수력이 제한적입니다', '하락', '상승'],
        ['금리는 하락했고 감마가 약하면 충격 흡수력이 제한적입니다', '하락', '상승'],
        ['Yields fell and if gamma is weak absorption is limited', 'fell', 'rose'],
        ['Yields fell if gamma is weak', 'fell', 'rose'],
        ['金利は下落したがガンマが弱い場合は吸収力が限定的です', '下落', '上昇'],
        ['金利は下落しておりガンマが弱ければ吸収力が限定的です', '下落', '上昇'],
    ];
    for (const [text, wrong, right] of pairs) {
        assert.ok(match(text).includes('tactical:facts-direction:us10yChangeBp:up:down'), text);
        good(text.replace(wrong, right));
    }
    // 절 경계 밖 부정은 앞 관측 방향에 붙이지 않는다.
    for (const text of ['금리는 상승했으며 감마는 강하지 않습니다', 'Yields rose, but gamma is not strong', '金利は上昇したがガンマは強くない']) good(text);
});
test('부정·가정 뉴스는 금리·정책금리의 명시 방향 근거로 승격하지 않음', () => {
    for (const title of ['금리는 상승하지 않았다', '金利は上昇しなかった', "Yields aren't rising", 'If yields rise',
        '정책금리가 하락하지 않았다', '政策金利が下落しなかった', "Policy rates aren't falling", 'Policy rates should fall']) {
        const f = buildTacticalFacts({ ...ctx, marketNewsHeadlines: [datedHeadline({ title, published_utc: '2026-10-20T14:00:00Z' }, 'WIRE', new Date(asOf))!] });
        assert.deepEqual(f.news[0].directions, [], title);
        assert.ok(match(title, f).some(r => r.includes(':unverifiable:')), title);
    }
});
test('관문 회귀: 부정·조건 재현은 생성·저장 출구 모두 거부', () => {
    const cases = {
        ko: ['금리는 상승하지 않았다', '금리는 하락하지 않았다', '금리는 하락했으며 감마가 약한 경우 충격 흡수력이 제한적입니다'],
        en: ["Yields aren't rising", "Yields aren't falling", 'Yields fell and if gamma is weak absorption is limited'],
        ja: ['金利は上昇しなかった', '金利は下落しなかった', '金利は下落したがガンマが弱い場合は吸収力が限定的です'],
    };
    for (const l of ['ko', 'en', 'ja'] as const) for (const text of cases[l]) {
        const p = buildTacticalPrompt(ctx, l);
        for (const reasons of [checkTacticalOutput(text, l, p), checkTacticalStored(text, p)]) {
            assert.ok(reasons.some(r => r.startsWith('tactical:facts-direction:')), `${l}: ${text}`);
        }
    }
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
test('관문 회귀(10202008): 등위 주어 «금리와 금값은 하락»은 금리 주장으로 거부, 세 언어', () => {
    const f = buildTacticalFacts({ ...ctx, goldChangePct: -0.5 });
    for (const text of ['금리와 금값은 하락했습니다', 'Yields and gold fell', '金利と金価格は下落']) {
        assert.ok(match(text, f).includes('tactical:facts-direction:us10yChangeBp:up:down'), text);
    }
    // 반대 사실(금리 -6bp·금 +0.5%)에서도 같은 결합이 금리 주장으로 대조된다.
    const mirror = buildTacticalFacts({ ...ctx, us10yChangeBp: -6, goldChangePct: 0.5 });
    for (const text of ['금리와 금값은 상승했습니다', 'Yields and gold rose', '金利と金価格は上昇']) {
        assert.ok(match(text, mirror).includes('tactical:facts-direction:us10yChangeBp:down:up'), text);
    }
    // 같은 방향 사실이면 등위 주어 문장은 통과한다.
    const both = buildTacticalFacts({ ...ctx, goldChangePct: 0.5 });
    for (const text of ['금리와 금값은 상승했습니다', 'Yields and gold rose', '金利と金価格は上昇']) good(text, both);
});
test('절 단위 fail-closed: 주어 나열·순서·연결어·생략 변형도 금리 반대 방향 거부', () => {
    const f = buildTacticalFacts({ ...ctx, goldChangePct: -0.5, oilChangePct: -1 });
    for (const text of [
        'Yields, gold and oil fell', 'Gold, oil and yields fell', 'Both yields and gold fell', 'Yields as well as gold fell',
        'Gold fell along with yields', 'Yields along with gold were lower', 'Yields and gold both declined.', 'Gold and yields are lower',
        'Falling gold and yields', 'Lower gold, oil and yields', 'Yields or gold fell', 'The 10-year yield and gold fell sharply.',
        'Yields rose early but fell later', 'Yields rose and then fell',
        '금리, 금값 모두 하락', '금리 및 금값이 하락했습니다', '금값과 금리는 하락', '금리·금값 하락', '하락한 금값과 금리',
        '금리는 상승했지만 이후 하락했습니다', '금리는 상승했다가 하락했습니다',
        '金利、金価格ともに下落', '金価格と金利が低下', '金利や金価格は下落した', '金利および金価格は下落', '金利は上昇したが、その後下落した',
    ]) assert.ok(match(text, f).includes('tactical:facts-direction:us10yChangeBp:up:down'), text);
});
test('절 단위 fail-closed: 각 주어에 직접 붙은 방향은 정상 통과', () => {
    const f = buildTacticalFacts({ ...ctx, goldChangePct: -0.5 });
    for (const text of [
        'Yields rose and gold fell', 'Yields rose while gold fell', 'Yields rose, gold fell', 'Rising yields and falling gold',
        'Rising yields, falling gold', 'Gold fell as yields rose', 'Yields rose 6bp, pushing gold lower', 'Yields rose. Gold fell.',
        '금리는 상승했고 금값은 하락했습니다', '금리 상승과 금값 하락', '금값은 하락했지만 금리는 상승했습니다', '금리는 6bp 상승했습니다',
        '얇은 감마 방어 약화 속에 금리는 상승했습니다',
        '金利は上昇し、金価格は下落', '金利上昇と金価格下落',
        // 금리가 뒤 명사(압력·수요)를 꾸미는 복합 주어: 앞선 다른 주어의 방향어는 면제.
        '국채 입찰 수요 약화와 금리 압력이 연결돼 해석됩니다', 'Weak demand and rate pressure are linked', '需要低迷と金利圧力',
    ]) good(text, f);
    // 복합 주어라도 뒤에 나열된 주어·머리 명사의 방향어는 금리 주장으로 본다.
    for (const text of ['금리 압력과 금값은 하락', '금리 압력 약화', 'Rate pressure and gold fell']) {
        assert.ok(match(text, f).includes('tactical:facts-direction:us10yChangeBp:up:down'), text);
    }
});
test('관문 회귀(10202008): 등위 주어 반전 완성 문장은 생성·저장 출구 모두 거부, 정상본은 통과', () => {
    const goldCtx = { ...ctx, goldChangePct: -0.5 };
    const outputs = {
        ko: ['WIRE 보도한 국채 입찰 수요 약화 속에 금리와 금값은 하락했습니다. 얇은 감마 방어는 충격 흡수력이 제한적입니다. 다음 확인 기준은 미확인입니다.',
            'WIRE 보도한 국채 입찰 수요 약화 속에 금리는 상승했고 금값은 하락했습니다. 얇은 감마 방어는 충격 흡수력이 제한적입니다. 다음 확인 기준은 미확인입니다.'],
        en: ['WIRE reported weak Treasury auction demand. Yields and gold fell, and thin dealer gamma leaves limited absorption. The next test is unconfirmed.',
            'WIRE reported weak Treasury auction demand. Yields rose and gold fell, and thin dealer gamma leaves limited absorption. The next test is unconfirmed.'],
        ja: ['WIREの国債入札需要低迷の報道の中で金利と金価格は下落しました。薄いガンマ防御は衝撃吸収力が限定的です。次の確認基準は未確認です。',
            'WIREの国債入札需要低迷の報道の中で金利は上昇し、金価格は下落しました。薄いガンマ防御は衝撃吸収力が限定的です。次の確認基準は未確認です。'],
    };
    for (const l of ['ko', 'en', 'ja'] as const) {
        const p = buildTacticalPrompt(goldCtx, l);
        const [wrong, right] = outputs[l];
        for (const reasons of [checkTacticalOutput(wrong, l, p), checkTacticalStored(wrong, p)]) {
            assert.ok(reasons.includes('tactical:facts-direction:us10yChangeBp:up:down'), `${l}: ${reasons}`);
        }
        assert.deepEqual(checkTacticalOutput(right, l, p), [], l);
        assert.deepEqual(checkTacticalStored(right, p), [], l);
    }
});
test('관문 회귀(10202231): «국채 수익률» 주어·삽입절 뒤 금리 서술도 사실과 대조', () => {
    const f = buildTacticalFacts({ ...ctx, goldChangePct: -0.5 });
    for (const text of [
        '국채 수익률 하락', '국채 수익률은 하락했습니다', '하락한 국채 수익률',
        'Yields, while gold fell, declined', 'Yields — while gold fell — declined', 'Yields, as gold fell, declined',
        'Yields, gold fell, and then declined',
        '금리는, 금값이 하락한 반면, 하락했습니다', '金利は、金価格が下落する一方、低下した',
    ]) assert.ok(match(text, f).includes('tactical:facts-direction:us10yChangeBp:up:down'), text);
    for (const text of ['국채 수익률 상승', '국채 수익률은 상승했습니다', 'Yields rose, while gold fell', 'Yields rose. Gold fell, then declined.']) good(text, f);
    // 의도된 오탐: 삽입절 뒤 서술은 맞는 방향이어도 다른 주어 방향어와 섞이므로 거부한다(fail-closed).
    for (const text of ['Yields, while gold fell, rose', '金利は、金価格が下落する一方、上昇した']) bad(text, f);
    const goldCtx = { ...ctx, goldChangePct: -0.5 };
    const outputs = {
        ko: 'WIRE 보도한 국채 입찰 수요 약화는 국채 수익률 하락과 연결해 해석됩니다. 얇은 감마 방어는 충격 흡수력이 제한적입니다. 다음 확인 기준은 미확인입니다.',
        en: 'WIRE reported weak Treasury auction demand. Yields, while gold fell, declined, and thin dealer gamma leaves limited absorption. The next test is unconfirmed.',
        ja: 'WIREの国債入札需要低迷の報道の中で金利は、金価格が下落する一方、低下しました。薄いガンマ防御は衝撃吸収力が限定的です。次の確認基準は未確認です。',
    };
    for (const l of ['ko', 'en', 'ja'] as const) {
        const p = buildTacticalPrompt(goldCtx, l);
        for (const reasons of [checkTacticalOutput(outputs[l], l, p), checkTacticalStored(outputs[l], p)]) {
            assert.ok(reasons.includes('tactical:facts-direction:us10yChangeBp:up:down'), `${l}: ${reasons}`);
        }
        const right = {
            ko: outputs.ko.replace('하락과 연결', '상승과 연결'),
            en: outputs.en.replace('Yields, while gold fell, declined,', 'Yields rose while gold fell,'),
            ja: outputs.ja.replace('金利は、金価格が下落する一方、低下しました', '金利は上昇し、金価格は下落しました'),
        }[l];
        assert.deepEqual(checkTacticalOutput(right, l, p), [], `${l}: ${right}`);
        assert.deepEqual(checkTacticalStored(right, p), [], `${l}: ${right}`);
    }
});
test('관문 회귀(10202240·7차): «미확인»이 붙어도 금리 방향은 늘 대조', () => {
    for (const text of ['Yields fell on unconfirmed news', '금리 하락과 미확인 재료가 겹쳤습니다', '金利下落と未確認の材料が重なりました']) {
        assert.ok(match(text).includes('tactical:facts-direction:us10yChangeBp:up:down'), text);
    }
    // 7차 관문 뒤 fail-closed: 방향어 자체가 미확인이어도 사실(상승)과 반대면 거부한다(오탐 허용).
    for (const text of ['금리 하락은 미확인입니다.', '金利下落は未確認です。', 'Falling yields are unconfirmed.', 'A fall in yields is unconfirmed.']) bad(text);
    const outputs = {
        ko: 'WIRE 보도한 국채 입찰 수요 약화 속에 금리 하락과 미확인 재료가 겹쳤습니다. 얇은 감마 방어는 충격 흡수력이 제한적입니다. 다음 확인 기준은 미확인입니다.',
        en: 'WIRE reported weak Treasury auction demand. Yields fell on unconfirmed news, and thin dealer gamma leaves limited absorption. The next test is unconfirmed.',
        ja: 'WIREの国債入札需要低迷の報道の中で金利下落と未確認の材料が重なりました。薄いガンマ防御は衝撃吸収力が限定的です。次の確認基準は未確認です。',
    };
    for (const l of ['ko', 'en', 'ja'] as const) {
        const p = buildTacticalPrompt(ctx, l);
        for (const reasons of [checkTacticalOutput(outputs[l], l, p), checkTacticalStored(outputs[l], p)]) {
            assert.ok(reasons.includes('tactical:facts-direction:us10yChangeBp:up:down'), `${l}: ${reasons}`);
        }
    }
});
console.log(`${passed} passed`);
