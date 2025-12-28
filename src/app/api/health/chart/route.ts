
import { NextResponse } from 'next/server';
import { getBuildMeta } from '@/services/buildMeta';

// [S-55.2] Chart SSOT Guardrail
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'NVDA';

    // [Integration] Use the actual API endpoint for verification (E2E style)
    // This ensures we test exactly what the user sees
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const apiUrl = `${protocol}://${host}/api/chart?symbol=${symbol}&range=1d`;

    try {
        const res = await fetch(apiUrl, { cache: 'no-store' });
        if (!res.ok) {
            throw new Error(`API call failed: ${res.statusText}`);
        }

        const result = await res.json();
        // Unwrap response structure { data, meta, ... }
        const data = Array.isArray(result) ? result : (result.data || []);
        const meta = result.meta || {};

        if (!Array.isArray(data) || data.length === 0) {
            return NextResponse.json({
                status: 'FAIL',
                reason: 'NO_DATA',
                symbol,
                apiUrl,
                debug: {
                    metaBaseDate: meta.sessionMaskDebug?.baseDateET
                }
            }, { status: 200 });
        }

        // [Guardrail 1] ET Minute Range (04:00 - 20:00)
        // 04:00 ET = 4 * 60 = 240
        // 19:59 ET = 1199, 20:00 ET = 1200
        const etMinutes = data.map((d: any) => d.etMinute).filter((m: any) => typeof m === 'number');
        const minMinute = Math.min(...etMinutes);
        const maxMinute = Math.max(...etMinutes);

        const isRangeValid = minMinute >= 240 && maxMinute <= 1200;

        // [Guardrail 2] Base Date SSOT
        const baseDateET = meta.sessionMaskDebug?.baseDateET;
        const hasBaseDate = !!baseDateET;

        // [Guardrail 3] Session Validity
        const invalidSessions = data.filter((d: any) => !['PRE', 'REG', 'POST'].includes(d.session));
        const hasInvalidSessions = invalidSessions.length > 0;

        // [Guardrail 4] Data Points Count
        const count = data.length;

        const status = isRangeValid && hasBaseDate && !hasInvalidSessions ? 'OK' : 'FAIL';

        return NextResponse.json({
            status,
            guardrails: {
                range: isRangeValid ? 'PASS' : 'FAIL',
                baseDate: hasBaseDate ? 'PASS' : 'FAIL',
                session: !hasInvalidSessions ? 'PASS' : 'FAIL'
            },
            metrics: {
                minEtMinute: minMinute, // Should be >= 240
                maxEtMinute: maxMinute, // Should be <= 1200
                baseDateET,
                dataCount: count,
                invalidSessionCount: invalidSessions.length
            },
            meta: {
                symbol,
                range: '1d',
                buildId: getBuildMeta().buildId,
                checkedUrl: apiUrl
            }
        });

    } catch (error: any) {
        return NextResponse.json({
            status: 'ERROR',
            message: error.message,
            apiUrl
        }, { status: 500 });
    }
}
