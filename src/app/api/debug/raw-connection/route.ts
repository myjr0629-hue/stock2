
import { NextResponse } from 'next/server';
import { requireDebugAuth } from '@/lib/debugAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
    // [SECURITY] Block unauthenticated access
    const authError = requireDebugAuth();
    if (authError) return authError;

    const apiKey = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "";

    if (!apiKey) {
        return NextResponse.json({ error: "API key missing" }, { status: 500 });
    }

    const ticker = "NVDA";
    const url = `https://api.polygon.io/v1/open-close/${ticker}/2025-12-31?adjusted=true&apiKey=${apiKey}`;

    try {
        const start = Date.now();
        const res = await fetch(url, { cache: 'no-store' });
        const elapsed = Date.now() - start;

        let data = null;
        try {
            const text = await res.text();
            data = JSON.parse(text);
        } catch (e: any) {
            data = { error: e.message };
        }

        return NextResponse.json({
            test: "Connection Probe",
            elapsedMs: elapsed,
            httpStatus: res.status,
            responsePreview: data
        });

    } catch (e: any) {
        return NextResponse.json({
            error: "Fetch Failed",
            details: e.message
        }, { status: 500 });
    }
}
