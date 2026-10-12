// ============================================================================
// GET /api/watchlist/ai-line?t=NVDA,AAPL&loc=ko[&stale=NVDA] — «내 종목» AI 한 줄 읽기 (2026-10-12)
// ----------------------------------------------------------------------------
//   · 사용자 경로에서 생성을 기다리지 않는다: 저장된 글만 준다(EC2 레디스 mget 한 번). 없거나 화면이 «지형이 바뀌었다»(stale)고
//     알린 종목은 응답을 보낸 «뒤»(after) 만든다 — 다음 읽기부터 보인다. 화면은 pending 이 있으면 몇 초 뒤 한 번 더 묻는다.
//   · 응답의 글에는 자리표({MP}…)가 들어 있다 — 화면이 지금 가격으로 채운다(lib/app/watchlistAiLine.fillAiLine).
//   · 한 번에 50종목까지 · 뒤에서 만드는 것은 요청당 12종목까지(나머지는 다음 읽기) · 하루 상한·잠금·쉬기는 서비스가 지킨다.
//   · 끄기: 레디스 wlai:off(재배포 없이) 또는 WL_AI_LINE_OFF=1 → 빈 응답(화면은 줄을 그리지 않는다).
// ============================================================================
import { NextResponse, after } from 'next/server';
import { aiLineOff, entryOf, generateLines, readLines, WL_AI_REGEN_MIN_AGE_MS } from '@/services/watchlistAiLineService';
import type { AiLineEntry, AiLineLocale } from '@/lib/app/watchlistAiLine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TICKER = /^[A-Z][A-Z0-9.]{0,6}$/;
const MAX_TICKERS = 50;
const MAX_BG = 12;
const READ_BUDGET_MS = 2_500;

const list = (s: string | null) => [...new Set(String(s || '').split(',').map((x) => x.trim().toUpperCase()).filter((x) => TICKER.test(x)))];

export async function GET(request: Request) {
    const q = new URL(request.url).searchParams;
    const locRaw = q.get('loc');
    const loc: AiLineLocale = locRaw === 'ko' || locRaw === 'ja' ? locRaw : 'en';
    const tickers = list(q.get('t')).slice(0, MAX_TICKERS);
    const headers = { 'Cache-Control': 'no-store' };
    if (aiLineOff() || !tickers.length) return NextResponse.json({ lines: {}, pending: [], off: aiLineOff() || undefined }, { headers });

    const staleHint = new Set(list(q.get('stale')));
    const now = Date.now();
    // 저장소가 멈춰도 응답을 붙잡지 않는다 — 2.5초 안에 못 읽으면 빈 응답(줄 없음 · 생성도 걸지 않는다)
    const read = await Promise.race([
        readLines(tickers),
        new Promise<null>((r) => setTimeout(() => r(null), READ_BUDGET_MS)),
    ]);
    if (!read) return NextResponse.json({ lines: {}, pending: [], slow: true }, { headers });
    const { lines: stored, failed, off } = read;
    if (off) return NextResponse.json({ lines: {}, pending: [], off: true }, { headers });
    const lines: Record<string, AiLineEntry | null> = {};
    const need: string[] = [];
    for (const t of tickers) {
        const s = stored[t];
        lines[t] = entryOf(s, loc);
        if (failed.has(t)) continue;                                           // 최근에 못 만든 종목(사실 부족·가드·크레딧) — 쉬는 중
        if (!s || (staleHint.has(t) && now - s.at > WL_AI_REGEN_MIN_AGE_MS)) need.push(t);
    }
    const bg = need.slice(0, MAX_BG);
    if (bg.length) {
        after(async () => {
            try {
                const r = await generateLines(bg, { deadline: Date.now() + 45_000 });
                console.log(`[watchlist/ai-line] 뒤에서 생성 ${bg.length}종목 ${r.ms}ms ${JSON.stringify(r.out)}`);
            } catch (e) { console.warn('[watchlist/ai-line] 생성 실패:', (e as Error)?.message); }
        });
    }
    return NextResponse.json({ lines, pending: bg }, { headers });
}
