
import { fetchMassive, fetchMassiveAll, CACHE_POLICY } from './massiveClient';
import { getMarketStatusSSOT } from './marketStatusProvider';
import { findWeeklyExpirationSync } from './holidayCache';
import { getFromCache, setInCache } from './redisClient';

// [Phase 24.1] Central Data Hub Structure
export interface UnifiedQuote {
    ticker: string;
    price: number;       // Main Display Price (ALWAYS OFFICIAL CLOSE unless LIVE REG)
    changePct: number;   // Main Display Change (From Prev Close to Price)
    finalChangePercent: number; // SSOT
    prevClose: number;   // Baseline Price
    volume: number;

    // [V3.7.5] Extended Session Data
    extendedPrice?: number;
    extendedChangePct?: number;
    extendedLabel?: "PRE" | "POST" | "CLOSED";

    // Components
    snapshot: any;
    openClose: any;
    history3d?: any[];
    history15d?: any[];

    // Flow Data (Calculated)
    flow: {
        netPremium: number;
        callPremium: number;
        putPremium: number;
        totalPremium: number;
        optionsCount: number;
        gamma?: number;
        rawChain?: any[];
        dataSource?: string;
        callWall?: number;
        putFloor?: number;
        pinZone?: number;
        maxPain?: number;
    };

    // Status
    session: "PRE" | "REG" | "POST" | "CLOSED";
    isRollover: boolean;
    priceSource: "OFFICIAL_CLOSE" | "LIVE_SNAPSHOT" | "POST_CLOSE" | "PRE_OPEN";
    error?: string;

    rsi?: number;
    relVol?: number;
    gapPct?: number;

    // [V5] 직전장/PM 가격 분리
    regChangePct?: number;   // 직전장 종가 기준 변동률 (기본분석용)
    pmPrice?: number;        // PM 현재가 (검증용)
    pmChangePct?: number;    // PM 변동률 vs prevClose (검증용)

    rawChain?: any[];
}

const MAX_RETRIES = 2;
const RETRY_DELAY = 500;

// [V45.14] In-memory TTL cache for SSR performance
const CACHE_TTL_MS = 10_000; // 10 seconds
const quoteCache = new Map<string, { data: UnifiedQuote; timestamp: number }>();

function getCachedQuote(ticker: string): UnifiedQuote | null {
    const cached = quoteCache.get(ticker.toUpperCase());
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log(`[CentralDataHub] Cache HIT for ${ticker} (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
        return cached.data;
    }
    return null;
}

function setCachedQuote(ticker: string, data: UnifiedQuote): void {
    quoteCache.set(ticker.toUpperCase(), { data, timestamp: Date.now() });
    // Cleanup old entries (max 100 tickers)
    if (quoteCache.size > 100) {
        const oldest = Array.from(quoteCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
        if (oldest) quoteCache.delete(oldest[0]);
    }
}

export const CentralDataHub = {
    getUnifiedData: async (ticker: string, forceRefresh = false, targetDate?: string): Promise<UnifiedQuote> => {
        // [V45.14] Check cache first (unless forceRefresh)
        if (!forceRefresh && !targetDate) {
            const cached = getCachedQuote(ticker);
            if (cached) return cached;
        }

        let attempts = 0;
        let lastError = null;

        while (attempts <= MAX_RETRIES) {
            try {
                const result = await CentralDataHub._fetchInternal(ticker, targetDate, forceRefresh);
                // Cache successful result (only for current date)
                if (!targetDate && result.price > 0) {
                    setCachedQuote(ticker, result);
                }
                return result;
            } catch (e: any) {
                lastError = e;
                attempts++;
                if (attempts <= MAX_RETRIES) {
                    console.warn(`[CentralDataHub] Retry ${attempts}/${MAX_RETRIES} for ${ticker}...`);
                    await new Promise(r => setTimeout(r, RETRY_DELAY));
                }
            }
        }

        console.error(`[CentralDataHub] Failed for ${ticker} after retries:`, lastError);
        return {
            ticker,
            price: 0,
            changePct: 0,
            finalChangePercent: 0,
            prevClose: 0,
            volume: 0,
            snapshot: {},
            openClose: {},
            flow: { netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0, optionsCount: 0 },
            session: "CLOSED",
            isRollover: false,
            priceSource: "LIVE_SNAPSHOT",
            error: lastError?.message || "Unknown Error"
        };
    },

    _fetchInternal: async (ticker: string, specificDate?: string, forceRefresh = false): Promise<UnifiedQuote> => {
        const marketStatus = await getMarketStatusSSOT();
        const session = marketStatus.session.toUpperCase() as "PRE" | "REG" | "POST" | "CLOSED";
        const isClosed = session === "CLOSED";

        const toDate = specificDate || new Date().toISOString().split('T')[0];
        const fromDate = new Date();
        fromDate.setDate(new Date(toDate).getDate() - 30);
        const fromDateStr = fromDate.toISOString().split('T')[0];

        const useMemoryCache = !forceRefresh;
        const fetchOptions = forceRefresh ? { cache: 'no-store' as RequestCache } : undefined;

        // [V3.4] Resilient fetch helper — retry before giving up
        const resilientFetch = async (fn: () => Promise<any>, fallback: any, label: string) => {
            for (let attempt = 0; attempt < 3; attempt++) {
                try { return await fn(); } catch (err: any) {
                    if (attempt < 2) {
                        console.warn(`[CentralDataHub] ${label} attempt ${attempt + 1} failed for ${ticker}, retrying...`);
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    } else {
                        console.error(`[CentralDataHub] ${label} FINAL FAIL for ${ticker}:`, err.message);
                        return fallback;
                    }
                }
            }
        };

        const [snapshotRes, ocRes, historyRes, rsiRes] = await Promise.all([
            fetchMassive(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`, {}, useMemoryCache, undefined, fetchOptions),
            resilientFetch(
                () => fetchMassive(`/v1/open-close/${ticker}/${toDate}`, {}, useMemoryCache, undefined, fetchOptions),
                { data: null }, 'OpenClose'
            ),
            resilientFetch(
                () => fetchMassive(`/v2/aggs/ticker/${ticker}/range/1/day/${fromDateStr}/${toDate}`, { limit: '30', sort: 'asc' }, useMemoryCache, undefined, fetchOptions),
                { results: [] }, 'History'
            ),
            resilientFetch(
                () => fetchMassive(`/v1/indicators/rsi/${ticker}`, { timespan: 'day', adjusted: 'true', window: '14', series_type: 'close', order: 'desc', limit: '1' }, useMemoryCache, undefined, fetchOptions),
                { results: { values: [] } }, 'RSI'
            )
        ]);

        const S = snapshotRes.ticker || {};
        const OC = ocRes || {};
        const fullHistory = historyRes?.results || [];
        const history3d = [...fullHistory].reverse().slice(0, 3);

        // [V4.3] When specificDate is provided (report path), use history aggs as primary data source.
        // Snapshot may return empty data on weekends/holidays, but history aggs always has the correct data.
        const useHistoryPrimary = !!specificDate && fullHistory.length >= 2;

        let price = 0;
        let prevClose = 0;
        let regClose = 0;
        let dayVolume = 0;
        let dayOpen = 0;
        let dayVwap = 0;
        let priceSource: UnifiedQuote['priceSource'] = "OFFICIAL_CLOSE";
        let extendedPrice = 0;
        let extendedLabel: "PRE" | "POST" | "CLOSED" | undefined = undefined;

        if (useHistoryPrimary) {
            // --- REPORT PATH: History Aggs as Primary Source ---
            // [V4.3.1] Filter out today's incomplete bar — during market hours,
            // Polygon returns a partial bar for today with low volume.
            // We want only COMPLETED trading day bars.
            const todayStr = new Date().toISOString().split('T')[0];
            const completedBars = fullHistory.filter((bar: any) => {
                const barDate = new Date(bar.t).toISOString().split('T')[0];
                return barDate !== todayStr;
            });

            if (completedBars.length >= 2) {
                const lastBar = completedBars[completedBars.length - 1];  // Last completed trading day
                const prevBar = completedBars[completedBars.length - 2];  // Day before
                price = lastBar.c;
                prevClose = prevBar.c;
                regClose = lastBar.c;
                dayVolume = lastBar.v || 0;
                dayOpen = lastBar.o || 0;
                dayVwap = lastBar.vw || lastBar.c;
            } else {
                // Fallback: not enough completed bars, use all bars
                const lastBar = fullHistory[fullHistory.length - 1];
                const prevBar = fullHistory[fullHistory.length - 2];
                price = lastBar.c;
                prevClose = prevBar.c;
                regClose = lastBar.c;
                dayVolume = lastBar.v || 0;
                dayOpen = lastBar.o || 0;
                dayVwap = lastBar.vw || lastBar.c;
            }
            priceSource = "OFFICIAL_CLOSE";
        } else {
            // --- REAL-TIME PATH: Snapshot as Primary Source (existing logic) ---
            const liveLast = S.lastTrade?.p || null;
            regClose = S.day?.c || S.prevDay?.c || OC.close || 0;
            const prevDay = S.prevDay || {};
            prevClose = prevDay.c || 0;

            // Robust Fallback
            if (regClose === 0 && prevClose === 0) {
                if (OC.close) regClose = OC.close;
                else if (fullHistory.length > 0) {
                    regClose = fullHistory[fullHistory.length - 1].c;
                    prevClose = fullHistory.length > 1 ? fullHistory[fullHistory.length - 2].c : regClose;
                }
            }

            // Reg Close Logic (Official)
            if (isClosed && OC.close) {
                regClose = OC.close;
            } else {
                if (session === 'PRE') {
                    regClose = prevClose || S.prevDay?.c || regClose;
                } else {
                    regClose = S.day?.c || S.min?.c || liveLast || regClose;
                }
            }

            // Price Selection
            if (session === 'REG') {
                price = liveLast || regClose;
                priceSource = "LIVE_SNAPSHOT";
            } else {
                price = regClose;
                priceSource = "OFFICIAL_CLOSE";
                if (session === 'PRE') {
                    extendedPrice = S.min?.c || liveLast || 0;
                    extendedLabel = 'PRE';
                } else if (session === 'POST') {
                    extendedPrice = S.min?.c || liveLast || 0;
                    extendedLabel = 'POST';
                } else if (session === 'CLOSED') {
                    // [FIX] Use afterHours first, then lastTrade as fallback
                    // Polygon's afterHours object becomes unavailable late at night,
                    // but lastTrade.p always has the last traded price
                    const postPrice = S.afterHours?.p || liveLast || 0;
                    if (postPrice > 0 && prevClose > 0) {
                        extendedPrice = postPrice;
                        extendedLabel = 'POST';
                    }
                }
            }

            // Weekend/Holiday Stale Data Correction
            const isNonTradingDay = marketStatus.isHoliday || session === "CLOSED";
            if (isNonTradingDay && fullHistory.length >= 2) {
                if (Math.abs(price - prevClose) < 0.001) {
                    const lastClose = fullHistory[fullHistory.length - 1].c;
                    if (Math.abs(price - lastClose) < 0.001) {
                        prevClose = fullHistory[fullHistory.length - 2].c;
                    }
                }
            }

            if (!price || price === 0) {
                if (prevClose > 0) {
                    price = prevClose;
                    priceSource = "OFFICIAL_CLOSE";
                }
            }

            dayVolume = S.day?.v || 0;
            dayOpen = S.day?.o || 0;
            dayVwap = S.day?.vw || 0;
        }

        let changePct = 0;
        if (price && prevClose) {
            changePct = ((price - prevClose) / prevClose) * 100;
        }

        // [V5] PRE 세션에서 changePct가 0인 경우: history에서 직전장 실제 변동률 계산
        // PRE에서 price = prevClose = S.prevDay.c이므로 changePct=0이 됨
        // 실제 직전장 변동은 마지막 두 완료 캔들 비교로 산출
        if (session === 'PRE' && Math.abs(changePct) < 0.01 && fullHistory.length >= 2) {
            const todayStr = new Date().toISOString().split('T')[0];
            const completedBars = fullHistory.filter((bar: any) => {
                const barDate = new Date(bar.t).toISOString().split('T')[0];
                return barDate !== todayStr;
            });
            if (completedBars.length >= 2) {
                const lastBar = completedBars[completedBars.length - 1]; // 직전 거래일
                const prevBar = completedBars[completedBars.length - 2]; // 그 전날
                price = lastBar.c;       // 직전 거래일 종가
                prevClose = prevBar.c;   // 그 전날 종가
                changePct = prevBar.c > 0 ? ((lastBar.c - prevBar.c) / prevBar.c) * 100 : 0;
                console.log(`[V5] ${ticker}: PRE changePct corrected from history: ${changePct.toFixed(2)}% ($${prevBar.c.toFixed(2)} → $${lastBar.c.toFixed(2)})`);
            }
        }

        // [V5] Pre-market change vs 어제 종가 (price)
        // 중요: prevClose는 history correction 후 2일전 종가이므로, PM 변동률은 price(어제종가) 기준
        // RKLB: price=$74.42(어제종가), PM=$73.65 → -1.03% (prevClose 기준이면 +5.4% 오류)
        let extendedChangePct = 0;
        if (extendedPrice > 0 && price > 0) {
            extendedChangePct = ((extendedPrice - price) / price) * 100;
        }

        // [V5] 직전장/PM 가격 분리 — 기본분석은 반드시 직전장, PM은 검증용으로만
        // 이전 V3.4.1은 PM changePct를 primaryChange로 승격시켰으나,
        // 이는 엔진이 PM 가격을 직전장으로 착각하게 만들었음
        let primaryChangePercent = changePct; // 항상 직전장 기준
        let pmPrice: number | undefined = undefined;
        let pmChangePct: number | undefined = undefined;
        if (session === 'PRE' && extendedPrice > 0 && prevClose > 0) {
            // PM 데이터를 별도 필드로 제공 (기본분석 changePct는 직전장 유지)
            pmPrice = extendedPrice;
            pmChangePct = extendedChangePct;
            console.log(`[V5] ${ticker}: 직전장=$${price.toFixed(2)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%) | PM=$${extendedPrice.toFixed(2)} (${extendedChangePct >= 0 ? '+' : ''}${extendedChangePct.toFixed(2)}%)`);
        }

        const isRollover = (session === "PRE" && changePct === 0 && extendedChangePct === 0);

        // Smart Options Fetch — 옵션 체인은 직전장 기준 (기본틀 원칙)
        const fetchPrice = price || prevClose;
        const optionsRes = await CentralDataHub._fetchOptionsChain(ticker, fetchPrice, specificDate).catch(err => ({
            netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0, optionsCount: 0, error: err.message || "Safe Fallback"
        }));

        const flowData = optionsRes as any;

        // [V4.3] relVol: use history aggs average volume for both paths
        const avgVol = fullHistory.length > 0 ? fullHistory.reduce((a: number, b: any) => a + (b.v || 0), 0) / fullHistory.length : 0;
        const relVol = (avgVol > 0 && dayVolume > 0) ? dayVolume / avgVol : 1;

        // [V4.3] gapPct: use dayOpen vs prevClose
        const gapPct = (dayOpen > 0 && prevClose > 0) ? ((dayOpen - prevClose) / prevClose * 100) : 0;

        return {
            ticker,
            price: price || 0,             // [V5] 항상 직전장 종가 (PM override 제거)
            changePct: changePct || 0,     // [V5] 항상 직전장 변동률
            finalChangePercent: changePct || 0, // [V5] 직전장 = primaryChange
            regChangePct: changePct || 0,  // [V5] 명시적 직전장 변동률
            pmPrice,                       // [V5] PM 가격 (검증용, undefined if not PRE)
            pmChangePct,                   // [V5] PM 변동률 (검증용)
            prevClose: prevClose || 0,
            volume: dayVolume,
            extendedPrice,
            extendedChangePct,
            extendedLabel,
            snapshot: S,
            openClose: OC,
            flow: flowData,
            session,
            isRollover: isRollover,
            priceSource,
            history3d,
            history15d: fullHistory,
            rsi: rsiRes?.results?.values?.[0]?.value || null,
            relVol,
            gapPct
        };
    },

    /**
     * [Phase 27] Smart Option Pipeline (Dark Pool Revival)
     * Filters: Strike ±5%, Expiration < 30d
     */
    _fetchOptionsChain: async (ticker: string, currentPrice: number, targetDate?: string) => {
        try {
            if (!currentPrice || currentPrice <= 0) return {
                netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0,
                optionsCount: 0, dataSource: 'NONE', isAfterHours: false
            };

            const today = targetDate ? new Date(targetDate) : new Date();
            const todayStr = targetDate || new Date().toISOString().split('T')[0];

            // [S-72] Phase 1: Probe for available expirations
            // [S-76] Fix: Sort by expiration_date to ensure we capture multiple expirations
            // Without sort, API may return 100 contracts all from the same expiration date
            // [PERF] Limit to 35 DTE — all FlowRadar indicators use max 35 DTE
            // Before: fetched ALL expiries (SPY 5,000+ contracts, 21s)
            // After: 35 DTE only (~800 contracts, ~4s estimated)
            const maxProbeDate = new Date(today);
            maxProbeDate.setDate(today.getDate() + 35);
            const maxProbeDateStr = `${maxProbeDate.getFullYear()}-${String(maxProbeDate.getMonth() + 1).padStart(2, '0')}-${String(maxProbeDate.getDate()).padStart(2, '0')}`;

            // [PERF] Check Lambda-warmed raw snapshot cache first
            // Lambda stores raw Polygon response → zero calculation change, only source changes
            let probeResults: any[] = [];
            let expirations: string[] = [];
            let weeklyExpiry = '';
            let results: any[] = [];
            let usedLambdaCache = false;

            try {
                const lambdaCache = await getFromCache<any>(`polygon:snapshot:probe:${ticker}`);
                // ★ 배열의 «존재»가 아니라 «내용»을 본다.
                //
                //   JS 에서 빈 배열 `[]` 은 truthy 다. 예전 게이트는
                //   `lambdaCache.exactResults` 만 확인해서, Lambda 가 조회에
                //   실패하며 써 넣은 **빈 배열**을 그대로 통과시켰다.
                //   그러면 Polygon/Intrinio 경로를 통째로 건너뛰고 optionsCount 0 이
                //   되며, TTL 이 72시간이라 **3일간 고착**된다.
                //
                //   실측(2026-08-30): PLTR probe 1136 · **exact 0** (37시간 전) →
                //   화면에서 PLTR 만 GEX·맥스페인·콜월·PCR 이 전부 «—».
                //   같은 시각 NVDA exact 166 · AAPL exact 154 로 멀쩡했다.
                //   → 한 종목만 조용히 죽는 형태라 알아채기 어렵다.
                const lcProbe = Array.isArray(lambdaCache?.probeResults) ? lambdaCache.probeResults : null;
                const lcExact = Array.isArray(lambdaCache?.exactResults) ? lambdaCache.exactResults : null;
                const lcUsable = !!(lcProbe?.length && lcExact?.length && lambdaCache?.weeklyExpiry);
                if (lambdaCache && !lcUsable) {
                    console.warn(`[CentralDataHub] Lambda 캐시 거부 ${ticker} — probe ${lcProbe?.length ?? 'n/a'} · exact ${lcExact?.length ?? 'n/a'} · expiry ${lambdaCache?.weeklyExpiry || 'none'}`);
                }
                if (lcUsable
                    && lambdaCache._ts && (Date.now() - lambdaCache._ts) < 259200000) { // 72h max (weekend preservation)
                    // Lambda cache hit — skip all Polygon API calls
                    probeResults = lambdaCache.probeResults;
                    expirations = lambdaCache.expirations || [];
                    weeklyExpiry = lambdaCache.weeklyExpiry || '';
                    results = lambdaCache.exactResults;
                    usedLambdaCache = true;
                    console.log(`[CentralDataHub] LAMBDA CACHE HIT for ${ticker}: ${probeResults.length} probe, ${results.length} exact, expiry=${weeklyExpiry}`);
                }
            } catch {
                // Redis unavailable — fall through to Polygon
            }

            if (!usedLambdaCache) {
                // Original Polygon fetch path (unchanged)
                const probeParams: any = {
                    limit: '250',
                    'expiration_date.gte': todayStr,
                    'expiration_date.lte': maxProbeDateStr,
                    'sort': 'expiration_date',
                    'order': 'asc'
                };

                const probeRes = await fetchMassiveAll(`/v3/snapshot/options/${ticker}`, probeParams, true);
                probeResults = probeRes.results || [];

                // Find weekly expiration
                expirations = Array.from(new Set(
                    probeResults.map((c: any) => c.details?.expiration_date)
                )).filter(Boolean).sort() as string[];

                // [DEBUG] Log all available expirations
                console.log(`[CentralDataHub] ${ticker} available expirations (${expirations.length}):`, JSON.stringify(expirations.slice(0, 10)));

                weeklyExpiry = findWeeklyExpirationSync(expirations);

                if (!weeklyExpiry) {
                    console.warn(`[CentralDataHub] No weekly expiration found for ${ticker}`);
                    return {
                        netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0,
                        optionsCount: 0, dataSource: 'NONE', isAfterHours: false
                    };
                }

                console.log(`[CentralDataHub] Fetching EXACT weekly expiration for ${ticker}: ${weeklyExpiry}`);

                // [S-72] Phase 2: Fetch exact weekly expiration (full data for accurate Max Pain)
                const exactParams: any = {
                    limit: '250',
                    'expiration_date': weeklyExpiry
                };

                const exactRes = await fetchMassiveAll(`/v3/snapshot/options/${ticker}`, exactParams, true);
                results = exactRes.results || [];

                // [DEMAND-DRIVEN CACHE] Save raw data to Redis in Lambda format
                // Non-universe tickers get the same cache structure as Lambda-warmed tickers
                // So subsequent requests hit the fast path (Redis instead of Polygon)
                if (probeResults.length > 0 && results.length > 0 && weeklyExpiry) {
                    try {
                        const rawCachePayload = {
                            probeResults,
                            exactResults: results,
                            expirations,
                            weeklyExpiry,
                            _ts: Date.now(),
                            _ticker: ticker,
                            _source: 'vercel-ondemand',
                        };
                        // TTL: 10 min (Lambda will take over refreshing within 5 min)
                        await setInCache(`polygon:snapshot:probe:${ticker}`, rawCachePayload, 600);

                        // Register in dynamic universe — Lambda reads this list
                        // Use individual key per ticker (Lambda scans known pattern)
                        const nowET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                        const etHour = new Date(nowET).getHours();
                        const hoursUntilClose = Math.max(1, 21 - etHour);
                        const dynamicTTL = hoursUntilClose * 3600;

                        // Also maintain a master list for Lambda to read
                        const existingList = await getFromCache<string[]>('flow:dynamic-universe') || [];
                        if (!existingList.includes(ticker)) {
                            existingList.push(ticker);
                            await setInCache('flow:dynamic-universe', existingList, dynamicTTL);
                        }
                        console.log(`[CentralDataHub] DEMAND-CACHE: ${ticker} raw saved + registered for Lambda (TTL ${hoursUntilClose}h, list=${existingList.length})`);
                    } catch {
                        // Non-critical — don't fail the request
                    }
                }
            }

            let callPremium = 0;
            let putPremium = 0;
            let totalGamma = 0;
            let contractsProcessed = 0;
            let usedFallback = false;
            let hasLiveVolume = false;

            for (const c of results) {
                const gamma = c.greeks?.gamma || 0;
                const oi = c.open_interest || 0;
                const cType = c.details?.contract_type;
                const priceUsed = c.day?.close || c.details?.close_price || 0;

                if (cType === 'call') totalGamma += (gamma * oi * 100);
                else if (cType === 'put') totalGamma -= (gamma * oi * 100);

                const vol = c.day?.volume || 0;
                if (vol > 0 && priceUsed > 0) {
                    hasLiveVolume = true;
                    const premium = vol * priceUsed * 100;
                    if (cType === 'call') callPremium += premium;
                    else if (cType === 'put') putPremium += premium;
                    contractsProcessed++;
                }
            }

            if (!hasLiveVolume && results.length > 0) {
                console.log(`[CentralDataHub] Day volume is 0, activating Manual Aggregation (Sniper Mode)...`);
                usedFallback = true;
                contractsProcessed = 0;
                callPremium = 0;
                putPremium = 0;

                for (const c of results) {
                    const oi = c.open_interest || 0;
                    const priceUsed = c.day?.previous_close || c.details?.prev_close || 0;
                    const cType = c.details?.contract_type;

                    if (!oi || !priceUsed) continue;
                    const val = oi * priceUsed * 100;
                    if (cType === 'call') callPremium += val;
                    else if (cType === 'put') putPremium += val;
                    contractsProcessed++;
                }
                console.log(`[CentralDataHub] Manual Flow: $${((callPremium - putPremium) / 1e6).toFixed(1)}M`);
            }

            const isAfterHours = contractsProcessed === 0 && results.length > 0;
            let dataSource: 'LIVE' | 'PREVIOUS_CLOSE' | 'CALCULATED' | 'NONE' = 'LIVE';
            if (usedFallback && contractsProcessed > 0) dataSource = 'CALCULATED';
            if (isAfterHours && results.length > 0) dataSource = 'CALCULATED';

            // ── 이 값들이 «언제 것인지» 정확히 밝힌다 ────────────────────────
            // [2026-09-02] 라벨이 사실과 달랐다. 옵션 체인은 EOD 상품이라 장중에도
            //   전일 종가를 준다(실측: 개장 12분 뒤 date=전일). 그걸 통째로 'LIVE'
            //   라고 부르고 있었다.
            //
            //   지금은 층이 나뉜다 — 섞어서 한 단어로 부르면 또 거짓말이 된다:
            //     · 미결제약정(OI)  = EOD. **원래 하루 단위**(OCC 야간 정산)라 정상이다.
            //       → 맥스페인·콜월·풋플로어는 이걸로 계산되므로 «현재값»이 맞다.
            //     · 그릭스·IV       = OptionsEdge 실시간(가능한 경우).
            //       실측 효과: NVDA 넷감마 9,828(전일) → 23,246(실시간).
            //     · 거래량·프리미엄  = EOD. OPRA 체결 데이터가 플랜에 없어 전일이다.
            const anyRealtimeGreeks = results.some((c: any) => c?._rtGreeks);
            const dataFreshness = {
                openInterest: 'EOD',           // 정상 — OI 는 하루 단위다
                greeks: anyRealtimeGreeks ? 'REALTIME' : 'EOD',
                impliedVolatility: anyRealtimeGreeks ? 'REALTIME' : 'EOD',
                volume: 'EOD',                 // OPRA 미보유 — 전일
                premium: 'EOD',                // 위와 같은 이유
                chainDate: (results[0] as any)?._intrinio?.date
                    ?? (results[0] as any)?.last_quote?.last_updated ?? null,
                note: 'OI 는 OCC 야간 정산이라 EOD 가 곧 현재값이다. 거래량·프리미엄은 전일이다.',
            };

            // [S-72] Use full weekly expiration data for accurate Max Pain (no filter)
            return {
                netPremium: callPremium - putPremium,
                callPremium,
                putPremium,
                totalPremium: callPremium + putPremium,
                optionsCount: results.length,
                contractsProcessed,
                dataSource,
                dataFreshness,
                isAfterHours,
                gamma: totalGamma,
                rawChain: results,
                // [FIX] Multi-expiry probe data for accurate 0DTE Impact calculation
                // probeResults contains contracts across ALL available expirations (up to 250)
                allExpiryChain: probeResults,
                allExpirations: expirations,
                weeklyExpiration: weeklyExpiry,
                callWall: calcMaxOI(results, 'call'),
                putFloor: calcMaxOI(results, 'put'),
                pinZone: calcMaxTotalOI(results),
                maxPain: calcMaxPain(results),
                error: null
            };

        } catch (e: any) {
            const isAuthError = e.code === 'AUTH_ERROR' || e.httpStatus === 403 || e.httpStatus === 401;
            const isMissing = e.httpStatus === 404;
            const errorMessage = e.message || e.reasonKR || JSON.stringify(e);

            if (isAuthError || isMissing) {
                console.warn(`[CentralDataHub] Options access restricted for ${ticker} (${e.httpStatus || e.code}). Returning empty flow.`);
            } else {
                console.error(`[CentralDataHub] Options Flow Calc Failed for ${ticker}: ${errorMessage}`, { code: e.code });
            }

            return {
                netPremium: 0, callPremium: 0, putPremium: 0, totalPremium: 0,
                optionsCount: 0, dataSource: 'NONE', isAfterHours: false
            };
        }
    },

    getQuote: async (ticker: string) => {
        return CentralDataHub.getUnifiedData(ticker);
    },

    getMarketStatus: async () => {
        return await getMarketStatusSSOT();
    }
};

// [Helper] Max OI Calculation for Wall/Floor
function calcMaxOI(chain: any[], type: 'call' | 'put'): number | null {
    let maxOI = -1;
    let maxStrike = 0;
    for (const c of chain) {
        if (c.details?.contract_type === type) {
            const oi = c.open_interest || 0;
            if (oi > maxOI) { maxOI = oi; maxStrike = c.details.strike_price; }
        }
    }
    return maxStrike > 0 ? maxStrike : null;
}

// [Helper] Pin Zone (Max Combined OI Strike)
function calcMaxTotalOI(chain: any[]): number | null {
    const strikeMap = new Map<number, number>();
    let maxTotal = -1;
    let maxStrike = 0;

    for (const c of chain) {
        const s = c.details?.strike_price;
        const oi = c.open_interest || 0;
        if (!s) continue;
        strikeMap.set(s, (strikeMap.get(s) || 0) + oi);
    }

    strikeMap.forEach((total, strike) => {
        if (total > maxTotal) { maxTotal = total; maxStrike = strike; }
    });

    return maxStrike > 0 ? maxStrike : null;
}

// [S-70] Filter for Weekly Expiry (Friday, or Thursday if holiday)
function filterNearestExpiry(chain: any[]): any[] {
    if (!chain || chain.length === 0) return [];

    // 1. Extract all expiration dates
    const expirations = chain
        .map(c => c.details?.expiration_date)
        .filter(d => !!d)
        .sort(); // String sort works for ISO dates (YYYY-MM-DD)

    if (expirations.length === 0) return chain; // Fallback

    // 2. [S-70] Find weekly expiration (Friday first, then Thursday)
    let targetDate = expirations[0]; // Default fallback

    // Find first Friday
    const fridayExp = expirations.find(exp => {
        const date = new Date(exp + 'T12:00:00');
        return date.getDay() === 5;
    });
    if (fridayExp) {
        targetDate = fridayExp;
    } else {
        // Find first Thursday (holiday fallback)
        const thursdayExp = expirations.find(exp => {
            const date = new Date(exp + 'T12:00:00');
            return date.getDay() === 4;
        });
        if (thursdayExp) targetDate = thursdayExp;
    }

    // 3. Filter
    return chain.filter(c => c.details?.expiration_date === targetDate);
}

// [Helper] Real Max Pain Calculation (Total Loss Minimization)
function calcMaxPain(chain: any[]): number | null {
    if (!chain || chain.length === 0) return null;

    const strikes = new Set<number>();
    chain.forEach(c => {
        if (c.details?.strike_price) strikes.add(c.details.strike_price);
    });

    const sortedStrikes = Array.from(strikes).sort((a, b) => a - b);

    let minPain = Infinity;
    let maxPainStrike = 0;

    // Evaluate Total Pain at each specific strike price
    for (const pricePoint of sortedStrikes) {
        let totalPain = 0;
        for (const c of chain) {
            const K = c.details?.strike_price;
            const oi = c.open_interest || 0;
            const type = c.details?.contract_type;

            if (!K) continue;

            // Intrinsic Value Calculation
            if (type === 'call') {
                if (pricePoint > K) totalPain += (pricePoint - K) * oi;
            } else if (type === 'put') {
                if (pricePoint < K) totalPain += (K - pricePoint) * oi;
            }
        }

        if (totalPain < minPain) {
            minPain = totalPain;
            maxPainStrike = pricePoint;
        }
    }

    return maxPainStrike > 0 ? maxPainStrike : null;
}

/**
 * 맥스페인 타당성 게이트.
 *
 * 왜 (2026-08-31 전수검사에서 100종목 중 1건):
 *   DD 는 주가 $136.99 인데 맥스페인 $52.5 가 나왔다. **계산은 맞다** —
 *   독립 계산도 52.5 였고, 실제로 미결제약정의 55%가 행사가 $100 미만에 몰려 있다
 *   (기업분할 잔재로 보이는 오래된 건옥).
 *   그러나 화면에 「MAX PAIN $52.5」가 뜨면 사용자에겐 **고장으로 보인다.**
 *   산술적으로 옳지만 의미가 없는 숫자다.
 *
 * 수치는 신뢰의 문제다 — 「말이 되지 않는 값」은 «값 없음»으로 돌린다.
 * 그럴듯하게 틀린 것보다 비어 있는 편이 언제나 낫다.
 * (같은 원칙: bar() 의 VWAP, live/quotes 의 가짜 프리마켓 가격)
 */
export function sanitizeMaxPain(maxPain: number | null | undefined, spot: number | null | undefined): number | null {
    const mp = Number(maxPain);
    if (!Number.isFinite(mp) || mp <= 0) return null;
    const s = Number(spot);
    if (!Number.isFinite(s) || s <= 0) return mp;   // 비교 기준이 없으면 판단하지 않는다
    return Math.abs(mp - s) / s > 0.35 ? null : mp;
}
