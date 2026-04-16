import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar, EarningsEvent } from '@/services/finnhubClient';
import { swrFetch } from '@/lib/cache/redisSWR';

// [V45.15] Earnings API - Uses Finnhub earnings calendar
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
        const result = await swrFetch(
            `earnings:${tickerUpper}`,
            async () => {
                const FMP_KEY = process.env.POLYGON_API_KEY ? process.env.FMP_API_KEY : process.env.FMP_API_KEY; // Using env safely
                const fmpKeyToUse = FMP_KEY || process.env.NEXT_PUBLIC_FMP_API_KEY;
                const [rawEarnings, forwardRes] = await Promise.all([
                    getEarningsCalendar(tickerUpper),
                    fmpKeyToUse ? fetch(`https://financialmodelingprep.com/stable/analyst-estimates?symbol=${tickerUpper}&period=annual&apikey=${fmpKeyToUse}`).catch(()=>null) : null
                ]);
                const earnings = [...rawEarnings].sort((a, b) =>
                    new Date(a.date).getTime() - new Date(b.date).getTime()
                );
                
                let forwardEps = null, forwardRevenue = null, forwardYear = null;
                if (forwardRes && forwardRes.ok) {
                    try {
                        const forwardData = await forwardRes.json();
                        if (Array.isArray(forwardData)) {
                            const currentYearStr = new Date().toISOString().slice(0, 4);
                            const nextYearData = [...forwardData].reverse().find((f: any) => f.date && f.date.slice(0, 4) > currentYearStr);
                            if (nextYearData && nextYearData.epsAvg !== undefined && nextYearData.revenueAvg) {
                                forwardEps = nextYearData.epsAvg;
                                forwardRevenue = nextYearData.revenueAvg;
                                forwardYear = nextYearData.date.slice(0, 4);
                            }
                        }
                    } catch (e) {}
                }

                if (!earnings || earnings.length === 0) {
                    return {
                        ticker: tickerUpper,
                        nextEarningsDate: null, daysUntilEarnings: null,
                        daysLabel: 'TBD', epsEstimate: null, quarter: null, year: null,
                        color: 'text-slate-400', hasData: false,
                        debug: { latencyMs: Date.now() - startTime, eventsFound: 0 }
                    };
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const upcomingEarnings = earnings.find((e: EarningsEvent) => {
                    const earningsDate = new Date(e.date);
                    earningsDate.setHours(0, 0, 0, 0);
                    return earningsDate >= today;
                });

                const targetEarnings = upcomingEarnings || earnings[earnings.length - 1];

                let nextEarningsDate: string | null = null;
                let daysUntilEarnings: number | null = null;
                let daysLabel = 'TBD';

                if (targetEarnings) {
                    nextEarningsDate = targetEarnings.date;
                    const earningsDate = new Date(targetEarnings.date);
                    earningsDate.setHours(0, 0, 0, 0);
                    daysUntilEarnings = Math.ceil((earningsDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                    if (daysUntilEarnings < 0) daysLabel = `D+${Math.abs(daysUntilEarnings)}`;
                    else if (daysUntilEarnings === 0) daysLabel = 'today';
                    else daysLabel = `D-${daysUntilEarnings}`;
                }

                let color = 'text-slate-400';
                if (daysUntilEarnings !== null) {
                    if (daysUntilEarnings <= 7 && daysUntilEarnings >= 0) color = 'text-amber-400';
                    if (daysUntilEarnings <= 3 && daysUntilEarnings >= 0) color = 'text-rose-400';
                    if (daysUntilEarnings < 0) color = 'text-slate-500';
                }

                const hourCode = targetEarnings?.hour || '';

                return {
                    ticker: tickerUpper,
                    nextEarningsDate, daysUntilEarnings, daysLabel,
                    epsEstimate: targetEarnings?.epsEstimate || null,
                    epsActual: targetEarnings?.epsActual || null,
                    quarter: targetEarnings?.quarter || null,
                    year: targetEarnings?.year || null,
                    forwardEps, forwardRevenue, forwardYear,
                    hourLabel: hourCode, color, hasData: true,
                    debug: { latencyMs: Date.now() - startTime, eventsFound: earnings.length }
                };
            },
            { ttlSeconds: 3600, keyPrefix: 'swr' }
        );

        return NextResponse.json({ ...result.data, _cache: result._cache });
    } catch (e: any) {
        console.error('[Earnings API] Error:', e);
        return NextResponse.json({
            ticker: tickerUpper,
            nextEarningsDate: null, daysUntilEarnings: null, daysLabel: 'N/A',
            epsEstimate: null, color: 'text-slate-400', hasData: false, error: e.message
        });
    }
}
