import { NextRequest, NextResponse } from 'next/server';
import { getEarningsCalendar, EarningsEvent } from '@/services/finnhubClient';

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
        // Fetch earnings calendar from Finnhub (next 6 months)
        const rawEarnings = await getEarningsCalendar(tickerUpper);

        // Sort by date (nearest first) - like M7 calendar does
        const earnings = [...rawEarnings].sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        if (!earnings || earnings.length === 0) {
            return NextResponse.json({
                ticker: tickerUpper,
                nextEarningsDate: null,
                daysUntilEarnings: null,
                daysLabel: 'TBD',
                epsEstimate: null,
                quarter: null,
                year: null,
                color: 'text-slate-400',
                hasData: false,
                debug: { latencyMs: Date.now() - startTime, eventsFound: 0 }
            });
        }

        // Find next upcoming earnings (first event with date >= today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcomingEarnings = earnings.find((e: EarningsEvent) => {
            const earningsDate = new Date(e.date);
            earningsDate.setHours(0, 0, 0, 0);
            return earningsDate >= today;
        });

        // If no upcoming, use the most recent past one for reference
        const targetEarnings = upcomingEarnings || earnings[earnings.length - 1];

        // Calculate days until earnings
        let nextEarningsDate: string | null = null;
        let daysUntilEarnings: number | null = null;
        let daysLabel = 'TBD';

        if (targetEarnings) {
            nextEarningsDate = targetEarnings.date;
            const earningsDate = new Date(targetEarnings.date);
            earningsDate.setHours(0, 0, 0, 0);
            daysUntilEarnings = Math.ceil((earningsDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (daysUntilEarnings < 0) {
                daysLabel = `D+${Math.abs(daysUntilEarnings)}`;
            } else if (daysUntilEarnings === 0) {
                daysLabel = '오늘';
            } else {
                daysLabel = `D-${daysUntilEarnings}`;
            }
        }

        // Color coding based on urgency
        let color = 'text-slate-400';
        if (daysUntilEarnings !== null) {
            if (daysUntilEarnings <= 7 && daysUntilEarnings >= 0) color = 'text-amber-400';
            if (daysUntilEarnings <= 3 && daysUntilEarnings >= 0) color = 'text-rose-400';
            if (daysUntilEarnings < 0) color = 'text-slate-500';
        }

        // Time of day (bmo = before market, amc = after market close)
        const hourLabel = targetEarnings?.hour === 'bmo' ? '시장 전' :
            targetEarnings?.hour === 'amc' ? '마감 후' :
                targetEarnings?.hour === 'dmh' ? '장중' : '';

        return NextResponse.json({
            ticker: tickerUpper,
            nextEarningsDate,
            daysUntilEarnings,
            daysLabel,
            epsEstimate: targetEarnings?.epsEstimate || null,
            epsActual: targetEarnings?.epsActual || null,
            quarter: targetEarnings?.quarter || null,
            year: targetEarnings?.year || null,
            hourLabel,
            color,
            hasData: true,
            debug: {
                latencyMs: Date.now() - startTime,
                eventsFound: earnings.length
            }
        });

    } catch (e: any) {
        console.error('[Earnings API] Error:', e);
        return NextResponse.json({
            ticker: tickerUpper,
            nextEarningsDate: null,
            daysUntilEarnings: null,
            daysLabel: 'N/A',
            epsEstimate: null,
            color: 'text-slate-400',
            hasData: false,
            error: e.message
        });
    }
}
