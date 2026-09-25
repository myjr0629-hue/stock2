import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { getETComponents, getTodayETString } from "@/services/marketDaySSOT";
import { findWeeklyExpiration } from "@/services/holidayCache";
import { getFromCache, setInCache } from "@/services/redisClient";

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
const structureRedisKey = (cacheKey: string) => `${STRUCTURE_REDIS_PREFIX}${cacheKey}`;
const structureLastGoodKey = (cacheKey: string) => `${STRUCTURE_LASTGOOD_PREFIX}${cacheKey}`;

/** 마지막 정상본 보관 기간 — 주말·휴장을 건너뛸 만큼 넉넉히 */
const LASTGOOD_TTL_SEC = 72 * 60 * 60;

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
/**
 * 배경 갱신용 래퍼. 마지막 정상본을 돌려준 뒤 «뒤에서» 이걸 돌린다.
 * 캐시를 건너뛰고 실제 계산 경로를 타야 하므로 전용 플래그로 재진입한다.
 */
async function computeAndStore(
    ticker: string,
    requestedExp: string | null | undefined,
    spot: { price: number; prevClose?: number | null } | null | undefined,
    cacheKey: string,
): Promise<any> {
    // 인메모리 항목을 지워 아래 getStructureData 가 계산 경로로 들어가게 한다.
    structureCache.delete(cacheKey);
    return getStructureData(ticker, requestedExp, spot, true);
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
    /** 배경 갱신 경로 — 마지막 정상본으로 되돌아가지 않고 실제로 계산한다 */
    skipLastGood = false,
) {
    const cacheKey = `${ticker}:${requestedExp || 'auto'}`;

    // [DATA CONSISTENCY] Check cache first
    const todayET = getTodayETString();
    // 장외(신선 TTL 72시간)에만 판본표를 본다 — 장중 60초 캐시는 어차피 곧 다시 계산한다.
    const probeMeta = getStructureCacheTtl() > CACHE_TTL_MARKET_MS ? await readProbeMeta(ticker) : null;
    const cached = structureCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < getStructureCacheTtl()) {
        if (cachedStructureUnusable(cached.data, todayET, probeMeta, ticker, 'CACHE')) {
            structureCache.delete(cacheKey);
        } else {
            console.log(`[CACHE HIT] ${ticker}: returning cached data (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
            return normalizeExpirationsForToday({ ...cached.data, cached: true }, todayET);
        }
    }

    // ★ 인메모리가 비었다고 «계산부터» 하지 않는다 — 다른 인스턴스가 이미 해뒀을 수 있다.
    //   서버리스에서 인스턴스는 수시로 새로 뜬다. 그때마다 15초를 다시 쓰면
    //   사용자는 «가끔 앱이 멈춘다»고 느낀다. Redis 를 한 번 더 본다(수십 ms).
    try {
        const shared = await getFromCache<{ data: any; timestamp: number }>(structureRedisKey(cacheKey));
        if (shared?.data && cachedStructureUnusable(shared.data, todayET, probeMeta, ticker, 'REDIS')) {
            /* 쓰지 않는다 — 이유(만기 지남·체인 판본 뒤처짐)는 위 함수가 로그에 남겼다 */
        } else if (shared?.data && shared.timestamp && (Date.now() - shared.timestamp) < getStructureCacheTtl()) {
            const ageSec = Math.round((Date.now() - shared.timestamp) / 1000);
            console.log(`[REDIS HIT] ${ticker}: 공유 캐시 사용 (age: ${ageSec}s)`);
            // 이번 인스턴스의 인메모리에도 채워 다음 호출은 더 빠르게
            structureCache.set(cacheKey, { data: shared.data, timestamp: shared.timestamp });
            return normalizeExpirationsForToday({ ...shared.data, cached: true, _redisAgeSec: ageSec }, todayET);
        }
    } catch (e) {
        // Redis 가 죽어도 계산으로 넘어가면 된다 — 캐시는 «빠르게 하는 것»이지 «필수»가 아니다
        console.warn(`[structure] Redis 공유 캐시 조회 실패(${ticker}):`, (e as any)?.message);
    }

    // ★★ 마지막 정상본 — 「사용자를 기다리게 하지 않는다」
    //
    //   신선본 TTL 은 장중 60초다. 그 60초가 지난 «첫» 요청이 전체 계산(실측 15~21초)을
    //   혼자 뒤집어쓰면, 그 사람에겐 앱이 멈춘 것으로 보인다. 서버리스에서 인스턴스가
    //   새로 뜨면 더 자주 그렇게 된다.
    //
    //   그래서 조금 오래된 값이라도 **즉시 돌려주고, 갱신은 뒤에서 한다.**
    //   시장 구조 데이터는 초 단위로 뒤집히지 않는다 — 몇 초 된 값이
    //   «15초 동안 아무것도 없는 화면»보다 언제나 낫다.
    //
    //   숨기지는 않는다: `_staleSec` 으로 나이를 실어 보내고, 다음 호출은 갱신본을 받는다.
    if (!requestedExp && !skipLastGood) {
        try {
            const lastGood = await getFromCache<{ data: any; timestamp: number }>(structureLastGoodKey(cacheKey));
            if (lastGood?.data && isCachedExpiryStale(lastGood.data, todayET)) {
                console.log(`[LAST-GOOD STALE-EXPIRY] ${ticker}: 마지막 정상본 만기 ${lastGood.data?.expiration} < ${todayET} — 즉시 반환하지 않고 계산한다`);
            } else if (lastGood?.data && lastGood.timestamp) {
                const staleSec = Math.round((Date.now() - lastGood.timestamp) / 1000);
                // 뒤에서 갱신을 건다(이미 돌고 있으면 또 걸지 않는다 — 썬더링 허드 방지)
                if (!inFlight.has(cacheKey)) {
                    const job = computeAndStore(ticker, requestedExp, spot, cacheKey)
                        .catch((err) => { console.warn(`[structure] 배경 갱신 실패(${ticker}):`, err?.message); })
                        .finally(() => { inFlight.delete(cacheKey); });
                    inFlight.set(cacheKey, job);
                }
                console.log(`[LAST-GOOD] ${ticker}: ${staleSec}s 된 값을 즉시 반환하고 뒤에서 갱신한다`);
                return normalizeExpirationsForToday({ ...lastGood.data, cached: true, _staleSec: staleSec }, todayET);
            }
        } catch (e) {
            console.warn(`[structure] 마지막 정상본 조회 실패(${ticker}):`, (e as any)?.message);
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

        // If we have a trade after regular hours, that's extended
        if (session === 'POST' || session === 'CLOSED') {
            // Post-market: lastTrade might be post-close price
            if (lastTradePrice > 0 && dayClose > 0 && lastTradePrice !== dayClose) {
                const postChangePct = (lastTradePrice - dayClose) / dayClose;
                extended = {
                    postPrice: lastTradePrice,
                    postChangePct: postChangePct
                };
            }
        } else if (session === 'PRE') {
            // Pre-market: lastTrade is pre-open price
            if (lastTradePrice > 0 && prevClose > 0) {
                const preChangePct = (lastTradePrice - prevClose) / prevClose;
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
    let pagesFetched = 0;
    let latencyTotal = 0;
    let attemptsTotal = 0;
    let usedLambdaCache = false;
    let isNoMarketDetected = false; // [NEW] Track definitive lack of options
    // [2026-09-25] 이 체인의 EOD 날짜 — 맥스페인·콜월·풋플로어가 «며칠 자 미결제약정»인지 응답에 싣는다.
    let chainDate: string | null = null;

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
            // Lambda has everything we need: expiry + full chain
            if (lcExpiryAlive && (!requestedExp || lambdaCache.weeklyExpiry === requestedExp)) {
                allContracts = lambdaCache.exactResults;
                targetExpiry = lambdaCache.weeklyExpiry;
                chainDate = lambdaCache.chainDate ?? lambdaCache.chainDates?.[targetExpiry] ?? null;
                // 목록에서도 지운다 — 화면이 죽은 만기를 «고를 수» 없게.
                availableExpirations = (lambdaCache.expirations || []).filter((d: string) => d >= todayStr);
                pagesFetched = 1;
                usedLambdaCache = true;
                console.log(`[STRUCTURE] LAMBDA CACHE HIT for ${ticker}: ${allContracts.length} contracts, expiry=${targetExpiry}`);
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
                if (probeRes.data?.results?.length === 0) {
                    isNoMarketDetected = true;
                } else if (probeRes.data?.results) {
                    isNoMarketDetected = false; // Reset just in case
                    // ⚠️ [2026-09-13] 만든 «그 자리»에서 지난 만기를 거른다.
                    //   probeUrl 에 expiration_date.gte 가 걸려 있지만 그건 벤더의 약속일 뿐이고,
                    //   이 목록은 그대로 화면의 만기 선택지가 된다. 약속이 아니라 값으로 막는다.
                    const exps = (Array.from(new Set(
                        probeRes.data.results.map((c: any) => c.details?.expiration_date || c.expiration_date)
                    )).filter(Boolean).sort() as string[]).filter((d) => d >= todayStr);

                    console.log(`[OPTIONS] ${ticker} probe expirations:`, exps.slice(0, 8).join(', '));

                    if (exps.length > 0) {
                        availableExpirations = exps.slice(0, 10);

                        if (requestedExp && exps.includes(requestedExp)) {
                            targetExpiry = requestedExp;
                        } else {
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
                    
                    if (res.data.results.length === 0 && pagesFetched === 0) {
                        isNoMarketDetected = true;
                        break;
                    }

                    allContracts = allContracts.concat(res.data.results);
                    pagesFetched++;

                    chainUrl = res.data.next_url || '';
                }
            } catch (e) {
                console.log(`[OPTIONS] Fetch error for ${ticker}:`, e);
            }
        }
    }


    if (allContracts.length === 0) {
        return {
            ticker, expiration: targetExpiry, underlyingPrice, 
            options_status: isNoMarketDetected ? "NO_MARKET" : "PENDING",
            structure: { strikes: [], callsOI: [], putsOI: [] },
            maxPain: null, netGex: null, sourceGrade: "C",
            availableExpirations,
            debug: { apiStatus: 404, pagesFetched, contractsFetched: 0 }
        };
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
    const totalStatsContracts = relevantContracts.length;
    let options_status: "OK" | "PENDING" | "FAILED" = (totalStatsContracts > 0 && (nullOiCount / totalStatsContracts) < 0.20) ? "OK" : "PENDING";

    if (totalStatsContracts === 0) options_status = "PENDING";

    const sortedStrikes = Array.from(strikesSet).sort((a, b) => a - b);
    const callsOI = sortedStrikes.map(k => callsMap.get(k) ?? null);
    const putsOI = sortedStrikes.map(k => putsMap.get(k) ?? null);

    // 6. Metrics
    let maxPain: number | null = null;
    let netGex: number | null = null;
    let gammaCoverage = 0;
    let contractsUsedForGex = 0;
    let gexNotes = "";

    let gammaFlipLevel: number | null = null;
    let gammaFlipType: 'EXACT' | 'MULTI_EXP' | 'NEAR_ZERO' | 'ALL_LONG' | 'ALL_SHORT' | 'NO_DATA' = 'NO_DATA';
    let gammaFlipCrossings: number[] = [];

    const ATM_RANGE = 0.15;
    const atmMin = underlyingPrice * (1 - ATM_RANGE);
    const atmMax = underlyingPrice * (1 + ATM_RANGE);

    if (cleanContracts.length > 0 && underlyingPrice > 0) {
        const gexByStrike = new Map<number, number>();
        let gammaDataCount = 0;

        cleanContracts.forEach(c => {
            const g = c.greeks?.gamma;
            if (typeof g === 'number' && isFinite(g) && g !== 0) {
                const dir = c.type === 'call' ? -1 : 1;
                const gex = g * c.oi * 100 * dir;
                gexByStrike.set(c.k, (gexByStrike.get(c.k) || 0) + gex);
                gammaDataCount++;
            }
        });

        if (gammaDataCount > 0) {
            const strikesWithGex = Array.from(gexByStrike.entries()).sort((a, b) => a[0] - b[0]);
            let cumulativeGex = 0;
            const allCrossings: number[] = [];
            const atmNearZero: { strike: number; absGex: number }[] = [];
            let finalCumulativeGex = 0;

            for (let i = 0; i < strikesWithGex.length; i++) {
                const [strike, gexAtStrike] = strikesWithGex[i];
                const prevGex = cumulativeGex;
                cumulativeGex += gexAtStrike;
                finalCumulativeGex = cumulativeGex;

                if (i > 0) {
                    if ((prevGex < 0 && cumulativeGex >= 0) || (prevGex > 0 && cumulativeGex <= 0)) {
                        allCrossings.push(strike);
                    }
                }
                if (strike >= atmMin && strike <= atmMax) {
                    atmNearZero.push({ strike, absGex: Math.abs(cumulativeGex) });
                }
            }

            gammaFlipCrossings = [...allCrossings];

            const atmCrossings = allCrossings.filter(s => s >= atmMin && s <= atmMax);
            if (atmCrossings.length > 0) {
                gammaFlipLevel = atmCrossings.reduce((closest, strike) =>
                    Math.abs(strike - underlyingPrice) < Math.abs(closest - underlyingPrice) ? strike : closest
                );
                gammaFlipType = 'EXACT';
                console.log(`[S-120] ${ticker}: EXACT - GammaFlip = $${gammaFlipLevel} from weekly expiry`);
            } else {
                if (atmNearZero.length > 0) {
                    atmNearZero.sort((a, b) => a.absGex - b.absGex);
                    gammaFlipLevel = atmNearZero[0].strike;
                    gammaFlipType = 'NEAR_ZERO';
                    console.log(`[S-120] ${ticker}: NEAR_ZERO - GammaFlip = ~$${gammaFlipLevel}`);
                } else {
                    gammaFlipLevel = null;
                    gammaFlipType = finalCumulativeGex > 0 ? 'ALL_LONG' : 'ALL_SHORT';
                    console.log(`[S-120] ${ticker}: ${gammaFlipType} - No flip in weekly expiry`);
                }
            }
        }
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

        let gexSum = 0;
        let gammaCount = 0;
        contractsUsedForGex = cleanContracts.length;
        let maxCallOi = -1;
        let callWall = 0;
        let maxPutOi = -1;
        let putFloor = 0;
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
            const maxResist = underlyingPrice * 1.20;
            const minSupport = underlyingPrice * 0.80;
            if (c.type === 'call' && c.k > underlyingPrice && c.k <= maxResist && c.oi > maxCallOi) {
                maxCallOi = c.oi;
                callWall = c.k;
            }
            if (c.type === 'put' && c.k < underlyingPrice && c.k >= minSupport && c.oi > maxPutOi) {
                maxPutOi = c.oi;
                putFloor = c.k;
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

        gammaCoverage = contractsUsedForGex > 0 ? gammaCount / contractsUsedForGex : 0;

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

        // [V45.17] 0DTE Impact: Today's OI / (Today's OI + Next Week OI)
        // This measures how much of total gamma is expiring today
        const todayOI = totalCallOI + totalPutOI;
        let nextWeekOI = 0;

        // Find next weekly expiration (next Friday after targetExpiry)
        const nextWeeklyExp = availableExpirations.find(exp => {
            if (exp === targetExpiry) return false;
            // Parse dates to check if it's a Friday and after target
            const expParts = exp.split('-').map(Number);
            const expDate = new Date(expParts[0], expParts[1] - 1, expParts[2]);
            const targetParts = targetExpiry.split('-').map(Number);
            const targetDate = new Date(targetParts[0], targetParts[1] - 1, targetParts[2]);

            // Check if it's a Friday (day 5) and at least 5 days after target
            const isFriday = expDate.getDay() === 5;
            const diffDays = Math.round((expDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

            return isFriday && diffDays >= 5 && diffDays <= 10;
        });

        console.log(`[0DTE] ${ticker}: targetExpiry=${targetExpiry}, nextWeeklyExp=${nextWeeklyExp || 'not found'}`);

        let nextWeekFetchError = '';
        if (nextWeeklyExp) {
            // [V4.6 FIX] Options Chain max limit=250 per page (500 returns 400 error)
            // Must paginate via next_url to get complete OI data
            let nextPageUrl: string | null = `/v3/snapshot/options/${ticker}?expiration_date=${nextWeeklyExp}&limit=250`;
            let allNextWeekContracts: any[] = [];
            let nextWeekPages = 0;
            try {
                while (nextPageUrl && nextWeekPages < 5) {
                    const nextData = await fetchMassive(nextPageUrl, {}, false, undefined, CACHE_POLICY.LIVE);
                    if (nextData?.results && nextData.results.length > 0) {
                        allNextWeekContracts = allNextWeekContracts.concat(nextData.results);
                    } else {
                        break;
                    }
                    nextPageUrl = nextData.next_url || null;
                    nextWeekPages++;
                }
                console.log(`[0DTE FETCH] ${ticker}: ${allNextWeekContracts.length} contracts from ${nextWeekPages} pages`);
                if (allNextWeekContracts.length > 0) {
                    nextWeekOI = allNextWeekContracts.reduce((sum: number, c: any) => {
                        return sum + (c.open_interest || 0);
                    }, 0);
                    console.log(`[0DTE FETCH] ${ticker}: calculated nextWeekOI=${nextWeekOI}`);
                } else {
                    nextWeekFetchError = 'No results from API';
                }
            } catch (e: any) {
                nextWeekFetchError = e.message || 'Exception';
                console.log(`[0DTE] Failed to fetch next week OI for ${ticker}: ${e}`);
            }
        }
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
            callWall > 0 && underlyingPrice >= callWall * 0.98 &&
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
            structure: { strikes: sortedStrikes, callsOI, putsOI },
            maxPain,
            netGex,
            gexConfidence, // [V45.17] Added for Alpha Score accuracy
            gammaFlipLevel,
            gammaFlipType,
            atmIv,
            atmIvExpiry: ivExpiry,  // [ATM IV] Actual expiry used for IV calculation
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
                gammaConcentrationLabel
            }
        };

        const now = Date.now();
        structureCache.set(cacheKey, { data: successResponse, timestamp: now });
        // 다른 인스턴스도 쓸 수 있게 공유 캐시에 남긴다.
        // await 하지 않는다 — 저장이 늦어도 «이번» 응답을 붙잡을 이유가 없다.
        const payload = { data: successResponse, timestamp: now };
        void setInCache(
            structureRedisKey(cacheKey),
            payload,
            Math.round(getStructureCacheTtl() / 1000),
        ).catch(() => { /* 저장 실패는 조용히 — 다음 호출이 다시 계산할 뿐이다 */ });
        // 마지막 정상본은 따로, 훨씬 길게 남긴다 — 신선본이 만료돼도 «즉시 줄 것»이 있어야 한다
        void setInCache(structureLastGoodKey(cacheKey), payload, LASTGOOD_TTL_SEC)
            .catch(() => { /* 위와 같다 */ });
        return successResponse;
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
                notes: gexNotes
            }
        };
        return failResponse;
    }
}
