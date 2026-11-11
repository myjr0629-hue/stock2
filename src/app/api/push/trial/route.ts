// ============================================================================
// POST /api/push/trial — 앱이 «체험 상태»를 보고한다(D-2 푸시용, 2026-11-11 · lib/app/trialPushReport)
//   본문: { token, platform, locale, expiresAt, willRenew, periodType, store } — 계정·RC 고객 ID 없음.
//   이미 등록된 푸시 토큰(push:tokens:<token>)만 받는다. 갱신 꺼진 체험이면 발송 대상 목록(만료 시각 정렬)에 넣고, 다시 켰으면 뺀다.
//   발송은 /api/cron/trial-push 가 한다.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { parseRecord } from '@/lib/push/prefs';
import { TRIAL_PUSH_DUE_ZSET, TRIAL_PUSH_KEY, sanitizeTrialReport, trialPushWanted, type TrialPushRecord } from '@/lib/push/trialPush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const redis = Redis.fromEnv();
const KEEP_AFTER_EXPIRY_S = 7 * 86400;

export async function POST(req: NextRequest) {
  try {
    if (Number(req.headers.get('content-length') || 0) > 4096) return NextResponse.json({ error: 'too large' }, { status: 413 });
    const body = await req.json().catch(() => null);
    const now = Date.now();
    const token = body && typeof body.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 512) return NextResponse.json({ error: 'bad request' }, { status: 400 });
    const [prevRaw, tokenRaw] = await Promise.all([redis.get(TRIAL_PUSH_KEY(token)), redis.get(`push:tokens:${token}`)]);
    if (!tokenRaw) return NextResponse.json({ ok: true, skipped: 'unknown-token' });
    const rec = sanitizeTrialReport(body, parseRecord<TrialPushRecord>(prevRaw), now);
    if (!rec) return NextResponse.json({ error: 'bad request' }, { status: 400 });
    const ttl = Math.ceil((rec.expiresAt - now) / 1000) + KEEP_AFTER_EXPIRY_S;
    await redis.set(TRIAL_PUSH_KEY(token), JSON.stringify(rec), { ex: ttl });
    if (trialPushWanted(rec)) await redis.zadd(TRIAL_PUSH_DUE_ZSET, { score: rec.expiresAt, member: token });
    else await redis.zrem(TRIAL_PUSH_DUE_ZSET, token);
    return NextResponse.json({ ok: true, due: trialPushWanted(rec) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[Push Trial]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
