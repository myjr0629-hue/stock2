/** 관문 10231945: 숫자·세션·첫 배포 복구·정체 피드·실모델 r2 실패 재현(네트워크 0). */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { buildMarketIndexBasis } from '@/lib/marketIndexBasis';
import { buildIndexFacts, INDEX_NAMES } from '@/lib/ai/tacticalIndexFacts';
import { buildTacticalPrompt, checkTacticalOutput, checkTacticalStored, tacticalIndexReasons } from '@/lib/ai/tacticalPrompt';

const store = new Map<string, any>();
const archives = new Map<string, any>();
const writes: string[] = [];
const reads: string[] = [];
let clock = Date.parse('2026-10-23T13:29:00Z');
let calls = 0;
let response: ((opts: any) => string) | null = null;
function mock(id: string, exports: unknown) {
    const filename = require.resolve(id);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
}
mock('@upstash/redis', { Redis: class {
    async get(key: string) { reads.push(key); return store.get(key) ?? null; }
    async set(key: string, value: string) { writes.push(key); store.set(key, JSON.parse(value)); }
} });
mock('../src/lib/sessionArchive', {
    readSessionArchive: async (_kind: string, scope: string) => { reads.push(scope); return archives.get(scope) ?? null; },
    saveSessionArchive: async () => false,
});
const { IntelligenceNode: N, _resetInsightStateForTest, _setMarketClockForTest, _setModelCallerForTest } = require('../src/services/guardian/intelligenceNode') as typeof import('../src/services/guardian/intelligenceNode');
const actualNow = Date.now;
const locales = ['ko', 'en', 'ja'] as const;
type Locale = typeof locales[number];
const text = {
    ko: '나스닥 현물 관측은 미확인입니다. 오늘 시장 전체를 움직인 재료는 미확인입니다. 시장 건강도(RLSI)는 약하고 옵션 포지션(GEX)은 미확인입니다. 다음 분기점은 미확인입니다.',
    en: 'Nasdaq spot observations are unavailable. The market driver is unconfirmed. Market health (RLSI) is weak and options positioning (GEX) is unconfirmed. The next test is unconfirmed.',
    ja: 'ナスダック現物の観測は未確認です。相場全体の材料は未確認です。市場の健全度(RLSI)は弱くオプション(GEX)は未確認です。次の分岐点は未確認です。',
};
const ctx = (locale: Locale) => ({ locale, rlsiScore: 31, nasdaqChange: -0.784, vix: 19.6, vectors: [], scheduledEvents: [] });
const key = (v: string, l: Locale) => `guardian:gemini:${v}:reality:${l}`;
function reset(iso = '2026-10-23T13:29:00Z') {
    _resetInsightStateForTest(); store.clear(); archives.clear(); writes.length = reads.length = 0;
    clock = Date.parse(iso); calls = 0; response = null;
}
const prompts = (l: Locale) => buildTacticalPrompt({ ...ctx(l), asOf: new Date(clock).toISOString() }, l);
async function main() {
    process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'offline-placeholder';
    process.env.AWS_ACCESS_KEY_ID = 'offline-placeholder';
    Date.now = () => clock;
    _setMarketClockForTest(() => new Date(clock));
    _setModelCallerForTest(async opts => {
        calls++;
        if (!response) throw new Error('offline failure');
        return { text: response(opts), model: 'mock', usedFallback: false, elapsedMs: 0 } as any;
    });
    // 표시 자릿수 반올림: 정상 저장본도 실제 출구에서 탈락하지 않는다.
    const fact = { id: 'nasdaq' as const, kind: 'spot' as const, name: INDEX_NAMES.nasdaq, basis: { ko: '전일 종가 대비', en: 'vs prior close', ja: '前日終値比' }, asOfET: '2026-10-23 09:31 ET', sessionDate: '2026-10-23', chgPct: -0.784 };
    const numericPrompt = (change = -0.784) => buildTacticalPrompt({ ...ctx('ko'), session: 'REG', asOf: '2026-10-23T13:31:00Z', indexFacts: [{ ...fact, chgPct: change }] }, 'ko');
    for (const number of ['0.78', '0.8']) {
        const first = `지금 정규장 나스닥 종합은 전일 종가 대비 ${number}% 하락 중입니다.`;
        assert.deepEqual(tacticalIndexReasons(first, numericPrompt()), []);
        const out = await N.repairVerdictTexts({ realityInsight: text.ko.replace('나스닥 현물 관측은 미확인입니다.', first) }, 'ko', 'gate', null, () => numericPrompt());
        assert.deepEqual(out.repaired, []);
        assert.ok(!N.isPlaceholderInsight(out.verdict.realityInsight));
    }
    assert.ok(tacticalIndexReasons('나스닥 종합은 0.7% 하락 중입니다.', numericPrompt()).includes('tactical:index-value'));
    for (const change of [-0.101, -0.1, 0, 0.1, 0.101]) assert.deepEqual(tacticalIndexReasons('나스닥 종합은 보합입니다.', numericPrompt(change)), []);
    for (const change of [-0.16, 0.16]) assert.ok(tacticalIndexReasons('나스닥 종합은 보합입니다.', numericPrompt(change)).includes('tactical:index-direction'));
    // REG 오인은 생성 검사에서 거부하며 저장본은 보존한다.
    for (const word of ['장후', '개장 전', 'after-hours', 'premarket', '時間外', '取引開始前']) {
        const first = `나스닥 종합은 0.8% 하락 중이며 ${word}입니다.`;
        assert.ok(tacticalIndexReasons(first, numericPrompt()).includes('tactical:session-mismatch'), word);
        assert.deepEqual(checkTacticalStored(first + text.ko, numericPrompt()), [], word);
    }
    // 관문 10232033: 정상 방향 동사·미등록 방향 표현도 실제 verdict 출구에서 보존한다.
    const directionCases: Array<[Locale, string]> = [
        ...['has lost', 'lost', 'slipped', 'slid', 'tumbled', 'retreated'].map(word => ['en', `Nasdaq Composite ${word} 2.6%.`] as [Locale, string]),
        ...['gained', 'jumped', 'climbed', 'advanced'].map(word => ['en', `Nasdaq Composite ${word} 2.6%.`] as [Locale, string]),
        ['ko', '나스닥 종합은 2.6% 밀려 마쳤습니다.'],
        ['ko', '나스닥 종합은 2.6% 빠졌습니다.'],
        ['ko', '나스닥 종합은 2.6% 떨어졌습니다.'],
        ['ko', '나스닥 종합은 2.6% 올라섰습니다.'],
        ...['値下がり', '下げた', '値上がり', '上げた'].map(word => ['ja', `ナスダック総合は2.6%${word}結果です。`] as [Locale, string]),
    ];
    for (const [locale, first] of directionCases) {
        reset('2026-10-23T13:31:00Z');
        const positive = /gained|jumped|climbed|advanced|올라섰|値上がり|上げた/.test(first);
        const c = { ...ctx(locale), session: 'REG' as const, asOf: new Date(clock).toISOString(), indexFacts: [{ ...fact, chgPct: positive ? 2.6 : -2.6 }] };
        const p = (l: Locale) => buildTacticalPrompt(c, l);
        assert.deepEqual(tacticalIndexReasons(first, p(locale)), [], first);
        const full = first + ' ' + text[locale].slice(text[locale].indexOf(locale === 'ja' ? '。' : '.') + 1).trim();
        assert.deepEqual(checkTacticalOutput(full, locale, p(locale)), [], first);
        const out = await N.repairVerdictTexts({ realityInsight: full }, locale, 'direction', null, p);
        assert.deepEqual(out.repaired, [], first);
        assert.equal(out.verdict.realityInsight, full, '정상 문장을 준비 중으로 바꾸지 않음');
        const opposite = buildTacticalPrompt({ ...c, indexFacts: [{ ...fact, chgPct: positive ? -2.6 : 2.6 }] }, locale);
        assert.ok(tacticalIndexReasons(first, opposite).includes('tactical:index-direction'), `반대 방향 거절: ${first}`);
    }
    for (const [locale, first] of [
        ['en', 'Nasdaq Composite registered 2.6%.'], ['en', 'Nasdaq Composite registered -2.6%.'],
        ['ko', '나스닥 종합은 2.6%를 기록했습니다.'], ['ja', 'ナスダック総合は2.6%を記録しました。'],
    ] as const) {
        const p = (l: Locale) => buildTacticalPrompt({ ...ctx(locale), session: 'REG', asOf: '2026-10-23T13:31:00Z', indexFacts: [{ ...fact, chgPct: -2.6 }] }, l);
        assert.deepEqual(tacticalIndexReasons(first, p(locale)), [], '방향어 미등록·생략은 탈락 아님');
        const out = await N.repairVerdictTexts({ realityInsight: first + ' ' + text[locale] }, locale, 'unknown-direction', null, p);
        assert.deepEqual(out.repaired, []);
        assert.ok(!N.isPlaceholderInsight(out.verdict.realityInsight));
        assert.ok(tacticalIndexReasons(first.replace('2.6', '2.5'), p(locale)).includes('tactical:index-value'));
    }
    assert.ok(tacticalIndexReasons('Nasdaq Composite registered +2.6%.', buildTacticalPrompt({ ...ctx('en'), session: 'REG', indexFacts: [{ ...fact, chgPct: -2.6 }] }, 'en')).includes('tactical:index-direction'));
    // POST/CLOSED: 16:00 ET 마감 사실과 날짜 숫자·시제를 대조한다. 상대 날짜 낱말은 독자의 현지 날짜를 허용한다.
    for (const session of ['POST', 'CLOSED'] as const) for (const locale of locales) {
        reset(session === 'POST' ? '2026-10-23T20:00:00Z' : '2026-10-24T01:00:00Z');
        const p = (date: string, l = locale) => buildTacticalPrompt({ ...ctx(l), session, asOf: new Date(clock).toISOString(), indexFacts: [{ ...fact, chgPct: -2.6, sessionDate: date }] }, l);
        const first = locale === 'ko' ? '오늘(10/23) 정규장에서 나스닥 종합은 전일 종가 대비 2.6% 내렸습니다.'
            : locale === 'en' ? 'In today’s (10/23) cash session Nasdaq Composite lost 2.6%.'
                : '本日(10/23)の通常取引でナスダック総合は2.6%値下がりしました。';
        const full = first + ' ' + text[locale].slice(text[locale].indexOf(locale === 'ja' ? '。' : '.') + 1).trim();
        assert.deepEqual(checkTacticalOutput(full, locale, p('2026-10-23')), []);
        assert.deepEqual(checkTacticalStored(full, p('2026-10-23')), []);
        const actual = await N.repairVerdictTexts({ realityInsight: full }, locale, 'post-close', null, l => p('2026-10-23', l));
        assert.deepEqual(actual.repaired, []);
        const ongoing = locale === 'ko' ? '오늘(10/23) 지금 정규장 나스닥 종합은 2.6% 하락 중입니다.'
            : locale === 'en' ? 'Today (10/23) Nasdaq Composite is down 2.6%.'
                : '本日(10/23)ナスダック総合は2.6%下落中です。';
        for (const [bad, reason] of [
            [ongoing, 'tactical:session-mismatch'], [first.replace('10/23', '10/22'), 'tactical:cash-session-date'],
            [first.replace('(10/23)', ''), 'tactical:cash-session-date'],
        ]) {
            assert.ok(checkTacticalOutput(bad + ' ' + text[locale], locale, p('2026-10-23')).includes(reason), bad);
            assert.deepEqual(checkTacticalStored(bad + ' ' + text[locale], p('2026-10-23')), [], '복구는 세션/날짜 대조 없음');
        }
        clock = Date.parse('2026-10-24T05:00:00Z'); // 10/24 01:00 ET, 전날 마감
        const yesterday = first.replace(/오늘|today’s|本日/, { ko: '어제', en: 'yesterday’s', ja: '昨日' }[locale]);
        assert.deepEqual(tacticalIndexReasons(yesterday, p('2026-10-23')), []);
        assert.deepEqual(tacticalIndexReasons(first, p('2026-10-23')), [], '상대 날짜 낱말과 무관하게 M/D 숫자가 맞으면 통과');
    }
    reset('2026-10-23T20:00:00Z');
    const withFutures = buildTacticalPrompt({ ...ctx('ko'), session: 'POST', asOf: new Date(clock).toISOString(), indexFacts: [
        { ...fact, chgPct: -2.6 }, { ...fact, id: 'nq', kind: 'futures', name: INDEX_NAMES.nq, chgPct: 0.3 },
    ] }, 'ko');
    assert.deepEqual(tacticalIndexReasons('오늘(10/23) 정규장에서 나스닥 종합은 2.6% 내렸고, 지금 장후 나스닥100 선물은 0.3% 상승 중입니다.', withFutures), [], '장후 선물 진행형은 허용');
    // 첫 배포 v3 비어 있음. v2/REALITY 복구는 생성 실패·장외 모두 안내 문구 아님, 승격 쓰기 없음.
    for (const locale of locales) for (const source of ['v2', 'archive']) for (const offHours of [false, true]) {
        reset(offHours ? '2026-10-24T01:00:00Z' : undefined);
        // 새 INDEX 계약으로는 거부할, 옛 정상 문장. 옛 선물 자리표도 복구한다.
        const old = locale === 'ko' ? text.ko.replace('나스닥 현물 관측은 미확인입니다.', '나스닥 {NDX_CHG}, S&P500 {SPX_CHG}로 혼조입니다.')
            : locale === 'en' ? text.en.replace('Nasdaq spot observations are unavailable.', 'Nasdaq {NDX_CHG} and S&P500 {SPX_CHG} show a mixed market.')
                : text.ja.replace('ナスダック現物の観測は未確認です。', 'ナスダック{NDX_CHG}、S&P500{SPX_CHG}のまちまちな相場です。');
        const saved = { text: old, updatedAt: '2026-10-23T13:29:00Z', basis: { NDX_CHG: -0.06, SPX_CHG: 0.15, RLSI: 31, VIX: 19.6 } };
        const recoveryCtx = { ...ctx(locale), nasdaqChange: -2.6, spxChangePct: -1.2, indexFacts: [{ ...fact, chgPct: -2.6 }] };
        const recoveryPrompts = (l: Locale) => buildTacticalPrompt({ ...recoveryCtx, asOf: new Date(clock).toISOString() }, l);
        const currentNums = { NDX_CHG: -2.6, SPX_CHG: -1.2, RLSI: 31, VIX: 19.6 };
        if (source === 'v2') store.set(key('v2', locale), saved);
        else archives.set(`reality_${locale}`, { value: saved, stamp: { observedAt: Date.parse(saved.updatedAt) } });
        const out = await N.generateRealityInsight(recoveryCtx);
        assert.ok(out.includes('-0.06%') && out.includes('+0.15%'), 'v2 저장 선물 basis 유지');
        assert.ok(!out.includes('2.60%') && !out.includes('1.20%'), '현물 값으로 덮지 않음');
        assert.ok(!N.isPlaceholderInsight(out), `${locale}/${source}/${offHours}: 안내 문구 아님`);
        assert.ok(!out.includes('{NDX_CHG}'));
        assert.equal(writes.length, 0, '복구본으로 v3 키를 채우지 않음');
        assert.equal(store.has(key('v3', locale)), false);
        if (offHours) assert.equal(calls, 0, '장외 모델 호출 0');
        else assert.ok(calls > 0, '생성 시도 후에만 v2 복구');
        // 실제 verdict 출구 재검사에서도 복구 글을 살린다.
        const repaired = await N.repairVerdictTexts({ realityInsight: 'NEWS PULSE 보고입니다.' }, locale, 'first-deploy', currentNums, recoveryPrompts);
        assert.ok(!N.isPlaceholderInsight(repaired.verdict.realityInsight));
        assert.equal(repaired.verdict.realityInsight, out, '실제 출구도 같은 저장 숫자로 복구');
        assert.equal(writes.length, 0);
    }
    // 낡음은 재생성을 유도하되 실패 시 저장 당시의 숫자와 글을 보존한다. 값 없는 자리표는 차단한다.
    for (const [offHours, metric, changedValue] of [[false, 'RLSI', 65], [true, 'VIX', 26]] as const) {
        reset(offHours ? '2026-10-24T01:00:00Z' : undefined);
        store.set(key('v2', 'ko'), { text: text.ko.replace('시장 건강도(RLSI)는', `변동성 지수(VIX) {VIX}, 시장 건강도(RLSI)는`), basis: { RLSI: 31, VIX: 19.6 } });
        const out = await N.recoverInsight('reality', 'ko', { translate: false, nums: { RLSI: 31, VIX: 19.6, [metric]: changedValue }, tacticalPrompts: prompts });
        assert.ok(!N.isPlaceholderInsight(out), `${metric}: 복구본 유지`);
        assert.ok(out.includes('19.6'), '저장 당시 VIX 유지');
    }
    reset('2026-10-24T01:00:00Z');
    store.set(key('v2', 'ko'), { text: text.ko.replace('나스닥 현물 관측은 미확인입니다.', '나스닥 {NDX_CHG}로 약세입니다.'), basis: { RLSI: 31, VIX: 19.6 } });
    const partial = await N.recoverInsight('reality', 'ko', { translate: false, nums: { NDX_CHG: -0.4, RLSI: 31, VIX: 19.6 }, tacticalPrompts: prompts });
    assert.ok(!N.isPlaceholderInsight(partial) && partial.includes('-0.40%'), 'basis에 빠진 자리표는 복원된 공유 선물 값으로 채움');
    for (const bad of ['NEWS PULSE', 'Polygon', 'FMP', 'INDEX_FACTS']) {
        reset('2026-10-24T01:00:00Z');
        store.set(key('v2', 'ko'), { text: text.ko.replace('오늘 시장', `${bad} 오늘 시장`) });
        assert.ok(N.isPlaceholderInsight(await N.generateRealityInsight(ctx('ko'))), `${bad} 내부 출처/형식 거부`);
    }
    reset('2026-10-24T01:00:00Z');
    store.set(key('v2', 'ko'), { text: text.ko.replace('나스닥 현물 관측은 미확인입니다.', '지수는 0.8% 하락 중입니다.') });
    archives.set('reality_ko', { value: { text: text.ko }, stamp: { observedAt: clock - 3600000 } });
    assert.ok(!N.isPlaceholderInsight(await N.generateRealityInsight(ctx('ko'))));
    // 복구 뒤 다음 장중 생성에서 새 정상본으로 교체한다.
    clock = Date.parse('2026-10-26T13:31:00Z');
    response = () => JSON.stringify(text);
    assert.equal(await N.generateRealityInsight(ctx('ko')), text.ko);
    assert.ok(writes.includes(key('v3', 'ko')));
    // ★밤 검토 10/24 ① — 세션 경계는 메모리·콜드 Redis 모두 «신선한 캐시»에서 뺀다(재생성 유도). 실패 때는 글을 남기고(빈칸·«준비 중» 금지) TTL·저장본은 갱신하지 않는다.
    for (const cold of [false, true]) for (const failure of [false, true]) {
        reset(); response = () => JSON.stringify(text);
        assert.equal(await N.generateRealityInsight(ctx('ko')), text.ko);
        const before = calls;
        const saved = JSON.stringify(store.get(key('v3', 'ko')));
        assert.equal(store.get(key('v3', 'ko')).session, 'PRE');
        if (cold) _resetInsightStateForTest();
        clock = Date.parse('2026-10-23T13:31:00Z');
        const reg = { ...text, ko: text.ko.replace('나스닥 현물', '정규장 나스닥 현물') };
        response = failure ? null : () => JSON.stringify(reg);
        const out = await N.generateRealityInsight(ctx('ko'));
        assert.ok(calls > before, `09:29 PRE → 09:31 REG, 숫자가 같아도 재생성(cold=${cold})`);
        assert.equal(out, failure ? text.ko : reg.ko);
        assert.ok(!N.isPlaceholderInsight(out), '세션 다른 글도 생성 실패 시 안내 문구보다 먼저');
        if (failure) assert.equal(JSON.stringify(store.get(key('v3', 'ko'))), saved);
        else assert.equal(store.get(key('v3', 'ko')).session, 'REG');
        if (failure) {
            // 쿨다운 동안은 다시 부르지 않고 같은 글(복구본)을 보여 준다
            const c2 = calls;
            clock += 30_000;
            assert.equal(await N.generateRealityInsight(ctx('ko')), text.ko);
            assert.equal(calls, c2, '실패 쿨다운 안에는 모델 재호출 0');
        }
    }
    // PRE 에서 실패해 쿨다운이 걸려도 개장(REG)하면 쿨다운을 넘어 새 세션 글을 만든다
    reset(); response = null;
    const pending = await N.generateRealityInsight(ctx('ko'));
    assert.ok(N.isPlaceholderInsight(pending));
    clock = Date.parse('2026-10-23T13:30:30Z');
    response = () => JSON.stringify(text);
    const callsAtOpen = calls;
    assert.equal(await N.generateRealityInsight(ctx('ko')), text.ko);
    assert.ok(calls > callsAtOpen, 'PRE 쿨다운이 REG 생성을 막지 않는다');
    reset();
    // 생성 도중 개장하더라도 PRE 프롬프트로 만든 글을 REG 정상 캐시로 승격하지 않는다.
    response = () => { clock = Date.parse('2026-10-23T13:31:00Z'); return JSON.stringify(text); };
    await N.generateRealityInsight(ctx('ko'));
    assert.equal(store.get(key('v3', 'ko')).session, 'PRE', '저장 시각과 생성 세션을 분리');
    const crossingCalls = calls;
    response = () => JSON.stringify(text);
    await N.generateRealityInsight(ctx('ko'));
    assert.ok(calls > crossingCalls);
    assert.equal(store.get(key('v3', 'ko')).session, 'REG');
    // 신선한 marketTime + 2시간 전 마지막 변화도 선물 사실로 승격하지 않는다.
    reset();
    const q = (symbol: string, marketTime: string, lastChangeAt = marketTime) => ({ symbol, price: 100, changePct: 0.05, source: 'YAHOO', marketTime, lastChangeAt });
    const basis = buildMarketIndexBasis({ nq: q('NQ=F', new Date(clock - 60000).toISOString(), new Date(clock - 2 * 3600000).toISOString()) }, clock);
    assert.equal(basis.futures.nq.live, false);
    assert.deepEqual(buildIndexFacts(basis, 'PRE', clock), []);
    basis.futures.nq.live = true;
    assert.equal(buildIndexFacts(basis, 'PRE', clock)[0].asOfET, '2026-10-23 09:28 ET');
    assert.deepEqual(buildIndexFacts(basis, 'PRE', clock + 20 * 60000), [], '캐시 live:true여도 원관측 20분 경과 거절');
    // 5문장의 SO WHAT 두 문장을 함께 해석한다. NEXT 검사는 마지막에 그대로 적용한다.
    for (const locale of locales) {
        const p = prompts(locale);
        const five = locale === 'ko' ? text.ko.replace('약하고 옵션', '약합니다. 옵션')
            : locale === 'en' ? text.en.replace('weak and options', 'weak. Options')
                : text.ja.replace('弱くオプション', '弱いです。オプション');
        assert.deepEqual(checkTacticalOutput(five, locale, p), [], `${locale} 5문장`);
        const noPosition = locale === 'ko' ? text.ko.replace('옵션 포지션(GEX)은 미확인입니다.', '반등의 힘도 약합니다.')
            : locale === 'en' ? text.en.replace('options positioning (GEX) is unconfirmed', 'rebound support is fragile')
                : text.ja.replace('オプション(GEX)は未確認', '反発の支えも弱い');
        assert.ok(checkTacticalOutput(noPosition, locale, p).includes('tactical:positioning-required'));
        const missing = locale === 'ko' ? text.ko.replace('옵션 포지션(GEX)은 미확인', '옵션 포지션 자료 없음')
            : locale === 'en' ? text.en.replace('options positioning (GEX) is unconfirmed', 'options positioning data unavailable')
                : text.ja.replace('オプション(GEX)は未確認', 'オプション・ポジション資料なし');
        assert.deepEqual(checkTacticalOutput(missing, locale, p), []);
        assert.ok(checkTacticalOutput(five + (locale === 'ja' ? '材料は未確認です。' : locale === 'ko' ? ' 재료는 미확인입니다.' : ' Data are unavailable.'), locale, p).includes('tactical:four-sentences'));
    }
    const rollcall = text.en.replace('Market health (RLSI) is weak and options positioning (GEX) is unconfirmed.', 'Market health (RLSI) is 31 and volatility (VIX) is 19.6. Options positioning (GEX) is 13 and breadth is 34.');
    assert.ok(checkTacticalOutput(rollcall, 'en', prompts('en')).includes('tactical:number-rollcall'), '5문장 넷째의 숫자도 합산');
    console.log('통과 관문 10232033: v2 선물 basis·3언어 방향 동사/미등록 방향·POST/CLOSED 날짜/시제·실제 repairVerdictTexts 출구');
    console.log('통과 관문 1~9: 반올림/현물보합·v2/REALITY 첫배포 안내문구 아님·세션경계·정체선물·5문장·옵션포지션');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
    Date.now = actualNow; _setMarketClockForTest(null); _setModelCallerForTest(null); _resetInsightStateForTest();
});
