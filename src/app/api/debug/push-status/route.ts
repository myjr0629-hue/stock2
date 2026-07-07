// ============================================================================
// /api/debug/push-status — read-only push readiness snapshot for launch checks.
// Reports whether required env SECRETS are set (booleans only — NEVER values),
// how many device tokens are registered, and whether today's report-ready
// markers exist. Guarded by CRON_SECRET (same as the cron routes).
//   GET /api/debug/push-status?secret=<CRON_SECRET>
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { getFromCache } from '@/services/redisClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const has = (v?: string) => !!(v && v.trim().length > 0);

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(req.url);
  const auth = req.headers.get('authorization');
  const authorized = !cronSecret
    || auth === `Bearer ${cronSecret}`
    || searchParams.get('secret') === cronSecret;
  // [PROBE] ?probe=1 — public, markers-only view (booleans/dates, no env flags,
  // no token counts). Lets delivery incidents be diagnosed without the secret.
  const probeOnly = searchParams.get('probe') === '1';
  if (process.env.NODE_ENV === 'production' && !authorized && !probeOnly) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  // ?date=YYYY-MM-DD — inspect a specific ET day's markers (e.g. yesterday's send)
  const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('date') || '') ? searchParams.get('date')! : todayET;
  const etOf = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null;

  // Secret PRESENCE only — values are never read out.
  const env = {
    apnsKey: has(process.env.APNS_KEY_P8) || has(process.env.APNS_KEY_PB) || has(process.env.APNS_KEY),
    apnsKeyId: has(process.env.APNS_KEY_ID),
    apnsTeamId: has(process.env.APNS_TEAM_ID),
    apnsSandbox: process.env.APNS_SANDBOX === 'true',
    firebaseServiceAccount: has(process.env.FIREBASE_SERVICE_ACCOUNT),
    cronSecret: has(process.env.CRON_SECRET),
    upstash: has(process.env.UPSTASH_REDIS_REST_URL) || has(process.env.KV_REST_API_URL),
  };

  const tokens = { total: 0, ios: 0, android: 0, sampled: 0 };
  try {
    const redis = Redis.fromEnv();
    const list: string[] = (await redis.smembers('push:token_list')) || [];
    tokens.total = list.length;
    for (const t of list.slice(0, 100)) {
      const d = await redis.get<{ platform?: string }>(`push:tokens:${t}`);
      const isIos = d?.platform === 'ios' || !t.includes(':');
      if (isIos) tokens.ios++; else tokens.android++;
      tokens.sampled++;
    }
  } catch { /* redis unavailable */ }

  const morning = await getFromCache<{ generatedAt?: string }>('guardian:morning_briefing');
  const closing = await getFromCache<string>('push:report-ready:closing');
  // Same key chain as the push gate AND the app's GET: v4 (Vercel POST) → v3 (Lambda) → v2
  let crossBrief: { generatedAt?: string } | null = null;
  let crossBriefKey: string | null = null;
  for (const v of ['v4', 'v3', 'v2']) {
    crossBrief = await getFromCache<{ generatedAt?: string }>(`postmarket:cross-brief-${v}:${dateParam}`);
    if (crossBrief?.generatedAt) { crossBriefKey = v; break; }
  }
  const sentMorning = await getFromCache<string>(`push:sent:morning:${dateParam}`);
  const sentClosing = await getFromCache<string>(`push:sent:closing:${dateParam}`);

  const markers = {
    date: dateParam,
    morningBriefGeneratedAtET: etOf(morning?.generatedAt),
    morningReadyToday: etOf(morning?.generatedAt) === todayET,
    closingMarker: closing,
    closingReadyToday: closing === todayET,
    crossBriefGeneratedAtET: etOf(crossBrief?.generatedAt),
    crossBriefKey,
    crossBriefReadyForDate: etOf(crossBrief?.generatedAt) === dateParam,
    sentMorning: !!sentMorning,
    sentMorningAt: sentMorning || null,
    sentClosing: !!sentClosing,
    sentClosingAt: sentClosing || null,
  };

  if (probeOnly && !authorized) {
    return NextResponse.json({ todayET, markers });
  }

  return NextResponse.json({
    todayET,
    env,
    tokens,
    markers,
  });
}
