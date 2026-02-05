// Intel M7 Fast API - Polygon Snapshot with CORRECT Session Price Logic
// [V3] Fixed session detection - uses simple time-based logic
import { NextResponse } from 'next/server';

const M7_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
const POLYGON_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";

export const revalidate = 10;

type SessionType = "PRE" | "REG" | "POST" | "CLOSED";

// Simple ET timezone session detection
function getCurrentSession(): SessionType {
    const now = new Date();
    const etFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
        weekday: 'short'
    });
    const parts = etFormatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

    const etHour = parseInt(getPart('hour')) || 0;
    const etMin = parseInt(getPart('minute')) || 0;
    const etWeekday = getPart('weekday');
    const isWeekend = etWeekday === 'Sat' || etWeekday === 'Sun';

    if (isWeekend) return 'CLOSED';

    const totalMinutes = etHour * 60 + etMin;

    // PRE: 4:00 AM - 9:29 AM ET (240 - 569 minutes)
    if (totalMinutes >= 240 && totalMinutes < 570) return 'PRE';
    // REG: 9:30 AM - 3:59 PM ET (570 - 959 minutes)
    if (totalMinutes >= 570 && totalMinutes < 960) return 'REG';
    // POST: 4:00 PM - 8:00 PM ET (960 - 1200 minutes)
    if (totalMinutes >= 960 && totalMinutes < 1200) return 'POST';
    // CLOSED: All other times
    return 'CLOSED';
}

export interface M7FastQuote {
    ticker: string;
    price: number;
    changePct: number;
    prevClose: number;
    volume: number;
    session: string;
    extendedPrice: number;
    extendedChangePct: number;
    extendedLabel: string;
}

export async function GET() {
    const startTime = Date.now();

    try {
        const session = getCurrentSession();

        // Fetch all tickers in ONE request (fast!)
        const tickersParam = M7_TICKERS.join(',');
        const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickersParam}&apiKey=${POLYGON_API_KEY}`;

        const res = await fetch(url, { next: { revalidate: 10 } });
        if (!res.ok) throw new Error(`Polygon API error: ${res.status}`);

        const data = await res.json();
        const tickerMap: Record<string, any> = {};
        (data.tickers || []).forEach((t: any) => { tickerMap[t.ticker] = t; });

        const quotes: M7FastQuote[] = [];

        M7_TICKERS.forEach(ticker => {
            const t = tickerMap[ticker];
            if (!t) {
                quotes.push({
                    ticker, price: 0, changePct: 0, prevClose: 0, volume: 0,
                    session, extendedPrice: 0, extendedChangePct: 0, extendedLabel: ''
                });
                return;
            }

            const day = t.day || {};
            const prevDay = t.prevDay || {};

            const prevClose = prevDay.c || 0;
            const regularClose = day.c || 0;
            const preMarketPrice = t.preMarket?.p || 0;
            const afterHoursPrice = t.afterHours?.p || 0;
            const lastTrade = t.lastTrade?.p || 0;

            // ===== FLOW/COMMAND PAGE PRICE LOGIC =====
            let displayPrice = 0;
            let displayChangePct = 0;
            let extendedPrice = 0;
            let extendedChangePct = 0;
            let extendedLabel = '';

            switch (session) {
                case "PRE":
                    displayPrice = prevClose;
                    // For PRE, use yesterday's change (which is todaysChangePerc from perspective of yesterday)
                    displayChangePct = t.todaysChangePerc || 0;

                    extendedPrice = preMarketPrice || lastTrade;
                    extendedLabel = 'PRE';
                    if (extendedPrice > 0 && prevClose > 0) {
                        extendedChangePct = ((extendedPrice - prevClose) / prevClose) * 100;
                    }
                    break;

                case "REG":
                    displayPrice = lastTrade || regularClose || prevClose;
                    if (displayPrice > 0 && prevClose > 0) {
                        displayChangePct = ((displayPrice - prevClose) / prevClose) * 100;
                    }
                    break;

                case "POST":
                case "CLOSED":
                    // Show today's regular close as main price
                    displayPrice = regularClose || prevClose;
                    if (displayPrice > 0 && prevClose > 0) {
                        displayChangePct = ((displayPrice - prevClose) / prevClose) * 100;
                    }

                    // After hours as extended
                    extendedPrice = afterHoursPrice || 0;
                    extendedLabel = 'POST';
                    if (extendedPrice > 0 && displayPrice > 0) {
                        extendedChangePct = ((extendedPrice - displayPrice) / displayPrice) * 100;
                    }
                    break;
            }

            quotes.push({
                ticker,
                price: displayPrice,
                changePct: displayChangePct,
                prevClose,
                volume: day.v || 0,
                session,
                extendedPrice,
                extendedChangePct,
                extendedLabel
            });
        });

        // Sort by changePct descending
        quotes.sort((a, b) => b.changePct - a.changePct);

        const elapsed = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            data: quotes,
            meta: { tickers: M7_TICKERS, count: quotes.length, elapsedMs: elapsed, session, type: 'fast-v3' }
        });

    } catch (error) {
        console.error('[/api/intel/m7-fast] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch', data: [] }, { status: 500 });
    }
}
