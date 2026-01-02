import { NextResponse } from "next/server";
import { CentralDataHub } from "@/services/centralDataHub";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("t") || "META";

    try {
        const data = await CentralDataHub.getUnifiedData(ticker);

        return NextResponse.json({
            ticker,
            price: data.price,
            flow: {
                netPremium: data.flow.netPremium,
                count: data.flow.optionsCount,
                dataSource: data.flow.dataSource || 'N/A',
                rawChainLength: data.flow.rawChain?.length || 0,
                // Scan first 3 raw items to see if they exist
                sample: data.flow.rawChain?.slice(0, 3)
            },
            debug: {
                snapshot_last: data.snapshot?.lastTrade?.p,
                snapshot_prev: data.snapshot?.prevDay?.c
            }
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
    }
}
