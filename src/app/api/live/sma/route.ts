// [PREMIUM] SMA API Endpoint - Golden/Dead Cross Detection (TREND PHASE™)
// V8: DynamoDB-first pattern — Lambda pre-calculates SMA 50/200 every 5 min
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
        // ====== V8: DynamoDB-first — check if Lambda already has SMA data ======
        let sma50: number | null = null;
        let sma200: number | null = null;
        let prevSma50: number | null = null;
        let prevSma200: number | null = null;
        let dynamoSource = false;
        let dynamoCross: 'GOLDEN' | 'DEAD' | 'NONE' = 'NONE';
        let dynamoCrossType: string = '';
        let dynamoLabel: string = '';
        let dynamoPhase: string = '';

        try {
            const { getLatestPrice, isDataFresh } = await import('@/lib/aws/dynamoDataProvider');
            const dynData = await getLatestPrice(ticker) as any;
            if (dynData?.sma50 && dynData?.sma200 && isDataFresh(dynData.date)) {
                sma50 = dynData.sma50;
                sma200 = dynData.sma200;
                prevSma50 = dynData.prevSma50 || sma50; // Use current if prev not available
                prevSma200 = dynData.prevSma200 || sma200; // Use current if prev not available
                dynamoCross = dynData.cross || 'NONE';
                dynamoCrossType = dynData.crossType || '';
                dynamoLabel = dynData.label || '';
                dynamoPhase = dynData.phase || '';
                dynamoSource = true;
            }
        } catch (e) {
            console.warn(`DynamoDB lookup failed for ${ticker}:`, e);
        }

        // ====== Polygon fallback if DynamoDB doesn't have SMA ======
        if (!sma50 || !sma200) {
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

            sma50 = sma50Values[0].value;
            sma200 = sma200Values[0].value;

            // Previous values for cross detection
            prevSma50 = sma50Values.length > 1 ? sma50Values[1].value : sma50;
            prevSma200 = sma200Values.length > 1 ? sma200Values[1].value : sma200;
        }

        // Ensure sma50 and sma200 are numbers for calculations
        if (sma50 === null || sma200 === null || prevSma50 === null || prevSma200 === null) {
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
        let phase = 'NEUTRAL';
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
