// ============================================================================
// /api/cron/signal-alerts — «내 종목 이상 신호» 푸시 (2026-10-13). Vercel Cron 이 평일 아침(전 세션 자료 도착 뒤)·장중(구조 굽기 직후)·마감 뒤에 부른다.
//   인증: Authorization: Bearer ${CRON_SECRET} (또는 ?secret=) — 다른 크론과 같다. 운영에서 비밀값이 없으면 닫는다(모드·드라이런 출력은 민감).
//
//   (기본)            예약 실행 — 모드가 live 일 때만 보낸다. dry(기본값)면 탐지·종목별 상태 기록만 하고 보내지 않는다.
//   ?dry=1            드라이런 — 아무것도 쓰지 않고 «누가 무엇을 받을지»만 출력(기기는 짧은 해시). 보내지 않는다(test=1 이 와도).
//       &phase=structure|data|earn|daily|all|auto   (기본 auto = 지금 ET 시각으로 — data = 다크풀·OI 아침 창 08:30~12:00 · earn = 실적 D-1 마감 뒤 16:30~ · daily = data+earn)
//       &tickers=NVDA,AMD,...             가짜 기기 하나를 더한다(실제 기기에 아직 내 종목이 올라오지 않았을 때 표본용) · &only=1 이면 실제 기기는 보지 않는다
//       &locale=ko|en|ja &platform=ios|android &ai=1(AI 한 줄까지 만든다 — 크레딧 약 $0.0003/신호)
//   ?mode=off|dry|live  모드를 바꾼다(Redis push:sig:mode 한 키 — 재배포 없이). off = 즉시 전부 멈춤. dry = 키 삭제(기본값).
//   ?status=1         현재 모드·마지막 실행 요약·오늘 통계.
// 시험 발송은 없다 — 실제 발송은 모드가 live 이고 예약 실행일 때만 일어난다.
// ============================================================================
import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { readSignalMode, runSignalAlerts, setSignalMode } from '@/services/signalAlertsService';
import { SIG_KV } from '@/lib/signals/plan';
import { etDateOf } from '@/lib/marketCalendar';
import type { SigMode, SigPhase } from '@/lib/signals/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PHASES: SigPhase[] = ['structure', 'data', 'earn', 'daily', 'all', 'auto'];

function authorized(request: Request, secretParam: string | null): boolean {
    const cronSecret = process.env.CRON_SECRET;
    if (process.env.NODE_ENV !== 'production') return true;
    if (!cronSecret) return false;
    return request.headers.get('authorization') === `Bearer ${cronSecret}` || secretParam === cronSecret;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    if (!authorized(request, searchParams.get('secret'))) {
        console.warn('[Cron/SignalAlerts] Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 모드 바꾸기
    const wantMode = searchParams.get('mode');
    if (wantMode) {
        if (wantMode !== 'off' && wantMode !== 'dry' && wantMode !== 'live') return NextResponse.json({ error: 'mode must be off|dry|live' }, { status: 400 });
        await setSignalMode(wantMode as SigMode);
        return NextResponse.json({ ok: true, set: wantMode, now: await readSignalMode() });
    }

    // 상태
    if (searchParams.get('status') === '1') {
        const [mode, last, stats] = await Promise.all([
            readSignalMode(),
            getFromCache<unknown>(SIG_KV.last).catch(() => null),
            getFromCache<unknown>(SIG_KV.stats(etDateOf(Date.now()))).catch(() => null),
        ]);
        return NextResponse.json({ ok: true, mode, last, stats });
    }

    const phaseParam = (searchParams.get('phase') || 'auto') as SigPhase;
    const phase = PHASES.includes(phaseParam) ? phaseParam : 'auto';

    // 드라이런 — 아무것도 쓰지 않는다
    if (searchParams.get('dry') === '1') {
        const tk = (searchParams.get('tickers') || '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)).slice(0, 100);
        const loc = searchParams.get('locale');
        const plat = searchParams.get('platform');
        const asParam = searchParams.get('as');
        const asMs = asParam ? Date.parse(asParam) : NaN;
        const report = await runSignalAlerts({
            kind: 'preview', phase, ai: searchParams.get('ai') === '1',
            sim: tk.length ? { tickers: tk, locale: loc === 'en' || loc === 'ja' ? loc : 'ko', platform: plat === 'android' ? 'android' : 'ios', only: searchParams.get('only') === '1' } : null,
            ...(Number.isFinite(asMs) ? { now: asMs } : {}),
        });
        // 출력 크기 — 후보가 있는 기기만
        const plan = report.plan.filter((p) => p.chosen.length || p.skipped.length);
        return NextResponse.json({ ok: true, dry: true, ...report, planTotal: report.plan.length, plan: plan.slice(0, 80) });
    }

    // 예약 실행
    try {
        const report = await runSignalAlerts({ kind: 'cron', phase });
        console.log(`[Cron/SignalAlerts] mode=${report.mode} status=${report.status} devices=${report.devices.eligible} tickers=${report.devices.tickers} signals=${report.signals.length} chosen=${report.plan.reduce((a, p) => a + p.chosen.length, 0)} sent=${report.sent ? `${report.sent.ok}/${report.sent.items}` : '-'} notes=${report.notes.join('|')}`);
        return NextResponse.json({
            ok: true, mode: report.mode, status: report.status, phases: report.phases, etDate: report.etDate, devices: report.devices,
            signals: report.signals.length, sent: report.sent ?? null, notes: report.notes,
        });
    } catch (err: any) {
        console.error('[Cron/SignalAlerts] failed:', err?.message || err);
        return NextResponse.json({ ok: false, error: err?.message || 'failed' }, { status: 500 });
    }
}
