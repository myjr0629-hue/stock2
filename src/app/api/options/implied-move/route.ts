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
 *   장외 EOD 값은 세션과 함께 싣는다. 만기는 레벨과 같은 마감 기준으로 굴린다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readImpliedMoveRows, type ImpliedTiming } from '@/services/impliedMoveService';
import { IMPLIED_MOVE_DEF } from '@/lib/impliedMove';
import { etDateOf, etMinutesOf, sessionCloseMinutes } from '@/lib/marketCalendar';

export const dynamic = 'force-dynamic';

const MAX_TICKERS = 10;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;
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
    const timing: ImpliedTiming = timingRaw === 'amc' || timingRaw === 'bmo' || timingRaw === 'dmh' ? timingRaw : 'unknown';

    const results = await readImpliedMoveRows(tickers.map((ticker) => ({ ticker, after, timing })));
    // 마감 직전 응답의 CDN stale 창도 만기를 넘지 않게 한다.
    const now = Date.now();
    const today = etDateOf(now);
    const secondsLeft = (sessionCloseMinutes(today) - etMinutesOf(now)) * 60 - (now % 60_000) / 1000;
    const budget = results.some((r) => r.expiry === today) ? Math.max(0, Math.floor(secondsLeft) - 1) : 180;
    const maxAge = Math.min(60, budget);
    const stale = Math.min(120, budget - maxAge);

    return NextResponse.json(
        {
            results,
            meta: {
                def: IMPLIED_MOVE_DEF,
                definition: 'ATM straddle (call + put mid at the strike nearest the price, same strike both legs) ÷ price, nearest expiry (or first expiry after `after`). Live mids in the regular session; otherwise the closing mid of the last session (basis eod, session = that date).',
                after: after ?? null,
                timing: after ? timing : null,
                generatedAt: Date.now(),
            },
        },
        { headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${stale}` } },
    );
}
