// API Route: /api/live/fundamentals
// Polygon Financial Ratios + vX Financial Statements → Fundamental Health Score
// Grade: A(80+) B(60+) C(40+) D(20+) F(<20)

import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';

export const revalidate = 3600; // 1 hour cache (fundamentals change slowly)

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('t')?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

    try {
        // Use TWO endpoints:
        // 1) /stocks/financials/v1/ratios → PE, D/E, ROE, FCF, P/B etc (flat object, reliable)
        // 2) /vX/reference/financials → Income Statement with correct nested structure for revenue growth/margin
        const [ratiosRes, vxFinRes] = await Promise.all([
            fetchMassive(`/stocks/financials/v1/ratios`, { ticker, limit: '1' }, true).catch(() => null),
            fetchMassive(`/vX/reference/financials`, { ticker, limit: '5', timeframe: 'quarterly', order: 'desc', sort: 'period_of_report_date' }, true).catch(() => null),
        ]);

        // --- Extract Ratios (flat fields from /v1/ratios) ---
        const ratios = ratiosRes?.results?.[0] || {};
        const pe = ratios.price_to_earnings ?? null;
        const de = ratios.debt_to_equity ?? null;
        const roe = ratios.return_on_equity ?? null;
        const pb = ratios.price_to_book ?? null;
        const ps = ratios.price_to_sales ?? null;
        const fcfRaw = ratios.free_cash_flow ?? null;
        const marketCap = ratios.market_cap ?? null;

        // FCF Yield = FCF / Market Cap * 100
        let fcfYield: number | null = null;
        if (fcfRaw !== null && marketCap !== null && marketCap > 0) {
            fcfYield = (fcfRaw / marketCap) * 100;
        }

        // --- Extract Income Statement from vX (nested structure) ---
        const vxResults = vxFinRes?.results || [];
        let revenueGrowth: number | null = null;
        let netMargin: number | null = null;

        if (vxResults.length >= 2) {
            const latest = vxResults[0]?.financials?.income_statement;
            // For YoY quarterly comparison, compare with Q-4
            const prevIdx = vxResults.length >= 5 ? 4 : vxResults.length - 1;
            const prev = vxResults[prevIdx]?.financials?.income_statement;

            if (latest && prev) {
                const revLatest = latest.revenues?.value || 0;
                const revPrev = prev.revenues?.value || 0;
                if (revPrev > 0 && revLatest > 0) {
                    revenueGrowth = ((revLatest - revPrev) / Math.abs(revPrev)) * 100;
                }
                const netIncome = latest.net_income_loss?.value || 0;
                if (revLatest > 0) {
                    netMargin = (netIncome / revLatest) * 100;
                }
            }
        }

        // --- Score Calculation (each 0-20, total 0-100) ---
        let score = 0;
        const breakdown: Record<string, { value: string; score: number; label: string }> = {};

        // P/E Score (lower is better, but negative = unprofitable)
        if (pe !== null && pe > 0) {
            const peScore = pe < 15 ? 20 : pe < 25 ? 16 : pe < 35 ? 12 : pe < 50 ? 8 : 4;
            score += peScore;
            breakdown.pe = { value: pe.toFixed(1), score: peScore, label: 'P/E' };
        } else {
            breakdown.pe = { value: pe !== null ? pe.toFixed(1) : 'N/A', score: 0, label: 'P/E' };
        }

        // D/E Score (lower is healthier)
        if (de !== null) {
            const deScore = de < 0.3 ? 20 : de < 0.6 ? 16 : de < 1.0 ? 12 : de < 2.0 ? 8 : 4;
            score += deScore;
            breakdown.de = { value: de.toFixed(2), score: deScore, label: 'D/E' };
        } else {
            breakdown.de = { value: 'N/A', score: 0, label: 'D/E' };
        }

        // FCF Yield Score (higher is better)
        if (fcfYield !== null) {
            const fcfScore = fcfYield > 8 ? 20 : fcfYield > 5 ? 16 : fcfYield > 3 ? 12 : fcfYield > 1 ? 8 : 4;
            score += fcfScore;
            breakdown.fcf = { value: fcfYield.toFixed(1) + '%', score: fcfScore, label: 'FCF' };
        } else {
            breakdown.fcf = { value: 'N/A', score: 0, label: 'FCF' };
        }

        // Revenue Growth Score
        if (revenueGrowth !== null) {
            const revScore = revenueGrowth > 50 ? 20 : revenueGrowth > 25 ? 16 : revenueGrowth > 10 ? 12 : revenueGrowth > 0 ? 8 : 4;
            score += revScore;
            breakdown.rev = { value: (revenueGrowth > 0 ? '+' : '') + revenueGrowth.toFixed(0) + '%', score: revScore, label: 'Rev' };
        } else {
            breakdown.rev = { value: 'N/A', score: 0, label: 'Rev' };
        }

        // Net Margin Score
        if (netMargin !== null) {
            const marginScore = netMargin > 30 ? 20 : netMargin > 20 ? 16 : netMargin > 10 ? 12 : netMargin > 0 ? 8 : 4;
            score += marginScore;
            breakdown.margin = { value: netMargin.toFixed(1) + '%', score: marginScore, label: 'Margin' };
        } else {
            breakdown.margin = { value: 'N/A', score: 0, label: 'Margin' };
        }

        // Grade
        let grade: string;
        if (score >= 80) grade = 'A';
        else if (score >= 70) grade = 'A-';
        else if (score >= 60) grade = 'B+';
        else if (score >= 50) grade = 'B';
        else if (score >= 40) grade = 'C+';
        else if (score >= 30) grade = 'C';
        else if (score >= 20) grade = 'D';
        else grade = 'F';

        return NextResponse.json({
            ticker,
            score,
            grade,
            breakdown,
            pe: pe !== null ? Math.round(pe * 10) / 10 : null,
            de: de !== null ? Math.round(de * 100) / 100 : null,
            roe: roe !== null ? Math.round(roe * 1000) / 10 : null,
            revenueGrowth: revenueGrowth !== null ? Math.round(revenueGrowth * 10) / 10 : null,
            netMargin: netMargin !== null ? Math.round(netMargin * 10) / 10 : null,
            fcfYield: fcfYield !== null ? Math.round(fcfYield * 10) / 10 : null,
            pb: pb !== null ? Math.round(pb * 10) / 10 : null,
            ps: ps !== null ? Math.round(ps * 10) / 10 : null,
        });
    } catch (error) {
        console.error('[fundamentals] Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
