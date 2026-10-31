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
const evalKeys: string[] = [];
class OfflineRedis {
    async get(k: string) { if ((expiry.get(k) ?? Infinity) <= Date.now()) { store.delete(k); expiry.delete(k); } return store.get(k) ?? null; }
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
        assert.equal(await reserveRegTacticalRefresh(r, now, 'ko'), true);
        assert.equal(evalKeys[0], 'guardian:tactical:reg-refresh:ko:2026-10-30', '언어별·ET 날짜 키(장후 키와 다름)');
        assert.equal(await reserveRegTacticalRefresh(r, now, 'en'), true, '다른 언어는 따로(언어별 8회)');
        assert.equal(await reserveRegTacticalRefresh(r, now + 1_000, 'ko'), false, '진행 중(잠정 실패) — 겹치지 않음');
        await finishRegTacticalRefresh(r, now, true, now + 20_000, 'ko');
        assert.equal(await reserveRegTacticalRefresh(r, now + 30 * MIN - 1, 'ko'), false, '성공 뒤 30분 안');
        assert.equal(await reserveRegTacticalRefresh(r, now + 30 * MIN, 'ko'), true, '30분 뒤');
        await finishRegTacticalRefresh(r, now + 30 * MIN, false, now + 31 * MIN, 'ko');
        assert.equal(await reserveRegTacticalRefresh(r, now + 60 * MIN, 'ko'), false, '실패 뒤 60분 대기');
        assert.equal(await reserveRegTacticalRefresh(r, now + 91 * MIN, 'ko'), true);
        await finishRegTacticalRefresh(r, now + 91 * MIN, false, now + 92 * MIN, 'ko');
        assert.equal(await reserveRegTacticalRefresh(r, now + 200 * MIN, 'ko'), false, '연속 2회 실패 → 그날 중지');
        // 8회 상한(성공만 이어질 때)
        budgets.clear();
        let ok = 0;
        for (let i = 0; i < 12; i++) { const t = Date.parse('2026-10-30T13:31:00Z') + i * 31 * MIN; if (await reserveRegTacticalRefresh(r, t, 'ko')) { ok++; await finishRegTacticalRefresh(r, t, true, t + 10_000, 'ko'); } }
        assert.equal(ok, 8, 'ET 날짜당 8회(3언어 1호출 = 언어별 8회)');
        assert.equal(await reserveRegTacticalRefresh(null, now, 'ko'), false, '예약 저장소 없음 → 재생성 0');
        budgetFails = true;
        assert.equal(await reserveRegTacticalRefresh(r, now, 'ko'), false, '예약 저장소 장애 → 재생성 0');
        budgetFails = false;
        assert.equal(await reserveRegTacticalRefresh(r, Date.parse('2026-10-30T21:00:00Z'), 'ko'), false, '장후(POST)엔 REG 예약 없음');
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
        const st = budgets.get('guardian:tactical:reg-refresh:ko:2026-10-30')!;
        assert.equal(st.count, 1);
        assert.ok(st.retryAt! >= now + 60 * MIN, '실패 기록 → 60분 대기');
        // 같은 언어를 다른 인스턴스가 바로 봐도 예약이 거절돼 호출 0(언어별 30분/실패 대기)
        resetHub(); coreCalls = 0;
        await call('ko');
        assert.equal(coreCalls, 0, '같은 언어 예약 거절 → 재계산 0');
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
        {   const next = mk(NEWT);   // 다른 글이지만 직전 글보다 오래된 시각(보관본·옛 저장본 복구)
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
            assert.equal(await reserveRegTacticalRefresh(r, t0, 'ko'), true);
            await finishRegTacticalRefresh(r, t0, settleRegTacticalRefresh(mk(PENDING), snap(), t0 + 1, t0), t0 + 20_000, 'ko');
            assert.equal(await reserveRegTacticalRefresh(r, t0 + 31 * MIN, 'ko'), false, '대기 문구 결과 = 실패 → 60분 대기');
        }

        console.log('통과 T35-B 장중 정기 재생성: 판정 경계·언어별 예약(30분·8회·실패 대기·장애 0)·재계산 진입·코어 값 비교·실패/예외 시 기존 글 유지·성공 판정');
    } finally { Date.now = realNow; }
})().catch(e => { console.error(e); process.exitCode = 1; });
