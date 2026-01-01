
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    const apiKey = process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";

    if (!apiKey) {
        return NextResponse.json({ error: "MASSIVE_API_KEY is missing in env" }, { status: 500 });
    }

    const ticker = "NVDA";
    const url = `https://api.polygon.io/v1/open-close/${ticker}/2025-12-31?adjusted=true&apiKey=${apiKey}`;

    try {
        const start = Date.now();
        console.log(`[RawProbe] Fetching: ${url.replace(apiKey, '***')}`);

        const res = await fetch(url, { cache: 'no-store' });
        const elapsed = Date.now() - start;

        const status = res.status;
        const statusText = res.statusText;

        let data = null;
        let text = "";

        try {
            text = await res.text();
            data = JSON.parse(text);
        } catch (e: any) {
            data = { rawText: text, jsonError: e.message };
        }

        return NextResponse.json({
            test: "Raw Connection Probe",
            target: ticker,
            url: url.replace(apiKey, 'HIDDEN'),
            elapsedMs: elapsed,
            httpStatus: status,
            httpStatusText: statusText,
            responsePreview: data
        });

    } catch (e: any) {
        return NextResponse.json({
            error: "Fetch Failed",
            details: e.message,
            stack: e.stack
        }, { status: 500 });
    }
}
