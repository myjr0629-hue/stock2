import { NextRequest, NextResponse } from 'next/server';
import { fetchMassive } from '@/services/massiveClient';

export async function GET(req: NextRequest) {
    const startTime = Date.now();

    try {
        // Fetch Treasury Yields - all maturities in one response
        // sort=date.desc to get latest first
        const data = await fetchMassive('/fed/v1/treasury-yields', {
            limit: '2',
            sort: 'date.desc'  // Latest first
        }, true);

        const results = data.results || [];

        if (results.length < 2) {
            const latest = results[0];
            return NextResponse.json({
                yield10Y: latest?.yield_10_year || null,
                change: 0,
                status: results.length > 0 ? '데이터' : 'N/A',
                color: 'text-white',
                date: latest?.date,
                debug: { count: results.length, latencyMs: Date.now() - startTime }
            });
        }

        const latest = results[0];
        const previous = results[1];
        const change = (latest.yield_10_year || 0) - (previous.yield_10_year || 0);

        // Divergence interpretation
        // Rising yields = risk-on (money OUT of bonds)
        // Falling yields = risk-off (money INTO bonds)
        let status = '중립';
        let color = 'text-white';
        if (change > 0.05) { status = '위험↑'; color = 'text-rose-400'; }
        else if (change > 0.02) { status = '경계'; color = 'text-amber-400'; }
        else if (change < -0.05) { status = '안전↓'; color = 'text-emerald-400'; }
        else if (change < -0.02) { status = '안정'; color = 'text-cyan-400'; }

        return NextResponse.json({
            yield10Y: latest.yield_10_year,
            yield2Y: latest.yield_2_year,
            yield30Y: latest.yield_30_year,
            previousYield: previous.yield_10_year,
            change: Number(change.toFixed(3)),
            status,
            color,
            date: latest.date,
            debug: {
                latencyMs: Date.now() - startTime
            }
        });

    } catch (e: any) {
        const errMsg = e?.reasonKR || e?.message || String(e);
        console.error('Treasury API Error:', errMsg);

        return NextResponse.json({
            yield10Y: null,
            change: null,
            status: 'N/A',
            color: 'text-slate-400',
            error: errMsg,
            debug: { latencyMs: Date.now() - startTime }
        });
    }
}
