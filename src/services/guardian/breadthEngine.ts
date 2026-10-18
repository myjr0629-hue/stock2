// [V7.0] Market Breadth Engine — Guardian Core Intelligence
// Fetches Full Market Snapshot from Massive API
// Computes A/D Ratio, Volume Breadth, Breadth % for 5000+ stocks
// Cached in Redis (5 min TTL) + Memory Cache

import { fetchMassive } from "@/services/massiveClient";
import { getFromCache, setInCache } from "@/services/redisClient";
import { etDateOf } from "@/lib/marketCalendar";
import { isInRegularSession, lastCompletedSessionDate, readSessionArchive, saveSessionArchive } from "@/lib/sessionArchive";

// === TYPES ===
export interface BreadthSnapshot {
    advancers: number;          // 상승 종목 수
    decliners: number;          // 하락 종목 수
    unchanged: number;          // 보합 종목 수
    totalTickers: number;       // 전체 종목 수
    breadthPct: number;         // 상승 비율 (0-100)
    adRatio: number;            // A/D Ratio (>1 = 건강)
    volumeBreadth: number;      // 상승 거래량 / 전체 거래량 (0-100)
    breadthScore: number;       // 0-100 정규화 (RLSI용)
    isDivergent: boolean;       // NQ↑ but Breadth<40% → 경고
    signal: 'STRONG' | 'HEALTHY' | 'NEUTRAL' | 'WEAK' | 'CRITICAL';
    timestamp: string;
    /**
     * 실제 시장 데이터로 계산된 값인가.
     * false 면 «데이터 없음»의 중립 기본값이다.
     *
     * ⚠️ 예전에는 UI 가 `breadthPct===50 && adRatio===1 && volumeBreadth===50` 로
     *    **추측**했다. 실제 폭이 정확히 50.0% 인 날에는 «데이터 없음»으로 오판한다.
     *    (Massive 시절부터 있던 휴리스틱 — 명시 플래그로 교체)
     */
    hasData: boolean;
    /** hasData=false 일 때의 사유 (진단용) */
    reason?: string;
    /**
     * 이 판독값의 원천 정규장 날짜(ET) — 장중이면 오늘, 장외(완료 세션 보관본·직전 정규장 판독값)면 그 세션 날짜.
     * [2026-10-19 묶음 3] 36h TTL 하나에 기대던 직전 정규장 값을 거래일별 보관본(lib/sessionArchive)으로 옮기며 같이 싣는다.
     */
    sourceSessionDate?: string | null;
}

// === CACHE CONFIG ===
const REDIS_KEY = 'guardian:breadth';
const REDIS_TTL = 300;  // 5 minutes
const MEMORY_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * 마지막 «정규장» 판독값 — POST/CLOSED 에서 이 값을 그대로 서빙한다.
 *
 * [세션 정책 · 정본]  src/components/guardian/MarketBreadthPanel.tsx
 *   REG          → 실시간 A/D
 *   POST         → **직전 정규장의 실제 판독값을 유지** (시간외로 다시 재지 않는다)
 *   PRE / CLOSED → 중립 (패널이 non-live 로 렌더)
 *
 * 왜 시간외에 다시 재면 안 되는가:
 *   A/D 는 정규장에 누적되는 지표다. 게다가 2026-08-29 실측으로
 *   시간외에는 13,064종목 중 5,002종목의 호가 스프레드가 20%를 넘어
 *   (EBMT 64% · BEPI 66%) 미드가 가격 대용이 되지 못한다.
 *   그 값으로 breadth 를 재계산하면 «가짜 급등» 이 섞인 폭이 나온다.
 */
const LAST_REG_KEY = 'guardian:breadth:lastreg';
const LAST_REG_TTL = 36 * 60 * 60;   // 36h — 옛 키(호환·장애 대체). ⚠️ 금→월 04:00 = 60h 라 혼자서는 주말을 못 넘는다
// → [2026-10-19] 정본은 거래일별 완료 세션 보관본 session:breadth:ALL:{YYYY-MM-DD}(8일, lib/sessionArchive) — 장외엔 이것부터 읽는다.

type Session = 'PRE' | 'REG' | 'POST' | 'CLOSED';

// 마지막으로 «완료된» 정규장의 거래일 = lib/sessionArchive.lastCompletedSessionDate (거래소 달력 — 휴장·조기 폐장 반영).
// [2026-10-19] 예전 이 파일의 lastCompletedTradingDate 는 주말만 알아 휴장 다음 날(화 PRE) 에 «월(휴장)»을 기대해 중립을 냈다.

/** rlsiEngine 과 동일 규칙. 순환 import 를 피하려고 여기 둔다. */
function marketSession(): Session {
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    if (et.getDay() === 0 || et.getDay() === 6) return 'CLOSED';
    const t = et.getHours() * 100 + et.getMinutes();
    if (t >= 400 && t < 930) return 'PRE';
    if (t >= 930 && t < 1600) return 'REG';
    if (t >= 1600 && t < 2000) return 'POST';
    return 'CLOSED';
}

let memoryCache: { data: BreadthSnapshot | null; expiry: number } = {
    data: null,
    expiry: 0
};

// === MAIN ENGINE ===

/**
 * Get Market Breadth - queries 5000+ US stocks via Massive Snapshot API
 * Uses 3-tier cache: Memory → Redis → Massive API
 */
export async function getMarketBreadth(nasdaqChangePct: number = 0): Promise<BreadthSnapshot> {
    const now = Date.now();
    const session = marketSession();
    let nonRegRequiresCompletedSession = false;

    // 0. 정규장이 아니면 «직전 정규장 판독값»을 그대로 돌려준다.
    //    (설계 정본: MarketBreadthPanel — POST 는 완료된 세션의 실제 값을 유지)
    //    정규장 판정은 거래소 달력으로도 한 번 더 — 평일 휴장·조기 폐장(13:00) 뒤엔 «장중 재측정» 대신 완료 세션 값.
    if (session !== 'REG' || !isInRegularSession(now)) {
        // 0-a. 완료 세션 보관본(거래일별 8일) — 달력의 «마지막으로 끝난 정규장» 날짜 키. 금→월·휴일 다음 날에도 남는다.
        try {
            const arch = await readSessionArchive<BreadthSnapshot>('breadth', 'ALL', { nowMs: now });
            if (arch && arch.value && arch.value.totalTickers > 0) {
                return { ...arch.value, sourceSessionDate: arch.stamp.sourceSessionDate, isDivergent: nasdaqChangePct > 0.3 && arch.value.breadthPct < 40 };
            }
        } catch { /* 보관본 결측 → 옛 키 */ }
        // 0-b. 옛 직전 정규장 키(36h) — 보관본이 없을 때만. 원천 날짜를 판독 시각에서 붙인다(숨기지 않는다).
        try {
            const lastReg = await getFromCache<BreadthSnapshot>(LAST_REG_KEY);
            if (lastReg && lastReg.totalTickers > 0) {
                const ts = Date.parse(lastReg.timestamp || '');
                const srcDate = lastReg.sourceSessionDate ?? (Number.isFinite(ts) ? etDateOf(ts) : null);
                console.log(`[Breadth] ${session}: 직전 정규장 판독값 유지 (${lastReg.advancers}↑/${lastReg.decliners}↓ @ ${lastReg.timestamp}) · 기대 세션 ${lastCompletedSessionDate(now)}`);
                return { ...lastReg, sourceSessionDate: srcDate, isDivergent: nasdaqChangePct > 0.3 && lastReg.breadthPct < 40 };
            }
        } catch (e) {
            console.warn('[Breadth] lastreg 조회 실패:', e);
        }
        // 폴백: 아래 일반 경로로 내려가되, **완료된 거래일의 전수 데이터일 때만** 쓴다.
        // 시간외 호가로 다시 재면 유동성 좋은 종목만 남은 편향 표본이 되고
        // (2026-08-29 실측: 13,064종목 중 스프레드 1% 이내는 1,212종목뿐),
        // 그걸 «오늘 폭»으로 내보내면 조용히 틀린 숫자가 된다.
        nonRegRequiresCompletedSession = true;
    }

    // 1. Memory Cache
    if (memoryCache.data && memoryCache.expiry > now) {
        // Re-evaluate divergence with latest NQ data
        const cached = { ...memoryCache.data };
        cached.isDivergent = nasdaqChangePct > 0.3 && cached.breadthPct < 40;
        return cached;
    }

    // 2. Redis Cache
    try {
        const redisData = await getFromCache<BreadthSnapshot>(REDIS_KEY);
        if (redisData) {
            console.log(`[Breadth] From Redis: ${redisData.advancers}↑ / ${redisData.decliners}↓`);
            memoryCache = { data: redisData, expiry: now + MEMORY_TTL_MS };
            redisData.isDivergent = nasdaqChangePct > 0.3 && redisData.breadthPct < 40;
            return redisData;
        }
    } catch (e) {
        console.warn('[Breadth] Redis read failed:', e);
    }

    // 3. Fresh Fetch
    console.log('[Breadth V7.0] Fetching Full Market Snapshot...');
    return await fetchFreshBreadth(nasdaqChangePct, nonRegRequiresCompletedSession);
}

/**
 * Fetch fresh breadth data from Massive Full Market Snapshot
 * Endpoint: /v2/snapshot/locale/us/markets/stocks/tickers
 */
async function fetchFreshBreadth(
    nasdaqChangePct: number,
    requireCompletedSession = false
): Promise<BreadthSnapshot> {
    const mkDefault = (reason: string) => createDefaultSnapshot(reason);

    try {
        // Full Market Snapshot — returns 10,000+ tickers in one call
        const data = await fetchMassive(
            '/v2/snapshot/locale/us/markets/stocks/tickers',
            {},
            true  // use cache
        );

        const tickers = data?.tickers;
        if (!tickers || tickers.length === 0) {
            console.warn('[Breadth] Empty snapshot response');
            return mkDefault('snapshot-empty');
        }

        // 비정규장: 스냅샷이 «마지막으로 완료된 정규장»의 것일 때만 신뢰한다.
        // (벌크 EOD 는 T+1 게시라 장 마감 직후에는 아직 어제 자료다)
        if (requireCompletedSession) {
            const snapDate = tickers.find((t: any) => t?._eodDate)?._eodDate || '';
            const want = lastCompletedSessionDate();
            if (snapDate !== want) {
                console.warn(`[Breadth] 비정규장 · 스냅샷 ${snapDate || '없음'} ≠ 완료 거래일 ${want} → 중립 반환`);
                return mkDefault(`stale-snapshot:${snapDate || 'none'}!=${want}`);
            }
        }

        // Filter: only count tickers with actual trading data
        const activeTickers = tickers.filter((t: any) =>
            t.day && t.day.v > 0 && t.todaysChangePerc !== undefined
        );

        if (activeTickers.length < 100) {
            console.warn(`[Breadth] Too few active tickers: ${activeTickers.length}`);
            return mkDefault(`too-few-active:${activeTickers.length}/${tickers.length}`);
        }

        // Count Advancers / Decliners
        let advancers = 0;
        let decliners = 0;
        let unchanged = 0;
        let advancerVolume = 0;
        let declinerVolume = 0;
        let totalVolume = 0;

        for (const t of activeTickers) {
            const change = t.todaysChangePerc || 0;
            const volume = t.day?.v || 0;

            totalVolume += volume;

            if (change > 0.01) {
                advancers++;
                advancerVolume += volume;
            } else if (change < -0.01) {
                decliners++;
                declinerVolume += volume;
            } else {
                unchanged++;
            }
        }

        const totalTickers = activeTickers.length;
        const breadthPct = totalTickers > 0 ? (advancers / totalTickers) * 100 : 50;
        const adRatio = decliners > 0 ? advancers / decliners : advancers > 0 ? 10 : 1;
        const volumeBreadth = totalVolume > 0 ? (advancerVolume / totalVolume) * 100 : 50;

        // Breadth Score: 0-100 normalized
        // Combines A/D ratio and volume breadth
        const adComponent = Math.min(100, Math.max(0, (adRatio / 3) * 100)); // 3:1 = 100
        const volComponent = volumeBreadth;
        const breadthScore = Math.round(adComponent * 0.6 + volComponent * 0.4);

        // Signal Classification
        let signal: BreadthSnapshot['signal'] = 'NEUTRAL';
        if (breadthPct >= 65 && volumeBreadth >= 60) signal = 'STRONG';
        else if (breadthPct >= 55) signal = 'HEALTHY';
        else if (breadthPct <= 30) signal = 'CRITICAL';
        else if (breadthPct <= 40) signal = 'WEAK';

        // Divergence: Index UP but breadth is weak
        const isDivergent = nasdaqChangePct > 0.3 && breadthPct < 40;

        const snapshot: BreadthSnapshot = {
            advancers,
            decliners,
            unchanged,
            totalTickers,
            breadthPct: Math.round(breadthPct * 10) / 10,
            adRatio: Math.round(adRatio * 100) / 100,
            volumeBreadth: Math.round(volumeBreadth * 10) / 10,
            breadthScore: Math.min(100, Math.max(0, breadthScore)),
            isDivergent,
            signal,
            timestamp: new Date().toISOString(),
            hasData: true
        };

        // Store in caches
        memoryCache = { data: snapshot, expiry: Date.now() + MEMORY_TTL_MS };
        setInCache(REDIS_KEY, snapshot, REDIS_TTL).catch(() => { });

        // 정규장 판독값은 별도 키로 보존한다 → 장 마감 후 POST 내내 이 값을 서빙.
        // [2026-10-19] 거래소 달력의 정규장 안일 때만(휴장 평일·조기 폐장 뒤 재측정이 «그날 정규장»으로 저장되지 않게) +
        //   거래일별 완료 세션 보관본에도(8일) — 마지막 장중 판독값이 그날의 확정본이 된다. 공급사 호출은 늘지 않는다(같은 스냅샷).
        const savedAt = Date.now();
        if (marketSession() === 'REG' && isInRegularSession(savedAt)) {
            snapshot.sourceSessionDate = etDateOf(savedAt);
            setInCache(LAST_REG_KEY, snapshot, LAST_REG_TTL).catch(() => { });
            await saveSessionArchive('breadth', 'ALL', snapshot.sourceSessionDate, snapshot, { observedAt: savedAt, minIntervalMs: 4 * 60 * 1000 }).catch(() => 'error');
        } else if (requireCompletedSession) {
            // 장외 대체 경로: 위에서 «완료 거래일의 전수 EOD 스냅샷»임을 확인한 값 — 그 세션의 확정본으로 보관한다(보관본이 비었을 때만 이 경로에 온다).
            const snapDate = tickers.find((t: any) => t?._eodDate)?._eodDate || null;
            if (snapDate) {
                snapshot.sourceSessionDate = snapDate;
                await saveSessionArchive('breadth', 'ALL', snapDate, snapshot, { observedAt: savedAt }).catch(() => 'error');
            }
        }

        console.log(`[Breadth V7.0] Complete: ${advancers}↑ ${decliners}↓ | Pct=${breadthPct.toFixed(1)}% | A/D=${adRatio.toFixed(2)} | VolBreadth=${volumeBreadth.toFixed(1)}% | Signal=${signal}`);
        return snapshot;

    } catch (error: any) {
        console.error('[Breadth] snapshot error:', error?.message);
        return mkDefault(`error:${String(error?.message || error).slice(0, 80)}`);
    }
}

/**
 * 중립 기본값.
 * ★ `reason` 은 진단용이다. 예전엔 «왜 비었는지»가 응답에 없어서
 *    프로덕션에서 0/50 만 보고 원인을 못 좁혔다(대표 지적 2회).
 *    사유를 계산해 놓고 로그에만 남기면 서버리스에선 사실상 사라진다.
 */
function createDefaultSnapshot(reason = 'unknown'): BreadthSnapshot {
    return {
        reason,
        advancers: 0,
        decliners: 0,
        unchanged: 0,
        totalTickers: 0,
        breadthPct: 50,
        adRatio: 1,
        volumeBreadth: 50,
        breadthScore: 50,
        isDivergent: false,
        signal: 'NEUTRAL',
        timestamp: new Date().toISOString(),
        hasData: false
    };
}

/**
 * [2026-10-19 묶음 3] 완료 세션 보관본 «채우기»(배포 직후 1회·보관본이 비었을 때) — 새 공급사 호출은 기본 0.
 *   ① 이미 보관본이 있으면 아무것도 안 한다.
 *   ② 옛 직전 정규장 키(guardian:breadth:lastreg)가 «마지막으로 끝난 정규장» 날짜의 판독값이면 그대로 옮긴다(호출 0).
 *   ③ allowSnapshot 일 때만: 장외 대체 경로(완료 거래일의 전수 EOD 스냅샷인지 확인 → 확정본 보관) — 스냅샷 1회(캐시 사용).
 */
export async function backfillBreadthArchive(opts: { nowMs?: number; allowSnapshot?: boolean } = {}): Promise<{ result: 'exists' | 'from-lastreg' | 'from-snapshot' | 'none'; sessionDate: string }> {
    const nowMs = opts.nowMs ?? Date.now();
    const want = lastCompletedSessionDate(nowMs);
    const have = await readSessionArchive<BreadthSnapshot>('breadth', 'ALL', { nowMs }).catch(() => null);
    if (have && have.value?.totalTickers > 0) return { result: 'exists', sessionDate: have.stamp.sourceSessionDate };
    const lastReg = await getFromCache<BreadthSnapshot>(LAST_REG_KEY).catch(() => null);
    const ts = Date.parse(lastReg?.timestamp || '');
    if (lastReg && lastReg.totalTickers > 0 && Number.isFinite(ts) && etDateOf(ts) === want) {
        const r = await saveSessionArchive('breadth', 'ALL', want, { ...lastReg, sourceSessionDate: want }, { observedAt: ts, nowMs });
        if (r === 'write') return { result: 'from-lastreg', sessionDate: want };
    }
    if (opts.allowSnapshot && !isInRegularSession(nowMs)) {
        const snap = await fetchFreshBreadth(0, true);
        if (snap.hasData && snap.sourceSessionDate === want) return { result: 'from-snapshot', sessionDate: want };
    }
    return { result: 'none', sessionDate: want };
}
