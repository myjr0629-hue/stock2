import { NextRequest, NextResponse } from 'next/server';

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
const TREASURY_URL = 'https://api.polygon.io/fed/v1/treasury-yields';

export async function GET(req: NextRequest) {
    const startTime = Date.now();

    try {
        // Fetch 10Y Treasury Yield (latest)
        const url = `${TREASURY_URL}?maturity=10y&limit=2&apiKey=${MASSIVE_API_KEY}`;
        const res = await fetch(url, { next: { revalidate: 3600 } }); // Cache 1 hour

        if (!res.ok) {
            console.error('Treasury API Error:', res.status, await res.text());
            return NextResponse.json({
                yield10Y: null,
                change: null,
                status: 'unavailable',
                error: 'API unavailable'
            });
        }

        const data = await res.json();
        const results = data.results || [];

        if (results.length < 2) {
            return NextResponse.json({
                yield10Y: results[0]?.value || null,
                change: null,
                status: 'partial',
                debug: { count: results.length }
            });
        }

        const latest = results[0];
        const previous = results[1];
        const change = latest.value - previous.value;
        const changePercent = ((change / previous.value) * 100).toFixed(2);

        // Divergence interpretation
        // Rising yields typically mean: money flowing OUT of bonds -> INTO stocks (risk-on)
        // Falling yields typically mean: money flowing INTO bonds -> OUT of stocks (risk-off)
        let status = '중립';
        let color = 'text-white';
        if (change > 0.05) { status = '위험↑'; color = 'text-rose-400'; }
        else if (change > 0.02) { status = '경계'; color = 'text-amber-400'; }
        else if (change < -0.05) { status = '안전↓'; color = 'text-emerald-400'; }
        else if (change < -0.02) { status = '안정'; color = 'text-cyan-400'; }

        return NextResponse.json({
            yield10Y: latest.value,
            previousYield: previous.value,
            change: Number(change.toFixed(3)),
            changePercent: Number(changePercent),
            status,
            color,
            date: latest.date,
            debug: {
                latencyMs: Date.now() - startTime
            }
        });

    } catch (e) {
        console.error('Treasury API Error:', e);
        return NextResponse.json({
            yield10Y: null,
            change: null,
            status: 'error',
            error: String(e)
        });
    }
}
