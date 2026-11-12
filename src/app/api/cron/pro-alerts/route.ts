// ============================================================================
// /api/cron/pro-alerts — PRO «가격 레벨 돌파» 알림 평가·발송(2026-11-12). Vercel Cron 이 평일 UTC 13~21시 5분마다 부르고, 정규장(09:30~16:00 ET · 반일장 13:00)에만 일한다.
//   인증: Authorization: Bearer ${CRON_SECRET} (또는 ?secret=). 운영에서 비밀값이 없으면 닫는다.
//   (기본)       예약 실행 — 모드가 off 가 아니면 판정·발송
//   ?dry=1       미리보기 — 아무것도 쓰지 않는다(발송 0 · RC 0 · 가격은 허브만) · &force=1 이면 장 시간 밖에서도 판정 흐름을 돈다
//   ?mode=off|live  끄기/켜기(Redis push:pro-alerts:v1:mode — 재배포 없이). 기본 live.
//   ?status=1    모드·마지막 실행·오늘 발송 수·색인 기기 수
//   ?probe=1     발송 경로 점검 — 가짜 토큰 둘(어느 기기에도 닿지 않음 · 정상 = 둘 다 dead)
// 무료 «내 종목 이상 신호»(/api/cron/signal-alerts)와 키·상한·예약을 공유하지 않는다.
// ============================================================================
import { NextResponse } from 'next/server';
import { etDateOf } from '@/lib/marketCalendar';
import { PA_KEYS } from '@/lib/proAlerts/core';
import { sendSignalPushes } from '@/lib/push/sendSignal';
import { paUpstashStore, readProAlertsMode, runProAlertsProd, setProAlertsMode } from '@/services/proAlertsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: Request, secretParam: string | null): boolean {
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV !== 'production') return true;
    if (!cronSecret) return false;
    return request.headers.get('authorization') === `Bearer ${cronSecret}` || secretParam === cronSecret;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    if (!authorized(request, searchParams.get('secret'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const wantMode = searchParams.get('mode');
    if (wantMode) {
        if (wantMode !== 'off' && wantMode !== 'live') return NextResponse.json({ error: 'mode must be off|live' }, { status: 400 });
        await setProAlertsMode(wantMode);
        return NextResponse.json({ ok: true, set: wantMode, now: await readProAlertsMode() });
    }

    if (searchParams.get('status') === '1') {
        const s = paUpstashStore();
        const etDate = etDateOf(Date.now());
        const [mode, last, ok, idx, vendor] = await Promise.all([
            readProAlertsMode(),
            s.get(PA_KEYS.last).catch(() => null),
            s.get(`${PA_KEYS.stats(etDate)}:ok`).catch(() => null),
            s.raw.scard(PA_KEYS.idx).catch(() => null),
            s.get(PA_KEYS.vendorDay(etDate)).catch(() => null),
        ]);
        return NextResponse.json({ ok: true, mode, last, today: { etDate, sentOk: Number(ok) || 0, vendorCalls: Number(vendor) || 0 }, indexedDevices: idx });
    }

    if (searchParams.get('probe') === '1') {
        const base = { title: 'probe', body: 'probe', data: { type: 'probe' }, quiet: true, thread: 'pa-probe' };
        const out = await sendSignalPushes([
            { id: 'ios', token: 'a'.repeat(64), platform: 'ios', ...base },
            { id: 'android', token: 'probe:not-a-real-fcm-token', platform: 'android', ...base },
        ]);
        return NextResponse.json({ ok: true, probe: Object.fromEntries(out), expect: { ios: 'dead', android: 'dead' } });
    }

    if (searchParams.get('dry') === '1') {
        const report = await runProAlertsProd({ kind: 'preview', force: searchParams.get('force') === '1' });
        return NextResponse.json({ ok: true, dry: true, ...report });
    }

    try {
        const report = await runProAlertsProd({ kind: 'cron' });
        console.log(`[Cron/ProAlerts] status=${report.status} devices=${report.devices.eligible}/${report.devices.indexed} levels=${report.levels} tickers=${report.tickers} price=${report.price ? `${report.price.hub}h/${report.price.vendor}v/${report.price.missing}m/${report.price.vendorCalls}c` : '-'} crossings=${report.crossings.length} sent=${report.sent ? `${report.sent.ok}/${report.sent.items}` : '-'} notes=${report.notes.join('|')}`);
        const { crossings, ...rest } = report;
        return NextResponse.json({ ok: true, ...rest, crossings: crossings.length });
    } catch (err: any) {
        console.error('[Cron/ProAlerts] failed:', err?.message || err);
        return NextResponse.json({ ok: false, error: err?.message || 'failed' }, { status: 500 });
    }
}
