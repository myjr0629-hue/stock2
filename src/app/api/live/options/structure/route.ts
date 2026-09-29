import { NextRequest, NextResponse } from "next/server";
import { getStructureData, normalizeExpirationsForToday, displayLevels, levelsFromStructure } from "@/services/structureService";
import { mgetFromCache, getFromCache } from "@/services/redisClient";
import { getOptionChainSnapshotIntrinio, intrinioOptionsDiagGet, intrinioOptionsBulkHeadDiag } from "@/services/intrinioClient";
import { etTradingDateOf } from "@/lib/marketCalendar";

export const revalidate = 0; // Force dynamic (User Request)

export async function GET(req: NextRequest) {
    const t = req.nextUrl.searchParams.get('t');
    const requestedExp = req.nextUrl.searchParams.get('exp');

    if (!t) return NextResponse.json({ error: "Missing ticker" }, { status: 400 });
    // 체인 판본 진단(미리보기 전용 — 운영에서는 꺼져 있다): 프로브를 누가 언제 썼고, 벤더 «최신»·«날짜 지정» 체인이 며칠 자인지.
    if (req.nextUrl.searchParams.get('diag') === 'vintage' && process.env.VERCEL_ENV !== 'production') {
        return NextResponse.json(await vintageDiag(t.toUpperCase(), req.nextUrl.searchParams.get('date')));
    }
    // EC2 수집기(scripts/intrinio-options-eod.js, 03:00 ET 판 벌크)가 Redis 에 둔 계약별 OI — 그 종목·만기만 요약(미리보기 전용).
    //   벌크의 OPEN_INTEREST 가 «다음 날 OI»(그날 마감 포지션 = OCC 다음 날 아침 공표)인지 API 레코드(그날 아침 공표)인지 가린다.
    if (req.nextUrl.searchParams.get('diag') === 'bulkoi' && process.env.VERCEL_ENV !== 'production') {
        const T = t.toUpperCase(); const exp = String(req.nextUrl.searchParams.get('exp') || '');
        const raw: any = await getFromCache<any>('intrinio:options:oi').catch(() => null);
        const v: any = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const prefix = (T + '______').slice(0, 6) + exp.replace(/-/g, '').slice(2);
        const rows: Record<string, { c: number; p: number }> = {}; let n = 0, sum = 0;
        for (const [k, oi] of Object.entries<any>(v?.oi || {})) {
            if (!k.startsWith(prefix)) continue;
            const m = /([CP])(\d{8})$/.exec(k); if (!m) continue;
            const strike = Number(m[2]) / 1000; const e = rows[strike] || (rows[strike] = { c: 0, p: 0 });
            if (m[1] === 'C') e.c += Number(oi) || 0; else e.p += Number(oi) || 0; n++; sum += Number(oi) || 0;
        }
        return NextResponse.json({ build: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 9), date: v?.date ?? null, totalContracts: Object.keys(v?.oi || {}).length, prefix, n, oiSum: sum, rows });
    }
    // 벌크 «Options EOD» 파일의 열 이름(다음 날 OI 같은 열이 있는가) — 미리보기 전용
    if (req.nextUrl.searchParams.get('diag') === 'bulkhead' && process.env.VERCEL_ENV !== 'production') {
        try { return NextResponse.json({ build: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 9), ...(await intrinioOptionsBulkHeadDiag()) }); }
        catch (e: any) { return NextResponse.json({ error: String(e?.message || e) }, { status: 500 }); }
    }
    // 벤더 원문(options/ 만, 미리보기 전용) — 날짜별 EOD 체인·실시간 체인에 미결제약정이 있는지 직접 본다. 큰 배열은 요약.
    if (req.nextUrl.searchParams.get('diag') === 'raw' && process.env.VERCEL_ENV !== 'production') {
        const p = String(req.nextUrl.searchParams.get('path') || '');
        const qp: Record<string, string> = {};
        req.nextUrl.searchParams.forEach((v, k) => { if (!['t', 'diag', 'path'].includes(k)) qp[k] = v; });
        try {
            const j = await intrinioOptionsDiagGet(p, qp);
            const summarize = (arr: any[]) => {
                const oiKeys = new Map<string, number>(); let oiSum = 0; const dates: Record<string, number> = {};
                for (const row of arr || []) {
                    const flat = JSON.stringify(row);
                    for (const m of flat.matchAll(/"([a-z_]*open_interest[a-z_]*)":(\d+(?:\.\d+)?)/g)) { oiKeys.set(m[1], (oiKeys.get(m[1]) || 0) + 1); if (m[1] === 'open_interest') oiSum += Number(m[2]); }
                    const d = row?.prices?.date || row?.price?.date || row?.date; if (d) dates[d] = (dates[d] || 0) + 1;
                }
                return { n: (arr || []).length, oiKeys: Object.fromEntries(oiKeys), oiSum, dates, sample: (arr || []).slice(0, 2) };
            };
            const arrKey = Object.keys(j || {}).find((k) => Array.isArray((j as any)[k]));
            // 배열이 없는 응답(계약 하나의 가격 등)은 최상위 필드 이름과 앞부분을 그대로 — 필드 목록을 보려는 것이다
            return NextResponse.json({ build: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 9), path: p, params: qp, keys: Object.keys(j || {}), next_page: (j as any)?.next_page ?? null,
                [arrKey || 'none']: arrKey ? summarize((j as any)[arrKey]) : null, ...(arrKey ? {} : { head: JSON.stringify(j).slice(0, 1500) }) });
        } catch (e: any) { return NextResponse.json({ path: p, error: String(e?.message || e) }, { status: 500 }); }
    }

    const result = await getStructureData(t, requestedExp);

    // ★ [2026-09-27] 여기 있던 `result.gex` 블록(GEX 이력 저장 + 맥스페인 35% 게이트)과 쓰이지 않던
    //   보조 함수·캐시(getNextTradingDayET·fetchMassiveWithRetry·structureCache)를 지웠다.
    //   getStructureData 는 `gex` 를 돌려준 적이 없어 한 번도 실행되지 않은 코드였다. 되살리지 않은 이유:
    //   · GEX_HISTORY(DynamoDB)는 수집 Lambda 가 이미 채운다 — 여기서 쓰면 정의가 다른 생산자가 하나 더 생긴다.
    //   · 맥스페인 ±35%(sanitizeMaxPain)는 [2026-09-30] 계산 자체의 정의가 됐다(범위 밖 = 판본에 null, debug.maxPainOutOfBand).
    //     그래서 이 문도 다른 문과 같은 함수(아래 gateStructureExit)로 나간다 — 판본 기준가 그대로라 값은 바뀌지 않는다.
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
