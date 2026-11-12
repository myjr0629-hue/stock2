// ============================================================================
// /api/cron/trial-push — 체험 종료 D-2 푸시(2026-11-11). Vercel Cron 매시 :17 (vercel.json).
//   대상 목록(push:trial:due, 점수 = 만료 시각)에서 «남은 12~48시간»을 쪽(1000)씩 최대 5쪽 읽어 lib/push/trialPush.trialPushDecision 으로
//   거른 뒤 기기 언어·시간대로 한 통씩 보낸다(iOS APNs · 안드 FCM — lib/push/sendSignal 재사용). 본문은 갱신 상태를 단정하지 않는다.
//   중복 방지: 보내기 «전에» push:trial:sent:<token> 을 SET NX(25일)로 잡는다 — 동시 실행·저장 실패·함수 종료에도 한 번만.
//     실패(fail — 응답 유실 포함)도 자리를 놓지 않는다(중복보다 한 통 누락을 택함). 체험 기록은 이 크론이 «쓰지 않는다»
//     (앱이 갱신을 다시 켠 보고를 덮어쓰지 않게). 보내기 직전에 기록을 한 번 더 읽어 아직 대상인지 확인한다.
//   상한: 회차 100 · 하루(ET) 300 «발송 시도»(INCR 로 먼저 예약 — 겹친 실행도 넘지 못한다) — 가짜 토큰 대량 등록으로 공급사 호출을 키우지 못하게.
//   ?dry=1 — 보내지 않고 대상·이유·문구만 돌려준다(표식·통계 안 씀).
//   통계: push:stats:trial:{ET날짜} (TTL 60일) — 후보·보냄·실패·이유별 건너뜀.
// Auth: Authorization: Bearer ${CRON_SECRET} (또는 ?secret=) — 다른 크론과 같다.
// ============================================================================
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { parseRecord } from '@/lib/push/prefs';
import { sendSignalPushes, type SignalPushItem } from '@/lib/push/sendSignal';
import { etDay } from '@/lib/app/funnelSchema';
import {
  TRIAL_PUSH_DATA, TRIAL_PUSH_DAY_KEY, TRIAL_PUSH_DUE_ZSET, TRIAL_PUSH_KEY, TRIAL_PUSH_MAX_MS, TRIAL_PUSH_MAX_PER_DAY, TRIAL_PUSH_MAX_PER_RUN,
  TRIAL_PUSH_MIN_MS, TRIAL_PUSH_SCAN_LIMIT, TRIAL_PUSH_SCAN_PAGES, TRIAL_PUSH_SENT_KEY, TRIAL_PUSH_SENT_TTL_S,
  trialPushContent, trialPushDecision, type TrialPushRecord,
} from '@/lib/push/trialPush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const redis = Redis.fromEnv();
type TokenRec = { app?: string; platform?: string; preferences?: { enabled?: boolean }; notifPerm?: boolean; tz?: string; createdAt?: string };

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
    // 지난 만료는 목록에서 걷는다(기록은 TTL 로 사라진다)
    if (!dry) await redis.zremrangebyscore(TRIAL_PUSH_DUE_ZSET, 0, now);
    const skipped: Record<string, number> = {};
    const skip = (k: string) => { skipped[k] = (skipped[k] || 0) + 1; };
    const picked: Array<{ token: string; rec: TrialPushRecord; tokenRec: TokenRec | null }> = [];
    let candidates = 0;
    // 쪽 단위로 읽는다 — 앞쪽이 알림 꺼짐 등으로 계속 제외돼도 뒤쪽 정상 대상이 굶지 않게
    for (let page = 0; page < TRIAL_PUSH_SCAN_PAGES && picked.length < TRIAL_PUSH_MAX_PER_RUN; page++) {
      const tokens = ((await redis.zrange(TRIAL_PUSH_DUE_ZSET, now + TRIAL_PUSH_MIN_MS, now + TRIAL_PUSH_MAX_MS,
        { byScore: true, offset: page * TRIAL_PUSH_SCAN_LIMIT, count: TRIAL_PUSH_SCAN_LIMIT })) || []) as string[];
      candidates += tokens.length;
      for (let i = 0; i < tokens.length && picked.length < TRIAL_PUSH_MAX_PER_RUN; i += 50) {
        const chunk = tokens.slice(i, i + 50);
        const [trialRaw, tokenRaw, sentRaw] = await Promise.all([
          redis.mget<unknown[]>(...chunk.map((t) => TRIAL_PUSH_KEY(t))),
          redis.mget<unknown[]>(...chunk.map((t) => `push:tokens:${t}`)),
          redis.mget<unknown[]>(...chunk.map((t) => TRIAL_PUSH_SENT_KEY(t))),
        ]);
        chunk.forEach((token, j) => {
          if (picked.length >= TRIAL_PUSH_MAX_PER_RUN) { skip('run_cap'); return; }
          const rec = parseRecord<TrialPushRecord>(trialRaw[j]);
          const tokenRec = parseRecord<TokenRec>(tokenRaw[j]);
          const d = trialPushDecision(rec, tokenRec, now, sentRaw[j] != null);
          if (d !== 'send' || !rec) { skip(d); return; }
          picked.push({ token, rec, tokenRec });
        });
      }
      if (tokens.length < TRIAL_PUSH_SCAN_LIMIT) break;
    }
    const dayKey = TRIAL_PUSH_DAY_KEY(etDay(new Date(now)));
    if (dry) {
      return NextResponse.json({ ok: true, dry: true, candidates, attemptsToday: Number(await redis.get(dayKey)) || 0, send: picked.length, skipped,
        preview: picked.map(({ rec, tokenRec }) => ({ platform: rec.platform, locale: rec.locale, title: trialPushContent(rec, tokenRec?.tz).title, hoursLeft: Math.round((rec.expiresAt - now) / 3600_000) })) });
    }

    // 자리 잡기(SET NX) → 하루 상한 예약(INCR) → 보내기 직전 기록 재확인 → 보내기
    const items: SignalPushItem[] = [];
    for (const { token, rec, tokenRec } of picked) {
      const claimed = await redis.set(TRIAL_PUSH_SENT_KEY(token), String(rec.expiresAt), { nx: true, ex: TRIAL_PUSH_SENT_TTL_S });
      if (claimed !== 'OK') { skip('sent'); continue; }
      const fresh = parseRecord<TrialPushRecord>(await redis.get(TRIAL_PUSH_KEY(token)));
      if (trialPushDecision(fresh, tokenRec, now, false) !== 'send' || fresh!.expiresAt !== rec.expiresAt) {
        await redis.del(TRIAL_PUSH_SENT_KEY(token));
        skip('changed');
        continue;
      }
      const n = await redis.incr(dayKey);
      if (n === 1) await redis.expire(dayKey, 3 * 86400).catch(() => {});
      if (n > TRIAL_PUSH_MAX_PER_DAY) {
        await redis.del(TRIAL_PUSH_SENT_KEY(token));
        skip('day_cap');
        break;
      }
      const content = trialPushContent(fresh!, tokenRec?.tz);
      items.push({ id: token, token, platform: fresh!.platform, title: content.title, body: content.body, data: TRIAL_PUSH_DATA, quiet: false, thread: 'trial_end' });
    }
    const out = items.length ? await sendSignalPushes(items) : new Map();
    let sent = 0, failed = 0, dead = 0;
    for (const it of items) {
      const r = out.get(it.id);
      if (r === 'ok') { sent++; await redis.zrem(TRIAL_PUSH_DUE_ZSET, it.token); }
      else if (r === 'dead') { dead++; await redis.zrem(TRIAL_PUSH_DUE_ZSET, it.token); }
      else failed++;   // 실패(응답 유실·시간 초과 포함)도 표식을 «놓지 않는다» — 공급사가 받았는데 응답만 끊긴 경우 두 번 가지 않게(관문 11110931). 한 통 놓치는 쪽을 택한다
    }
    const statsKey = `push:stats:trial:${etDay(new Date(now))}`;
    const prev = parseRecord<Record<string, number>>(await redis.get(statsKey)) || {};
    const stats: Record<string, number> = { ...prev, runs: (prev.runs || 0) + 1, candidates: (prev.candidates || 0) + candidates, sent: (prev.sent || 0) + sent, failed: (prev.failed || 0) + failed, dead: (prev.dead || 0) + dead };
    for (const [k, v] of Object.entries(skipped)) stats[`skip_${k}`] = (prev[`skip_${k}`] || 0) + v;
    await redis.set(statsKey, JSON.stringify(stats), { ex: 60 * 86400 });
    return NextResponse.json({ ok: true, candidates, sent, failed, dead, skipped });
  } catch (e: any) {
    console.error('[Cron/TrialPush]', e?.message || e);
    return NextResponse.json({ ok: false, error: 'trial push failed' }, { status: 500 });
  }
}
