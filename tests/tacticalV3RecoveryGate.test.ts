/** 관문 10232108: 실제 복구/판정 출구 + 방향 오탈락·오통과, 외부 통신 0. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { buildTacticalPrompt, checkTacticalOutput, checkTacticalStored, tacticalIndexReasons } from '@/lib/ai/tacticalPrompt';
import { INDEX_NAMES, type IndexFact } from '@/lib/ai/tacticalIndexFacts';

type Locale = 'ko' | 'en' | 'ja';
const locales: Locale[] = ['ko', 'en', 'ja'];
const store = new Map<string, any>();
const archives = new Map<string, any>();
let writes = 0, calls = 0;
let clock = Date.parse('2026-10-23T20:01:00Z');
const mock = (id: string, exports: unknown) => {
    const filename = require.resolve(id);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
};
mock('@upstash/redis', { Redis: class {
    async get(key: string) { return store.get(key) ?? null; }
    async set() { writes++; }
} });
mock('../src/lib/sessionArchive', {
    readSessionArchive: async (_kind: string, scope: string) => archives.get(scope) ?? null,
    saveSessionArchive: async () => { writes++; return false; },
});
const { IntelligenceNode: N, _resetInsightStateForTest, _setMarketClockForTest, _setModelCallerForTest } = require('../src/services/guardian/intelligenceNode') as typeof import('../src/services/guardian/intelligenceNode');
const realNow = Date.now;
const fact: IndexFact = { id: 'nasdaq', kind: 'spot', name: INDEX_NAMES.nasdaq,
    basis: { ko: '전일 종가 대비', en: 'vs prior close', ja: '前日終値比' },
    asOfET: '2026-10-23 16:00 ET', sessionDate: '2026-10-23', chgPct: -2.6 };
const tail: Record<Locale, string> = {
    ko: '오늘 시장 전체를 움직인 재료는 미확인입니다. 시장 건강도(RLSI)는 약하고 옵션 포지션(GEX)은 중립입니다. 다음 분기점은 미확인입니다.',
    en: 'The market driver is unconfirmed. Market health (RLSI) is weak and options positioning (GEX) is neutral. The next test is unconfirmed.',
    ja: '相場全体の材料は未確認です。市場の健全度(RLSI)は弱くオプション(GEX)は中立です。次の分岐点は未確認です。',
};
const first: Record<Locale, string> = {
    ko: '지금 정규장 나스닥 종합은 전일 종가 대비 2.6% 하락 중입니다.',
    en: 'In regular trading now Nasdaq Composite is down 2.6% versus the prior close.',
    ja: '現在の通常取引中、ナスダック総合は前日終値比2.6%下落中です。',
};
const ctx = (locale: Locale, session: 'REG' | 'POST' | 'CLOSED' = 'POST') => ({ locale, session,
    asOf: new Date(clock).toISOString(), rlsiScore: 31, nasdaqChange: -2.6, vix: 19.6,
    gexIndex: 13, vectors: [], scheduledEvents: [], indexFacts: [fact] });
const prompt = (locale: Locale) => buildTacticalPrompt(ctx(locale), locale);
function reset() { _resetInsightStateForTest(); store.clear(); archives.clear(); writes = calls = 0; }

async function main() {
    process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'offline-placeholder';
    process.env.AWS_ACCESS_KEY_ID = 'offline-placeholder';
    Date.now = () => clock;
    _setMarketClockForTest(() => new Date(clock));
    _setModelCallerForTest(async () => { calls++; throw new Error('offline model failure'); });
    // 날짜 없는 REG 정상본 → POST/CLOSED: 새 생성 검사는 거부, 저장본 검사는 원문 보존.
    for (const locale of locales) for (const source of ['redis', 'archive', 'verdict', 'previous'] as const) for (const offHours of [false, true]) {
        reset(); clock = Date.parse(offHours ? '2026-10-24T01:00:00Z' : '2026-10-23T20:01:00Z');
        const full = `${first[locale]} ${tail[locale]}`;
        const regPrompt = buildTacticalPrompt(ctx(locale, 'REG'), locale);
        assert.deepEqual(checkTacticalOutput(full, locale, regPrompt), []);
        assert.ok(checkTacticalOutput(full, locale, prompt(locale)).includes('tactical:cash-session-date'));
        assert.deepEqual(checkTacticalStored(full, prompt(locale)), []);
        // v3 생성 계약 전체를 복구에 적용하지 않는다(지수명/숫자/양쪽 언급 요구 없음).
        assert.deepEqual(checkTacticalStored(tail[locale], prompt(locale)), []);
        const saved = { text: full, basis: { RLSI: 31, VIX: 19.6, GEX: 13 }, session: 'REG', updatedAt: '2026-10-23T19:59:00Z' };
        if (source === 'redis') store.set(`guardian:gemini:v3:reality:${locale}`, saved);
        if (source === 'archive') archives.set(`reality_v3_${locale}`, { value: saved, stamp: { observedAt: Date.parse(saved.updatedAt) } });
        let shown: string | undefined;
        if (source === 'verdict') shown = (await N.repairVerdictTexts({ realityInsight: full }, locale, 'REG-to-POST', null, prompt)).verdict.realityInsight;
        else if (source === 'previous') shown = N.keepRealTextOverPlaceholders({ realityInsight: '[Diagnosis] Preparing the latest market analysis\n[Conclusion] It will refresh automatically in a moment' }, { realityInsight: full }, locale, null, prompt).realityInsight;
        else shown = await N.generateRealityInsight(ctx(locale, offHours ? 'CLOSED' : 'POST'));
        assert.equal(shown, full, `${locale}/${source}/${offHours}: 정상본 그대로`);
        assert.equal(writes, 0, '복구로 새 캐시/보관본을 쓰지 않음');
        if (offHours || source === 'verdict' || source === 'previous') assert.equal(calls, 0);
    }
    // 개별 v2 캐시 만료 + 보관본 없음: ai_verdict/스냅샷의 자리표·basis만으로 복구.
    for (const locale of locales) for (const offHours of [false, true]) for (const token of [true, false]) {
        reset(); clock = Date.parse(offHours ? '2026-10-24T01:00:00Z' : '2026-10-23T20:01:00Z');
        const oldFirst = { ko: '나스닥 {NDX_CHG}, S&P500 {SPX_CHG}로 혼조입니다.', en: 'Nasdaq {NDX_CHG} and S&P500 {SPX_CHG} show a mixed market.', ja: 'ナスダック{NDX_CHG}、S&P500{SPX_CHG}のまちまちな相場です。' }[locale];
        const tpl = `${oldFirst} ${tail[locale]}`;
        const displayed = tpl.replace('{NDX_CHG}', '-0.06%').replace('{SPX_CHG}', '+0.15%');
        const basis = { NDX_CHG: -0.06, SPX_CHG: 0.15, RLSI: 31, VIX: 19.6, GEX: 13, ...(!token ? { contractVersion: 2 } : {}) };
        const verdict = { realityInsight: displayed, num: { tpl: { realityInsight: token ? tpl : displayed }, basis: { realityInsight: basis } } };
        const nums = { NDX_CHG: -2.6, SPX_CHG: -1.2, RLSI: 31, VIX: 19.6, GEX: 13 };
        const repaired = await N.repairVerdictTexts(verdict, locale, 'verdict-only-v2', nums, prompt);
        assert.deepEqual(repaired.repaired, []);
        assert.equal(repaired.verdict.realityInsight, displayed);
        assert.ok(!N.isPlaceholderInsight(repaired.verdict.realityInsight));
        assert.equal(store.size + archives.size + writes + calls, 0);
        // 같은 스냅샷이 다음 출구를 지나도 현물 값으로 바뀌거나 준비 중으로 되돌아가지 않음.
        const again = await N.repairVerdictTexts(repaired.verdict, locale, 'snapshot-v2', nums, prompt);
        assert.equal(again.verdict.realityInsight, displayed);
        const kept = N.keepRealTextOverPlaceholders({ realityInsight: '[Diagnosis] Preparing the latest market analysis\n[Conclusion] It will refresh automatically in a moment' }, verdict, locale, nums, prompt);
        assert.equal(kept.realityInsight, displayed);
    }
    // 실제 getGuardianSnapshot 출구에서도 v2 verdict-only를 보존(수집기·저장소 모의 구현).
    reset(); clock = Date.parse('2026-10-24T01:00:00Z');
    for (const id of [
        '../src/services/guardian/rlsiEngine', '../src/services/guardian/sectorEngine',
        '../src/services/macroHubProvider', '../src/services/guardian/rvolEngine',
        '../src/services/massiveClient', '../src/services/guardian/gammaShieldEngine',
        '../src/services/guardian/breadthEngine', '../src/services/indexBreadth',
        'next/server', '../src/lib/cache/staleLock', '../src/services/redisClient',
    ]) mock(id, {});
    const cashBasis = { cash: { nasdaq: { changePct: -2.6 }, spx: { changePct: -1.2 } } };
    mock('../src/services/marketIndexBasis', { loadMarketIndexBasis: async () => cashBasis });
    mock('../src/services/guardian/guardianCore', {
        getSharedCore: async () => ({ news: [], scheduledEvents: [] }), overlayCore: (c: unknown) => c,
        withCashIndexBasis: (c: any, indexBasis: any) => ({ ...c, market: { ...c.market, indexBasis } }),
    });
    const { GuardianDataHub } = require('../src/services/guardian/unifiedDataStream');
    const compute = GuardianDataHub.computeGuardianSnapshot;
    const v2Tpl = `Nasdaq {NDX_CHG} and S&P500 {SPX_CHG} show a mixed market. ${tail.en}`;
    GuardianDataHub.computeGuardianSnapshot = async () => ({
        rlsi: { score: 31 }, market: { nqChangePercent: -2.6, vix: 19.6 },
        verdict: { realityInsight: v2Tpl, num: { tpl: { realityInsight: v2Tpl }, basis: { realityInsight: { NDX_CHG: -0.06, SPX_CHG: 0.15, RLSI: 31, VIX: 19.6 } } } },
    });
    try {
        const snapshot = await GuardianDataHub.getGuardianSnapshot(false, 'en');
        assert.equal(snapshot.verdict.realityInsight, v2Tpl.replace('{NDX_CHG}', '-0.06%').replace('{SPX_CHG}', '+0.15%'));
        assert.equal(store.size + archives.size + writes + calls, 0);
    } finally { GuardianDataHub.computeGuardianSnapshot = compute; }
    reset(); clock = Date.parse('2026-10-23T13:31:00Z');
    const p = (locale: Locale, change = -2.6) => buildTacticalPrompt({ ...ctx(locale, 'REG'), indexFacts: [{ ...fact, chgPct: change }] }, locale);
    // 반대 동사는 거절. 숫자 뒤 다른 주어(with/while/yields)의 방향은 지수에 붙이지 않음.
    const up = ['surged', 'increased', 'jumped', 'climbed', 'rallied', 'gained', 'rose', 'advanced'];
    const down = ['plunged', 'fell', 'dropped', 'declined', 'slid', 'lost', 'slipped', 'tumbled', 'retreated'];
    for (const [words, sign] of [[up, 1], [down, -1]] as const) for (const word of words) {
        const sentence = `Nasdaq Composite ${word} 2.6%, with yields moving ${sign === -1 ? 'higher' : 'lower'}.`;
        const full = `${sentence} ${tail.en}`;
        assert.deepEqual(checkTacticalOutput(full, 'en', p('en', sign * 2.6)), [], sentence);
        assert.deepEqual(checkTacticalStored(full, p('en', sign * 2.6)), [], sentence);
        const shown = await N.repairVerdictTexts({ realityInsight: full }, 'en', 'direction-scope', null, l => p(l, sign * 2.6));
        assert.equal(shown.verdict.realityInsight, full);
        assert.ok(checkTacticalOutput(full, 'en', p('en', -sign * 2.6)).includes('tactical:index-direction'), sentence);
        assert.deepEqual(checkTacticalStored(full, p('en', -sign * 2.6)), [], '복구에는 현재 방향 대조 없음');
    }
    for (const [locale, sentence, sign] of [
        ['ko', '나스닥 종합은 2.6% 급등했고, 금리는 하락했습니다.', 1],
        ['ko', '나스닥 종합은 2.6% 빠졌고, 금리는 상승했습니다.', -1],
        ['ko', '나스닥 종합은 2.6% 증가했습니다.', 1],
        ['ko', '나스닥 종합은 2.6% 폭락했습니다.', -1],
        ['ja', 'ナスダック総合は2.6%急騰し、金利は下落しました。', 1],
        ['ja', 'ナスダック総合は2.6%値下がりし、金利は上昇しました。', -1],
        ['ja', 'ナスダック総合は2.6%暴騰しました。', 1],
        ['ja', 'ナスダック総合は2.6%反落しました。', -1],
        ['en', 'Nasdaq Composite registered 2.6%, with yields moving higher.', -1],
        ['en', 'Nasdaq Composite registered 2.6% while yields rose.', -1],
        ['en', 'Nasdaq Composite, with yields moving higher, fell 2.6%.', -1],
    ] as const) {
        assert.deepEqual(tacticalIndexReasons(sentence, p(locale, sign * 2.6)), [], sentence);
        if (locale !== 'en') assert.ok(tacticalIndexReasons(sentence, p(locale, -sign * 2.6)).includes('tactical:index-direction'));
    }
    // 다른 지수의 방향을 공유할 때도 주어가 바뀌는 절을 넘지 않는다.
    const twoIndices = p('en').replace(/^INDEX_FACTS: .*$/m, `INDEX_FACTS: ${JSON.stringify([fact, { ...fact, id: 'spx', chgPct: 1.2 }])}`);
    assert.deepEqual(tacticalIndexReasons('Nasdaq Composite registered 2.6%, with yields moving higher, and S&P500 rose 1.2%.', twoIndices), []);
    assert.deepEqual(tacticalIndexReasons('Nasdaq Composite registered 2.6% and S&P500 rose 1.2%.', twoIndices), [], '다음 지수의 앞 동사를 공유하지 않음');
    // REG 예외: 선물 숫자 생략은 근거 존재·방향 확인 후에만 허용.
    for (const locale of locales) for (const [word, value] of (locale === 'ko' ? [['상승', 0.3], ['보합', 0.03], ['하락', -0.3]] : locale === 'ja' ? [['上昇', 0.3], ['横ばい', 0.03], ['下落', -0.3]] : [['up', 0.3], ['flat', 0.03], ['down', -0.3]]) as Array<[string, number]>) {
        const cash = { ko: '나스닥 종합은 2.6% 하락 중이며', en: 'Nasdaq Composite is down 2.6%, while', ja: 'ナスダック総合は2.6%下落中で、' }[locale];
        const futures = { ko: `나스닥100 선물은 ${word}입니다.`, en: `Nasdaq 100 futures are ${word}.`, ja: `ナスダック100先物は${word}です。` }[locale];
        const full = `${cash} ${futures} ${tail[locale]}`;
        assert.ok(checkTacticalOutput(full, locale, p(locale)).includes('tactical:index-unavailable'));
        assert.deepEqual(checkTacticalStored(full, p(locale)), [], '저장본은 현재 선물 유무와 대조하지 않음');
        // r5 REG 입력은 현물만: 선물이 있는 출구 검사 자체는 최소 프롬프트로 독립 시험.
        const withFact = (change: number) => p(locale).replace(/^INDEX_FACTS: .*$/m, `INDEX_FACTS: ${JSON.stringify([fact, { ...fact, id: 'nq', kind: 'futures', chgPct: change }])}`);
        assert.deepEqual(tacticalIndexReasons(`${cash} ${futures}`, withFact(value)), []);
        assert.ok(tacticalIndexReasons(`${cash} ${futures}`, withFact(value === 0.03 ? 0.3 : -value)).includes('tactical:index-direction'));
    }
    // 복구는 현재 숫자·방향을 대조하지 않으며 내부 출처명과 지난 일정은 막는다.
    assert.deepEqual(checkTacticalStored(`${first.ko.replace('2.6', '2.5')} ${tail.ko}`, prompt('ko')), []);
    assert.deepEqual(checkTacticalStored(`${first.ko.replace('하락', '상승')} ${tail.ko}`, prompt('ko')), []);
    assert.ok(checkTacticalStored(`${first.ko} NEWS PULSE. ${tail.ko}`, prompt('ko')).includes('tactical:internal-source'));
    console.log('통과 10232108: 날짜 없는 REG→POST/CLOSED 24복구·v2 verdict-only 12복구·3언어 방향/다른 주어·REG 선물 근거/방향');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
    Date.now = realNow; _setMarketClockForTest(null); _setModelCallerForTest(null); _resetInsightStateForTest();
});
