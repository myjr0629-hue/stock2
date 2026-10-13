// ============================================================================
// 크론 — 실적 발표 «실제 반응» 기록 채우기 (2026-10-14)
// ----------------------------------------------------------------------------
// 평일 아침 2번(발표 전 마지막 예상 변동폭을 확정해 두는 때) + 정규장 마감 뒤 30분 간격(반응일 일봉이 확정되면 계산).
// 하는 일은 services/earningsActualsService.runActualsCycle 한 곳에 있다 — 규칙은 lib/earnings/earningsActuals.ts.
//   · 예상 변동폭: 발표 전 마지막 값을 EC2 레디스에 저장(발표 뒤 값은 저장하지 않는다)
//   · 실제 반응: 반응일 종가 ÷ 기준일 종가 − 1 (Intrinio 일봉, FMP 종가와 대조)
// 일이 없으면 Redis 읽기 2번뿐 · 벤더 호출은 «계산할 종목이 있을 때만»(종목당 Intrinio 1 + FMP 1).
// 점검(인증된 호출만): ?dry=1 — 저장하지 않고 보고만.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { runActualsCycle } from '@/services/earningsActualsService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const dryRun = new URL(req.url).searchParams.get('dry') === '1';
    const r = await runActualsCycle({ dryRun });
    console.log(`[Cron/EarningsActuals] ${JSON.stringify({ today: r.today, considered: r.considered, expected: r.expectedSaved, actuals: r.actualsSaved, skipped: r.skipped.length, dryRun })}`);
    return NextResponse.json({ success: true, dryRun, ...r });
}
