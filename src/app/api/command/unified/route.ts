import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache as _getFromCache, setInCache as _setInCache } from '@/services/redisClient';
import { fetchMassive } from '@/services/massiveClient';
import { calculateWhaleIndex } from '@/services/alphaEngine';

export const dynamic = 'force-dynamic';

// Import individual route GET handlers directly to bypass HTTP overhead
import { GET as getStructure } from '@/app/api/live/options/structure/route';
import { GET as getAtm } from '@/app/api/live/options/atm/route';
import { GET as getEarnings } from '@/app/api/live/earnings/route';
import { GET as getSma } from '@/app/api/live/sma/route';
import { GET as getRelated } from '@/app/api/live/related/route';
import { GET as getAnalyst } from '@/app/api/live/analyst/route';
import { GET as getVolatility } from '@/app/api/live/volatility-regime/route';
import { GET as getSqueeze } from '@/app/api/live/short-squeeze/route';
import { GET as getInstitutional } from '@/app/api/flow/realtime-metrics/route';
import { GET as getFundamentals } from '@/app/api/live/fundamentals/route';
import { GET as getOverview } from '@/app/api/live/overview/route';
import { UNIVERSE } from '@/lib/universe';

// [극강] Allow Vercel Pro to run unified aggregation up to 30s (default 10s kills it)
export const maxDuration = 30;

// Configuration
// ⚠️ 응답 «모양»이 바뀌면 이 키를 올린다. 안 올리면 옛 페이로드가 200 OK 로 계속
//    나가서 새 필드가 조용히 빠진다(실측: pcRatio·gammaRegime 을 추가했는데
//    memory-lru 에 남은 배포 전 값이 그대로 나갔다).
//    v2 = 2026-09-03 structure.pcRatio · gammaRegime · options 정규화
// ⚠️ 판정(isFieldUsable)을 바꾸면 **옛 페이로드를 반드시 버려야 한다.**
//   안 그러면 이미 캐시에 앉은 껍데기(sma label:'오류' · structure NO_MARKET)가
//   TTL 동안 그대로 나가고, 「고쳤는데 화면이 안 바뀐다」로 오진하게 된다.
//   v3 = sma·volatility·fundamentals·structure 판정 강화 (2026-09-04)
const CACHE_KEY_PREFIX = 'cache:command:unified:v4:';  // Language-independent data
const OVERVIEW_KEY_PREFIX = 'cache:command:overview:'; // Language-specific overview
const CACHE_TTL_MARKET = 1800; // [극강] 30 minutes during market hours (was 5 min)
const CACHE_TTL_OFFHOURS = 259200; // 72 hours off-hours (covers Friday→Monday)
const REFRESH_THRESHOLD_MS = 300 * 1000; // [극강] 5 minutes — background refresh after 5 min (was 2 min)

// [ROOT FIX] Bypass injection for Alpha, Smart Flow, Institutional & Earnings from Lambda caches.
// Prevents blank data for Universe tickers by sourcing from every available layer.
// Sources: cache:analysis (Redis), signum-flow-history (DynamoDB), Finnhub API
async function injectAlphaBypass(data: any, ticker: string) {
    if (!data) return;
    // [초격차 속도] Skip if ALL fields already populated with VALID data (0ms early exit, no Redis call)
    // [FIX 2026-05-04] Score Consistency: Alpha is ALWAYS injected from cache:analysis (SSOT).
    // Previously lambda-v8 scores persisted → different score vs Watchlist/Portfolio.
    // Now: cache:analysis alphaSnapshot is the SSOT for ALL pages.
    const needsAlpha = true; // Always refresh alpha from cache:analysis for cross-page consistency
    // [FIX 2026-05-07] SmartFlow is ALWAYS recalculated — cached values may be stale V1
    const needsFlow = true;
    const needsInst = !data.institutional || (data.institutional.darkPool?.percent === 0 && data.institutional.blockTrade?.count === 0);
    const needsSurprise = data.earnings && !data.earnings.lastSurprise;
    const needsAnalyst = !data.analyst || !data.analyst.totalAnalysts || data.analyst.totalAnalysts === 0;
    if (!needsAlpha && !needsFlow && !needsInst && !needsSurprise && !needsAnalyst) return;
    try {
        const { getAnalysisCache } = await import('@/services/analysisCache');
        const ac = await getAnalysisCache(ticker);
        // [XS 2026-08-07] a pre-switch V8 alpha may survive inside the stored
        // payload when cache:analysis misses — always re-apply the XS override
        // to whatever alpha the payload carries before the SSOT swap below.
        if (data.alpha) {
            const { xsSnapshotOverride, ensureXsScores } = await import('@/services/xsScores');
            await ensureXsScores();
            data.alpha = xsSnapshotOverride(ticker, data.alpha);
        }
        if (ac) {
            // [FIX 2026-05-04] ALWAYS use cache:analysis alphaSnapshot as SSOT
            // This ensures Command = Watchlist = Portfolio score
            if (ac.alphaSnapshot && ac.alphaSnapshot.score > 0) data.alpha = ac.alphaSnapshot;
            // [FIX 2026-05-04] SmartFlow 3-layer fallback: cache:analysis → DynamoDB unified-cache → skip
            // CRITICAL: cache:analysis whaleIndex can be 0 (blockTrades=undefined bug),
            // but DynamoDB unified-cache has the correct smartFlow value (manually recovered).
            if (needsFlow) {
                if (ac.gex != null || ac.darkPoolPct != null || ac.netPremium != null) {
                    // [FIX] Always recalculate via V2 engine — cached whaleIndex may be stale
                    data.smartFlow = calculateWhaleIndex(ac.gex, ac.darkPoolPct, null, ac.netPremium);
                } else if (ac.whaleIndex != null && ac.whaleIndex > 0) {
                    data.smartFlow = ac.whaleIndex;
                } else {
                    // Fallback to DynamoDB unified-cache smartFlow
                    try {
                        const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
                        const uc = await Promise.race([
                            getUnifiedCache(ticker, 'en'),
                            new Promise<any>(r => setTimeout(() => r(null), 2000))
                        ]);
                        if (uc?.smartFlow && uc.smartFlow > 0) {
                            data.smartFlow = uc.smartFlow;
                        }
                    } catch { /* DynamoDB unavailable */ }
                }
            }
            // [FIX 2026-05-05] Institutional: inject from cache:analysis (0ms, in-memory)
            // EC2 block trade data arrives via background gap-fill (not in critical path)
            if (needsInst && ac.darkPoolPct != null && ac.darkPoolPct > 0) {
                data.institutional = {
                    ...(data.institutional || {}),
                    darkPool: { percent: ac.darkPoolPct },
                    blockTrade: data.institutional?.blockTrade || { count: 0, volume: 0 },
                    shortVolume: data.institutional?.shortVolume || (ac.shortVolPct != null ? { percent: ac.shortVolPct } : null),
                };
            }
        }

        // [FIX 2026-05-04] Pull block trade count from signum-flow-history if still 0
        // flow-harvest writes blockTradeCount to this table every 15min during market hours
        // This preserves Friday's data through the weekend
        if (data.institutional?.blockTrade?.count === 0) {
            try {
                const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
                const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
                const dynClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
                const flowResult = await Promise.race([
                    dynClient.send(new QueryCommand({
                        TableName: 'signum-flow-history',
                        KeyConditionExpression: 'ticker = :t',
                        ExpressionAttributeValues: { ':t': ticker },
                        ScanIndexForward: false,
                        // ⚠️ [2026-09-03] 이 테이블에는 **모양이 다른 행이 섞여** 있다.
                        //    harvest 는 darkPoolPercent·blockTradeCount 를 쓰고,
                        //    structure-build 는 pcr·미결제약정을 쓴다. Limit:1 로
                        //    맨 위 한 줄만 보면 다른 모양이 걸려 복구가 조용히 멈춘다.
                        //    최근 몇 줄을 받아 **blockTradeCount 가 있는 줄**을 고른다.
                        Limit: 12
                    })),
                    new Promise<any>(r => setTimeout(() => r(null), 2000))
                ]);
                const latest = (flowResult?.Items ?? []).find(
                    (x: any) => Number(x?.blockTradeCount) > 0) ?? flowResult?.Items?.[0];

                // ⚠️ [2026-08-29] 나이 검사 필수.
                //   Massive 차단 이후 signum-flow-history 는 더 이상 갱신되지 않는데,
                //   이 복구 로직이 **과거 값을 무기한 되살려** darkPool 63.8%·93.2% 같은
                //   수치를 현재값인 것처럼 내보내고 있었다(_source: flow-history-recovery).
                //   원 의도는 "금요일 값을 주말 동안 유지"이므로 3일이면 충분하다.
                const FLOW_HISTORY_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
                const flowTs = latest
                    ? (Number(latest.timestamp) || Number(latest.ts) ||
                       (latest.date ? Date.parse(String(latest.date)) : NaN))
                    : NaN;
                const flowAge = Number.isFinite(flowTs) ? Date.now() - flowTs : Infinity;

                if (latest && latest.blockTradeCount > 0 && flowAge < FLOW_HISTORY_MAX_AGE_MS) {
                    data.institutional = {
                        ...data.institutional,
                        darkPool: { percent: latest.darkPoolPercent || data.institutional?.darkPool?.percent || 0 },
                        blockTrade: { count: latest.blockTradeCount, volume: 0 },
                        _source: 'flow-history-recovery',
                        _ageMs: flowAge,
                    };
                }
            } catch { /* DynamoDB unavailable */ }
        }

        // [FIX 2026-05-04] Inject analyst from signum-pattern-db when unified-cache has null
        // Lambda harvest reads ANALYST:{ticker} from pattern-db and merges into unified-cache,
        // but sometimes the merge fails or data is stale. Direct pattern-db read as fallback.
        if (needsAnalyst) {
            try {
                const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
                const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
                const dynClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
                const analystResult = await Promise.race([
                    dynClient.send(new QueryCommand({
                        TableName: 'signum-pattern-db',
                        KeyConditionExpression: 'pattern = :p',
                        ExpressionAttributeValues: { ':p': `ANALYST:${ticker}` },
                        ScanIndexForward: false,
                        Limit: 1
                    })),
                    new Promise<any>(r => setTimeout(() => r(null), 2000))
                ]);
                const analystData = analystResult?.Items?.[0];
                if (analystData && analystData.totalAnalysts > 0) {
                    data.analyst = {
                        consensus: analystData.consensus,
                        totalAnalysts: analystData.totalAnalysts,
                        bullishPct: analystData.bullishPct,
                        breakdown: analystData.breakdown,
                        priceTarget: analystData.priceTarget,
                    };
                }
            } catch { /* DynamoDB unavailable */ }
        }

        // [FIX 2026-05-04] Inject earnings surprise from Finnhub if missing
        // Ensures Beat/Miss always shows (even after cache wipe or DynamoDB gap)
        if (needsSurprise) {
            try {
                const { getEarningsSurprise } = await import('@/services/finnhubClient');
                const surprise = await Promise.race([
                    getEarningsSurprise(ticker),
                    new Promise<any>(r => setTimeout(() => r(null), 2000))
                ]);
                if (surprise) {
                    data.earnings = {
                        ...data.earnings,
                        lastSurprise: {
                            actualEps: surprise.actual,
                            estimatedEps: surprise.estimate,
                            surpriseEps: Number(surprise.surprise.toFixed(3)),
                            surprisePct: Number(surprise.surprisePercent.toFixed(1)),
                            date: surprise.period
                        }
                    };
                }
            } catch { /* Finnhub unavailable */ }
        }
    } catch { /* graceful fallback */ }
}


// ══════════════════════════════════════════════════════════════
// [극강 Layer 1] IN-MEMORY LRU CACHE — 0ms response
// Survives within the same serverless instance (Vercel keeps warm ~5-15 min)
// Max 200 entries, 60-second TTL (short = always fresh)
// ══════════════════════════════════════════════════════════════
const MEMORY_MAX = 200;
const MEMORY_TTL_MS = 60_000; // 60 seconds
const memoryCache = new Map<string, { data: any; ts: number }>();

/**
 * 값이 없는 페이로드를 «캐시에 넣지도, 캐시에서 꺼내지도» 않는다.
 *
 * ⚠️ [2026-09-03 실측] AMD 만 커맨드 화면이 통째로 비어 있었다. 39/40 종목은 멀쩡.
 *    원인은 코드가 아니라 **캐시에 남은 시체**였다 —
 *    `cache:command:unified:v2:AMD` 의 structure 에 underlyingPrice·prevClose·
 *    maxPain 이 전부 null 인 페이로드가 들어 있었고, 그게 memory-lru 로 계속
 *    되살아나 200 OK 로 나갔다(`/api/flow/unified?t=AMD` 는 457.61 로 정상).
 *    한 번의 일시적 실패가 캐시 TTL 내내 «에러 없는 빈 화면»이 된다.
 *
 *    → 옵션 체인만 있고 가격이 없는 페이로드는 캐시로서 무효다. 막으면
 *      다음 요청이 새로 가져올 기회를 얻는다(막지 않으면 영원히 못 낫는다).
 *
 * structure 가 아예 없는 페이로드(overview·institutional 캐시)는 대상이 아니다.
 */
function isCacheable(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    const st: any = (data as any).structure;
    if (!st || typeof st !== 'object') return true;   // 커맨드 페이로드가 아니다
    return st.underlyingPrice != null || st.prevClose != null;
}

async function getFromCache<T>(key: string): Promise<T | null> {
    const v = await _getFromCache<T>(key);
    return isCacheable(v) ? v : null;
}

async function setInCache(key: string, value: any, ttl?: number): Promise<void> {
    if (!isCacheable(value)) return;
    await (_setInCache as any)(key, value, ttl);
}

function memoryGet(key: string): any | null {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > MEMORY_TTL_MS) {
        memoryCache.delete(key);
        return null;
    }
    if (!isCacheable(entry.data)) { memoryCache.delete(key); return null; }
    return entry.data;
}

function memorySet(key: string, data: any): void {
    if (!isCacheable(data)) return;              // 값 없는 페이로드는 담지 않는다
    // LRU eviction: if at capacity, delete oldest entry
    if (memoryCache.size >= MEMORY_MAX) {
        const oldestKey = memoryCache.keys().next().value;
        if (oldestKey) memoryCache.delete(oldestKey);
    }
    memoryCache.set(key, { data, ts: Date.now() });
}

// [FIX 2026-05-05] Include pre-market (4:00-9:30 AM ET) and post-market (4:00-8:00 PM ET)
// Previously only covered regular session (9:30-4:00 ET), causing pre/post market to use
// 72-hour stale cache TTL → EC2 institutional data never refreshed during extended hours.
function isMarketHoursNow(): boolean {
    const now = new Date();
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const day = now.getUTCDay();
    // Weekday + 4:00 AM - 8:00 PM ET (8:00 - 24:00 UTC / 0:00 UTC)
    // Pre-market: 08:00-13:30 UTC (4:00-9:30 AM ET)
    // Regular:    13:30-20:00 UTC (9:30 AM-4:00 PM ET)
    // Post-market: 20:00-00:00 UTC (4:00-8:00 PM ET)
    return day >= 1 && day <= 5 && utcMin >= 8 * 60 && utcMin <= 24 * 60;
}

// Regular session only — used for aggressive refresh thresholds
function isRegularSessionNow(): boolean {
    const now = new Date();
    const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const day = now.getUTCDay();
    return day >= 1 && day <= 5 && utcMin >= 13 * 60 + 30 && utcMin <= 20 * 60;
}

// Smart TTL: short during market (incl. extended), long during off-hours
function getSmartTTL(): number {
    return isMarketHoursNow() ? CACHE_TTL_MARKET : CACHE_TTL_OFFHOURS;
}

// [GAP-FILL] Check if a cached field has usable data (not just an empty shell)
/**
 * ⚠️⚠️ [2026-09-04] `Number.isFinite(Number(x))` 를 쓰면 **null 이 통과한다** —
 *   `Number(null) === 0` 이고 0 은 유한수다. 내가 sma·volatility·fundamentals 판정을
 *   그렇게 써서 「고쳤는데 그대로」였다(unified.sma 가 label:'오류'·sma50:null 인데
 *   「쓸 만함」으로 통과 → 갭필이 한 번도 안 걸림. 단독 /api/live/sma 는 209.87 을 준다).
 *   이 함수 안의 모든 수치 판정은 반드시 이걸 쓴다.
 */
function numOk(v: any): boolean {
    return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
}

function isFieldUsable(field: string, data: any): boolean {
    if (!data) return false;
    switch (field) {
        case 'analyst': return data.totalAnalysts > 0;
        case 'earnings': return data.hasData !== false && (data.nextEarningsDate !== null || data.earningsDate !== null || data.forwardEps != null);
        // 이름만 있고 수치가 하나도 없는 껍데기를 거른다.
        case 'fundamentals': return numOk(data.score) || numOk(data.marketCap) || numOk(data.pe) || !!data.grade;
        case 'related': return (data.relatedTickers?.length > 0) || (data.topRelated?.length > 0) || (data.count > 0);
        // ⚠️ [2026-09-04] `cross: "UNKNOWN"` · `label: "오류"` 인 **실패 결과**가
        //    「cross 가 null 이 아니다」는 이유로 통과했다. 그래서 갭필이 안 걸리고
        //    화면엔 이동평균이 빈 채로 나갔다(/api/live/sma 단독 호출은 정상값을
        //    돌려주는데도 — NVDA sma50 209.29 · sma200 196.27 실측).
        //    숫자가 하나라도 있어야 쓸 수 있다.
        case 'sma': return numOk(data.sma50) || numOk(data.sma200);
        // 같은 이유로 조인다 — 문자열 «UNKNOWN» 이 아니라 실제 수치가 있어야 한다.
        case 'volatility': return numOk(data.regimeScore) || numOk(data.iv) || numOk(data.gex) || numOk(data.flipLevel);
        case 'squeeze': return (data.siPercent != null && data.siPercent > 0) || (data.shortVolPercent != null && data.shortVolPercent > 0) || (data.daysToCover != null && data.daysToCover > 0);
        case 'institutional': return (data.darkPool?.percent != null && data.darkPool.percent > 0) || (data.compositeScore != null && data.compositeScore > 0);
        // ⚠️ [2026-09-03] options_status 만 보면 «옵션은 있는데 가격이 없는» 페이로드가
        //    「쓸만함」으로 통과해 갭필이 통째로 건너뛰어졌다(AMD 실측: 체인·PCR·GEX 는
        //    있는데 underlyingPrice·prevClose·maxPain 이 전부 null → 화면이 빈 채로 200 OK).
        //    커맨드 화면의 머리글이 가격이다. 가격이 없으면 그 structure 는 못 쓴다.
        // ⚠️ [2026-09-04] 한 겹 더. 「NO_MARKET + 빈 strikes」 인데 netGex·underlyingPrice 가
        //    남아 있어 **껍데기가 「쓸만함」으로 통과**했다(MSFT 실측: expiration 이
        //    오늘(=이미 만료)로 굳고 strikes:[] 인 채 memory-lru 에 앉아 있었다).
        //    그래서 갭필도, DynamoDB GEX 폴백도 한 번도 안 걸렸고 화면엔 감마플립 «—».
        //    화면이 실제로 읽는 값(맥스페인·감마플립)이 없으면 그 structure 는 못 쓴다.
        case 'structure': {
            if (data.options_status === 'NO_MARKET') return false;
            const hasLevels = data.maxPain != null || data.gammaFlipLevel != null
                || data.levels?.callWall != null || data.levels?.putFloor != null;
            return (data.options_status === 'OK' || data.netGex != null)
                && (data.underlyingPrice != null || data.prevClose != null)
                && hasLevels;
        }
        default: return true;
    }
}

// [AWS Phase 2] Fetch DynamoDB GEX history for percentile, flip events, maxpain tracking
async function fetchGexHistoryData(ticker: string): Promise<any> {
    try {
        const { getGexHistory } = await import('@/lib/aws/historyStore');
        const history = await getGexHistory(ticker, 30);
        if (!history || history.length === 0) return null;

        // ★ 정렬을 «가정»하지 않는다.
        //   `historyStore.getGexHistory` 는 scanForward:true — **오름차순**이다.
        //   (같은 이름의 `dynamoDataProvider.getGexHistory` 는 내림차순이다.
        //    어느 것을 import 했느냐로 [0] 의 뜻이 뒤집힌다.)
        //   예전엔 `gexValues[0]` 을 «현재 GEX» 로 썼는데 그건 **30일 전 값**이라
        //   백분위가 통째로 어긋났다. timestamp 로 최신을 고른다.
        const sorted = [...history].sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp));
        const gexValues = sorted.map((h: any) => h.gex).filter((v: number) => v !== 0);
        const currentGex = gexValues.length ? gexValues[gexValues.length - 1] : 0;
        const belowCount = gexValues.filter((v: number) => v < currentGex).length;
        const gexPercentile = gexValues.length > 0 ? Math.round((belowCount / gexValues.length) * 100) : null;

        // Detect Gamma Flip events (flipLevel changes)
        //   ⚠️ 오름차순이므로 «최신»은 뒤쪽이다. 뒤에서 앞으로 걸으며 비교한다.
        //      예전엔 curr=history[i-1] · prev=history[i] 로 **앞뒤가 뒤집혀** 있었다.
        const flipEvents: any[] = [];
        for (let i = sorted.length - 1; i >= 1 && flipEvents.length < 30; i--) {
            const curr = sorted[i];
            const prev = sorted[i - 1];
            if (curr.flipLevel && prev.flipLevel && Math.abs(curr.flipLevel - prev.flipLevel) > curr.flipLevel * 0.02) {
                flipEvents.push({
                    date: new Date(curr.timestamp).toISOString().slice(0, 10),
                    from: prev.flipLevel,
                    to: curr.flipLevel,
                    direction: curr.flipLevel > prev.flipLevel ? 'UP' : 'DOWN',
                });
            }
        }

        // Max Pain movement tracking (last 5 entries)
        const maxPainHistory = history.slice(0, 5)
            .filter((h: any) => h.maxPain)
            .map((h: any) => ({ date: new Date(h.timestamp).toISOString().slice(0, 10), maxPain: h.maxPain, price: h.price }));

        // GEX regime distribution (30-day)
        const regimeCounts = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
        history.forEach((h: any) => {
            const regime = h.gammaRegime || 'NEUTRAL';
            if (regime in regimeCounts) regimeCounts[regime as keyof typeof regimeCounts]++;
        });

        return {
            gexPercentile,
            gex30dCount: history.length,
            gex30dHigh: Math.max(...gexValues),
            gex30dLow: Math.min(...gexValues),
            flipEvents: flipEvents.slice(0, 5),
            maxPainHistory,
            regimeDistribution: regimeCounts,
        };
    } catch {
        return null;
    }
}

// [극강 Layer 5] JSON response with Vercel CDN edge caching headers
// s-maxage: Vercel CDN caches at edge (서버 함수 호출 자체가 없음)
// stale-while-revalidate: 만료 후에도 즉시 stale 응답 + 백그라운드 갱신
async function enrichExpiration(data: any): Promise<any> {
    // [FIX] If structure exists but has no expiration, supplement from analysis cache
    if (data?.structure && !data.structure.expiration) {
        try {
            const { getAnalysisCacheForTickers } = await import('@/services/analysisCache');
            const ticker = data.structure.ticker || data.ticker;
            if (ticker) {
                const acMap = await getAnalysisCacheForTickers([ticker]);
                const ac = acMap[ticker.toUpperCase()];
                if (ac?.expiration) {
                    data.structure = { ...data.structure, expiration: ac.expiration };
                }
            }
        } catch { /* non-critical */ }
    }
    return data;
}

/**
 * [2026-08-29] 다크풀 계열 최종 게이트 — 응답 출구에서 한 번에 차단
 *
 * Massive 차단 이후 stale 다크풀이 **여섯 갈래**로 새어 나왔다:
 *   ① rt-metrics (ElastiCache)        ② rt-metrics (Upstash)
 *   ③ cache:inst-last (ec2-last-known) ④ signum-flow-history (DynamoDB)
 *   ⑤ signum-unified-cache (DynamoDB)  ⑥ lambda-harvest 의 "count===0 이면 기존값 보존" 로직
 *
 * 캐시를 지우고 소비처를 막아도 크론/Lambda 가 다시 채워 넣어 되살아났다.
 * 입구를 하나씩 쫓는 대신 **출구를 막는다.** 데이터 소스가 복구되면
 * ENABLE_MASSIVE_TICKS=1 로 되돌리면 된다.
 */
function stripStaleInstitutional(data: any): any {
    if (!data || typeof data !== 'object') return data;
    if (process.env.ENABLE_MASSIVE_TICKS === '1') return data;

    const inst = data.institutional;
    if (inst && typeof inst === 'object') {
        data.institutional = {
            ...inst,
            darkPool: null,
            blockTrade: null,
            shortVolume: null,
            // 벤더명을 사유로 쓰지 않는다 — 공급사가 바뀌어도 사실인 문구로.
            // (지금 이유는 «차단» 이 아니라 «현재 플랜에 틱 데이터가 없음» 이다)
            _source: 'unavailable-tick-data-not-in-plan',
        };
    }
    return data;
}

/**
 * 경로마다 다른 이름으로 담기는 값을 **응답 직전에** 한 번 맞춘다.
 *
 * ⚠️ [2026-09-03] 생성 시점에만 맞췄더니 «이미 저장돼 있던» 옛 모양의 캐시가
 *    그대로 나갔다(실측: NVDA gammaRegime undefined, _source=memory-lru/cache).
 *    캐시 키를 올려도 DynamoDB 24시간 창에 남은 것까지는 못 막는다.
 *    → 어디서 온 페이로드든 나가기 직전에 통과하도록 여기로 옮긴다.
 *
 *    화면(MobileCommandPage L136)이 `s.pcRatio || ud.options?.pcr || 0` 로 읽는데
 *    직접 생성 경로는 `structure.pcr` 로 담아서 **실제 0.69 인데 화면엔 0** 이었다.
 *    에러가 안 나는 오류라 화면만 봐서는 못 잡는다.
 */
function normalizeShape(data: any): any {
    if (!data || typeof data !== 'object') return data;
    const st: any = data.structure;
    if (st && typeof st === 'object') {
        if (st.pcRatio == null && st.pcr != null) st.pcRatio = st.pcr;
        if (st.pcr == null && st.pcRatio != null) st.pcr = st.pcRatio;
        if (st.gammaRegime == null) {
            const lbl = data.volatility?.gexLabel;
            st.gammaRegime = lbl === 'SHORT' ? 'SHORT_GAMMA'
                : lbl === 'LONG' ? 'LONG_GAMMA'
                    : (typeof st.netGex === 'number'
                        ? (st.netGex < 0 ? 'SHORT_GAMMA' : 'LONG_GAMMA')
                        : null);   // 근거가 없으면 «없음»으로 둔다. NEUTRAL 로 지어내지 않는다.
        }
        if (data.options == null && (st.pcRatio != null || data.volatility?.iv != null)) {
            data.options = { pcr: st.pcRatio ?? null, iv: data.volatility?.iv ?? st.atmIV ?? null };
        }
    }
    return data;
}

function jsonResponse(data: any, status = 200) {
    const isMarket = isMarketHoursNow();
    return NextResponse.json(normalizeShape(stripStaleInstitutional(data)), {
        status,
        headers: {
            'Cache-Control': isMarket
                ? 'public, s-maxage=15, stale-while-revalidate=60, max-age=10'
                : 'public, s-maxage=300, stale-while-revalidate=3600, max-age=60',
        }
    });
}

// Helper to reliably get the localhost URL for internal API calls
function getBaseUrl(request: NextRequest) {
    // Priority 1: Vercel standard URL
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    // Priority 2: Use host from request headers if available
    const host = request.headers.get('host');
    if (host) {
        const protocol = host.includes('localhost') ? 'http' : 'https';
        return `${protocol}://${host}`;
    }
    // Priority 3: Fallback local port
    const port = process.env.PORT || '3000';
    return `http://localhost:${port}`;
}

// Bypasses Next.js HTTP routing — with 8s per-call timeout (overview needs FMP+Polygon+Translate)
const INTERNAL_CALL_TIMEOUT_MS = 8000;

async function callInternalGet(handler: Function, url: string) {
    try {
        const mockReq = new NextRequest(url);
        const result = await Promise.race([
            handler(mockReq).then(async (res: any) => {
                if (!res || !res.ok) return null;
                return await res.json();
            }),
            new Promise<null>(resolve => setTimeout(() => {
                console.warn(`[Command Unified] ⏱️ Timeout (${INTERNAL_CALL_TIMEOUT_MS}ms): ${url.split('?')[0].split('/').pop()}`);
                resolve(null);
            }, INTERNAL_CALL_TIMEOUT_MS))
        ]);
        return result;
    } catch (e) {
        console.warn(`[Command Unified] Direct functional call failed: ${url}`, e);
        return null;
    }
}

// [REMOVED] buildUnifiedData — replaced by AWS Lambda cold-start (v7.2)
// All Polygon fetches now happen in Lambda, NOT in Vercel.

// [AWS-FIRST] Build structure from DynamoDB GEX data (0.1s vs Polygon 20-27s)
// This replaces the slow options/structure Polygon API call in gap-fill paths
async function getStructureFromDynamoGex(ticker: string): Promise<any | null> {
    try {
        const { getLatestGex } = await import('@/lib/aws/dynamoDataProvider');
        const gex = await Promise.race([
            getLatestGex(ticker),
            new Promise<null>(r => setTimeout(() => r(null), 3000)) // 3s safety timeout
        ]);
        if (!gex || (!gex.gex && !gex.maxPain)) return null;

        // [FIX] Get expiration from analysis cache (warm-analysis stores it from structureService)
        let expiration: string | null = null;
        try {
            const { getAnalysisCacheForTickers } = await import('@/services/analysisCache');
            const acMap = await getAnalysisCacheForTickers([ticker]);
            const ac = acMap[ticker.toUpperCase()];
            if (ac?.expiration) expiration = ac.expiration;
        } catch { /* analysis cache unavailable, expiration stays null */ }

        return {
            options_status: 'OK',
            ticker,
            expiration,
            netGex: gex.gex,
            maxPain: gex.maxPain,
            pcRatio: gex.pcr,
            levels: { callWall: gex.callWall, putFloor: gex.putFloor },
            gammaFlipLevel: gex.flipLevel,
            gammaRegime: gex.gammaRegime,
            totalContracts: gex.totalContracts || 0,
            totalCallOI: gex.totalCallOI || 0,
            totalPutOI: gex.totalPutOI || 0,
            validation: { confidence: 'HIGH', source: 'dynamodb-gex' },
            _ts: Date.now(),
        };
    } catch {
        return null;
    }
}

// [AWS-FIRST] Build volatility from DynamoDB GEX data (0.1s vs Polygon 27s)
async function getVolatilityFromDynamoGex(ticker: string): Promise<any | null> {
    try {
        const { getLatestGex } = await import('@/lib/aws/dynamoDataProvider');
        const gex = await Promise.race([
            getLatestGex(ticker),
            new Promise<null>(r => setTimeout(() => r(null), 3000))
        ]);
        if (!gex) return null;
        const isShortGamma = gex.gex < 0;
        const flipLevel = gex.flipLevel || 0;
        const spotPrice = gex.price || 0;
        const flipDist = flipLevel > 0 && spotPrice > 0 ? ((spotPrice - flipLevel) / spotPrice) * 100 : 0;
        let regimeScore = 0;
        if (isShortGamma) regimeScore += Math.min(30, Math.abs(gex.gex) / 1000000 * 3);
        if (Math.abs(flipDist) < 1) regimeScore += 15; else if (Math.abs(flipDist) < 3) regimeScore += 10;
        regimeScore = Math.min(100, Math.round(regimeScore));
        const regime = regimeScore >= 75 ? 'ERUPTING' : regimeScore >= 50 ? 'LOADED' : regimeScore >= 25 ? 'COILING' : 'CALM';
        return {
            regime, regimeScore, gammaRegime: gex.gammaRegime,
            gex: Math.round(gex.gex), gexLabel: isShortGamma ? 'SHORT' : 'LONG',
            iv: (gex as any).atmIv || 0, flipDistance: Math.round(flipDist * 10) / 10, flipLevel,
            isAboveFlip: flipDist > 0, squeezeScore: 0, squeezeRisk: 'LOW',
            gammaConcentration: 0, gammaConcentrationLabel: 'NORMAL',
            pcr: gex.pcr, _ts: Date.now(),
            validation: { source: 'dynamodb-gex' },
        };
    } catch { return null; }
}


// ════════════════════════════════════════════════════════════════════════════
// [EC2 SSOT] Inject accurate institutional data from EC2 ElastiCache
// EC2 flow-accumulator provides 100% trade data (vs Polygon's 5,000 sample)
// Must be called BEFORE any setInCache that includes institutional data
// [FIX 2026-05-11] "Last Known Good" — preserves last EC2 data through weekends/holidays.
// On EC2 success: save to cache:inst-last:TICKER (72h TTL).
// On EC2 null/failure: restore from cache:inst-last:TICKER.
// ════════════════════════════════════════════════════════════════════════════
const INST_LAST_PREFIX = 'cache:inst-last:';
const INST_LAST_TTL = 259200; // 72 hours — covers Friday→Monday

async function injectEC2Institutional(data: any, ticker: string): Promise<boolean> {
    if (!data) return false;
    try {
        const EC2_PROXY = process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
        const EC2_KEY = process.env.REDIS_PROXY_KEY || 'signum-redis-proxy-2026';
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const ec2Res = await fetch(`${EC2_PROXY}/get?key=${encodeURIComponent('rt-metrics:' + ticker)}`, {
            headers: { 'Authorization': `Bearer ${EC2_KEY}` },
            signal: controller.signal,
            cache: 'no-store',
        });
        clearTimeout(timeout);
        if (ec2Res.ok) {
            const ec2Raw = await ec2Res.json();
            const ec2Data = ec2Raw?.result;
            const parsed = typeof ec2Data === 'string' ? JSON.parse(ec2Data) : ec2Data;
            if (parsed?.blockTrade?.count > 0) {
                const instPayload = {
                    darkPool: { percent: parsed.darkPool?.percent || data.institutional?.darkPool?.percent || 0 },
                    blockTrade: { count: parsed.blockTrade.count, volume: parsed.blockTrade.volume || 0 },
                    shortVolume: parsed.shortVolume || data.institutional?.shortVolume || null,
                    _ts: Date.now(),
                    _source: 'ec2-flow-accumulator',
                };
                data.institutional = { ...(data.institutional || {}), ...instPayload };
                // [PERSIST] Save last known good EC2 data — survives weekend/holiday TTL expiry
                setInCache(`${INST_LAST_PREFIX}${ticker}`, instPayload, INST_LAST_TTL).catch(() => {});
                return true;
            }
        }
    } catch { /* EC2 proxy unavailable */ }

    // [FALLBACK] EC2 returned null or failed — restore last known good data
    //
    // ⚠️ [2026-08-29] 나이 제한 필수.
    //   Massive 차단으로 flow-accumulator 가 죽은 뒤 이 폴백이 **어제 값을
    //   무기한 되살리고** 있었다(darkPool 50% · block 52).
    //   ElastiCache/Upstash 의 rt-metrics 를 지워도 여기서 다시 새어 나온다.
    //   원래 의도는 "주말/휴일 TTL 만료 대비"이므로 3일이면 충분하다.
    //   그보다 오래된 값은 되살리지 않고 화면에 '-' 가 뜨게 둔다.
    const INST_LAST_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3일
    try {
        const lastKnown = await getFromCache<any>(`${INST_LAST_PREFIX}${ticker}`);
        const age = lastKnown?._ts ? Date.now() - lastKnown._ts : Infinity;
        if (lastKnown && lastKnown.blockTrade?.count > 0 && age < INST_LAST_MAX_AGE_MS) {
            data.institutional = {
                ...(data.institutional || {}),
                ...lastKnown,
                _source: 'ec2-last-known',
                _ageMs: age,
            };
            return true;
        }
    } catch { /* Redis unavailable */ }
    return false;
}

// [AWS-FIRST] Background Revalidator — reads from DynamoDB, NOT Polygon.
// warm-command cron is responsible for populating DynamoDB. This just syncs DynamoDB→Redis.
async function triggerBackgroundRefresh(ticker: string, dataCacheKey: string, overviewCacheKey: string, _baseUrl: string, _locale: string) {
    console.log(`[Command Unified] SWR background sync (DynamoDB→Redis) for ${ticker}`);
    try {
        const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
        const dynamoData = await Promise.race([
            getUnifiedCache(ticker, 'en'),
            new Promise<null>(r => setTimeout(() => r(null), 5000)) // 5s timeout
        ]);
        if (dynamoData && typeof dynamoData === 'object') {
            const CORE_FIELDS = ['structure','analyst','fundamentals','earnings','sma','related','squeeze','volatility','institutional'] as const;
            const fieldCount = CORE_FIELDS.filter(f => (dynamoData as any)[f]).length;
            if (fieldCount >= 3) {
                // [FIX] EC2 institutional SSOT — prevent DynamoDB Polygon data from overwriting
                await injectEC2Institutional(dynamoData, ticker);
                await setInCache(dataCacheKey, dynamoData, getSmartTTL());
                memorySet(ticker, dynamoData); // [FIX] Sync memory cache — prevents stale Layer 1 from overriding
                console.log(`[Command Unified] SWR sync complete: ${ticker} (${fieldCount}/9 fields, inst: ${(dynamoData as any).institutional?.blockTrade?.count || 0} blocks)`);
            }
        }
    } catch (e) {
        console.warn(`[Command Unified] SWR sync failed for ${ticker}:`, e);
    }
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('t')?.toUpperCase();
    const locale = searchParams.get('lang') || 'en';

    if (!ticker) {
        return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }

    // [통합] Language-independent data key + language-specific overview key
    const dataCacheKey = `${CACHE_KEY_PREFIX}${ticker}`;              // Polygon data (shared across all languages)
    const overviewCacheKey = `${OVERVIEW_KEY_PREFIX}${ticker}:${locale}`; // Overview (per language)
    const start = Date.now();

    try {
        // ══════════════════════════════════════════════════════════════
        // [극강 Layer 1] IN-MEMORY LRU — 0ms response
        // ══════════════════════════════════════════════════════════════
        const memKey = `v4:${ticker}`; // Language-independent (data is shared). v3 = 판정 강화(2026-09-04)
        const memData = memoryGet(memKey);
        if (memData && (memData.structure || memData.options)) {
            const ageMs = Date.now() - (memData.timestamp || 0);
            if (ageMs > REFRESH_THRESHOLD_MS) {
                const baseUrl = getBaseUrl(request);
                after(() => {
                    triggerBackgroundRefresh(ticker, dataCacheKey, overviewCacheKey, baseUrl, locale);
                });
            }
            // Merge with language-specific overview: memory → Redis → API fetch
            let overview = memoryGet(`overview:${ticker}:${locale}`);
            if (!overview) {
                overview = await getFromCache<any>(overviewCacheKey).catch(() => null);
            }
            if (!overview) {
                // Overview not cached yet — fetch from API and cache for next time
                const baseUrl = getBaseUrl(request);
                overview = await callInternalGet(getOverview, `${baseUrl}/api/live/overview?t=${ticker}&lang=${locale}`);
                if (overview) {
                    setInCache(overviewCacheKey, overview, getSmartTTL()).catch(() => {});
                    memorySet(`overview:${ticker}:${locale}`, overview);
                }
            }
            // [AWS-FIRST] Enrich volatility IV if memory-cached data has iv=0
            let enrichedMemData = memData;
            if (memData.volatility && memData.volatility.iv === 0) {
                let ivFound = false;
                // Attempt 1: Lambda DynamoDB (unified-cache)
                try {
                    const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
                    const snap = await Promise.race([
                        getUnifiedCache(ticker, locale),
                        new Promise<any>(r => setTimeout(() => r(null), 2000))
                    ]);
                    if (snap?.volatility?.iv && snap.volatility.iv > 0) {
                        enrichedMemData = { ...memData, volatility: { ...snap.volatility, _ts: Date.now() } };
                        memorySet(memKey, enrichedMemData);
                        ivFound = true;
                    }
                } catch { /* DynamoDB unavailable */ }
                // Attempt 2: Live Polygon API (always has IV during/after market)
                if (!ivFound) {
                    try {
                        const baseUrl = getBaseUrl(request);
                        const volRes = await Promise.race([
                            callInternalGet(getVolatility, `${baseUrl}/api/live/volatility-regime?t=${ticker}`),
                            new Promise<any>(r => setTimeout(() => r(null), 3000))
                        ]);
                        if (volRes?.iv && volRes.iv > 0) {
                            enrichedMemData = { ...memData, volatility: { ...volRes, _ts: Date.now() } };
                            memorySet(memKey, enrichedMemData);
                        }
                    } catch { /* Polygon unavailable */ }
                }
            }
            // [FIX] Cross-reference: inject atmIV into structure from volatility
            // Frontend's structureDerived reads structure.atmIV to display IV%
            const finalData = enrichedMemData;
            if (finalData.structure && !finalData.structure.atmIV && finalData.volatility?.iv > 0) {
                finalData.structure = { ...finalData.structure, atmIV: finalData.volatility.iv / 100 };
            }
            await enrichExpiration(finalData);
            await injectAlphaBypass(finalData, ticker);

            // [FIX 2026-06-06] Earnings SYNCHRONOUS enrichment — don't defer to after()
            // FMP Lambda often misses M7 large-caps → earnings: null in cache.
            // Without this, user sees TBD on first visit and must wait for after() + next request.
            if (!finalData.earnings || !finalData.earnings.nextEarningsDate) {
                try {
                    const earningsResult = await Promise.race([
                        callInternalGet(getEarnings, `${getBaseUrl(request)}/api/live/earnings?t=${ticker}`),
                        new Promise<null>(r => setTimeout(() => r(null), 3000))
                    ]);
                    if (earningsResult && earningsResult.hasData !== false) {
                        finalData.earnings = { ...(finalData.earnings || {}), ...earningsResult };
                        memorySet(memKey, finalData);
                        setInCache(dataCacheKey, finalData, getSmartTTL()).catch(() => {});
                    }
                } catch { /* Finnhub unavailable — will retry next request */ }
            }

            // [FIX 2026-05-06] EC2 institutional ALWAYS injected — ElastiCache retains last session data 24/7
            // Previously gated by isMarketHoursNow() → off-hours fell back to stale DynamoDB Polygon samples
            await injectEC2Institutional(finalData, ticker);
            memorySet(memKey, finalData);

            return jsonResponse({ ...finalData, overview: overview || null, _source: 'memory-lru', _ageMs: ageMs });
        }

        // ══════════════════════════════════════════════════════════════
        // [극강 Layer 2] Redis Cache — ~5ms response (TTL 30min)
        // ══════════════════════════════════════════════════════════════
        let [cachedData, cachedOverview] = await Promise.all([
            getFromCache<any>(dataCacheKey).catch(() => null),
            getFromCache<any>(overviewCacheKey).catch(() => null),
        ]);

        // Migration fallback: try old key format if new key has no data
        if (!cachedData) {
            const oldKey = `${CACHE_KEY_PREFIX}${ticker}:${locale}`;
            const oldData = await getFromCache<any>(oldKey).catch(() => null);
            if (oldData && oldData.timestamp && (oldData.structure || oldData.options)) {
                cachedData = oldData;
                if (!cachedOverview && oldData.overview) cachedOverview = oldData.overview;
                // Migrate to new key format for next time
                setInCache(dataCacheKey, oldData, getSmartTTL()).catch(() => {});
                if (oldData.overview) setInCache(overviewCacheKey, oldData.overview, getSmartTTL()).catch(() => {});
            }
        }

        if (cachedData && cachedData.timestamp) {
            const ageMs = Date.now() - cachedData.timestamp;

            // [QUALITY CHECK] If Redis cache is severely incomplete (5+ missing core fields),
            // try DynamoDB for better data before serving stale Redis cache
            const QC_FIELDS = ['structure','analyst','fundamentals','earnings','sma','related','squeeze','volatility','institutional'] as const;
            const redisFc = QC_FIELDS.filter(f => isFieldUsable(f, cachedData[f])).length;
            if (redisFc <= 4) {
                // Redis cache is too incomplete — check DynamoDB for better data
                try {
                    const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
                    const dynData = await getUnifiedCache(ticker, locale);
                    if (dynData) {
                        const dynamoFc = QC_FIELDS.filter(f => !!(dynData as any)[f]).length;
                        if (dynamoFc > redisFc) {
                            console.log(`[Command Unified] Redis(${redisFc}/9) < DynamoDB(${dynamoFc}/9) for ${ticker} — upgrading cache`);
                            // Merge DynamoDB data into Redis — DynamoDB wins for missing fields
                            for (const f of QC_FIELDS) {
                                if (!isFieldUsable(f, cachedData[f]) && (dynData as any)[f]) {
                                    cachedData[f] = (dynData as any)[f];
                                }
                            }
                            cachedData.timestamp = Date.now();
                            setInCache(dataCacheKey, cachedData, getSmartTTL()).catch(() => {});
                        }
                    }
                } catch { /* DynamoDB unavailable, continue with Redis */ }
            }

            // Get overview: Redis → API fetch
            let resolvedOverview = cachedOverview;
            if (!resolvedOverview) {
                const baseUrl = getBaseUrl(request);
                resolvedOverview = await callInternalGet(getOverview, `${baseUrl}/api/live/overview?t=${ticker}&lang=${locale}`);
                if (resolvedOverview) {
                    setInCache(overviewCacheKey, resolvedOverview, getSmartTTL()).catch(() => {});
                }
            }
            if (resolvedOverview) memorySet(`overview:${ticker}:${locale}`, resolvedOverview);

            // ══════════════════════════════════════════════════════════════
            // [ZERO-WAIT RETURN] Fast in-memory operations only, then IMMEDIATE response.
            // ALL slow API calls (GAP-FILL, IV enrichment, Earnings) run in after().
            // Bloomberg pattern: show cached data instantly, enrich in background.
            // ══════════════════════════════════════════════════════════════

            // [FAST] Cross-reference: inject atmIV into structure from volatility (in-memory, 0ms)
            if (cachedData.structure && !cachedData.structure.atmIV && cachedData.volatility?.iv > 0) {
                cachedData.structure = { ...cachedData.structure, atmIV: cachedData.volatility.iv / 100 };
            }
            await enrichExpiration(cachedData);
            await injectAlphaBypass(cachedData, ticker);

            // [FIX 2026-06-06] Earnings SYNCHRONOUS enrichment for Redis cache tier
            if (!cachedData.earnings || !cachedData.earnings.nextEarningsDate) {
                try {
                    const bgBaseUrl = getBaseUrl(request);
                    const earningsResult = await Promise.race([
                        callInternalGet(getEarnings, `${bgBaseUrl}/api/live/earnings?t=${ticker}`),
                        new Promise<null>(r => setTimeout(() => r(null), 3000))
                    ]);
                    if (earningsResult && earningsResult.hasData !== false) {
                        cachedData.earnings = { ...(cachedData.earnings || {}), ...earningsResult };
                    }
                } catch { /* Finnhub unavailable */ }
            }

            // [FIX 2026-05-06] EC2 institutional ALWAYS injected — preserves last session data through off-hours
            // Previously gated by isMarketHoursNow() → post-market close caused block count regression (252 → 17)
            const ec2Ok = await injectEC2Institutional(cachedData, ticker);
            if (ec2Ok) {
                await setInCache(dataCacheKey, cachedData, getSmartTTL());
                memorySet(memKey, cachedData);
                console.log(`[Command Unified] EC2 institutional for ${ticker}: ${cachedData.institutional?.blockTrade?.count} blocks`);
            } else {
                memorySet(memKey, cachedData);
            }

            // ═══ IMMEDIATE RETURN — user sees ACCURATE data ═══
            const immediateResponse = jsonResponse({ ...cachedData, overview: resolvedOverview || null, _source: 'cache', _ageMs: ageMs });

            // ═══ BACKGROUND ENRICHMENT — SWR sync only (no EC2, already done above) ═══
            const bgBaseUrl = getBaseUrl(request);
            after(async () => {
                try {
                    let enriched = false;

                    // SWR: If older than threshold, do full DynamoDB→Redis sync
                    if (ageMs > REFRESH_THRESHOLD_MS) {
                        await triggerBackgroundRefresh(ticker, dataCacheKey, overviewCacheKey, bgBaseUrl, locale);
                        return; // Full sync covers everything
                    }

                    // [GAP-FILL] Check for missing, empty-shell, or STALE fields
                    // [FIX 2026-05-05] Removed 'institutional' — after() EC2 injection handles it.
                    // Gap-fill's getInstitutional uses Polygon fallback (24 trades) which overwrites
                    // EC2 data (3,500+ trades), causing ping-pong flickering.
                    const VOLATILE_FIELDS = new Set(['squeeze', 'volatility']);
                    const VOLATILE_STALE_MS = 300_000;
                    const CORE_FIELDS = ['analyst','fundamentals','earnings','related','sma','squeeze','volatility','structure'] as const;
                    const missingFields = CORE_FIELDS.filter(f => {
                        if (!isFieldUsable(f, cachedData[f])) return true;
                        if (VOLATILE_FIELDS.has(f) && isMarketHoursNow()) {
                            const fieldTs = cachedData[f]?._ts || cachedData.timestamp || 0;
                            if (Date.now() - fieldTs > VOLATILE_STALE_MS) return true;
                        }
                        return false;
                    });

                    // [AWS-FIRST] Enrich volatility IV if cached data has iv=0
                    if (cachedData.volatility && cachedData.volatility.iv === 0) {
                        let ivFound = false;
                        try {
                            const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
                            const snap = await Promise.race([
                                getUnifiedCache(ticker, locale),
                                new Promise<any>(r => setTimeout(() => r(null), 3000))
                            ]);
                            if (snap?.volatility?.iv && snap.volatility.iv > 0) {
                                cachedData.volatility = { ...snap.volatility, _ts: Date.now() };
                                ivFound = true;
                                enriched = true;
                            }
                        } catch { /* DynamoDB unavailable */ }
                        if (!ivFound) {
                            try {
                                const volRes = await Promise.race([
                                    callInternalGet(getVolatility, `${bgBaseUrl}/api/live/volatility-regime?t=${ticker}`),
                                    new Promise<any>(r => setTimeout(() => r(null), 3000))
                                ]);
                                if (volRes?.iv && volRes.iv > 0) {
                                    cachedData.volatility = { ...volRes, _ts: Date.now() };
                                    enriched = true;
                                }
                            } catch { /* Polygon unavailable */ }
                        }
                    }

                    // [GAP-FILL] Fill missing/stale fields via DynamoDB + sub-APIs
                    if (missingFields.length > 0 && missingFields.length <= 7) {
                        let structureFilled = false;
                        let volatilityFilled = false;

                        if (missingFields.includes('structure')) {
                            const dynamoStructure = await getStructureFromDynamoGex(ticker);
                            if (dynamoStructure) {
                                cachedData.structure = dynamoStructure;
                                structureFilled = true;
                            }
                        }
                        if (missingFields.includes('volatility')) {
                            const existingIv = cachedData.volatility?.iv || 0;
                            const dynamoVol = await getVolatilityFromDynamoGex(ticker);
                            if (dynamoVol) {
                                if (dynamoVol.iv === 0 && existingIv > 0) dynamoVol.iv = existingIv;
                                cachedData.volatility = dynamoVol;
                                volatilityFilled = true;
                            }
                        }

                        const remainingFields = missingFields.filter(f =>
                            !(f === 'structure' && structureFilled) &&
                            !(f === 'volatility' && volatilityFilled)
                        );
                        if (remainingFields.length > 0) {
                            const fieldHandlers: Record<string, [Function, string]> = {
                                'analyst': [getAnalyst, `${bgBaseUrl}/api/live/analyst?t=${ticker}`],
                                'fundamentals': [getFundamentals, `${bgBaseUrl}/api/live/fundamentals?t=${ticker}`],
                                'earnings': [getEarnings, `${bgBaseUrl}/api/live/earnings?t=${ticker}`],
                                'related': [getRelated, `${bgBaseUrl}/api/live/related?t=${ticker}`],
                                'sma': [getSma, `${bgBaseUrl}/api/live/sma?t=${ticker}`],
                                'squeeze': [getSqueeze, `${bgBaseUrl}/api/live/short-squeeze?t=${ticker}`],
                                'volatility': [getVolatility, `${bgBaseUrl}/api/live/volatility-regime?t=${ticker}`],
                                'structure': [getStructure, `${bgBaseUrl}/api/live/options/structure?t=${ticker}`],
                                'institutional': [getInstitutional, `${bgBaseUrl}/api/flow/realtime-metrics?ticker=${ticker}`],
                            };
                            const gapPromises = remainingFields.map(f => {
                                const [handler, url] = fieldHandlers[f];
                                return callInternalGet(handler, url);
                            });
                            const gapResults = await Promise.all(gapPromises);
                            for (let i = 0; i < remainingFields.length; i++) {
                                if (gapResults[i]) {
                                    if (VOLATILE_FIELDS.has(remainingFields[i])) gapResults[i]._ts = Date.now();
                                    cachedData[remainingFields[i]] = gapResults[i];
                                } else if (VOLATILE_FIELDS.has(remainingFields[i]) && cachedData[remainingFields[i]]) {
                                    cachedData[remainingFields[i]] = { ...cachedData[remainingFields[i]], _ts: Date.now() };
                                }
                            }
                        }
                        const totalFilled = missingFields.filter(f => isFieldUsable(f, cachedData[f])).length;
                        if (totalFilled > 0 || structureFilled) enriched = true;
                        console.log(`[Command Unified] BG GAP-FILL ${ticker}: ${totalFilled}/${missingFields.length} fields${structureFilled ? ' (structure via DynamoDB)' : ''}`);
                    }

                    // [Earnings enrichment] date, revision, surprise
                    if (cachedData.earnings && !cachedData.earnings.nextEarningsDate) {
                        try {
                            const { getEarningsCalendar } = await import('@/services/finnhubClient');
                            const earningsList = await getEarningsCalendar(ticker);
                            earningsList.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
                            const today = new Date(); today.setHours(0, 0, 0, 0);
                            const upcoming = earningsList.find((ev: any) => new Date(ev.date) >= today);
                            if (upcoming) {
                                const earDate = new Date(upcoming.date); earDate.setHours(0, 0, 0, 0);
                                const daysUntil = Math.ceil((earDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                cachedData.earnings = {
                                    ...cachedData.earnings,
                                    nextEarningsDate: upcoming.date,
                                    daysUntilEarnings: daysUntil,
                                    daysLabel: daysUntil < 0 ? `D+${Math.abs(daysUntil)}` : daysUntil === 0 ? 'today' : `D-${daysUntil}`,
                                    epsEstimate: upcoming.epsEstimate || cachedData.earnings.epsEstimate,
                                    color: daysUntil <= 3 && daysUntil >= 0 ? 'text-rose-400' : daysUntil <= 7 && daysUntil >= 0 ? 'text-amber-400' : 'text-slate-400',
                                };
                                enriched = true;
                            }
                        } catch { /* Finnhub unavailable */ }
                    }
                    if (cachedData.earnings && cachedData.earnings.forwardEpsRevision === undefined) {
                        try {
                            const { getEarningsData } = await import('@/lib/aws/dynamoDataProvider');
                            const patternData = await getEarningsData(ticker);
                            if (patternData) {
                                cachedData.earnings = {
                                    ...cachedData.earnings,
                                    forwardEpsRevision: patternData.forwardEpsRevision ?? null,
                                    forwardEpsRevisionDate: patternData.forwardEpsRevisionDate ?? null,
                                    forwardRevRevision: patternData.forwardRevRevision ?? null,
                                    forwardRevRevisionDate: patternData.forwardRevRevisionDate ?? null,
                                };
                                enriched = true;
                            }
                        } catch { /* DynamoDB unavailable */ }
                    }
                    if (cachedData.earnings && !cachedData.earnings.lastSurprise) {
                        try {
                            const { getEarningsSurprise, getEarningsCalendar } = await import('@/services/finnhubClient');
                            const [surprise, cal] = await Promise.all([
                                getEarningsSurprise(ticker).catch(() => null),
                                !cachedData.earnings.hourLabel ? getEarningsCalendar(ticker).catch(() => []) : Promise.resolve([])
                            ]);
                            const updates: any = {};
                            if (surprise) {
                                updates.lastSurprise = { actualEps: surprise.actual, estimatedEps: surprise.estimate, surpriseEps: Number(surprise.surprise.toFixed(3)), surprisePct: Number(surprise.surprisePercent.toFixed(1)), date: surprise.period };
                            }
                            if (!cachedData.earnings.hourLabel && Array.isArray(cal) && cal.length > 0) {
                                const today = new Date(); today.setHours(0, 0, 0, 0);
                                const upcoming = cal.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).find((e: any) => new Date(e.date) >= today);
                                if (upcoming?.hour) updates.hourLabel = upcoming.hour;
                            }
                            if (Object.keys(updates).length > 0) { cachedData.earnings = { ...cachedData.earnings, ...updates }; enriched = true; }
                        } catch { /* Finnhub unavailable */ }
                    }

                    // Cross-reference IV after enrichment
                    if (cachedData.structure && !cachedData.structure.atmIV && cachedData.volatility?.iv > 0) {
                        cachedData.structure = { ...cachedData.structure, atmIV: cachedData.volatility.iv / 100 };
                        enriched = true;
                    }

                    // Save enriched data to Redis + Memory for next request
                    if (enriched) {
                        cachedData.timestamp = Date.now();
                        await setInCache(dataCacheKey, cachedData, getSmartTTL());
                        memorySet(memKey, cachedData);
                        console.log(`[Command Unified] ✅ BG enrichment saved for ${ticker}`);
                    }
                } catch (e) {
                    console.warn(`[Command Unified] BG enrichment failed for ${ticker}:`, e);
                }
            });

            return immediateResponse;
        }

        // ══════════════════════════════════════════════════════════════
        // TIER 1.5: DynamoDB Unified Cache + Sub-API Gap Fill
        // Uses whatever DynamoDB has, fills missing fields via sub-APIs
        // ══════════════════════════════════════════════════════════════
        try {
            const { getUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
            const dynamoUnified = await getUnifiedCache(ticker, locale);
            if (dynamoUnified) {
                const CF = ['structure','analyst','fundamentals','earnings','sma','related','squeeze','volatility','institutional'] as const;
                const fc = CF.filter(f => (dynamoUnified as any)[f]).length;
                
                // Use DynamoDB data as base, fill missing fields with sub-APIs
                const { overview: _dov, _source: _s, _ageMs: _a, ...dynData } = dynamoUnified;
                const bUrl = getBaseUrl(request);
                
                // Identify missing fields and fetch them in parallel
                const gapFills: Promise<any>[] = [];
                const gapNames: string[] = [];
                
                if (!isFieldUsable('analyst', dynData.analyst)) { gapFills.push(callInternalGet(getAnalyst, `${bUrl}/api/live/analyst?t=${ticker}`)); gapNames.push('analyst'); }
                if (!isFieldUsable('fundamentals', dynData.fundamentals)) { gapFills.push(callInternalGet(getFundamentals, `${bUrl}/api/live/fundamentals?t=${ticker}`)); gapNames.push('fundamentals'); }
                if (!isFieldUsable('earnings', dynData.earnings)) { gapFills.push(callInternalGet(getEarnings, `${bUrl}/api/live/earnings?t=${ticker}`)); gapNames.push('earnings'); }
                if (!isFieldUsable('related', dynData.related)) { gapFills.push(callInternalGet(getRelated, `${bUrl}/api/live/related?t=${ticker}`)); gapNames.push('related'); }
                if (!isFieldUsable('sma', dynData.sma)) { gapFills.push(callInternalGet(getSma, `${bUrl}/api/live/sma?t=${ticker}`)); gapNames.push('sma'); }
                if (!isFieldUsable('squeeze', dynData.squeeze)) { gapFills.push(callInternalGet(getSqueeze, `${bUrl}/api/live/short-squeeze?t=${ticker}`)); gapNames.push('squeeze'); }
                // ★ [2026-09-04] 여기가 «종목을 누르면 8초»의 정체였다.
                //   DynamoDB GEX 2건과 오버뷰 캐시 읽기를 **줄 세워서** 기다린 뒤에야
                //   갭필 배치를 시작했다 — 서로 아무 의존도 없는데 왕복 4번이 직렬이었다.
                //   실측(2026-09-04 프로덕션, 처음 보는 종목):
                //     DHR 8.17s · KMB 7.95s · CTAS 8.11s · ROST 8.62s
                //     (나머지 9개 엔드포인트는 전부 1.2~3.2초에 끝났다)
                //   → 셋을 **동시에** 띄우고 한 번만 기다린다.
                const needVol = !isFieldUsable('volatility', dynData.volatility);
                const needStruct = !isFieldUsable('structure', dynData.structure);
                const volGexP = needVol ? getVolatilityFromDynamoGex(ticker).catch(() => null) : Promise.resolve(null);
                // [AWS-FIRST] Structure: use DynamoDB GEX (0.1s) instead of Polygon (20-27s)
                const structGexP = needStruct ? getStructureFromDynamoGex(ticker).catch(() => null) : Promise.resolve(null);
                const dynOvP = getFromCache<any>(overviewCacheKey).catch(() => null);

                const [dynamoVol, dynamoStruct, cachedOv] = await Promise.all([volGexP, structGexP, dynOvP]);

                if (needVol) {
                    if (dynamoVol) {
                        (dynData as any).volatility = dynamoVol;
                        console.log(`[Command Unified] ✅ DynamoDB+GapFill: volatility filled from DynamoDB GEX for ${ticker}`);
                    } else {
                        gapFills.push(callInternalGet(getVolatility, `${bUrl}/api/live/volatility-regime?t=${ticker}`));
                        gapNames.push('volatility');
                    }
                }
                if (needStruct) {
                    if (dynamoStruct) {
                        (dynData as any).structure = dynamoStruct;
                        console.log(`[Command Unified] ✅ DynamoDB+GapFill: structure filled from DynamoDB GEX for ${ticker}`);
                    } else {
                        gapFills.push(callInternalGet(getStructure, `${bUrl}/api/live/options/structure?t=${ticker}`));
                        gapNames.push('structure');
                    }
                }

                // Overview (language-specific)
                let dynOv = cachedOv;
                if (!dynOv) {
                    gapFills.push(callInternalGet(getOverview, `${bUrl}/api/live/overview?t=${ticker}&lang=${locale}`));
                    gapNames.push('overview');
                }
                
                // Execute all gap fills in parallel
                const gapResults = await Promise.all(gapFills);
                
                // Merge gap fill results into dynData
                for (let gi = 0; gi < gapNames.length; gi++) {
                    const name = gapNames[gi];
                    const result = gapResults[gi];
                    if (result) {
                        if (name === 'overview') {
                            dynOv = result;
                        } else {
                            (dynData as any)[name] = result;
                        }
                    }
                }
                
                // Cache the completed data
                if (dynOv) {
                    setInCache(overviewCacheKey, dynOv, getSmartTTL()).catch(() => {});
                    memorySet(`overview:${ticker}:${locale}`, dynOv);
                }
                setInCache(dataCacheKey, dynData, getSmartTTL()).catch(() => {});
                memorySet(memKey, dynData);
                
                const finalFc = CF.filter(f => (dynData as any)[f]).length;
                console.log(`[Command Unified] DynamoDB+GapFill ${ticker} ${Date.now() - start}ms (${fc}→${finalFc}/9, filled: ${gapNames.filter((n,i) => gapResults[i] && n !== 'overview').join(',')})`);

                // [V5.0 FIX] Earnings 날짜 보완: forwardEps만 있고 nextEarningsDate 없으면 Finnhub 직접 호출
                if ((dynData as any).earnings && !(dynData as any).earnings.nextEarningsDate) {
                    try {
                        const { getEarningsCalendar } = await import('@/services/finnhubClient');
                        const earningsList = await getEarningsCalendar(ticker);
                        earningsList.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const upcoming = earningsList.find((ev: any) => new Date(ev.date) >= today);
                        if (upcoming) {
                            const earDate = new Date(upcoming.date);
                            earDate.setHours(0, 0, 0, 0);
                            const daysUntil = Math.ceil((earDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                            (dynData as any).earnings = {
                                ...(dynData as any).earnings,
                                nextEarningsDate: upcoming.date,
                                daysUntilEarnings: daysUntil,
                                daysLabel: daysUntil < 0 ? `D+${Math.abs(daysUntil)}` : daysUntil === 0 ? 'today' : `D-${daysUntil}`,
                                epsEstimate: upcoming.epsEstimate || (dynData as any).earnings.epsEstimate,
                                quarter: upcoming.quarter || (dynData as any).earnings.quarter,
                                year: upcoming.year || (dynData as any).earnings.year,
                                color: daysUntil <= 3 && daysUntil >= 0 ? 'text-rose-400' : daysUntil <= 7 && daysUntil >= 0 ? 'text-amber-400' : 'text-slate-400',
                            };
                            console.log(`[Command Unified] ✅ Finnhub earnings date: ${ticker} → ${upcoming.date} (D-${daysUntil})`);
                        }
                    } catch { /* Finnhub unavailable */ }
                }

                // [V5.1 FIX] Earnings revision 보완
                if ((dynData as any).earnings && (dynData as any).earnings.forwardEpsRevision === undefined) {
                    try {
                        const { getEarningsData } = await import('@/lib/aws/dynamoDataProvider');
                        const patternData = await getEarningsData(ticker);
                        if (patternData) {
                            (dynData as any).earnings = {
                                ...(dynData as any).earnings,
                                forwardEpsRevision: patternData.forwardEpsRevision ?? null,
                                forwardEpsRevisionDate: patternData.forwardEpsRevisionDate ?? null,
                                forwardRevRevision: patternData.forwardRevRevision ?? null,
                                forwardRevRevisionDate: patternData.forwardRevRevisionDate ?? null,
                            };
                        }
                    } catch { /* DynamoDB unavailable */ }
                }

                // [V6.0] Earnings surprise + hour enrichment for TIER 1.5
                if ((dynData as any).earnings && !(dynData as any).earnings.lastSurprise) {
                    try {
                        const { getEarningsSurprise, getEarningsCalendar } = await import('@/services/finnhubClient');
                        const [surprise, cal] = await Promise.all([
                            getEarningsSurprise(ticker).catch(() => null),
                            !(dynData as any).earnings.hourLabel ? getEarningsCalendar(ticker).catch(() => []) : Promise.resolve([])
                        ]);
                        const updates: any = {};
                        if (surprise) {
                            updates.lastSurprise = { actualEps: surprise.actual, estimatedEps: surprise.estimate, surpriseEps: Number(surprise.surprise.toFixed(3)), surprisePct: Number(surprise.surprisePercent.toFixed(1)), date: surprise.period };
                        }
                        if (!(dynData as any).earnings.hourLabel && Array.isArray(cal) && cal.length > 0) {
                            const today = new Date(); today.setHours(0, 0, 0, 0);
                            const upcoming = cal.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()).find((e: any) => new Date(e.date) >= today);
                            if (upcoming?.hour) updates.hourLabel = upcoming.hour;
                        }
                        if (Object.keys(updates).length > 0) (dynData as any).earnings = { ...(dynData as any).earnings, ...updates };
                    } catch { /* Finnhub unavailable */ }
                }

                await enrichExpiration(dynData);
                await injectAlphaBypass(dynData, ticker);
                return jsonResponse({ ...dynData, overview: dynOv || null, _source: fc === finalFc ? 'dynamodb-unified' : 'dynamodb-gapfill', _latency: Date.now() - start });
            }
        } catch { /* DynamoDB unavailable, continue to fallback */ }

        // ══════════════════════════════════════════════════════════════
        // TIER 2: ALL CACHES MISSED
        // ══════════════════════════════════════════════════════════════
        const isInUniverse = UNIVERSE.includes(ticker);

        // ══════════════════════════════════════════════════════════════
        // ⚠️⚠️ [2026-09-03 실측으로 발견 — 커맨드 화면이 5일간 비어 있었다]
        //
        //   여기 있던 코드는 유니버스 종목이면 «생성하지 않고» unavailable 을
        //   돌려주고 「warm-command 크론이 채운다」고 적혀 있었다.
        //   **그런 크론은 존재하지 않는다.** (`src/app/api/cron/` 에 없다.)
        //   signum-warm 은 이 라우트를 부를 뿐이라 unavailable 만 받아 가고,
        //   그래서 캐시는 영원히 안 채워진다 — 교착이다.
        //
        //   실측: signum-unified-cache 의 마지막 기록이 **2026-08-28 13:05**,
        //   즉 122시간 전이다(벤더 권한 상실일). 그 전까지는 배치가 채우고
        //   있었고 그게 멈춘 뒤로 NVDA·TSLA·AAPL 전부
        //   `_source:'unavailable'` · 전 필드 null 로 나가고 있었다.
        //
        //   원래 가드의 이유는 주석 그대로 「DO NOT call Polygon」 — **종량 과금**
        //   시절의 비용 방어였다. 지금 벤더 비용은 정액이고 제약은 분당 한도다.
        //   비어 있는 화면보다 한 번 더 부르는 쪽이 낫다.
        //
        //   → 유니버스라고 특별 취급하지 않는다. 아래 «직접 생성» 경로를 그대로
        //     탄다(비유니버스가 이미 쓰던 길이라 새 코드가 아니다).
        //     폭주 방지는 기존 장치가 그대로 맡는다 — Redis 캐시 · 메모리 캐시 ·
        //     그리고 생성 실패 시의 네거티브 캐시.
        // ══════════════════════════════════════════════════════════════
        if (isInUniverse) {
            console.warn(`[Command Unified] ALL CACHES MISS for ${ticker} (UNIVERSE) — 직접 생성으로 진행`);
        }

        // ── Non-universe ticker: Vercel Direct Live Fetch (BFF Pattern) ──
        console.log(`[Command Unified] 🌐 Cold-start for ${ticker} (${isInUniverse ? 'universe' : 'non-universe'}) — Vercel Direct Fetch`);
        try {
            const { getUnifiedCache, putUnifiedCache } = await import('@/lib/aws/unifiedCacheProvider');
            
            // Step 1: Check if DynamoDB already has it from previous access
            const existingDynData = await getUnifiedCache(ticker, locale);
            if (existingDynData) {
                const cacheData = (existingDynData as any).data || existingDynData;
                await setInCache(dataCacheKey, cacheData, getSmartTTL());
                memorySet(memKey, cacheData);
                console.log(`[Command Unified] ✅ Cold-start HIT from previous DynamoDB record for ${ticker}`);
                await injectAlphaBypass(cacheData, ticker);
                return jsonResponse({
                    ...cacheData,
                    overview: null,
                    _source: 'dynamodb-cold-start',
                    _asOf: new Date().toISOString(),
                    _ageSec: Math.round((existingDynData._ageMs || 0) / 1000),
                    _isStale: false,
                    _isPartial: false,
                    _latency: Date.now() - start,
                });
            }

            // Step 2: DIRECT LIVE FETCH (Parallel Aggregation)
            console.log(`[Command Unified] ⚡ Executing live parallel fetch for ${ticker}...`);
            const bUrl = getBaseUrl(request);
            const gapFills: Promise<any>[] = [];
            const gapNames: string[] = [];

            // All core endpoints required for initial render
            gapFills.push(callInternalGet(getAnalyst, `${bUrl}/api/live/analyst?t=${ticker}`)); gapNames.push('analyst');
            gapFills.push(callInternalGet(getFundamentals, `${bUrl}/api/live/fundamentals?t=${ticker}`)); gapNames.push('fundamentals');
            gapFills.push(callInternalGet(getEarnings, `${bUrl}/api/live/earnings?t=${ticker}`)); gapNames.push('earnings');
            gapFills.push(callInternalGet(getRelated, `${bUrl}/api/live/related?t=${ticker}`)); gapNames.push('related');
            gapFills.push(callInternalGet(getSma, `${bUrl}/api/live/sma?t=${ticker}`)); gapNames.push('sma');
            gapFills.push(callInternalGet(getSqueeze, `${bUrl}/api/live/short-squeeze?t=${ticker}`)); gapNames.push('squeeze');
            gapFills.push(callInternalGet(getInstitutional, `${bUrl}/api/flow/realtime-metrics?ticker=${ticker}`)); gapNames.push('institutional');
            
            // Structure & Volatility: DynamoDB GEX is unlikely for non-universe, but we check. If missing, live Polygon.
            // ★ [2026-09-04] 이 둘을 **줄 세워 기다린 뒤에야** 위의 7개 갭필이 시작됐다.
            //   서로 무관한 조회라 동시에 띄우고 한 번만 기다린다(dynamodb 경로와 동일 수정).
            const [dynamoVol, dynamoStruct] = await Promise.all([
                getVolatilityFromDynamoGex(ticker).catch(() => null),
                getStructureFromDynamoGex(ticker).catch(() => null),
            ]);
            if (dynamoVol) {
                gapFills.push(Promise.resolve(dynamoVol)); gapNames.push('volatility');
            } else {
                gapFills.push(callInternalGet(getVolatility, `${bUrl}/api/live/volatility-regime?t=${ticker}`)); gapNames.push('volatility');
            }

            if (dynamoStruct) {
                gapFills.push(Promise.resolve(dynamoStruct)); gapNames.push('structure');
            } else {
                gapFills.push(callInternalGet(getStructure, `${bUrl}/api/live/options/structure?t=${ticker}`)); gapNames.push('structure');
            }

            // Language specific overview
            gapFills.push(callInternalGet(getOverview, `${bUrl}/api/live/overview?t=${ticker}&lang=${locale}`)); gapNames.push('overview');

            // Wait for all fetchers (limited by INTERNAL_CALL_TIMEOUT_MS)
            const gapResults = await Promise.all(gapFills);

            // Assemble Unified Data
            const freshData: any = {};
            let freshOverview = null;

            for (let gi = 0; gi < gapNames.length; gi++) {
                const name = gapNames[gi];
                const result = gapResults[gi];
                if (result) {
                    if (name === 'overview') {
                        freshOverview = result;
                    } else {
                        // Stamp volatile fields to ensure they refresh properly later
                        if (['squeeze', 'institutional', 'volatility'].includes(name)) {
                            result._ts = Date.now();
                        }
                        freshData[name] = result;
                    }
                }
            }

            // Fallback for empty/partial fetches
            freshData.timestamp = Date.now();
            
            // Cross-reference injection
            if (freshData.structure && !freshData.structure.atmIV && freshData.volatility?.iv > 0) {
                freshData.structure = { ...freshData.structure, atmIV: freshData.volatility.iv / 100 };
            }

            // ══════════════════════════════════════════════════════════
            // ⚠️ [2026-09-03] 경로마다 «필드 이름»이 달라 화면이 0 을 그리고 있었다.
            //
            //   화면(MobileCommandPage L136)은 이렇게 읽는다:
            //       pcr: s.pcRatio || ud.options?.pcr || 0
            //   그런데 이 직접 생성 경로의 structure 는 `pcr` 로 담는다(`pcRatio` 아님).
            //   `options` 도 이 경로에선 안 만든다. 그래서 **실제 값 0.69 가 있는데
            //   화면엔 풋콜 비율 0** 으로 나갔다. 에러가 안 나는 오류다.
            //
            //   같은 이유로 gammaRegime 도 비었다 — DynamoDB 경로에만 있던 필드다.
            //   여기서 GEX 부호로 만든다(volatility.gexLabel 이 이미 같은 판정을 한다).
            //
            //   근본 해법은 «모든 경로가 같은 모양을 내는 것»이므로, 다른 경로가
            //   쓰는 이름으로 여기서 맞춰 준다. 화면은 건드리지 않는다.
            // ══════════════════════════════════════════════════════════
            if (freshData.structure) {
                const st: any = freshData.structure;
                if (st.pcRatio == null && st.pcr != null) st.pcRatio = st.pcr;
                if (st.gammaRegime == null) {
                    const lbl = freshData.volatility?.gexLabel;
                    st.gammaRegime = lbl === 'SHORT' ? 'SHORT_GAMMA'
                        : lbl === 'LONG' ? 'LONG_GAMMA'
                            : (typeof st.netGex === 'number'
                                ? (st.netGex < 0 ? 'SHORT_GAMMA' : 'LONG_GAMMA')
                                : 'NEUTRAL');
                }
                // 다른 경로가 내보내는 파생 묶음. 화면의 두 번째 폴백이 여기를 본다.
                if (!freshData.options) {
                    freshData.options = {
                        pcr: st.pcRatio ?? st.pcr ?? null,
                        iv: freshData.volatility?.iv ?? st.atmIV ?? null,
                    };
                }
            }

            // Persist to all 3 Cache Layers (Memory, Redis, DynamoDB) so future users get 5ms response
            memorySet(memKey, freshData);
            setInCache(dataCacheKey, freshData, getSmartTTL()).catch(() => {});
            if (freshOverview) {
                memorySet(`overview:${ticker}:${locale}`, freshOverview);
                setInCache(overviewCacheKey, freshOverview, getSmartTTL()).catch(() => {});
            }
            
            // Background permanent persist to DynamoDB
            putUnifiedCache(ticker, locale, { ...freshData, overview: freshOverview }).catch((e) => console.error('[Command Unified] putUnifiedCache error:', e));

            await enrichExpiration(freshData);
            await injectAlphaBypass(freshData, ticker);

            console.log(`[Command Unified] 🚀 Direct Fetch completed for ${ticker} in ${Date.now() - start}ms`);
            
            return jsonResponse({
                ...freshData,
                overview: freshOverview,
                _source: 'live-direct',
                _asOf: new Date().toISOString(),
                _ageSec: 0,
                _isStale: false,
                _isPartial: false,
                _latency: Date.now() - start,
            });

        } catch (e) {
            console.error(`[Command Unified] Vercel cold-start error for ${ticker}:`, e);
            return jsonResponse({
                _source: 'unavailable',
                _cacheStatus: 'live-direct-failed',
                _asOf: new Date().toISOString(),
                _ageSec: 0,
                _isStale: false,
                _isPartial: true,
                _latency: Date.now() - start,
                _message: `Data for ${ticker} fetch failed. Please retry.`,
                structure: null, options: null, earnings: null, sma: null,
                related: null, analyst: null, volatility: null, squeeze: null,
                institutional: null, fundamentals: null, overview: null, history: null,
                timestamp: Date.now(),
            }, 200);
        }

    } catch (error: any) {
        console.error('[Command Unified] API Error:', error);
        return NextResponse.json({ error: 'Failed to fetch unified data' }, { status: 500 });
    }
}

// ══════════════════════════════════════════════════════════════
// FAST DynamoDB + Analysis Cache check (non-blocking)
// Returns unified data if fresh, or null to fall through to Polygon
// ══════════════════════════════════════════════════════════════
async function tryDynamoFast(ticker: string): Promise<any | null> {
    // --- Attempt 1: DynamoDB (Lambda 300 tickers) ---
    try {
        const { getTickerSnapshot, isDataFresh } = await import('@/lib/aws/dynamoDataProvider');
        const snap = await getTickerSnapshot(ticker);

        // [FIX] Accept data if: today's date OR last trading day (weekends/holidays)
        const hasFreshPrice = snap.price && (
            isDataFresh(snap.price.date) ||
            isRecentTradingDay(snap.price.date)
        );

        if (hasFreshPrice) {
            const gex = snap.gex;
            const flow = snap.flow;
            const p = snap.price as any;

            // [AWS-FIRST] NO supplement API calls in request path.
            // DynamoDB data only. Missing fields = null (warm-command fills them).
            const gexHistory = await fetchGexHistoryData(ticker);

            // Build SMA from DynamoDB price data
            let smaCard = null;
            if (p.sma50 && p.sma200) {
                const dist = ((p.sma50 - p.sma200) / p.sma200) * 100;
                smaCard = {
                    ticker, cross: p.cross || 'NONE', crossType: p.crossType || '',
                    sma50: p.sma50, sma200: p.sma200,
                    distance: Math.round(dist * 100) / 100,
                    isImminent: Math.abs(dist) < 0.5,
                    phase: p.cross === 'GOLDEN' ? (dist > 5 ? 'ACCELERATION' : 'MARKUP') : p.cross === 'DEAD' ? (dist < -5 ? 'DECLINE' : 'DISTRIBUTION') : 'NEUTRAL',
                    label: p.cross === 'GOLDEN' ? '상승 추세' : p.cross === 'DEAD' ? '하락 추세' : '수렴 중',
                };
            }

            // Build cards from DynamoDB only
            let analystCard = null;
            if (snap.analyst) {
                const a = snap.analyst;
                analystCard = { ticker, consensus: a.consensus || 'N/A', totalAnalysts: a.totalAnalysts || 0, bullishPct: a.bullishPct || 0, breakdown: a.breakdown || {}, period: a.period || null, priceTarget: a.priceTarget || null };
            }

            let earningsCard = null;
            if (snap.earnings) {
                const e = snap.earnings;
                let nextDate = e.nextDate || null;
                let daysUntil = e.daysUntil;
                let epsEstimate = e.epsEstimate || null;
                let quarter = e.quarter || null;
                let year = e.year || null;
                let hour = e.hour || '';

                // [V5.0 FIX] DynamoDB nextDate가 null이면 Finnhub 직접 호출로 보완
                // FMP calendar에 M7 등 대형주 미포함 → Finnhub이 정확한 날짜 보유
                if (!nextDate) {
                    try {
                        const { getEarningsCalendar } = await import('@/services/finnhubClient');
                        const earningsList = await getEarningsCalendar(ticker);
                        earningsList.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const upcoming = earningsList.find(e => new Date(e.date) >= today);
                        if (upcoming) {
                            nextDate = upcoming.date;
                            const earDate = new Date(upcoming.date);
                            earDate.setHours(0, 0, 0, 0);
                            daysUntil = Math.ceil((earDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                            epsEstimate = upcoming.epsEstimate || epsEstimate;
                            quarter = upcoming.quarter || quarter;
                            year = upcoming.year || year;
                            hour = upcoming.hour || hour;
                        }
                    } catch { /* Finnhub unavailable — keep DynamoDB data */ }
                }

                // [V6.0] Finnhub earnings surprise enrichment — 1 API call, cached 1h
                // Provides Beat/Miss + surprise% for the most recent quarter
                let lastSurprise = null;
                try {
                    const { getEarningsSurprise } = await import('@/services/finnhubClient');
                    const surprise = await getEarningsSurprise(ticker);
                    if (surprise) {
                        lastSurprise = {
                            actualEps: surprise.actual,
                            estimatedEps: surprise.estimate,
                            surpriseEps: Number(surprise.surprise.toFixed(3)),
                            surprisePct: Number(surprise.surprisePercent.toFixed(1)),
                            date: surprise.period
                        };
                    }
                } catch { /* Finnhub unavailable — skip surprise */ }

                // [FIX] daysLabel: nextDate가 없으면 'TBD', 있으면 D-count 계산
                const days = daysUntil ?? null;
                const daysLabel = days === null ? 'TBD' : days < 0 ? `D+${Math.abs(days)}` : days === 0 ? 'today' : `D-${days}`;
                const color = days !== null && days <= 3 && days >= 0 ? 'text-rose-400' : days !== null && days <= 7 && days >= 0 ? 'text-amber-400' : 'text-slate-400';

                earningsCard = { ticker, nextEarningsDate: nextDate, daysUntilEarnings: days ?? 0, daysLabel, epsEstimate, quarter, year, hourLabel: hour, color, hasData: true, forwardEps: e.forwardEps || null, forwardRevenue: e.forwardRevenue || null, forwardYear: e.forwardYear || null, currentEps: e.currentEps ?? null, currentRevenue: e.currentRevenue ?? null, forwardEpsRevision: e.forwardEpsRevision ?? null, forwardEpsRevisionDate: e.forwardEpsRevisionDate ?? null, forwardRevRevision: e.forwardRevRevision ?? null, forwardRevRevisionDate: e.forwardRevRevisionDate ?? null, lastSurprise };
            }

            let relatedCard = null;
            if (snap.related?.tickers && snap.related.tickers.length > 0) {
                const relTickers = snap.related.tickers;
                const top4 = relTickers.slice(0, 4);
                // [V10] Polygon snapshot with manual changePct from prevDay.c — accurate for ALL tickers
                // GOOG→GOOGL alias: Polygon snapshot for GOOG has broken prevDay.c
                // [V11] Weekend/after-hours fallback: if snapshot returns price=0, use v2/aggs 2-day bar
                const SNAPSHOT_ALIAS: Record<string, string> = { 'GOOG': 'GOOGL' };
                let topRelated = top4.map((t: string) => ({ ticker: t, price: 0, change: 0, logo: null }));
                try {
                    const snapResults = await Promise.race([
                        Promise.all(top4.map((t: string) => {
                            const snapT = SNAPSHOT_ALIAS[t] || t;
                            return fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${snapT}`, {}, true)
                                .then(async (snap: any) => {
                                    const td = snap?.ticker;
                                    const currentPrice = td?.day?.c || td?.lastTrade?.p || 0;
                                    const prevClose = td?.prevDay?.c || 0;
                                    const change = currentPrice > 0 && prevClose > 0
                                        ? Math.round(((currentPrice - prevClose) / prevClose) * 10000) / 100
                                        : 0;
                                    if (currentPrice > 0) return { ticker: t, price: Math.round(currentPrice * 100) / 100, change, logo: null };
                                    // [V11] Snapshot failed — fallback to v2/aggs 2-day bar
                                    try {
                                        const today = new Date();
                                        const from = new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0];
                                        const to = today.toISOString().split('T')[0];
                                        const aggs = await fetchMassive(
                                            `/v2/aggs/ticker/${snapT}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=2`,
                                            {}, true
                                        );
                                        if (aggs?.results?.length >= 2) {
                                            const lastBar = aggs.results[0];
                                            const prevBar = aggs.results[1];
                                            const aggChange = prevBar.c > 0
                                                ? Math.round(((lastBar.c - prevBar.c) / prevBar.c) * 10000) / 100
                                                : 0;
                                            return { ticker: t, price: Math.round(lastBar.c * 100) / 100, change: aggChange, logo: null };
                                        }
                                    } catch {}
                                    return { ticker: t, price: 0, change: 0, logo: null };
                                })
                                .catch(() => ({ ticker: t, price: 0, change: 0, logo: null }));
                        })),
                        new Promise<typeof topRelated>(r => setTimeout(() => r(topRelated), 4000))
                    ]);
                    topRelated = snapResults;
                } catch {}
                relatedCard = {
                    ticker,
                    count: relTickers.length,
                    topRelated,
                    relatedTickers: relTickers,
                    allTickers: relTickers,
                    _source: 'dynamodb',
                };
            }

            let fundamentalsCard = null;
            if (snap.fundamentals) {
                const f = snap.fundamentals;
                fundamentalsCard = {
                    ticker, name: f.name || ticker,
                    marketCap: f.marketCap || null, shareCount: f.shareCount || null,
                    description: f.description || null, sector: f.sector || null,
                    score: f.score ?? null, grade: f.grade ?? null,
                    pe: f.pe ?? null, roe: f.roe ?? null, de: f.de ?? null,
                    revenueGrowth: f.revenueGrowth ?? null, netMargin: f.netMargin ?? null,
                    breakdown: f.breakdown ?? null,
                    // [FIX] Add explicit fundamentals.price
                    price: p.close || null,
                    changePercent: p.changePct || null,
                };
            }

            // Squeeze from DynamoDB (no API call)
            const snapAny = snap as any;
            let squeezeCard: any = null;
            if (snapAny.squeeze?.siPercent || snapAny.shortVol?.percent) {
                squeezeCard = {
                    ticker,
                    siPercent: snapAny.squeeze?.siPercent || 0,
                    daysToCover: snapAny.squeeze?.daysToCover || 0,
                    siChange: 0,
                    shortVolPercent: snapAny.shortVol?.percent || 0,
                    riskScore: 0,
                    status: 'LOW',
                    _ts: Date.now(),
                };
            }

            // Institutional from DynamoDB (no API call)
            let institutionalCard: any = null;
            if (snapAny.darkPool?.percent || flow) {
                institutionalCard = {
                    darkPool: { percent: snapAny.darkPool?.percent || 0 },
                    blockTrade: { count: snapAny.darkPool?.blockCount || 0, volume: 0 },
                    shortVolume: { percent: snapAny.shortVol?.percent || 0 },
                    _ts: Date.now(),
                };
            }

            // [AWS-FIRST] Volatility: use Lambda's pre-computed volatility (includes IV)
            // Fall back to GEX-derived calculation only if Lambda volatility is missing
            let volatilityCard = null;
            if (snapAny.volatility && snapAny.volatility.regimeScore !== undefined) {
                // Lambda v7 stores complete volatility with IV, regimeScore, etc.
                volatilityCard = { ...snapAny.volatility, _ts: Date.now() };
            } else if (gex) {
                const isShortGamma = gex.gex < 0;
                const flipLevel = gex.flipLevel || 0;
                const spotPrice = gex.price || p.close || 0;
                const flipDist = flipLevel > 0 && spotPrice > 0 ? ((spotPrice - flipLevel) / spotPrice) * 100 : 0;
                let regimeScore = 0;
                if (isShortGamma) regimeScore += Math.min(30, Math.abs(gex.gex) / 1000000 * 3);
                if (Math.abs(flipDist) < 1) regimeScore += 15; else if (Math.abs(flipDist) < 3) regimeScore += 10;
                regimeScore = Math.min(100, Math.round(regimeScore));
                const regime = regimeScore >= 75 ? 'ERUPTING' : regimeScore >= 50 ? 'LOADED' : regimeScore >= 25 ? 'COILING' : 'CALM';
                volatilityCard = {
                    regime, regimeScore, gammaRegime: gex.gammaRegime,
                    gex: Math.round(gex.gex), gexLabel: isShortGamma ? 'SHORT' : 'LONG',
                    iv: 0, flipDistance: Math.round(flipDist * 10) / 10, flipLevel,
                    isAboveFlip: flipDist > 0, squeezeScore: 0, squeezeRisk: 'LOW',
                    gammaConcentration: 0, gammaConcentrationLabel: 'NORMAL',
                    pcr: gex.pcr, _ts: Date.now(),
                };
            }

            return {
                structure: gex ? {
                    options_status: 'OK', netGex: gex.gex, maxPain: gex.maxPain,
                    pcRatio: gex.pcr, levels: { callWall: gex.callWall, putFloor: gex.putFloor },
                    gammaFlipLevel: gex.flipLevel, gammaRegime: gex.gammaRegime,
                    totalContracts: gex.totalContracts, totalCallOI: gex.totalCallOI, totalPutOI: gex.totalPutOI,
                    atmIV: volatilityCard?.iv ? volatilityCard.iv / 100 : undefined, // Frontend expects 0.xx format
                    validation: { confidence: 'HIGH', source: 'dynamodb-lambda' },
                } : null,
                options: gex ? { pcr: gex.pcr } : null,
                sma: smaCard, earnings: earningsCard, related: relatedCard,
                analyst: analystCard,
                volatility: volatilityCard,
                squeeze: squeezeCard,
                institutional: institutionalCard,
                fundamentals: fundamentalsCard,
                overview: null,
                history: gexHistory,
                _dynamoPrice: { price: p.close, open: p.open, high: p.high, low: p.low, volume: p.volume, vwap: p.vwap, changePct: p.changePct },
                _source: 'dynamodb-snapshot',
                timestamp: Date.now(),
            };
        }
    } catch { /* DynamoDB unavailable */ }

    // --- Attempt 2: Analysis Cache (warm-analysis 96 tickers) ---
    try {
        const { getAnalysisCache } = await import('@/services/analysisCache');
        const ad = await getAnalysisCache(ticker);
        if (ad && ad.timestamp && (Date.now() - ad.timestamp) < 600_000) {
            const gexHistory = await fetchGexHistoryData(ticker);
            return {
                structure: { options_status: ad.maxPain || ad.gex ? 'OK' : null, netGex: ad.gex, maxPain: ad.maxPain, pcRatio: ad.pcr, levels: { callWall: ad.callWall, putFloor: ad.putFloor }, gammaFlipLevel: ad.gammaFlipLevel, squeezeScore: ad.squeezeScore, atmIv: ad.iv, validation: { confidence: 'HIGH' } },
                options: { iv: ad.iv, ivSkew: ad.ivSkew },
                sma: null, earnings: null, related: null, analyst: null,
                volatility: null,
                squeeze: ad.squeezeScore != null ? { score: ad.squeezeScore } : null,
                institutional: ad.darkPoolPct ? { darkPool: { percent: ad.darkPoolPct } } : null,
                fundamentals: null, overview: null,
                history: gexHistory, alpha: ad.alphaSnapshot ? { score: ad.alphaSnapshot.score, grade: ad.alphaSnapshot.grade } : null, smartFlow: calculateWhaleIndex(ad.gex, ad.darkPoolPct, null, ad.netPremium),
                timestamp: ad.timestamp,
            };
        }
    } catch { /* analysis cache unavailable */ }

    return null; // Fall through to Polygon
}

// [FIX] Check if date is within last 3 trading days (covers weekends + holidays)
function isRecentTradingDay(dateStr: string): boolean {
    if (!dateStr) return false;
    const dataDate = new Date(dateStr + 'T12:00:00-05:00'); // ET noon
    const now = new Date();
    const diffMs = now.getTime() - dataDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    // Accept data up to 3 days old (Friday data valid through Sunday)
    return diffDays >= 0 && diffDays < 3.5;
}
