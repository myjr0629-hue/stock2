// ============================================================================
// 크론 — «내 종목» AI 한 줄 장전 예열 (2026-10-12)
// ----------------------------------------------------------------------------
// 평일 13:20 UTC(뉴욕 09:20 EDT / 08:20 EST, 정규장 전) — 구조 빌드(13:05 UTC) 뒤. 인기 종목(PREWARM_TICKERS, 100종목)의 한 줄을
// 오늘 지형(체인 날짜·레벨·가격의 쪽)으로 만들어 둔다. 이미 같은 지형의 글이 있으면 부르지 않는다(서비스 storedMatchesFacts).
// 그 밖의 종목·장중 변화는 읽기 경로가 «뒤에서» 만든다(/api/watchlist/ai-line).
// ★ 10/13 추가 — 마감 뒤 «체인 날짜가 넘어간 아침» 재예열(vercel.json 21:30·22:45 UTC 평일 · 00:30 UTC 화~토). 같은 크론을 더 부를 뿐 로직은 그대로다.
//   이유(10/13 첫 실행 가치 단계 실측): 장 마감 뒤 EOD 체인(levelsChainDate)이 넘어가면 저장된 글은 «글을 쓸 때의 지형»과 달라져 화면이 그리지 않는다(aiLineState 'stale').
//   예열이 13:20 UTC 하루 한 번뿐이라 한국 낮(06시~22시 KST) 내내 인기 종목 글이 «없음»이었고, 사용자가 stale 알림을 줘야 종목마다 뒤에서 다시 만들었다.
//   같은 지형이면 호출하지 않으므로(storedMatchesFacts) 체인이 아직 안 넘어갔으면 이 실행은 비용 0이다.
// 크레딧으로만(withFreshTier) — 크레딧이 안 되면 건너뛴다. 하루 상한은 서비스가 지킨다.
// 점검(인증된 호출만): ?force=1 (휴장일에도 돌고, 같은 지형이어도 다시 만든다) · ?n=10 (앞 N종목만) · ?t=A,B (그 종목만, 30개까지) · ?detail=1 (만든 글·사실을 응답에)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { PREWARM_TICKERS } from '@/lib/ai/creditPacing';
import { etDateOf, isNonTradingDay } from '@/lib/marketCalendar';
import { generateLines, callsToday, dailyCap } from '@/services/watchlistAiLineService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUDGET_MS = 240_000;

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const q = new URL(req.url).searchParams;
    const force = q.get('force') === '1';
    const t0 = Date.now();
    const today = etDateOf(t0);
    if (!force && isNonTradingDay(today)) return NextResponse.json({ success: true, skipped: 'non-trading-day', today });

    const n = Math.max(1, Math.min(PREWARM_TICKERS.length, Number(q.get('n')) || PREWARM_TICKERS.length));
    const tickers = PREWARM_TICKERS.slice(0, n);
    const detail = q.get('detail') === '1';
    const only = (q.get('t') || '').split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z][A-Z0-9.]{0,6}$/.test(x));
    const r = await generateLines(only.length ? only.slice(0, 30) : tickers, { deadline: t0 + BUDGET_MS, force, detail });
    const count: Record<string, number> = {};
    for (const v of Object.values(r.out)) count[v] = (count[v] || 0) + 1;
    const calls = await callsToday();
    console.log(`[Cron/WatchlistAiLine] ${tickers.length}종목 ${r.ms}ms ${JSON.stringify(count)} 오늘 호출 ${calls}/${dailyCap()}`);
    return NextResponse.json({ success: true, today, tickers: only.length ? only.length : tickers.length, count, out: r.out, callsToday: calls, cap: dailyCap(), ms: r.ms, reasons: r.reasons, ...(detail ? { detail: r.detail } : {}) });
}
