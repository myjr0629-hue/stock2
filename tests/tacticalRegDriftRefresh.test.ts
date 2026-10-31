/**
 * T35-B (10/31 KST) 장중(REG) Tactical 정기 재생성 — 개장 직후 글이 장중 내내 굳지 않게.
 *   10/30 실측: 워커 도장 구조 때문에 장중엔 재계산이 없어, 나스닥이 −2.5% → −3.4% 로 밀려도 생성 때 글이 남았다(대기 문구만 T35 가 풀었다).
 *   조건: 마지막 생성 30분 경과 && (나스닥·S&P 변화 0.5%p 이상 또는 RLSI 5 이상) · ET 날짜 공용 예약 30분 간격·8회·실패 60분 대기·연속 2회 중지.
 *   실패하면 기존 글 유지. 다른 언어는 저장본 채택(모델 0). 모델·Redis·코어는 메모리 모의(네트워크 0).
 */
import assert from 'node:assert/strict';
import Module from 'node:module';
import {
    regTacticalDrift, regTacticalNeedsRefresh, regTacticalCurrent, regTacticalGeneratedAt,
    REG_TACTICAL_REFRESH_MS, REG_TACTICAL_INDEX_PP, REG_TACTICAL_RLSI_PTS, REG_TACTICAL_MAX_REGEN_ATTEMPTS, REG_TACTICAL_RETRY_MS,
} from '../src/lib/ai/tacticalIndexFacts';
import {
    POST_TACTICAL_REFRESH_LUA, POST_TACTICAL_REFRESH_RESULT_LUA, reserveRegTacticalRefresh, finishRegTacticalRefresh, reservePostTacticalRefresh,
} from '../src/lib/ai/postTacticalRefreshBudget';

const MIN = 60_000;
const now = Date.parse('2026-10-30T17:40:00Z');   // 13:40 ET 금요일 — 정규장
const iso = (at: number) => new Date(at).toISOString();
const PENDING = '[진단] 최신 시장 분석을 준비하고 있습니다\n[결론] 잠시 후 자동으로 갱신됩니다';
const isPh = (t: string) => t.includes('준비하고 있습니다');
const TEXT = '지금 정규장에서 나스닥 종합은 전일 종가 대비 2.5%, S&P500은 1.6% 하락 중입니다. 오늘 시장 전체를 움직인 뚜렷한 재료는 확인되지 않았습니다. 시장 건강도(RLSI 33)가 약해 반등을 받칠 힘이 부족하고, 옵션 포지션(GEX 27)은 흔들림을 받쳐 줍니다. 다음 분기점은 10/30(금) 15:30 ET(한국 04:30) 예정된 CFTC 원유 투기적 순포지션입니다.';
// 운영 10/30 ko 스냅샷 모양: 생성 기준 NDX_CHG −2.5·SPX −1.6·RLSI 33 → 지금 −3.4·−2.1·30
const snap = (o: { at?: number; text?: string; basis?: any; nq?: number; spx?: number; rlsi?: number; seen?: number; session?: string } = {}) => ({
    timestamp: iso(o.at ?? now - 40 * MIN), _workerTimestamp: iso(now - 5_000), _source: 'ec2-worker',
    ...(o.seen ? { tacticalGeneratedAt: iso(o.seen) } : {}),
    rlsi: { score: o.rlsi ?? 30, session: o.session ?? 'REG' }, sectors: [{ id: 'XLK' }],
    market: { nqChangePercent: o.nq ?? -3.4, factors: { spx: { chgPct: o.spx ?? -2.1 } } },
    verdict: { title: 'TACTICAL INSIGHT', sentiment: 'NEUTRAL', description: '순환매 정상 글', gammaInsight: '감마 정상 글', realityInsight: o.text ?? TEXT,
        num: { tpl: { realityInsight: (o.text ?? TEXT) }, basis: { realityInsight: o.basis === undefined ? { NDX_CHG: -2.5, SPX_CHG: -1.6, RLSI: 33 } : o.basis } } },
});

// ── ① 판정 함수(입출력 0) ──
assert.equal(REG_TACTICAL_REFRESH_MS, 30 * MIN);
assert.equal(REG_TACTICAL_INDEX_PP, 0.5);
assert.equal(REG_TACTICAL_RLSI_PTS, 5);
assert.equal(REG_TACTICAL_MAX_REGEN_ATTEMPTS, 8);
assert.deepEqual(regTacticalNeedsRefresh(snap(), 'REG', now, isPh), ['nasdaq', 'spx'], '운영 재현: 40분 전 글 · 나스닥 0.9%p·S&P 0.5%p');
assert.deepEqual(regTacticalNeedsRefresh(snap({ at: now - 30 * MIN }), 'REG', now, isPh), ['nasdaq', 'spx'], '정확히 30분');
assert.deepEqual(regTacticalNeedsRefresh(snap({ at: now - 30 * MIN + 1 }), 'REG', now, isPh), [], '30분 안');
assert.deepEqual(regTacticalNeedsRefresh(snap({ nq: -2.9, spx: -1.2, rlsi: 37 }), 'REG', now, isPh), [], '0.4%p·0.4%p·RLSI 4 — 문턱 아래');
assert.deepEqual(regTacticalNeedsRefresh(snap({ nq: -2.0, spx: -1.6, rlsi: 33 }), 'REG', now, isPh), ['nasdaq'], '반등 방향 0.5%p 도');
assert.deepEqual(regTacticalNeedsRefresh(snap({ nq: -2.5, spx: -1.6, rlsi: 28 }), 'REG', now, isPh), ['rlsi'], 'RLSI 5 하락');
assert.deepEqual(regTacticalNeedsRefresh(snap({ nq: -2.5, spx: -1.6, rlsi: 38 }), 'REG', now, isPh), ['rlsi'], 'RLSI 5 상승');
assert.deepEqual(regTacticalNeedsRefresh(snap({ text: PENDING }), 'REG', now, isPh), [], '대기 문구는 T35 경로가 맡는다');
for (const s of ['PRE', 'POST', 'CLOSED']) assert.deepEqual(regTacticalNeedsRefresh(snap({ session: s }), s, now, isPh), [], `${s} 는 대상 아님`);
assert.deepEqual(regTacticalNeedsRefresh(snap({ basis: null }), 'REG', now, isPh), ['no-basis'], '생성 기준 없는 글 — 비교 불가면 오래된 글로 대상(예약이 상한, 관문 10310831 ③)');
assert.deepEqual(regTacticalNeedsRefresh(snap({ seen: now - 10 * MIN }), 'REG', now, isPh), [], '채택한 글의 생성 시각(tacticalGeneratedAt) 기준 10분 — 대상 아님');
assert.equal(regTacticalGeneratedAt(snap({ seen: now - 10 * MIN })), now - 10 * MIN);
assert.deepEqual(regTacticalDrift({ NDX_CHG: 0.1 }, { NDX_CHG: 0.6 }), ['nasdaq'], '부동소수 0.5 경계');
assert.deepEqual(regTacticalDrift({ NDX_CHG: NaN, RLSI: 40 }, { NDX_CHG: -9, RLSI: undefined }), []);
assert.deepEqual(regTacticalCurrent(snap()), { NDX_CHG: -3.4, SPX_CHG: -2.1, RLSI: 30 });
assert.deepEqual(regTacticalNeedsRefresh(null, 'REG', now, isPh), []);
// 관문 10310455 «워커가 옛 스냅샷에 도장만 찍어 숫자도 옛 값» 반론 — 운영 실측: 응답 출구가 공유 코어로 숫자를 덮어(overlayCore) 워커가 그 응답을 다시 쓴다.
//   Upstash guardian:snapshot:lastgood:ko (읽기만, 10/31 04:44 KST): 계산 18:03:51Z 그대로인데 coreAt 19:43:54Z·S&P 갱신 19:42:37Z·나스닥 −4.49(생성 기준 −3.86)
const live = { timestamp: '2026-10-30T18:03:51.409Z', _workerTimestamp: '2026-10-30T19:44:08.384Z', coreAt: '2026-10-30T19:43:54.312Z',
    rlsi: { score: 32.5, session: 'REG' }, market: { nqChangePercent: -4.490562208240308, factors: { spx: { chgPct: -2.1246413257246024 } } },
    verdict: { realityInsight: TEXT, num: { basis: { realityInsight: { NDX_CHG: -3.8554563290711044, SPX_CHG: -2.060160557113841, RLSI: 32.9 } } } } };
assert.deepEqual(regTacticalNeedsRefresh(live, 'REG', Date.parse('2026-10-30T19:44:10Z'), isPh), ['nasdaq'], '운영 스냅샷 그대로 — 나스닥 0.63%p → 재생성 대상');

// ── ② 공용 예약(장후 변동과 같은 Lua, 다른 키) ──
const store = new Map<string, any>();
const expiry = new Map<string, number>();
const budgets = new Map<string, { count: number; at: number; failures?: number; retryAt?: number }>();
let budgetFails = false;
let getFails = false;
const evalKeys: string[] = [];
class OfflineRedis {
    async get(k: string) { if (getFails) throw new Error('offline read failure'); if ((expiry.get(k) ?? Infinity) <= Date.now()) { store.delete(k); expiry.delete(k); } return store.get(k) ?? null; }
    async set(k: string, v: any, opts?: { nx?: boolean; ex?: number }) {
        if (opts?.nx && (await this.get(k)) !== null) return null;
        store.set(k, typeof v === 'string' ? JSON.parse(v) : v);
        if (opts?.ex) expiry.set(k, Date.now() + opts.ex * 1000);
        return 'OK';
    }
    async eval(script: string, keys: string[], args: number[]) {
        evalKeys.push(keys[0]);
        if (budgetFails) throw new Error('offline reservation failure');
        if (script === POST_TACTICAL_REFRESH_RESULT_LUA) {
            const [at, succeeded, finishedAt, interval, cooldown] = args;
            const state = budgets.get(keys[0]);
            if (!state || state.at !== at) return 0;
            if (succeeded) state.failures = 0;
            state.retryAt = succeeded ? state.at + interval : finishedAt + cooldown;
            return 1;
        }
        assert.equal(script, POST_TACTICAL_REFRESH_LUA);
        const [t, interval, cap, cooldown, maxFailures] = args;
        const state = budgets.get(keys[0]) ?? { count: 0, at: 0 };
        const failures = state.failures ?? 0;
        if (state.count >= cap || failures >= maxFailures || t < (state.retryAt ?? state.at + interval)) return 0;
        budgets.set(keys[0], { count: state.count + 1, at: t, failures: failures + 1, retryAt: t + cooldown });
        return 1;
    }
}

(async () => {
    const realNow = Date.now;
    try {
        const r = new OfflineRedis();
        Date.now = () => now;
        assert.equal(await reserveRegTacticalRefresh(r, now), true);
        assert.equal(evalKeys[0], 'guardian:tactical:reg-refresh:2026-10-30', 'ET 날짜 공용 키(장후 키와 다름)');
        assert.equal(await reserveRegTacticalRefresh(r, now + 1_000), false, '진행 중(잠정 실패) — 겹치지 않음');
        await finishRegTacticalRefresh(r, now, true, now + 20_000);
        assert.equal(await reserveRegTacticalRefresh(r, now + 30 * MIN - 1), false, '성공 뒤 30분 안');
        assert.equal(await reserveRegTacticalRefresh(r, now + 30 * MIN), true, '30분 뒤');
        await finishRegTacticalRefresh(r, now + 30 * MIN, false, now + 31 * MIN);
        assert.equal(await reserveRegTacticalRefresh(r, now + 60 * MIN), false, '실패 뒤 60분 대기');
        assert.equal(await reserveRegTacticalRefresh(r, now + 91 * MIN), true);
        await finishRegTacticalRefresh(r, now + 91 * MIN, false, now + 92 * MIN);
        assert.equal(await reserveRegTacticalRefresh(r, now + 200 * MIN), false, '연속 2회 실패 → 그날 중지');
        // 8회 상한(성공만 이어질 때)
        budgets.clear();
        let ok = 0;
        for (let i = 0; i < 12; i++) { const t = Date.parse('2026-10-30T13:31:00Z') + i * 31 * MIN; if (await reserveRegTacticalRefresh(r, t)) { ok++; await finishRegTacticalRefresh(r, t, true, t + 10_000); } }
        assert.equal(ok, 8, 'ET 날짜당 8회(3언어 1호출 = 언어별 8회)');
        assert.equal(await reserveRegTacticalRefresh(null, now), false, '예약 저장소 없음 → 재생성 0');
        budgetFails = true;
        assert.equal(await reserveRegTacticalRefresh(r, now), false, '예약 저장소 장애 → 재생성 0');
        budgetFails = false;
        assert.equal(await reserveRegTacticalRefresh(r, Date.parse('2026-10-30T21:00:00Z')), false, '장후(POST)엔 REG 예약 없음');
        budgets.clear();
        assert.equal(await reservePostTacticalRefresh(r, Date.parse('2026-10-30T21:00:00Z')), true, '장후 예약은 기존 그대로(키 분리)');

        // ── ③ 스냅샷 반환 경로(computeGuardianSnapshot) ──
        const mock = (id: string, exports: unknown) => {
            const filename = require.resolve(id);
            require.cache[filename] = { id: filename, filename, loaded: true, exports } as Module;
        };
        let coreCalls = 0;
        process.env.UPSTASH_REDIS_REST_URL = 'https://offline.invalid'; process.env.UPSTASH_REDIS_REST_TOKEN = 'offline';
        mock('@upstash/redis', { Redis: OfflineRedis });
        mock('../src/lib/sessionArchive', { readSessionArchive: async () => null, saveSessionArchive: async () => false });
        for (const id of ['../src/services/guardian/sectorEngine', '../src/services/macroHubProvider', '../src/services/guardian/rvolEngine',
            '../src/services/massiveClient', '../src/services/guardian/gammaShieldEngine', '../src/services/guardian/breadthEngine',
            '../src/services/indexBreadth', 'next/server', '../src/lib/cache/staleLock']) mock(id, {});
        mock('../src/services/guardian/rlsiEngine', { getMarketSession: () => 'REG' });
        mock('../src/services/marketIndexBasis', { loadMarketIndexBasis: async () => null });
        mock('../src/services/redisClient', { getFromCache: async (k: string) => store.get(k) ?? null, setInCache: async (k: string, v: any) => { store.set(k, v); return true; } });
        mock('../src/services/guardian/guardianCore', { CORE_KEY: 'offline:core', getSharedCore: async () => { coreCalls++; return null; } });
        const hubMod = require('../src/services/guardian/unifiedDataStream') as typeof import('../src/services/guardian/unifiedDataStream');
        const { IntelligenceNode } = require('../src/services/guardian/intelligenceNode') as typeof import('../src/services/guardian/intelligenceNode');
        const { GuardianDataHub: Hub, _resetGuardianHubStateForTest: resetHub, keepRegTacticalOnFailure, settleRegTacticalRefresh } = hubMod;
        const call = (locale: 'ko' | 'en' | 'ja' = 'ko') => (Hub as any).computeGuardianSnapshot(false, locale);
        const fresh = (s: any, locale = 'ko') => { store.clear(); expiry.clear(); budgets.clear(); resetHub(); coreCalls = 0; store.set(`guardian:snapshot:${locale}`, s); };

        // 운영 재현: 워커 도장 5초 전(신선) · 40분 전 글 · 나스닥 −2.5 → −3.4 → 다시 계산(예전엔 재계산 0)
        const s0 = snap();
        fresh(s0);
        const out0 = await call();
        assert.equal(coreCalls, 1, '정기 재생성 → 운영 생성 경로(재계산) 진입');
        assert.equal(out0, s0, '재계산 실패(코어 없음) → 기존 스냅샷·기존 글 그대로');
        const st = budgets.get('guardian:tactical:reg-refresh:2026-10-30')!;
        assert.equal(st.count, 1);
        assert.ok(st.retryAt! >= now + 60 * MIN, '실패 기록 → 60분 대기');
        // 같은 스냅샷을 다른 언어·인스턴스가 바로 봐도 예약이 거절돼 호출 0(공용 30분/실패 대기)
        resetHub(); store.set('guardian:snapshot:en', snap()); coreCalls = 0;
        await call('en');
        assert.equal(coreCalls, 0, '공용 예약 거절 → 재계산 0');
        // 같은 인스턴스는 5분 안에 예약을 다시 묻지 않는다
        evalKeys.length = 0; budgets.clear();
        fresh(snap()); await call(); const asked = evalKeys.length; await call();
        assert.equal(evalKeys.length, asked, '5분 안 재질의 0');
        assert.equal(REG_TACTICAL_RETRY_MS, 5 * MIN);
        // 관문 10310544 — 워커 도장 46초(신선 아님)면 정기 재생성 예약 없이 main 의 기존 재계산 경로(예약·실패 예산 0)
        {
            const old46 = { ...snap(), _workerTimestamp: iso(now - 46_000) };
            fresh(old46); evalKeys.length = 0;
            await assert.rejects(call(), /shared core unavailable/, '코어 없음 → main 과 같은 기존 재계산 예외(이 브랜치가 바꾸지 않은 경로)');
            assert.equal(coreCalls, 1, '기존 45초 재계산');
            assert.equal(evalKeys.length, 0, '예약 질의 0');
            assert.equal(budgets.size, 0, '실패 예산 소비 0');
        }
        // 관문 10310531 — 스냅샷 숫자가 생성 기준과 같아도(덮어쓰기 없음 가정) 공유 코어의 지금 값이 움직였으면 재생성
        {
            const flat = snap({ nq: -2.5, spx: -1.6, rlsi: 33 });
            fresh(flat);
            assert.deepEqual(regTacticalNeedsRefresh(flat, 'REG', now, isPh), [], '스냅샷 값만 보면 변화 0');
            store.set('offline:core', { timestamp: iso(now), market: { nqChangePercent: -3.4, factors: { spx: { chgPct: -2.1 } } }, rlsi: { score: 30, session: 'REG' } });
            await call();
            assert.equal(coreCalls, 1, '코어 값(나스닥 −3.4) 기준 → 재계산 진입');
            fresh(flat);
            store.set('offline:core', { timestamp: iso(now), market: { nqChangePercent: -2.6, factors: { spx: { chgPct: -1.7 } } }, rlsi: { score: 32 } });
            await call();
            assert.equal(coreCalls, 0, '코어 값도 문턱 아래 → 0');
            // 관문 10310843 ② 코어에 지수 칸이 비면 그 칸은 스냅샷 값으로
            fresh(snap({ nq: -3.4, spx: -2.1, rlsi: 33 }));
            store.set('offline:core', { timestamp: iso(now), market: { factors: {} }, rlsi: { score: 33, session: 'REG' } });
            await call();
            assert.equal(coreCalls, 1, '코어 지수 결측 → 스냅샷 −3.4 로 비교 → 재계산');
        }
        // 변화가 문턱 아래·30분 안·대기 문구·기준 없음 → 재계산 0(워커 도장 신선 → 그대로 반환)
        for (const s of [snap({ nq: -2.8, spx: -1.8, rlsi: 31 }), snap({ at: now - 20 * MIN })]) {
            fresh(s); const out = await call();
            assert.equal(coreCalls, 0, '조건 밖 → 재계산 0'); assert.equal(out, s);
        }
        // 예약 저장소 장애 → 재계산 0(상한 미확인 호출 금지)
        budgetFails = true; fresh(snap()); await call(); assert.equal(coreCalls, 0, '예약 장애 → 0'); budgetFails = false;

        // ── ④ 실패 시 기존 글 유지 · 예약 결과는 «이번 예약 뒤 새로 만든 글»일 때만 성공(관문 10310437 P2 · 10310517 ①) ──
        const prev = snap({ seen: now - 45 * MIN });
        const NEWT = TEXT.replace('2.5%', '3.4%');
        const mk = (t: string): any => ({ timestamp: iso(now), verdict: { realityInsight: t, description: '새 순환매', num: { tpl: { description: 'd', realityInsight: t }, basis: { description: { RLSI: 30 }, realityInsight: { NDX_CHG: -3.4 } } } } });
        {   const next = mk(PENDING);
            assert.equal(settleRegTacticalRefresh(next, prev, now + 1, now), false, '대기 문구 → 실패');
            assert.equal(next.verdict.realityInsight, TEXT, '기존 장중 글 유지');
            assert.deepEqual(next.verdict.num.basis.realityInsight, { NDX_CHG: -2.5, SPX_CHG: -1.6, RLSI: 33 }, '생성 기준도 그대로');
            assert.equal(next.verdict.description, '새 순환매', '다른 칸은 새 계산 그대로');
            assert.equal(next.tacticalGeneratedAt, prev.tacticalGeneratedAt, '생성 시각도 옛 글 것'); }
        {   const next = mk(NEWT);   // 다른 글이지만 이번 예약 전 시각(보관본·옛 저장본 복구)
            assert.equal(settleRegTacticalRefresh(next, prev, now - 50 * MIN, now), false, '복구 글 → 실패');
            assert.equal(next.verdict.realityInsight, TEXT, '복구 글 대신 기존 글 유지'); }
        {   const next = mk(TEXT);   // 이번 예약 뒤 새로 만든 글이 우연히 같은 문구(관문 10310524 ②)
            assert.equal(settleRegTacticalRefresh(next, prev, now + 1, now), true, '새로 만든 같은 문구 → 성공');
            const same = mk(TEXT);
            assert.equal(settleRegTacticalRefresh(same, prev, null, now), false, '메모리 글이 다른 글(동시 요청) → 실패(관문 10310524 ①)');
            assert.deepEqual(same.verdict.num.basis.realityInsight, { NDX_CHG: -2.5, SPX_CHG: -1.6, RLSI: 33 }, '같은 문구 복구 실패여도 생성 기준은 옛 글 것(관문 10310556)');
            assert.deepEqual(regTacticalNeedsRefresh({ ...same, rlsi: { score: 30, session: 'REG' }, market: { nqChangePercent: -3.4, factors: { spx: { chgPct: -2.1 } } } }, 'REG', now, isPh), ['nasdaq', 'spx'], '변화 감지 유지'); }
        {   const next = mk(NEWT);
            assert.equal(settleRegTacticalRefresh(next, prev, now + 5_000, now), true, '이번 예약 뒤 새 글 → 성공');
            assert.equal(next.verdict.realityInsight, NEWT);
            assert.equal(next.tacticalGeneratedAt, iso(now + 5_000), '새 글의 생성 시각'); }
        assert.equal(keepRegTacticalOnFailure({ verdict: { realityInsight: PENDING } }, snap({ text: PENDING })), false, '옛 글도 대기 문구면 손대지 않음');
        {   // 관문 10310849 ② 재생성 중 예외 → 대체 판정(정적 문구, Tactical 칸 없음)에도 기존 글 복원
            const fallbackVerdict: any = { verdict: { title: 'STABLE', description: '정적', sentiment: 'NEUTRAL' } };
            assert.equal(settleRegTacticalRefresh(fallbackVerdict, prev, null, now), false);
            assert.equal(fallbackVerdict.verdict.realityInsight, TEXT, 'Tactical 칸 복원');
            assert.deepEqual(fallbackVerdict.verdict.num.basis.realityInsight, { NDX_CHG: -2.5, SPX_CHG: -1.6, RLSI: 33 });
        }
        {   // 실패 기록이면 60분 대기(공용 Lua)
            budgets.clear();
            const t0 = now;
            assert.equal(await reserveRegTacticalRefresh(r, t0), true);
            await finishRegTacticalRefresh(r, t0, settleRegTacticalRefresh(mk(PENDING), snap(), t0 + 1, t0), t0 + 20_000);
            assert.equal(await reserveRegTacticalRefresh(r, t0 + 31 * MIN), false, '대기 문구 결과 = 실패 → 60분 대기');
        }

        // ── ⑤ 다른 언어 채택(모델 0): 저장소에 이 스냅샷이 본 글보다 새 장중 글 → 채택·생성 기준·본 시각 갱신 ──
        const NEW = TEXT.replace('2.5%', '3.4%');
        const orig = { latest: IntelligenceNode.latestStoredRegTacticalAt, adopt: IntelligenceNode.adoptStoredRegReality, nums: IntelligenceNode.numbersFor };
        let adoptCalls = 0;
        (IntelligenceNode as any).latestStoredRegTacticalAt = async () => now - 2 * MIN;
        let adoptCtx: any = null;
        (IntelligenceNode as any).adoptStoredRegReality = async (ctx: unknown, newerThan: number) => { adoptCalls++; adoptCtx = ctx; assert.equal(newerThan, Date.parse(snap({ at: now - 10 * MIN }).timestamp)); return { text: NEW, at: now - 2 * MIN, seenAt: now - 2 * MIN }; };
        (IntelligenceNode as any).numbersFor = () => ({ tpl: NEW, basis: { NDX_CHG: -3.4, SPX_CHG: -2.1, RLSI: 30 } });
        try {
            fresh(snap({ at: now - 10 * MIN }), 'ja');
            store.set('offline:core', { timestamp: iso(now), market: { indexBasis: null, factors: { spx: { chgPct: -2.1 }, us10y: { level: 4.94 } } }, rlsi: { score: 30, session: 'REG', components: { breadthPct: 26 } }, gammaShield: null, vectors: [], sectors: [], rotationIntensity: { topInflow: [], topOutflow: [] }, news: [], scheduledEvents: [] });
            store.set('guardian:ai_verdict:ja', { title: 'T', sentiment: 'NEUTRAL', description: '다른 요청이 방금 저장한 순환매', gammaInsight: '방금 저장한 감마', realityInsight: '옛 글', num: { tpl: { description: 'dd' }, basis: { description: { RLSI: 31 } } } });
            const adopted = await call('ja');
            assert.deepEqual([adoptCtx.spxChangePct, adoptCtx.us10y, adoptCtx.breadthPct], [-2.1, 4.94, 26], '채택 검사 재료에 장중 숫자 칸(SPX·US10Y·BREADTH) — 관문 10310813 ①');
            const av = store.get('guardian:ai_verdict:ja');
            assert.equal(av.realityInsight, '옛 글', '채택은 ai_verdict 를 쓰지 않는다(읽고-쓰기 경합 방지, 관문 10310825 ①)');
            assert.equal(av.description, '다른 요청이 방금 저장한 순환매');
            assert.equal(adoptCalls, 1);
            assert.equal(coreCalls, 0, '채택은 재계산·모델 0');
            assert.equal(adopted.verdict.realityInsight, NEW);
            assert.deepEqual(adopted.verdict.num.basis.realityInsight, { NDX_CHG: -3.4, SPX_CHG: -2.1, RLSI: 30 }, '새 글의 생성 기준');
            assert.equal(adopted.tacticalSeenAt, iso(now - 2 * MIN));
            assert.equal(adopted.tacticalGeneratedAt, iso(now - 2 * MIN), '채택한 글의 생성 시각');
            assert.notEqual(store.get('guardian:snapshot:ja').verdict.realityInsight, NEW, '스냅샷 저장소에는 쓰지 않음(워커가 응답을 다시 쓴다 — 관문 10310831 ①)');
            assert.deepEqual(regTacticalNeedsRefresh(adopted, 'REG', now, isPh), [], '채택 뒤 같은 글로 재생성 요청 없음');
            // 30초 안 재확인 없음
            const again = await call('ja'); assert.equal(adoptCalls, 1);
            assert.equal(again.verdict.realityInsight, NEW, '워커가 스냅샷을 다시 쓰기 전 같은 인스턴스의 다음 요청도 새 글(관문 10310901 ①)');
            assert.deepEqual(again.verdict.num.basis.realityInsight, { NDX_CHG: -3.4, SPX_CHG: -2.1, RLSI: 30 });
            assert.equal(again.verdict.description, '순환매 정상 글', '다른 칸은 스냅샷 그대로');
            // 관문 10310537 — 변화가 있어도 다른 언어·인스턴스의 새 장중 글이 있으면 예약·재계산 없이 채택
            {
                fresh(snap(), 'ja'); adoptCalls = 0; budgets.clear();
                store.set('offline:core', { timestamp: iso(now), market: { indexBasis: null, factors: {} }, rlsi: { score: 30, session: 'REG' }, gammaShield: null, vectors: [], sectors: [], rotationIntensity: { topInflow: [], topOutflow: [] }, news: [], scheduledEvents: [] });
                (IntelligenceNode as any).adoptStoredRegReality = async () => { adoptCalls++; return { text: NEW, at: now - 2 * MIN, seenAt: now - 2 * MIN }; };
                const out = await call('ja');
                assert.equal(coreCalls, 0, '재계산 0');
                assert.equal(budgets.size, 0, '예약 0(실패 예산 소비 없음)');
                assert.equal(adoptCalls, 1, '바로 채택');
                assert.equal(out.verdict.realityInsight, NEW);
            }
            // 관문 10310451 ② 저장본이 출구 검사에서 탈락하면 «본 시각»만 갱신 — 생성 시각은 그대로라 정기 재생성이 30분 밀리지 않는다
            (IntelligenceNode as any).adoptStoredRegReality = async () => ({ text: null, seenAt: now - 2 * MIN });   // 원문은 있는데 출구 검사 탈락(관문 10310504 ②)
            fresh(snap(), 'ko');
            store.set('offline:core', { timestamp: iso(now), market: { indexBasis: null, factors: {} }, rlsi: { score: 30, session: 'REG' }, gammaShield: null, vectors: [], sectors: [], rotationIntensity: { topInflow: [], topOutflow: [] }, news: [], scheduledEvents: [] });
            budgetFails = true;   // 이번 요청의 재생성 예약은 막고(채택 경로만 보게) …
            const rejected = await call('ko');
            budgetFails = false;
            assert.equal(rejected.tacticalSeenAt, iso(now - 2 * MIN), '본 시각 = 확인한 저장본 시각(같은 글을 30초마다 다시 읽지 않음)');
            assert.equal(rejected.tacticalGeneratedAt, undefined, '생성 시각은 그대로(스냅샷 계산 시각)');
            assert.deepEqual(regTacticalNeedsRefresh(rejected, 'REG', now, isPh), ['nasdaq', 'spx'], '변화가 있으면 여전히 재생성 대상');
            // 관문 10310843 ① 읽기 장애(seenAt 없음)는 «본 것»으로 적지 않는다
            (IntelligenceNode as any).adoptStoredRegReality = async () => ({ text: null });
            fresh(snap(), 'ko');
            store.set('offline:core', { timestamp: iso(now), market: { indexBasis: null, factors: {} }, rlsi: { score: 30, session: 'REG' }, gammaShield: null, vectors: [], sectors: [], rotationIntensity: { topInflow: [], topOutflow: [] }, news: [], scheduledEvents: [] });
            budgetFails = true;
            const outage = await call('ko');
            budgetFails = false;
            assert.equal(outage.tacticalSeenAt, undefined, '읽기 장애 → 본 시각 그대로');
            // 장중이 아니면 채택 확인 없음
            fresh(snap({ at: now - 10 * MIN, session: 'POST' }), 'ja'); adoptCalls = 0;
        } finally { Object.assign(IntelligenceNode, { latestStoredRegTacticalAt: orig.latest, adoptStoredRegReality: orig.adopt, numbersFor: orig.nums }); }
        {   // 관문 10310849 ① 실제 채택 함수: 원문 읽기 장애 → 본 시각 없음 · 원문은 있는데 세션·날짜가 맞지 않으면 그 시각을 «본 것»으로
            const ctx = { rlsiScore: 30, nasdaqChange: -3.4, vix: 21, locale: 'ko' as const, indexBasis: undefined };
            getFails = true;
            const r1 = await IntelligenceNode.adoptStoredRegReality(ctx as any, 0);
            getFails = false;
            assert.deepEqual(r1, { text: null }, '읽기 장애 → seenAt 없음');
            store.set('guardian:gemini:v3:reality:ko', { text: '옛 글', updatedAt: iso(now - 2 * MIN), session: 'PRE', basis: null });
            const r2 = await IntelligenceNode.adoptStoredRegReality(ctx as any, 0);
            assert.deepEqual(r2, { text: null, seenAt: now - 2 * MIN }, '원문 있음·세션 불일치 → 본 시각');
            store.set('guardian:gemini:v3:reality:ko', { text: '', updatedAt: iso(now - 1 * MIN), session: 'REG', basis: null });
            assert.deepEqual(await IntelligenceNode.adoptStoredRegReality(ctx as any, 0), { text: null, seenAt: now - 1 * MIN }, '본문 빈 저장본 → 본 시각(관문 10310855)');
        }
        console.log('통과 T35-B 장중 정기 재생성: 판정 경계·공용 예약(30분·8회·실패 대기·장애 0)·재계산 진입·실패 시 기존 글 유지·다른 언어 채택');
    } finally { Date.now = realNow; }
})().catch(e => { console.error(e); process.exitCode = 1; });
