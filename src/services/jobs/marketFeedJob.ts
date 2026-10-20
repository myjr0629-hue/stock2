import { setInCache, getFromCache } from '@/services/redisClient';
import { YAHOO_CACHE_KEYS, type YahooQuote } from '@/services/yahooFinanceHub';
import { reconcileIndexQuote } from '@/lib/indexQuoteReconcile';

/**
 * [V8.0] Market Data → Redis Writer — 실행부(요청 객체와 분리)
 *
 * 2026-10-20 — Vercel 크론 라우트(/api/cron/market-feed)에서 수집·보정·기록 로직을 그대로 옮겼다.
 *   같은 함수를 두 곳이 부른다:
 *     ① EC2 워커(scripts/ec2-cron/market-feed-worker.ts → /opt/signum-cron, PM2 «cron-market-feed») — 주 실행자
 *     ② Vercel 크론 라우트 — EC2 성공 표식(cron:ec2:success:market-feed)이 신선하면 건너뛰고, 없거나 낡으면 예전처럼 실행(자동 복귀)
 *   키·TTL·updatedAt/lastChangeAt 의미·VIX 급변 처리 전부 예전과 같다. 아래 수집 함수 본문은 한 글자도 바꾸지 않았다.
 *
 * This is the ONLY place that calls Yahoo Finance and CNN directly.
 * Fetches all Yahoo symbols + CNN Fear & Greed and writes to Redis.
 * All other services read from Redis only.
 */

export const SYMBOLS = [
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
    { yahoo: '^SOX',  key: YAHOO_CACHE_KEYS.SOX },
    { yahoo: 'KRW=X', key: YAHOO_CACHE_KEYS.USDKRW },
    { yahoo: 'JPY=X', key: YAHOO_CACHE_KEYS.USDJPY },
    // Real ICE US Dollar Index (DXY) — trades ~24/5, unlike the UUP-ETF proxy
    { yahoo: 'DX-Y.NYB', key: YAHOO_CACHE_KEYS.DXY },
    // Actual index quotes (regular session close — not futures)
    { yahoo: '^IXIC', key: YAHOO_CACHE_KEYS.IDX_NASDAQ },
    { yahoo: '^DJI',  key: YAHOO_CACHE_KEYS.IDX_DOW },
    { yahoo: '^GSPC', key: YAHOO_CACHE_KEYS.IDX_SPX },
];

/** 실제 지수(선물 아님) — 야후 meta 가 하루 묵을 때가 있어 시계열로 확인한다(src/lib/indexQuoteReconcile.ts) */
const REAL_INDEX_SYMBOLS = new Set(['^IXIC', '^DJI', '^GSPC']);

export async function fetchOneQuote(symbol: string): Promise<YahooQuote | null> {
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

        let price = meta.regularMarketPrice;
        let prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
        let metaTimeOverrideSec: number | null = null;
        let prevFromDaily = false;

        // ★ [2026-10-14] 실제 지수: meta.regularMarketPrice·previousClose 가 «어제/그제 종가»에 멈춘 채 같은 응답의 1분봉은 오늘 종가를 갖고 있을 때가 있다
        //   (10/13 마감 뒤 ^DJI 51850.6=10/12 종가 · prevClose 10/9 → 앱 지수 종가 문이 어제 값 + 금요일 대비 +0.38% 를 냈다; 실제 51672.15, −0.34%).
        //   가격은 «마지막 정규장 1분봉», 직전 종가는 «일봉에서 그 세션 바로 앞»으로 바로잡는다. 정상일 땐 값이 그대로다.
        if (REAL_INDEX_SYMBOLS.has(symbol)) {
            try {
                const r0 = data?.chart?.result?.[0];
                const ts: number[] = Array.isArray(r0?.timestamp) ? r0.timestamp : [];
                const cl: (number | null)[] = r0?.indicators?.quote?.[0]?.close || [];
                let daily: { ts: number; c: number | null }[] | null = null;
                try {
                    const dRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=1d&range=7d`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                        cache: 'no-store',
                        signal: AbortSignal.timeout(3000),
                    });
                    if (dRes.ok) {
                        const dj = (await dRes.json())?.chart?.result?.[0];
                        const dts: number[] = Array.isArray(dj?.timestamp) ? dj.timestamp : [];
                        const dcl: (number | null)[] = dj?.indicators?.quote?.[0]?.close || [];
                        daily = dts.map((t, k) => ({ ts: t, c: dcl[k] }));
                    }
                } catch { /* 일봉이 없으면 meta 직전 종가 그대로 */ }
                const rec = reconcileIndexQuote({
                    metaPrice: price,
                    metaTimeSec: typeof meta.regularMarketTime === 'number' ? meta.regularMarketTime : null,
                    metaPrevClose: typeof prevClose === 'number' ? prevClose : null,
                    bars: ts.map((t, k) => ({ ts: t, c: cl[k] })),
                    regularEndSec: typeof meta?.currentTradingPeriod?.regular?.end === 'number' ? meta.currentTradingPeriod.regular.end : null,
                    daily,
                });
                price = rec.price;
                if (rec.prevClose != null) prevClose = rec.prevClose;
                if (rec.priceFromBars) metaTimeOverrideSec = rec.marketTimeSec;
                prevFromDaily = rec.prevFromDaily;
                if (rec.priceFromBars || (rec.prevFromDaily && Math.abs((rec.prevClose ?? 0) - (meta.previousClose ?? 0)) > 0.01)) {
                    console.warn(`[market-feed] ${symbol} 야후 meta 낡음 → 시계열로 보정: price ${meta.regularMarketPrice}→${price} prevClose ${meta.previousClose}→${prevClose}`);
                }
            } catch { /* 보정 실패는 기존 경로(meta)로 */ }
        }

        // [BUGFIX] Yahoo Finance sometimes returns anomalous near-zero values (e.g., 1E-09) for ^VIX chartPreviousClose
        // [WEEKEND/HOLIDAY FIX] For some indices (seen live: ^GSPC) Yahoo rolls previousClose to
        // the CURRENT session while the market is closed (previousClose === price) → changePct
        // collapses to a fake 0% (dashboard cash S&P showed +0.00% next to correct NASDAQ/DOW).
        // Reuse the SAME daily-candles secondary fetch to recover the true prior-session close.
        // ⚠️ 2026-07-24 ROOT-CAUSE FIX: the old trigger (< 0.1%) FALSE-POSITIVED on ordinary
        // near-flat days. Live bug: ES=F prevClose 7445 vs price 7443.5 (0.02%) is a real -0.02%
        // day, NOT a roll — but it tripped the 0.1% gate, discarded Yahoo's correct 7445, and the
        // daily series was MISSING the latest session (07/22→07/24, no 07/23) so the walk-back
        // grabbed a 3-session-old 7540 bar → fabricated a -1.28% drop (S&P500 F, and intermittently
        // NASDAQ100 F, showed a crash while the real futures were flat). A genuine roll is ~0.0001%;
        // a flat day is ~0.02% — two orders of magnitude apart. Tighten to 0.005% so real flat days
        // keep Yahoo's authoritative previousClose and only true rolls reconstruct from candles.
        const yahooPrev = prevClose > 0.01 ? prevClose : null; // usually ≈ price inside the block (rolled)
        if (!prevFromDaily && (prevClose < 0.01 || Math.abs(price - prevClose) / price < 0.00005)) {
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
                    // Walk back past bars that are effectively the SAME session as `price`
                    // (verified live: ^GSPC daily series ends [..., 7483.23, 7483.24] — Yahoo
                    // appends a duplicate last-day bar, so a blind [len-2] still lands on the
                    // same session and change collapses to 0%). Skip epsilon 0.01% keeps a
                    // genuinely flat prior day (≥0.01% move) selectable.
                    let idx = validCloses.length - 1;
                    while (idx >= 0 && Math.abs(validCloses[idx] - price) / price < 0.0001) idx--;
                    if (idx >= 0) {
                        const dailyPick = validCloses[idx];
                        // Guard the missing-session daily series: if Yahoo gave a usable
                        // previousClose that DISAGREES with the daily pick by >0.5%, the daily
                        // series is missing the latest bar → trust Yahoo's previousClose instead.
                        prevClose = (yahooPrev && Math.abs(dailyPick - yahooPrev) / yahooPrev > 0.005)
                            ? yahooPrev
                            : dailyPick;
                    } // else: every bar matches current price — keep prevClose = price (honest 0%)
                }
            } catch (e) {
                // Ignore as we already defaulted to `price`
            }
        }

        const change = price - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;
        const marketTimeSec = metaTimeOverrideSec ?? (typeof meta.regularMarketTime === 'number' ? meta.regularMarketTime : null);
        const marketTime = marketTimeSec != null ? new Date(marketTimeSec * 1000).toISOString() : undefined;

        return {
            symbol,
            price,
            prevClose,
            change,
            changePct,
            updatedAt: new Date().toISOString(),
            marketTime,
            marketState: meta.marketState,
            exchangeTimezoneName: meta.exchangeTimezoneName,
            source: 'YAHOO',
            isStale: false,
        };
    } catch {
        return null;
    }
}

// CNN Fear & Greed Index → Redis
export async function fetchAndCacheFearGreed(): Promise<string> {
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


export const FEAR_GREED_ID = 'F&G';

export interface MarketFeedOptions {
    /** 이 야후 심볼만 수집한다(EC2 가 일부 실패했을 때 Vercel 이 그것만 채운다). 생략 = 전부. */
    only?: readonly string[];
    /** CNN 공포·탐욕 수집 여부(기본 true). */
    fearGreed?: boolean;
    /** VIX 급변 감지(vix:prev_change 비교·갱신) 여부(기본 true). */
    vixCheck?: boolean;
    /** 급변 시 «긴급 뉴스 갱신»을 부를 사이트 주소(예: https://www.signumhq.com). */
    newsBaseUrl: string;
    /** 쓰기 직후 주 저장소에서 다시 읽어 같은 값인지 확인한다(EC2 성공 표식용). */
    verifyRead?: (key: string) => Promise<{ ok: boolean; value: unknown }>;
}

export interface MarketFeedResult {
    ok: number;
    fail: number;
    results: string[];
    vixTriggered: boolean;
    /** 실패한 야후 심볼(+ 'F&G') — 다음 실행자가 이것만 채울 수 있게 */
    failed: string[];
    /** 쓰기(그리고 verifyRead 가 있으면 다시 읽기)까지 확인된 Redis 키 */
    written: string[];
    ts: string;
}

export async function runMarketFeed(opts: MarketFeedOptions): Promise<MarketFeedResult> {
    const results: string[] = [];
    const failed: string[] = [];
    const written: string[] = [];
    let ok = 0;
    let fail = 0;
    const onlySet = opts.only ? new Set(opts.only) : null;
    const targets = onlySet ? SYMBOLS.filter((s) => onlySet.has(s.yahoo)) : SYMBOLS;

    // Yahoo symbols — sequential to avoid rate limiting
    for (const { yahoo, key } of targets) {
        const quote = await fetchOneQuote(yahoo);
        if (quote) {
            // [2026-09-07] «값이 마지막으로 변한 시각»을 이어서 기록한다.
            // 야후가 피드를 멈춘 채 regularMarketTime 만 전진시키면 marketAgeSec 이
            // 계속 «몇 분 전»으로 나와 화면이 LIVE 를 유지한다(2026-09-06 일요일 실측:
            // NQ/ES/RTY/GC/CL 5종이 금요일 종가에 고정된 채 LIVE 배지가 떴다).
            // price 가 실제로 바뀐 시각만이 «살아 있는가»를 증명한다.
            const prev = await getFromCache<YahooQuote>(key);
            const prevPrice = typeof prev?.price === 'number' ? prev.price : null;
            if (prevPrice === null) {
                // 이전 관측 자체가 없다(콜드 스타트). 굳었는지 알 길이 없으므로
                // «지금부터 본다»로 시작한다.
                quote.lastChangeAt = quote.updatedAt;
            } else if (prevPrice !== quote.price) {
                quote.lastChangeAt = quote.updatedAt;
            } else {
                // 값이 그대로다. 이전 기록이 있으면 이어받고, 없으면(=이 코드 배포 직전에
                // 쓰인 항목) **지어내지 않고 undefined 로 둔다.** 여기에 prev.updatedAt 을
                // 넣으면 «금요일 종가에 5시간 굳어 있던 값»이 «1분 전 값»으로 둔갑한다.
                quote.lastChangeAt = prev?.lastChangeAt;
            }

            let w = await setInCache(key, quote, 600);
            if (w && opts.verifyRead) {
                // 성공 표식은 «주 저장소에 실제로 들어갔다»일 때만 — setInCache 는 Upstash 한 곳만 성공해도 true 다
                const back = await opts.verifyRead(key).catch(() => ({ ok: false, value: null }));
                w = back.ok && (back.value as YahooQuote | null)?.updatedAt === quote.updatedAt;
            }
            if (w) {
                results.push(`${yahoo}=${quote.price}`);
                written.push(key);
                ok++;
            } else {
                results.push(`${yahoo}=${quote.price}(REDIS_WRITE_FAIL)`);
                failed.push(yahoo);
                fail++;
            }
        } else {
            results.push(`${yahoo}=FETCH_FAIL`);
            failed.push(yahoo);
            fail++;
        }
    }

    // CNN Fear & Greed
    if (opts.fearGreed !== false) {
        const fgStart = Date.now();
        let fgResult = await fetchAndCacheFearGreed();
        let fgOk = !fgResult.includes('FAIL') && !fgResult.includes('INVALID');
        if (fgOk && opts.verifyRead) {
            // fetchAndCacheFearGreed 는 쓰기 결과를 돌려주지 않는다 — 주 저장소에서 «방금 쓴 값»인지 다시 읽어 확인
            const back = await opts.verifyRead('cnn:feargreed').catch(() => ({ ok: false, value: null }));
            const at = Date.parse(String((back.value as { updatedAt?: string } | null)?.updatedAt ?? ''));
            fgOk = back.ok && Number.isFinite(at) && at >= fgStart - 1000;
            if (!fgOk) fgResult += '(REDIS_WRITE_FAIL)';
        }
        results.push(fgResult);
        if (fgOk) { ok++; written.push('cnn:feargreed'); }
        else { fail++; failed.push(FEAR_GREED_ID); }
    }

    console.log(`[market-feed] ${ok}/${targets.length + (opts.fearGreed !== false ? 1 : 0)} updated: ${results.join(', ')}`);

    // ===== VIX Spike Detection → Urgent News Refresh =====
    let vixTriggered = false;
    if (opts.vixCheck !== false) {
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
                        fetch(`${opts.newsBaseUrl}/api/guardian/news-digest?refresh=1&urgent=1`, {
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
    }

    return { ok, fail, results, vixTriggered, failed, written, ts: new Date().toISOString() };
}
