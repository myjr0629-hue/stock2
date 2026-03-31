import { NextResponse } from 'next/server';
import { setInCache, getFromCache } from '@/services/redisClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';

/**
 * [V8.0] Market Data → Redis Writer (Cron Only)
 * 
 * This is the ONLY place that calls Yahoo Finance and CNN directly.
 * Runs every 1 minute via Vercel Cron.
 * Fetches all 8 Yahoo symbols + CNN Fear & Greed and writes to Redis.
 * All other services read from Redis only.
 */

const SYMBOLS = [
    { yahoo: '^VIX', key: YAHOO_CACHE_KEYS.VIX },
    { yahoo: '^VIX3M', key: YAHOO_CACHE_KEYS.VIX3M || 'yahoo:vix3m' },
    { yahoo: 'NQ=F', key: YAHOO_CACHE_KEYS.NQ },
    { yahoo: '^TNX', key: YAHOO_CACHE_KEYS.TNX },
    { yahoo: 'ES=F', key: YAHOO_CACHE_KEYS.SPX },
    { yahoo: 'BTC-USD', key: YAHOO_CACHE_KEYS.BTC },
    { yahoo: 'GC=F', key: YAHOO_CACHE_KEYS.GOLD },
    { yahoo: 'TLT', key: YAHOO_CACHE_KEYS.TLT || 'yahoo:tlt' },
    { yahoo: 'CL=F', key: YAHOO_CACHE_KEYS.OIL },
    { yahoo: 'RTY=F', key: YAHOO_CACHE_KEYS.RUT },
    { yahoo: 'KRW=X', key: YAHOO_CACHE_KEYS.USDKRW },
    { yahoo: 'JPY=X', key: YAHOO_CACHE_KEYS.USDJPY },
    // Actual index quotes (regular session close — not futures)
    { yahoo: '^IXIC', key: YAHOO_CACHE_KEYS.IDX_NASDAQ },
    { yahoo: '^DJI',  key: YAHOO_CACHE_KEYS.IDX_DOW },
    { yahoo: '^GSPC', key: YAHOO_CACHE_KEYS.IDX_SPX },
];

async function fetchOneQuote(symbol: string): Promise<YahooQuote | null> {
    try {
        const encoded = encodeURIComponent(symbol);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1m&range=1d`;

        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) return null;

        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) return null;

        const price = meta.regularMarketPrice;
        let prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;

        // [BUGFIX] Yahoo Finance sometimes returns anomalous near-zero values (e.g., 1E-09) for ^VIX chartPreviousClose
        if (prevClose < 0.01) {
            // Default to `price` (0% change) if the secondary fetch fails for any reason
            prevClose = price;
            try {
                // Secondary fetch to get true daily candlesticks (bypass the 1-minute intraday chart bug)
                const fallbackUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=5d`;
                const fallbackRes = await fetch(fallbackUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    cache: 'no-store',
                    signal: AbortSignal.timeout(3000),
                });
                if (fallbackRes.ok) {
                    const fallbackData = await fallbackRes.json();
                    const closes = fallbackData?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
                    const validCloses = closes.filter((c: number | null) => c !== null && c > 0.01);
                    if (validCloses.length >= 2) {
                        // The last item is today's live price, second-to-last is yesterday's true close
                        prevClose = validCloses[validCloses.length - 2];
                    } else if (validCloses.length === 1) {
                        prevClose = validCloses[0];
                    }
                }
            } catch (e) {
                // Ignore as we already defaulted to `price`
            }
        }

        const change = price - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

        return {
            symbol,
            price,
            prevClose,
            change,
            changePct,
            updatedAt: new Date().toISOString(),
            source: 'YAHOO',
            isStale: false,
        };
    } catch {
        return null;
    }
}

// CNN Fear & Greed Index → Redis
async function fetchAndCacheFearGreed(): Promise<string> {
    try {
        const res = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return 'F&G=FAIL';

        const data = await res.json();
        const fg = data.fear_and_greed;
        if (fg && typeof fg.score === 'number') {
            await setInCache('cnn:feargreed', {
                score: fg.score,
                rating: fg.rating,
                updatedAt: new Date().toISOString(),
            }, 600);
            return `F&G=${fg.score.toFixed(0)}(${fg.rating})`;
        }
        return 'F&G=INVALID';
    } catch {
        return 'F&G=FAIL';
    }
}


export async function GET() {
    const results: string[] = [];
    let ok = 0;
    let fail = 0;

    // Yahoo symbols — sequential to avoid rate limiting
    for (const { yahoo, key } of SYMBOLS) {
        const quote = await fetchOneQuote(yahoo);
        if (quote) {
            const written = await setInCache(key, quote, 600);
            if (written) {
                results.push(`${yahoo}=${quote.price}`);
                ok++;
            } else {
                results.push(`${yahoo}=${quote.price}(REDIS_WRITE_FAIL)`);
                fail++;
            }
        } else {
            results.push(`${yahoo}=FETCH_FAIL`);
            fail++;
        }
    }

    // CNN Fear & Greed
    const fgResult = await fetchAndCacheFearGreed();
    results.push(fgResult);
    if (!fgResult.includes('FAIL')) ok++;
    else fail++;

    console.log(`[market-feed] ${ok}/${SYMBOLS.length + 1} updated: ${results.join(', ')}`);

    // ===== VIX Spike Detection → Urgent News Refresh =====
    let vixTriggered = false;
    try {
        const vixData = await getFromCache<YahooQuote>(YAHOO_CACHE_KEYS.VIX);
        if (vixData && typeof vixData.changePct === 'number') {
            const prevVixChange = await getFromCache<{ changePct: number }>('vix:prev_change');
            const prevPct = prevVixChange?.changePct ?? vixData.changePct;
            const vixDelta = Math.abs(vixData.changePct - prevPct);

            // Trigger if VIX change moved ±5% since last check (e.g., VIX went from +2% to +8%)
            if (vixDelta >= 5) {
                console.log(`[market-feed] 🚨 VIX SPIKE DETECTED: ${prevPct.toFixed(1)}% → ${vixData.changePct.toFixed(1)}% (delta: ${vixDelta.toFixed(1)}%)`);

                // Trigger urgent news refresh (fire-and-forget)
                try {
                    const baseUrl = process.env.VERCEL_URL
                        ? `https://${process.env.VERCEL_URL}`
                        : process.env.NEXT_PUBLIC_BASE_URL || 'https://www.signumhq.com';
                    fetch(`${baseUrl}/api/guardian/news-digest?refresh=1&urgent=1`, {
                        signal: AbortSignal.timeout(10000),
                        headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
                            ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
                            : {},
                    }).catch(() => {}); // fire-and-forget
                    vixTriggered = true;
                    console.log(`[market-feed] 📡 Urgent news refresh triggered`);
                } catch {}
            }

            // Store current VIX change for next comparison
            await setInCache('vix:prev_change', { changePct: vixData.changePct }, 600); // 10min TTL
        }
    } catch (e) {
        // VIX detection is non-critical, don't fail the entire cron
    }

    return NextResponse.json({
        ok,
        fail,
        results,
        vixTriggered,
        ts: new Date().toISOString(),
    });
}

