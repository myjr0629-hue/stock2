// [S-124.6] MACD API Endpoint for Command Quick Intel Gauges
import { NextRequest } from 'next/server';
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";

const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY;
const MASSIVE_BASE_URL = process.env.MASSIVE_BASE_URL || "https://api.polygon.io";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
    const t = req.nextUrl.searchParams.get('t');
    if (!t) {
        return new Response(JSON.stringify({ error: "Missing ticker" }), {
            status: 400,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    const ticker = t.toUpperCase();

    try {
        // Fetch MACD from Polygon/Massive API
        const url = `${MASSIVE_BASE_URL}/v1/indicators/macd/${ticker}?timespan=day&adjusted=true&short_window=12&long_window=26&signal_window=9&series_type=close&limit=5&apiKey=${MASSIVE_API_KEY}`;

        const data = await fetchMassive(url, {}, false, undefined, CACHE_POLICY.LIVE);

        const results = data?.results?.values || [];

        if (results.length === 0) {
            return new Response(JSON.stringify({
                ticker,
                signal: 'NEUTRAL',
                label: '데이터없음',
                macd: null,
                signalLine: null,
                histogram: null,
                error: 'No MACD data available'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
        }

        // Get latest MACD values
        const latest = results[0];
        const macdValue = latest.value || 0;
        const signalValue = latest.signal || 0;
        const histogramValue = latest.histogram || 0;

        // Determine signal
        let signal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
        let label = '중립';

        if (histogramValue > 0 && macdValue > signalValue) {
            signal = 'BUY';
            label = '매수신호';
        } else if (histogramValue < 0 && macdValue < signalValue) {
            signal = 'SELL';
            label = '매도신호';
        } else {
            signal = 'NEUTRAL';
            label = '관망';
        }

        // Check for crossover (stronger signal)
        if (results.length >= 2) {
            const prev = results[1];
            const prevHist = prev.histogram || 0;

            // Golden cross: histogram went from negative to positive
            if (prevHist < 0 && histogramValue > 0) {
                signal = 'BUY';
                label = '골든크로스';
            }
            // Dead cross: histogram went from positive to negative
            else if (prevHist > 0 && histogramValue < 0) {
                signal = 'SELL';
                label = '데드크로스';
            }
        }

        return new Response(JSON.stringify({
            ticker,
            signal,
            label,
            macd: Math.round(macdValue * 100) / 100,
            signalLine: Math.round(signalValue * 100) / 100,
            histogram: Math.round(histogramValue * 100) / 100,
            strength: Math.abs(histogramValue) > 1 ? 'STRONG' : 'WEAK'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });

    } catch (error: any) {
        console.error('[MACD API] Error:', error);
        return new Response(JSON.stringify({
            ticker,
            signal: 'NEUTRAL',
            label: '오류',
            macd: null,
            signalLine: null,
            histogram: null,
            error: error.message
        }), {
            status: 200, // Return 200 with error info so UI can handle gracefully
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }
}
