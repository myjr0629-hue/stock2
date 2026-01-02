import { NextResponse } from "next/server";
import { fetchMassive } from "@/services/massiveClient";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get("t") || "NVDA";

    try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        const maxExpiryDate = new Date();
        maxExpiryDate.setDate(maxExpiryDate.getDate() + 35);
        const maxExpiryStr = maxExpiryDate.toISOString().split('T')[0];

        const params: any = {
            limit: '250',
            'expiration_date.gte': todayStr,
            'expiration_date.lte': maxExpiryStr
        };

        console.log(`[Probe] Testing Params for ${ticker}:`, params);

        console.log(`[Probe] Fetching options for ${ticker}...`);
        // We use the exact same client standard
        const res = await fetchMassive(`/v3/snapshot/options/${ticker}`, params, false); // No cache for probe

        const results = res.data?.results || res?.results || [];

        return NextResponse.json({
            status: "OK",
            count: results.length,
            // [Debug] Return FULL results to verify calculation
            sample: results,
            headers: res.headers || "No Headers captured in client",
            rawResKeys: Object.keys(res),
            paramsUsed: params
        });

    } catch (e: any) {
        return NextResponse.json({
            status: "ERROR",
            error: e.message || e.reasonKR || String(e),
            code: e.code,
            details: e.details
        }, { status: 500 });
    }
}
