// ============================================================================
// /api/intel/fast — 경량 배치 Intel API
// [PERF] Polygon snapshot batch (1 call for all tickers) + Redis cache
// Target: ~1-2초 (vs 기존 15-20초)
// ============================================================================

import { NextResponse } from 'next/server';
import { fetchMassive, CACHE_POLICY } from '@/services/massiveClient';
import { reconstructLastSession, type LastSessionData } from '@/services/lastSession';
import { getFromCache } from '@/services/redisClient';
import { CentralDataHub } from '@/services/centralDataHub';
import { getAnalysisCacheForTickers } from '@/services/analysisCache';
import { xsSnapshotOverride } from '@/services/xsScores';
import { fetchTruePreMarket } from '@/services/marketDataLight';
import { calculateWhaleIndex } from '@/services/alphaEngine';

// Sector ticker maps
const SECTOR_TICKERS: Record<string, string[]> = {
    m7: ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'],
    physical_ai: ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'],
    silicon_core: ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'],
    power_matrix: ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'],
    bio_pulse: ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'],
    cyber_shield: ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET'],
    orbit_defense: ['LMT', 'RTX', 'AXON', 'SPCX', 'LDOS', 'ASTS', 'LUNR'],
    quantum_edge: ['SMCI', 'SNOW', 'IONQ', 'DELL', 'AI', 'PATH', 'TWLO'],
    fintech_pulse: ['XYZ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'HOOD', 'UPST'],
    cloud_fortress: ['CRM', 'NOW', 'DDOG', 'WDAY', 'MDB', 'TEAM', 'HUBS'],
};

// Redis key matching /api/live/ticker format
// ⚠️ 응답 모양이 바뀌면 **반드시 이 버전을 올린다.** 안 올리면 옛 페이로드가
//    그대로 나가서 새 필드가 «조용히» 빠진다(2026-08-30 에 두 번 겪었다).
//    v2 = 다크풀(FINRA) 필드 추가 2026-08-31
function tickerCacheKey(ticker: string): string {
    return `flow:ticker:v2:${ticker}`;
}

export const revalidate = 15; // 15-second edge cache

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get('sector');

    if (!sector || !SECTOR_TICKERS[sector]) {
        return NextResponse.json(
            { error: 'Invalid sector', valid: Object.keys(SECTOR_TICKERS) },
            { status: 400 }
        );
    }

    const startTime = Date.now();
    const tickers = SECTOR_TICKERS[sector];

    try {
        // ── Phase 1: Parallel fetch — Polygon batch + Redis cache ──
        const [snapshotData, marketStatus, ...interleaved] = await Promise.all([
            // 1. Polygon batch snapshot — single API call for all tickers (~500ms)
            fetchMassive(
                `/v2/snapshot/locale/us/markets/stocks/tickers`,
                { tickers: tickers.join(',') },
                false, undefined, CACHE_POLICY.LIVE
            ).catch(() => null),

            // 2. Market status for session detection
            CentralDataHub.getMarketStatus().catch(() => ({ session: 'closed' })),

            // 3. Redis cached data + persistent extended prices (interleaved)
            ...tickers.flatMap(t => [
                getFromCache<any>(tickerCacheKey(t)).catch(() => null),
                getFromCache<any>(`flow:extended:${t}`).catch(() => null)
            ]),
        ]);

        // De-interleave: [cached0, ext0, cached1, ext1, ...] → separate arrays
        const cachedTickers = tickers.map((_, i) => interleaved[i * 2]);
        const extendedCache = tickers.map((_, i) => interleaved[i * 2 + 1]);

        // [CACHE WARMER] Also fetch analysis cache as additional data source
        const analysisCache = await getAnalysisCacheForTickers(tickers).catch(() => ({} as Record<string, any>));

        // Build snapshot lookup map
        const snapshotMap: Record<string, any> = {};
        (snapshotData?.tickers || []).forEach((t: any) => {
            snapshotMap[t.ticker] = t;
        });

        // Determine session
        const sRaw = (marketStatus as any)?.session || 'closed';
        const session = sRaw === 'pre' ? 'PRE' :
            sRaw === 'regular' ? 'REG' :
                sRaw === 'post' ? 'POST' : 'CLOSED';

        // [FIX] During PRE session, fetch daily aggregates to calculate real regular session change
        // Polygon snapshot's day.c === prevDay.c during PRE, making direct calculation impossible.
        // Use historicalResults (like live/ticker API does) for accurate regular session change.
        let aggMap: Record<string, { prevClose: number, prevPrevClose: number }> = {};
        if (session === 'PRE') {
            const aggResults = await Promise.all(
                tickers.map(t =>
                    fetchMassive(
                        `/v2/aggs/ticker/${t}/range/1/day/${new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)}/${new Date().toISOString().slice(0, 10)}`,
                        { adjusted: 'true', sort: 'desc', limit: '3' },
                        false, undefined, CACHE_POLICY.LIVE
                    ).catch(() => null)
                )
            );
            aggResults.forEach((agg, i) => {
                const results = agg?.results || [];
                if (results.length >= 2) {
                    aggMap[tickers[i]] = {
                        prevClose: results[0].c || 0,
                        prevPrevClose: results[1].c || 0,
                    };
                }
            });
        }

        // [FIX] During REG, pre-fetch true PM prices for tickers missing from persistent cache
        // This ensures ALL sector tickers consistently show PRE badge
        let truePmMap: Record<string, number> = {};
        if (session === 'REG') {
            const tickersNeedingPm = tickers.filter((_, i) => !(extendedCache[i]?.prePrice > 0));
            if (tickersNeedingPm.length > 0) {
                const pmResults = await Promise.all(
                    tickersNeedingPm.map(t => fetchTruePreMarket(t).catch(() => null))
                );
                tickersNeedingPm.forEach((t, idx) => {
                    if (pmResults[idx] && pmResults[idx]! > 0) {
                        truePmMap[t] = pmResults[idx]!;
                    }
                });
            }
        }

        // [HOLIDAY] Reconstruct the last real session for tickers whose snapshot day
        // bar is empty (day.c=0 on a market holiday) — otherwise the CLOSED branch
        // collapses change% to 0 and the POST badge mirrors the regular price.
        let reconMap: Record<string, LastSessionData> = {};
        if (session === 'CLOSED') {
            const holidayTickers = tickers.filter(t => !(snapshotMap[t]?.day?.c));
            if (holidayTickers.length > 0) {
                reconMap = await reconstructLastSession(holidayTickers);
            }
        }

        // ── Phase 2: Build unified quotes ──
        // 유동성은 세션에 따라 실시간/직전정규장이 갈리므로 미리 일괄 조회한다
        const liqMap: Record<string, { liquidityScore: number | null; spreadPct: number | null }> = {};
        try {
            const { sessionAwareLiquidity } = await import('@/services/intrinioClient');
            const liqRes = await Promise.all(tickers.map((t, i) => {
                const sn: any = snapshotMap[t];
                return sessionAwareLiquidity(t, sn?.bidPrice ?? null, sn?.askPrice ?? null);
            }));
            tickers.forEach((t, i) => { liqMap[t] = liqRes[i]; });
        } catch (e: any) {
            console.warn('[intel/fast] liquidity lookup failed:', e?.message);
        }

        const quotes = tickers.map((ticker, i) => {
            const snap = snapshotMap[ticker];
            const cached = cachedTickers[i];

            // ── 다크풀 대체 지표 (세션 인지) ────────────────────────
            // 유동성은 **정규장 지표**다. 휴장 중 호가는 벌어져 있어서
            // 그대로 재면 전 종목이 나쁘게 나온다(GOOGL 2.0% → 0점 실측).
            // 정규장이면 실시간 호가, 아니면 EC2 가 적재한 직전 정규장
            // 분봉 중앙값을 쓴다. 둘 다 없으면 null.
            const liq = liqMap[ticker] || { liquidityScore: null, spreadPct: null };
            const spreadPct: number | null = liq.spreadPct;
            const liquidityScore: number | null = liq.liquidityScore;

            // --- Price data from Polygon snapshot ---
            const prevClose = snap?.prevDay?.c || 0;
            const todayClose = snap?.day?.c || prevClose;
            const latestPrice = snap?.lastTrade?.p || snap?.min?.c || todayClose || prevClose;
            const todaysChangePerc = snap?.todaysChangePerc || 0;
            const volume = snap?.day?.v || 0;

            // Session-aware pricing
            let displayPrice = latestPrice;
            let displayChangePct = todaysChangePerc;

            if (session === 'POST' || session === 'CLOSED') {
                const regularClose = todayClose;
                if (regularClose > 0 && prevClose > 0) {
                    displayPrice = regularClose;
                    displayChangePct = ((regularClose - prevClose) / prevClose) * 100;
                }
            }

            if (session === 'PRE') {
                displayPrice = prevClose;
                // [FIX] Use daily aggregates for accurate regular session change
                // Priority: 1) daily aggs, 2) snapshot day.c diff, 3) cached prevChangePct, 4) 0
                const agg = aggMap[ticker];
                if (agg && agg.prevClose > 0 && agg.prevPrevClose > 0) {
                    // Use historical aggregates: yesterday's close vs day-before-yesterday's close
                    displayChangePct = ((agg.prevClose - agg.prevPrevClose) / agg.prevPrevClose) * 100;
                // [FIX 2026-07-31] `todayClose !== prevClose` 제거 — 보합(0.00%)은 결측이 아니다.
                // 그 조건이 거짓이 되면 아래 `cached.prices.prevChangePct`(= **어제의 등락률**)로
                // 떨어져 화면에 전날 숫자가 남았다. 실측 SOXL 7/31: 114.72 → 114.72(0.00%)인데
                // 7/30의 +24.71%가 표시됨.
                } else if (todayClose > 0 && prevClose > 0) {
                    displayChangePct = ((todayClose - prevClose) / prevClose) * 100;
                } else if (cached?.prices?.prevChangePct) {
                    displayChangePct = cached.prices.prevChangePct;
                } else {
                    displayChangePct = 0;
                }
            }

            // Extended hours — uses persistent Redis key (flow:extended:{ticker})
            // This key only gets written when pre/post prices are valid (never overwritten with null)
            let extendedPrice = 0;
            let extendedChangePct = 0;
            let extendedLabel = '';
            const persistedExt = extendedCache[i]; // from flow:extended:{ticker} (24h TTL)

            if (session === 'PRE') {
                extendedPrice = latestPrice;
                extendedLabel = 'PRE';
                if (prevClose > 0) {
                    extendedChangePct = ((latestPrice - prevClose) / prevClose) * 100;
                }
            } else if (session === 'POST' || session === 'CLOSED') {
                // Post-market: Polygon afterHours → lastTrade → persistent cache → ticker cache
                const postExt = snap?.afterHours?.p || latestPrice || persistedExt?.postPrice || 0;
                if (postExt > 0 && displayPrice > 0) {
                    extendedPrice = postExt;
                    extendedLabel = 'POST';
                    extendedChangePct = persistedExt?.postChangePct || ((extendedPrice - displayPrice) / displayPrice) * 100;
                }
            } else if (session === 'REG') {
                // During REG: show pre-market close from persistent cache
                const cachedPrePrice = persistedExt?.prePrice || 0;
                if (cachedPrePrice > 0) {
                    extendedPrice = cachedPrePrice;
                    extendedLabel = 'PRE';
                    extendedChangePct = persistedExt?.preChangePct || 0;
                } else if (truePmMap[ticker]) {
                    // [FIX] Fallback: use true PM close fetched in parallel batch above
                    extendedPrice = truePmMap[ticker];
                    extendedLabel = 'PRE';
                    extendedChangePct = prevClose > 0 ? ((truePmMap[ticker] - prevClose) / prevClose) * 100 : 0;
                }
            }

            // [HOLIDAY] Empty day bar → override with the reconstructed last trading
            // session so we show that session's close + change% + after-hours (POST),
            // instead of 0.00% and a POST badge that mirrors the regular price.
            const recon = (session === 'CLOSED' && !(snap?.day?.c)) ? reconMap[ticker] : undefined;
            if (recon) {
                displayPrice = recon.regClose;
                displayChangePct = recon.changePct;
                if (recon.postPrice > 0) {
                    extendedPrice = recon.postPrice;
                    extendedLabel = 'POST';
                    extendedChangePct = recon.postChangePct;
                } else {
                    extendedPrice = 0;
                    extendedLabel = '';
                    extendedChangePct = 0;
                }
            }

            // --- Options/Alpha data from Redis cache (instant if available) ---
            // [CACHE WARMER] Try analysis cache first, then fall back to flow:ticker cache
            const analysis = analysisCache[ticker];
            let alphaScore = 0;
            let grade = '-';
            // ★ [2026-08-30] 기본값을 0/1 에서 **null** 로 바꿨다.
            //   옵션 지표가 없는 종목이 화면에 «GEX 0.00 · PCR 1.00» 으로 떴다.
            //   0 은 «감마 노출이 0» 이라는 주장이고 1.00 은 «풋콜 균형»이라는
            //   주장이다 — 둘 다 재지 않았을 뿐이다.
            //   같은 카드 안에서 CALL WALL 은 «—» 인데 GEX 만 «0.00» 이라
            //   일관성도 없었다(대표 지적: TSM 은 안 나오고 AVGO 는 나온다).
            //   null 로 두면 화면이 전부 «—» 로 그린다.
            let maxPain: number | null = null;
            let callWall: number | null = null;
            let putFloor: number | null = null;
            let gex: number | null = null;
            let pcr: number | null = null;
            let gammaRegime = 'NEUTRAL';
            let sparkline: number[] = [];
            let netPremium: number | null = null;
            let rsi: number | null = null;
            let rvol: number | null = null;
            let squeezeScore: number | null = null;
            let ivSkew: number | null = null;
            let impliedMovePct: number | null = null;

            if (analysis) {
                // Use pre-warmed analysis cache (always fresh, 2-min Cron)
                alphaScore = analysis.alphaSnapshot?.score || 0;
                grade = analysis.alphaSnapshot?.grade || '-';
                maxPain = analysis.maxPain ?? null;
                callWall = analysis.callWall ?? null;
                putFloor = analysis.putFloor ?? null;
                gex = analysis.gex ?? null;
                pcr = analysis.pcr ?? null;
                netPremium = analysis.netPremium ?? null;
                rsi = analysis.rsi ?? null;
                rvol = analysis.relVol ?? null;
                squeezeScore = analysis.squeezeScore ?? null;
                ivSkew = (analysis.ivSkew != null && analysis.ivSkew <= 2.0) ? analysis.ivSkew : null;
                impliedMovePct = analysis.impliedMovePct ?? null;
                sparkline = analysis.sparkline || [];
                // 못 잰 것은 «중립»이 아니라 «알 수 없음»이다
                if (gex != null && gex > 0) gammaRegime = 'LONG';
                else if (gex != null && gex < 0) gammaRegime = 'SHORT';
                else if (gex == null) gammaRegime = 'UNKNOWN';
            } else if (cached) {
                // Full cached data from /api/live/ticker — re-apply the XS
                // override in case a stale/cold-start V8 entry is cached
                const cAlpha = cached.alpha ? xsSnapshotOverride(ticker, cached.alpha) : null;
                alphaScore = cAlpha?.score || 0;
                grade = cAlpha?.grade || '-';
                maxPain = cached.flow?.maxPain || 0;
                callWall = cached.flow?.callWall || 0;
                putFloor = cached.flow?.putFloor || 0;
                gex = cached.flow?.netGex ?? null;
                pcr = cached.flow?.oiPcr || cached.flow?.volumePcr || 1;
                netPremium = cached.flow?.netPremium || 0;
                rsi = cached.realtime?.rsi || 0;
                rvol = cached.realtime?.relVol || 0;

                // 못 잰 것은 «중립»이 아니라 «알 수 없음»이다
                if (gex != null && gex > 0) gammaRegime = 'LONG';
                else if (gex != null && gex < 0) gammaRegime = 'SHORT';
                else if (gex == null) gammaRegime = 'UNKNOWN';

                // Sparkline from cached sparkline or flow data
                if (cached.flow?.sparkline) {
                    sparkline = cached.flow.sparkline;
                }
            }

            return {
                ticker,
                price: displayPrice,
                changePct: displayChangePct,
                prevClose,
                volume,
                extendedPrice,
                extendedChangePct,
                extendedLabel,
                session,
                alphaScore,
                grade,
                maxPain,
                callWall,
                putFloor,
                gex,
                pcr,
                gammaRegime,
                sparkline,
                netPremium,
                rsi,
                rvol,
                squeezeScore,
                // [2026-08-29] whaleIndex 추가.
                // 섹터 카드의 WHALE 배지가 이 필드를 못 받아 0 이 되었고,
                // 그동안 화면이 «감마 펄스에서 합성한 가짜 값»으로 그 공백을
                // 메우고 있었다. 합성값을 걷어내면서 진짜 값을 채운다.
                // (다크풀은 여전히 null — 그건 측정 자체가 불가하다)
                whaleIndex: calculateWhaleIndex(gex, null, null, netPremium),
                // 다크풀 대체 — 호가 스프레드 기반 유동성 점수(0~100)
                liquidityScore: liquidityScore,
                spreadPct: spreadPct,
                ivSkew,
                impliedMovePct,
            };
        });

        // Sort by changePct descending
        quotes.sort((a, b) => b.changePct - a.changePct);

        const elapsed = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            data: quotes,
            meta: {
                tickers,
                count: quotes.length,
                elapsedMs: elapsed,
                cachedFor: '15s',
                dataSource: 'polygon_batch+redis',
                cacheHits: cachedTickers.filter(Boolean).length,
                cacheMisses: cachedTickers.filter(c => !c).length,
            }
        });

    } catch (error: any) {
        console.error('[/api/intel/fast] Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Failed to fetch sector data',
            data: []
        }, { status: 500 });
    }
}
