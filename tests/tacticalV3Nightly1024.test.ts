/**
 * 코덱스 밤 검토 2026-10-24 ③(번역 숫자 미대조) · TRACKER T21(같은 화면 RLSI 33 vs 29) 재현 — 네트워크 0.
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
    _resetInsightStateForTest(); store.clear(); writes.length = 0; clock = Date.parse(iso); calls = 0; response = null;
}

async function main() {
    process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'offline-placeholder';
    process.env.AWS_ACCESS_KEY_ID = 'offline-placeholder';
    Date.now = () => clock;
    _setMarketClockForTest(() => new Date(clock));
    _setModelCallerForTest(async (opts) => {
        calls++;
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

    // ── 밤 검토 ③: 번역 응답의 틀린 숫자(VIX 99)는 화면·캐시를 통과하지 못한다 ──
    const enSource = () => store.set(key('en'), { text: text.en, updatedAt: new Date(clock - 60_000).toISOString(), basis: { RLSI: 33, VIX: 18.4, NDX_CHG: -0.2 }, session: 'REG' });
    const translateTo = (body: string) => (opts: any) => (String(opts.label || '').startsWith('Translate/') ? body : (() => { throw new Error('generation offline'); })());
    const koGood = '나스닥 현물 관측은 미확인입니다. 시장 전체 재료는 미확인입니다. 시장 건강도(RLSI)는 {RLSI}점으로 약하고 변동성(VIX)은 18.4이며 옵션 포지션(GEX)은 미확인입니다. 다음 분기점은 미확인입니다.';
    for (const [name, body, ok] of [
        ['VIX 99(원문·기준 18.4)', koGood.replace('18.4', '99'), false],
        ['원문에 없는 지수 수치', koGood.replace('나스닥 현물 관측은 미확인입니다.', '나스닥 종합은 2.6% 하락 중입니다.'), false],
        ['원문 숫자 그대로', koGood, true],
    ] as const) {
        reset(); enSource();
        response = translateTo(body);
        const out = await N.recoverInsight('reality', 'ko', { nums: { RLSI: 33, VIX: 18.4, NDX_CHG: -0.2 }, tacticalPrompts: prompts() });
        if (ok) {
            assert.ok(!N.isPlaceholderInsight(out) && out.includes('18.4') && out.includes('33점'), `${name}: ${out}`);
            assert.ok(writes.includes(key('ko')), `${name}: 통과 번역만 저장`);
        } else {
            assert.ok(!out.includes('99') && !out.includes('2.6%'), `${name}: 틀린 숫자 화면 통과 금지 — ${out}`);
            assert.ok(!writes.includes(key('ko')), `${name}: 캐시 저장 금지`);
            assert.ok(!store.has(key('ko')), `${name}: 저장본 없음`);
        }
    }
    // 관문 10241021 ①: 지표 간 숫자 맞바꿈·부호/방향 뒤집기도 탈락, 원문에서 이름-숫자 사이가 길어 리터럴로 안 잡힌 숫자는 같은 값·방향이면 통과
    const enIdx = 'In the cash session the Nasdaq Composite fell 2.6% and the S&P 500 rose 0.3%, while Nasdaq 100 futures in premarket trading are now down 0.4%. The market driver is unconfirmed. Market health (RLSI) is weak at {RLSI}, and options positioning (GEX) is unconfirmed. The next test is unconfirmed.';
    const koIdx = (a: string) => `${a} 시장 전체 재료는 미확인입니다. 시장 건강도(RLSI)는 {RLSI}점으로 약하고 옵션 포지션(GEX)은 미확인입니다. 다음 분기점은 미확인입니다.`;
    for (const [name, first, ok] of [
        ['지수 숫자 맞바꿈(표식 순서 바뀜)', '정규장에서 나스닥 종합은 ⟦2⟧% 올랐고 S&P500은 ⟦1⟧% 내렸으며, 지금 나스닥100 선물은 ⟦3⟧% 하락 중입니다.', false],
        ['현물·선물 맞바꿈', '정규장에서 나스닥 종합은 ⟦3⟧% 내렸고 S&P500은 ⟦2⟧% 올랐으며, 지금 나스닥100 선물은 ⟦1⟧% 하락 중입니다.', false],
        ['방향 뒤집기(fell → 상승)', '정규장에서 나스닥 종합은 ⟦1⟧% 상승했고 S&P500은 ⟦2⟧% 올랐으며, 지금 나스닥100 선물은 ⟦3⟧% 하락 중입니다.', false],
        ['선물 방향 뒤집기(원문은 긴 간격)', '정규장에서 나스닥 종합은 ⟦1⟧% 내렸고 S&P500은 ⟦2⟧% 올랐으며, 지금 나스닥100 선물은 ⟦3⟧% 상승 중입니다.', false],
        ['새 숫자(9.9%)', '정규장에서 나스닥 종합은 9.9% 내렸고 S&P500은 ⟦2⟧% 올랐으며, 지금 나스닥100 선물은 ⟦3⟧% 하락 중입니다.', false],
        ['표식 대신 숫자 직접', '정규장에서 나스닥 종합은 2.6% 내렸고 S&P500은 ⟦2⟧% 올랐으며, 지금 나스닥100 선물은 ⟦3⟧% 하락 중입니다.', false],
        ['원문 그대로(긴 간격 숫자 포함)', '정규장에서 나스닥 종합은 ⟦1⟧% 내렸고 S&P500은 ⟦2⟧% 올랐으며, 지금 나스닥100 선물은 ⟦3⟧% 하락 중입니다.', true],
    ] as const) {
        reset();
        store.set(key('en'), { text: enIdx, updatedAt: new Date(clock - 60_000).toISOString(), basis: { RLSI: 33, VIX: 18.4 }, session: 'REG' });
        response = translateTo(koIdx(first));
        const out = await N.recoverInsight('reality', 'ko', { nums: { RLSI: 33, VIX: 18.4 }, tacticalPrompts: prompts() });
        assert.equal(writes.includes(key('ko')), ok, `${name}: ${out}`);
        assert.equal(N.isPlaceholderInsight(out), !ok, name);
    }
    reset();
    store.set(key('en'), { text: enIdx, updatedAt: new Date(clock - 60_000).toISOString(), basis: { RLSI: 33, VIX: 18.4 }, session: 'REG' });
    let seenPrompt = '';
    response = (opts: any) => { if (!String(opts.label || '').startsWith('Translate/')) throw new Error('generation offline'); seenPrompt = opts.userPrompt; return koIdx('정규장에서 나스닥 종합은 ⟦1⟧% 내렸고 S&P500은 ⟦2⟧% 올랐으며, 지금 나스닥100 선물은 ⟦3⟧% 하락 중입니다.'); };
    const restoredOut = await N.recoverInsight('reality', 'ko', { nums: { RLSI: 33, VIX: 18.4 }, tacticalPrompts: prompts() });
    assert.ok(restoredOut.includes('나스닥 종합은 2.6% 내렸고') && restoredOut.includes('S&P500은 0.3%') && restoredOut.includes('선물은 0.4% 하락'), restoredOut);
    assert.ok(seenPrompt.includes('fell ⟦1⟧%') && !/fell 2\.6/.test(seenPrompt) && seenPrompt.includes('S&P 500') && seenPrompt.includes('Nasdaq 100'), '모델에는 숫자 대신 표식(고유명 숫자는 그대로)');
    // 관문 10241104 P2: 원문 자리표 값을 번역이 숫자로 정확히 써도 통과(자리표로 되돌림)
    reset();
    store.set(key('en'), { text: text.en.replace('The market driver is unconfirmed.', 'Gold rose {GOLD_CHG} on the session.'), updatedAt: new Date(clock - 60_000).toISOString(), basis: { RLSI: 33, VIX: 18.4, GOLD_CHG: 1.2 }, session: 'REG' });
    response = translateTo(koGood.replace('시장 전체 재료는 미확인입니다.', '금은 +1.2% 상승했습니다.'));
    const goldOut = await N.recoverInsight('reality', 'ko', { nums: { RLSI: 33, VIX: 18.4, GOLD_CHG: 1.2 }, tacticalPrompts: prompts() });
    assert.ok(!N.isPlaceholderInsight(goldOut) && goldOut.includes('+1.20%'), goldOut);
    // 기존 정상본이 있으면 번역 탈락과 무관하게 그 글을 유지한다
    reset(); enSource();
    store.set(key('ko'), { text: text.ko, updatedAt: new Date(clock - 60_000).toISOString(), basis: { RLSI: 33, VIX: 18.4 }, session: 'REG' });
    response = translateTo(koGood.replace('18.4', '99'));
    const kept = await N.recoverInsight('reality', 'ko', { nums: { RLSI: 33, VIX: 18.4, NDX_CHG: -0.2 }, tacticalPrompts: prompts() });
    assert.ok(kept.includes('33점') && !kept.includes('99'), kept);

    console.log('통과 밤 검토 10/24 ③ 번역 숫자 대조 · T21 같은 화면 RLSI 지금 값(구간 이동 시 생성 당시 값 보존)');
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => {
    Date.now = actualNow; _setMarketClockForTest(null); _setModelCallerForTest(null); _resetInsightStateForTest();
});
