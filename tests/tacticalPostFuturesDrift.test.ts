/** POST 선물 변동: 실제 스냅샷 반환·생성기·검사는 실행하고 저장소·모델·시계만 모의한다. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { buildMarketIndexBasis } from '@/lib/marketIndexBasis';
import {
    postTacticalNeedsDriftRefresh, promptFuturesPct, tacticalFuturesDrifted,
    POST_TACTICAL_DRIFT_PP, POST_TACTICAL_REFRESH_MS, POST_TACTICAL_MAX_REFRESHES,
} from '@/lib/ai/tacticalIndexFacts';
import { tacticalFuturesDirection } from '@/lib/ai/tacticalFuturesRules';
import { POST_TACTICAL_REFRESH_LUA, reservePostTacticalRefresh } from '@/lib/ai/postTacticalRefreshBudget';

const MIN = 60_000;
const generatedAt = Date.parse('2026-10-27T20:12:00Z'); // 16:12 ET
let clock = Date.parse('2026-10-27T20:50:00Z');
const iso = (at: number) => new Date(at).toISOString();
const snapshot = { tacticalFutures: true, tacticalFuturesPct: { nq: 0, es: 0 }, timestamp: iso(generatedAt) };
assert.equal(postTacticalNeedsDriftRefresh(snapshot, 'POST', clock, { nq: 0.9, es: 0.5 }), true, '(a) 16:12 보합 → 16:50 +0.9%');
assert.equal(postTacticalNeedsDriftRefresh({ ...snapshot, tacticalFuturesPct: { nq: 0.3, es: 0.3 } }, 'POST', clock, { nq: 0.5, es: 0.5 }), false, '(b) 같은 방향에서 0.2pp 변동');
assert.equal(postTacticalNeedsDriftRefresh(snapshot, 'POST', generatedAt + 30 * MIN - 1, { nq: 0.9 }), false, '(c) 30분 미경과');
assert.equal(postTacticalNeedsDriftRefresh(snapshot, 'POST', generatedAt + 30 * MIN, { nq: 0.9 }), true, '정확히 30분');
assert.equal(postTacticalNeedsDriftRefresh({ timestamp: snapshot.timestamp, tacticalFutures: true }, 'POST', clock, { nq: 0.9 }), false, '(d) 옛 스냅샷');
for (const session of ['PRE', 'REG', 'CLOSED']) assert.equal(postTacticalNeedsDriftRefresh(snapshot, session, clock, { nq: 0.9 }), false, `(e) ${session}`);
assert.equal(postTacticalNeedsDriftRefresh({ ...snapshot, tacticalFuturesCheckedAt: iso(clock - MIN) }, 'POST', clock, { nq: 0.9 }), false, '실패 후 확인 시각으로 30분 대기');
assert.equal(tacticalFuturesDrifted({ nq: 0.4 }, { nq: 0.7 }), true, '정확히 0.3pp');
assert.equal(tacticalFuturesDrifted({ es: -0.3 }, { es: -0.7 }), true, 'ES만 변동');
assert.equal(tacticalFuturesDrifted({ nq: 0.149 }, { nq: 0.15 }), true, '보합 → 상승, 차이가 작아도 대상');
assert.equal(tacticalFuturesDrifted({ nq: 0.15 }, { nq: 0.149 }), true, '상승 → 보합');
assert.equal(tacticalFuturesDrifted({ nq: 0.2 }, { nq: -0.2 }), true, '부호 전환');
assert.equal(tacticalFuturesDrifted({ nq: 0 }, { es: 0.9 }), false, '동일 선물의 두 유효 관측만 비교');
assert.equal(tacticalFuturesDrifted({ nq: NaN }, { nq: 0.9 }), false);
assert.equal(tacticalFuturesDrifted({ nq: 0 }, { nq: Infinity }), false);
assert.equal(promptFuturesPct('INDEX_FACTS: invalid'), undefined);
assert.equal(promptFuturesPct('INDEX_FACTS: {}'), undefined);
assert.deepEqual(promptFuturesPct('INDEX_FACTS: [{"id":"nq","kind":"futures","chgPct":0.123},{"id":"es","kind":"futures","chgPct":-0.2},{"id":"nasdaq","kind":"spot","chgPct":1.2}]'), { nq: 0.123, es: -0.2 });
for (const pct of [-0.2, -0.15, -0.149, -0.106, -0.1, -0.001, 0, 0.1, 0.149, 0.15, 0.2]) {
    const old = Math.abs(Math.round(pct * 10) / 10) <= 0.1;
    assert.equal(tacticalFuturesDirection(pct) === 0, old, `기존 보합 경계 그대로 ${pct}`);
}
assert.equal(POST_TACTICAL_DRIFT_PP, 0.3);
assert.equal(POST_TACTICAL_REFRESH_MS, 30 * MIN);
assert.equal(POST_TACTICAL_MAX_REFRESHES, 8);

const store = new Map<string, any>();
const budgets = new Map<string, { count: number; at: number }>();
let budgetFails = false;
class OfflineRedis {
    async get(key: string) { return store.get(key) ?? null; }
    async set(key: string, value: string) { store.set(key, JSON.parse(value)); }
    async eval(script: string, keys: string[], args: number[]) {
        // 저장 전 읽기·판정을 하나의 명령으로 모의한다. 실제 Redis/Lua 통신 없음.
        assert.equal(script, POST_TACTICAL_REFRESH_LUA);
        assert.match(script, /state.count >= tonumber\(ARGV\[3\]\)/);
        assert.match(script, /now - state.at < tonumber\(ARGV\[2\]\)/);
        assert.match(script, /redis.call\('SET'.*'EX', 86400\)/);
        if (budgetFails) throw new Error('offline reservation failure');
        const [now, interval, cap] = args;
        const state = budgets.get(keys[0]) ?? { count: 0, at: 0 };
        if (state.count >= cap || now - state.at < interval) return 0;
        budgets.set(keys[0], { count: state.count + 1, at: now });
        return 1;
    }
}
const mock = (id: string, exports: unknown) => {
    const filename = require.resolve(id);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
};
mock('@upstash/redis', { Redis: OfflineRedis });
mock('../src/lib/sessionArchive', { readSessionArchive: async () => null, saveSessionArchive: async () => false });
const { IntelligenceNode: N, _resetInsightStateForTest, _setMarketClockForTest, _setModelCallerForTest } = require('../src/services/guardian/intelligenceNode') as typeof import('../src/services/guardian/intelligenceNode');
const refs = { nq: { symbol: 'NQ=F' as const, sessionDate: '2026-10-27', price: 100, asOf: '2026-10-27T20:00:00Z' },
    es: { symbol: 'ES=F' as const, sessionDate: '2026-10-27', price: 100, asOf: '2026-10-27T20:00:00Z' } };
let nq = 0, es = 0;
const basis = () => {
    const at = iso(clock - MIN);
    return buildMarketIndexBasis({
        nasdaq: { symbol: '^IXIC', price: 100, changePct: 1.2, marketTime: '2026-10-27T19:59:00Z', source: 'YAHOO' },
        spx: { symbol: '^GSPC', price: 100, changePct: 0.6, marketTime: '2026-10-27T19:59:00Z', source: 'YAHOO' },
        nq: { symbol: 'NQ=F', price: 100 + nq, changePct: 7, marketTime: at, lastChangeAt: at, source: 'YAHOO' },
        es: { symbol: 'ES=F', price: 100 + es, changePct: -7, marketTime: at, lastChangeAt: at, source: 'YAHOO' },
    }, clock, refs);
};
const tail = {
    ko: '오늘 시장을 움직인 거시 원인은 미확인입니다. 감마 방어의 충격 흡수력도 미확인입니다. 다음 확인 기준은 미확인입니다.',
    en: 'The macro cause today is unconfirmed. Dealer gamma absorption is unconfirmed. The next test is unconfirmed.',
    ja: '今日のマクロ要因は未確認です。ガンマによる圧力吸収も未確認です。次の確認基準は未確認です。',
};
const flat = {
    ko: `10/27(화) 정규장에서 나스닥 종합은 1.2%, S&P 500은 0.6% 올랐고, 그 종가 이후 지금 나스닥 100 선물은 보합, S&P 500 선물도 보합입니다. ${tail.ko}`,
    en: `In the 10/27 (Tue) cash session the Nasdaq Composite rose 1.2% and the S&P 500 rose 0.6%, and since that close Nasdaq 100 futures are now flat and S&P 500 futures are flat. ${tail.en}`,
    ja: `10/27(火)の通常取引でナスダック総合は1.2%、S&P 500は0.6%上昇し、その終値以降、ナスダック100先物は現在横ばい、S&P 500先物も横ばいです。${tail.ja}`,
};
const moved = {
    ko: `10/27(화) 정규장에서 나스닥 종합은 1.2%, S&P 500은 0.6% 올랐고, 그 종가 이후 지금 나스닥 100 선물은 0.9%, S&P 500 선물은 0.5% 올랐습니다. ${tail.ko}`,
    en: `In the 10/27 (Tue) cash session the Nasdaq Composite rose 1.2% and the S&P 500 rose 0.6%, and since that close Nasdaq 100 futures are now up 0.9% and S&P 500 futures are up 0.5%. ${tail.en}`,
    ja: `10/27(火)の通常取引でナスダック総合は1.2%、S&P 500は0.6%上昇し、その終値以降、ナスダック100先物は現在0.9%、S&P 500先物は0.5%上昇です。${tail.ja}`,
};
let modelCalls = 0, failModel = false, invalidModel = false;
let reply = flat;
const ctx = () => ({ locale: 'ko' as const, rlsiScore: 38, nasdaqChange: 1.2, vectors: [], vix: 17.5, indexBasis: basis() });
const makeSnapshot = () => ({ ...snapshot, _workerTimestamp: iso(clock), rlsi: { score: 38, session: 'POST' },
    market: { nqChangePercent: 1.2, vix: 17.5, indexBasis: basis() }, sectors: [{ id: 'XLK' }],
    verdict: { title: 'TACTICAL INSIGHT', sentiment: 'NEUTRAL', description: 'rotation-preserved', gammaInsight: 'gamma-preserved', realityInsight: flat.ko,
        num: { tpl: { description: 'rotation-preserved', realityInsight: flat.ko }, basis: { description: { RLSI: 38 }, realityInsight: { RLSI: 38 } } } } });

async function main() {
    process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'offline-placeholder';
    process.env.AWS_ACCESS_KEY_ID = 'offline-placeholder';
    const realNow = Date.now;
    Date.now = () => clock;
    _setMarketClockForTest(() => new Date(clock));
    _setModelCallerForTest(async opts => {
        modelCalls++;
        if (opts.maxRetries === 1) assert.equal(opts.allowLastResort, false, '추가 생성은 내부 반복 호출 제한');
        if (failModel) throw new Error('offline model failure');
        return { text: invalidModel ? JSON.stringify({ ko: 'invalid', en: 'invalid', ja: 'invalid' }) : JSON.stringify(reply), model: 'mock', usedFallback: false, elapsedMs: 0 } as any;
    });
    try {
        // 세션 합산·동시 예약·다음 ET 날짜 초기화·예약 장애. 모델 호출 전 차감.
        const redis = new OfflineRedis();
        const t0 = Date.parse('2026-10-27T20:00:00Z');
        assert.deepEqual(await Promise.all([reservePostTacticalRefresh(redis, t0), reservePostTacticalRefresh(redis, t0)]), [true, false]);
        for (let i = 1; i < 8; i++) assert.equal(await reservePostTacticalRefresh(redis, t0 + i * 30 * MIN), true);
        budgets.set('guardian:tactical:futures-refresh:2026-10-27', { count: 8, at: generatedAt });
        assert.equal(await reservePostTacticalRefresh(redis, clock), false, '(f) 8회 상한, 30분 경과해도 불가');
        assert.equal(await reservePostTacticalRefresh(redis, Date.parse('2026-10-28T20:00:00Z')), true, '다음 ET 세션 초기화');
        budgetFails = true;
        assert.equal(await reservePostTacticalRefresh(redis, clock), false, '예약 장애 시 호출 금지');
        budgetFails = false; budgets.clear();

        for (const id of [
            '../src/services/guardian/sectorEngine', '../src/services/macroHubProvider', '../src/services/guardian/rvolEngine',
            '../src/services/massiveClient', '../src/services/guardian/gammaShieldEngine', '../src/services/guardian/breadthEngine',
            '../src/services/indexBreadth', 'next/server', '../src/lib/cache/staleLock',
        ]) mock(id, {});
        mock('../src/services/guardian/rlsiEngine', { getMarketSession: () => 'POST' });
        mock('../src/services/marketIndexBasis', { loadMarketIndexBasis: async () => basis() });
        mock('../src/services/redisClient', { getFromCache: async (key: string) => store.get(key) ?? null,
            setInCache: async (key: string, value: any) => { store.set(key, value); return true; } });
        mock('../src/services/guardian/guardianCore', { CORE_KEY: 'offline:core' });
        const { GuardianDataHub: Hub } = require('../src/services/guardian/unifiedDataStream');

        for (const cold of [false, true]) {
            store.clear(); budgets.clear(); _resetInsightStateForTest(); modelCalls = 0; nq = es = 0; reply = flat;
            clock = generatedAt;
            const text = await N.generateRealityInsight(ctx());
            assert.equal(text, flat.ko);
            assert.deepEqual(N.tacticalFuturesPct('ko', text), { nq: 0, es: 0 }, '실제 생성 재료 기록');
            assert.deepEqual(store.get('guardian:gemini:v3:reality:ko').futuresPct, { nq: 0, es: 0 });
            clock = Date.parse('2026-10-27T20:50:00Z');
            const previous = makeSnapshot();
            store.set('guardian:snapshot:ko', previous);
            nq = 0.9; es = 0.5; reply = moved;
            if (cold) _resetInsightStateForTest();
            const after = await Hub.computeGuardianSnapshot(false, 'ko');
            assert.equal(after.verdict.realityInsight, moved.ko, '실제 Redis 스냅샷 반환 경로에서 보합 교체');
            assert.equal(modelCalls, 2, '최초 생성 + 추가 생성 1회');
            assert.deepEqual(Object.keys(after.tacticalFuturesPct).sort(), ['es', 'nq']);
            assert.ok(Math.abs(after.tacticalFuturesPct.nq - 0.9) < 1e-10, '정산 대비 7%가 아닌 종가 대비 값');
            assert.equal(after.verdict.description, previous.verdict.description);
            assert.equal(after.verdict.gammaInsight, previous.verdict.gammaInsight);
            assert.deepEqual(after.verdict.num.basis.description, previous.verdict.num.basis.description);
            // 다른 언어는 이미 저장된 같은 생성의 글 사용, 새 예약·모델 호출 없음.
            const jaSnap = { ...previous, verdict: { ...previous.verdict, realityInsight: flat.ja } };
            store.set('guardian:snapshot:ja', jaSnap);
            if (cold) _resetInsightStateForTest();
            const ja = await Hub.computeGuardianSnapshot(false, 'ja');
            assert.equal(ja.verdict.realityInsight, moved.ja);
            assert.equal(modelCalls, 2);
            // 빠른 추가 변동은 스냅샷·모델 모두 재생성하지 않는다.
            clock += MIN; nq = 1.8;
            const recent = store.get('guardian:snapshot:ko'); recent._workerTimestamp = iso(clock);
            assert.equal((await Hub.computeGuardianSnapshot(false, 'ko')).verdict.realityInsight, moved.ko);
            assert.equal(modelCalls, 2);
        }

        // 메모리 스냅샷 캐시도 같은 판정을 탄다. 바로 앞 Redis hit가 메모리를 채운다.
        store.clear(); budgets.clear(); _resetInsightStateForTest(); modelCalls = 0;
        clock = Date.parse('2026-10-27T20:50:00Z'); nq = es = 0;
        store.set('guardian:snapshot:en', { ...makeSnapshot(), verdict: { ...makeSnapshot().verdict, realityInsight: flat.en } });
        await Hub.computeGuardianSnapshot(false, 'en');
        store.delete('guardian:snapshot:en'); nq = 0.9; es = 0.5; reply = moved;
        assert.equal((await Hub.computeGuardianSnapshot(false, 'en')).verdict.realityInsight, moved.en);
        assert.equal(modelCalls, 1, '메모리 경로 추가 생성 1회');

        // 옛 스냅샷은 실제 캐시 반환 경로에서도 기존 동작 유지.
        store.clear(); budgets.clear(); _resetInsightStateForTest(); modelCalls = 0;
        const legacy = makeSnapshot() as any;
        delete legacy.tacticalFuturesPct;
        store.set('guardian:snapshot:ko', legacy);
        assert.equal((await Hub.computeGuardianSnapshot(false, 'ko')).verdict.realityInsight, flat.ko);
        assert.equal(modelCalls, 0, '옛 스냅샷은 변동 재생성 없음');

        // 같은 POST·같은 변화율이라도 전 거래일 캐시는 현재 세션의 생성 결과로 공유하지 않는다.
        store.clear(); budgets.clear(); _resetInsightStateForTest(); modelCalls = 0;
        nq = 0.9; es = 0.5; reply = moved;
        store.set('guardian:gemini:v3:reality:ko', { text: moved.ko.replace('10/27', '10/26'),
            updatedAt: '2026-10-26T20:50:00Z', session: 'POST', futures: true, futuresPct: { nq: 0.9, es: 0.5 } });
        store.set('guardian:snapshot:ko', makeSnapshot());
        assert.equal((await Hub.computeGuardianSnapshot(false, 'ko')).verdict.realityInsight, moved.ko);
        assert.equal(modelCalls, 1, 'ET 날짜가 다른 저장본은 재생성');

        for (const failure of ['throw', 'invalid', 'budget', 'reservation']) {
            store.clear(); budgets.clear(); _resetInsightStateForTest(); modelCalls = 0;
            clock = Date.parse('2026-10-27T22:00:00Z'); nq = 0.9; es = 0.5; // 선물 휴식(17~18 ET) 뒤
            const previous = makeSnapshot(); store.set('guardian:snapshot:ko', previous);
            failModel = failure === 'throw'; invalidModel = failure === 'invalid'; budgetFails = failure === 'reservation';
            if (failure === 'budget') budgets.set('guardian:tactical:futures-refresh:2026-10-27', { count: 8, at: generatedAt });
            const after = await Hub.computeGuardianSnapshot(false, 'ko');
            assert.equal(after.verdict.realityInsight, flat.ko, `${failure}: 기존 글 그대로`);
            assert.deepEqual(after.tacticalFuturesPct, previous.tacticalFuturesPct, '실패 시 생성 기준 유지');
            assert.equal(after.tacticalFutures, true, '실패가 5분 T2 재시도로 바뀌지 않음');
            assert.equal(after.tacticalFuturesCheckedAt, iso(clock));
            assert.equal(modelCalls, ['budget', 'reservation'].includes(failure) ? 0 : 1, '실패 후 즉시 교정·단일언어·번역 호출 없음');
            failModel = invalidModel = budgetFails = false;
            clock += 29 * MIN; store.get('guardian:snapshot:ko')._workerTimestamp = iso(clock);
            if (failure === 'throw') _resetInsightStateForTest();
            assert.equal((await Hub.computeGuardianSnapshot(false, 'ko')).verdict.realityInsight, flat.ko);
            const beforeRetry = modelCalls;
            clock += MIN; reply = moved; store.get('guardian:snapshot:ko')._workerTimestamp = iso(clock);
            const retry = await Hub.computeGuardianSnapshot(false, 'ko');
            assert.equal(retry.verdict.realityInsight, failure === 'budget' ? flat.ko : moved.ko, '정확히 30분 뒤 재시도');
            assert.equal(modelCalls, beforeRetry + (failure === 'budget' ? 0 : 1));
        }
        console.log('통과 POST drift (a)~(f), 보합 경계, Redis·메모리·콜드 스타트, 언어 공유, 실패 보존·30분 재시도·합산 상한');
    } finally { Date.now = realNow; _setModelCallerForTest(null); _setMarketClockForTest(null); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
