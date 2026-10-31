/**
 * ★2026-10-31 관문 10311033 남은 위험 — 저장본·복구본(실제 복구 출구 IntelligenceNode)도 재료 지표 숫자·방향을 «생성 당시 재료 스냅샷»으로 대조한다.
 *   · 스냅샷 있는 저장본: 틀린 지표 숫자(확률 26%·공포탐욕 72)는 내보내지 않는다
 *   · 스냅샷 없는 저장본(이 변경 전 저장분): 숫자 대조 생략 — 예전 동작 그대로 보존
 *   · 지금 재료가 바뀌어도(확률 72→80·10년물 4.94→4.99) 생성 당시 정상 글은 그대로 보존(«준비 중» 고정 회귀 금지 — 자리표는 저장 당시 값으로 채워 대조)
 * 외부 통신 0(Redis·보관본·모델 모두 가짜).
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { buildTacticalPrompt, tacticalDriverSnapshot } from '@/lib/ai/tacticalPrompt';

const store = new Map<string, any>();
const archives = new Map<string, any>();
let calls = 0;
let clock = Date.parse('2026-10-31T02:00:00Z');   // 금 22:00 ET = 장외(모델 호출 없음 → 복구 경로)
const mock = (id: string, exports: unknown) => {
    const filename = require.resolve(id);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
};
mock('@upstash/redis', { Redis: class {
    async get(key: string) { return store.get(key) ?? null; }
    async set() { /* 복구는 쓰지 않는다 */ }
} });
mock('../src/lib/sessionArchive', {
    readSessionArchive: async (_kind: string, scope: string) => archives.get(scope) ?? null,
    saveSessionArchive: async () => false,
});
const { IntelligenceNode: N, _resetInsightStateForTest, _setMarketClockForTest, _setModelCallerForTest } = require('../src/services/guardian/intelligenceNode') as typeof import('../src/services/guardian/intelligenceNode');
const { context } = JSON.parse(readFileSync('tests/fixtures/tactical-story/post-1030.json', 'utf8'));

let failed = 0;
const test = async (name: string, fn: () => Promise<void>) => { try { await fn(); console.log('ok -', name); } catch (e) { failed++; console.error('FAIL -', name, e); } };

const FIRST = '10/30(금) 정규장에서 나스닥 종합은 2.9%, S&P500은 1.8% 내렸고, 지금 종가 이후 선물 변화는 미확인입니다.';
const SO = '시장 건강도(RLSI)가 약해 반등을 받칠 힘이 부족하고, 옵션 포지션(GEX)은 중립입니다.';
const NEXT = '다음 분기점은 미확인입니다.';
const text = (why: string) => [FIRST, why, SO, NEXT].join(' ');
const GOOD = text('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 72%와 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 오르고 반도체(SMH) −7%가 밀렸습니다.');
const BAD = text('시장이 반영한 다음 FOMC 금리 인상 확률(FedWatch) 26%와 공포·탐욕 지수 72(공포 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.');
// 자리표 글 — 10년물은 {US10Y}(저장 당시 4.94)로 저장된다
const TOKEN = text('미국 10년물 금리 {US10Y}(전일 대비 4bp 하락)와 공포·탐욕 지수 26(공포 구간) 속에 에너지(XLE) +1.9%만 올랐습니다.');

const genSnap = tacticalDriverSnapshot(buildTacticalPrompt(context, 'ko'))!;
const basis = { RLSI: 31, VIX: 19.4, GEX: 8, US10Y: 4.94 };
const ctxNow = (over: Record<string, unknown> = {}) => ({ ...context, locale: 'ko', vectors: [], ...over });
const changed = { macroDrivers: { ...context.macroDrivers, fedwatch: { nextFomcHikePct: 80, nextFomcHoldPct: 20, nextFomcCutPct: 0 }, us10y: { levelPct: 4.99, changeBp: 1 } }, us10y: 4.99, us10yChangeBp: 1 };

function put(where: 'redis' | 'archive', tpl: string, drivers?: string) {
    _resetInsightStateForTest(); store.clear(); archives.clear(); calls = 0;
    const saved = { text: tpl, basis, session: 'POST', updatedAt: '2026-10-30T23:40:00Z', ...(drivers ? { drivers } : {}) };
    if (where === 'redis') store.set('guardian:gemini:v3:reality:ko', saved);
    else archives.set('reality_v3_ko', { value: saved, stamp: { observedAt: Date.parse(saved.updatedAt) } });
}

async function main() {
    process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'offline-placeholder';
    process.env.AWS_ACCESS_KEY_ID = 'offline-placeholder';
    const realNow = Date.now;
    Date.now = () => clock;
    _setMarketClockForTest(() => new Date(clock));
    _setModelCallerForTest(async () => { calls++; throw new Error('offline model failure'); });
    try {
        for (const where of ['redis', 'archive'] as const) {
            await test(`${where} — 스냅샷 있는 저장본의 틀린 지표 숫자는 내보내지 않는다`, async () => {
                put(where, BAD, genSnap);
                const shown = await N.generateRealityInsight(ctxNow() as any);
                assert.notEqual(shown, BAD);
                assert.equal(calls, 0, '장외 모델 호출 0');
            });
            await test(`${where} — 스냅샷 없는 저장본(이 변경 전 저장분)은 숫자 대조 생략 — 예전 동작 그대로 보존`, async () => {
                put(where, BAD);
                assert.equal(await N.generateRealityInsight(ctxNow() as any), BAD);
            });
            await test(`${where} — 지금 재료가 바뀌어도 생성 당시 정상 글은 보존(스냅샷 기준·자리표는 저장 당시 값)`, async () => {
                put(where, GOOD, genSnap);
                assert.equal(await N.generateRealityInsight(ctxNow(changed) as any), GOOD);
                put(where, TOKEN, genSnap);
                const shown = await N.generateRealityInsight(ctxNow(changed) as any);
                assert.ok(!shown.includes('준비') && /10년물 금리 4\.9\d%/.test(shown), shown);
            });
        }
    } finally {
        Date.now = realNow;
    }
    if (failed) { console.error(`${failed} failed`); process.exit(1); }
    console.log('통과 tacticalStoredDrivers1031');
}
main();
