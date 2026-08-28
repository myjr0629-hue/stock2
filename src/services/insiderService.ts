// [SEC Form 4] Insider Trading Data Service
// Fetches SEC Form 4 filings from Polygon API and builds summary metrics.
// Completely isolated — does NOT affect any existing service or pipeline.

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || "";
const POLYGON_BASE = "https://api.polygon.io";

// ─── Types ─────────────────────────────────────────────────────────

export interface InsiderTransaction {
    date: string;             // filing_date
    transactionDate: string;  // actual transaction_date
    name: string;             // owner_name
    title: string;            // officer_title or role
    isDirector: boolean;
    isOfficer: boolean;
    isTenPctOwner: boolean;
    code: string;             // P=Purchase, S=Sale, A=Award, M=Exercise, C=Convert, F=Tax
    shares: number;
    pricePerShare: number;
    value: number;            // transaction_value
    acquired: 'A' | 'D';     // Acquired / Disposed
    is10b5: boolean;          // 10b5-1 pre-planned trade
    sharesAfter: number;      // shares_owned_following_transaction
    filingUrl: string;        // SEC EDGAR link
}

export interface InsiderSummary {
    net30d: number;            // Net buy/sell value (positive = net buy)
    buyCount: number;          // Purchase (P) count in 30d
    sellCount: number;         // Sale (S) count in 30d
    totalTxCount: number;      // All transaction count
    sentiment: 'BULLISH' | 'CAUTIOUS' | 'BEARISH' | 'NEUTRAL';
    latest: {
        name: string;
        title: string;
        code: 'P' | 'S';
        value: number;
        date: string;
        is10b5: boolean;
    } | null;
    transactions: InsiderTransaction[];
    _ts: number;
    _source: 'on-demand' | 'lambda-harvest';
}

// ─── Transaction Code Helpers ──────────────────────────────────────

/** Only P (Purchase) and S (Sale) are "real" market trades with information value */
function isSignificantTrade(code: string): boolean {
    return code === 'P' || code === 'S';
}

/** Derive a short title from officer_title or role flags */
function deriveTitle(raw: { officer_title?: string; is_director?: boolean; is_officer?: boolean; is_ten_percent_owner?: boolean }): string {
    if (raw.officer_title) {
        const t = raw.officer_title;
        // Normalize common long titles to short labels
        if (/chief executive|^ceo$/i.test(t)) return 'CEO';
        if (/chief financial|^cfo$/i.test(t)) return 'CFO';
        if (/chief operating|^coo$/i.test(t)) return 'COO';
        if (/chief technolog|^cto$/i.test(t)) return 'CTO';
        if (/president/i.test(t) && !/vice/i.test(t)) return 'President';
        if (/general counsel/i.test(t)) return 'General Counsel';
        if (/principal accounting/i.test(t)) return 'PAO';
        if (/senior vice|^svp$/i.test(t)) return 'SVP';
        if (/executive vice|^evp$/i.test(t)) return 'EVP';
        if (/vice president|^vp$/i.test(t)) return 'VP';
        // Truncate long titles
        return t.length > 20 ? t.substring(0, 18) + '…' : t;
    }
    if (raw.is_director) return 'Director';
    if (raw.is_ten_percent_owner) return '10%+ Owner';
    return 'Insider';
}

// ─── Core Fetch ────────────────────────────────────────────────────

/**
 * Fetch Form 4 filings for a specific ticker from Polygon.
 * Returns raw transactions sorted by filing_date DESC.
 */
export async function fetchForm4(ticker: string, limit: number = 30): Promise<InsiderTransaction[]> {
    try {
        const url = `${POLYGON_BASE}/stocks/filings/vX/form-4?tickers=${encodeURIComponent(ticker)}&limit=${limit}&apiKey=${POLYGON_API_KEY}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        const res = await fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
        });
        clearTimeout(timeout);

        if (!res.ok) {
            console.warn(`[insiderService] Form 4 API returned ${res.status} for ${ticker}`);
            return [];
        }

        const json = await res.json();
        const results = json.results || [];

        return results.map((r: any): InsiderTransaction => ({
            date: r.filing_date || '',
            transactionDate: r.transaction_date || r.filing_date || '',
            name: r.owner_name || 'Unknown',
            title: deriveTitle(r),
            isDirector: !!r.is_director,
            isOfficer: !!r.is_officer,
            isTenPctOwner: !!r.is_ten_percent_owner,
            code: r.transaction_code || '',
            shares: r.transaction_shares || 0,
            pricePerShare: r.transaction_price_per_share || 0,
            value: r.transaction_value || 0,
            acquired: r.transaction_acquired_disposed === 'A' ? 'A' : 'D',
            is10b5: !!r.aff_10b5_one,
            sharesAfter: r.shares_owned_following_transaction || 0,
            filingUrl: r.filing_url || '',
        }));
    } catch (error) {
        console.error(`[insiderService] fetchForm4 error for ${ticker}:`, error);
        return [];
    }
}

// ─── Summary Builder ───────────────────────────────────────────────

/**
 * Build InsiderSummary from raw transactions.
 * Calculates net value, counts, sentiment, and picks the latest significant trade.
 */
export function buildInsiderSummary(transactions: InsiderTransaction[], source: 'on-demand' | 'lambda-harvest' = 'on-demand'): InsiderSummary {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Filter to real market trades (P/S) for the summary metrics
    const significantTrades = transactions.filter(t => isSignificantTrade(t.code));
    const recent = significantTrades.filter(t => new Date(t.date) >= thirtyDaysAgo);

    // Net value: BUY(P) = positive, SELL(S) = negative
    let net30d = 0;
    let buyCount = 0;
    let sellCount = 0;

    for (const t of recent) {
        if (t.code === 'P') {
            net30d += t.value;
            buyCount++;
        } else if (t.code === 'S') {
            net30d -= t.value;
            sellCount++;
        }
    }

    // Latest significant trade
    const latest = significantTrades.length > 0
        ? {
            name: significantTrades[0].name,
            title: significantTrades[0].title,
            code: significantTrades[0].code as 'P' | 'S',
            value: significantTrades[0].value,
            date: significantTrades[0].date,
            is10b5: significantTrades[0].is10b5,
        }
        : null;

    // Sentiment calculation
    let sentiment: InsiderSummary['sentiment'] = 'NEUTRAL';
    if (buyCount > 0 && net30d > 0) {
        sentiment = 'BULLISH';
    } else if (sellCount > buyCount && net30d < 0) {
        // Check if non-10b5-1 (voluntary) sells exist — stronger bearish signal
        const voluntarySells = recent.filter(t => t.code === 'S' && !t.is10b5);
        if (voluntarySells.length > 0 && Math.abs(net30d) > 5_000_000) {
            sentiment = 'BEARISH';
        } else {
            sentiment = 'CAUTIOUS';
        }
    } else if (recent.length === 0 && significantTrades.length === 0) {
        sentiment = 'NEUTRAL';
    }

    return {
        net30d,
        buyCount,
        sellCount,
        totalTxCount: transactions.length,
        sentiment,
        latest,
        transactions: transactions.slice(0, 20), // Cap at 20 for payload size
        _ts: Date.now(),
        _source: source,
    };
}

// ─── Convenience: Fetch + Build ────────────────────────────────────

/**
 * Full pipeline: fetch Form 4 data and build summary for a ticker.
 * Returns null if no data available.
 */
export async function getInsiderSummary(ticker: string): Promise<InsiderSummary | null> {
    const transactions = await fetchForm4(ticker, 30);
    if (transactions.length === 0) return null;
    return buildInsiderSummary(transactions, 'on-demand');
}
