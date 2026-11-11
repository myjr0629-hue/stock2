// ============================================================================
// /api/cron/trial-push — 체험 종료 D-2 푸시(2026-11-11). Vercel Cron 매시 :17 (vercel.json).
//   대상 목록(push:trial:due, 점수 = 만료 시각)에서 «남은 12~48시간»만 읽어 lib/push/trialPush.trialPushDecision 으로 거른 뒤
//   기기 언어·시간대로 한 통씩 보낸다(iOS APNs · 안드 FCM — lib/push/sendSignal 재사용). 체험 하나당 한 번(sentFor).
//   ?dry=1 — 보내지 않고 대상·이유·문구만 돌려준다(표식·통계 안 씀).
//   통계: push:stats:trial:{ET날짜} (TTL 60일) — 후보·보냄·실패·이유별 건너뜀. scripts 로 읽는다.
// Auth: Authorization: Bearer ${CRON_SECRET} (또는 ?secret=) — 다른 크론과 같다.
// ============================================================================
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { parseRecord } from '@/lib/push/prefs';
import { sendSignalPushes, type SignalPushItem } from '@/lib/push/sendSignal';
import { etDay } from '@/lib/app/funnelSchema';
import {
  TRIAL_PUSH_DATA, TRIAL_PUSH_DUE_ZSET, TRIAL_PUSH_KEY, TRIAL_PUSH_MAX_MS, TRIAL_PUSH_MIN_MS,
  trialPushContent, trialPushDecision, type TrialPushRecord,
} from '@/lib/push/trialPush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const redis = Redis.fromEnv();

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const ok = request.headers.get('authorization') === `Bearer ${cronSecret}` || searchParams.get('secret') === cronSecret;
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const dry = searchParams.get('dry') === '1';
  const now = Date.now();
  try {
    // 지난 만료는 목록에서 걷는다(레코드는 TTL 로 사라진다)
    if (!dry) await redis.zremrangebyscore(TRIAL_PUSH_DUE_ZSET, 0, now);
    const tokens = ((await redis.zrange(TRIAL_PUSH_DUE_ZSET, now + TRIAL_PUSH_MIN_MS, now + TRIAL_PUSH_MAX_MS, { byScore: true })) || []) as string[];
    const skipped: Record<string, number> = {};
    const items: SignalPushItem[] = [];
    const recs = new Map<string, TrialPushRecord>();
    const preview: Array<{ platform: string; locale: string; title: string; hoursLeft: number }> = [];
    for (let i = 0; i < tokens.length; i += 50) {
      const chunk = tokens.slice(i, i + 50);
      const [trialRaw, tokenRaw] = await Promise.all([
        redis.mget<unknown[]>(...chunk.map((t) => TRIAL_PUSH_KEY(t))),
        redis.mget<unknown[]>(...chunk.map((t) => `push:tokens:${t}`)),
      ]);
      chunk.forEach((token, j) => {
        const rec = parseRecord<TrialPushRecord>(trialRaw[j]);
        const tokenRec = parseRecord<{ app?: string; preferences?: { enabled?: boolean }; notifPerm?: boolean; tz?: string }>(tokenRaw[j]);
        const d = trialPushDecision(rec, tokenRec, now);
        if (d !== 'send' || !rec) { skipped[d] = (skipped[d] || 0) + 1; return; }
        const content = trialPushContent(rec, tokenRec?.tz);
        recs.set(token, rec);
        items.push({ id: token, token, platform: rec.platform, title: content.title, body: content.body, data: TRIAL_PUSH_DATA, quiet: false, thread: 'trial_end' });
        preview.push({ platform: rec.platform, locale: rec.locale, title: content.title, hoursLeft: Math.round((rec.expiresAt - now) / 3600_000) });
      });
    }
    if (dry) return NextResponse.json({ ok: true, dry: true, candidates: tokens.length, send: items.length, skipped, preview });

    const out = items.length ? await sendSignalPushes(items) : new Map();
    let sent = 0, failed = 0, dead = 0;
    for (const it of items) {
      const r = out.get(it.id);
      const rec = recs.get(it.token)!;
      if (r === 'ok') {
        sent++;
        const ttl = Math.max(60, Math.ceil((rec.expiresAt - now) / 1000) + 7 * 86400);
        await redis.set(TRIAL_PUSH_KEY(it.token), JSON.stringify({ ...rec, sentFor: rec.expiresAt }), { ex: ttl });
        await redis.zrem(TRIAL_PUSH_DUE_ZSET, it.token);
      } else if (r === 'dead') {
        dead++;
        await redis.zrem(TRIAL_PUSH_DUE_ZSET, it.token);
      } else failed++;   // 다음 회차에 다시(창 안이면)
    }
    const statsKey = `push:stats:trial:${etDay(new Date(now))}`;
    const prev = parseRecord<Record<string, number>>(await redis.get(statsKey)) || {};
    const stats: Record<string, number> = { ...prev, runs: (prev.runs || 0) + 1, candidates: (prev.candidates || 0) + tokens.length, sent: (prev.sent || 0) + sent, failed: (prev.failed || 0) + failed, dead: (prev.dead || 0) + dead };
    for (const [k, v] of Object.entries(skipped)) stats[`skip_${k}`] = (prev[`skip_${k}`] || 0) + v;
    await redis.set(statsKey, JSON.stringify(stats), { ex: 60 * 86400 });
    return NextResponse.json({ ok: true, candidates: tokens.length, sent, failed, dead, skipped });
  } catch (e: any) {
    console.error('[Cron/TrialPush]', e?.message || e);
    return NextResponse.json({ ok: false, error: 'trial push failed' }, { status: 500 });
  }
}
