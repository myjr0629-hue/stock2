// ============================================================================
// AI 캐시 예열 — Command «AI 딥 분석»(Sonnet 5.5)을 개장 직후 미리 만든다. (2026-10-12 복구, 대표 승인 REPORT §3 ④)
// ----------------------------------------------------------------------------
// 왜: 처음 여는 종목은 광고 30초 + 생성 23초(p50, Sonnet 5.5)를 기다린다(INTERNAL-MEASURE §2.5). 예열된 종목은 캐시 읽기로 뜬다.
//
// 9/10 에 꺼 둔 이유와 이번에 푼 방법:
//   딥 분석 라우트는 «화면이 계산한 재료(snapshot)»를 받아야 한다. 9/10 첫 예열은 빈 재료로 불러 「데이터 부재로 판단 불가」 글이
//   인기 9종목 캐시에 앉았다(그 뒤 라우트에 재료 게이트(422·신뢰 경로 재료 완결 게이트)를 넣고 예열 목록을 비웠다).
//   → 이번에는 서버가 «화면과 같은 엔드포인트·같은 함수»로 재료를 만든다(services/deepWarmService · lib/ai/deepSnapshot — 화면도 이 함수를 쓴다).
//     라우트의 재료 게이트·가격 대조·출구 게이트는 예열에도 그대로 걸린다.
//
// 상한: 오늘(UTC) Sonnet 사용액이 일일 상한($3.5)의 50%에 닿으면 멈춘다 — 나머지는 언제나 사용자 몫(lib/ai/deepWarmPlan).
//   크레딧으로만(라우트가 인증된 WARM 을 withFreshTier 로 부른다 — AWS 로 넘기지 않음).
// 라운드: 뉴욕 09:35·10:35(한국 22:35·23:35, 서머타임) — 라운드마다 하루 한 번 · 캐시가 25분 안에 만든 종목은 부르지 않는다.
// 결과는 ai-warm:last 에 남는다(적중·생성·대기 시간 실측용).
// 점검(인증된 호출만): ?force=1 (라운드 창·휴장일 무시, 상한은 그대로) · ?t=A,B (그 종목만) · ?status=1[&day=&round=] (마지막 결과 읽기만)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, mgetFromCache, setInCache } from '@/services/redisClient';
import { etDateOf, isNonTradingDay } from '@/lib/marketCalendar';
import { LADDER_PURPOSES, sonnetSpentTodayUsd } from '@/lib/ai/llmLadder';
import { deepTrustCacheKey } from '@/lib/ai/deepTrust';
import {
    DEEP_WARM_CONCURRENCY, DEEP_WARM_ROUNDS, DEEP_WARM_TICKERS, dueRound, warmBudgetAllows, warmCacheFresh,
} from '@/lib/ai/deepWarmPlan';
import { warmDeepOne, type WarmResult } from '@/services/deepWarmService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUDGET_MS = 250_000;
const roundKey = (day: string, id: string) => `ai-warm:round:${day}:${id}`;
const LAST_KEY = 'ai-warm:last';

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const q = new URL(req.url).searchParams;
    // 읽기 전용 — 마지막 라운드 결과(실측용). 아무것도 부르지 않는다.
    if (q.get('status') === '1') {
        const day = q.get('day'), id = q.get('round');
        const v = await getFromCache<any>(day && id ? `${LAST_KEY}:${day}:${id}` : LAST_KEY).catch(() => null);
        return NextResponse.json({ success: true, last: v });
    }
    const force = q.get('force') === '1';
    const t0 = Date.now();
    const day = etDateOf(t0);
    if (!force && isNonTradingDay(day)) return NextResponse.json({ success: true, skipped: 'non-trading-day', day });

    // 라운드 — 창 안의 첫 호출만(하루 한 번씩)
    const doneVals = await mgetFromCache<any>(DEEP_WARM_ROUNDS.map((r) => roundKey(day, r.id))).catch(() => DEEP_WARM_ROUNDS.map(() => null));
    const done = new Set(DEEP_WARM_ROUNDS.filter((_, i) => !!doneVals[i]).map((r) => r.id));
    const round = force ? { id: 'manual', fromMin: 0, toMin: 0 } : dueRound(t0, done);
    if (!round) return NextResponse.json({ success: true, skipped: 'no-round', day, done: [...done] });
    if (!force) await setInCache(roundKey(day, round.id), { at: t0 }, 26 * 3600).catch(() => false);

    const cap = LADDER_PURPOSES.DeepAnalysis?.sonnet?.dailyCapUsd ?? 0;
    const only = (q.get('t') || '').split(',').map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z][A-Z0-9.]{0,6}$/.test(x));
    const tickers = only.length ? only.slice(0, 20) : [...DEEP_WARM_TICKERS];

    // 이미 살아 있는 캐시(25분 안에 만든 것)는 부르지 않는다 — 재료 모으기·라우트 호출도 0
    const cachedVals = await mgetFromCache<any>(tickers.map(deepTrustCacheKey)).catch(() => tickers.map(() => null));
    const results: WarmResult[] = [];
    const todo: string[] = [];
    tickers.forEach((t, i) => {
        if (warmCacheFresh(cachedVals[i], t0)) results.push({ ticker: t, outcome: 'cached', ms: 0 });
        else todo.push(t);
    });

    const spentStart = await sonnetSpentTodayUsd().catch(() => Number.POSITIVE_INFINITY);
    let inflight = 0;
    let stopBudget = false;
    let idx = 0;
    await Promise.all(Array.from({ length: Math.min(DEEP_WARM_CONCURRENCY, todo.length) }, async () => {
        while (idx < todo.length && Date.now() - t0 < BUDGET_MS) {
            const t = todo[idx++];
            if (stopBudget) { results.push({ ticker: t, outcome: 'budget', ms: 0 }); continue; }
            // 생성 직전마다 오늘 사용액을 다시 읽는다(사용자 생성도 같은 상한을 쓴다)
            const spent = await sonnetSpentTodayUsd().catch(() => Number.POSITIVE_INFINITY);
            if (!warmBudgetAllows(spent, cap, inflight)) { stopBudget = true; results.push({ ticker: t, outcome: 'budget', ms: 0, reason: `spent $${spent.toFixed(3)} / cap $${cap}` }); continue; }
            inflight++;
            try { results.push(await warmDeepOne(t)); } finally { inflight--; }
        }
    }));
    for (const t of todo.slice(idx)) results.push({ ticker: t, outcome: 'budget', ms: 0, reason: 'time' });

    const spentEnd = await sonnetSpentTodayUsd().catch(() => null);
    const count: Record<string, number> = {};
    for (const r of results) count[r.outcome] = (count[r.outcome] || 0) + 1;
    const gens = results.filter((r) => r.outcome === 'gen').map((r) => r.ms).sort((a, b) => a - b);
    const summary = {
        at: t0, day, round: round.id, ms: Date.now() - t0, count,
        genP50Ms: gens.length ? gens[Math.floor(gens.length / 2)] : null,
        sonnetSpentStart: Number.isFinite(spentStart) ? Math.round(spentStart * 10000) / 10000 : null,
        sonnetSpentEnd: spentEnd != null ? Math.round(spentEnd * 10000) / 10000 : null,
        capUsd: cap, warmShareUsd: cap * 0.5,
        results,
    };
    await setInCache(LAST_KEY, summary, 3 * 24 * 3600).catch(() => false);
    await setInCache(`${LAST_KEY}:${day}:${round.id}`, summary, 3 * 24 * 3600).catch(() => false);
    console.log(`[Cron/AiWarm] ${day} ${round.id} ${JSON.stringify(count)} ${summary.ms}ms Sonnet $${summary.sonnetSpentStart}→$${summary.sonnetSpentEnd} / 예열 몫 $${cap * 0.5}`);
    return NextResponse.json({ success: true, ...summary });
}
