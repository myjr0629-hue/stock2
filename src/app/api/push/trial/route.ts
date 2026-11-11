// ============================================================================
// POST /api/push/trial — 앱이 «체험 상태»를 보고한다(D-2 푸시용, 2026-11-11 · lib/app/trialPushReport)
//   본문: { token, platform, locale, expiresAt, willRenew, periodType, store } — 계정·RC 고객 ID 없음.
//         { token, clear: true } — 체험이 아니게 됐다(유료·평생 전환·만료) → 대상·기록 삭제.
//   이미 등록된 푸시 토큰(push:tokens:<token>)만 받는다 · 토큰당 5초에 한 번.
//   갱신 꺼진 체험이면 발송 대상 목록(만료 시각 정렬)에 넣고, 다시 켰으면 뺀다. 발송은 /api/cron/trial-push.
//   남용 상한: 발송은 토큰당 25일에 한 통(push:trial:sent:<token>) — 만료일을 바꿔 보고해도 다시 가지 않는다.
//   응답 stored:true 일 때만 기기가 «보냈음»을 기록한다(토큰 등록보다 먼저 와 건너뛰면 다음 실행에 다시 보낸다).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { TRIAL_PUSH_DUE_ZSET, TRIAL_PUSH_KEY, TRIAL_PUSH_RL_KEY, sanitizeTrialReport, trialPushWanted, validPushToken } from '@/lib/push/trialPush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const redis = Redis.fromEnv();
const KEEP_AFTER_EXPIRY_S = 7 * 86400;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  try {
    if (Number(req.headers.get('content-length') || 0) > 4096) return json({ error: 'too large' }, 413);
    const body = await req.json().catch(() => null);
    const now = Date.now();
    const token = body && typeof body.token === 'string' ? body.token.trim() : '';
    if (!validPushToken(token)) return json({ error: 'bad request' }, 400);
    const tokenRaw = await redis.get(`push:tokens:${token}`);
    if (!tokenRaw) return json({ ok: true, stored: false, skipped: 'unknown-token' }, 202);
    // 토큰당 5초에 한 번(정상 앱은 하루 몇 번 — 반복 호출 폭주만 막는다. 발송 자체는 토큰당 25일 한 통으로 묶여 있다)
    const first = await redis.set(TRIAL_PUSH_RL_KEY(token), '1', { nx: true, ex: 5 });
    if (first !== 'OK') return json({ ok: true, stored: false, skipped: 'rate-limited' }, 429);
    if (body && body.clear === true) {
      await Promise.all([redis.zrem(TRIAL_PUSH_DUE_ZSET, token), redis.del(TRIAL_PUSH_KEY(token))]);
      return json({ ok: true, stored: true, due: false });
    }
    const rec = sanitizeTrialReport(body, now);
    if (!rec) return json({ error: 'bad request' }, 400);
    const ttl = Math.ceil((rec.expiresAt - now) / 1000) + KEEP_AFTER_EXPIRY_S;
    await redis.set(TRIAL_PUSH_KEY(token), JSON.stringify(rec), { ex: ttl });
    const due = trialPushWanted(rec);
    if (due) await redis.zadd(TRIAL_PUSH_DUE_ZSET, { score: rec.expiresAt, member: token });
    else await redis.zrem(TRIAL_PUSH_DUE_ZSET, token);
    return json({ ok: true, stored: true, due });
  } catch (e) {
    console.error('[Push Trial]', e);
    return json({ error: 'Internal error' }, 500);
  }
}
