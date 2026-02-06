import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';

// [V45.15] Earnings API - Replaces SEC Risk Factors panel
// Shows: Next earnings date, days remaining, expected EPS

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('ticker') || searchParams.get('t');

    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const startTime = Date.now();
    const tickerUpper = ticker.toUpperCase();

    try {
        // Approach 1: Try Polygon ticker details for next_earnings_date (free tier)
        const tickerDetails = await fetchMassive(
            `/v3/reference/tickers/${tickerUpper}`,
            {},
            true,
            undefined,
            { next: { revalidate: 3600 } } // Cache 1 hour
        ).catch(() => null);

        // Approach 2: Try Polygon financials for EPS data
        const financials = await fetchMassive(
            `/vX/reference/financials`,
            {
                ticker: tickerUpper,
                limit: '4',
                timeframe: 'quarterly',
                order: 'desc'
            },
            true,
            undefined,
            { next: { revalidate: 86400 } } // Cache 24 hours
        ).catch(() => ({ results: [] }));

        // Extract data
        const results = financials?.results || [];
        const latestReport = results[0];

        // Next earnings estimate from ticker details
        // Note: Polygon free tier may not have this, but we try
        let nextEarningsDate: string | null = null;
        let daysUntilEarnings: number | null = null;

        // Try to find earnings date from various sources
        if (tickerDetails?.results?.next_earnings_date) {
            nextEarningsDate = tickerDetails.results.next_earnings_date;
        }

        // Calculate days until earnings
        if (nextEarningsDate) {
            const earningsDate = new Date(nextEarningsDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            earningsDate.setHours(0, 0, 0, 0);
            daysUntilEarnings = Math.ceil((earningsDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Extract EPS from latest financials
        let lastEPS: number | null = null;
        let lastRevenue: number | null = null;
        let fiscalPeriod: string | null = null;
        let filingDate: string | null = null;

        if (latestReport) {
            const income = latestReport.financials?.income_statement;
            lastEPS = income?.basic_earnings_per_share?.value ||
                income?.diluted_earnings_per_share?.value || null;

            const revenues = latestReport.financials?.income_statement?.revenues;
            lastRevenue = revenues?.value ? revenues.value / 1e9 : null; // Convert to billions

            fiscalPeriod = latestReport.fiscal_period; // e.g., "Q3"
            filingDate = latestReport.filing_date;
        }

        // Generate display label for days
        let daysLabel: string;
        if (daysUntilEarnings === null) {
            daysLabel = 'TBD';
        } else if (daysUntilEarnings < 0) {
            daysLabel = `D+${Math.abs(daysUntilEarnings)}`; // Already passed
        } else if (daysUntilEarnings === 0) {
            daysLabel = '오늘';
        } else {
            daysLabel = `D-${daysUntilEarnings}`;
        }

        // Color coding
        let color = 'text-slate-400';
        if (daysUntilEarnings !== null) {
            if (daysUntilEarnings <= 7) color = 'text-amber-400'; // Upcoming soon
            if (daysUntilEarnings <= 3) color = 'text-rose-400'; // Very soon
            if (daysUntilEarnings < 0) color = 'text-slate-500'; // Passed
        }

        return NextResponse.json({
            ticker: tickerUpper,
            nextEarningsDate,
            daysUntilEarnings,
            daysLabel,
            lastEPS,
            lastRevenue,
            fiscalPeriod,
            filingDate,
            color,
            hasData: nextEarningsDate !== null || lastEPS !== null,
            debug: {
                latencyMs: Date.now() - startTime,
                reportsFound: results.length
            }
        });

    } catch (e: any) {
        console.error('[Earnings API] Error:', e);
        return NextResponse.json({
            ticker: tickerUpper,
            nextEarningsDate: null,
            daysUntilEarnings: null,
            daysLabel: 'N/A',
            lastEPS: null,
            color: 'text-slate-400',
            hasData: false,
            error: e.message
        });
    }
}
