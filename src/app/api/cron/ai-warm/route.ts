// ============================================================================
// AI 캐시 예열 — 「30초 기다리는 AI」를 「0.6초에 뜨는 AI」로.
// ----------------------------------------------------------------------------
// 실측 (2026-09-10, 프로덕션 · 인기 종목 9개 · /api/command/deep-analysis):
//
//   NVDA  0.75s  적중        AAPL  37.17s  미적중
//   TSLA  0.61s  적중        MSFT  37.21s  미적중
//   GOOGL 0.61s  적중        AMZN  28.76s  미적중
//                            META  29.79s  미적중
//                            SPY   30.77s  미적중
//                            QQQ   17.60s  미적중
//
//   → 9개 중 6개 미적중. 앱의 «간판» 기능을 누른 사용자 셋 중 둘이
//     **17~37초**를 기다린다. 광고를 보고 연 칸이면 더 나쁘다.
//
// 왜 지금 할 수 있나 — Bedrock 스로틀을 8.3배에서 0.1배로 내리면서
// 시간당 약 400콜의 여유가 생겼다(사용 200 / 상한 600). 이 예열은 그 중
// 약 15% 를 쓴다.
//
// ⚠️ 병렬로 쏘지 않는다.
//   bedrockRateLimit 은 «한 프로세스 안»에서만 작동한다. 여기서 HTTP 로 부르면
//   호출마다 다른 인스턴스가 뜨므로 제한기에 보이지 않는다(그 파일의 경고 그대로).
//   크론이 만드는 버스트는 크론이 줄여야 한다 → **순차 + 최소 간격**.
//
// 낭비하지 않는 방법 — 라우트에게 물어본다.
//   캐시가 살아 있으면 라우트가 `fromCache: true` 로 0.6초 만에 답하고
//   Bedrock 콜은 0건이다. 그러니 «신선도를 여기서 다시 계산»할 필요가 없다.
//   그냥 부르고, 미적중이 나오면 그때 생성 비용이 든다.
//   커서를 Redis 에 두고 매번 «이어서» 돈다 — 한 번에 다 돌 필요가 없다.
// ============================================================================
import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 앞 9개는 앱 칩에 뜨는 순서 그대로(cmd/flow 의 POPULAR_TICKERS).
 * 뒤 7개는 차트 예열 목록에 이미 들어 있는 «그다음으로 많이 눌리는» 종목이다.
 *
 * ★ [2026-09-10] 9 → 16 으로 넓혔다.
 *   칩 9개만 데워도 «칩 밖» 종목을 누른 사용자는 여전히 30초를 기다린다.
 *   비용은 여유 안에 있다: 커서가 한 바퀴 도는 데 시간이 더 걸릴 뿐,
 *   생성 횟수 자체는 캐시 TTL 이 정한다(만료된 것만 다시 만든다).
 */
const TICKERS = [
    'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'SPY', 'QQQ',
    'AMD', 'MU', 'AVGO', 'PLTR', 'NFLX', 'COIN', 'IWM',
];

/** 앱 화면이 실제로 읽는 AI 라우트 둘. */
const ROUTES = [
    { key: 'flow', path: '/api/flow/ai-analysis' },   // 플로우 «AI 상세 시나리오»
    { key: 'cmd', path: '/api/command/deep-analysis' }, // 커맨드 «심층 분석»
] as const;

const CURSOR_KEY = 'ai-warm:cursor';
/** 라우트 예산 60초. 새 호출을 시작할지 판단하는 선. */
const BUDGET_MS = 46_000;
/** 10 RPM = 6초에 1건. 미적중 생성 사이엔 이 간격을 지킨다. */
const MIN_GAP_MS = 6_000;

function baseUrl(): string {
    // 내부 self-call 은 공개 도메인으로. 크론은 보호된 호스트에서 돈다.
    return process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET() {
    const t0 = Date.now();

    // (ticker × route) 조합을 한 줄로 편다. 18칸.
    const slots: { ticker: string; route: (typeof ROUTES)[number] }[] = [];
    for (const ticker of TICKERS) for (const route of ROUTES) slots.push({ ticker, route });

    let cursor = 0;
    try {
        const c = await getFromCache<number>(CURSOR_KEY);
        if (typeof c === 'number' && c >= 0) cursor = c % slots.length;
    } catch { /* 커서를 못 읽으면 0 부터 — 손해는 없다 */ }

    const done: string[] = [];
    let hits = 0, generated = 0, failed = 0, lastGenAt = 0;
    let visited = 0;

    while (visited < slots.length && Date.now() - t0 < BUDGET_MS) {
        const slot = slots[cursor % slots.length];
        cursor = (cursor + 1) % slots.length;
        visited++;

        // 직전에 «생성»이 있었다면 간격을 지킨다(적중이었다면 기다릴 이유가 없다).
        if (lastGenAt) {
            const wait = MIN_GAP_MS - (Date.now() - lastGenAt);
            if (wait > 0) {
                if (Date.now() - t0 + wait > BUDGET_MS) break;
                await sleep(wait);
            }
        }

        const t1 = Date.now();
        try {
            const res = await fetch(baseUrl() + slot.route.path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // ⚠️ PRICE_MOVE·GAMMA_FLIP·MANUAL_REFRESH 는 캐시를 «무시»하고 강제 재생성한다.
                //    예열은 절대 그러면 안 된다 — 살아 있는 캐시를 버리고 돈을 쓰게 된다.
                body: JSON.stringify({ ticker: slot.ticker, locale: 'ko', triggerReason: 'WARM' }),
                signal: AbortSignal.timeout(50_000),
            });
            if (!res.ok) { failed++; done.push(`${slot.ticker}:${slot.route.key}=HTTP${res.status}`); continue; }
            const body = await res.json().catch(() => null);
            const ms = Date.now() - t1;
            if (body?.fromCache) {
                hits++;
                done.push(`${slot.ticker}:${slot.route.key}=hit`);
            } else {
                generated++;
                lastGenAt = Date.now();
                done.push(`${slot.ticker}:${slot.route.key}=gen ${ms}ms`);
            }
        } catch (e: any) {
            failed++;
            done.push(`${slot.ticker}:${slot.route.key}=${e?.name === 'TimeoutError' ? 'timeout' : 'err'}`);
            // 타임아웃도 Bedrock 을 태웠을 수 있다 — 간격을 지킨다.
            lastGenAt = Date.now();
        }
    }

    try {
        // 커서는 하루를 넘겨 살 이유가 없다.
        await setInCache(CURSOR_KEY, cursor, 24 * 3600);
    } catch { /* 커서 저장 실패는 다음 판을 0 부터 돌게 할 뿐이다 */ }

    return NextResponse.json({
        success: true,
        visited,
        hits,
        generated,
        failed,
        nextCursor: cursor,
        totalMs: Date.now() - t0,
        detail: done,
    });
}
