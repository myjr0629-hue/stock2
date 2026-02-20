// [PREMIUM] SMA API Endpoint - Golden/Dead Cross Detection (TREND PHASE™)
// Fetches SMA 50/200 from Polygon and calculates cross status
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
        // Fetch SMA 50 and SMA 200 in parallel using fetchMassive (same pattern as MACD API)
        const sma50Url = `${MASSIVE_BASE_URL}/v1/indicators/sma/${ticker}?timespan=day&adjusted=true&window=50&series_type=close&limit=2&apiKey=${MASSIVE_API_KEY}`;
        const sma200Url = `${MASSIVE_BASE_URL}/v1/indicators/sma/${ticker}?timespan=day&adjusted=true&window=200&series_type=close&limit=2&apiKey=${MASSIVE_API_KEY}`;

        const [sma50Data, sma200Data] = await Promise.all([
            fetchMassive(sma50Url, {}, false, undefined, CACHE_POLICY.LIVE),
            fetchMassive(sma200Url, {}, false, undefined, CACHE_POLICY.LIVE)
        ]);

        const sma50Values = sma50Data?.results?.values || [];
        const sma200Values = sma200Data?.results?.values || [];

        if (sma50Values.length === 0 || sma200Values.length === 0) {
            return new Response(JSON.stringify({
                ticker,
                cross: 'UNKNOWN',
                label: '데이터없음',
                sma50: null,
                sma200: null,
                distance: null,
                phase: 'UNKNOWN'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
        }

        const sma50 = sma50Values[0].value;
        const sma200 = sma200Values[0].value;

        // Previous values for cross detection
        const prevSma50 = sma50Values.length > 1 ? sma50Values[1].value : sma50;
        const prevSma200 = sma200Values.length > 1 ? sma200Values[1].value : sma200;

        // Distance between SMA50 and SMA200
        const distance = ((sma50 - sma200) / sma200) * 100;
        const absDistance = Math.abs(distance);

        // Cross detection
        let cross: 'GOLDEN' | 'DEAD' | 'NONE' = 'NONE';
        let label = '';
        let crossType = '';

        if (sma50 > sma200) {
            cross = 'GOLDEN';

            // Check if cross just happened (previous was opposite)
            if (prevSma50 <= prevSma200) {
                crossType = 'NEW'; // Just crossed!
                label = '골든크로스 발생!';
            } else if (absDistance < 0.5) {
                crossType = 'TIGHT';
                label = '골든크로스 유지 (근접)';
            } else {
                crossType = 'ESTABLISHED';
                label = '상승 추세';
            }
        } else if (sma50 < sma200) {
            cross = 'DEAD';

            if (prevSma50 >= prevSma200) {
                crossType = 'NEW';
                label = '데드크로스 발생!';
            } else if (absDistance < 0.5) {
                crossType = 'TIGHT';
                label = '데드크로스 유지 (근접)';
            } else {
                crossType = 'ESTABLISHED';
                label = '하락 추세';
            }
        } else {
            label = '수렴 중';
        }

        // Imminent cross warning
        const isImminent = absDistance < 0.5 && cross !== 'NONE';

        // Trend Phase calculation
        // Uses fetch for current price from snapshot
        let phase = 'NEUTRAL';
        const underlying = sma50Data?.results?.underlying?.url;
        // Simple phase based on SMA relationship + distance
        if (cross === 'GOLDEN') {
            if (distance > 5) phase = 'ACCELERATION';
            else if (distance > 10) phase = 'EUPHORIA';
            else phase = 'MARKUP';
        } else if (cross === 'DEAD') {
            if (distance < -5) phase = 'DECLINE';
            else phase = 'DISTRIBUTION';
        }

        return new Response(JSON.stringify({
            ticker,
            cross,          // GOLDEN | DEAD | NONE
            crossType,      // NEW | TIGHT | ESTABLISHED
            label,
            sma50: Math.round(sma50 * 100) / 100,
            sma200: Math.round(sma200 * 100) / 100,
            distance: Math.round(distance * 100) / 100,  // % distance between SMAs
            isImminent,     // true if within 0.5%
            phase           // MARKUP | ACCELERATION | EUPHORIA | DISTRIBUTION | DECLINE | NEUTRAL
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });

    } catch (error: any) {
        console.error('[SMA API] Error:', error);
        return new Response(JSON.stringify({
            ticker,
            cross: 'UNKNOWN',
            label: '오류',
            sma50: null,
            sma200: null,
            distance: null,
            phase: 'UNKNOWN',
            error: error.message
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }
}
