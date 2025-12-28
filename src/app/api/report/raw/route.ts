
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = 'force-dynamic';

/**
 * GET /api/report/raw?runId=...&t=...
 * Serves raw ticker data (including optionsChain) for debugging.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const runId = searchParams.get('runId');
    const ticker = searchParams.get('t');

    if (!runId) {
        return NextResponse.json({ error: "Missing runId" }, { status: 400 });
    }

    try {
        const rawFile = path.join(process.cwd(), 'snapshots', 'raw_options', runId, 'raw_tickers.json');
        if (!fs.existsSync(rawFile)) {
            return NextResponse.json({ error: "Raw data not found for this RunID" }, { status: 404 });
        }

        const data = JSON.parse(fs.readFileSync(rawFile, 'utf-8'));

        if (ticker) {
            const tickerData = data.tickers.find((t: any) => t.symbol === ticker || t.ticker === ticker);
            if (!tickerData) {
                return NextResponse.json({ error: `Ticker ${ticker} not found in raw data` }, { status: 404 });
            }
            return NextResponse.json(tickerData);
        }

        return NextResponse.json(data);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
