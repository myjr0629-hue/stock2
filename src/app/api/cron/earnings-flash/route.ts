// ============================================================================
// /api/cron/earnings-flash — «실적 발표 직후» 알림(2026-11-14). 실행기: lib/signals/earningsFlash · 배선: services/earningsFlashService
//   Vercel Cron 이 평일 15분 간격으로 부른다(UTC 14~16시 = 장전 발표 10:00~11:30 ET(서머타임 양쪽) · 19~23·0시 = 마감 전 예상값 뜨기 15:30~16:00 ET +
//   장후 발표 판정 ~20:00 ET). 할 일이 없는 회차는 확인 목록(코드 안 상수)만 보고 끝난다(저장소·공급사 호출 0).
//   인증: Authorization: Bearer ${CRON_SECRET} (또는 ?secret=) — 다른 크론과 같다.
//
//   (기본)         예약 실행 — 모드가 live(기본)일 때만 보낸다
//   ?dry=1         미리보기 — 아무것도 쓰지 않고 보내지 않는다 · &as=ISO(그 시각으로 판정) · &tickers=NVDA,…(가짜 기기 하나) · &only=1 · &locale=ko|en|ja
//   ?mode=off|dry|live  모드 바꾸기(Upstash push:sig:flash:mode 한 키 — 재배포 없이). live = 키 삭제(기본값)
//   ?status=1      현재 모드·마지막 실행 요약·오늘 통계
// ============================================================================
import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { readFlashMode, runEarningsFlashProd, setFlashMode } from '@/services/earningsFlashService';
import { FLASH_KV } from '@/lib/signals/earningsFlash';
import { etDateOf } from '@/lib/marketCalendar';
import type { SigMode } from '@/lib/signals/run';

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
  if (!authorized(request, searchParams.get('secret'))) {
    console.warn('[Cron/EarningsFlash] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const wantMode = searchParams.get('mode');
  if (wantMode) {
    if (wantMode !== 'off' && wantMode !== 'dry' && wantMode !== 'live') return NextResponse.json({ error: 'mode must be off|dry|live' }, { status: 400 });
    await setFlashMode(wantMode as SigMode);
    return NextResponse.json({ ok: true, set: wantMode, now: await readFlashMode() });
  }

  if (searchParams.get('status') === '1') {
    const [mode, last, stats] = await Promise.all([
      readFlashMode(),
      getFromCache<unknown>(FLASH_KV.last).catch(() => null),
      getFromCache<unknown>(FLASH_KV.stats(etDateOf(Date.now()))).catch(() => null),
    ]);
    return NextResponse.json({ ok: true, mode, last, stats });
  }

  if (searchParams.get('dry') === '1') {
    const tk = (searchParams.get('tickers') || '').split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)).slice(0, 20);
    const loc = searchParams.get('locale');
    const asMs = searchParams.get('as') ? Date.parse(String(searchParams.get('as'))) : NaN;
    const report = await runEarningsFlashProd({
      kind: 'preview',
      sim: tk.length ? { tickers: tk, locale: loc === 'en' || loc === 'ja' ? loc : 'ko', only: searchParams.get('only') === '1' } : null,
      ...(Number.isFinite(asMs) ? { now: asMs } : {}),
    });
    return NextResponse.json({ ok: true, dry: true, ...report, skipped: report.skipped.slice(0, 80) });
  }

  try {
    const report = await runEarningsFlashProd({ kind: 'cron' });
    if (report.status !== 'idle') {
      console.log(`[Cron/EarningsFlash] mode=${report.mode} status=${report.status} captured=${report.captured.join(',') || '-'} due=${report.due.join(',') || '-'} events=${report.events.map((e) => `${e.id}:${e.move ?? e.reason}`).join(',') || '-'} sent=${report.sent ? `${report.sent.ok}/${report.sent.items}` : '-'}`);
    }
    return NextResponse.json({ ok: true, mode: report.mode, status: report.status, captured: report.captured, due: report.due, events: report.events, vendor: report.vendor, devices: report.devices, sent: report.sent ?? null });
  } catch (err: any) {
    console.error('[Cron/EarningsFlash] failed:', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || 'failed' }, { status: 500 });
  }
}
