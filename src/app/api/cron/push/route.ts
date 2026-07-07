// ============================================================================
// /api/cron/push — sends scheduled push notifications (Morning Brief / Closing
// Report) to all registered devices via FCM. Triggered by Vercel Cron.
//   ?type=morning | closing   (default: closing)
// Auth: Authorization: Bearer ${CRON_SECRET}  (or ?secret=) — same as other crons.
// ============================================================================
import { NextResponse } from 'next/server';
import { sendPushByType } from '@/lib/push/send';
import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchMassive } from '@/services/massiveClient';

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

  // [TEST] ?test=1 (with a valid secret) bypasses the report-ready + de-dupe gates
  // and sends immediately — lets us verify real delivery on demand without waiting
  // for the 08:00/17:00 ET publication. Secret-guarded by the auth check above.
  if (searchParams.get('test') === '1') {
    try {
      const result = await sendPushByType(type);
      console.log(`[Cron/Push] TEST type=${type} sent=${result.sent}/${result.total} pruned=${result.pruned}`);
      return NextResponse.json({ ok: true, test: true, type, ...result });
    } catch (err: any) {
      console.error('[Cron/Push] TEST send failed:', err?.message || err);
      return NextResponse.json({ ok: false, error: err?.message || 'send failed' }, { status: 500 });
    }
  }

  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // 1) Verify the report/brief was ACTUALLY generated TODAY before notifying — never
  //    send a premature or empty push if generation was delayed or failed.
  if (type === 'morning') {
    // Morning brief is generated ~08:00 ET by the EC2 worker (guardian/briefing/generate),
    // which stamps guardian:morning_briefing.generatedAt.
    const brief = await getFromCache<{ generatedAt?: string }>('guardian:morning_briefing');
    const genET = brief?.generatedAt
      ? new Date(brief.generatedAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      : null;
    if (genET !== todayET) {
      console.warn(`[Cron/Push] morning brief not ready (gen=${genET}, today=${todayET}) — skipping`);
      return NextResponse.json({ ok: false, skipped: true, reason: 'report-not-ready', type });
    }
  } else {
    // [HOLIDAY GUARD] The snapshot/brief crons run on weekday holidays too (they have
    // no market-calendar awareness) and can stamp today's markers from stale data —
    // which would push a "closing report" on a day with NO session (e.g. 7/3 observed
    // Independence Day). Data-driven check: a real session leaves a SPY daily bar.
    try {
      const aggs = await fetchMassive(`/v2/aggs/ticker/SPY/range/1/day/${todayET}/${todayET}`, { adjusted: 'true', limit: '2' });
      if (!aggs?.results?.length) {
        console.warn(`[Cron/Push] no SPY session bar for ${todayET} (market holiday) — skipping closing push`);
        return NextResponse.json({ ok: true, skipped: true, reason: 'market-holiday', type });
      }
    } catch { /* vendor check failed — fall through; the report gates below still protect */ }

    // Closing push requires BOTH signals to be TODAY's, so it only fires once the full
    // report set is genuinely published:
    //  1) all 10 sector snapshots swept — snapshot cron stamps this after cloud_fortress
    //  2) the comprehensive cross-sector brief (CROSS-SECTOR INTELLIGENCE) generated
    // [ROOT-CAUSE FIX] The brief has TWO producers writing DIFFERENT keys: the EC2/Lambda
    // pipeline writes v3 (reliable — what the app's GET actually serves first) and the
    // Vercel POST self-generator writes v4 (often dies on the 60s limit). Gating on v4
    // alone meant the closing push NEVER fired even though the report was live in the
    // app. Check the same chain the app serves: v4 → v3 → v2.
    const ready = await getFromCache<string>('push:report-ready:closing');
    if (ready !== todayET) {
      console.warn(`[Cron/Push] closing sectors not ready (marker=${ready}, today=${todayET}) — skipping`);
      return NextResponse.json({ ok: false, skipped: true, reason: 'sectors-not-ready', type });
    }
    let brief: { generatedAt?: string } | null = null;
    for (const v of ['v4', 'v3', 'v2']) {
      brief = await getFromCache<{ generatedAt?: string }>(`postmarket:cross-brief-${v}:${todayET}`);
      if (brief?.generatedAt) break;
    }
    const briefET = brief?.generatedAt
      ? new Date(brief.generatedAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      : null;
    if (briefET !== todayET) {
      console.warn(`[Cron/Push] comprehensive brief not ready (gen=${briefET}, today=${todayET}) — skipping`);
      return NextResponse.json({ ok: false, skipped: true, reason: 'brief-not-ready', type });
    }
  }

  // 2) De-dupe: the morning cron fires at two UTC times (one per DST season, so the
  //    push always lands ~10min after 08:00 ET), and Vercel may retry — only ever send
  //    one push per type per ET day.
  const sentKey = `push:sent:${type}:${todayET}`;
  if (await getFromCache<string>(sentKey)) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already-sent', type });
  }

  try {
    const result = await sendPushByType(type);
    await setInCache(sentKey, new Date().toISOString(), 60 * 60 * 18);
    console.log(`[Cron/Push] type=${type} sent=${result.sent}/${result.total} pruned=${result.pruned}`);
    return NextResponse.json({ ok: true, type, ...result });
  } catch (err: any) {
    console.error('[Cron/Push] send failed:', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || 'send failed' }, { status: 500 });
  }
}
