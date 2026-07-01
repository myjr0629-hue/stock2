// ============================================================================
// /api/cron/push — sends scheduled push notifications (Morning Brief / Closing
// Report) to all registered devices via FCM. Triggered by Vercel Cron.
//   ?type=morning | closing   (default: closing)
// Auth: Authorization: Bearer ${CRON_SECRET}  (or ?secret=) — same as other crons.
// ============================================================================
import { NextResponse } from 'next/server';
import { sendPushByType } from '@/lib/push/send';
import { getFromCache } from '@/services/redisClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  // [Security] CRON_SECRET check — mirrors the other cron routes.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');

  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
    const isParamValid = secretParam === cronSecret;
    if (!isHeaderValid && !isParamValid) {
      console.warn('[Cron/Push] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const type = searchParams.get('type') === 'morning' ? 'morning' : 'closing';

  // Verify the closing report was actually generated today before notifying. The
  // snapshot cron sets this marker on success; the push fires ~15min after the last
  // sector snapshot. If the pipeline was delayed/failed the marker is stale and we
  // skip rather than send a premature or empty notification.
  if (type === 'closing') {
    const ready = await getFromCache<string>('push:report-ready:closing');
    const etDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    if (ready !== etDate) {
      console.warn(`[Cron/Push] closing report not ready (marker=${ready}, today=${etDate}) — skipping`);
      return NextResponse.json({ ok: false, skipped: true, reason: 'report-not-ready', type });
    }
  }

  try {
    const result = await sendPushByType(type);
    console.log(`[Cron/Push] type=${type} sent=${result.sent}/${result.total} pruned=${result.pruned}`);
    return NextResponse.json({ ok: true, type, ...result });
  } catch (err: any) {
    console.error('[Cron/Push] send failed:', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || 'send failed' }, { status: 500 });
  }
}
