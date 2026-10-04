import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { isTradeInExtSession } from './extendedSessionClose';
import { etDateOf, isNonTradingDay, shownRegularSessionDate } from '@/lib/marketCalendar';
import { getETComponents, getTodayETString } from "@/services/marketDaySSOT";
import { findWeeklyExpiration } from "@/services/holidayCache";
import { getFromCache, setInCache, mgetFromCache } from "@/services/redisClient";
import {
    STRUCTURE_PRODUCER, LEVEL_BANDS, levelsFromStructure, applyLevelsToRealtime, levelsAt, setLevelEventSink, conformStructure,
    type OptionLevels, type GammaFlipType,
} from "@/lib/optionLevelGate";
import { isTooStaleLevels } from "@/lib/app/watchlistInsights";
import {
    staleFields, levelsStaleReason, chainFetchedAt, mergeSupplierDelay, supplierDelayLogLine, supplierDelayKey,
    VENDOR_EOD_KEY, VENDOR_EOD_TTL_SEC, SUPPLIER_DELAY_TTL_SEC, type SupplierDelayEntry,
} from "@/lib/levelsSupplierDelay";
// 레벨 매핑·정의대로 고르기·정의 게이트(순수 함수)는 lib/optionLevelGate.ts 에 있다 — 문(라우트)들은 여기서 가져가던 대로 쓴다.
export {
    STRUCTURE_PRODUCER, LEVEL_BANDS, NO_LEVELS, levelViolations, gateLevels, displayLevels, levelsFromStructure,
    applyLevelsToUnified, applyLevelsToRealtime, levelsAt, profileOf, rowSpot,
} from "@/lib/optionLevelGate";
export type { OptionLevels, DisplayLevels, LevelField, LevelProfile } from "@/lib/optionLevelGate";

import { atmStraddleImpliedMove, wallRangePct } from "@/lib/impliedMove";

// [S-69] Get next valid trading day for options expiration (skips weekends)
// [V45.17 FIX] Uses getETComponents for reliable ET timezone handling
export function getNextTradingDayET(): string {
    const et = getETComponents();

    // If Saturday (6), next trading day is Monday (+2)
    // If Sunday (0), next trading day is Monday (+1)
    // Otherwise, today (weekdays: options can expire today or later)
    let daysToAdd = 0;
    if (et.dayOfWeek === 6) {
        daysToAdd = 2; // Saturday -> Monday
    } else if (et.dayOfWeek === 0) {
        daysToAdd = 1; // Sunday -> Monday
    }

    const targetDate = new Date(et.year, et.month - 1, et.day + daysToAdd);
    return `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
}

async function fetchMassiveWithRetry(url: string, maxAttempts = 1): Promise<any> {
    const start = Date.now();
    let lastError: string = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const data = await fetchMassive(url, {}, false, undefined, CACHE_POLICY.LIVE);
            return { data, latency: Date.now() - start, success: true, attempts: attempt };
        } catch (e: any) {
            lastError = e.message;
            console.log(`[RETRY] Attempt ${attempt}/${maxAttempts} failed for ${url.slice(0, 60)}...: ${e.message}`);
            if (attempt < maxAttempts) {
                // Exponential backoff: 200ms, 400ms, 800ms...
                await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, attempt - 1)));
            }
        }
    }
    return { success: false, error: lastError, attempts: maxAttempts };
}

// [DATA CONSISTENCY] Cache for 60s during market, 72h during off-hours (preserve Friday data through weekend)
interface CachedResult {
    data: any;
    timestamp: number;
}
const structureCache = new Map<string, CachedResult>();
const CACHE_TTL_MARKET_MS = 60 * 1000; // 60 seconds during market
const CACHE_TTL_OFFHOURS_MS = 72 * 60 * 60 * 1000; // 72 hours off-hours (covers weekends + holidays)

/**
 * ★ 2026-09-15 — 인메모리 캐시만으로는 «항상 빠를» 수 없다.
 *
 * [대표 원칙] 「언제 어디에서 어느 순간에 보더라도 빛의 속도로 정확한 값」
 *
 * [무엇이 문제였나]  structureCache 는 `new Map()` 이다. Vercel 서버리스는
 *   인스턴스가 수시로 새로 뜨고, 새 인스턴스의 Map 은 비어 있다. 그래서
 *   «캐시가 있다»고 믿는 코드가 실제로는 자주 전체 계산을 다시 했다.
 *   실측: /api/live/premium-metrics 가 콜드에 **15,986ms**.
 *   그 안의 volatility-regime → getStructureData 사슬이 원인이었다.
 *
 * [고침]  인메모리 아래에 Redis 층을 하나 더 둔다.
 *   인메모리 미스 → Redis 조회 → 있으면 즉시 반환(그리고 인메모리에 채운다).
 *   인스턴스가 새로 떠도 «다른 인스턴스가 이미 계산해 둔 값»을 즉시 쓴다.
 *
 * [왜 TTL 을 두 벌로 두나]  장중엔 60초가 맞지만 장 마감 후에는 값이 안 변한다.
 *   주말 내내 같은 값을 다시 계산할 이유가 없다(72시간).
 *   나이는 응답의 `cached`·`_redisAgeSec` 로 드러내므로 «오래된 걸 숨기지» 않는다.
 */
const STRUCTURE_REDIS_PREFIX = "structure:v1:";
const STRUCTURE_LASTGOOD_PREFIX = "structure:lastgood:";
// [2026-09-29] 읽기 전용 소비처(/api/options/implied-move)가 같은 키를 쓰도록 내보낸다 — 키 문자열을 복제하지 않게
export const structureRedisKey = (cacheKey: string) => `${STRUCTURE_REDIS_PREFIX}${cacheKey}`;
export const structureLastGoodKey = (cacheKey: string) => `${STRUCTURE_LASTGOOD_PREFIX}${cacheKey}`;

// ════════════════════════════════════════════════════════════════════════════
// ★★ 옵션 레벨 «판본» — 종목당 저장본 하나, 모든 문이 같은 판본을 읽는다  [2026-09-30]
//
// [사고 — 9/29 23:1x·9/30 00:16 KST 운영 실측, 문 18개 감사 DEF 2·ONE 39]
//   · 구조 API 가 «마지막 정상본»을 57분(3,436초) 된 채로 줬다. 배경 갱신이 `after` 없이 떠 있는 약속이라 응답 뒤
//     인스턴스가 멈추면 안 돌았고, 저장본만 읽는 문(watchlist·portfolio·intel·command)은 갱신을 아예 걸지 않았다.
//     그 사이 현재가가 움직여 벽을 넘으면 게이트가 «—» 로 가렸다(CRWD 감마플립 220 @259.2).
//   · 인스턴스마다 메모리 사본(60초)이 달라 같은 순간 문마다 다른 판본이 나갔다(AMD 572.5 vs 577.5, LMT 545 vs 525).
//   · 저장본이 두 벌(structure:v1 60초 + structure:lastgood 72시간)이었다 — 같은 값을 두 번 쓰고 두 번 읽었다.
// [규칙] 레벨 판본(auto 만기)은 종목당 키 하나(structure:v2:{T}, 72시간). 구조 API 와 모든 문이 같은 읽기
//   (readStoredStructures, 메모리 사본 없음)로 가장 최근 판본을 받는다. 판본이 낡았으면(장중 60초·분포 없는 옛 판본·
//   체인 판본 뒤처짐) «그 판본을 즉시 주고» 갱신은 응답 뒤(`after`)에 — 인스턴스 간 잠금으로 종목당 한 번만.
//   체인 판본은 뒤로 가지 않는다: 새 계산의 chainDate 가 지금 판본보다 이르거나 없으면 저장하지 않는다.
//   (만기를 고른 요청 ?exp= 는 레벨 문이 아니다 — 예전 키 structure:v1:{T}:{exp} 그대로.)
// ════════════════════════════════════════════════════════════════════════════
const STRUCTURE_V2_PREFIX = "structure:v2:";
// [통합 9/30] 예상 변동 읽기 전용 문(impliedMoveService·/api/options/implied-move)이 같은 판본 키를 읽도록 내보낸다
export const structureV2Key = (ticker: string) => `${STRUCTURE_V2_PREFIX}${ticker}`;
const STRUCTURE_V2_TTL_SEC = 72 * 60 * 60;
/**
 * 옵션이 없는 종목(NO_MARKET)도 저장한다 — 매 요청 벤더를 다시 부르지 않게(30분, 3분마다 다시 확인).
 * ⚠️ 벤더가 잠깐 빈 체인을 주면 옵션 있는 종목도 NO_MARKET 이 된다(9/30 03:20 프리뷰 실측: IONQ 정상 판본 → 갱신 결과 NO_MARKET).
 *   그래서 «정상 판본이 있던 종목»의 NO_MARKET 은 벤더 실패로 보고 저장하지 않는다(지금 판본 유지).
 */
const NO_MARKET_TTL_SEC = 30 * 60;
/** 장중 판본 신선도 — 이보다 오래되면 응답 뒤 갱신(예전 structure:v1 장중 TTL 과 같다). */
const VERSION_FRESH_MS = 60 * 1000;
/** 돌파(표시 가격이 판본 레벨을 넘음)로 거는 갱신의 최소 간격 — 여러 문이 같은 순간 걸어도 한 번. */
const RESELECT_REFRESH_MIN_MS = 10 * 1000;
const REFRESH_LOCK_PREFIX = "structure:refresh:";
type StoredVersion = { data: any; timestamp: number };
/** Redis 를 못 읽을 때만 쓰는 인스턴스 기억(장애 때 매 요청 계산·벤더 폭주를 막는다). 평소에는 읽지 않는다 — 판본은 Redis 하나. */
const versionMemo = new Map<string, StoredVersion>();

/**
 * 같은 티커를 여러 요청이 동시에 재계산하는 것을 막는다(썬더링 허드).
 * 하나가 계산하는 동안 나머지는 마지막 정상본을 받아 간다.
 */
const inFlight = new Map<string, Promise<any>>();

function getStructureCacheTtl(): number {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const isMarket = utcDay >= 1 && utcDay <= 5 && utcMin >= 13 * 60 + 30 && utcMin <= 21 * 60;
    return isMarket ? CACHE_TTL_MARKET_MS : CACHE_TTL_OFFHOURS_MS;
}

// [DATA VALIDATION] Ensure calculated values are within valid ranges
interface DataValidation {
    isValid: boolean;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    checks: {
        pcr: boolean;
        maxPain: boolean;
        putFloor: boolean;
        callWall: boolean;
        gammaCoverage: boolean;
    };
    failures: string[];
}

function validateCalculations(
    pcr: number | null,
    maxPain: number | null,
    putFloor: number | null,
    callWall: number | null,
    underlyingPrice: number,
    gammaCoverage: number
): DataValidation {
    const failures: string[] = [];
    const checks = {
        pcr: false,
        maxPain: false,
        putFloor: false,
        callWall: false,
        gammaCoverage: false
    };

    // 1. P/C Ratio: should be between 0.1 and 5.0
    if (pcr !== null && pcr > 0.05 && pcr < 10) {
        checks.pcr = true;
    } else if (pcr !== null) {
        failures.push("pcr");
    }

    // 2. Max Pain: should be within ±30% of current price
    if (maxPain !== null && underlyingPrice > 0) {
        const deviation = Math.abs(maxPain - underlyingPrice) / underlyingPrice;
        if (deviation < 0.30) {
            checks.maxPain = true;
        } else {
            failures.push("maxPain");
        }
    }

    // 3. Put Floor: should be less than current price
    if (putFloor !== null && underlyingPrice > 0) {
        if (putFloor < underlyingPrice) {
            checks.putFloor = true;
        } else {
            failures.push("putFloor");
        }
    }

    // 4. Call Wall: should be greater than current price
    if (callWall !== null && underlyingPrice > 0) {
        if (callWall > underlyingPrice) {
            checks.callWall = true;
        } else {
            failures.push("callWall");
        }
    }

    // 5. Gamma Coverage: should be >= 50% for valid GEX
    if (gammaCoverage >= 0.50) {
        checks.gammaCoverage = true;
    } else {
        failures.push("gammaCoverage");
    }

    // Determine overall confidence
    const isValid = failures.length === 0;
    const confidence: "HIGH" | "MEDIUM" | "LOW" =
        failures.length === 0 ? "HIGH" :
            failures.length <= 1 ? "MEDIUM" : "LOW";

    return { isValid, confidence, checks, failures };
}


/**
 * @param spot  시세를 «미리 받아 온» 경우 주입한다. 주면 종목당 시세 1콜을 건너뛴다.
 *
 * ⚠️ [2026-09-03] 랭킹의 배치 생산자(structure-build)가 2,001종목을 돌 때
 *    종목당 시세를 부르니 **분당 한도가 약 500콜에서 소진**됐다(조각 0·1 은
 *    251/251 성공, 조각 3 은 0). `/api/live/quotes` 는 250종목을 1.8초에
 *    98.4% 로 준다 — 배치로 받아 여기에 넣으면 한도 문제가 사라진다.
 *    계산 로직은 건드리지 않는다. 스냅샷 모양만 만들어 끼워 넣어
 *    아래 흐름이 «네트워크로 받았을 때»와 한 글자도 다르지 않게 한다.
 */
/** 요청 범위 안이면 응답 뒤(`after`)에 돌린다 — Vercel 이 끝까지 기다린다. 요청 밖(스크립트)이면 하지 않는다. */
async function runAfterResponse(job: () => Promise<void>): Promise<boolean> {
    try {
        const { after } = await import('next/server');
        after(job);
        return true;
    } catch {
        return false;
    }
}

/** 판본을 갱신하는 계산의 최소 간격 — 벤더에서 직접 받은 판본(수집기 프로브 없음)은 호출이 많아 5분. */
function refreshMinMs(v: StoredVersion | null | undefined): number {
    if (v?.data?.options_status === 'NO_MARKET') return 3 * 60 * 1000;   // «옵션 없음»은 3분마다 다시 확인(벤더 빈 응답이었을 수 있다 — 9/30 IONQ·HOOD)
    return v?.data?.debug?.chainSource === 'vendor-direct' ? 5 * 60 * 1000 : VERSION_FRESH_MS;
}

const refreshMemo = new Map<string, number>();

/**
 * 판본 갱신 예약(응답 뒤). 같은 인스턴스는 메모로, 인스턴스 사이는 잠금 키(structure:refresh:{T})로 종목당 minMs 에 한 번.
 * prevChainDate = 지금 판본의 체인 날짜 — 새 계산이 이보다 이르거나 없으면 저장하지 않는다(판본은 뒤로 가지 않는다).
 */
function scheduleRefresh(ticker: string, opts: { reason: string; prevChainDate?: string | null; prevStatus?: string | null; minMs?: number }): boolean {
    const t = String(ticker || '').toUpperCase();
    if (!t) return false;
    const minMs = opts.minMs ?? VERSION_FRESH_MS;
    const now = Date.now();
    if (now - (refreshMemo.get(t) || 0) < minMs) return false;
    if (refreshMemo.size > 5000) refreshMemo.clear();
    refreshMemo.set(t, now);
    void runAfterResponse(async () => {
        const lockKey = `${REFRESH_LOCK_PREFIX}${t}`;
        const lockedAt = await getFromCache<number>(lockKey).catch(() => null);
        if (typeof lockedAt === 'number' && Date.now() - lockedAt < minMs) return;
        await setInCache(lockKey, Date.now(), Math.max(10, Math.ceil(minMs / 1000))).catch(() => false);
        // 지금 저장된 판본(응답 뒤라 사용자 경로 밖) — 체인 날짜·OI 합이 «판본 되돌림 방지»와 «판본 추정»의 기준이다.
        const cur = await getFromCache<StoredVersion>(structureV2Key(t)).catch(() => null);
        const run: ComputeOpts = {
            prevChainDate: cur?.data?.chainDate ?? opts.prevChainDate ?? null,
            prevOiSum: Number.isFinite(Number(cur?.data?.debug?.todayOI)) ? Number(cur!.data.debug.todayOI) : null,
            prevStatus: cur?.data?.options_status ?? opts.prevStatus ?? null,
            prevHasGamma: Array.isArray(cur?.data?.structure?.gexCum) && cur!.data.structure.gexCum.some((x: any) => x != null),
        };
        try {
            await getStructureData(t, null, null, true, run);
        } catch (e: any) {
            console.warn(`[structure] 판본 갱신 실패(${t}, ${opts.reason}):`, e?.message);
        }
        // 체인 판본이 뒤로 가서 저장하지 않았으면 같은 (낡은) 입력으로 1분마다 다시 계산하지 않게 5분 쉰다.
        if (run.stored === false) await setInCache(lockKey, Date.now() + 4 * 60 * 1000, 5 * 60).catch(() => false);
    });
    return true;
}

/**
 * 계산 경로 옵션 — prevChainDate: 지금 판본의 체인 날짜(판본 되돌림 방지) · stored: 저장했는지(계산 경로가 채운다) ·
 * noRefresh: 낡은 판본이어도 갱신을 걸지 않는다(배치 크론 structure-build 가 2,000종목을 돌 때 갱신 폭주·벤더 한도 소진 방지).
 */
export type ComputeOpts = { prevChainDate?: string | null; prevOiSum?: number | null; prevStatus?: string | null; prevHasGamma?: boolean; stored?: boolean; noRefresh?: boolean };

/** 판본 읽기 한 종목분 — vendorEod = 같은 mget 으로 읽은 «공급사 최신 체인 날짜»(levels:vendor-eod — 공급사 지연 판정의 기준) */
type StoredRead = { v: StoredVersion | null; meta: ProbeMeta | null; legacy: boolean; vendorEod: string | null };

/**
 * 판본 읽기 — 구조 API 와 모든 문이 쓰는 «하나». 한 번의 mget 으로 [판본, 판본표] × 종목 + 공급사 최신 체인 날짜(작은 키 하나).
 * 판본이 없는 종목만 옛 저장본(structure:lastgood:{T}:auto)을 한 번 더 본다 — 배포 직후 전환기(최대 72시간)에 빈칸을 막는다.
 * Redis 를 못 읽었으면 null(«없다»가 아니라 «모른다» — 계산 후보로 올리지 않는다, 장애 때 벤더로 몰리지 않게).
 */
async function readStoredStructures(tickers: string[], extraKeys: string[] = [], extrasOut?: any[]): Promise<Map<string, StoredRead> | null> {
    const syms = Array.from(new Set((tickers || []).map((t) => String(t || '').toUpperCase()).filter(Boolean)));
    const out = new Map<string, StoredRead>();
    if (!syms.length && !extraKeys.length) return out;
    let vals: any[];
    let vendorEod: string | null = null;
    try {
        // 부르는 쪽의 다른 키(예: live/ticker 응답 캐시)도 같은 mget 에 — Redis 왕복 한 번
        const all = await mgetFromCache<any>([...extraKeys, VENDOR_EOD_KEY, ...syms.flatMap((t) => [structureV2Key(t), `polygon:snapshot:probe:meta:${t}`])]);
        if (extrasOut) extrasOut.push(...all.slice(0, extraKeys.length));
        vendorEod = noteVendorEodRead(all[extraKeys.length]);
        vals = all.slice(extraKeys.length + 1);
    } catch { return null; }
    const missing: string[] = [];
    syms.forEach((t, i) => {
        const v = vals[2 * i];
        const ok = v && v.data && Number(v.timestamp) > 0;
        // 판본은 읽을 때 정의에 맞춘다(conformStructure — 교차점이 아닌 감마플립 = 옛 대체값 NEAR_ZERO 는 null). 구조 API·모든 문·원본을 읽는 라우트가 같은 값.
        out.set(t, { v: ok ? { data: conformStructure(v.data), timestamp: Number(v.timestamp) } : null, meta: vals[2 * i + 1] || null, legacy: false, vendorEod });
        if (!ok) missing.push(t);
    });
    if (missing.length) {
        const old = await mgetFromCache<any>(missing.map((t) => structureLastGoodKey(`${t}:auto`))).catch(() => null);
        if (old) missing.forEach((t, j) => {
            const v = old[j];
            if (v && v.data && Number(v.timestamp) > 0) out.set(t, { ...out.get(t)!, v: { data: conformStructure(v.data), timestamp: Number(v.timestamp) }, legacy: true });
        });
    }
    return out;
}

type VersionState = { state: 'fresh' | 'stale' | 'none'; reason: string; /** 이 까닭의 갱신 최소 간격(없으면 refreshMinMs) */ minMs?: number };

/**
 * 장외에 «너무 오래된» 체인 판본(isTooStaleLevels — 내 종목 지도·위젯이 레벨을 가리는 기준)을 다시 받는 최소 간격.
 * 장중은 나이(60초·직접 경로 5분)로 이미 갱신된다. 장외엔 나이로 갱신하지 않아, 아무도 안 보던 종목을 주말에 담으면
 * 월요일 개장까지 «레벨 갱신 대기»가 오지 않을 갱신을 약속했다(10/2 22:30 ET 운영 표본 286종목 중 59 — 9/30 에 받은 9/29 체인).
 * 공급사만 늦은 종목(다시 받아도 같은 옛 체인)은 이 간격으로만 다시 묻는다 — 공급사가 채우면 늦어도 이 간격 안에 돌아온다.
 */
const CHAIN_OLD_REFRESH_MS = 15 * 60 * 1000;

/** 판본을 쓸 수 있는가·낡았는가(순수 판정). none = 쓸 수 없음(없음·만기 지남) → 계산 대상. */
function versionState(r: { v: StoredVersion | null; meta: ProbeMeta | null; legacy: boolean } | undefined, todayET: string, now = Date.now()): VersionState {
    const v = r?.v;
    if (!v?.data) return { state: 'none', reason: 'none' };
    if (isCachedExpiryStale(v.data, todayET)) return { state: 'none', reason: 'expiry' };
    if (v.data.options_status === 'NO_MARKET') return { state: now - v.timestamp > refreshMinMs(v) ? 'stale' : 'fresh', reason: 'no-market' };
    if (r!.legacy || !Array.isArray(v.data.structure?.gexCum)) return { state: 'stale', reason: 'legacy' };
    if (chainBehindProbe(v.data, r!.meta)) return { state: 'stale', reason: 'chain-behind' };
    if (getStructureCacheTtl() === CACHE_TTL_MARKET_MS && now - v.timestamp > refreshMinMs(v)) return { state: 'stale', reason: 'age' };
    if (isTooStaleLevels(v.data.chainDate, now) && now - v.timestamp > CHAIN_OLD_REFRESH_MS) return { state: 'stale', reason: 'chain-old', minMs: CHAIN_OLD_REFRESH_MS };
    return { state: 'fresh', reason: 'fresh' };
}

// ════════════════════════════════════════════════════════════════════════════
// ★ [2026-10-03] 공급사 체인 지연 — 판정은 lib/levelsSupplierDelay(순수), 여기는 기준 날짜 유지·기록(EC2 Redis 전용 키 levels:*)
//   기준 = 판본을 저장할 때 본 가장 늦은 체인 날짜(공급사가 이미 내보낸 세션 — 앞으로만 민다). 판본 읽기(mget)에 같이 실린다.
//   감지 = 판본을 «새로 받아» 저장할 때(수집 경로) 그 체인이 받을 때부터 2세션 이상 늦었고 기준이 최신이면 → 그날 기록 키 + 운영 로그 한 줄.
// ════════════════════════════════════════════════════════════════════════════
const ymd10 = (d: unknown): string | null => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null);
let vendorEodMemo: { date: string | null; at: number } = { date: null, at: 0 };
const VENDOR_EOD_MEMO_MS = 10 * 60 * 1000;

/** 판본 읽기가 받은 기준 날짜를 기억에 합친다(앞으로만) — 계산 경로의 감지가 따로 읽지 않게. 읽은 값(없으면 기억)을 돌려준다. */
function noteVendorEodRead(rec: any): string | null {
    const d = ymd10(rec?.date);
    if (d && (!vendorEodMemo.date || d >= vendorEodMemo.date)) vendorEodMemo = { date: d, at: Date.now() };
    return d ?? vendorEodMemo.date;
}

/** 저장한 판본의 체인 날짜로 기준을 앞으로 민다(인스턴스 기억 10분 — 같은 날짜면 Redis 를 다시 읽지 않는다). 지금 기준을 돌려준다. */
async function advanceVendorEod(d: string, ticker: string, now: number): Promise<string | null> {
    if (d > etDateOf(now)) return vendorEodMemo.date;   // 미래 날짜(벤더 오류)는 기준으로 쓰지 않는다
    if (vendorEodMemo.date && d <= vendorEodMemo.date && now - vendorEodMemo.at < VENDOR_EOD_MEMO_MS) return vendorEodMemo.date;
    const cur = ymd10((await getFromCache<{ date?: string }>(VENDOR_EOD_KEY).catch(() => null))?.date);
    if (!cur || d > cur) {
        await setInCache(VENDOR_EOD_KEY, { date: d, seenAt: now, ticker }, VENDOR_EOD_TTL_SEC).catch(() => false);
        vendorEodMemo = { date: d, at: now };
        return d;
    }
    vendorEodMemo = { date: cur, at: now };
    return cur;
}

/** 같은 종목·같은 기준일은 인스턴스당 한 시간에 한 번만 기록한다(로그는 그날 기록에 처음 들어갈 때 한 줄). */
const delayRecordMemo = new Map<string, number>();
const DELAY_RECORD_MS = 60 * 60 * 1000;

/** 판본을 새로 받아 저장한 뒤(수집 경로) — 기준을 밀고, 이 종목만 공급사 체인이 늦었으면 기록한다. 실패해도 계산을 막지 않는다. */
async function noteStoredChain(ticker: string, data: any, now: number): Promise<void> {
    try {
        const d = ymd10(data?.chainDate);
        if (!d) return;
        const T = String(ticker || '').toUpperCase();
        const ref = await advanceVendorEod(d, T, now);
        const fetchedAt = chainFetchedAt(data, now);
        if (levelsStaleReason({ chainDate: d, fetchedAt, refChainDate: ref }, now) !== 'supplier-delay') return;
        const k = `${T}:${d}`;
        if (now - (delayRecordMemo.get(k) || 0) < DELAY_RECORD_MS) return;
        if (delayRecordMemo.size > 500) delayRecordMemo.clear();
        delayRecordMemo.set(k, now);
        const key = supplierDelayKey(etDateOf(now));
        const prev = await getFromCache<Record<string, SupplierDelayEntry>>(key).catch(() => null);
        const first = !prev?.[T] || prev[T].asOf !== d;
        await setInCache(key, mergeSupplierDelay(prev, T, { asOf: d, ref, at: now, fetchedAt }), SUPPLIER_DELAY_TTL_SEC).catch(() => false);
        if (first) console.warn(supplierDelayLogLine(T, d, ref, fetchedAt));
    } catch { /* 기록 실패가 판본 계산을 막지 않는다 */ }
}

/** 판본 한 벌의 «가린다면 그 까닭» — 응답에 싣는 두 필드(levelsStaleReason·levelsStaleAsOf). */
function staleOfVersion(v: StoredVersion, vendorEod: string | null, now = Date.now()) {
    return staleFields({ chainDate: v.data?.chainDate, fetchedAt: chainFetchedAt(v.data, v.timestamp), refChainDate: vendorEod ?? vendorEodMemo.date }, now);
}

/** 계산 결과를 판본으로 저장(await — 응답 뒤 갱신에서도 쓰기가 끝나야 한다). 체인 판본이 뒤로 가면 저장하지 않는다. */
async function storeVersion(ticker: string, data: any, timestamp: number, prevChainDate: string | null | undefined, ttlSec = STRUCTURE_V2_TTL_SEC): Promise<boolean> {
    if (prevChainDate && !(typeof data?.chainDate === 'string' && data.chainDate >= prevChainDate)) {
        console.warn(`[structure] ${ticker}: 새 계산의 체인 ${data?.chainDate ?? '없음'} < 지금 판본 ${prevChainDate} — 저장하지 않는다(판본은 뒤로 가지 않는다)`);
        return false;
    }
    return setInCache(structureV2Key(String(ticker).toUpperCase()), { data, timestamp }, ttlSec).catch(() => false);
}

/**
 * [2026-09-16] 캐시가 ET 날짜 경계를 넘어 살아남는다(장외 TTL 72h · lastgood 72h).
 * 9/15(월) 만기가 9/16 새벽에도 «선택지»로 나갔다(audit-expiration-selection --live 실측).
 * 캐시 «읽기» 에서 오늘(ET) 이전 만기를 걷어내고, 선택된 만기 자체가 지났으면 그 캐시는
 * 없는 것으로 본다 — 지난 계약의 스트라이크·OI 를 새 날짜 라벨로 내보내면
 * «라벨과 데이터 불일치»(조용히 틀리는 5유형)가 된다. 신선 계산 경로는 이미
 * todayStr 로 거르므로, 이 함수는 «캐시가 어제 만든 목록»을 위한 안전망이다.
 */
export function normalizeExpirationsForToday<T extends { expiration?: string; availableExpirations?: string[] }>(
    d: T,
    todayStr: string = getTodayETString(),
): T {
    if (!d || typeof d !== 'object') return d;
    const list = Array.isArray(d.availableExpirations)
        ? d.availableExpirations.filter((x) => typeof x === 'string' && x >= todayStr)
        : d.availableExpirations;
    return { ...d, availableExpirations: list };
}

/** 캐시된 응답의 «선택 만기»가 오늘(ET)보다 앞이면 그 캐시는 쓰면 안 된다. */
function isCachedExpiryStale(data: any, todayStr: string): boolean {
    const exp = data?.expiration;
    return typeof exp === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(exp) && exp < todayStr;
}

/**
 * ★★ [2026-09-25] 체인 «판본» — 미결제약정이 며칠 자 EOD 인가.
 *
 * [사고] 9/25 12:50 KST(=9/24 23:50 ET) 표본 7종목 중 COST·MCD 의 맥스페인·콜월이 나스닥 공개
 *   체인과 달랐다(COST 910 vs 905 · MCD 250 vs 242.5, 콜월 255 vs 250). 계산은 맞았다 — 입력이
 *   하루 늦었다. 장중(9/24)에 9/23 EOD 체인으로 계산한 값이 장외 신선 TTL(72시간) 동안,
 *   즉 새 EOD(9/24)가 공표된 뒤 밤새(=한국 낮) 그대로 나갔다. 수집기의 체인 캐시도 하루
 *   늦었다(scripts/lambda-flow-harvest/intrinio-adapter.js 의 cachedChain — 같은 날 수리).
 *
 * [규칙] 수집기는 프로브와 함께 수십 바이트짜리 «판본표»(polygon:snapshot:probe:meta:{T})를
 *   쓴다. 캐시된 값의 chainDate 가 판본표의 같은 만기 체인 날짜보다 앞이면 그 캐시는 쓰지
 *   않는다(다시 계산 = 프로브를 읽을 뿐, 벤더 호출 없음). 판본표가 없으면(수집기 배포 전·
 *   프로브 없음) 판단하지 않는다 — 예전과 같다. 장중(신선 TTL 60초)에는 어차피 곧 다시
 *   계산하므로 판본표를 읽지 않는다.
 */
type ProbeMeta = { chainDate?: string | null; chainDates?: Record<string, string> | null; weeklyExpiry?: string | null; _ts?: number };
const probeMetaMemo = new Map<string, { at: number; meta: ProbeMeta | null }>();
const PROBE_META_MEMO_MS = 30_000;

async function readProbeMeta(ticker: string): Promise<ProbeMeta | null> {
    const hit = probeMetaMemo.get(ticker);
    if (hit && Date.now() - hit.at < PROBE_META_MEMO_MS) return hit.meta;
    let meta: ProbeMeta | null = null;
    try { meta = await getFromCache<ProbeMeta>(`polygon:snapshot:probe:meta:${ticker}`); } catch { meta = null; }
    probeMetaMemo.set(ticker, { at: Date.now(), meta });
    return meta;
}

/** 캐시 값이 판본표보다 오래된 체인으로 계산됐으면 그 이유를, 아니면 null. */
function chainBehindProbe(data: any, meta: ProbeMeta | null): string | null {
    if (!meta || !data) return null;
    const exp = data.expiration;
    const want = (exp && meta.chainDates?.[exp]) || (exp && exp === meta.weeklyExpiry ? meta.chainDate : null);
    if (!want) return null;
    const have = data.chainDate;
    if (!have) return `체인 날짜 없음(판본표 ${want})`;   // 이 수리 전에 계산된 값 — 한 번 다시 계산한다
    return have < want ? `체인 ${have} < 판본표 ${want}` : null;
}

/** 이 캐시 값을 써도 되는가 — 만기가 지났거나 체인 판본이 뒤처졌으면 안 된다(이유를 로그에 남긴다). */
function cachedStructureUnusable(data: any, todayStr: string, meta: ProbeMeta | null, ticker: string, where: string): boolean {
    if (isCachedExpiryStale(data, todayStr)) {
        console.log(`[${where} STALE-EXPIRY] ${ticker}: 캐시 만기 ${data?.expiration} < ${todayStr} — 쓰지 않는다`);
        return true;
    }
    const behind = chainBehindProbe(data, meta);
    if (behind) {
        console.log(`[${where} STALE-CHAIN] ${ticker}: ${behind} — 쓰지 않는다(프로브로 다시 계산)`);
        return true;
    }
    return false;
}

/** 계약 목록이 밝힌 EOD 날짜(가장 늦은 것). Vercel 직접 경로 계약은 `_intrinio.date` 를 싣는다. */
function contractsChainDate(contracts: any[]): string | null {
    let d: string | null = null;
    for (const c of contracts || []) {
        const x = c?._intrinio?.date;
        if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && (!d || x > d)) d = x;
    }
    return d;
}

export async function getStructureData(
    ticker: string,
    requestedExp?: string | null,
    spot?: { price: number; prevClose?: number | null } | null,
    /** 갱신 경로 — 저장본으로 되돌아가지 않고 실제로 계산한다 */
    skipLastGood = false,
    /** 갱신 경로 옵션(판본 되돌림 방지·저장 여부) — scheduleRefresh 가 쓴다 */
    computeOpts: ComputeOpts = {},
): Promise<any> {
    const cacheKey = `${ticker}:${requestedExp || 'auto'}`;
    const todayET = getTodayETString();

    if (!requestedExp) {
        // ★★ [2026-09-30] 레벨 판본(auto 만기) — 모든 문과 같은 읽기 하나(readStoredStructures), 메모리 사본 없음.
        //   판본이 있으면 «즉시» 준다(낡았으면 응답 뒤 갱신 예약). 없을 때만 여기서 계산한다(같은 인스턴스 동시 요청은 한 번).
        //   «사용자를 기다리게 하지 않는다»(9/15) — 몇 초 된 판본이 15초 빈 화면보다 낫고, 나이는 _staleSec·levelsAsOf 로 드러낸다.
        if (!skipLastGood) {
            const T = String(ticker || '').toUpperCase();
            const got = await readStoredStructures([T]).catch(() => null);
            const memo = versionMemo.get(T);
            const r: StoredRead | undefined = got ? got.get(T) : (memo ? { v: memo, meta: null, legacy: false, vendorEod: null } : undefined);   // Redis 장애 때만 기억
            const vs = versionState(r, todayET);
            if (got && r?.v) { if (versionMemo.size > 2000) versionMemo.clear(); versionMemo.set(T, r.v); }
            if (r?.v && vs.state !== 'none') {
                if (vs.state === 'stale' && !computeOpts.noRefresh) scheduleRefresh(T, { reason: vs.reason, prevChainDate: r.v.data?.chainDate ?? null, prevStatus: r.v.data?.options_status ?? null, minMs: vs.minMs ?? refreshMinMs(r.v) });
                const ageSec = Math.round((Date.now() - r.v.timestamp) / 1000);
                return normalizeExpirationsForToday({
                    ...r.v.data, cached: true, levelsAsOf: r.v.timestamp,
                    ...(vs.state === 'fresh' ? { _redisAgeSec: ageSec } : { _staleSec: ageSec }),
                    // 가린다면 그 까닭(공급사 체인 지연 · 그 밖) — 모든 문과 같은 판정(lib/levelsSupplierDelay)
                    ...staleOfVersion(r.v, r.vendorEod),
                }, todayET);
            }
            const flightKey = `auto:${T}`;
            const running = inFlight.get(flightKey);
            if (running) return running;
            const job = getStructureData(ticker, null, spot, true, computeOpts).finally(() => { inFlight.delete(flightKey); });
            inFlight.set(flightKey, job);
            return job;
        }
    } else {
        // 만기를 고른 요청(?exp=) — 레벨 문이 아니다. 예전 규칙 그대로(인메모리 60초 → Redis structure:v1 → 계산).
        // 장외(신선 TTL 72시간)에만 판본표를 본다 — 장중 60초 캐시는 어차피 곧 다시 계산한다.
        const probeMeta = getStructureCacheTtl() > CACHE_TTL_MARKET_MS ? await readProbeMeta(ticker) : null;
        const cached = structureCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < getStructureCacheTtl()) {
            if (cachedStructureUnusable(cached.data, todayET, probeMeta, ticker, 'CACHE')) {
                structureCache.delete(cacheKey);
            } else {
                return normalizeExpirationsForToday({ ...cached.data, cached: true }, todayET);
            }
        }
        try {
            const shared = await getFromCache<{ data: any; timestamp: number }>(structureRedisKey(cacheKey));
            if (shared?.data && cachedStructureUnusable(shared.data, todayET, probeMeta, ticker, 'REDIS')) {
                /* 쓰지 않는다 — 이유(만기 지남·체인 판본 뒤처짐)는 위 함수가 로그에 남겼다 */
            } else if (shared?.data && shared.timestamp && (Date.now() - shared.timestamp) < getStructureCacheTtl()) {
                const ageSec = Math.round((Date.now() - shared.timestamp) / 1000);
                structureCache.set(cacheKey, { data: shared.data, timestamp: shared.timestamp });
                return normalizeExpirationsForToday({ ...shared.data, cached: true, _redisAgeSec: ageSec }, todayET);
            }
        } catch (e) {
            // Redis 가 죽어도 계산으로 넘어가면 된다 — 캐시는 «빠르게 하는 것»이지 «필수»가 아니다
            console.warn(`[structure] Redis 공유 캐시 조회 실패(${ticker}):`, (e as any)?.message);
        }
    }

    const spotUrl = `/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`;
    const spotRes = spot && Number(spot.price) > 0
        ? {
            success: true,
            data: {
                ticker: {
                    lastTrade: { p: spot.price },
                    min: { c: spot.price },
                    day: { c: spot.price },
                    prevDay: { c: Number(spot.prevClose) > 0 ? Number(spot.prevClose) : 0 },
                },
            },
        }
        : await fetchMassiveWithRetry(spotUrl, 2);

    let underlyingPrice = 0;
    let prevClose = 0;
    let changePercent = 0;
    // [S-78] Extended session data for Command-style display
    let extended: { postPrice?: number; postChangePct?: number; prePrice?: number; preChangePct?: number } | null = null;
    let session: 'PRE' | 'REG' | 'POST' | 'CLOSED' = 'CLOSED';

    // [DEBUG] Log spot fetch result
    console.log(`[STRUCTURE DEBUG] ${ticker}: spotRes.success=${spotRes.success}, hasData=${!!spotRes.data}, hasTicker=${!!spotRes.data?.ticker}`);

    if (spotRes.success && spotRes.data?.ticker) {
        const T = spotRes.data.ticker;
        underlyingPrice = T.lastTrade?.p || T.min?.c || T.day?.c || T.prevDay?.c || 0;
        prevClose = T.prevDay?.c || 0;

        // [DEBUG] Log price extraction
        console.log(`[STRUCTURE DEBUG] ${ticker}: underlyingPrice=${underlyingPrice}, lastTrade.p=${T.lastTrade?.p}, min.c=${T.min?.c}, day.c=${T.day?.c}, prevDay.c=${T.prevDay?.c}`);

        // Calculate change percent
        if (prevClose > 0 && underlyingPrice > 0) {
            changePercent = Math.round(((underlyingPrice - prevClose) / prevClose) * 10000) / 100;
        }

        // [S-78] Session detection and extended price extraction
        // [V45.17 FIX] Use getETComponents for reliable ET timezone
        const etComponents = getETComponents();
        const etTime = etComponents.hour * 60 + etComponents.minute;
        const dayOfWeek = etComponents.dayOfWeek;

        // Weekend = CLOSED
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            session = 'CLOSED';
        } else if (etTime >= 240 && etTime < 570) {
            session = 'PRE';
        } else if (etTime >= 570 && etTime < 960) {
            session = 'REG';
        } else if (etTime >= 960 && etTime < 1200) {
            session = 'POST';
        } else {
            session = 'CLOSED';
        }

        // Extract extended hours prices from Polygon snapshot
        // Post-market: After regular close, show post price
        // Pre-market: Before regular open, show pre price
        const dayClose = T.day?.c || 0; // Regular session close
        const lastTradePrice = T.lastTrade?.p || 0;

        // ★ [2026-09-25] «값이 종가와 다르다»가 아니라 «체결 시각»으로 가른다.
        //   지연 피드(15분)는 16:0x 에 정규장 체결을, 04:0x 에 어제 애프터 체결을 마지막 체결로 준다.
        //   애프터 거래가 없던 날 마감 뒤엔 정규장 마지막 체결(공식 종가와 몇 센트 차이)이 POST 로 나갔다.
        //   PRE 기준선 = 마지막 정규장 종가(프리마켓의 day.c) — prevDay.c 는 그 하나 앞이다.
        const ltMs = Number(T.lastTrade?.t) > 0 ? Math.round(Number(T.lastTrade.t) / 1e6) : 0;
        const nowMs = Date.now();
        // 휴장일은 시계로 모른다 — 시간외 판정에서만 CLOSED 로 본다(구조 데이터의 session 필드는 건드리지 않는다)
        const extSession = isNonTradingDay(etDateOf(nowMs)) ? 'CLOSED' : session;
        if (extSession === 'POST' || extSession === 'CLOSED') {
            const d = extSession === 'POST' ? etDateOf(nowMs) : shownRegularSessionDate(nowMs);
            if (lastTradePrice > 0 && dayClose > 0 && isTradeInExtSession(ltMs, d, 'post')) {
                const postChangePct = (lastTradePrice - dayClose) / dayClose;
                extended = {
                    postPrice: lastTradePrice,
                    postChangePct: postChangePct
                };
            }
        } else if (extSession === 'PRE') {
            const preBase = dayClose || prevClose;
            if (lastTradePrice > 0 && preBase > 0 && isTradeInExtSession(ltMs, etDateOf(nowMs), 'pre')) {
                const preChangePct = (lastTradePrice - preBase) / preBase;
                extended = {
                    prePrice: lastTradePrice,
                    preChangePct: preChangePct
                };
            }
        }
    } else {
        console.error(`[STRUCTURE DEBUG] ${ticker}: SPOT FETCH FAILED! Error: ${spotRes.error || 'unknown'}`);
    }

    // 2. [S-71] Two-Phase Fetch: First get expirations, then fetch exact weekly expiration
    const todayStr = getNextTradingDayET();

    let availableExpirations: string[] = [];
    let targetExpiry: string = '';
    let allContracts: any[] = [];
    // ★ [2026-09-27] 체인 «완결성» — 받은 체인이 잘렸는지(다음 페이지 미수신)·원천에서 빠진 만기가 있는지.
    //   예전엔 알 방법이 없었다: 실패한 만기는 조용히 사라지고 빠진 OI·감마는 0 으로 채워졌다.
    //   응답의 partial·partialReason·contractsFetched 로 밝힌다.
    const partialReasons: string[] = [];
    let sourceExpirationsMissing: string[] = [];   // 원천 스냅샷(수집기·probe)에서 빠진 만기
    let expirationFallbackFrom: string | null = null;   // 요청 만기를 못 써서 다른 만기로 대체했을 때만
    let vendorFailedSeen = false;   // 벤더 실패 표식을 봤다 — NO_MARKET 이 아니라 PENDING 의 근거
    let vendorChain: { rows: number; pages: number; keys: string[] } | null = null;   // 직접 경로: 벤더 응답 모양(페이지·최상위 키)
    let pagesFetched = 0;
    let latencyTotal = 0;
    let attemptsTotal = 0;
    // [2026-09-29] 수집기 체인의 호가가 실시간인가(greeksSource)·언제 받았나(_ts) — 예상 변동의 기준·시각 라벨
    let chainQuotes: { live: boolean | null; at: number | null } = { live: null, at: null };
    let usedLambdaCache = false;
    let isNoMarketDetected = false; // [NEW] Track definitive lack of options
    // [2026-09-25] 이 체인의 EOD 날짜 — 맥스페인·콜월·풋플로어가 «며칠 자 미결제약정»인지 응답에 싣는다.
    let chainDate: string | null = null;
    // 프로브를 누가·언제 썼는지(수집 Lambda·온디맨드) — 판본이 문마다 갈릴 때 원인을 지목하는 근거(응답 debug)
    let probeSource: string | null = null;
    let probeTs: number | null = null;

    // [PERF] Check Lambda-warmed raw snapshot cache FIRST — skip ALL Polygon calls if hit
    try {
        const lambdaCache = await getFromCache<any>(`polygon:snapshot:probe:${ticker}`);
        if (lambdaCache && lambdaCache._ts && (Date.now() - lambdaCache._ts) < 259200000 // 72h max (weekend preservation)
            && lambdaCache.exactResults && lambdaCache.exactResults.length > 0
            && lambdaCache.weeklyExpiry) {
            
            // ⚠️ [2026-09-13] 캐시 TTL 이 72시간이라 «주말을 넘기면 만기가 죽는다».
            //   실측(9/13 토): XLF·XLE·XLK·SLV 가 2026-09-11 체인으로 응답했고
            //   status=OK · confidence=HIGH 였다. 금요일에 이미 만료된 계약이다.
            //   centralDataHub 에서 같은 버그를 고쳤지만 «여기»는 그대로였다.
            //   캐시는 신선도(_ts)만 봤지 «내용의 유효기간»은 안 봤다 — 둘은 다르다.
            const lcExpiryAlive = lambdaCache.weeklyExpiry >= todayStr;
            if (!lcExpiryAlive) {
                console.log(`[STRUCTURE] LAMBDA CACHE REJECTED for ${ticker}: expiry ${lambdaCache.weeklyExpiry} < ${todayStr} (이미 만료)`);
            }
            // ★ [2026-10-03] 프로브로는 «너무 오래된»(화면이 레벨을 가리는 기준) 판본을 새로 바꿀 수 없으면 벤더에서 직접 받는다:
            //   ① 프로브 체인 날짜가 너무 오래됐는데 공급사는 다른 종목에 더 늦은 세션을 이미 냈다(기준 날짜 vendorEodMemo) —
            //      수집기가 그 종목을 놓아 둔 72시간 안에는 다시 계산해도 같은 옛 체인이었다. 공급사 전체가 멈췄으면(기준도 같이 늙음) 프로브를 쓴다.
            //   ② 날짜 없는 프로브(옛 코드 수집 Lambda)인데 지금 판본이 너무 오래됐다 — 날짜 없는 계산은 «판본 되돌림 방지»가 저장을 막아
            //      판본이 그 자리에 굳었다(10/3 미리보기 실측 ALKS: 9/30 판본·9/29 체인, 프로브 lambda-flow-harvest 2.3시간·chainDate 없음,
            //      벤더 최신 10/2 체인 46계약). 다시 받는 갱신 경로에서만 일어난다(prevChainDate 는 갱신 예약이 싣는다).
            const lcChain = lambdaCache.chainDate ?? lambdaCache.chainDates?.[lambdaCache.weeklyExpiry] ?? null;
            const lcNow = Date.now();
            const lcChainOld = lcChain
                ? isTooStaleLevels(lcChain, lcNow) && !!vendorEodMemo.date && vendorEodMemo.date > String(lcChain).slice(0, 10)
                : !!computeOpts.prevChainDate && isTooStaleLevels(computeOpts.prevChainDate, lcNow);
            if (lcChainOld) {
                console.log(`[STRUCTURE] LAMBDA CACHE REJECTED for ${ticker}: ${lcChain ? `chain ${lcChain} 너무 오래됨(공급사 최신 ${vendorEodMemo.date})` : `날짜 없는 프로브 · 지금 판본 ${computeOpts.prevChainDate} 너무 오래됨`} — 벤더에서 직접 받는다`);
            }
            // Lambda has everything we need: expiry + full chain
            if (lcExpiryAlive && !lcChainOld && (!requestedExp || lambdaCache.weeklyExpiry === requestedExp)) {
                allContracts = lambdaCache.exactResults;
                targetExpiry = lambdaCache.weeklyExpiry;
                chainDate = lambdaCache.chainDate ?? lambdaCache.chainDates?.[targetExpiry] ?? null;
                // 목록에서도 지운다 — 화면이 죽은 만기를 «고를 수» 없게.
                availableExpirations = (lambdaCache.expirations || []).filter((d: string) => d >= todayStr);
                chainQuotes = { live: lambdaCache.greeksSource === 'realtime', at: Number(lambdaCache._ts) || null };
                pagesFetched = 1;
                usedLambdaCache = true;
                probeSource = typeof lambdaCache._source === 'string' ? lambdaCache._source : 'lambda-flow-harvest(옛 코드: _source 없음)';
                probeTs = Number(lambdaCache._ts) || null;
                console.log(`[STRUCTURE] LAMBDA CACHE HIT for ${ticker}: ${allContracts.length} contracts, expiry=${targetExpiry}`);
                // 수집기가 저장한 완결성 표식(2026-09-27 수집기 배포부터 실린다 — 없으면 판단하지 않는다).
                if (Array.isArray(lambdaCache.expirationsTruncated) && lambdaCache.expirationsTruncated.includes(targetExpiry)) {
                    partialReasons.push('chain_truncated');
                }
                if (Array.isArray(lambdaCache.expirationsMissing)) sourceExpirationsMissing = lambdaCache.expirationsMissing;
            }
        }
    } catch {
        // Redis unavailable — fall through to Polygon
    }

    if (!usedLambdaCache) {
        // [Fix 2026-04-10] Use Snapshot probe ONLY (Reference API causes massive timeouts)
        //
        // ★ [2026-08-30] 여기에 `let availableExpirations` / `let targetExpiry` 를
        //   **다시 선언**하고 있었다(섀도잉). 그러면 이 블록 안의 대입이 바깥 변수에
        //   닿지 않아, Lambda 캐시가 없는 종목은 응답의 expiration 이 빈 문자열,
        //   availableExpirations 가 빈 배열로 나간다.
        //   실측: 같은 섹터에서 AVGO(캐시 적중)는 만기 8개인데 **TSM 은 0개**.
        //   계약은 안쪽 targetExpiry 로 받아오므로 strikes 는 채워지고 «메타만»
        //   비는, 알아채기 어려운 형태였다.
        //   재선언을 지운다 — 바깥 변수를 그대로 쓴다.

        const probeUrl = `/v3/snapshot/options/${ticker}?expiration_date.gte=${todayStr}&limit=250&sort=expiration_date&order=asc`;
        try {
            // [Fix 2026-04-10] Only 1 attempt for probe API
            const probeRes = await fetchMassiveWithRetry(probeUrl, 1);
            if (probeRes.success) {
                // ★ [2026-09-27] 벤더 «실패»(만기 목록 조회 실패·요청한 체인 전부 누락)는 «옵션 없음»이 아니다.
                //   예전엔 둘 다 빈 결과로 와서 NO_MARKET 이 됐다 — 한도 초과 한 번에 «옵션 시장 없음»이 떴다.
                if (probeRes.data?.vendorFailed) {
                    vendorFailedSeen = true;
                    console.warn(`[OPTIONS] ${ticker} probe: 벤더 실패 — NO_MARKET 으로 보지 않는다`);
                } else if (probeRes.data?.results?.length === 0) {
                    isNoMarketDetected = true;
                } else if (probeRes.data?.results) {
                    isNoMarketDetected = false; // Reset just in case
                    if (Array.isArray(probeRes.data.expirationsMissing)) sourceExpirationsMissing = probeRes.data.expirationsMissing;
                    // ⚠️ [2026-09-13] 만든 «그 자리»에서 지난 만기를 거른다.
                    //   probeUrl 에 expiration_date.gte 가 걸려 있지만 그건 벤더의 약속일 뿐이고,
                    //   이 목록은 그대로 화면의 만기 선택지가 된다. 약속이 아니라 값으로 막는다.
                    // ★ [2026-09-27] 목록은 «받아 온 계약»이 아니라 «요청한 만기»로 만든다. 체인 하나가 실패하면
                    //   그 만기(주간일 수도 있다)가 목록에서 사라져 다른 만기가 조용히 주간으로 뽑혔다.
                    const listed: string[] = Array.isArray(probeRes.data.expirationsRequested)
                        ? probeRes.data.expirationsRequested
                        : probeRes.data.results.map((c: any) => c.details?.expiration_date || c.expiration_date);
                    const exps = (Array.from(new Set(listed)).filter(Boolean).sort() as string[]).filter((d) => d >= todayStr);

                    console.log(`[OPTIONS] ${ticker} probe expirations:`, exps.slice(0, 8).join(', '));

                    if (exps.length > 0) {
                        availableExpirations = exps.slice(0, 10);

                        // ★ [2026-09-27] 요청 만기가 이 목록에 없다고 «주간»으로 몰래 바꾸지 않는다. 목록은 개수 상한
                        //   (벤더 8개·여기 10개)이 있어 뒤쪽 만기는 원래 안 들어온다 — 그런데 응답 만기가 요청과 달라도
                        //   아무 표시가 없었다. 지나지 않은 만기면 아래 Phase 2 가 그 만기를 직접 받는다.
                        //   지난 만기(또는 날짜가 아닌 값)만 주간으로 대체하고, 대체했다고 응답에 밝힌다.
                        if (requestedExp && /^\d{4}-\d{2}-\d{2}$/.test(requestedExp) && requestedExp >= todayStr) {
                            targetExpiry = requestedExp;
                        } else {
                            if (requestedExp) expirationFallbackFrom = requestedExp;
                            targetExpiry = await findWeeklyExpiration(exps);
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`[OPTIONS] Snapshot probe failed for ${ticker}:`, e);
        }

        // Ultimate fallback
        if (!targetExpiry) {
            targetExpiry = requestedExp || todayStr;
        }

        // Phase 2: Fetch EXACT expiration from Polygon
        if (!isNoMarketDetected) {
            const exactUrl = `/v3/snapshot/options/${ticker}?expiration_date=${targetExpiry}&limit=250`;
            let chainUrl = exactUrl;

            try {
                // [DATA INTEGRITY] Fetch up to 10 pages
                while (chainUrl && pagesFetched < 10) {
                    const res = await fetchMassiveWithRetry(chainUrl, 3);
                    attemptsTotal += res.attempts || 1;
                    latencyTotal += res.latency || 0;

                    if (!res.success || !res.data?.results) break;
                    // ★ [2026-09-27] 벤더 실패(이 만기 체인 누락)는 NO_MARKET 이 아니다 — PENDING 으로 남긴다.
                    if (res.data.vendorFailed) { vendorFailedSeen = true; break; }

                    if (res.data.results.length === 0 && pagesFetched === 0) {
                        // ★ [2026-09-27] 옵션 시장 유무는 probe(만기 목록)가 판정한다. 목록에 있던 만기의 빈 체인은
                        //   «빈 응답»(한도 초과의 지문)이지 «옵션 없음»이 아니다 — 예전엔 NO_MARKET 이 됐다.
                        break;
                    }

                    allContracts = allContracts.concat(res.data.results);
                    pagesFetched++;
                    if (Array.isArray(res.data.expirationsTruncated) && res.data.expirationsTruncated.includes(targetExpiry)) {
                        partialReasons.push('chain_truncated');
                    }
                    if (res.data.chainPages?.[targetExpiry]) vendorChain = res.data.chainPages[targetExpiry];

                    chainUrl = res.data.next_url || '';
                }
                // Massive 식 next_url 이 10쪽 상한에 닿았는데 더 남았다 = 잘림
                if (chainUrl && pagesFetched >= 10) partialReasons.push('chain_truncated');
            } catch (e) {
                console.log(`[OPTIONS] Fetch error for ${ticker}:`, e);
            }
        }
    }


    if (allContracts.length === 0) {
        const empty = {
            ticker, expiration: targetExpiry, underlyingPrice,
            options_status: isNoMarketDetected ? "NO_MARKET" : "PENDING",
            structure: { strikes: [], callsOI: [], putsOI: [] },
            maxPain: null, netGex: null, sourceGrade: "C",
            availableExpirations,
            partial: false, partialReason: null, contractsFetched: 0,
            ...(expirationFallbackFrom ? { expirationFallbackFrom } : {}),
            debug: { apiStatus: 404, pagesFetched, contractsFetched: 0, vendorFailed: vendorFailedSeen, sourceExpirationsMissing }
        };
        // 옵션이 없다고 «확정»된 종목은 판본으로 남긴다(30분, 3분마다 재확인) — 문마다 매 요청 벤더를 다시 부르지 않게. 실패(PENDING)는 남기지 않는다.
        // 정상 판본이 있던 종목의 NO_MARKET 은 벤더의 빈 응답으로 본다 — 저장하지 않는다(지금 판본 유지, 5분 뒤 다시).
        if (!requestedExp && isNoMarketDetected) {
            if (computeOpts.prevStatus === 'OK') {
                console.warn(`[structure] ${ticker}: 정상 판본이 있는데 체인이 비었다 — 벤더 빈 응답으로 보고 저장하지 않는다`);
                computeOpts.stored = false;
            } else {
                computeOpts.stored = await storeVersion(ticker, empty, Date.now(), null, NO_MARKET_TTL_SEC);
            }
        }
        return empty;
    }

    // 직접 경로(벤더)는 계약마다 `_intrinio.date` 를 싣는다 — 수집기 캐시 경로는 위에서 채웠다.
    if (!chainDate) chainDate = contractsChainDate(allContracts);

    const relevantContracts = allContracts;

    // 5. Structure & Integrity
    let nullOiCount = 0;
    const strikesSet = new Set<number>();
    const callsMap = new Map<number, number | null>();
    const putsMap = new Map<number, number | null>();
    const cleanContracts: any[] = [];
    let totalCallOI = 0;
    let totalPutOI = 0;

    relevantContracts.forEach((c: any) => {
        const k = c.details?.strike_price || c.strike_price || 0;
        const type = (c.details?.contract_type || c.contract_type || "call").toLowerCase();
        const oi = c.open_interest;

        strikesSet.add(k);

        if (oi === undefined || oi === null) {
            nullOiCount++;
        } else {
            cleanContracts.push({ ...c, k, type, oi });
            if (type === 'call') totalCallOI += oi;
            else totalPutOI += oi;
        }

        const val = (typeof oi === 'number') ? oi : null;
        if (type === 'call') callsMap.set(k, (callsMap.get(k) || 0) + (val || 0));
        else putsMap.set(k, (putsMap.get(k) || 0) + (val || 0));
    });

    const pcr = totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : null;
    // ★ [2026-09-30] 체인 날짜를 모르는 프로브(옛 코드 수집 Lambda — chainDate 를 싣지 않는다)는 판본을 «OI 합»으로 가린다:
    //   지금 판본과 OI 합이 같으면 같은 EOD(같은 판본) — 그 날짜를 잇는다. 다르면 모른다(null) → 판본 되돌림 방지가 저장을 막는다.
    //   (9/30 실측: 옛 Lambda 프로브 AAPL OI 124,509 = Intrinio 9/25 · 온디맨드 191,501 = 9/28 — 같은 종목이 1분마다 두 판본을 오갔다)
    let chainDateInferred = false;
    if (!chainDate && computeOpts.prevChainDate && computeOpts.prevOiSum != null && totalCallOI + totalPutOI === computeOpts.prevOiSum) {
        chainDate = computeOpts.prevChainDate;
        chainDateInferred = true;
    }
    const totalStatsContracts = relevantContracts.length;
    let options_status: "OK" | "PENDING" | "FAILED" = (totalStatsContracts > 0 && (nullOiCount / totalStatsContracts) < 0.20) ? "OK" : "PENDING";

    if (totalStatsContracts === 0) options_status = "PENDING";
    // ★ [2026-09-27] OI 가 빠진 계약이 있으면 맥스페인·콜월·풋플로어·PCR 은 «남은 계약»으로만 계산된다.
    //   20% 미만이라 status 가 OK 여도 부분 입력임을 밝힌다(예전엔 벤더 어댑터가 0 으로 채워 이 검사가 발동한 적이 없다).
    if (nullOiCount > 0) partialReasons.push(`oi_missing:${nullOiCount}/${totalStatsContracts}`);

    const sortedStrikes = Array.from(strikesSet).sort((a, b) => a - b);
    const callsOI = sortedStrikes.map(k => callsMap.get(k) ?? null);
    const putsOI = sortedStrikes.map(k => putsMap.get(k) ?? null);

    // 6. Metrics
    let maxPain: number | null = null;
    let maxPainOutOfBand: number | null = null;
    let netGex: number | null = null;
    let gammaCoverage = 0;
    let contractsUsedForGex = 0;
    let gexNotes = "";

    let gammaFlipLevel: number | null = null;
    let gammaFlipType: GammaFlipType | 'MULTI_EXP' = 'NO_DATA';
    let gammaFlipCrossings: number[] = [];

    // ★★ [2026-09-30] 레벨은 «분포 × 기준가» 함수 하나(lib/optionLevelGate.levelsAt)로 고른다 — 문(표시 가격)도 같은 함수를 쓴다.
    //   분포 = 행사가별 콜·풋 OI(아래 callsOI·putsOI) + 누적 GEX(gexCum, 감마 있는 행사가만·정수). 판본에 같이 저장한다.
    const gexCum: (number | null)[] = sortedStrikes.map(() => null);
    if (cleanContracts.length > 0 && underlyingPrice > 0) {
        const gexByStrike = new Map<number, number>();
        cleanContracts.forEach(c => {
            const g = c.greeks?.gamma;
            if (typeof g === 'number' && isFinite(g) && g !== 0) {
                const dir = c.type === 'call' ? -1 : 1;
                gexByStrike.set(c.k, (gexByStrike.get(c.k) || 0) + g * c.oi * 100 * dir);
            }
        });
        let cum = 0, prev = 0, seen = false;
        sortedStrikes.forEach((k, i) => {
            const gx = gexByStrike.get(k);
            if (gx === undefined) return;
            cum += gx;
            const rounded = Math.round(cum);
            gexCum[i] = rounded;
            if (seen && ((prev < 0 && rounded >= 0) || (prev > 0 && rounded <= 0))) gammaFlipCrossings.push(k);
            prev = rounded; seen = true;
        });
        const lv0 = levelsAt({ strikes: sortedStrikes, callsOI, putsOI, gexCum }, underlyingPrice);
        gammaFlipLevel = lv0.gammaFlipLevel;
        gammaFlipType = lv0.gammaFlipType;
    }

    if (options_status === "OK" && cleanContracts.length > 0 && underlyingPrice > 0) {
        let minLoss = Infinity;
        let painStrike = 0;
        const distinctStrikes = Array.from(new Set(cleanContracts.map(c => c.k))).sort((a, b) => a - b);

        distinctStrikes.forEach(testStrike => {
            let loss = 0;
            cleanContracts.forEach(c => {
                if (c.type === 'call' && testStrike > c.k) loss += (testStrike - c.k) * c.oi;
                else if (c.type === 'put' && testStrike < c.k) loss += (c.k - testStrike) * c.oi;
            });
            if (loss < minLoss) {
                minLoss = loss;
                painStrike = testStrike;
            }
        });
        maxPain = painStrike;
        // 맥스페인 ±35%(정의의 일부 = sanitizeMaxPain) — 기준가에서 그보다 먼 값은 «정의상 없음»이다(행사가 간격이 큰 저가주·얇은 체인:
        // DH 0.91 에 2.5, GRWG 1.59 에 1·REX 42.5 에 22.5). 판본에 null 로 싣는다 — 문에서 안전망이 지우는 «가려짐»과 섞이지 않게.
        if (Math.abs(painStrike - underlyingPrice) > underlyingPrice * LEVEL_BANDS.maxPain) { maxPainOutOfBand = painStrike; maxPain = null; }

        let gexSum = 0;
        let gammaCount = 0;
        contractsUsedForGex = cleanContracts.length;
        // 콜월·풋플로어 = 분포 × 기준가 S0 (levelsAt — 문이 표시 가격으로 다시 고를 때와 같은 함수)
        const walls0 = levelsAt({ strikes: sortedStrikes, callsOI, putsOI }, underlyingPrice);
        const callWall = walls0.callWall;
        const putFloor = walls0.putFloor;
        // [RANKING] Net Premium calculation: call premium - put premium
        let callPremiumVol = 0;
        let putPremiumVol = 0;

        cleanContracts.forEach(c => {
            const g = c.greeks?.gamma;
            if (typeof g === 'number' && isFinite(g)) {
                const dir = c.type === 'call' ? -1 : 1;
                gexSum += (g * c.oi * 100 * dir * underlyingPrice);
                gammaCount++;
            }
            // [RANKING] Accumulate premium volume (volume × lastPrice × 100 shares)
            // Polygon Option Chain Snapshot uses full field names: day.volume, last_trade.price
            const vol = c.day?.volume || c.day?.v || 0;
            const lastPrice = c.last_trade?.price || c.last_trade?.p || c.last_quote?.midpoint || 0;
            if (vol > 0 && lastPrice > 0) {
                if (c.type === 'call') callPremiumVol += vol * lastPrice * 100;
                else putPremiumVol += vol * lastPrice * 100;
            }
        });

        // ★ [2026-09-27] 분모 = 체인 «전체» 계약. OI 가 빠진 계약은 GEX 에 못 들어가므로 «커버»가 아니다.
        //   감마가 빠진 계약은 이제 null 로 와서 위 typeof 검사에서 빠진다 — 예전엔 벤더 어댑터가 0 으로 채워
        //   «감마 있음»으로 셌고, 그래서 커버리지가 늘 100% = gexConfidence 가 늘 HIGH 였다.
        gammaCoverage = totalStatsContracts > 0 ? gammaCount / totalStatsContracts : 0;

        // [V45.17] Always calculate GEX with confidence level for Alpha Score accuracy
        // Previously: null if coverage < 80% (caused fallback in Alpha Engine)
        // Now: Always return value with confidence indicator
        netGex = gexSum;

        let gexConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
        if (gammaCoverage >= 0.80) {
            gexConfidence = 'HIGH';
            gexNotes = `HIGH confidence (coverage: ${(gammaCoverage * 100).toFixed(0)}%)`;
        } else if (gammaCoverage >= 0.60) {
            gexConfidence = 'MEDIUM';
            gexNotes = `MEDIUM confidence (coverage: ${(gammaCoverage * 100).toFixed(0)}%)`;
        } else {
            gexConfidence = 'LOW';
            gexNotes = `LOW confidence (coverage: ${(gammaCoverage * 100).toFixed(0)}%)`;
        }
        // 체인이 잘렸으면(다음 페이지 미수신) 빠진 계약은 커버리지로 셀 수 없다 — 신뢰도를 올려 말하지 않는다.
        if (partialReasons.includes('chain_truncated')) {
            gexConfidence = 'LOW';
            gexNotes += ' · chain truncated';
        }

        // [V45.17] 이 만기의 OI 합(gammaConcentration·debug 가 쓴다).
        // ★ [2026-09-30] 여기서 «다음 주 만기» 체인을 한 번 더 받아(벤더 호출: 체인 1 + 실시간 그릭스 1~14쪽) nextWeekOI 를
        //   만들었는데, 0DTE 지표가 DTE(아래)로 바뀐 뒤 그 값을 쓰는 곳이 한 곳도 없었다(로그뿐). 판본을 장중 1분마다 갱신하면
        //   이 죽은 호출이 벤더 분당 한도를 태운다 — 지운다(응답 필드 변화 없음).
        const todayOI = totalCallOI + totalPutOI;
        // [V45.17] 0DTE Impact as DTE (Days to Expiry)
        // DTE = 0 means expiry today (maximum gamma impact)
        const et = getETComponents();
        const todayStr = `${et.year}-${String(et.month).padStart(2, '0')}-${String(et.day).padStart(2, '0')}`;
        const targetParts = targetExpiry.split('-').map(Number);
        const todayParts = todayStr.split('-').map(Number);
        const targetDate = new Date(targetParts[0], targetParts[1] - 1, targetParts[2]);
        const todayDate = new Date(todayParts[0], todayParts[1] - 1, todayParts[2]);
        const zeroDteImpact = Math.max(0, Math.round((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)));

        console.log(`[DTE] ${ticker}: expiry=${targetExpiry}, today=${todayStr}, DTE=${zeroDteImpact}`);

        // [V45.17] Gamma Concentration: How much OI is near current price
        // STICKY (70%+) = Price movements dampened by dealer hedging
        // NORMAL (40-70%) = Balanced OI distribution  
        // LOOSE (<40%) = Price can move more freely
        const priceRange = underlyingPrice * 0.05; // 5% range
        const nearPriceOI = cleanContracts.reduce((sum: number, c: any) => {
            const strike = c.details?.strike_price || 0;
            if (Math.abs(strike - underlyingPrice) <= priceRange) {
                return sum + (c.open_interest || 0);
            }
            return sum;
        }, 0);
        const gammaConcentration = todayOI > 0 ? Math.round((nearPriceOI / todayOI) * 100) : 0;
        const gammaConcentrationLabel = gammaConcentration >= 70 ? 'STICKY'
            : gammaConcentration >= 40 ? 'NORMAL' : 'LOOSE';

        // [V46.50] Squeeze Score: SpotGamma-Style Model (matches Flow page calculation)
        // Same logic as FlowRadar.tsx squeezeProbability for consistent values
        let squeezeScore = 0;

        // 1. GEX Intensity (0-35 points) - Short Gamma = High squeeze risk
        // netGex < 0 means dealers are short gamma (must chase price)
        const isShortGamma = netGex !== null && netGex < 0;
        if (isShortGamma) {
            const gexMillions = Math.abs(netGex) / 1_000_000;
            const gexIntensity = Math.min(35, Math.round(gexMillions / 10)); // 10M per point
            squeezeScore += gexIntensity;
        } else if (netGex !== null && netGex > 0) {
            // Long gamma = stability (lower squeeze risk)
            squeezeScore += Math.min(10, Math.round(Math.abs(netGex) / 100_000_000));
        }

        // 2. ATM Gamma Concentration (0-20 points)
        // High ATM gamma = Pin risk OR explosive move potential
        if (gammaConcentration >= 70) squeezeScore += 20;
        else if (gammaConcentration >= 50) squeezeScore += 15;
        else if (gammaConcentration >= 30) squeezeScore += 8;

        // 3. 0DTE Volatility Amplifier (0-20 points)
        // DTE = 0 or 1 = maximum gamma impact
        if (zeroDteImpact === 0) squeezeScore += 20;
        else if (zeroDteImpact === 1) squeezeScore += 15;
        else if (zeroDteImpact <= 3) squeezeScore += 10;
        else if (zeroDteImpact <= 5) squeezeScore += 5;

        // 4. ATM IV (0-15 points) - High IV = market expects big move
        // [BLOOMBERG STD] ATM Call IV + Put IV average at nearest strike
        // IV field priority: top-level implied_volatility (Polygon actual) > greeks.implied_volatility
        let atmIvForSqueeze: number | null = null;
        if (underlyingPrice > 0 && cleanContracts.length > 0) {
            const atmStrike = sortedStrikes.reduce((closest, strike) =>
                Math.abs(strike - underlyingPrice) < Math.abs(closest - underlyingPrice) ? strike : closest
            );
            const extractIv = (c: any) => {
                const raw = c?.implied_volatility || c?.greeks?.implied_volatility || c?.iv;
                if (typeof raw !== 'number' || !(raw > 0)) return null;
                // ⚠️ 벤더가 «소수»로 준다(0.45 = 45%). 예전 휴리스틱은 `raw > 1` 이면
                //    이미 퍼센트라고 봤는데, IV 가 100%를 넘는 종목에서 그게 깨진다:
                //    Intrinio 실측 NVDA 1.29848 → 129.8% 인데 1.3 으로 읽혔다.
                //    소수/퍼센트를 «값의 크기»로 가르지 말고, 상식 범위로 판정한다.
                //      소수 표기: 0 < raw < 5      (즉 0~500%)
                //      퍼센트 표기: raw >= 5       (5% 미만 IV 는 사실상 없다)
                const pct = raw < 5 ? raw * 100 : raw;
                // 1000% 를 넘으면 데이터 오류로 본다 — 지표로 쓰지 않는다
                return pct > 0 && pct < 1000 ? pct : null;
            };
            const callIv = extractIv(cleanContracts.find(c => c.k === atmStrike && c.type === 'call'));
            const putIv = extractIv(cleanContracts.find(c => c.k === atmStrike && c.type === 'put'));
            if (callIv !== null && putIv !== null) {
                // 0DTE guard: if Call-Put IV spread > 40pp, IV is distorted
                // In that case, use the lower IV (OTM side is more reliable)
                const spread = Math.abs(callIv - putIv);
                atmIvForSqueeze = spread > 40 ? Math.min(callIv, putIv) : (callIv + putIv) / 2;
            } else {
                atmIvForSqueeze = callIv ?? putIv;
            }
        }
        if (atmIvForSqueeze !== null) {
            if (atmIvForSqueeze >= 60) squeezeScore += 15;
            else if (atmIvForSqueeze >= 45) squeezeScore += 10;
            else if (atmIvForSqueeze >= 30) squeezeScore += 5;
        }

        // 5. P/C Ratio Extremes (0-10 points) - Extreme positioning
        if (pcr !== null) {
            if (pcr <= 0.4 || pcr >= 1.8) squeezeScore += 10;
            else if (pcr <= 0.6 || pcr >= 1.5) squeezeScore += 5;
        }

        // Clamp to 0-100
        squeezeScore = Math.min(100, Math.max(0, squeezeScore));

        const squeezeRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' =
            squeezeScore >= 70 ? 'EXTREME' :
                squeezeScore >= 45 ? 'HIGH' :
                    squeezeScore >= 20 ? 'MEDIUM' : 'LOW';

        // Legacy: keep isGammaSqueeze for backward compatibility
        const isGammaSqueeze = netGex !== null && netGex > 50000000 &&
            callWall != null && callWall > 0 && underlyingPrice >= callWall * 0.98 &&
            pcr !== null && pcr < 0.6;

        // [BLOOMBERG STD] ATM Call IV + Put IV average at nearest strike
        // IV field priority: top-level implied_volatility (Polygon actual) > greeks.implied_volatility
        // [DTE GUARD] When DTE < 2 (0DTE/1DTE), IV is distorted. Use next weekly expiry instead.
        let atmIv: number | null = null;
        const currentDte = Math.max(0, Math.round(
            (new Date(targetExpiry + 'T16:00:00').getTime() - new Date(todayStr + 'T09:30:00').getTime()) / 86400000
        ));

        // Determine which contracts to use for ATM IV
        let ivContracts = cleanContracts;
        let ivExpiry = targetExpiry;

        if (currentDte < 2 && availableExpirations.length > 1) {
            // [WEEKLY ONLY] Find next Friday (or Thursday for holiday) expiry
            // Skip non-Friday expiries (Mon/Wed) which have low liquidity
            const nextFridayExp = availableExpirations.find(exp => {
                const expDate = new Date(exp + 'T12:00:00');
                const dayOfWeek = expDate.getDay(); // 5=Friday, 4=Thursday
                const expDte = Math.max(0, Math.round(
                    (new Date(exp + 'T16:00:00').getTime() - new Date(todayStr + 'T09:30:00').getTime()) / 86400000
                ));
                return expDte >= 2 && (dayOfWeek === 5 || dayOfWeek === 4);
            });

            if (nextFridayExp) {
                // Lightweight fetch: only ATM contracts for IV (limit=20)
                try {
                    const ivUrl = `/v3/snapshot/options/${ticker}?expiration_date=${nextFridayExp}&limit=250`;
                    const ivRes = await fetchMassiveWithRetry(ivUrl, 1);
                    if (ivRes.success && ivRes.data?.results?.length > 0) {
                        ivContracts = ivRes.data.results.map((c: any) => ({
                            ...c,
                            k: c.details?.strike_price || 0,
                            type: (c.details?.contract_type || 'call').toLowerCase(),
                        }));
                        ivExpiry = nextFridayExp;
                        console.log(`[ATM IV] DTE=${currentDte} too short, using weekly ${nextFridayExp} (${ivContracts.length} contracts)`);
                    }
                } catch (e) {
                    console.log(`[ATM IV] Next weekly fetch failed, using current:`, e);
                }
            }
        }

        if (underlyingPrice > 0 && ivContracts.length > 0) {
            const ivStrikes = [...new Set(ivContracts.map((c: any) => c.k))].filter(Boolean).sort((a, b) => a - b);
            const atmStrike = ivStrikes.reduce((closest: number, strike: number) =>
                Math.abs(strike - underlyingPrice) < Math.abs(closest - underlyingPrice) ? strike : closest
            );
            const extractIv = (c: any) => {
                const raw = c?.implied_volatility || c?.greeks?.implied_volatility || c?.iv;
                if (typeof raw !== 'number' || !(raw > 0)) return null;
                // ⚠️ 벤더가 «소수»로 준다(0.45 = 45%). 예전 휴리스틱은 `raw > 1` 이면
                //    이미 퍼센트라고 봤는데, IV 가 100%를 넘는 종목에서 그게 깨진다:
                //    Intrinio 실측 NVDA 1.29848 → 129.8% 인데 1.3 으로 읽혔다.
                //    소수/퍼센트를 «값의 크기»로 가르지 말고, 상식 범위로 판정한다.
                //      소수 표기: 0 < raw < 5      (즉 0~500%)
                //      퍼센트 표기: raw >= 5       (5% 미만 IV 는 사실상 없다)
                const pct = raw < 5 ? raw * 100 : raw;
                // 1000% 를 넘으면 데이터 오류로 본다 — 지표로 쓰지 않는다
                return pct > 0 && pct < 1000 ? pct : null;
            };
            const callIv = extractIv(ivContracts.find((c: any) => c.k === atmStrike && c.type === 'call'));
            const putIv = extractIv(ivContracts.find((c: any) => c.k === atmStrike && c.type === 'put'));
            if (callIv !== null && putIv !== null) {
                // 0DTE guard: if Call-Put IV spread > 40pp, use the lower (OTM) IV
                const spread = Math.abs(callIv - putIv);
                const bestIv = spread > 40 ? Math.min(callIv, putIv) : (callIv + putIv) / 2;
                atmIv = Math.round(bestIv);
            } else {
                const fallback = callIv ?? putIv;
                atmIv = fallback !== null ? Math.round(fallback) : null;
            }
        }

        // ★★ [2026-09-29] 예상 변동 — 이 주간 만기 체인의 ATM 스트래들 중간값 ÷ 현물(정의: src/lib/impliedMove.ts).
        //   배치·인텔·AI 프롬프트가 «±x% 예상 변동»으로 읽던 «콜월 − 풋플로어» 폭과는 다른 숫자다(그건 wallRangePct).
        //   수집기 체인은 계약별 실시간 표식이 없어 체인 수준 표식(greeksSource)을 따르고, 직접 경로 계약은
        //   _rtGreeks 로 다리마다 판정한다. 호가 시각 = 수집 시각(_ts) 또는 지금(직접 경로).
        const impliedMove = underlyingPrice > 0
            ? atmStraddleImpliedMove(relevantContracts, underlyingPrice, {
                expiry: targetExpiry || null,
                quotesLive: chainQuotes.live,
                quotesAt: usedLambdaCache ? chainQuotes.at : Date.now(),
                // [10/4] EOD 값의 세션 꼬리표(«10/2 종가») — 체인 날짜(판본 chainDate)
                chainDate: chainDate ?? contractsChainDate(relevantContracts),
            })
            : null;

        // [DATA VALIDATION] Validate all calculated values before returning
        const validation = validateCalculations(
            pcr,
            maxPain,
            putFloor || null,
            callWall || null,
            underlyingPrice,
            gammaCoverage
        );

        const successResponse = {
            ticker,
            // 출구(applyLevelsToUnified)가 «이 파일의 결과»인지 알아보는 표식 — 레벨 정의가 같다는 보증.
            levelsProducer: STRUCTURE_PRODUCER,
            expiration: targetExpiry,
            // ★ 미결제약정의 EOD 날짜. 맥스페인·콜월·풋플로어·핀존·OI 분포는 전부 «이 날짜 × 이 만기» 값이다.
            //   화면은 만기와 함께 이 날짜를 보여 줄 수 있고, 캐시는 이걸로 판본을 판정한다.
            chainDate,
            availableExpirations,
            underlyingPrice: underlyingPrice || null,
            prevClose: prevClose || null,
            changePercent,
            extended,
            session,
            pcr,
            isGammaSqueeze,
            options_status,
            // ★ [2026-09-27] 입력 완결성 — true 면 맥스페인·콜월·풋플로어·PCR·GEX 가 «부분 체인»으로 계산됐다
            //   (체인 잘림 = 다음 페이지 미수신 · OI 없는 계약). 이유는 partialReason, 받은 계약 수는 contractsFetched.
            partial: partialReasons.length > 0,
            partialReason: partialReasons.length ? partialReasons.join(',') : null,
            contractsFetched: allContracts.length,
            ...(expirationFallbackFrom ? { expirationFallbackFrom } : {}),
            // 분포(행사가별 콜·풋 OI + 누적 GEX) — 문이 표시 가격으로 레벨을 다시 고를 때 같은 입력을 쓴다(levelsAt)
            structure: { strikes: sortedStrikes, callsOI, putsOI, gexCum },
            maxPain,
            netGex,
            gexConfidence, // [V45.17] Added for Alpha Score accuracy
            gammaFlipLevel,
            gammaFlipType,
            atmIv,
            atmIvExpiry: ivExpiry,  // [ATM IV] Actual expiry used for IV calculation
            // [2026-09-29] 예상 변동(이 만기 ATM 스트래들) — pct·만기·행사가·기준(live/eod)·호가 시각. 못 구하면 null
            impliedMove,
            // 콜월 − 풋플로어 거리(% of 현물) — 예상 변동이 아니다(«±»·«implied» 금지)
            wallRangePct: wallRangePct(callWall || null, putFloor || null, underlyingPrice),
            gammaConcentration,      // [V45.17] OI concentration near price (0-100%)
            gammaConcentrationLabel, // [V45.17] STICKY / NORMAL / LOOSE
            squeezeRisk,   // [V45.17] LOW/MEDIUM/HIGH/EXTREME
            squeezeScore,  // [V45.17] Raw score (0-100) for debugging
            // [SI%] Short Interest - populated by separate API in fetchTickerData
            siPercent: null as number | null,
            siPercentChange: null as number | null,
            daysToCover: null as number | null,
            levels: {
                callWall: callWall || null,
                putFloor: putFloor || null,
                pinZone: maxPain
            },
            // [RANKING] Net Premium: positive = bullish call flow, negative = bearish put flow
            netPremium: Math.round(callPremiumVol - putPremiumVol),
            validation, // [DATA VALIDATION] Include validation result
            sourceGrade: totalStatsContracts > 0 ? "A" : "B",
            debug: {
                apiStatus: 200,
                pagesFetched,
                contractsFetched: allContracts.length,
                chainSource: usedLambdaCache ? 'lambda-probe' : 'vendor-direct',
                probeSource,
                probeTs,
                chainDateInferred,
                maxPainOutOfBand,
                attempts: attemptsTotal,
                latencyMs: latencyTotal,
                gammaCoverage,
                contractsUsedForGex,
                rawGexSum: gexSum,
                multiplierUsed: 100,
                netGexUnit: "shares",
                gexFormula: "sum(call gamma*oi*mult) - sum(put gamma*oi*mult)",
                notes: gexNotes,
                gammaFlipCrossings,
                // [V45.17 DEBUG]
                todayOI,
                nearPriceOI,
                gammaConcentration,
                gammaConcentrationLabel,
                // [2026-09-27] 완결성 진단 — 빠진 입력의 개수와 원천에서 빠진 만기, 직접 경로의 벤더 응답 모양
                oiMissing: nullOiCount,
                gammaMissing: contractsUsedForGex - gammaCount,
                sourceExpirationsMissing,
                vendorChain,
            }
        };

        const now = Date.now();
        if (requestedExp) {
            // 만기를 고른 요청 — 예전 키(인메모리 + structure:v1:{T}:{exp}). 레벨 판본과 섞지 않는다.
            structureCache.set(cacheKey, { data: successResponse, timestamp: now });
            void setInCache(structureRedisKey(cacheKey), { data: successResponse, timestamp: now }, Math.round(getStructureCacheTtl() / 1000))
                .catch(() => { /* 저장 실패는 조용히 — 다음 호출이 다시 계산할 뿐이다 */ });
            return successResponse;
        }
        // 레벨 판본 — 모든 문이 이 한 벌을 읽는다. 쓰기가 끝나야 다음 문이 같은 판본을 본다(응답 뒤 갱신에서도).
        // 그릭스가 빠진 프로브(감마 0건)로 감마가 있던 판본을 덮지 않는다 — 감마플립이 값↔«없음»으로 오갔다(9/30 NVDA 227.5↔null).
        if (computeOpts.prevHasGamma && !gexCum.some((x) => x != null)) {
            console.warn(`[structure] ${ticker}: 새 체인에 감마가 없다 — 감마가 있던 판본을 덮지 않는다`);
            computeOpts.stored = false;
            return { ...successResponse, levelsAsOf: now };
        }
        computeOpts.stored = await storeVersion(ticker, successResponse, now, computeOpts.prevChainDate);
        // 수집 경로의 감지 — 공급사 최신 체인 날짜를 앞으로 밀고, 이 종목만 공급사 체인이 늦었으면 기록·로그 한 줄(EC2 전용 키)
        if (computeOpts.stored) await noteStoredChain(ticker, successResponse, now);
        return { ...successResponse, levelsAsOf: now, ...staleOfVersion({ data: successResponse, timestamp: now }, vendorEodMemo.date, now) };
    } else {
        // ⚠️ [2026-09-13] 여기까지 왔다는 건 «파생값을 하나도 못 만들었다»는 뜻이다.
        //    그런데 options_status 는 옵션 «체인의 OI 커버리지»만 보고 정해져서,
        //    체인이 멀쩡하고 기초자산 가격만 없으면 그대로 "OK" 로 나갔다.
        //    실측(DIA): underlyingPrice·maxPain·netGex 전부 null 인데 status="OK".
        //    소비처들이 그 라벨을 믿는다 —
        //      · dashboard/unified 의 optionsDataAvailable → Alpha 엔진이 «옵션 있다»로 채점
        //      · DecisionGate 는 confidence 로 겨우 걸러냈을 뿐 status 는 통과시킨다
        //    2026-09-03 에 command/unified 에서 «소비처만» 우회했고 뿌리는 그대로였다.
        //    라벨이 데이터와 다르면 그건 라벨이 틀린 것이다 → 여기서 내린다.
        if (options_status === "OK") options_status = "PENDING";

        gexNotes = totalStatsContracts === 0
            ? `netGex null: target expiration ${targetExpiry} not found or no contracts`
            : (!(underlyingPrice > 0)
                ? "netGex null: underlyingPrice missing (chain OK) — status downgraded OK→PENDING"
                : "netGex null: insufficient data");

        const failResponse = {
            ticker,
            expiration: targetExpiry,
            availableExpirations,
            underlyingPrice: underlyingPrice || null,
            prevClose: prevClose || null,
            changePercent,
            extended,
            session,
            pcr,
            isGammaSqueeze: false,
            options_status,
            partial: partialReasons.length > 0,
            partialReason: partialReasons.length ? partialReasons.join(',') : null,
            contractsFetched: allContracts.length,
            ...(expirationFallbackFrom ? { expirationFallbackFrom } : {}),
            structure: { strikes: sortedStrikes, callsOI, putsOI },
            maxPain: null,
            netGex: null,
            gexConfidence: 'LOW' as const, // [V45.17] Consistent with successResponse
            gammaFlipLevel,
            gammaFlipType,
            zeroDteImpact: 0,      // [V45.17] Default for failed response
            squeezeRisk: 'LOW' as const, // [V45.17]
            squeezeScore: 0,       // [V45.17]
            // [SI%] Short Interest defaults
            siPercent: null as number | null,
            siPercentChange: null as number | null,
            daysToCover: null as number | null,
            levels: { callWall: null, putFloor: null, pinZone: null },
            validation: { // [DATA VALIDATION] LOW confidence for incomplete data
                isValid: false,
                confidence: "LOW" as const,
                checks: { pcr: false, maxPain: false, putFloor: false, callWall: false, gammaCoverage: false },
                failures: ["incomplete_data"]
            },
            sourceGrade: "B",
            debug: {
                apiStatus: 200,
                pagesFetched,
                contractsFetched: allContracts.length,
                notes: gexNotes,
                oiMissing: nullOiCount,
                sourceExpirationsMissing,
                vendorChain,
            }
        };
        return failResponse;
    }
}

// ════════════════════════════════════════════════════════════════════════════
// ★★ 옵션 레벨 «한 벌» — 화면으로 나가는 모든 문이 같은 판본을 쓰게 하는 공용 층 [2026-09-25 · 2026-09-30]
//
// [9/25 사고] 운영 MU 맥스페인이 문마다 달랐다(구조 1020 · live/ticker 1000 · command/unified 1000 · watchlist 970) —
//   생산자가 다섯이었다(이 파일 · CentralDataHub 체인 · DynamoDB GEX 이력 · stockApi · 브라우저 재계산).
// [9/30 사고] 생산자는 하나가 됐지만 «판본»이 문마다 달랐다 — 저장본 두 벌·인스턴스 메모리 사본·갱신 안 되는 peek.
// [규칙] 화면으로 나가는 레벨은 이 파일의 판본(structure:v2:{T}) 한 벌이고, 모든 문은 아래 한 경로로 받는다:
//   levelsForExit / prefetchLevelsForExit(요청 시작 때 읽기) → lib/optionLevelGate 의 apply*/displayLevels(표시 가격).
//   계산을 부르지 않는다 — 판본이 낡았으면 응답 뒤 갱신(scheduleRefresh), 없으면 응답 뒤 계산(warmMissingStructure).
// ════════════════════════════════════════════════════════════════════════════

/**
 * 재선택(표시 가격이 판본 레벨을 넘은 «실제 돌파»)이 나면 판본을 새 기준가로 곧 갱신한다 — 다른 문도 같은 값으로 모인다.
 * 안전망(정의 게이트)이 값을 지우면(«가려짐») 기록한다 — 한 번도 나오지 않아야 정상이다(검색어: [levels] 가려짐).
 */
setLevelEventSink((e) => {
    if (e.kind === 'reselect') {
        if (e.ticker) scheduleRefresh(e.ticker, { reason: `reselect:${e.door}`, minMs: RESELECT_REFRESH_MIN_MS, prevChainDate: e.chainDate ?? null });
        return;
    }
    console.warn(`[levels] 가려짐(안전망 발동) door=${e.door} ticker=${e.ticker ?? '?'} fields=${e.fields.join(',')} spot=${e.spot ?? '?'}`);
});

/**
 * 여러 종목의 판본에서 레벨 한 벌을 한 번에 읽는다(Redis mget 한 번, 계산 없음).
 * 낡은 판본(장중 60초·분포 없는 옛 판본·체인 판본 뒤처짐)은 그대로 주고 응답 뒤 갱신을 건다.
 * `noSnapshot` = 쓸 수 있는 판본이 아예 없는 종목(응답 뒤 계산 후보). 옵션이 없는 종목(NO_MARKET)은 레벨도 후보도 아니다.
 */
export async function peekStructureLevelsDetailed(tickers: string[], extraKeys: string[] = [], extrasOut?: any[], opts: { refresh?: boolean } = {}): Promise<{ levels: Map<string, OptionLevels>; noSnapshot: string[] }> {
    const levels = new Map<string, OptionLevels>();
    const got = await readStoredStructures(tickers, extraKeys, extrasOut);
    if (!got) return { levels, noSnapshot: [] };   // Redis 를 못 읽었다 — «모른다»(계산 후보로 올리지 않는다)
    const todayET = getTodayETString();
    const noSnapshot: string[] = [];
    let refreshes = 0;   // 요청 하나가 응답 뒤에 떠안는 갱신 수 상한(장 시작 직후 50종목 워치리스트 등) — 나머지는 다음 요청이 건다
    const now = Date.now();
    for (const [t, r] of got) {
        const vs = versionState(r, todayET, now);
        if (vs.state === 'none' || !r.v) { noSnapshot.push(t); continue; }
        // opts.refresh === false = «읽기만» (웹 SEO 티커 페이지 — 크롤러 방문마다 재계산을 예약하지 않는다, 2026-10-04)
        if (vs.state === 'stale' && opts.refresh !== false && refreshes < MAX_REFRESH_PER_CALL
            && scheduleRefresh(t, { reason: vs.reason, prevChainDate: r.v.data?.chainDate ?? null, prevStatus: r.v.data?.options_status ?? null, minMs: vs.minMs ?? refreshMinMs(r.v) })) refreshes++;
        const lv = levelsFromStructure(r.v.data);
        // 가린다면 그 까닭(levelsStaleReason·levelsStaleAsOf) — 모든 문이 이 한 벌을 그대로 내보낸다(displayLevels·apply*)
        if (lv) levels.set(t, { ...lv, levelsAsOf: r.v.timestamp, levelsTicker: t, ...staleOfVersion(r.v, r.vendorEod, now) });
    }
    return { levels, noSnapshot };
}

/** peekStructureLevelsDetailed 의 레벨만(기존 호출자용). */
export async function peekStructureLevels(tickers: string[]): Promise<Map<string, OptionLevels>> {
    return (await peekStructureLevelsDetailed(tickers)).levels;
}

/**
 * 판본이 아예 없는 종목은 «응답을 보낸 뒤» 한 번 계산해 둔다 — 다음 요청부터 레벨이 나온다(사용자 경로는 기다리지 않는다).
 * 과부하 방지: 요청당 최대 MAX_WARM_PER_CALL 종목 · 종목당 WARM_RETRY_MS 에 한 번(인스턴스 메모 + 인스턴스 간 잠금).
 */
const WARM_RETRY_MS = 5 * 60 * 1000;
const MAX_WARM_PER_CALL = 3;
const MAX_REFRESH_PER_CALL = 8;

export async function warmMissingStructure(tickers: string[]): Promise<string[]> {
    const picked: string[] = [];
    for (const t of Array.from(new Set((tickers || []).map((x) => String(x || '').toUpperCase()).filter(Boolean)))) {
        if (picked.length >= MAX_WARM_PER_CALL) break;
        if (scheduleRefresh(t, { reason: 'none', minMs: WARM_RETRY_MS })) picked.push(t);
    }
    return picked;
}

/**
 * 인텔 섹터 라우트(m7·siliconcore·orbitdefense…)의 평평한 행에 레벨 한 벌을 덮는다(제자리 수정).
 * `noneAs: 0` = 그 라우트의 기존 규약(«없음 = 0», 화면이 0 을 «—» 로 그린다)을 지킨다.
 */
export async function overlayLevelsOnQuotes(quotes: any[], noneAs: 0 | null = null, door = 'intel'): Promise<void> {
    const rows = (quotes || []).filter((q) => q && typeof q === 'object' && q.ticker);
    if (!rows.length) return;
    let lvMap = new Map<string, OptionLevels>();
    try {
        lvMap = await levelsForExit(rows.map((q) => q.ticker));
    } catch (e: any) {
        console.warn('[levels] 판본 읽기 실패(레벨 비움):', e?.message);
    }
    for (const q of rows) {
        applyLevelsToRealtime(q, lvMap.get(String(q.ticker).toUpperCase()), door);
        if (noneAs === 0) for (const f of ['maxPain', 'callWall', 'putFloor'] as const) if (q[f] == null) q[f] = 0;
    }
}

/**
 * 판본 읽기를 «요청 시작 때» 걸어 두고 출구에서 받는다 — Redis 왕복이 다른 I/O(분석 캐시·시세)와 겹쳐
 * 사용자 경로에 시간을 더하지 않는다(9/29 A/B: 출구에서 읽으면 watchlist mode=price 서버 중앙값 +19ms).
 * 시작 때 판본이 없던 종목만 출구에서 한 번 더 본다 — 요청 중에 계산돼 저장됐을 수 있다(전체 모드의 getStructureData).
 * 그래도 없으면 응답 뒤 계산(warmMissingStructure). 판본을 못 읽었으면 reject — 부르는 쪽이 레벨을 비운다.
 */
export function prefetchLevelsForExit(tickers: string[]): () => Promise<Map<string, OptionLevels>> {
    const early = peekStructureLevelsDetailed(tickers);
    early.catch(() => { /* 출구에서 다시 던진다 — 처리되지 않은 거부로 남기지 않는다 */ });
    return finishFrom(early);
}

/**
 * prefetchLevelsForExit + 부르는 쪽의 다른 키를 «같은 mget 한 번»으로. live/ticker 가 응답 캐시(GET)와 판본(mget)을 따로 읽어
 * 왕복이 둘이던 것(9/30 블록 A/B/A: ticker_MU 왕복 +6ms [1,9])을 하나로 줄인다. extras = keys 순서의 값(못 읽었으면 null).
 */
export function prefetchLevelsWithKeys(tickers: string[], keys: string[]): { extras: Promise<any[]>; finish: () => Promise<Map<string, OptionLevels>> } {
    const got: any[] = [];
    const early = peekStructureLevelsDetailed(tickers, keys, got);
    early.catch(() => { /* finish 에서 다시 던진다 */ });
    return {
        extras: early.then(() => keys.map((_, i) => (got[i] === undefined ? null : got[i])), () => keys.map(() => null)),
        finish: finishFrom(early),
    };
}

function finishFrom(early: Promise<{ levels: Map<string, OptionLevels>; noSnapshot: string[] }>): () => Promise<Map<string, OptionLevels>> {
    return async () => {
        const { levels, noSnapshot } = await early;
        if (!noSnapshot.length) return levels;
        const late = await peekStructureLevelsDetailed(noSnapshot).catch(() => null);
        if (late) for (const [t, lv] of late.levels) levels.set(t, lv);
        const still = late ? late.noSnapshot : noSnapshot;
        if (still.length) void warmMissingStructure(still).catch(() => []);
        return levels;
    };
}

/** 여러 행을 내보내기 전에: 판본 한 번 읽기 + 판본 없는 종목은 응답 뒤 계산. */
export async function levelsForExit(tickers: string[]): Promise<Map<string, OptionLevels>> {
    const { levels, noSnapshot } = await peekStructureLevelsDetailed(tickers);
    if (noSnapshot.length) void warmMissingStructure(noSnapshot).catch(() => []);
    return levels;
}
