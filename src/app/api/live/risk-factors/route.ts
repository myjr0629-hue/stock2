import { NextRequest, NextResponse } from 'next/server';

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
const RISK_FACTORS_URL = 'https://api.polygon.io/stocks/filings/vX/risk-factors';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('ticker') || searchParams.get('t');

    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    const startTime = Date.now();

    try {
        const url = `${RISK_FACTORS_URL}?ticker=${ticker}&limit=10&apiKey=${MASSIVE_API_KEY}`;
        const res = await fetch(url, { next: { revalidate: 86400 } }); // Cache 24 hours (SEC filings don't change often)

        if (!res.ok) {
            console.error('Risk Factors API Error:', res.status);
            return NextResponse.json({
                ticker,
                riskLevel: null,
                categories: [],
                status: 'unavailable'
            });
        }

        const data = await res.json();
        const results = data.results || [];

        if (results.length === 0) {
            return NextResponse.json({
                ticker,
                riskLevel: null,
                categories: [],
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
            riskLevel: null,
            categories: [],
            status: 'error',
            error: String(e)
        });
    }
}
