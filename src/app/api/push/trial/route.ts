// ============================================================================
// POST /api/push/trial — 앱이 «체험 상태»를 보고한다(D-2 푸시용, 2026-11-11 · lib/app/trialPushReport)
//   본문: { token, rcUid, platform, locale, expiresAt, willRenew, periodType, store } — rcUid = RC 앱 사용자 ID(원문 저장 안 함 · 해시로 묶음만).
//         { token, clear: true } — 체험이 아니게 됐다(유료·평생 전환·만료) → 대상·기록 삭제.
//   이미 등록된 푸시 토큰(push:tokens:<token>)만 받는다 · 토큰당 5초에 한 번.
//   갱신 꺼진 체험이면 발송 대상 목록(만료 시각 정렬)에 넣고, 다시 켰으면 뺀다. 발송은 /api/cron/trial-push.
//   ★11/12 야간 검토 ②: 대상에 «넣는» 보고는 RevenueCat 에서 직접 확인한다(lib/push/trialVerify — 공개 키 GET /v1/subscribers ·
//     IP·고객·전체 예산). RC 가 «체험 중 · 갱신 꺼짐»이라고 답할 때만, 만료 시각도 RC 값으로 넣는다. RC 고객 하나 = 토큰 하나.
//     RC 를 못 읽으면(장애·예산 초과) 넣지 않는다(stored:false → 기기가 다음 진입에 다시 보낸다). 빼는 보고(갱신 켬·해제)는 확인 없이 받는다.
//   남용 상한: 발송은 토큰당 25일에 한 통(push:trial:sent:<token>) — 만료일을 바꿔 보고해도 다시 가지 않는다.
//   응답 stored:true 일 때만 기기가 «보냈음»을 기록한다(토큰 등록보다 먼저 와 건너뛰면 다음 실행에 다시 보낸다).
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { TRIAL_PUSH_DUE_ZSET, TRIAL_PUSH_KEY, TRIAL_PUSH_RL_KEY, sanitizeTrialReport, trialPushWanted, validPushToken, type TrialPushRecord } from '@/lib/push/trialPush';
import { RC_UID_RE, TRIAL_PUSH_OWNER_KEY, TRIAL_PUSH_UID_KEY, trialUidHash, verifyTrialWithRc, type TrialVerifyStore } from '@/lib/push/trialVerify';
import { clientIpFrom } from '@/lib/guruLens/proAccess';
import { DROP_IF_OWNER_LUA, DROP_LUA, TRIAL_PUSH_SEQ_KEY, TRIAL_PUSH_SEQ_TTL_S, TRIAL_PUSH_UIDSEQ_KEY, UNLOCK_LUA, WRITE_UNVERIFIED_LUA, WRITE_VERIFIED_LUA } from '@/lib/push/trialPushLua';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const redis = Redis.fromEnv();
const KEEP_AFTER_EXPIRY_S = 7 * 86400;
const verifyStore: TrialVerifyStore = {
  incr: async (keys, ttl) => {
    const p = redis.pipeline();
    for (const k of keys) { p.incr(k); p.expire(k, ttl); }
    const out = (await p.exec()) as unknown[];
    return keys.map((_, i) => Number(out[i * 2]));
  },
};
const SEQ_TTL = String(TRIAL_PUSH_SEQ_TTL_S);
/** 토큰의 대상·기록·주인을 한 번에 지운다(해제 · RC 에 체험 없음) — 더 늦게 시작한 요청이 이미 썼으면 아무것도 안 한다 */
const dropToken = (token: string, now: number) => redis.eval(DROP_LUA, [TRIAL_PUSH_DUE_ZSET, TRIAL_PUSH_KEY(token), TRIAL_PUSH_OWNER_KEY(token), TRIAL_PUSH_SEQ_KEY(token)], [token, String(now), SEQ_TTL]);
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
      await dropToken(token, now);
      return json({ ok: true, stored: true, due: false });
    }
    const rec = sanitizeTrialReport(body, now);
    if (!rec) return json({ error: 'bad request' }, 400);
    if (trialPushWanted(rec)) {
      // 대상에 넣는 보고 — RC 확인(기기가 보낸 값은 믿지 않는다)
      const uid = typeof body.rcUid === 'string' ? body.rcUid.trim() : '';
      if (!RC_UID_RE.test(uid)) return json({ error: 'bad request' }, 400);
      // RC 고객당 한 번에 하나(확인 → 옛 토큰 빼기 → 묶기 → 넣기를 고객 단위로 줄 세운다 — 관문 11121015 ②). 못 잡으면 429(기기가 6초 뒤 다시)
      const lockKey = `push:trial:uidlock:${trialUidHash(uid)}`;
      const lockId = `${token.slice(0, 16)}:${now}`;
      if ((await redis.set(lockKey, lockId, { nx: true, ex: 15 })) !== 'OK') return json({ ok: true, stored: false, skipped: 'busy' }, 429);
      try {
        return await addVerified(req, token, uid, rec, now);
      } finally {
        await redis.eval(UNLOCK_LUA, [lockKey], [lockId]).catch(() => {});
      }
    }
    // 빼는 보고(갱신 켬 · 체험 아님) — 확인 없이 받는다(발송을 줄이기만 한다)
    const ttl = Math.ceil((rec.expiresAt - now) / 1000) + KEEP_AFTER_EXPIRY_S;
    await redis.eval(WRITE_UNVERIFIED_LUA, [TRIAL_PUSH_KEY(token), TRIAL_PUSH_DUE_ZSET, TRIAL_PUSH_OWNER_KEY(token), TRIAL_PUSH_SEQ_KEY(token)], [JSON.stringify(rec), String(ttl), token, String(now), SEQ_TTL]);
    return json({ ok: true, stored: true, due: false });
  } catch (e) {
    console.error('[Push Trial]', e);
    return json({ error: 'Internal error' }, 500);
  }
}

/** 대상에 넣는 보고 — RC 확인 뒤 RC 값으로 쓴다(고객 잠금 안에서만 부른다) */
async function addVerified(req: NextRequest, token: string, uid: string, rec: TrialPushRecord, now: number) {
  const v = await verifyTrialWithRc(uid, rec.platform, clientIpFrom(req.headers), {
    store: verifyStore, keys: { ios: process.env.NEXT_PUBLIC_RC_IOS_KEY, android: process.env.NEXT_PUBLIC_RC_ANDROID_KEY },
  });
  if (v.kind === 'limited') return json({ ok: true, stored: false, skipped: 'rate-limited' }, 429);
  if (v.kind === 'unavailable') return json({ ok: true, stored: false, skipped: 'unverified' }, 503);
  const storeOk = v.kind === 'trial' && (v.trial.store === 'APP_STORE' ? rec.platform === 'ios' : rec.platform === 'android');
  if (v.kind === 'not_trial' || !storeOk) {
    // RC 에 체험이 없다(유료·만료·없는 고객·다른 스토어) → 대상·기록에서 뺀다
    await dropToken(token, now);
    return json({ ok: true, stored: true, due: false, verified: false });
  }
  const trial = (v as Extract<typeof v, { kind: 'trial' }>).trial;
  const uh = trialUidHash(uid);
  const out: TrialPushRecord = { ...rec, expiresAt: trial.expiresAt, willRenew: trial.willRenew, periodType: trial.periodType, store: trial.store, verified: true };
  const ttl = Math.max(60, Math.ceil((out.expiresAt - now) / 1000) + KEEP_AFTER_EXPIRY_S);
  // RC 고객 하나 = 토큰 하나 — 같은 체험을 다른 토큰으로 보고하면 옛 토큰을 대상에서 뺀다.
  //   단 옛 토큰의 주인이 «지금도 이 고객»일 때만, 확인과 삭제를 한 번에(Lua — 관문 11121018 ②·11121021 ①)
  const uidKey = TRIAL_PUSH_UID_KEY(uh);
  const prevTok = await redis.get<string>(uidKey);
  if (typeof prevTok === 'string' && prevTok && prevTok !== token) {
    await redis.eval(DROP_IF_OWNER_LUA, [TRIAL_PUSH_OWNER_KEY(prevTok), TRIAL_PUSH_DUE_ZSET, TRIAL_PUSH_KEY(prevTok), TRIAL_PUSH_SEQ_KEY(prevTok)], [uh, prevTok, String(now), SEQ_TTL]);
  }
  // 주인 표식 · 기록 · 고객→토큰 묶음 · 대상 목록을 «한 번에» 쓴다 — 늦게 끝난 다른 고객 요청이 주인과 기록을 서로 다른 고객으로 엇갈리게 하지 못한다(관문 11121033)
  const due = trialPushWanted(out);
  //   늦게 시작한 다른 요청(같은 토큰의 해제·갱신 켬, 같은 고객의 다른 토큰)이 이미 썼으면 쓰지 않는다(순서표 — 관문 11121052 ①③)
  const wrote = await redis.eval(WRITE_VERIFIED_LUA, [TRIAL_PUSH_OWNER_KEY(token), TRIAL_PUSH_KEY(token), TRIAL_PUSH_DUE_ZSET, uidKey, TRIAL_PUSH_SEQ_KEY(token), TRIAL_PUSH_UIDSEQ_KEY(uh)],
    [uh, JSON.stringify(out), String(ttl), String(out.expiresAt), due ? '1' : '0', token, String(now), SEQ_TTL]);
  if (Number(wrote) !== 1) return json({ ok: true, stored: false, skipped: 'stale' }, 409);
  return json({ ok: true, stored: true, due, verified: true });
}
