// API Route: /api/live/short-squeeze
// SI% + Days to Cover + Short Volume → Squeeze Risk
// LOW / MEDIUM / HIGH / CRITICAL

import { NextRequest, NextResponse } from 'next/server';
import { fetchSIPercent } from '@/services/massiveClient';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY || process.env.MASSIVE_API_KEY || '';
const POLYGON_BASE = 'https://api.polygon.io';

async function fetchShortVolume(ticker: string) {
    try {
        const url = `${POLYGON_BASE}/stocks/v1/short-volume?ticker=${ticker}&limit=1&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, { next: { revalidate: 60 } });
        if (!res.ok) return null;
        const data = await res.json();
        const result = data.results?.[0];
        if (!result) return null;
        const shortVolume = result.short_volume || 0;
        const totalVolume = result.total_volume || 1;
        return {
            shortVolPercent: Math.round((shortVolume / totalVolume) * 1000) / 10,
            shortVolume,
            totalVolume,
        };
    } catch { return null; }
}

export const revalidate = 120;

export async function GET(req: NextRequest) {
    const ticker = req.nextUrl.searchParams.get('t')?.toUpperCase();
    if (!ticker) return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });

    try {
        const [siData, svData] = await Promise.all([
            fetchSIPercent(ticker),
            fetchShortVolume(ticker),
        ]);

        const siPercent = siData?.siPercent || 0;
        const daysToCover = siData?.daysToCover || 0;
        const siChange = siData?.siPercentChange || 0;
        const shortVolPercent = svData?.shortVolPercent || 0;

        // Squeeze Risk Score
        let riskScore = 0;
        // SI% contribution
        if (siPercent >= 20) riskScore += 40;
        else if (siPercent >= 10) riskScore += 25;
        else if (siPercent >= 5) riskScore += 10;

        // Days to Cover
        if (daysToCover >= 5) riskScore += 25;
        else if (daysToCover >= 3) riskScore += 15;
        else if (daysToCover >= 2) riskScore += 8;

        // SI Change (increasing = more risk)
        if (siChange > 5) riskScore += 15;
        else if (siChange > 0) riskScore += 8;

        // Short Volume ratio
        if (shortVolPercent >= 50) riskScore += 20;
        else if (shortVolPercent >= 40) riskScore += 10;
        else if (shortVolPercent >= 30) riskScore += 5;

        riskScore = Math.min(100, riskScore);

        let status: string;
        if (riskScore >= 70) status = 'CRITICAL';
        else if (riskScore >= 45) status = 'HIGH';
        else if (riskScore >= 20) status = 'MEDIUM';
        else status = 'LOW';

        return NextResponse.json({
            ticker,
            siPercent: Math.round(siPercent * 10) / 10,
            daysToCover: Math.round(daysToCover * 10) / 10,
            siChange: Math.round(siChange * 10) / 10,
            shortVolPercent,
            riskScore,
            status,
            floatShares: siData?.floatShares || 0,
            settlementDate: siData?.settlementDate || null,
        });
    } catch (error) {
        console.error('[short-squeeze] Error:', error);
        return NextResponse.json({ error: 'Failed' }, { status: 500 });
    }
}
