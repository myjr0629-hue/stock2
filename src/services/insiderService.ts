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

/** 거래 코드별 구성 — «거래 N건인데 매수 0 매도 0» 모순을 없애기 위해 */
export interface InsiderBreakdown {
    buy: number;             // P — 실제 매수
    sell: number;            // S — 실제 매도
    award: number;           // A — 무상부여(RSU 등)
    gift: number;            // G — 증여
    optionExercise: number;  // M — 옵션 행사
    taxWithheld: number;     // F — 세금 원천징수
    conversion: number;      // C — 전환
    other: number;
}

export interface InsiderSummary {
    /** 거래 코드별 구성 (실매매와 부여/증여를 구분해서 보여주기 위해) */
    breakdown?: InsiderBreakdown;
    /** 실매매(P/S) 건수. 0 이면 «실매매 없음»으로 표시해야 한다 */
    realTradeCount?: number;
    /** 파생(옵션) 거래 건수 — Intrinio 만 제공 */
    derivativeCount?: number;
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
    // [2026-08-29] Intrinio 우선. Massive /stocks/filings/vX/form-4 는 9/23 해지.
    // Intrinio 전역 피드는 실시간(0일전)이고 거래 상세가 더 완전하다.
    try {
        const { getInsiderFilingsIntrinio } = await import("./intrinioClient");
        const rows = await getInsiderFilingsIntrinio(ticker, limit);
        if (rows.length) return rows as InsiderTransaction[];
    } catch (e: any) {
        console.warn(`[insiderService] Intrinio path failed for ${ticker}:`, e?.message);
    }

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

    // ── [2026-08-29] 구성 내역 ───────────────────────────────────────
    // 예전에는 «거래 30건 · 매수 0 · 매도 0» 이 그대로 나갔다.
    // 실제로는 30일 내 «실매매»가 없고 무상부여·증여·세금원천만 있는 것인데,
    // 화면에서는 그 구분이 안 보여 모순처럼 읽혔다(대표 확인).
    // 무엇이 몇 건인지 그대로 보여준다 — 숫자를 숨기지도, 뭉뚱그리지도 않는다.
    const CODE_KIND: Record<string, keyof InsiderBreakdown> = {
        P: 'buy', S: 'sell', A: 'award', G: 'gift',
        M: 'optionExercise', F: 'taxWithheld', C: 'conversion',
    };
    const breakdown: InsiderBreakdown = {
        buy: 0, sell: 0, award: 0, gift: 0,
        optionExercise: 0, taxWithheld: 0, conversion: 0, other: 0,
    };
    for (const t of transactions) {
        const kind = CODE_KIND[t.code];
        if (kind) breakdown[kind]++;
        else breakdown.other++;
    }
    // 실매매(P/S)가 몇 건인지 — 이게 0 이면 화면은 «실매매 없음» 이라고 말해야 한다
    const realTradeCount = breakdown.buy + breakdown.sell;
    const derivativeCount = transactions.filter((t: any) => t.isDerivative === true).length;

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
        breakdown,
        realTradeCount,
        derivativeCount,
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
