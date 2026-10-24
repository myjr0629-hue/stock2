/**
 * 코덱스 밤 검토 2026-10-24 ③(Tactical 번역 숫자 미대조 → 새 생성과 같은 출구 계약) · TRACKER T21(같은 화면 RLSI 33 vs 29) 재현 — 네트워크 0.
 *   ①(세션 재사용)은 tacticalV3Gate.test.ts 세션 경계 묶음, ②(장중 지연 현물 → 선물 판정)는 guardianCore.test.ts.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { buildTacticalPrompt } from '@/lib/ai/tacticalPrompt';

const store = new Map<string, any>();
const writes: string[] = [];
let clock = Date.parse('2026-10-23T15:00:00Z'); // 11:00 ET 정규장
let calls = 0;
let response: ((opts: any) => string) | null = null;
const modelLabels: string[] = [];
function mock(id: string, exports: unknown) {
    const filename = require.resolve(id);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
}
mock('@upstash/redis', { Redis: class {
    async get(key: string) { return store.get(key) ?? null; }
    async set(key: string, value: string) { writes.push(key); store.set(key, JSON.parse(value)); }
} });
mock('../src/lib/sessionArchive', { readSessionArchive: async () => null, saveSessionArchive: async () => false });
const { IntelligenceNode: N, _resetInsightStateForTest, _setMarketClockForTest, _setModelCallerForTest } = require('../src/services/guardian/intelligenceNode') as typeof import('../src/services/guardian/intelligenceNode');
const actualNow = Date.now;
type Locale = 'ko' | 'en' | 'ja';
const text = {
    ko: '나스닥 현물 관측은 미확인입니다. 오늘 시장 전체를 움직인 재료는 미확인입니다. 시장 건강도(RLSI)는 {RLSI}점으로 약하고 옵션 포지션(GEX)은 미확인입니다. 다음 분기점은 미확인입니다.',
    en: 'Nasdaq spot observations are unavailable. The market driver is unconfirmed. Market health (RLSI) is weak at {RLSI}, volatility (VIX) is {VIX}, and options positioning (GEX) is unconfirmed. The next test is unconfirmed.',
};
const key = (l: Locale) => `guardian:gemini:v3:reality:${l}`;
const ctx = (locale: Locale, over: Record<string, unknown> = {}) => ({ locale, rlsiScore: 33, nasdaqChange: -0.2, vix: 18.4, vectors: [], scheduledEvents: [], ...over });
const prompts = (over: Record<string, unknown> = {}) => (l: Locale) => buildTacticalPrompt({ ...ctx(l, over), asOf: new Date(clock).toISOString() }, l);
function reset(iso = '2026-10-23T15:00:00Z') {
    _resetInsightStateForTest(); store.clear(); writes.length = 0; modelLabels.length = 0; clock = Date.parse(iso); calls = 0; response = null;
}

async function main() {
    process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'offline-placeholder';
    process.env.AWS_ACCESS_KEY_ID = 'offline-placeholder';
    Date.now = () => clock;
    _setMarketClockForTest(() => new Date(clock));
    _setModelCallerForTest(async (opts) => {
        calls++; modelLabels.push(String(opts.label || ''));
        if (!response) throw new Error('offline failure');
        return { text: response(opts), model: 'mock', usedFallback: false, elapsedMs: 0 } as any;
    });

    // ── T21: Tactical 저장본(생성 당시 RLSI 29)을 같은 화면 지금 값(33)으로 채운다 ──
    reset();
    store.set(key('ko'), { text: text.ko, updatedAt: new Date(clock - 60_000).toISOString(), basis: { RLSI: 29, VIX: 18.4, NDX_CHG: -0.2 }, session: 'REG' });
    const fresh = await N.generateRealityInsight(ctx('ko'));
    assert.ok(fresh.includes('33점'), `캐시 재사용: 지금 값 33 — ${fresh}`);
    assert.ok(!fresh.includes('29'), '생성 당시 값 29 를 같은 화면에 내지 않는다');
    assert.equal(calls, 0, '구간 안 움직임은 재생성 없이 숫자만 맞춘다');
    // 실제 출구(저장 판정 verdict.num) — 복구 계약(restore)도 지금 값
    const verdict = { realityInsight: text.ko.replace('{RLSI}', '29'), num: { tpl: { realityInsight: text.ko }, basis: { realityInsight: { RLSI: 29, VIX: 18.4 } } } };
    const repaired = await N.repairVerdictTexts(verdict, 'ko', 't21', { RLSI: 33, VIX: 18.4 }, prompts());
    assert.ok(repaired.verdict.realityInsight.includes('33점'), repaired.verdict.realityInsight);
    assert.equal(repaired.repaired.length, 0, '탈락 아님(숫자만 지금 값)');
    // 장외(주말 «Last session analysis»)도 같은 화면의 다른 카드와 같은 시점 값
    reset('2026-10-24T01:00:00Z');
    const off = await N.repairVerdictTexts(verdict, 'ko', 't21-off', { RLSI: 33, VIX: 18.4 }, prompts());
    assert.ok(off.verdict.realityInsight.includes('33점'), off.verdict.realityInsight);
    assert.equal(calls, 0, '장외 모델 호출 0');
    // 관문 10241021 ②: 장외에도 상태 구간이 바뀐 지금 값으로 채우지 않는다(«+0.40% 상승» 글을 «0.00% 상승»으로 만들지 않음)
    reset('2026-10-24T01:00:00Z');
    const fut = { realityInsight: 'x', num: { tpl: { realityInsight: text.ko.replace('나스닥 현물 관측은 미확인입니다.', '나스닥100 선물은 {NDX_CHG} 상승했습니다.') }, basis: { realityInsight: { NDX_CHG: 0.4, RLSI: 29, VIX: 18.4 } } } };
    const offFut = await N.repairVerdictTexts(fut, 'ko', 't21-off-flat', { NDX_CHG: 0, RLSI: 33, VIX: 18.4 }, prompts());
    assert.ok(offFut.verdict.realityInsight.includes('+0.40% 상승') && !offFut.verdict.realityInsight.includes('0.00%'), offFut.verdict.realityInsight);
    assert.ok(!N.isPlaceholderInsight(offFut.verdict.realityInsight));
    // 관문 10241104: 공백 있는 자리표({ NDX_CHG })도 같은 판정
    const futSp = { ...fut, num: { ...fut.num, tpl: { realityInsight: fut.num.tpl.realityInsight.replace('{NDX_CHG}', '{ NDX_CHG }') } } };
    const offSp = await N.repairVerdictTexts(futSp, 'ko', 't21-off-flat-sp', { NDX_CHG: 0, RLSI: 33, VIX: 18.4 }, prompts());
    assert.ok(offSp.verdict.realityInsight.includes('+0.40% 상승') && !offSp.verdict.realityInsight.includes('0.00%'), offSp.verdict.realityInsight);
    // 서술 구간이 바뀌면(RLSI 29 → 50: «약하다»가 틀림) 지금 값으로 채우지 않고, 재생성 실패 시 생성 당시 값의 글을 보존(오탈락 금지)
    reset();
    store.set(key('ko'), { text: text.ko, updatedAt: new Date(clock - 60_000).toISOString(), basis: { RLSI: 29, VIX: 18.4, NDX_CHG: -0.2 }, session: 'REG' });
    const moved = await N.generateRealityInsight(ctx('ko', { rlsiScore: 50 }));
    assert.ok(calls > 0, '낡음은 재생성 유도');
    assert.ok(!N.isPlaceholderInsight(moved), '재생성 실패해도 «준비 중» 아님');
    assert.ok(moved.includes('29점') && !moved.includes('50점'), `구간이 바뀐 지금 값으로 «약하다» 서술을 채우지 않는다 — ${moved}`);

    // ── 밤 검토 ③: Tactical 번역은 새 생성과 같은 출구 계약(INDEX_FACTS 지수 대조 + 기존 숫자 검사)으로 — 틀린 숫자는 화면·캐시 0, 정상 번역은 통과 ──
    const translateTo = (body: string) => (opts: any) => (String(opts.label || '').startsWith('Translate/') ? body : (() => { throw new Error('generation offline'); })());
    const koGood = '나스닥 현물 관측은 미확인입니다. 시장 전체 재료는 미확인입니다. 시장 건강도(RLSI)는 {RLSI}점으로 약하고 변동성(VIX)은 18.4이며 옵션 포지션(GEX)은 미확인입니다. 다음 분기점은 미확인입니다.';
    for (const [name, body, ok] of [
        ['정상 번역(관문 10241232: 일정 없음·한국어만 생성 탈락 → 영어 번역 복구)', koGood, true],
        ['VIX 99(기준 18.4)', koGood.replace('18.4', '99'), false],
        ['근거 없는 지수 수치(INDEX_FACTS 없음)', koGood.replace('나스닥 현물 관측은 미확인입니다.', '나스닥 종합은 2.6% 하락 중입니다.'), false],
    ] as const) {
        reset();
        store.set(key('en'), { text: text.en, updatedAt: new Date(clock - 60_000).toISOString(), basis: { RLSI: 33, VIX: 18.4 }, session: 'REG' });
        response = translateTo(body);
        const out = await N.recoverInsight('reality', 'ko', { nums: { RLSI: 33, VIX: 18.4 }, tacticalPrompts: prompts() });
        assert.equal(writes.includes(key('ko')), ok, `${name}: ${out}`);
        assert.equal(N.isPlaceholderInsight(out), !ok, name);
        if (ok) assert.ok(out.includes('33점') && out.includes('18.4'), out);
        else assert.ok(!out.includes('99') && !out.includes('2.6%'), out);
    }
    // INDEX_FACTS 가 있으면 지수 값·방향을 새 생성처럼 대조한다(나스닥 종합 정규장 −0.784%)
    const fact = { id: 'nasdaq' as const, kind: 'spot' as const, name: { ko: '나스닥 종합', en: 'Nasdaq Composite', ja: 'ナスダック総合' }, basis: { ko: '전일 종가 대비', en: 'vs prior close', ja: '前日終値比' }, asOfET: '2026-10-23 10:59 ET', sessionDate: '2026-10-23', chgPct: -0.784 };
    const factPrompts = (l: Locale) => buildTacticalPrompt({ ...ctx(l), session: 'REG', asOf: new Date(clock).toISOString(), indexFacts: [fact as any] }, l);
    const enIdx = text.en.replace('Nasdaq spot observations are unavailable.', 'In the regular session now, the Nasdaq Composite is down 0.8% versus the prior close.');
    const koIdx = (first: string) => koGood.replace('나스닥 현물 관측은 미확인입니다.', first);
    for (const [name, first, ok] of [
        ['지수 정상', '지금 정규장 나스닥 종합은 전일 종가 대비 0.8% 하락 중입니다.', true],
        ['지수 방향 뒤집기', '지금 정규장 나스닥 종합은 전일 종가 대비 0.8% 상승 중입니다.', false],
        ['지수 값 바뀜', '지금 정규장 나스닥 종합은 전일 종가 대비 2.6% 하락 중입니다.', false],
    ] as const) {
        reset();
        store.set(key('en'), { text: enIdx, updatedAt: new Date(clock - 60_000).toISOString(), basis: { RLSI: 33, VIX: 18.4 }, session: 'REG' });
        response = translateTo(koIdx(first));
        const out = await N.recoverInsight('reality', 'ko', { nums: { RLSI: 33, VIX: 18.4 }, tacticalPrompts: factPrompts });
        assert.equal(writes.includes(key('ko')), ok, `${name}: ${out}`);
    }
    // 같은 언어 정상본이 있으면 번역하지 않고 그 글을 유지한다
    reset();
    store.set(key('ko'), { text: text.ko, updatedAt: new Date(clock - 60_000).toISOString(), basis: { RLSI: 33, VIX: 18.4 }, session: 'REG' });
    response = translateTo(koGood.replace('18.4', '99'));
    const kept = await N.recoverInsight('reality', 'ko', { nums: { RLSI: 33, VIX: 18.4, NDX_CHG: -0.2 }, tacticalPrompts: prompts() });
    assert.ok(kept.includes('33점') && !kept.includes('99'), kept);
    // 관문 10241132 ④: 감마·순환매 번역은 origin/main 방식 그대로 — «GEX has now fallen to +5» → «GEX는 +5로 하락» 정상 통과
    reset();
    store.set('guardian:gemini:v2:gamma:en', { text: "[What's different from normal] GEX has now fallen to +5, the lowest in a week.\n[Where this read breaks] Below 6,700 dealers flip to selling.", updatedAt: new Date(clock - 60_000).toISOString(), basis: null });
    response = translateTo('[평소와 다른 점] GEX는 이제 +5로 하락해 일주일 중 가장 낮다.\n[이 판단이 깨지는 지점] 6,700 아래에서는 딜러가 매도로 돌아선다.');
    const gammaOut = await N.recoverInsight('gamma', 'ko', { nums: { GEX: 5, RLSI: 33, VIX: 18.4 } });
    assert.ok(!N.isPlaceholderInsight(gammaOut) && gammaOut.includes('+5'), gammaOut);
    // 순환매 번역도 그대로(origin/main 경로)
    reset();
    store.set('guardian:gemini:v3:rotation:en', { text: 'Over the past five trading days money left Technology (XLK) -2.1% for Energy (XLE) 1.4%, a mild shift.\nThe next test is whether Energy (XLE) keeps drawing inflows.', updatedAt: new Date(clock - 60_000).toISOString(), basis: null });
    response = translateTo('지난 5거래일 동안 자금이 기술(XLK) -2.1%에서 에너지(XLE) 1.4%로 옮겨 갔습니다.\n다음 분기점은 에너지(XLE)로 유입이 이어지는지입니다.');
    const rotOut = await N.recoverInsight('rotation', 'ko', { nums: { RLSI: 33, VIX: 18.4 } });
    assert.ok(!N.isPlaceholderInsight(rotOut) && rotOut.includes('-2.1%'), rotOut);
    assert.equal(modelLabels.filter((l) => l.startsWith('Translate/')).length, 1);

    console.log('통과 밤 검토 10/24 ③ Tactical 번역 = 새 생성 출구 계약(순환매·감마 번역 불변) · T21 같은 화면 RLSI 지금 값(구간 이동 시 생성 당시 값 보존)');
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => {
    Date.now = actualNow; _setMarketClockForTest(null); _setModelCallerForTest(null); _resetInsightStateForTest();
});
