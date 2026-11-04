// ============================================================================
// 크론 — 실적 발표 «실제 반응» 기록 채우기 (2026-10-14)
// ----------------------------------------------------------------------------
// 평일 아침 2번(발표 전 마지막 예상 변동폭을 확정해 두는 때) + 정규장 마감 뒤 30분 간격(반응일 일봉이 확정되면 계산).
// 하는 일은 services/earningsActualsService.runActualsCycle 한 곳에 있다 — 규칙은 lib/earnings/earningsActuals.ts.
//   · 예상 변동폭: 발표 전 마지막 값을 EC2 레디스에 저장(발표 뒤 값은 저장하지 않는다)
//   · 실제 반응: 반응일 종가 ÷ 기준일 종가 − 1 (Intrinio 일봉, FMP 종가와 대조 — FMP 가 못 주면 Intrinio 단독으로 저장하고 다음 회차가 다시 대조)
// 일이 없으면 Redis 읽기 2번뿐 · 벤더 호출은 «계산할 종목이 있을 때만»(종목당 Intrinio 1 + FMP 1).
// 점검(인증된 호출만): ?dry=1 — 저장하지 않고 보고만.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { runActualsCycle, ACTUALS_RUN_LOCK_SEC } from '@/services/earningsActualsService';
import { CONFIRMED_EARNINGS } from '@/lib/earningsConfirmed';
import { resultEnvMode, runEarningsResultStep } from '@/lib/signals/earningsResult';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const dryRun = new URL(req.url).searchParams.get('dry') === '1';
    const t0 = Date.now();
    const r = await runActualsCycle({ dryRun });
    // 실적 결과 알림 — 이 회차가 쓰기 잠금을 실제로 얻었을 때만, 그 잠금이 살아 있는 동안만(lib/signals/earningsResult 머리말).
    if (!dryRun && r.lockAcquired) {
        try {
            const [{ envMode, upstashStore }, { sendSignalPushes }, { getAuthoritativeCache }] = await Promise.all([
                import('@/services/signalAlertsService'), import('@/lib/push/sendSignal'), import('@/services/redisClient'),
            ]);
            const result = await runEarningsResultStep({
                store: upstashStore(),
                sender: { send: sendSignalPushes },
                readStrict: (keys) => Promise.all(keys.map((k) => getAuthoritativeCache<unknown>(k).catch(() => ({ ok: false, value: null })))),
            }, {
                list: CONFIRMED_EARNINGS,
                runLockAcquired: r.lockAcquired,
                // 잠금(90초)과 함수 상한(60초) 중 짧은 쪽에서 15초 여유 — 그 뒤로는 발송을 시작하지 않는다
                lockDeadline: t0 + Math.min(ACTUALS_RUN_LOCK_SEC, maxDuration) * 1000 - 15_000,
                // 이 알림 전용 스위치(EARNINGS_RESULT_ALERT_MODE · Redis push:sig:result:mode, 없으면 dry) — 신호 스위치는 off 만 따른다
                envMode: resultEnvMode(),
                signalEnvMode: envMode(),
            });
            console.log(`[Cron/EarningsResult] ${JSON.stringify({ status: result.status, sent: result.sent, candidates: result.candidates, corrected: result.corrected, skipped: result.skipped.slice(0, 8) })}`);
        } catch (e) { console.error('[Cron/EarningsResult] failed', e instanceof Error ? e.message : 'unknown'); }
    }
    console.log(`[Cron/EarningsActuals] ${JSON.stringify({ today: r.today, considered: r.considered, expected: r.expectedSaved, actuals: r.actualsSaved, rechecked: r.rechecked, skipped: r.skipped.length, why: r.skipped.filter((x) => /^(fmp|recheck|actual:(error|vendor|bar|impl))/.test(x.reason)).slice(0, 6), dryRun })}`);
    return NextResponse.json({ success: true, dryRun, ...r });
}
