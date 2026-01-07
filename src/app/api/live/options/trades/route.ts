import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('t')?.toUpperCase();

    if (!ticker) {
        return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
    }

    try {
        // [V2 Revamp] Use Option Snapshot to capture "Latest Whispers" across the chain
        // Logic:
        // 1. Fetch entire option chain snapshot (or large batch)
        // 2. Extract 'last_trade' from each contract
        // 3. Filter for 'Whale' criteria:
        //    - Expiry <= 14 days (Gamma Explosion Zone)
        //    - Premium >= $50k (Institutional Size)
        //    - Trade Time: Today (Fresh flow)

        // Note: Snapshot returns the *latest* trade for each contract. 
        // This is the best proxy for "Live Flow" without a websocket.

        // Use getOptionSnapshot which hits /v3/snapshot/options/{ticker}
        // Ideally we need ALL contracts, so massiveClient might need to handle pagination if 250 is not enough.
        // For now, we assume the client fetches a decent chunk or the API returns all.
        // (Polygon Snapshot usually returns ALL in one go, usually heavily cached).

        const { getOptionSnapshot } = await import('@/services/massiveClient');

        const rawChain = await getOptionSnapshot(ticker);

        if (!rawChain || rawChain.length === 0) {
            return NextResponse.json({
                ticker,
                count: 0,
                items: [],
                debug: { note: "No snapshot data found" }
            });
        }

        const now = new Date();

        // [Fix] Timezone Handling:
        // Server might be in KST (+09:00), Market is ET (-05:00).
        // US Session (09:30 ET) = 23:30 KST (Previous Day) -> Crosses Midnight.
        // Using 'startOfDay' (Local Midnight) filters out the first 30mins of session if server is KST.
        // Solution: Use "Last 20 Hours" window (Covers full Pre-market + Market + After-hours)
        const cutoffTime = new Date(now.getTime() - 20 * 60 * 60 * 1000);

        // 14 Days logic (Forward looking)
        const fourteenDaysFromNow = new Date();
        fourteenDaysFromNow.setDate(now.getDate() + 14);

        const whaleTrades: any[] = [];

        for (const contract of rawChain) {
            // 1. Check Trade Existence
            const trade = contract.last_trade?.last_trade_sip || contract.last_trade;

            if (!trade || !trade.price || !trade.size) continue;

            const timestampNs = trade.sip_timestamp || trade.t || 0;
            const timestampMs = timestampNs / 1000000;
            const tradeDate = new Date(timestampMs);

            // Filter: Recent Flow (Last 20 hours)
            if (tradeDate < cutoffTime) continue;

            // 2. Check Expiry (from details)
            const details = contract.details;
            if (!details || !details.expiration_date) continue;

            const expiryStr = details.expiration_date; // "2025-01-16"
            const expiry = new Date(expiryStr);

            // Filter: Expiry <= 14 Days
            if (expiry > fourteenDaysFromNow || expiry < cutoffTime) continue;

            // 3. Calculate Premium
            const price = trade.price;
            const size = trade.size;
            const premium = price * size * 100; // 1 contract = 100 shares

            // Filter: Whale Size ($50k+)
            if (premium < 50000) continue;

            whaleTrades.push({
                id: `${details.ticker}-${timestampNs}`,
                ticker: details.ticker,
                underlying: ticker,
                strike: details.strike_price,
                expiry: expiryStr,
                type: details.contract_type?.toUpperCase() || 'UNKNOWN',
                price,
                size,
                premium,
                iv: contract.implied_volatility,
                greeks: contract.greeks,
                timestamp: timestampNs,
                tradeDate,
                timeET: tradeDate.toLocaleTimeString('en-US', {
                    timeZone: 'America/New_York',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                }),
                isWhale: true
            });
        }

        // Sort by Time Descending
        whaleTrades.sort((a, b) => b.timestamp - a.timestamp);

        return NextResponse.json({
            ticker,
            count: whaleTrades.length,
            items: whaleTrades,
            debug: {
                totalContractsScanned: rawChain.length,
                filteredCount: whaleTrades.length,
                criteria: "Premium >= $50k, Expiry <= 14d, Today"
            }
        });

    } catch (error: any) {
        console.error(`[API] Whale feed error for ${ticker}:`, error);
        return NextResponse.json({
            error: error.message || 'Internal Server Error',
            details: error
        }, { status: 500 });
    }
}
