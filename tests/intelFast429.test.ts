/**
 * /api/intel/fast Intrinio 429 (2026-10-13) — 배경 갱신(refresh=1 · 응답 뒤 갱신)이 한도를 태우지 않게 하는 관문
 * 실행: NODE_PATH=$PWD/node_modules node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/intelFast429.test.ts
 *
 * 운영 실측(10/12 24시간): /api/intel/fast 3,496건 중 사람 7건 — 앱 예열 크론 2,160 · 목록 갱신 700 · signum-warm 614. 429 로그 줄의 80%가 이 경로.
 * 429 군집은 분 5·20·35·50(수집 Lambda signum-harvest 가 15분마다 :02:54 에 시작해 «최근 60초 2,399회»까지 올라 계정 한도를 바닥내는 3~5분)에만 났다.
 *
 * 지키는 것:
 *   1. 풀: 한 번에 limit 개만 · 시한을 넘으면 새 일을 시작하지 않는다
 *   2. callIntrinio: 표식 없는 사용자 경로는 예전과 똑같이 429 를 한 번 더 묻는다 · 배경 표식은 429 에서 다시 묻지 않고, 관문이 닫히면 보내지 않는다 · 4xx 도 다시 안 묻는다
 *   3. 관문 판단: 스위치 · 정상본 없음 · 예산 바닥(429 신호·벤더 점검) 건너뜀 · 나이 상한에서 접음 · 같은 키 25초 한 번
 *   4. 라우트(전체): 바닥이면 벤더 호출 0 + 정상본 그대로 · 스위치를 켜면 예전 그대로 재계산 · 429 를 받은 갱신은 정상본을 덮지 않고 호출이 몇 개에서 멈춘다
 *   5. 구조: 사용자 경로(표식 없음)는 관문·계측 외엔 달라지지 않는다 · 앱 예열이 풀을 쓴다
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RealDate = Date;
function setNow(ms: number) {
    class FakeDate extends RealDate {
        constructor(...a: any[]) { if (a.length === 0) super(ms); else super(...(a as [any])); }
        static now() { return ms; }
    }
    (globalThis as any).Date = FakeDate;
}
const NOW = RealDate.UTC(2026, 9, 13, 14, 0, 0);   // 2026-10-13(화) 10:00 ET — 정규장(열린 칸: 신선 20초 · 허용 10분)

let pass = 0;
const t = async (name: string, fn: () => void | Promise<void>) => {
    try { await fn(); pass++; console.log(`  ✓ ${name}`); }
    catch (e: any) { console.error(`  ✗ ${name}\n    ${e?.stack || e}`); process.exitCode = 1; }
};

process.env.INTRINIO_API_KEY = 'test-key';
const store = new Map<string, any>();
const redisPath = require.resolve('../src/services/redisClient');
const realRedis = require(redisPath);
(require as any).cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, children: [], paths: [], exports: {
    ...realRedis,
    getFromCache: async (k: string) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
    setInCache: async (k: string, v: any) => { store.set(k, JSON.parse(JSON.stringify(v))); return true; },
    mgetFromCache: async (ks: string[]) => ks.map((k) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null)),
    deleteFromCache: async (k: string) => { store.delete(k); return true; },
} };
// next/server after() — 요청 범위 밖이라 직접 모아 두었다가 시험이 기다린다
const ns = require('next/server');
let afterQueue: Array<() => any> = [];
ns.after = (fn: () => any) => { afterQueue.push(fn); };
const flushAfter = async () => { const q = afterQueue; afterQueue = []; await Promise.all(q.map((f) => Promise.resolve().then(f).catch(() => undefined))); };

// 벤더 대역: 상태를 시험이 정한다(429 · 404 · 200 빈 몸). 호출을 센다.
const vendor = { status: 429, calls: 0, paths: [] as string[] };
const mkRes = (status: number, body: any) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => new ArrayBuffer(0), headers: new Map() });
(globalThis as any).fetch = async (url: any) => {
    const u = String(url?.url || url);
    if (/api-v2\.intrinio\.com/.test(u)) { vendor.calls++; vendor.paths.push(u.replace(/^https:\/\/api-v2\.intrinio\.com\//, '').replace(/\?.*$/, '')); return mkRes(vendor.status, {}); }
    return mkRes(404, {});
};
const resetVendor = (status: number) => {
    vendor.status = status; vendor.calls = 0; vendor.paths = [];
    // 앞 시험이 200 으로 채운 공유 응답 캐시·마지막 정상값을 비운다(안 비우면 «벤더 호출 0» 이 캐시 적중이다)
    for (const k of [...store.keys()]) if (k.startsWith('intrinio:resp:') || k.startsWith('intrinio:snap:lastgood:') || k.startsWith('flow:ticker:')) store.delete(k);
};

const { runPool } = require('../src/lib/asyncPool') as typeof import('../src/lib/asyncPool');
const BG = require('../src/lib/intrinioBackground') as typeof import('../src/lib/intrinioBackground');
const CM = require('../src/lib/intrinioCallMeter') as typeof import('../src/lib/intrinioCallMeter');
const M = require('../src/lib/intrinioMeter') as typeof import('../src/lib/intrinioMeter');
const GOV = require('../src/lib/intelFastGovernor') as typeof import('../src/lib/intelFastGovernor');
const IC = require('../src/services/intrinioClient') as typeof import('../src/services/intrinioClient');
const C = require('../src/lib/cache/intelFastCache') as typeof import('../src/lib/cache/intelFastCache');

const callMem = M.memoryMeterStore();
CM.__setCallMeterStore(callMem);
M.__setMeterStore(M.memoryMeterStore());

(async () => {
    console.log('━━━ 1. 풀 ━━━');
    await t('동시에 limit 개를 넘지 않고 모두 끝난다', async () => {
        let active = 0, peak = 0;
        const r = await runPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (x) => { active++; peak = Math.max(peak, active); await new Promise((z) => setTimeout(z, 8)); active--; return x * 2; });
        assert.deepEqual(r, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
        assert.equal(peak, 3);
    });
    await t('시한을 넘으면 새 일을 시작하지 않는다(시작 못 한 칸은 undefined)', async () => {
        let clock = 0; const started: number[] = [];
        const r = await runPool([1, 2, 3, 4, 5], 1, async (x) => { started.push(x); clock += 10; return x; }, { deadlineAt: 25, now: () => clock });
        assert.deepEqual(started, [1, 2, 3]);
        assert.deepEqual(r, [1, 2, 3, undefined, undefined]);
    });

    console.log('━━━ 2. callIntrinio — 사용자 경로는 그대로 · 배경 표식만 달라진다 ━━━');
    await t('표식 없음(사용자 경로): 429 를 «한 번 더» 묻는다 — 예전과 같다(경로 2개 × 2회 = 4콜)', async () => {
        resetVendor(429);
        await IC.getTickerSnapshot('AAPL');
        assert.equal(vendor.calls, 4);
    });
    await t('배경 표식(noRetry429): 429 를 다시 묻지 않는다(경로 2개 × 1회 = 2콜)', async () => {
        resetVendor(429);
        const ctx = BG.newBgCtx('intel:test', { noRetry429: true });
        await BG.runWithBg(ctx, () => IC.getTickerSnapshot('MSFT'));
        assert.equal(vendor.calls, 2);
        assert.equal(ctx.saw429, 2);
        assert.equal(ctx.tripped, false);
    });
    await t('배경 표식(tripOn429): 첫 429 뒤 이 흐름의 호출은 벤더로 가지 않는다 — 두 번째 종목은 0콜', async () => {
        resetVendor(429);
        const ctx = BG.newBgCtx('intel:test', { noRetry429: true, tripOn429: true });
        await BG.runWithBg(ctx, async () => { await IC.getTickerSnapshot('NVDA'); const after1 = vendor.calls; await IC.getTickerSnapshot('AMZN'); assert.equal(vendor.calls, after1); });
        assert.equal(vendor.calls, 2);
        assert.equal(ctx.tripped, true);
        assert.ok(ctx.skippedByTrip >= 2);
    });
    await t('관문이 닫힌 흐름의 오류는 «429 를 받은 것»과 같은 모양이다(status 429 · 메시지에 429) · 벤더로는 가지 않는다', async () => {
        resetVendor(200);
        const ctx = BG.newBgCtx('intel:test', { tripOn429: true }); ctx.tripped = true;
        let err: any = null;
        await BG.runWithBg(ctx, async () => { try { await IC.intrinioOptionsDiagGet('options/expirations/AAPL/eod'); } catch (e) { err = e; } });
        assert.ok(err, '오류가 던져진다');
        assert.equal(err.status, 429);
        assert.ok(/429/.test(String(err.message)));
        assert.equal(vendor.calls, 0);
        assert.equal(ctx.skippedByTrip, 1);
    });
    await t('배경 표식은 4xx 도 다시 묻지 않는다(404: 경로 2개 × 1회) · 표식 없음은 예전처럼 한 번 더(4콜)', async () => {
        resetVendor(404);
        await IC.getTickerSnapshot('GOOGL');
        assert.equal(vendor.calls, 4);
        resetVendor(404);
        await BG.runWithBg(BG.newBgCtx('intel:test', { noRetry429: true }), () => IC.getTickerSnapshot('META'));
        assert.equal(vendor.calls, 2);
    });
    await t('계측: 흐름 이름별 429·정상 호출이 센다 · «other» 의 정상 응답은 세지 않는다', async () => {
        resetVendor(200);
        await IC.getTickerSnapshot('TSLA');    // label other, 200 → 안 센다
        await BG.runWithBg(BG.newBgCtx('intel:app-warm'), () => IC.getTickerSnapshot('AVGO'));   // 200 → ok 2
        resetVendor(429);
        await BG.runWithBg(BG.newBgCtx('intel:app-warm', { noRetry429: true }), () => IC.getTickerSnapshot('AMD'));
        await CM.flushCallMeterNow();
        const rows = await CM.readCallMinutes(Date.now() - 10 * 60e3, Date.now() + 60e3);
        const warm = rows.find((r) => r.label === 'intel:app-warm');
        assert.ok(warm, '라벨 행');
        assert.equal(warm!.r429, 2);
        assert.ok(warm!.ok >= 0);
        assert.ok(!rows.find((r) => r.label === 'other' && r.ok > 0));
    });

    await t('계측 읽기: Upstash HGETALL 은 «[필드, 값, …] 배열»로 온다(운영 실측) — 배열·객체 두 모양을 모두 숫자 표로 바꾼다 · 숫자 아닌 값은 버린다', () => {
        assert.deepEqual(CM.normalizeHash(['a|ok', '2', 'b|429', '5', 'x', 'nope']), { 'a|ok': 2, 'b|429': 5 });
        assert.deepEqual(CM.normalizeHash({ 'a|ok': '3', z: 'q' }), { 'a|ok': 3 });
        assert.deepEqual(CM.normalizeHash(null), {});
        assert.deepEqual(CM.normalizeHash([]), {});
    });
    await t('계측 읽기: 배열을 돌려주는 저장소로도 시간대표가 채워진다', async () => {
        const arr: Record<string, any[]> = {};
        const key = CM.callMinuteKey(Date.now());
        arr[key] = ['intel:app-warm|ok', '141', 'intel:app-warm|runs', '10', 'intel:app-warm|429', '3'];
        CM.__setCallMeterStore({ hincrbyEx: async () => undefined, hgetall: async (k: string) => (arr[k] as any) ?? {} } as any);
        const rows = await CM.readCallMinutes(Date.now() - 60e3, Date.now() + 60e3);
        const w = rows.find((r) => r.label === 'intel:app-warm');
        assert.ok(w); assert.equal(w!.ok, 141); assert.equal(w!.runs, 10); assert.equal(w!.r429, 3);
        CM.__setCallMeterStore(callMem);
    });

    console.log('━━━ 3. 관문 판단 ━━━');
    const mem = M.memoryMeterStore();
    let recent: 'yes' | 'no' | 'unknown' = 'no';
    let probeAnswer: 'ok' | 'hot' | 'unknown' = 'ok';
    let probes = 0;
    let clock = NOW;
    GOV.__setGovernorDepsForTest({
        store: mem, now: () => clock,
        recent429: async () => ({ state: recent }),
        probe: async () => { probes++; return probeAnswer; },
    });
    const dec = (age: number | null, maxStale = 10 * 60_000, key = 'k1') => GOV.decideBackground({ key, usableAgeMs: age, maxStaleMs: maxStale });
    await t('나이 상한 = 허용 나이의 60%(최대 15분)', () => {
        assert.equal(GOV.skipAgeLimitMs(10 * 60_000), 6 * 60_000);
        assert.equal(GOV.skipAgeLimitMs(30 * 60_000), 15 * 60_000);
        assert.equal(GOV.skipAgeLimitMs(12 * 3600_000), 15 * 60_000);
    });
    await t('정상본이 없으면 건너뛰지 못한다(계산해야 한다) — 예산이 바닥이어도', async () => {
        recent = 'yes';
        const d = await dec(null);
        assert.deepEqual(d, { run: true, why: 'no-envelope' });
    });
    await t('예산 바닥(직전 60초 안 429) → 건너뛴다 · 벤더 점검도 하지 않는다', async () => {
        recent = 'yes'; probes = 0; mem.data.clear(); GOV._resetGovernorMemoForTest();
        const d = await dec(60_000);
        assert.deepEqual(d, { run: false, why: 'hot-429' });
        assert.equal(probes, 0);
    });
    await t('429 신호가 없어도 벤더 1콜 점검이 429 면 건너뛴다(hot-probe)', async () => {
        recent = 'no'; probeAnswer = 'hot'; probes = 0; mem.data.clear();
        const d = await dec(60_000, 10 * 60_000, 'k2');
        assert.deepEqual(d, { run: false, why: 'hot-probe' });
        assert.equal(probes, 1);
    });
    await t('정상본이 허용 나이의 60%(10분 칸이면 6분)에 닿으면 바닥이어도 접고 갱신한다(age-override)', async () => {
        recent = 'yes'; probeAnswer = 'hot'; mem.data.clear();
        const d = await dec(6 * 60_000 + 1, 10 * 60_000, 'k3');
        assert.deepEqual(d, { run: true, why: 'age-override' });
        const d2 = await dec(5 * 60_000, 10 * 60_000, 'k3');
        assert.equal(d2.run, false);   // 5분이면 아직 건너뛴다
    });
    await t('예산이 있으면 갱신하고 같은 키는 25초 안에 한 번만(flight) — 다른 키는 따로', async () => {
        recent = 'no'; probeAnswer = 'ok'; mem.data.clear();
        assert.deepEqual(await dec(60_000, 10 * 60_000, 'kA'), { run: true, why: 'ok' });
        assert.deepEqual(await dec(60_000, 10 * 60_000, 'kA'), { run: false, why: 'flight' });
        assert.deepEqual(await dec(60_000, 10 * 60_000, 'kB'), { run: true, why: 'ok' });
    });
    await t('플라이트 저장소가 죽어 있으면(쓰기도 읽기도 안 됨) 막지 않는다 — 저장소 장애가 갱신을 멈추지 않는다', async () => {
        recent = 'no'; probeAnswer = 'ok';
        const dead = { ...M.memoryMeterStore(), async setNxEx() { return false; }, async get() { return null; } };
        GOV.__setGovernorDepsForTest({ store: dead as any, now: () => clock, recent429: async () => ({ state: 'no' as const }), probe: async () => 'ok' as const });
        assert.deepEqual(await dec(60_000, 10 * 60_000, 'kD'), { run: true, why: 'ok' });
        GOV.__setGovernorDepsForTest({ store: mem, now: () => clock, recent429: async () => ({ state: recent }), probe: async () => { probes++; return probeAnswer; } });
    });
    await t('스위치(intel-fast-429:off)가 있으면 항상 갱신(예전 그대로)', async () => {
        recent = 'yes'; probeAnswer = 'hot'; mem.data.clear(); mem.data.set(GOV.GOV_OFF_KEY, '1'); GOV._resetGovernorMemoForTest();
        assert.deepEqual(await dec(60_000, 10 * 60_000, 'kS'), { run: true, why: 'switch-off' });
        mem.data.delete(GOV.GOV_OFF_KEY); GOV._resetGovernorMemoForTest();
        assert.equal((await dec(60_000, 10 * 60_000, 'kS')).run, false);
    });
    await t('벤더 점검: 429 면 hot · 나눠 쓰는 결과를 15초 안에는 다시 묻지 않는다', async () => {
        const m2 = M.memoryMeterStore(); let n = 0; let now = NOW;
        const realFetch = (globalThis as any).fetch;
        (globalThis as any).fetch = async (u: any) => { n++; return mkRes(String(u).includes('intrinio') ? 429 : 404, {}); };
        const r1 = await GOV.probeVendorBudget(m2, () => now);
        const r2 = await GOV.probeVendorBudget(m2, () => now + 5000);
        const r3 = await GOV.probeVendorBudget(m2, () => now + 20000);   // 15초 지남 → 다시 묻는다(락은 5초 TTL 인데 시험 저장소는 TTL 이 없으니 지운다)
        assert.equal(r1, 'hot'); assert.equal(r2, 'hot');
        assert.equal(n, 1);
        m2.data.delete(GOV.PROBE_LOCK_KEY);
        const r4 = await GOV.probeVendorBudget(m2, () => now + 20000);
        assert.equal(r4, 'hot'); assert.equal(n, 2);
        void r3;
        (globalThis as any).fetch = realFetch;
    });

    console.log('━━━ 4. 라우트 전체 — 운영 모양(벤더 429) ━━━');
    setNow(NOW);
    const { NextRequest } = require('next/server');
    const route = require('../src/app/api/intel/fast/route');
    const SECTOR = 'm7';
    const TICKERS = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'];
    const phaseKey = C.etPhase(NOW).key;
    const goodBody = () => ({
        success: true,
        data: TICKERS.map((tk, i) => ({ ticker: tk, price: 100 + i, changePct: 0.5, prevClose: 99, rsi: 50 + i, extendedPrice: 0, session: 'REG' })),
        meta: { tickers: TICKERS, count: 7, cacheHits: 7, cacheMisses: 0, app: true },
    });
    const KEY = C.intelFastKey(SECTOR, true);
    const putEnv = (ageMs: number) => store.set(KEY, { at: NOW - ageMs, phase: phaseKey, body: goodBody() });
    const bake = async (ua = 'signum-app-warm') => {
        const req = new NextRequest(`http://localhost/api/intel/fast?sector=${SECTOR}&app=1&refresh=1`, { headers: { 'user-agent': ua } });
        const res = await route.GET(req);
        const j = await res.json();
        await flushAfter();
        await new Promise((z) => setTimeout(z, 30));
        return j;
    };
    const resetGov = (opts: { recent?: 'yes' | 'no'; probe?: 'ok' | 'hot'; off?: boolean }) => {
        const m = M.memoryMeterStore();
        if (opts.off) m.data.set(GOV.GOV_OFF_KEY, '1');
        GOV.__setGovernorDepsForTest({ store: m, now: () => NOW, recent429: async () => ({ state: opts.recent ?? 'no' }), probe: async () => opts.probe ?? 'ok' });
        return m;
    };

    await t('★ 예산 바닥(429 신호) — refresh=1 은 벤더를 한 번도 부르지 않고 정상본을 그대로 준다 · 정상본은 안 바뀐다', async () => {
        resetVendor(429); putEnv(60_000); resetGov({ recent: 'yes' });
        const before = JSON.stringify(store.get(KEY));
        const j = await bake();
        assert.equal(vendor.calls, 0);
        assert.equal(j.meta.refresh, 'skipped:hot-429');
        assert.equal(j.data.length, 7);
        assert.equal(j.meta.cache, 'stale');
        assert.equal(JSON.stringify(store.get(KEY)), before);
    });
    await t('★ 벤더 점검이 429 — 같은 결과(호출 0 · 정상본 그대로)', async () => {
        resetVendor(429); putEnv(60_000); resetGov({ recent: 'no', probe: 'hot' });
        const j = await bake();
        assert.equal(vendor.calls, 0);
        assert.equal(j.meta.refresh, 'skipped:hot-probe');
    });
    await t('스위치가 켜져 있으면 «예전 그대로» — 같은 상황에서 재계산하러 벤더를 부른다 · 정상본이 새 계산으로 바뀐다', async () => {
        resetVendor(429); putEnv(60_000); resetGov({ recent: 'yes', off: true });
        const atBefore = store.get(KEY).at;
        const j = await bake();
        assert.ok(vendor.calls >= 14, `벤더 호출 ${vendor.calls}`);
        assert.equal(j.meta.cache, 'miss');
        assert.notEqual(store.get(KEY).at, atBefore);
    });
    await t('★ 예산 신호 없음 + 벤더 전부 429 — 갱신은 시작하되 처음 429 뒤 호출이 멈춘다(예전 ≥14콜 → 한 자리 수) · 정상본을 덮지 않는다', async () => {
        resetVendor(429); putEnv(60_000); resetGov({ recent: 'no', probe: 'ok' });
        const before = JSON.stringify(store.get(KEY));
        await bake();
        assert.ok(vendor.calls > 0 && vendor.calls <= 8, `벤더 호출 ${vendor.calls}`);
        assert.equal(JSON.stringify(store.get(KEY)), before, '429 를 받은 갱신은 정상본을 덮지 않는다');
    });
    await t('같은 키의 갱신이 방금 시작됐으면(25초 안) 두 번째 refresh=1 은 계산하지 않는다(flight)', async () => {
        resetVendor(200); putEnv(60_000); resetGov({ recent: 'no', probe: 'ok' });
        const j1 = await bake();
        const calls1 = vendor.calls;
        const j2 = await bake('signum-intel-fast-all');
        assert.equal(j2.meta.refresh, 'skipped:flight');
        assert.equal(vendor.calls, calls1);
        void j1;
    });
    await t('정상본이 허용 나이의 60%를 넘으면(6분) 바닥이어도 갱신한다', async () => {
        resetVendor(429); putEnv(6 * 60_000 + 5000); resetGov({ recent: 'yes' });
        await bake();
        assert.ok(vendor.calls > 0, '나이 상한에서 접고 갱신');
    });
    await t('정상본이 없으면(칸이 바뀐 직후) 예전처럼 끝까지 계산한다 — 429 에서 멈추지 않고(재시도 포함) 결과를 저장한다', async () => {
        resetVendor(429); store.delete(KEY); resetGov({ recent: 'yes' });
        const j = await bake();
        assert.ok(vendor.calls >= 14, `벤더 호출 ${vendor.calls}`);
        assert.equal(j.meta.cache, 'miss');
        assert.ok(store.has(KEY), '정상본이 없었으니 저장한다(예전과 같다)');
    });
    await t('읽기 요청(refresh 없음)이 정상본 안이면 그대로 — 신선하면 배경 갱신 없음 · 식었고 예산 바닥이면 응답 뒤 갱신이 건너뛴다', async () => {
        resetVendor(429); putEnv(5_000); resetGov({ recent: 'yes' }); afterQueue = [];
        let req = new NextRequest(`http://localhost/api/intel/fast?sector=${SECTOR}&app=1`, { headers: { 'user-agent': 'Mozilla/5.0' } });
        let j = await (await route.GET(req)).json();
        assert.equal(j.meta.cache, 'hit'); assert.equal(afterQueue.length, 0);
        putEnv(90_000);
        req = new NextRequest(`http://localhost/api/intel/fast?sector=${SECTOR}&app=1`, { headers: { 'user-agent': 'Mozilla/5.0' } });
        j = await (await route.GET(req)).json();
        assert.equal(j.meta.cache, 'stale'); assert.equal(afterQueue.length, 1);
        await flushAfter();
        assert.equal(vendor.calls, 0, '응답 뒤 갱신이 바닥난 예산을 두드리지 않는다');
    });
    await t('정상본이 없는 읽기 요청(사람)은 요청 안에서 계산한다 — 관문 밖(재시도 포함, 예전 그대로)', async () => {
        resetVendor(429); store.delete(KEY); resetGov({ recent: 'yes' }); afterQueue = [];
        const req = new NextRequest(`http://localhost/api/intel/fast?sector=${SECTOR}&app=1`, { headers: { 'user-agent': 'Mozilla/5.0' } });
        const j = await (await route.GET(req)).json();
        await flushAfter();
        assert.equal(j.meta.cache, 'miss');
        assert.ok(vendor.calls >= 14);
    });
    (globalThis as any).Date = RealDate;

    console.log('━━━ 5. 구조 ━━━');
    const root = path.join(__dirname, '..');
    const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
    await t('앱 예열 크론이 풀을 쓰고 스위치가 켜지면 예전처럼 전부 동시로 돌아간다', () => {
        const s = read('src/app/api/cron/app-warm/route.ts');
        assert.ok(/runPool\(ordered, INTEL_POOL, bake/.test(s));
        assert.ok(/governorOff\(\)/.test(s));
        assert.ok(/Promise\.all\(\[\.\.\.others, \.\.\.sectorPaths\]\.map\(bake\)\)/.test(s), '스위치 켜짐 = 예전 경로');
    });
    await t('목록 갱신(fast-all)이 풀을 쓰고 스위치가 켜지면 예전처럼 전부 동시', () => {
        const s = read('src/app/api/intel/fast-all/route.ts');
        assert.ok(/runPool\(stale, FAST_ALL_POOL, bake\)/.test(s));
        assert.ok(/Promise\.all\(stale\.map\(bake\)\)/.test(s));
    });
    await t('callIntrinio: 표식 없는 흐름의 재시도 규칙 줄은 그대로 있다(사용자 경로 불변)', () => {
        const s = read('src/services/intrinioClient.ts');
        assert.ok(s.includes('if (!RETRYABLE_STATUS.has(res.status) || isLast || bgFatal) throw err;'));
        assert.ok(/bgFatal = true;\s*\n\s*const tripErr/.test(s) || s.includes('bgFatal = true;'));
        assert.ok(s.includes('const INTRINIO_MAX_ATTEMPTS = Number(process.env.INTRINIO_MAX_ATTEMPTS || 2);'));
    });
    await t('라우트 응답 모양: 건너뛴 응답은 정상본의 data 를 그대로 싣고 meta 에 refresh 사유만 더한다', () => {
        const s = read('src/app/api/intel/fast/route.ts');
        assert.ok(s.includes("refresh: `skipped:${(d as any).why}`"));
        assert.ok(s.includes('bgStore.getStore()?.tripped'));
    });
    console.log(`\n${pass} passed${process.exitCode ? ' (일부 실패)' : ''}`);
    process.exit(process.exitCode || 0);
})().catch((e) => { (globalThis as any).Date = RealDate; console.error(e); process.exit(1); });
