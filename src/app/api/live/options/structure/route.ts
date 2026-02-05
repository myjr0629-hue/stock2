import { NextRequest, NextResponse } from "next/server";
import { getStructureData } from "@/services/structureService";
import { getETNow, getETDayOfWeek, toYYYYMMDD_ET } from "@/services/marketDaySSOT";
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";

export const revalidate = 0; // Force dynamic (User Request)

// [S-69] Get next valid trading day for options expiration (skips weekends)
function getNextTradingDayET(): string {
    const nowET = getETNow();
    const dow = getETDayOfWeek(nowET);

    // If Saturday, next trading day is Monday (+2)
    // If Sunday, next trading day is Monday (+1)
    // Otherwise, today or next weekday
    const result = new Date(nowET);

    if (dow === 6) {
        // Saturday -> Monday
        result.setDate(result.getDate() + 2);
    } else if (dow === 0) {
        // Sunday -> Monday
        result.setDate(result.getDate() + 1);
    }
    // Weekdays: use today (options can expire today or later)

    return toYYYYMMDD_ET(result);
}

async function fetchMassiveWithRetry(url: string, maxAttempts = 3): Promise<any> {
    const start = Date.now();
    let lastError: string = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const data = await fetchMassive(url, {}, false, undefined, CACHE_POLICY.LIVE);
            return { data, latency: Date.now() - start, success: true, attempts: attempt };
        } catch (e: any) {
            lastError = e.message;
            console.log(`[RETRY] Attempt ${attempt}/${maxAttempts} failed for ${url.slice(0, 60)}...: ${e.message}`);
            if (attempt < maxAttempts) {
                // Exponential backoff: 200ms, 400ms, 800ms...
                await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, attempt - 1)));
            }
        }
    }
    return { success: false, error: lastError, attempts: maxAttempts };
}

// [DATA CONSISTENCY] Cache for 60 seconds to ensure stable values
interface CachedResult {
    data: any;
    timestamp: number;
}
const structureCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export async function GET(req: NextRequest) {
    const t = req.nextUrl.searchParams.get('t');
    const requestedExp = req.nextUrl.searchParams.get('exp');

    if (!t) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });

    const result = await getStructureData(t, requestedExp);
    return NextResponse.json(result);
}
