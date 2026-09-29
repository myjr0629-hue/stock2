/**
 * /api/cron/watchlist-alerts — PRO «내 종목» 포지셔닝 알림 실행(5분 간격 호출 전제, 무엇을 할지는 ET 시각으로 스스로 정한다).
 *
 * ⚠️ 활성화는 대표 결정 — vercel.json 에 등록하지 않았다. 켤 때 넣을 항목(UTC, 서머타임·표준시 모두 덮는다):
 *      { "path": "/api/cron/watchlist-alerts?send=1", "schedule": "*\/5 13-23 * * 1-5" }
 *    그리고 운영 환경 변수 WATCHLIST_ALERTS_SEND=on. 둘 중 하나라도 없으면 «드라이런»이다.
 *
 * 인증(실패 시 닫힘): CRON_SECRET 이 설정돼 있어야 하고 `Authorization: Bearer <CRON_SECRET>` 헤더만 받는다
 *   (쿼리 ?secret= 는 받지 않는다 — 접근 로그에 남는다). /api/cron/wim-push 처럼 «인증 없는 발송 경로»를 만들지 않는다.
 *
 * 드라이런이 기본이다 — 실제 발송은 세 조건이 모두 맞을 때만:
 *   ① ?send=1  ② WATCHLIST_ALERTS_SEND=on  ③ 운영 배포(VERCEL_ENV=production 또는 미설정)
 *   수동 점검 인자(?phase= · ?tickers= · ?anyday=1)가 하나라도 있으면 무조건 드라이런.
 *   드라이런은 쓰기를 하지 않는다(중복 억제·상한·스냅샷·표식) — «무엇을 보냈을지»만 돌려준다.
 *   단, 레벨을 읽는 getStructureData 는 화면과 같은 공유 캐시를 채울 수 있다(화면이 부를 때와 같은 동작).
 *
 * 수동 점검 예(드라이런):
 *   curl -H "Authorization: Bearer $CRON_SECRET" "https://<배포>/api/cron/watchlist-alerts?phase=intraday&tickers=NVDA,MU&verbose=1"
 */
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createDynamoAlertStore } from '@/lib/alerts/store-dynamo';
import { createServiceProvider } from '@/lib/alerts/provider';
import { createRevenueCatVerifier } from '@/lib/alerts/revenuecat';
import { runWatchlistAlerts, type AlertSender } from '@/lib/alerts/run';
import type { DetectPhases } from '@/lib/alerts/detect';
import { normalizeTicker } from '@/lib/alerts/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const got = Buffer.from(req.headers.get('authorization') || '');
    const want = Buffer.from(`Bearer ${secret}`);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const PHASE_NAMES: Array<keyof DetectPhases> = ['intraday', 'maxPain', 'darkPool', 'whale', 'earnings'];

export async function GET(req: NextRequest) {
    if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sp = req.nextUrl.searchParams;
    const phaseParam = sp.get('phase');
    const tickersParam = sp.get('tickers');
    const anyday = sp.get('anyday') === '1';
    const manual = !!(phaseParam || tickersParam || anyday);

    const vercelEnv = process.env.VERCEL_ENV;
    const isProduction = !vercelEnv || vercelEnv === 'production';
    const sendEnabled = process.env.WATCHLIST_ALERTS_SEND === 'on';
    const dryRun = !(sp.get('send') === '1' && sendEnabled && isProduction && !manual);
    const why = dryRun
        ? (manual ? 'manual-invocation' : sp.get('send') !== '1' ? 'no-send-param' : !sendEnabled ? 'send-disabled' : 'non-production')
        : null;

    let phases: Partial<DetectPhases> | undefined;
    if (phaseParam) {
        phases = {};
        for (const p of phaseParam.split(',').map((s) => s.trim())) {
            if ((PHASE_NAMES as string[]).includes(p)) phases[p as keyof DetectPhases] = true;
        }
    }
    const tickers = tickersParam
        ? tickersParam.split(',').map(normalizeTicker).filter((t): t is string => !!t).slice(0, 50)
        : undefined;

    // 벤더 5분 봉 지연을 드라이런 보고(barAgeSec)로 실측한 뒤 필요하면 운영 변수로만 조정한다(기본 12분)
    const barMaxAgeMin = Number(process.env.WATCHLIST_ALERTS_BAR_MAX_AGE_MIN);
    const detectConfig = Number.isFinite(barMaxAgeMin) && barMaxAgeMin >= 6 && barMaxAgeMin <= 30
        ? { barMaxAgeMs: barMaxAgeMin * 60_000 }
        : undefined;

    const store = createDynamoAlertStore();
    if (!store) return NextResponse.json({ ok: false, error: 'store_unavailable', dryRun }, { status: 503 });

    let sender: AlertSender | null = null;
    if (!dryRun) {
        const { sendWatchlistAlertPushes } = await import('@/lib/push/send');
        sender = { send: (pushes) => sendWatchlistAlertPushes(pushes) };
    }

    try {
        const report = await runWatchlistAlerts(
            {
                store,
                provider: createServiceProvider(),
                sender,
                verifyPro: createRevenueCatVerifier(),
                log: (msg, extra) => console.warn(msg, extra ?? ''),
            },
            { dryRun, phases, tickers, ignoreCalendar: anyday, verbose: sp.get('verbose') === '1', detectConfig },
        );
        console.log(`[watchlist-alerts] dry=${dryRun}${why ? `(${why})` : ''} session=${report.session} skipped=${report.skipped ?? '-'} `
            + `tickers=${report.tickers} bars=${report.barsFetched} barAgeP50=${report.barAgeSec.p50 ?? '-'}s levels=${report.levelsRefreshed} events=${report.events.length} `
            + `notifications=${report.notifications.length} sent=${report.sent} failed=${report.failed} pruned=${report.pruned} `
            + `errors=${report.errors.length} ms=${report.ms}`);
        return NextResponse.json({ ok: true, dryRunReason: why, ...report }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e: any) {
        const missing = e?.name === 'ResourceNotFoundException';
        console.error('[watchlist-alerts] run failed:', e?.name, e?.message);
        return NextResponse.json(
            { ok: false, dryRun, error: missing ? 'table_missing' : 'run_failed' },
            { status: missing ? 503 : 500 },
        );
    }
}
