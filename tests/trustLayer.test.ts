/**
 * AI 신뢰 레이어(T5) 공용 검사 — src/lib/ai/trustLayer.ts : 예측어 · 문턱·비교 문장 · 낡음
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/trustLayer.test.ts
 *
 * 문장은 전부 운영 실측(2026-10-07 운영 응답: guardian·briefing·flow ai-analysis·deep-analysis 캐시 84건·216문장)에서 가져왔다.
 * 그 84건에서 예측어는 4문장(1.8%)이었고 전부 진짜 예측이었다(오탐 0) — 아래 «통과해야 하는 글»은 그 나머지 212문장의 대표다.
 */
import assert from 'node:assert/strict';
import {
    splitSentences, forecastHits, forecastHitsInSentence, stripForecastSentences,
    checkComparisons, checkRanges, comparisonClaims, flowStaleness, dropDirectionSentences, hasDirectionWords, asOfLabel,
} from '@/lib/ai/trustLayer';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

// ── 문장 나누기 ──────────────────────────────────────────────────────────────
t('소수점·약어를 문장 끝으로 보지 않는다 («+0.48%»·«U.S.»·«$337.5»)', () => {
    const s = splitSentences('S&P 500 선물이 7,864(+0.48%)로 출발했다. NASDAQ 100은 +0.62% 올랐다. U.S. yields eased to 5.31%. Next sentence.');
    assert.equal(s.length, 4, JSON.stringify(s));
    assert.ok(s[0].includes('+0.48%'));
    assert.ok(s[2].startsWith('U.S. yields'));
});
t('일본어 문장부호·줄바꿈이 경계다', () => {
    assert.deepEqual(splitSentences('現況はこうだ。解釈はこうだ。\n見通しはこうだ。').length, 3);
});

// ── 예측어: 실측에서 걸려야 하는 문장 ────────────────────────────────────────────
t('ko — «…핵심 변수가 될 것이다» (가디언 [전망] 실측)', () => {
    const h = forecastHits('[전망] 금리 추이와 기술주 실적 발표 시즌의 결과가 현재의 광범위한 랠리 구조를 유지할지 여부를 결정하는 핵심 변수가 될 것이다.', 'ko');
    assert.ok(h.some((x) => x.id === 'ko:future-geot'), JSON.stringify(h));
});
t('ko — «유지될 것으로 관찰된다»·«발생할 가능성이 높다» (Flow repricing 실측)', () => {
    assert.ok(forecastHits('현재 중립적 균형 상태는 이벤트 리스크 해소 후 방향성 확신이 재진입할 때까지 유지될 것으로 관찰된다.', 'ko').length >= 1);
    assert.ok(forecastHits('구조적 리프라이싱은 (1) 어닝 이벤트 이후 포지셔닝이 재개되거나 (2) 감마 플립을 돌파하는 경우에 발생할 가능성이 높다.', 'ko').length >= 1);
});
t('en — «is likely to occur if…»·«will rise»·«historically precede mean reversion»', () => {
    assert.ok(forecastHits('Structural repricing is likely to occur if institutional whale positioning resumes post-earnings.', 'en').length >= 1);
    assert.ok(forecastHits('Spot will likely rise toward the call wall.', 'en').length >= 1);
    assert.ok(forecastHits('Narrow rallies without breadth participation historically precede mean reversion.', 'en').length >= 1);
    assert.ok(forecastHits('A breakout is expected above the wall.', 'en').length >= 1);
    assert.ok(forecastHits('Analysts say the stock is poised to rally.', 'en').length >= 1);
});
t('ja — 見込み·予想される·だろう·今後の見通し·先行', () => {
    assert.ok(forecastHits('今後、上昇に転じる見込みだ。', 'ja').length >= 1);
    assert.ok(forecastHits('反発が予想される。', 'ja').length >= 1);
    assert.ok(forecastHits('上値は重いだろう。', 'ja').length >= 1);
    assert.ok(forecastHits('今後の見通しは明るい。', 'ja').length >= 1);
    assert.deepEqual(forecastHits('構造が変わることになるのは、現物が下で引けた場合だ。', 'ja'), [], '단독 «ことになる» 는 서술에 흔하다(10/7 프리뷰 실측 오탐)');
});
t('ko — 임박·분수령·반등 기대·전망된다', () => {
    assert.ok(forecastHits('실적 발표가 임박해 변동성이 커지는 분수령이다.', 'ko').length >= 2);
    assert.ok(forecastHits('단기 반등 가능성이 있다.', 'ko').length >= 1);
    assert.ok(forecastHits('상승 흐름이 이어질 것으로 전망된다.', 'ko').length >= 1);
});

// ── 예측어: 통과해야 하는 글(오탐 방지) ───────────────────────────────────────────
t('관찰·조건·현재 상태 추정은 통과 — «있을 가능성이 높다»·«likely driven by»·«하는 것이»', () => {
    const ok: Array<[string, 'ko' | 'en' | 'ja']> = [
        ['기관들이 어닝스 전에 프리미엄을 수집하고 있을 가능성이 높으며, 이는 단기 방향성 확신이 약함을 의미한다.', 'ko'],
        ['이는 단순한 방향성 베팅을 넘어 구조화된 헤징 프레임워크의 일부일 가능성이 높다.', 'ko'],
        ['현물이 $240 감마플립 수준 아래에 위치하면서 SHORT_GAMMA 영역에 있다.', 'ko'],
        ['Institutions are likely collecting premium ahead of earnings, indicating weak directional conviction.', 'en'],
        ['The call demand appears driven by profit-taking rather than fresh accumulation.', 'en'],
        ['Below 7,650 the same dealers have to sell instead of buy.', 'en'],
        ['Max Pain at $230 sits $9 below the current price.', 'en'],
        ['10月28日のアーニングスまで43日ある状況で、機関はヘッジを強化している。', 'ja'],
        ['このコール需要は利益確定を反映していることを示唆している。', 'ja'],
        ['[전망] 변수가 무엇인지, 어떤 조건에서 구조가 바뀌는지를 본다.', 'ko'],   // 레이블은 검사하지 않는다
    ];
    for (const [text, loc] of ok) assert.deepEqual(forecastHits(text, loc).map((h) => h.id), [], text);
});
t('운영 실측(10/7 딥 분석 뉴스 문장) — 애널리스트 목표가·실적 일정·«due to»·보도된 계획은 예측이 아니다', () => {
    const ok: Array<[string, 'ko' | 'en' | 'ja']> = [
        ['Analysts raised their price target to $850 after the Muse AI launch.', 'en'],
        ['애널리스트들이 메타의 목표가를 상향 조정했다.', 'ko'],
        ['アナリストが目標株価を引き上げた。', 'ja'],
        ['The move is due to profit-taking after the rally.', 'en'],
        ['Meta is expected to report third-quarter earnings on Oct. 29.', 'en'],
        ['The options are set to expire on Friday.', 'en'],
        ['회사는 다음 달 신제품을 공개할 것이라고 밝혔다.', 'ko'],
        ['The company announced it will acquire the startup for $2B.', 'en'],
    ];
    for (const [text, loc] of ok) assert.deepEqual(forecastHits(text, loc).map((h) => h.id), [], text);
    // 그래도 우리 자신의 전망은 걸린다
    assert.ok(forecastHits('The stock is expected to rally toward the call wall.', 'en').length >= 1);
    assert.ok(forecastHits('Spot will likely rise next week.', 'en').length >= 1);
});
t('제3자 전망을 인용한 문장은 우리 예측이 아니다 (Barron\'s «…빛날 것으로 예상»)', () => {
    assert.deepEqual(forecastHits('Barron\'s 기사는 "2027년 NVIDIA가 빛날 것으로 예상"이라 평가하고 있다.', 'ko'), []);
    assert.deepEqual(forecastHits('According to the report, the sector will rally.', 'en'), []);
});
t('실측 84건 중 예측어 문장만 빠지고 나머지는 그대로 — 줄 구조·레이블 유지', () => {
    const text = '[현황] 5일 자금은 AI 전력망으로 모였다.\n[해석] 반도체는 가격 -0.1% 인데 IFS +29 로 스텔스 매집 패턴이다.\n[전망] 금리 추이가 핵심 변수가 될 것이다.';
    const r = stripForecastSentences(text, 'ko');
    assert.equal(r.removed.length, 1);
    assert.ok(r.text.includes('[현황]') && r.text.includes('[해석]'));
    assert.ok(!r.text.includes('될 것이다'));
    assert.equal(r.usable, false);   // [전망] 줄이 통째로 비었다 → 호출자는 «재생성 필요» 로 다룬다
});
t('한 필드(한 단락)에서 문장 하나만 빠지면 usable', () => {
    const r = stripForecastSentences('OPI 는 중립이다. 현물은 감마 플립 아래에 있다. 상승 흐름이 이어질 것으로 전망된다. 풋 헤징은 줄었다.', 'ko');
    assert.equal(r.removed.length, 1);
    assert.equal(r.usable, true);
    assert.ok(r.text.includes('풋 헤징은 줄었다.'));
});

// ── 문턱·비교 문장 ──────────────────────────────────────────────────────────────
t('보고서 §5.2 ④ — «RLSI 42 sits below the 40 threshold» 는 틀렸다 (실제 42)', () => {
    const bad = checkComparisons('The reading of RLSI 42 sits below the 40 threshold, signaling fragility.', { RLSI: 42 });
    assert.equal(bad.length, 1, bad.join('|'));
    assert.match(bad[0], /compare:RLSI:<40≠42/);
});
t('맞는 비교는 통과 — RLSI 38 은 40 아래, VIX 15.3 은 20 아래', () => {
    assert.deepEqual(checkComparisons('RLSI 38 sits below the 40 threshold.', { RLSI: 38 }), []);
    assert.deepEqual(checkComparisons('VIX at 15.3 remains under 20.', { VIX: 15.3 }), []);
});
t('ko·ja 비교 — «RLSI 42는 40 미만»·«RLSIは40を下回っている»', () => {
    assert.equal(checkComparisons('RLSI 42는 40 미만으로 취약 구간이다.', { RLSI: 42 }).length, 1);
    assert.equal(checkComparisons('RLSIは40を下回っている。', { RLSI: 42 }).length, 1);
    assert.deepEqual(checkComparisons('RLSI 38은 40 미만이다.', { RLSI: 38 }), []);
    assert.deepEqual(checkComparisons('RLSIは45を下回っている。', { RLSI: 38 }), []);
});
t('조건문·가정은 판정하지 않는다 — «if VIX rises above 20»·«20 을 넘으면»·«なら»', () => {
    assert.deepEqual(checkComparisons('If VIX rises above 20, hedging demand typically rises.', { VIX: 15.3 }), []);
    assert.deepEqual(checkComparisons('VIX 가 20 이상으로 올라서면 헤지 수요가 늘어난다.', { VIX: 15.3 }), []);
    assert.deepEqual(checkComparisons('VIXが20以上になったら警戒が必要だ。', { VIX: 15.3 }), []);
});
t('값을 모르는 지표·말이 안 되는 문턱은 판정하지 않는다', () => {
    assert.deepEqual(checkComparisons('RLSI 42 sits below the 40 threshold.', {}), []);
    assert.deepEqual(checkComparisons('VIX is above 2000 shares', { VIX: 15 }), []);
});
t('comparisonClaims — 레이블 제외·문장 단위', () => {
    const c = comparisonClaims('[Status] RLSI stays above 45. Squeeze risk is under 55%.');
    assert.equal(c.length, 2);
    assert.deepEqual(c.map((x) => [x.key, x.op, x.threshold]), [['RLSI', 'gt', 45], ['SQUEEZE', 'lt', 55]]);
});

t('범위 주장 — 운영 생성 실측: «PC 비율 0.62도 중립 범위(0.75~1.3)에 있다»(0.62 는 범위 밖)', () => {
    const bad = checkRanges('PC 비율 0.62도 중립 범위(0.75~1.3)에 있다. 이는 고래의 포지셔닝이 광범위한 흐름으로 뒷받침되지 않음을 의미한다.', { PC: 0.62 });
    assert.equal(bad.length, 1, bad.join('|'));
    assert.match(bad[0], /range:PC:0\.75~1\.3≠0\.62/);
    assert.equal(checkRanges('The ratio within the neutral band (0.75–1.3) suggests balanced volume; P/C sits at 0.62.', { PC: 0.62 }).length, 0, '범위 문장에 P/C 이름이 앞서지 않으면 판정하지 않는다');
    assert.equal(checkRanges('P/C 0.9 is inside the neutral range 0.75-1.3.', { PC: 0.9 }).length, 0);
    assert.equal(checkRanges('P/C 0.62 is outside the neutral range 0.75-1.3.', { PC: 0.62 }).length, 0, '«outside» 는 범위 밖 주장이라 맞다');
});

// ── 낡음 ────────────────────────────────────────────────────────────────────
t('보고서 §5.2 ② — 글 가격 $238.9 → 현재 $241.75 (+1.2%)는 mild: 표기', () => {
    const v = flowStaleness({ price: 238.9, callWall: 245, putFloor: 230, gammaFlip: 240 }, { price: 241.75 });
    assert.equal(v.level, 'stale');                       // 감마 플립 $240 을 넘었다
    assert.ok(v.reasons.includes('crossed:gammaFlip'));
});
t('수준을 넘지 않은 1.2% 이동은 mild, 0.3% 는 fresh, 2.5% 는 stale', () => {
    assert.equal(flowStaleness({ price: 100, callWall: 110, putFloor: 90 }, { price: 101.2 }).level, 'mild');
    assert.equal(flowStaleness({ price: 100, callWall: 110, putFloor: 90 }, { price: 100.3 }).level, 'fresh');
    assert.equal(flowStaleness({ price: 100, callWall: 110, putFloor: 90 }, { price: 102.5 }).level, 'stale');
});
t('세션 라벨만 바뀌면(REG → POST, 가격 그대로) 기록만 하고 fresh — 로드 중 라벨 흔들림으로 이중 생성하지 않는다(10/7 프리뷰 실측)', () => {
    const v = flowStaleness({ price: 100, session: 'REG' }, { price: 100, session: 'POST' });
    assert.equal(v.level, 'fresh');
    assert.ok(v.reasons.some((r) => r.startsWith('session:')));
    assert.equal(flowStaleness({ price: 100, session: 'REG' }, { price: 102.5, session: 'POST' }).level, 'stale');   // 세션이 실제로 바뀌면 가격이 따라 움직인다
});
t('지금 가격을 모르면 판정하지 않는다', () => {
    assert.equal(flowStaleness({ price: 100 }, { price: 0 }).level, 'fresh');
});
t('낡은 글에서 방향·위치 서술 문장을 뺀다 — 남은 글이 있으면 usable', () => {
    const r = dropDirectionSentences('OPI 는 중립이다. 현물이 콜 월 아래에 있다. 풋 헤징 수요는 줄었다.', 'ko');
    assert.equal(r.removed.length, 1);
    assert.equal(r.usable, true);
    assert.ok(hasDirectionWords('Spot sits below the call wall.', 'en'));
});
t('«생성 HH:MM ET 기준» 표기 — 뉴욕 시각', () => {
    assert.equal(asOfLabel('ko', '2026-10-07T15:05:00Z'), '(생성 11:05 ET 기준)');
    assert.equal(asOfLabel('en', '2026-10-07T15:05:00Z'), '(as of 11:05 ET)');
    assert.equal(asOfLabel('ja', '2026-10-07T15:05:00Z'), '(11:05 ET 生成時点)');
});

console.log(`\n${n} passed`);
