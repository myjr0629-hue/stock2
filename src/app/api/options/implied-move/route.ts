/**
 * GET /api/options/implied-move?tickers=MU,NVDA[&after=YYYY-MM-DD&timing=amc|bmo|dmh|unknown]
 *
 * ★ [2026-09-29] 예상 변동(ATM 스트래들 ÷ 현물) «읽기 전용» 문 — 워치리스트 실적 칩 등이 쓴다.
 *   정의는 src/lib/impliedMove.ts 한 곳뿐이다(가장 가까운 만기 · 현물에 가장 가까운 행사가 하나 · 실시간 중간값).
 *
 *   · 기본: 구조 한 벌(structureService 가 이미 계산해 저장한 주간 만기 impliedMove)을 읽는다.
 *   · after(실적일 등): 그 뒤 «첫 만기»가 주간 만기와 다르면 수집기 체인 캐시(polygon:snapshot:probe:*, 0~35 DTE)에서
 *     그 만기의 스트래들을 계산한다. amc·unknown = 실적일 «다음» 만기부터, bmo·dmh = 실적일 당일 만기부터.
 *
 * ⛔ 부작용 없음: 벤더(Intrinio) 호출 0 · Redis 쓰기 0(EC2·Upstash 모두) · 구조 재계산 0.
 *   저장본이 없으면 계산을 부르지 않고 null 로 답한다(없으면 없음). 읽기는 EC2 mget 두 번이 전부다
 *   (구조 사본 2키 × 종목, 필요할 때만 수집기 체인 1키 × 종목). CDN 캐시 60초로 같은 질문을 흡수한다.
 *   화면용이므로 실시간 중간값만 싣는다 — 전일(EOD) 값은 impliedMovePct 에 넣지 않고 basis 로만 밝힌다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { mgetFromCache } from '@/services/redisClient';
import { structureRedisKey, structureLastGoodKey } from '@/services/structureService';
import {
    IMPLIED_MOVE_DEF, atmStraddleImpliedMove, etDateString, impliedMoveFields,
    type ImpliedMove, type ImpliedMoveBasis,
} from '@/lib/impliedMove';

export const dynamic = 'force-dynamic';

const MAX_TICKERS = 10;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;
type Timing = 'amc' | 'bmo' | 'dmh' | 'unknown';

interface Row {
    ticker: string;
    impliedMovePct: number | null;
    expiry: string | null;
    asOf: number | null;
    basis: ImpliedMoveBasis | null;
    strike: number | null;
    straddle: number | null;
    spot: number | null;
    source: 'structure' | 'probe' | null;
    /** 값이 없을 때 이유(no_snapshot · no_expiry_after · not_live · no_straddle) */
    reason: string | null;
}

function rowOf(ticker: string, im: ImpliedMove | null, source: Row['source'], reason: string | null): Row {
    const live = impliedMoveFields(im);
    return {
        ticker,
        impliedMovePct: live.impliedMovePct,
        expiry: im?.expiry ?? null,
        asOf: live.impliedMoveAsOf,
        basis: im?.basis ?? null,
        strike: live.impliedMovePct != null ? im!.strike : null,
        straddle: live.impliedMovePct != null ? im!.straddle : null,
        spot: im?.spot ?? null,
        source: im ? source : null,
        reason: live.impliedMovePct != null ? null : (im ? 'not_live' : reason),
    };
}

/** 구조 사본 두 벌(신선본·마지막 정상본) 중 늦게 계산됐고 만기가 지나지 않은 것 */
function freshestStructure(a: any, b: any, today: string): any | null {
    const cands = [a, b]
        .filter((v) => v?.data && !(typeof v.data.expiration === 'string' && v.data.expiration < today))
        .sort((x, y) => (Number(y.timestamp) || 0) - (Number(x.timestamp) || 0));
    return cands[0]?.data ?? null;
}

function firstExpiryAfter(exps: string[], date: string, timing: Timing): string | null {
    const sameDayOk = timing === 'bmo' || timing === 'dmh';
    return exps.filter((e) => ISO_DATE.test(e)).sort().find((e) => (sameDayOk ? e >= date : e > date)) ?? null;
}

export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const tickers = Array.from(new Set(
        (sp.get('tickers') || sp.get('t') || '').split(',').map((t) => t.trim().toUpperCase()).filter((t) => TICKER.test(t)),
    ));
    if (!tickers.length) return NextResponse.json({ error: 'tickers required (comma-separated)' }, { status: 400 });
    if (tickers.length > MAX_TICKERS) return NextResponse.json({ error: `max ${MAX_TICKERS} tickers` }, { status: 400 });
    const after = sp.get('after');
    if (after && !ISO_DATE.test(after)) return NextResponse.json({ error: 'after must be YYYY-MM-DD' }, { status: 400 });
    const timingRaw = (sp.get('timing') || 'unknown').toLowerCase();
    const timing: Timing = timingRaw === 'amc' || timingRaw === 'bmo' || timingRaw === 'dmh' ? timingRaw : 'unknown';

    const today = etDateString();
    const results: Row[] = [];
    let structureVals: any[] = [];
    try {
        structureVals = await mgetFromCache<any>(tickers.flatMap((t) => [structureRedisKey(`${t}:auto`), structureLastGoodKey(`${t}:auto`)]));
    } catch {
        structureVals = [];
    }

    const needProbe: Array<{ ticker: string; expiry: string; spot: number }> = [];
    tickers.forEach((t, i) => {
        const st = freshestStructure(structureVals[2 * i], structureVals[2 * i + 1], today);
        if (!st) { results.push(rowOf(t, null, null, 'no_snapshot')); return; }
        const weeklyIm: ImpliedMove | null = st.impliedMove?.def === IMPLIED_MOVE_DEF ? st.impliedMove : null;
        if (!after) { results.push(rowOf(t, weeklyIm, 'structure', 'no_straddle')); return; }
        const exps: string[] = Array.isArray(st.availableExpirations) ? st.availableExpirations : [];
        const want = firstExpiryAfter(exps, after, timing);
        if (!want) { results.push(rowOf(t, null, null, 'no_expiry_after')); return; }
        if (weeklyIm && weeklyIm.expiry === want) { results.push(rowOf(t, weeklyIm, 'structure', null)); return; }
        const spot = Number(st.underlyingPrice);
        if (!(spot > 0)) { results.push(rowOf(t, null, null, 'no_snapshot')); return; }
        needProbe.push({ ticker: t, expiry: want, spot });
        results.push(rowOf(t, null, null, 'no_straddle'));   // 아래에서 채운다
    });

    if (needProbe.length) {
        let probes: any[] = [];
        try {
            probes = await mgetFromCache<any>(needProbe.map((n) => `polygon:snapshot:probe:${n.ticker}`));
        } catch {
            probes = [];
        }
        needProbe.forEach((n, i) => {
            const pc = probes[i];
            const chain = Array.isArray(pc?.probeResults) ? pc.probeResults : [];
            const im = chain.length
                ? atmStraddleImpliedMove(chain, n.spot, {
                    expiry: n.expiry,
                    quotesLive: pc?.greeksSource === 'realtime',
                    quotesAt: Number(pc?._ts) || null,
                })
                : null;
            const at = results.findIndex((r) => r.ticker === n.ticker);
            results[at] = rowOf(n.ticker, im, 'probe', chain.length ? 'no_straddle' : 'no_snapshot');
        });
    }

    return NextResponse.json(
        {
            results,
            meta: {
                def: IMPLIED_MOVE_DEF,
                definition: 'ATM straddle (call + put mid at the strike nearest the price, same strike both legs) ÷ price, nearest expiry (or first expiry after `after`). Live mids only.',
                after: after ?? null,
                timing: after ? timing : null,
                generatedAt: Date.now(),
            },
        },
        { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
    );
}
