import { NextRequest, NextResponse } from "next/server";
import { getStructureData, normalizeExpirationsForToday, displayLevels, levelsFromStructure } from "@/services/structureService";
import { getETNow, getETDayOfWeek, toYYYYMMDD_ET } from "@/services/marketDaySSOT";
import { fetchMassive, CACHE_POLICY } from "@/services/massiveClient";
import { recordGexSnapshot } from "@/lib/aws/historyMiddleware";
import { mgetFromCache } from "@/services/redisClient";
import { getOptionChainSnapshotIntrinio } from "@/services/intrinioClient";
import { etTradingDateOf } from "@/lib/marketCalendar";
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
    // 체인 판본 진단(미리보기 전용 — 운영에서는 꺼져 있다): 프로브를 누가 언제 썼고, 벤더 «최신»·«날짜 지정» 체인이 며칠 자인지.
    if (req.nextUrl.searchParams.get('diag') === 'vintage' && process.env.VERCEL_ENV !== 'production') {
        return NextResponse.json(await vintageDiag(t.toUpperCase(), req.nextUrl.searchParams.get('date')));
    }

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

/** 체인 판본 진단 — 계약별 EOD 날짜 분포·OI 합(미리보기 전용, 읽기만). */
async function vintageDiag(T: string, dateParam: string | null): Promise<any> {
    const sum = (rows: any[]) => {
        const dates: Record<string, number> = {}; let oi = 0;
        for (const c of rows || []) { const d = c?._intrinio?.date || 'none'; dates[d] = (dates[d] || 0) + 1; oi += Number(c?.open_interest) || 0; }
        return { n: (rows || []).length, oiSum: oi, dates };
    };
    const [probe, meta, v2] = await mgetFromCache<any>([`polygon:snapshot:probe:${T}`, `polygon:snapshot:probe:meta:${T}`, `structure:v2:${T}`]).catch(() => [null, null, null]);
    const exp = probe?.weeklyExpiry || v2?.data?.expiration || null;
    // 직전 완결 세션(오늘이 거래일이면 그 전 거래일)
    const today = etTradingDateOf(Date.now());
    const prev = dateParam || etTradingDateOf(Date.parse(today + 'T12:00:00Z') - 86400000);
    const noDate = exp ? await getOptionChainSnapshotIntrinio(T, { expiration: exp }).catch((e: any) => ({ error: String(e?.message || e) })) : null;
    const withDate = exp ? await getOptionChainSnapshotIntrinio(T, { expiration: exp, date: prev }).catch((e: any) => ({ error: String(e?.message || e) })) : null;
    const probeOi = (probe?.exactResults || []).reduce((a: number, c: any) => a + (Number(c?.open_interest) || 0), 0);
    return {
        ticker: T, expiration: exp, today, prev,
        probe: probe ? { source: probe._source ?? null, ts: probe._ts ?? null, ageSec: probe._ts ? Math.round((Date.now() - probe._ts) / 1000) : null, chainDate: probe.chainDate ?? null,
            chainDates: probe.chainDates ?? null, weeklyExpiry: probe.weeklyExpiry, n: (probe.exactResults || []).length, oiSum: probeOi } : null,
        meta,
        version: v2 ? { asOf: v2.timestamp, chainDate: v2.data?.chainDate ?? null, src: v2.data?.debug?.chainSource ?? null, probeSource: v2.data?.debug?.probeSource ?? null } : null,
        vendorLatest: noDate && !(noDate as any).error ? sum((noDate as any).results) : noDate,
        vendorDated: withDate && !(withDate as any).error ? { date: prev, ...sum((withDate as any).results) } : withDate,
    };
}

/**
 * ★ [2026-09-29 · 09-30] 이 문도 다른 문과 같은 함수(displayLevels)로 레벨을 낸다 — 판본(getStructureData = 모든 문과 같은 읽기)의
 *   기준가(underlyingPrice = S0) 그대로라 재선택·가림이 일어나지 않아야 한다(일어나면 levelsReselected/levelsDropped 로 드러난다).
 *   홈 화면(LiveFeedTicker)·마케팅 자동 발행(mkt-autopilot xScan)·감사 스크립트가 이 응답을 그대로 쓴다.
 *   캐시 객체를 바꾸지 않게 복사본을 돌려준다.
 */
function gateStructureExit(result: any): any {
    if (!result || result.options_status !== 'OK') return result;
    const d = displayLevels(levelsFromStructure(result), result.underlyingPrice, 'structure');
    return {
        ...result,
        maxPain: d.maxPain,
        gammaFlipLevel: d.gammaFlipLevel,
        levels: { ...(result.levels || {}), callWall: d.callWall, putFloor: d.putFloor, pinZone: d.pinZone },
        levelsDropped: d.levelsDropped,
        levelsReselected: d.levelsReselected,
    };
}
