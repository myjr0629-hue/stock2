import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('ticker') || searchParams.get('t');

    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const startTime = Date.now();

    try {
        // Fetch Risk Factors using massiveClient
        const data = await fetchMassive('/stocks/filings/vX/risk-factors', { ticker, limit: '10' }, true);
        const results = data.results || [];

        if (results.length === 0) {
            return NextResponse.json({
                ticker,
                riskLevel: '없음',
                riskCount: 0,
                color: 'text-emerald-400',
                status: 'no_data'
            });
        }

        // Count risk categories
        const categoryCount: Record<string, number> = {};
        results.forEach((item: any) => {
            const cat = item.category || 'Unknown';
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        });

        // Sort by count
        const sortedCategories = Object.entries(categoryCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        // Calculate overall risk level
        const totalRisks = results.length;
        let riskLevel = '보통';
        let color = 'text-white';
        if (totalRisks >= 15) { riskLevel = '높음'; color = 'text-rose-400'; }
        else if (totalRisks >= 10) { riskLevel = '주의'; color = 'text-amber-400'; }
        else if (totalRisks >= 5) { riskLevel = '보통'; color = 'text-white'; }
        else { riskLevel = '낮음'; color = 'text-emerald-400'; }

        return NextResponse.json({
            ticker,
            riskLevel,
            riskCount: totalRisks,
            color,
            topCategories: sortedCategories,
            debug: {
                latencyMs: Date.now() - startTime
            }
        });

    } catch (e) {
        console.error('Risk Factors API Error:', e);
        return NextResponse.json({
            ticker,
            riskLevel: '오류',
            riskCount: 0,
            color: 'text-slate-400',
            status: 'error',
            error: String(e)
        });
    }
}
