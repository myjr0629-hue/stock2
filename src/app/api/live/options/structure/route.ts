import { NextRequest, NextResponse } from "next/server";
import { getStructureData, normalizeExpirationsForToday, gateLevels } from "@/services/structureService";
import { getETNow, getETDayOfWeek, toYYYYMMDD_ET } from "@/services/marketDaySSOT";
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { recordGexSnapshot } from "@/lib/aws/historyMiddleware";
import { sanitizeMaxPain } from '@/services/centralDataHub';

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

    // [Phase 2] Record GEX snapshot to DynamoDB (fire-and-forget, non-blocking)
    if (result?.gex?.totalGex !== undefined) {
        recordGexSnapshot(t, {
            gex: result.gex.totalGex,
            gammaFlipLevel: result.gex.gammaFlipLevel,
            callWall: result.gex.callWall,
            putFloor: result.gex.putFloor,
            maxPain: result.gex.maxPain,
            price: result.gex.spotPrice || result.spotPrice || 0,
            gammaState: result.gex.gammaState,
        });
    }

    // 화면·SEO·마케팅 카드가 모두 이 값을 쓴다 — 한 곳에서 같은 게이트를 건다.
    if (result?.gex) {
        const spot = result.gex.spotPrice || (result as any).spotPrice || 0;
        result.gex.maxPain = sanitizeMaxPain(result.gex.maxPain, spot);
    }
    // [2026-09-16] 응답 경계에서 한 번 더 — 어느 캐시 경로로 왔든 오늘(ET) 이전 만기는 나가지 않는다.
    return NextResponse.json(gateStructureExit(normalizeExpirationsForToday(result)));
}

/**
 * ★ [2026-09-29] 이 문의 레벨도 정의 게이트를 거친다(자기 현물 underlyingPrice 기준 — 맥스페인 35% 포함).
 *   위 `result.gex` 블록은 결과에 gex 가 없어 한 번도 돌지 않았다(맥스페인 게이트 미적용). 홈 화면(LiveFeedTicker)·
 *   마케팅 자동 발행(mkt-autopilot xScan)·감사 스크립트가 이 응답을 그대로 쓴다. 다른 문(peek)과 같은 함수 → 같은 결과.
 *   캐시 객체를 바꾸지 않게 복사본을 돌려준다. 위반이 없으면 원래 객체 그대로.
 */
function gateStructureExit(result: any): any {
    if (!result || result.options_status !== 'OK') return result;
    const g = gateLevels({
        maxPain: result.maxPain, callWall: result.levels?.callWall, putFloor: result.levels?.putFloor, gammaFlipLevel: result.gammaFlipLevel,
    }, result.underlyingPrice);
    if (!g.levelsDropped?.length) return result;
    return {
        ...result,
        maxPain: g.maxPain,
        gammaFlipLevel: g.gammaFlipLevel,
        levels: { ...(result.levels || {}), callWall: g.callWall, putFloor: g.putFloor, pinZone: g.maxPain != null ? (result.levels?.pinZone ?? g.maxPain) : null },
        levelsDropped: g.levelsDropped,
    };
}
