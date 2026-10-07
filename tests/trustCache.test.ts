/**
 * 신뢰 레이어 캐시 단계 — src/lib/ai/trustCache.ts : fresh / mild / stale · 재생성 슬롯 · 3분 최소 나이 · 재료 미완결
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/trustCache.test.ts
 */
import assert from 'node:assert/strict';
import { resolveTrustCache, presentTrust } from '@/lib/ai/trustCache';
import { flowStaleness } from '@/lib/ai/trustLayer';
import { flowTextSlots, recheckStoredFlow } from '@/lib/ai/flowTrust';

let n = 0;
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log('ok -', name); };

const TPL = {
    structuralThesis: { ko: 'P/C {PC} 로 콜 우위이고 현물 {PRICE} 은 콜 월 {CALL_WALL} 아래 {DIST_CALL} 에 있다.', en: 'P/C of {PC} is call-led; spot {PRICE} sits {DIST_CALL} below the {CALL_WALL} call wall.', ja: 'P/C {PC}はコール優位で、現物{PRICE}はコールウォール{CALL_WALL}の{DIST_CALL}下にある。' },
    factorHighlights: [], repricingCondition: { ko: '풋 플로어 {PUT_FLOOR} 아래에서 마감하는 상태.', en: 'Spot closing below {PUT_FLOOR}.', ja: '{PUT_FLOOR}を下回って引ける状態。' },
};
const BASIS_TOKENS = { PRICE: 239.24, CALL_WALL: 245, PUT_FLOOR: 230, PC: 0.62, DIST_CALL: 2.4 };
const mk = (ageMin: number) => ({ tpl: TPL, trust: 1, ticker: 'NVDA', session: 'CLOSED', generatedAt: new Date(Date.now() - ageMin * 60000).toISOString(), basisTokens: BASIS_TOKENS, basisState: { price: 239.24, callWall: 250, putFloor: 230, gammaFlip: 252, maxPain: 230, session: 'CLOSED' } });

const store = new Map<string, any>();
const io = { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: any) => { store.set(k, v); return true; } };
const base = (price: number, material = true) => ({
    key: 'k', slotKey: 'slot', ticker: 'NVDA', material: { ok: material, reasons: material ? [] : ['pc'] }, io,
    recheck: recheckStoredFlow, staleness: (c: any) => flowStaleness(c.basisState, { price }),
});

(async () => {
    await t('저장본 없음 → none', async () => { store.clear(); assert.equal((await resolveTrustCache(base(239.5))).action, 'none'); });
    await t('fresh — 그대로(plain)', async () => { store.clear(); store.set('k', mk(30)); const r = await resolveTrustCache(base(239.5)); assert.deepEqual([r.action, (r as any).mode], ['serve', 'plain']); });
    await t('mild — 1% 이동(수준 안 넘음)은 생성 시각 표기', async () => { store.clear(); store.set('k', mk(30)); const r = await resolveTrustCache(base(242.0)); assert.deepEqual([r.action, (r as any).mode], ['serve', 'mild']); });
    await t('stale — 2% 넘게 이동(+2.6%) → 재생성(슬롯 얻음), 곧바로 한 번 더 부르면 슬롯이 차 있어 stale 표기로', async () => {
        store.clear(); store.set('k', mk(30));
        const r1 = await resolveTrustCache(base(245.6)); assert.equal(r1.action, 'generate');
        const r2 = await resolveTrustCache(base(245.6)); assert.deepEqual([r2.action, (r2 as any).mode], ['serve', 'stale']);
    });
    await t('3분 안에 만든 글은 낡음이어도 재생성하지 않는다(이중 생성 방지)', async () => {
        store.clear(); store.set('k', mk(1));
        const r = await resolveTrustCache(base(250));
        assert.equal(r.action, 'serve'); assert.equal((r as any).mode, 'mild');
        assert.equal(store.has('slot'), false, '슬롯도 쓰지 않는다');
    });
    await t('재료 미완결 + 저장본 있음 → 이전 정상본 유지(mild)', async () => { store.clear(); store.set('k', mk(30)); const r = await resolveTrustCache(base(239.5, false)); assert.deepEqual([r.action, (r as any).mode], ['serve', 'mild']); });
    await t('재료 미완결 + 저장본 없음 → none(호출자가 422)', async () => { store.clear(); assert.equal((await resolveTrustCache(base(239.5, false))).action, 'none'); });
    await t('저장본에 예측어가 있으면 버린다(사전 갱신 뒤 옛 글 방지)', async () => {
        store.clear(); const bad = mk(30); (bad.tpl as any).structuralThesis.ko += ' 상승 흐름이 이어질 것으로 전망된다.'; store.set('k', bad);
        assert.equal((await resolveTrustCache(base(239.5))).action, 'none');
    });
    await t('표기·방향 문장 제거 — present: plain 은 값만 채우고, mild 는 «생성 HH:MM ET 기준», stale 은 위치 서술 문장도 뺀다', () => {
        const c = mk(30);
        const plain = presentTrust(c, flowTextSlots, { PRICE: 241.1, CALL_WALL: 245, PC: 0.64, DIST_CALL: 1.6, PUT_FLOOR: 230 }, 'plain')!;
        assert.match(plain.analysis.structuralThesis.ko, /P\/C 0\.64/); assert.match(plain.analysis.structuralThesis.ko, /\$241\.10/);
        const mild = presentTrust(c, flowTextSlots, BASIS_TOKENS, 'mild')!;
        assert.match(mild.analysis.structuralThesis.en, /\(as of \d\d:\d\d ET\)$/);
        const stale = presentTrust(c, flowTextSlots, BASIS_TOKENS, 'stale')!;
        assert.equal(stale.meta.staleMode, 'stale');
    });
    await t('저장본에 숫자만 든 중괄호가 있어도 걷고 나간다 — 10/7 운영 NVDA «$237.5({240})»(화면에 중괄호째 보였다) · 이름 있는 자리표는 채운다', () => {
        const c = mk(30);
        (c.tpl as any).structuralThesis.ko = '현물 {PRICE} 은 콜 월 {CALL_WALL}({240}) 아래 {DIST_CALL} 에 있다. SMA 50일선({218.92})이 200일선({201.02})을 넘었다.';
        (c.tpl as any).structuralThesis.en = 'Spot {PRICE} sits {DIST_CALL} below the {CALL_WALL} ({240}) call wall; the 50-day SMA ({218.92}) is above the 200-day ({201.02}).';
        const p = presentTrust(c, flowTextSlots, { PRICE: 237.7, CALL_WALL: 240, DIST_CALL: 1.0, PC: 0.86, PUT_FLOOR: 230 }, 'plain');
        assert.ok(p, '중괄호가 있어도 null 이 아니다(재생성 대신 그 자리에서 고친다)');
        assert.equal(p!.analysis.structuralThesis.ko, '현물 $237.70 은 콜 월 $240 아래 1.0% 에 있다. SMA 50일선이 200일선을 넘었다.');
        for (const { obj } of flowTextSlots(p!.analysis)) for (const loc of ['ko', 'en', 'ja']) assert.doesNotMatch(String(obj[loc] ?? ''), /[{}]/, `${loc} 에 중괄호가 남았다`);
    });
    console.log(`\n${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
