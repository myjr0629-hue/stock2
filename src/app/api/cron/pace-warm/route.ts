// ============================================================================
// 페이싱 조절기 크론 — 크레딧 사용 속도를 재서 신선도 단계를 올리고 내리고, 그 단계의 «사전 생성»을 돌린다.
// ----------------------------------------------------------------------------
// 대표 지시(2026-10-10): «남는 것 없이 사용하는 방향» — 월 크레딧 목표 $198 을 남김없이, 넘치지 않게.
//
// 매 실행:
//   ① tickPacing() — 원장 누적·최근 속도·남은 날짜로 level 을 판단해 저장한다(9분 안 재실행은 저장값 그대로).
//   ② 장중(평일 UTC 11~23시)이고 level > 0 이면 «사전 생성» —
//        · UC 종목 카드 상위 N종목 × 3개 언어  (/api/undercurrent/ticker, 낡은 것만 다시 만든다)
//        · 종목 뉴스 상위 M종목 사전 번역       (/api/live/ticker-news, 캐시가 비었을 때만 — 새 헤드라인만 번역)
//      전부 pace=1(신선도 증가분 등급) — 크레딧으로만 만들고, 크레딧이 안 되면 AWS 로 넘기지 않고 건너뛴다.
//
// 원천보다 잦은 갱신은 없다: 종목 카드는 «수명(5분 이상)이 지난 것만», 종목 뉴스는 «목록 캐시(5분)가 비었을 때만» 만든다.
// 커서를 저장해 한 실행에 다 못 돌면 다음 실행이 이어서 돈다(앞쪽 종목만 계속 도는 쏠림 방지).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { tickPacing, inMarketWindow, PREWARM_TICKERS, rotateSlice } from '@/lib/ai/creditPacing';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LOCALES = ['ko', 'ja', 'en'] as const;
const BUDGET_MS = 235_000;          // 라우트 한도 300초 안에서 새 작업을 시작할 수 있는 선
const UC_CONCURRENCY = 4;
const NEWS_CONCURRENCY = 6;
const CURSOR_UC = 'pace-warm:cursor:uc';
const CURSOR_NEWS = 'pace-warm:cursor:news';

function baseUrl(): string {
    // 내부 self-call 은 «공개 도메인»으로 — 크론은 보호된 호스트에서 돈다(ai-warm 과 같은 규칙)
    return process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';
}
const headers = (): Record<string, string> => (process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {});

async function getJson(path: string, timeoutMs: number): Promise<{ ok: boolean; body: any }> {
    try {
        const res = await fetch(`${baseUrl()}${path}`, { headers: headers(), cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
        const body = await res.json().catch(() => null);
        return { ok: res.ok, body };
    } catch { return { ok: false, body: null }; }
}

/** 동시 n 개 작업자 — 예산이 지나면 새 작업을 시작하지 않는다. 처리한 개수를 돌려준다. */
async function pool<T>(items: T[], n: number, deadline: number, fn: (x: T) => Promise<void>): Promise<number> {
    let i = 0, done = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
        while (i < items.length && Date.now() < deadline) {
            const x = items[i++];
            await fn(x);
            done++;
        }
    }));
    return done;
}

async function cursor(key: string): Promise<number> {
    const c = await getFromCache<number>(key).catch(() => null);
    return typeof c === 'number' && c >= 0 ? c : 0;
}

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const secretParam = new URL(req.url).searchParams.get('secret');
    if (process.env.NODE_ENV === 'production' && cronSecret) {
        if (authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
    }

    const t0 = Date.now();
    const status = await tickPacing();
    const out: Record<string, unknown> = {
        level: status.level, mode: status.mode, reason: status.reason, ratio: status.decision?.ratio ?? null,
        spentUsd: status.spentUsd, knobs: status.knobs,
    };

    const canWarm = inMarketWindow(t0) && status.level > 0 && status.mode !== 'credit-off' && status.mode !== 'done' && status.mode !== 'landing';
    if (!canWarm) {
        out.prewarm = 'off';
        console.log(`[Cron/PaceWarm] level=${status.level} mode=${status.mode} 사전 생성 없음(장외·증가분 정지)`);
        return NextResponse.json({ success: true, ...out, totalMs: Date.now() - t0 });
    }

    const deadline = t0 + BUDGET_MS;

    // ── ① UC 종목 카드 사전 생성 (낡은 것만) ──
    const nUc = status.knobs.ucPrewarmTickers;
    if (nUc > 0) {
        const tickers = PREWARM_TICKERS.slice(0, nUc);
        const tasks: Array<{ t: string; l: string }> = [];
        for (const t of tickers) for (const l of LOCALES) tasks.push({ t, l });
        const start = (await cursor(CURSOR_UC)) % tasks.length;
        const ordered = rotateSlice(tasks, tasks.length, start);
        let fresh = 0, regenerated = 0, skipped = 0, failed = 0;
        const done = await pool(ordered, UC_CONCURRENCY, deadline, async ({ t, l }) => {
            // pace=1 : 캐시가 없어도 증가분 등급(AWS 로 넘기지 않음). 엿보기 → 낡았을 때만 refresh=1
            const q = `/api/undercurrent/ticker?t=${t}&locale=${l}&pace=1`;
            const peek = await getJson(q, 40_000);
            if (!peek.ok) { failed++; return; }
            if (peek.body?._stale !== true) { fresh++; return; }
            const r = await getJson(`${q}&refresh=1`, 58_000);
            if (!r.ok) { failed++; return; }
            if (r.body?._stale === true) skipped++;      // 크레딧 불가로 건너뜀 — 옛 사본을 그대로 줬다
            else regenerated++;
        });
        await setInCache(CURSOR_UC, (start + done) % tasks.length, 24 * 3600).catch(() => { /* 커서 저장 실패 = 다음 실행이 앞에서부터 */ });
        out.uc = { tickers: nUc, tasks: tasks.length, visited: done, fresh, regenerated, skipped, failed };
    }

    // ── ② 종목 뉴스 사전 번역 (캐시가 빈 종목만 만든다) ──
    const nNews = status.knobs.tickerNewsPrewarm;
    if (nNews > 0 && Date.now() < deadline) {
        const tickers = PREWARM_TICKERS.slice(0, nNews);
        const start = (await cursor(CURSOR_NEWS)) % tickers.length;
        const ordered = rotateSlice(tickers, tickers.length, start);
        let hit = 0, built = 0, skipped = 0, failed = 0;
        const done = await pool(ordered, NEWS_CONCURRENCY, deadline, async (t) => {
            const r = await getJson(`/api/live/ticker-news?t=${t}&pace=1`, 44_000);
            if (!r.ok) { failed++; return; }
            if (r.body?.skipped === 'pace') skipped++;
            else if (r.body?.fromCache) hit++;
            else built++;
        });
        await setInCache(CURSOR_NEWS, (start + done) % tickers.length, 24 * 3600).catch(() => { /* 위와 같음 */ });
        out.news = { tickers: nNews, visited: done, cacheHit: hit, built, skipped, failed };
    }

    console.log(`[Cron/PaceWarm] level=${status.level} mode=${status.mode} ${JSON.stringify({ uc: out.uc, news: out.news })} ${Date.now() - t0}ms`);
    return NextResponse.json({ success: true, ...out, totalMs: Date.now() - t0 });
}
