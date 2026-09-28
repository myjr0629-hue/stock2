// ===========================================================================
// Unified Redis Client ??ElastiCache via EC2 Proxy (primary) + Upstash (fallback)
// EC2 Proxy: HTTP REST API wrapping ElastiCache (~15ms from Vercel same-region)
// Upstash: HTTP REST API (works everywhere, ~30ms)
// ===========================================================================

import crypto from 'crypto';
import { monitorEventLoopDelay, performance } from 'perf_hooks';
import { Redis as UpstashRedis } from '@upstash/redis';

// Lazy initialization
let upstashClient: UpstashRedis | null = null;
let lastError: string | null = null;
let ecProxyAvailable: boolean | null = null; // null = not tested yet

// ═══════════════════════════════════════════════════════════════════════════
// ★ 2026-09-29 — 관측(로그 전용). 동작은 한 줄도 바꾸지 않는다.
//
// 왜: 9/28 장중 운영 로그에 «EC2 Proxy 일시 중단(30초)» 이 시간당 43건(서로 다른 사건).
//   그때마다 그 인스턴스는 30초간 읽기·쓰기를 전부 Upstash 로 보낸다(유료, 래퍼 키는 미스).
//   그런데 ① 쓰기 실패는 로그가 없고 ② 폴백이 «왜» 일어났는지(쿨다운·EC2 오류·정책)를 셀 수 없고
//   ③ 타임아웃이 «프록시가 느려서»인지 «이 인스턴스의 이벤트 루프가 막혀서»인지 가를 수 없었다
//   (같은 순간 Intrinio 호출도 함께 타임아웃난 줄이 있다 → 인스턴스 쪽 의심).
// 무엇을: 호출마다 결과(적중/미스/타임아웃/네트워크/HTTP/깨짐)·지연 구간·Upstash 폴백 사유를 세고,
//   이벤트 루프 지연(monitorEventLoopDelay)과 함께 60초마다(다음 호출 때) 한 줄로 찍는다:
//   [RedisStats] {"v":1,"inst":…,"win":60,…}   ← scripts/redis-stats-report.js 가 모아 표로 만든다
// 비용: 호출당 정수 몇 개 증가 + performance.now() 2회. 값·키 내용은 기록하지 않는다.
// ═══════════════════════════════════════════════════════════════════════════
type ObsOp = 'get' | 'mget' | 'set' | 'del';
type ObsOutcome = 'hit' | 'miss' | 'ok' | 'timeout' | 'neterr' | 'http' | 'moji' | 'stall';
/** 지연 구간(ms) 상한 — 마지막 칸은 그 이상 전부 */
const OBS_BUCKETS = [2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
function obsOpStat() {
    return { n: 0, hit: 0, miss: 0, ok: 0, timeout: 0, neterr: 0, http: 0, moji: 0, stall: 0, maxMs: 0, h: new Array(OBS_BUCKETS.length + 1).fill(0) as number[] };
}
function obsFresh() {
    return {
        start: Date.now(),
        ec: { get: obsOpStat(), mget: obsOpStat(), set: obsOpStat(), del: obsOpStat() } as Record<ObsOp, ReturnType<typeof obsOpStat>>,
        /** 타임아웃 난 호출의 실제 경과(ms) 최대 — 예산(6000/5000/3000)보다 한참 크면 이벤트 루프가 막혔던 것 */
        timeoutElapsedMax: 0,
        /** Upstash 로 간 호출 — 사유별(cooldown·ecErr·moji·policy·fill·replicate·ecFail) */
        up: { get: {} as Record<string, number>, mget: {} as Record<string, number>, set: {} as Record<string, number>, del: 0, getHit: 0, getMiss: 0, err: 0, maxMs: 0 },
        /** 쿨다운 진입 횟수·사유, 창 안에서 쿨다운이었던 시간(ms) */
        trips: 0, tripReasons: {} as Record<string, number>, cooldownMs: 0,
        /** 정체 유예 덕에 살린 호출 · 네트워크 오류 재시도(와 그 성공) · 반개방 시험 */
        rescued: 0, retry: 0, retryOk: 0, probes: 0,
    };
}
let obs = obsFresh();
const OBS_INSTANCE = Math.random().toString(36).slice(2, 8);
const OBS_WINDOW_MS = 60_000;
let obsLoop: ReturnType<typeof monitorEventLoopDelay> | null = null;
try { obsLoop = monitorEventLoopDelay({ resolution: 20 }); obsLoop.enable(); } catch { obsLoop = null; }
let obsCooldownFrom = 0; // 쿨다운 진입 시각(0 = 쿨다운 아님) — 창 경계에서 잘라 합산한다
// 창별 CPU 사용·이벤트 루프 활용도 — 루프 지연이 큰데 CPU 가 거의 0 이면 «막힘»이 아니라 «인스턴스 일시정지»다
let obsCpuPrev: NodeJS.CpuUsage | null = null;
let obsEluPrev: ReturnType<typeof performance.eventLoopUtilization> | null = null;
try { obsCpuPrev = process.cpuUsage(); obsEluPrev = performance.eventLoopUtilization(); } catch { /* 없으면 생략 */ }

function obsRecord(op: ObsOp, outcome: ObsOutcome, t0: number): void {
    const ms = performance.now() - t0;
    const s = obs.ec[op];
    s.n++; s[outcome]++;
    if (ms > s.maxMs) s.maxMs = ms;
    let i = 0; while (i < OBS_BUCKETS.length && ms > OBS_BUCKETS[i]) i++;
    s.h[i]++;
    if (outcome === 'timeout' && ms > obs.timeoutElapsedMax) obs.timeoutElapsedMax = ms;
    obsMaybeFlush();
}
function obsUp(op: 'get' | 'mget' | 'set', reason: string, n = 1): void {
    const m = obs.up[op]; m[reason] = (m[reason] || 0) + n;
}
function obsUpDone(t0: number, err = false): void {
    const ms = performance.now() - t0;
    if (ms > obs.up.maxMs) obs.up.maxMs = Math.round(ms);
    if (err) obs.up.err++;
    obsMaybeFlush();
}
function obsCooldownEnter(reason: string): void {
    obs.trips++;
    const k = /timeout|aborted/i.test(reason) ? 'timeout' : /^HTTP /.test(reason) ? reason : 'neterr';
    obs.tripReasons[k] = (obs.tripReasons[k] || 0) + 1;
    obsCooldownFrom = Date.now();
}
function obsCooldownExit(): void {
    if (obsCooldownFrom) { obs.cooldownMs += Date.now() - Math.max(obsCooldownFrom, obs.start); obsCooldownFrom = 0; }
}
/** 구간 히스토그램에서 백분위의 구간 상한(ms) — 근사치. -1 = 마지막 칸(10초 초과) */
function obsPct(h: number[], n: number, p: number): number | null {
    if (!n) return null;
    const target = Math.ceil(n * p); let acc = 0;
    for (let i = 0; i < h.length; i++) { acc += h[i]; if (acc >= target) return i < OBS_BUCKETS.length ? OBS_BUCKETS[i] : -1; }
    return -1;
}
function obsMaybeFlush(force = false): void {
    const now = Date.now();
    if (!force && now - obs.start < OBS_WINDOW_MS) return;
    const cur = obs; obs = obsFresh();
    if (obsCooldownFrom) { cur.cooldownMs += now - Math.max(obsCooldownFrom, cur.start); }
    const ec: Record<string, unknown> = {};
    for (const op of ['get', 'mget', 'set', 'del'] as ObsOp[]) {
        const s = cur.ec[op]; if (!s.n) continue;
        const o: Record<string, number | null> = { n: s.n };
        for (const k of ['hit', 'miss', 'ok', 'timeout', 'neterr', 'http', 'moji', 'stall'] as const) if (s[k]) o[k] = s[k];
        o.p50 = obsPct(s.h, s.n, 0.5); o.p95 = obsPct(s.h, s.n, 0.95); o.p99 = obsPct(s.h, s.n, 0.99); o.max = Math.round(s.maxMs);
        o.h = s.h as any;
        ec[op] = o;
    }
    let loop: Record<string, number> | undefined;
    if (obsLoop) {
        try {
            loop = { p50: Math.round(obsLoop.percentile(50) / 1e6), p99: Math.round(obsLoop.percentile(99) / 1e6), max: Math.round(obsLoop.max / 1e6) };
            obsLoop.reset();
        } catch { loop = undefined; }
    }
    let cpuMs: number | undefined, elu: number | undefined;
    try {
        if (obsCpuPrev) { const c = process.cpuUsage(obsCpuPrev); cpuMs = Math.round((c.user + c.system) / 1000); obsCpuPrev = process.cpuUsage(); }
        if (obsEluPrev) { const e = performance.eventLoopUtilization(obsEluPrev); elu = Math.round(e.utilization * 1000) / 1000; obsEluPrev = performance.eventLoopUtilization(); }
    } catch { /* 생략 */ }
    const line = {
        v: 1, inst: OBS_INSTANCE, win: Math.round((now - cur.start) / 1000), ec,
        ...(cpuMs !== undefined ? { cpuMs } : {}), ...(elu !== undefined ? { elu } : {}),
        ...(cur.timeoutElapsedMax ? { toMax: Math.round(cur.timeoutElapsedMax) } : {}),
        up: cur.up, trips: cur.trips, ...(cur.trips ? { tripWhy: cur.tripReasons } : {}),
        cdMs: Math.round(cur.cooldownMs), state: ecProxyAvailable === false ? 'cooldown' : ecProxyAvailable === true ? 'up' : 'unknown',
        ...(cur.rescued || cur.retry || cur.probes ? { rescued: cur.rescued, retry: cur.retry, retryOk: cur.retryOk, probes: cur.probes } : {}),
        ...(loop ? { loop } : {}),
    };
    console.log('[RedisStats] ' + JSON.stringify(line));
}
/** 테스트 전용 — 현재 창을 즉시 내보낸다 */
export function _obsFlushForTest(): void { obsMaybeFlush(true); }
/** 테스트 전용 — 현재 창(내보내기 전) */
export function _obsSnapshotForTest() { return obs; }

/**
 * ★ 2026-09-15 — «한 번 실패하면 영원히 포기» 를 고친다.
 *
 * 예전엔 프록시 호출이 한 번이라도 타임아웃되면 ecProxyAvailable=false 로 두고
 * 그 인스턴스가 살아 있는 동안 EC2 캐시를 **다시는 쓰지 않았다.**
 * 실측: guardian:snapshot:ko 는 24,651바이트다. 평소 0.6~1.0초에 오지만
 * 한 번 3초를 넘기면 그 뒤로는 멀쩡한 캐시를 두고도 전부 건너뛴다.
 * Upstash 가 받쳐주면 티가 안 나지만, 느려지고 비용이 든다.
 *
 * [원칙] 일시적 흔들림이 영구 저하가 되면 안 된다 → 쿨다운으로 바꾼다.
 *
 * ★ 2026-09-29 — 쿨다운의 «원인»을 고친다 (브랜치 fix/redis-proxy-reliability).
 *
 * 실측(9/28 장중 운영 로그 1시간 43건 · 관측 프리뷰 [RedisStats] 65 인스턴스·분 · 맥→프록시 2Hz 프로브 45분):
 *   · 프록시 자체는 정체가 없었다(프로브 p99 ≈ 왕복시간, 오류 0, 가동 254시간).
 *   · 타임아웃이 난 GET 의 «실제 경과»가 15~100초였다(예산 6초). 같은 창의 이벤트 루프 지연도 같은 크기
 *     (예: GET 100,580ms ↔ 루프 100,663ms). 100초 동기 막힘은 불가능하다 → 응답을 보낸 뒤 인스턴스가
 *     일시정지됐다가 다음 요청에 깨어나면서, 멈춰 있던 배경 요청(캐시 워머·LAST-GOOD 배경 갱신·미대기 쓰기)의
 *     마감 타이머가 한꺼번에 울린 것이다. 장중엔 무거운 배경 계산(워머 20~177초)으로 루프가 막히는 경우도 겹친다.
 *     둘 다 «이미 도착했거나 곧 올 응답»보다 마감 타이머가 먼저 울린다(libuv: 다음 바퀴 timers 가 poll 보다 앞).
 *   · 그 한 번의 «가짜 타임아웃»이 (깨운 사용자 요청까지) 인스턴스 전체를 30초간 Upstash 로 돌렸다
 *     → 래퍼 키는 Upstash 에 없어 미스 → 벤더 재계산 → 루프가 더 막히는 되먹임.
 *     관측 프리뷰(약한 합성 부하)에서도 Redis 호출의 26%가 Upstash, 그중 86%가 쿨다운·EC2 오류 사유였다.
 * 고친 것:
 *   ① 정체 감지 마감(ecDeadline): 마감 타이머가 EC_TIMING.lateMs 넘게 «늦게» 울리면 루프가 막혔던 것 —
 *      바로 끊지 않고 EC_TIMING.graceMs 한 번 유예해 poll 단계가 도착한 응답을 처리하게 한다.
 *      루프가 멀쩡한데 응답이 없을 때만 «진짜 타임아웃»이다. 정체 후 타임아웃은 차단기를 열지 않는다.
 *   ② 차단기: 진짜 실패(무응답·HTTP 오류·재시도 후에도 연결 실패)에만 연다. 30초 고정 → 5·10·20·30초
 *      지수 증가, 끝나면 «한 요청만» 시험(반개방) — 성공하면 닫고, 실패하면 다음 단계로.
 *      (프록시가 정말 죽었을 때: 예전엔 30초마다 동시 요청 «전부»가 타임아웃을 맞았다 → 이제 한 요청만)
 *   ③ 네트워크 오류(소켓 끊김·keep-alive 경합)는 지터 20~80ms 후 1회 재시도 — 프록시 명령은 전부 멱등.
 *   가용성 폴백(Upstash)은 그대로 둔다 — 드물어지고, 사유가 [RedisStats] 에 남는다.
 */
/**
 * 시간 설정. 예산(budget)은 예전 값 그대로 둔다 — 실측 근거:
 *   · 프록시 자체 응답: 맥→프록시 2Hz 프로브(9/28 장중 45분) p50 207ms·p99 236ms·p99.9 418ms 가 전부 한국↔us-east-1
 *     왕복(≈205ms)이다 → 프록시 처리 p99 ≈ 30ms. GET 6초는 그 200배 — «진짜 무응답» 감지기로 충분하다.
 *   · 앱 안에서 잰 지연 p99(>10초)는 루프 경합·일시정지가 섞여 예산을 정하는 근거가 못 된다.
 *   · 예산을 줄이면 루프 경합으로 느려진 «정상» 응답을 끊어 Upstash 미스·재계산을 늘릴 위험이 있다.
 *   → 가짜 타임아웃은 예산이 아니라 정체 유예(lateMs·graceMs)로 없앤다.
 */
const EC_TIMING = {
    budget: { get: 6_000, mget: 5_000, set: 3_000, del: 3_000 } as Record<ObsOp, number>,
    /** 마감 타이머가 이보다 늦게 울리면 «정체»(루프 막힘·인스턴스 일시정지)로 본다 — 평상시 루프 지연 p50 ≈ 20ms */
    lateMs: 250,
    /** 정체였으면 끊기 전에 한 번 더 기다리는 시간 — 이미 도착한 응답을 poll 단계가 처리할 기회 */
    graceMs: 1_500,
    cooldownBaseMs: 5_000,
    cooldownMaxMs: 30_000,
};
/** 테스트 전용 — 시간 설정을 줄여 결정적으로 재현한다 */
export function _setEcTimingForTest(t: Partial<Omit<typeof EC_TIMING, 'budget'>> & { budget?: Partial<Record<ObsOp, number>> }): void {
    const { budget, ...rest } = t;
    Object.assign(EC_TIMING, rest);
    if (budget) Object.assign(EC_TIMING.budget, budget);
}
/** 테스트 전용 — «지금 정체가 있었다»를 심장박동 대신 주입한다(부하가 큰 맥에서도 결정적으로 재현) */
export function _markStallForTest(): void { ecLastStallAt = performance.now(); }
/** 테스트 전용 — 마지막 정체 시각(심장박동이 실제 막힘을 잡았는지 확인용) */
export function _lastStallAtForTest(): number { return ecLastStallAt; }
/** 테스트 전용 — 차단기 상태 초기화 */
export function _resetEcBreakerForTest(): void { ecProxyAvailable = null; ecProxyDownUntil = 0; ecTripStreak = 0; ecProbeInFlight = false; ecProbeSince = 0; obsCooldownFrom = 0; }
let ecProxyDownUntil = 0;
let ecTripStreak = 0;        // 연속 개방 횟수(쿨다운 지수) — 성공하면 0
let ecProbeInFlight = false; // 반개방: 쿨다운이 끝난 뒤 «한 요청만» 시험한다
let ecProbeSince = 0;        // 시험 시작 시각 — 정산이 빠져도 20초 뒤엔 다시 시험한다(영구 «시험 중» 방지)
const EC_PROBE_STALE_MS = 20_000;

/**
 * 이번 호출이 EC2 를 써도 되나.
 *   'use'   — 차단기 닫힘(정상)
 *   'probe' — 쿨다운이 끝났다: 이 호출 «하나»가 시험한다(결과로 닫거나 다시 연다)
 *   'skip'  — 쿨다운 중이거나 다른 호출이 시험 중 → Upstash 로(예전 쿨다운과 같은 경로)
 */
type EcGate = 'use' | 'probe' | 'skip';
function ecAcquire(): EcGate {
    if (ecProxyAvailable !== false) return 'use';
    if (Date.now() < ecProxyDownUntil || (ecProbeInFlight && Date.now() - ecProbeSince < EC_PROBE_STALE_MS)) return 'skip';
    ecProbeInFlight = true;
    ecProbeSince = Date.now();
    obs.probes++;
    return 'probe';
}
/** 호출 결과를 차단기에 알린다. ok=프록시가 정상 응답(값이 null 이어도). tripReason 이 있으면 «진짜 실패». */
function ecSettle(gate: EcGate, ok: boolean, tripReason?: string): void {
    if (gate === 'probe') ecProbeInFlight = false;
    if (ok) {
        if (ecProxyAvailable !== true) {
            if (ecProxyAvailable === false) obsCooldownExit();
            console.log(ecProxyAvailable === false ? `[Redis] EC2 Proxy 복구(${gate === 'probe' ? '시험 요청' : '진행 중이던 요청'} 성공)` : '[Redis] EC2 Proxy connected');
            ecProxyAvailable = true;
        }
        ecTripStreak = 0;
        return;
    }
    if (tripReason) markEcProxyDown(tripReason, gate === 'probe');
}
function markEcProxyDown(reason: string, fromProbe = false): void {
    // 이미 열려 있으면(같은 사건의 동시 실패) 연장·가중하지 않는다 — 시험 요청의 실패만 다음 단계로 올린다
    if (ecProxyAvailable === false && !fromProbe) return;
    const cd = Math.min(EC_TIMING.cooldownMaxMs, EC_TIMING.cooldownBaseMs * 2 ** ecTripStreak);
    ecTripStreak = Math.min(ecTripStreak + 1, 6);
    console.warn(`[Redis] EC2 Proxy 일시 중단(${Math.round(cd / 1000)}초): ${reason}`);
    if (ecProxyAvailable !== false) obsCooldownEnter(reason); else obs.trips++;
    ecProxyAvailable = false;
    ecProxyDownUntil = Date.now() + cd;
}

/**
 * 정체 심장박동 — 100ms 마다 한 번. 박동 간격이 100ms+lateMs 를 넘으면 그 순간을 «정체 시각»으로 적는다.
 * 왜: 인스턴스가 요청 «도중» 멈췄다가 마감 «전에» 깨어나면 마감 타이머는 제시간에 울리지만, 멈춘 사이 잃은
 * TCP 패킷의 재전송이 늦게 와서 6초를 넘긴다(관측 프리뷰: 수리판에 남은 타임아웃 26건, 경과 최대 6.2초).
 * 마감 타이머가 늦었는지만 보면 이 경우를 «진짜 무응답»으로 오판한다. 비용: 100ms 타이머 하나(unref).
 */
let ecLastBeat = performance.now();
let ecLastStallAt = -1;
try {
    const beat = setInterval(() => {
        const now = performance.now();
        if (now - ecLastBeat > 100 + EC_TIMING.lateMs) ecLastStallAt = now;
        ecLastBeat = now;
    }, 100);
    (beat as any)?.unref?.();
} catch { /* 타이머를 못 만들면 마감 타이머 지각만 본다 */ }
/**
 * 정체 감지 마감. AbortSignal.timeout(n) 과 같지만, ① 타이머가 EC_TIMING.lateMs 넘게 늦게 울렸거나
 * ② 요청이 떠 있던 사이 심장박동이 정체를 봤으면(= 이벤트 루프가 막혔거나 인스턴스가 멈췄다 깨어났다)
 * 바로 끊지 않고 한 번 유예한다. stalled() 는 유예가 있었는지.
 */
function ecDeadline(budgetMs: number): { signal: AbortSignal; stalled: () => boolean; clear: () => void } {
    const ac = new AbortController();
    const started = performance.now();
    let graced = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (ms: number) => {
        const due = performance.now() + ms;
        timer = setTimeout(() => {
            if (!graced && (performance.now() - due > EC_TIMING.lateMs || ecLastStallAt > started)) { graced = true; arm(EC_TIMING.graceMs); return; }
            const err = new Error('The operation was aborted due to timeout'); err.name = 'TimeoutError';
            ac.abort(err);
        }, ms);
        (timer as any)?.unref?.();
    };
    arm(budgetMs);
    return { signal: ac.signal, stalled: () => graced, clear: () => { if (timer) clearTimeout(timer); } };
}
/** undici 의 네트워크 오류(소켓 끊김·연결 거부 등) — fetch 는 TypeError('fetch failed') 로 감싼다 */
function isNetErr(e: any): boolean {
    return e?.name === 'TypeError' || /fetch failed|ECONNRESET|ECONNREFUSED|EPIPE|socket|other side closed|UND_ERR/i.test(String(e?.message || '') + String(e?.cause?.code || ''));
}
type EcResult = { ok: true; res: Response; body: any } | { ok: false; err: any; kind: 'timeout' | 'stall' | 'neterr' };
/**
 * 프록시 호출(응답 본문까지 읽어 돌려준다). 한 번 실패하면 지터 20~80ms 뒤 «새로» 1회 재시도한다:
 *   · 네트워크 오류(소켓 끊김·keep-alive 경합 — 일시정지 동안 서버가 닫은 소켓을 깨어나자마자 집은 경우 포함)
 *   · 정체 뒤 타임아웃(일시정지 동안 연결이 죽었을 수 있다 — 프록시는 멀쩡하다)
 *   지터는 poll 단계가 닫힌 소켓을 풀에서 치울 틈을 준다. 명령은 전부 멱등(GET·MGET·SET·DEL)이다.
 * 실패 kind: 'timeout'(루프 정상인데 무응답 = 진짜) · 'stall'(정체가 끼었다 = 프록시 탓 아님) · 'neterr'.
 * makeInit 은 시도마다 부른다 — trade:* 서명(±30초 재전송 창)을 재시도 때 새로 만든다.
 */
async function ecCall(op: ObsOp, url: string, makeInit: () => RequestInit): Promise<EcResult> {
    let anyStall = false;
    for (let attempt = 0; ; attempt++) {
        const d = ecDeadline(EC_TIMING.budget[op]);
        try {
            const res = await fetch(url, { ...makeInit(), signal: d.signal });
            const text = await res.text();                 // 본문을 끝까지 읽는다(소켓을 keep-alive 풀로 돌려준다)
            const body = res.ok ? JSON.parse(text) : null; // 파싱 오류는 아래 catch → 실패(예전에도 실패로 셌다)
            if (d.stalled()) obs.rescued++;
            if (attempt) obs.retryOk++;
            return { ok: true, res, body };
        } catch (e: any) {
            const stalled = d.stalled();
            anyStall = anyStall || stalled;
            const kind = d.signal.aborted ? (stalled ? 'stall' : 'timeout') : 'neterr';
            if (attempt === 0 && (kind === 'stall' || (kind === 'neterr' && isNetErr(e)))) {
                obs.retry++;
                await new Promise((r) => setTimeout(r, 20 + Math.random() * 60));
                continue;
            }
            // 정체가 한 번이라도 끼었으면 실패 원인은 정체다(깨어난 직후 죽은 소켓 등) — 차단기를 열지 않는다
            return { ok: false, err: e, kind: anyStall ? 'stall' : kind };
        } finally {
            d.clear();
        }
    }
}

// EC2 Redis Proxy configuration
// ★ 2026-09-16 — the bearer key has NO default any more (the old default was
//   printed in docs/source and the proxy accepted POST /set with it). Without
//   EC2_REDIS_PROXY_KEY the proxy answers 401 and every read falls through to
//   Upstash; that is the intended fail-closed behaviour, not an outage.
const EC2_PROXY_URL = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
const EC2_PROXY_KEY = process.env.EC2_REDIS_PROXY_KEY || process.env.REDIS_PROXY_KEY || '';
if (!EC2_PROXY_KEY) console.error('[Redis] EC2_REDIS_PROXY_KEY is not set — EC2 proxy reads/writes will be rejected (fail closed)');

// ★ trade:* writes (killswitch, auto config, real-money arm key) must be signed:
//   the proxy rejects remote writes to trade:* that lack X-Exec-Ts/X-Exec-Sign
//   = HMAC_SHA256(EXECUTOR_SECRET, ts + "." + rawBody) — the executor's scheme.
//   Without EXECUTOR_SECRET those writes only land in Upstash; the engine reads
//   killswitch from ElastiCache, so a missing secret is logged loudly.
const PROTECTED_KEY = /^trade:/;
let warnedNoWriteSecret = false;
function signedWriteHeaders(rawBody: string, keys: string[]): Record<string, string> {
    if (!keys.some((k) => PROTECTED_KEY.test(k))) return {};
    const secret = (process.env.EXECUTOR_SECRET || '').trim();
    if (!secret) {
        if (!warnedNoWriteSecret) { warnedNoWriteSecret = true; console.error('[Redis] EXECUTOR_SECRET missing — trade:* writes to the EC2 proxy will be rejected (403)'); }
        return {};
    }
    const ts = String(Date.now());
    const sign = crypto.createHmac('sha256', secret).update(ts + '.' + rawBody).digest('hex');
    return { 'X-Exec-Ts': ts, 'X-Exec-Sign': sign };
}

// Cache keys
export const CACHE_KEYS = {
    VIX_LAST_KNOWN_GOOD: 'vix:last_known_good',
    VIX_LAST_UPDATE: 'vix:last_update'
};

/**
 * [GLOBAL POLICY] TTL Jitter — adds ±10% random variation to prevent
 * synchronized expiry (thundering herd) across all keys.
 * AWS best practice for distributed caching.
 */
function applyJitter(ttlSeconds: number): number {
    if (ttlSeconds <= 10) return ttlSeconds; // No jitter for very short TTLs
    const jitterRange = Math.floor(ttlSeconds * 0.1); // ±10%
    const jitter = Math.floor(Math.random() * (jitterRange * 2 + 1)) - jitterRange;
    return Math.max(1, ttlSeconds + jitter);
}

/** Get Redis connection status for debugging */
export function getRedisStatus() {
    return {
        backend: ecProxyAvailable ? 'ec2-proxy' : 'upstash',
        ecProxyUrl: EC2_PROXY_URL,
        ecProxyAvailable,
        lastError,
        hasUpstashUrl: !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL),
    };
}

// ?�?� EC2 Redis Proxy helpers ?�?�
/** EC2 프록시 읽기 — `ok:true` 는 «프록시가 정상 응답했다»(값이 null 이어도)를 뜻한다. */
async function ecProxyGetEx<T>(key: string, gate: EcGate = 'use'): Promise<{ ok: boolean; value: T | null }> {
    const t0 = performance.now();
    // ★ 2026-09-15 — 3초는 너무 빡빡했다(guardian:snapshot 24,651바이트가 런타임이 바쁠 때 넘김) → 6초.
    // ★ 2026-09-29 — «런타임이 바쁠 때»는 이제 ecDeadline 이 가려낸다(정체 유예). 예산은 EC_TIMING.budget.get.
    const r = await ecCall('get', `${EC2_PROXY_URL}/get?key=${encodeURIComponent(key)}`, () => ({
        headers: { 'Authorization': `Bearer ${EC2_PROXY_KEY}` },
        cache: 'no-store',
    }));
    if (!r.ok) {
        obsRecord('get', r.kind, t0);
        // 정체 뒤 타임아웃('stall')은 프록시 탓이 아니다 — 이 호출만 Upstash 로, 차단기는 그대로
        ecSettle(gate, false, r.kind === 'stall' ? undefined : String(r.err?.message || r.err));
        return { ok: false, value: null };
    }
    if (!r.res.ok) {
        // ★ 401/5xx 는 «미스»가 아니라 «프록시 이상»이다. 예전엔 null 로 돌려 미스처럼 보였고,
        //   키가 틀린 배포에서도 모든 읽기가 조용히 Upstash 로 갔다. 쿨다운으로 넘긴다.
        obsRecord('get', 'http', t0);
        ecSettle(gate, false, `HTTP ${r.res.status}`);
        return { ok: false, value: null };
    }
    obsRecord('get', r.body?.result == null ? 'miss' : 'hit', t0);
    ecSettle(gate, true);
    return { ok: true, value: (r.body?.result ?? null) as T | null };
}
async function ecProxyGet<T>(key: string): Promise<T | null> {
    return (await ecProxyGetEx<T>(key)).value;
}

/** 쓰기 — 예전처럼 쓰기 실패는 차단기를 열지 않는다(Upstash 가 받는다). 단 «시험 요청»이 실패하면 다음 단계로. */
async function ecProxySet<T>(key: string, value: T, ttlSeconds?: number, gate: EcGate = 'use'): Promise<boolean> {
    const t0 = performance.now();
    let rawBody: string;
    try { rawBody = JSON.stringify({ key, value, ttl: ttlSeconds }); } catch { if (gate === 'probe') ecProbeInFlight = false; return false; }
    const r = await ecCall('set', `${EC2_PROXY_URL}/set`, () => ({
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${EC2_PROXY_KEY}`,
            'Content-Type': 'application/json',
            ...signedWriteHeaders(rawBody, [key]),
        },
        body: rawBody,
    }));
    if (!r.ok) {
        obsRecord('set', r.kind, t0);
        ecSettle(gate, false, gate === 'probe' && r.kind !== 'stall' ? String(r.err?.message || r.err) : undefined);
        return false;
    }
    if (!r.res.ok && PROTECTED_KEY.test(key)) console.error(`[Redis] EC2 proxy refused trade write key=${key} status=${r.res.status}`);
    obsRecord('set', r.res.ok ? 'ok' : 'http', t0);
    ecSettle(gate, r.res.ok, !r.res.ok && gate === 'probe' ? `HTTP ${r.res.status}` : undefined);
    return r.res.ok;
}

// ?�?� Upstash (HTTP) connection ?�?�
function getUpstashClient(): UpstashRedis | null {
    if (upstashClient) return upstashClient;

    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
        console.warn('[Redis] Upstash not configured');
        return null;
    }

    try {
        upstashClient = new UpstashRedis({ url, token });
        console.log('[Redis] Upstash client initialized');
        return upstashClient;
    } catch (e: any) {
        lastError = `upstash: ${e.message}`;
        return null;
    }
}

/**
 * Get cached value from Redis
 * Tries EC2 Proxy (ElastiCache) first (~15ms), falls back to Upstash (~30ms)
 */
// The EC2 proxy occasionally mangles multi-byte UTF-8 (Korean/Japanese) into
// U+FFFD replacement chars — the same value stored in Upstash stays clean. Detect
// that corruption so we fall through to Upstash and users never see mojibake
// (guardian AI briefs, sector names, etc.).
function isMojibake(value: unknown): boolean {
    if (value == null) return false;
    try {
        const s = typeof value === 'string' ? value : JSON.stringify(value);
        return s.indexOf('\uFFFD') !== -1;
    } catch { return false; }
}


// ═══════════════════════════════════════════════════════════════════════════
// ★ 2026-09-18 — Upstash «복제본» → «폴백 + 내구 저장소» (비용 감축, 동작 불변)
//
// 실측: 9월 Upstash 명령 1,903만(8월 369만의 5.2배)·대역폭 495GB·$47.
//   · 쓰기 880만 = setInCache 가 모든 쓰기를 Upstash 에 «무조건» 복제한 것
//   · 읽기 1,028만 = EC2 미스마다 Upstash 를 다시 읽은 것(적중률 46% — 없는 키 유료 조회)
//   · 대역폭 = flow:ticker(257KB·비ASCII) 를 프록시가 깨뜨려 Upstash 사본으로 폴백한 것
//     → 프록시 readBody 결함은 scripts/ec2-redis-proxy.js 에서 같은 날 수정·검증했다
//
// 정책(순수 함수, scripts/test-redis-policy.ts 가 고정한다):
//   복제(Upstash 에도 쓴다) = TTL 없음(내구 데이터) | 장애-필수 접두사 | EC2 쓰기 실패
//   lastgood 류는 EC2 엔 매번, Upstash 엔 «키당 N초에 한 번»만(인스턴스별 스로틀)
//   폴백(EC2 가 «정상 응답으로 null» 인데도 Upstash 를 읽는다) = Upstash 전용 접두사 | 복제 접두사
//   프록시가 죽었거나 쿨다운이면 → 예전과 똑같이 전부 Upstash
// 실측 근거: Upstash 접두사 60개 중 EC2 에 없는 것은 cache:13f·push:tokens·guardian:gemini·
//   reports:*·split:recent·cache:xs·flow-harvest:lock 뿐(2026-09-18 프로브). 그 외 전부 EC2 3/3.
// ═══════════════════════════════════════════════════════════════════════════
/** 장애 때 없으면 화면이 비거나 상태를 잃는 키 — Upstash 복제를 유지한다. */
const REPLICATE_PREFIXES: readonly RegExp[] = [
    /^trade:/, /^mkt:/, /^push:/, /^guardian:/, /^yahoo:/, /^vix:/, /^cnn:/,
    /^market:movers:last_good/, /^structure:lastgood:/, /^intrinio:options:eod/,
    /^intrinio:snap:lastgood:/, /^flow:ticker:lastgood:/,
];
/** Upstash 에만 존재하는 키(래퍼 밖 작성자) — EC2 미스여도 Upstash 를 읽는다. */
const UPSTASH_ONLY_PREFIXES: readonly RegExp[] = [
    /^cache:13f:/, /^push:/, /^reports:/, /^guardian:gemini/, /^split:/, /^cache:xs/, /^flow-harvest:/,
];
/** 크고 자주 쓰는 «마지막 정상값» — Upstash 복제를 키당 N초에 한 번으로 묶는다. */
const THROTTLED_REPLICATE: readonly { re: RegExp; windowMs: number }[] = [
    { re: /^flow:ticker:lastgood:/, windowMs: 5 * 60 * 1000 },   // 257KB — 대역폭의 주범
    { re: /^intrinio:snap:lastgood:/, windowMs: 60 * 1000 },      // 호출마다 쓰이던 것
];
const _lastReplicated = new Map<string, number>();
export type ReplicateDecision = 'replicate' | 'throttled' | 'skip';
/** 순수 함수 — 테스트 가능. now 는 주입한다. */
export function decideReplicate(key: string, ttlSeconds: number | undefined, ecOk: boolean, now = Date.now()): ReplicateDecision {
    if (!ecOk) return 'replicate';                       // EC2 에 못 썼으면 예전처럼 Upstash 가 받는다
    if (ttlSeconds === undefined) return 'replicate';    // 내구 데이터(킬스위치·토큰 등)
    const th = THROTTLED_REPLICATE.find((t) => t.re.test(key));
    if (th) {
        const last = _lastReplicated.get(key);           // 기록 없음 = 첫 쓰기 → 복제(시계값에 기대지 않는다)
        if (last !== undefined && now - last < th.windowMs) return 'throttled';
        if (_lastReplicated.size > 5000) _lastReplicated.clear(); // 인스턴스 메모리 상한
        _lastReplicated.set(key, now);
        return 'replicate';
    }
    return REPLICATE_PREFIXES.some((r) => r.test(key)) ? 'replicate' : 'skip';
}
/** 순수 함수 — EC2 가 «정상 응답으로 null» 을 줬을 때 Upstash 를 읽을지. */
export function shouldFallbackToUpstash(key: string, ecAuthoritative: boolean): boolean {
    if (!ecAuthoritative) return true;                   // 프록시 죽음/쿨다운/오류 → 예전과 동일
    return UPSTASH_ONLY_PREFIXES.some((r) => r.test(key)) || REPLICATE_PREFIXES.some((r) => r.test(key));
}
/** 테스트 전용 — 스로틀 상태 초기화 */
export function _resetReplicateThrottle(): void { _lastReplicated.clear(); }

export async function getFromCache<T>(key: string): Promise<T | null> {
    // Try EC2 Proxy first (ElastiCache via HTTP)
    let ecAuthoritative = false;
    let upReason = 'cooldown'; // 관측 전용: 이 호출이 Upstash 로 가게 된 사유
    const gate = ecAcquire();
    if (gate !== 'skip') {
        const r = await ecProxyGetEx<T>(key, gate);
        // Skip a corrupted EC2 value (mojibake) and let Upstash serve the clean copy.
        if (r.ok && r.value !== null && !isMojibake(r.value)) return r.value;
        // 정상 응답인데 null(진짜 미스) → 래퍼로만 쓰는 키는 Upstash 에도 없으므로 묻지 않는다.
        // 깨진 값(mojibake)은 «비권위»로 두어 예전처럼 Upstash 사본을 시도한다.
        ecAuthoritative = r.ok && r.value === null;
        upReason = !r.ok ? 'ecErr' : r.value !== null ? 'moji' : 'policy';
        if (upReason === 'moji') obs.ec.get.moji++;
    }
    if (ecAuthoritative && !shouldFallbackToUpstash(key, true)) return null;

    // Fallback to Upstash
    const upstash = getUpstashClient();
    if (!upstash) return null;

    obsUp('get', upReason);
    const tu = performance.now();
    try {
        const v = await upstash.get<T>(key);
        if (v == null) obs.up.getMiss++; else obs.up.getHit++;
        obsUpDone(tu);
        return v;
    } catch (e: any) {
        obsUpDone(tu, true);
        console.warn(`[Redis/Upstash] get(${key}) failed:`, e.message);
        return null;
    }
}

/**
 * Get multiple cached values from Redis in a single round-trip (MGET).
 * Tries EC2 Proxy /mget first, falls back to Upstash SDK mget.
 * Returns array in same order as input keys (null for misses).
 * [PERF] Reduces N Redis round-trips to 1 for batch reads.
 */
export async function mgetFromCache<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];

    // Try EC2 Proxy /mget first (ElastiCache, ~15ms single round-trip)
    let upReason = 'cooldown'; // 관측 전용
    const gate = ecAcquire();
    if (gate !== 'skip') {
        const t0 = performance.now();
        const r = await ecCall('mget', `${EC2_PROXY_URL}/mget?keys=${keys.map(encodeURIComponent).join(',')}`, () => ({
            headers: { 'Authorization': `Bearer ${EC2_PROXY_KEY}` },
            cache: 'no-store',
        }));
        upReason = 'ecErr';
        if (!r.ok) {
            obsRecord('mget', r.kind, t0);
            // 예전: 여기서 플래그만 false(쿨다운 시각 없이) — 이제 GET 과 같은 차단기. 정체 뒤 타임아웃은 열지 않는다.
            ecSettle(gate, false, r.kind === 'stall' ? undefined : String(r.err?.message || r.err));
            console.warn(`[Redis] EC2 Proxy mget unavailable: ${r.err?.message || r.err}`);
        } else if (!r.res.ok) {
            obsRecord('mget', 'http', t0);
            ecSettle(gate, false, gate === 'probe' ? `HTTP ${r.res.status}` : undefined); // 예전처럼 HTTP 오류는 열지 않는다(시험 요청만)
        } else {
            const results = (r.body?.results || []) as (T | null)[];
            ecSettle(gate, true);
            // If the EC2 proxy corrupted any multi-byte value, fall through to
            // Upstash's clean copy rather than returning mojibake.
            if (!results.some(isMojibake)) {
                obsRecord('mget', results.some((x) => x != null) ? 'hit' : 'miss', t0);
                // Upstash 에만 있을 수 있는 키(cache:13f 등)의 미스만 골라 채운다.
                const need = keys.map((k, i) => (results[i] === null && shouldFallbackToUpstash(k, true) ? i : -1)).filter((i) => i >= 0);
                if (need.length) {
                    const upstash = getUpstashClient();
                    if (upstash) {
                        obsUp('mget', 'fill');
                        const tu = performance.now();
                        try {
                            const extra = await upstash.mget(...need.map((i) => keys[i]));
                            need.forEach((i, j) => { if (extra[j] != null) results[i] = extra[j] as T; });
                            obsUpDone(tu);
                        } catch (e: any) { obsUpDone(tu, true); console.warn(`[Redis/Upstash] mget(fill) failed:`, e.message); }
                    }
                }
                return results;
            }
            obsRecord('mget', 'moji', t0);
            upReason = 'moji';
        }
    }

    // Fallback to Upstash mget (SDK native support)
    const upstash = getUpstashClient();
    if (upstash) {
        obsUp('mget', upReason);
        const tu = performance.now();
        try {
            const results = await upstash.mget(...keys);
            obsUpDone(tu);
            return results as (T | null)[];
        } catch (e: any) {
            obsUpDone(tu, true);
            console.warn(`[Redis/Upstash] mget failed:`, e.message);
        }
    }

    // Total failure: return null array
    return keys.map(() => null);
}

/**
 * Set value in Redis cache with optional TTL (seconds)
 * Writes to BOTH EC2 Proxy (ElastiCache) and Upstash for consistency
 * [GLOBAL POLICY] Rejects null, undefined, or failed data to prevent cache poisoning
 */
export async function setInCache<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    // [GLOBAL POLICY] Never cache null, undefined, or error responses
    if (value === null || value === undefined) {
        console.warn(`[Redis] BLOCKED: Attempted to cache null/undefined for key=${key}`);
        return false;
    }
    if (typeof value === 'object' && value !== null) {
        const v = value as any;
        // Block {error: "..."} responses (e.g., "fetch failed")
        if (v.error && Object.keys(v).length <= 2) {
            console.warn(`[Redis] BLOCKED: Attempted to cache error response for key=${key}: ${v.error}`);
            return false;
        }
    }

    let ecOk = false;
    let upstashOk = false;

    // [GLOBAL POLICY] Apply TTL jitter to prevent thundering herd
    const effectiveTtl = ttlSeconds ? applyJitter(ttlSeconds) : undefined;

    // Write to EC2 Proxy (ElastiCache)
    const gate = ecAcquire();
    const ecTried = gate !== 'skip';
    if (ecTried) {
        ecOk = await ecProxySet(key, value, effectiveTtl, gate);
    }

    // Upstash 복제는 정책이 정한다(내구 키·장애-필수 키·EC2 실패 시). 그 외는 EC2 만.
    const decision = decideReplicate(key, ttlSeconds, ecOk);
    const upstash = decision === 'replicate' ? getUpstashClient() : null;
    if (upstash) {
        // 관측 전용: 쿨다운이라 EC2 를 안 거쳤나 · EC2 쓰기가 실패했나 · 정책상 복제인가
        obsUp('set', !ecTried ? 'cooldown' : !ecOk ? 'ecFail' : 'replicate');
        const tu = performance.now();
        try {
            if (effectiveTtl) {
                await upstash.setex(key, effectiveTtl, value);
            } else {
                await upstash.set(key, value);
            }
            upstashOk = true;
            obsUpDone(tu);
        } catch (e: any) {
            obsUpDone(tu, true);
            lastError = `set(${key}): ${e.message}`;
            console.warn(`[Redis/Upstash] set(${key}) failed:`, e.message);
        }
    }

    return ecOk || upstashOk;
}

/**
 * [GLOBAL POLICY] Short-lived negative cache for soft errors.
 * Prevents thundering herd when a data source is temporarily down.
 * TTL: 15-30 seconds (random). Never caches hard errors (null/undefined).
 */
export async function setNegativeCache(key: string, reason: string): Promise<boolean> {
    const negativeTtl = 15 + Math.floor(Math.random() * 16); // 15-30 seconds
    const negativePayload = {
        _negative: true,
        _reason: reason,
        _cachedAt: Date.now(),
        _expiresSec: negativeTtl,
    };
    console.warn(`[Redis] Negative cache set: key=${key}, reason=${reason}, ttl=${negativeTtl}s`);
    return setInCache(key as any, negativePayload as any, negativeTtl);
}

/**
 * Delete a key from Redis cache
 * Removes from BOTH EC2 Proxy and Upstash
 */
export async function deleteFromCache(key: string): Promise<boolean> {
    let ecOk = false;
    let upstashOk = false;

    // Delete from EC2 Proxy
    const gate = ecAcquire();
    if (gate !== 'skip') {
        const t0 = performance.now();
        const r = await ecCall('del', `${EC2_PROXY_URL}/del?key=${encodeURIComponent(key)}`, () => ({
            method: 'DELETE',
            // protected keys: the proxy verifies HMAC(ts + "." + key) for /del
            headers: { 'Authorization': `Bearer ${EC2_PROXY_KEY}`, ...signedWriteHeaders(key, [key]) },
        }));
        if (!r.ok) {
            obsRecord('del', r.kind, t0);
            ecSettle(gate, false, gate === 'probe' && r.kind !== 'stall' ? String(r.err?.message || r.err) : undefined);
        } else {
            ecOk = r.res.ok;
            obsRecord('del', r.res.ok ? 'ok' : 'http', t0);
            ecSettle(gate, r.res.ok, !r.res.ok && gate === 'probe' ? `HTTP ${r.res.status}` : undefined);
        }
    }

    // Delete from Upstash
    const upstash = getUpstashClient();
    if (upstash) {
        obs.up.del++;
        const tu = performance.now();
        try {
            await upstash.del(key);
            upstashOk = true;
            obsUpDone(tu);
        } catch { obsUpDone(tu, true); }
    }

    return ecOk || upstashOk;
}
