// ============================================================================
// /api/cron/bf-push — 블랙프라이데이 «앱 밖» 안내 푸시(2026-11-26 · 규칙 lib/push/bfPush 머리말). Vercel Cron 매시 :37 (vercel.json).
//   기간(11/27 00:00 UTC ~ 12/2 07:00 UTC) 밖·끄기 켜짐이면 아무것도 읽지 않고 끝난다.
//   ?dry=1 — 보내지 않고 대상 수·이유·문구 미리보기만(자리·통계 안 씀 · 발송 금지 창과 무관).
//   ?off=1 끄기 / ?off=0 다시 켜기(Upstash bf-push:off) — 인증 필요 · 응답에 상태만.
// Auth: Authorization: Bearer ${CRON_SECRET} (또는 ?secret=) — 다른 크론과 같다.
// ============================================================================
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { sendSignalPushes } from '@/lib/push/sendSignal';
import { etDay } from '@/lib/app/funnelSchema';
import { BF_KEYS, bfPushEnvOff, runBfPush, type BfStore } from '@/lib/push/bfPush';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const redis = Redis.fromEnv();

const store: BfStore = {
  smembers: (k) => redis.smembers(k) as Promise<string[]>,
  mget: async (keys) => (keys.length ? ((await redis.mget(...keys)) as unknown[]) : []),
  setNx: async (k, v, ttl) => (await redis.set(k, v, { nx: true, ex: ttl })) === 'OK',
  incr: async (k, ttl) => {
    const p = redis.pipeline();
    p.incr(k);
    p.expire(k, ttl);
    const out = (await p.exec()) as unknown[];
    return Number(out[0]);
  },
  get: (k) => redis.get(k),
  hincr: async (k, fields, ttl) => {
    const p = redis.pipeline();
    for (const [f, n] of Object.entries(fields)) if (n) p.hincrby(k, f, n);
    p.expire(k, ttl);
    await p.exec();
  },
};

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const ok = request.headers.get('authorization') === `Bearer ${cronSecret}` || searchParams.get('secret') === cronSecret;
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const noStore = { headers: { 'Cache-Control': 'no-store' } };
  const off = searchParams.get('off');
  if (off === '1' || off === '0') {
    if (off === '1') await redis.set(BF_KEYS.off, '1', { ex: 30 * 86400 });
    else await redis.del(BF_KEYS.off);
    return NextResponse.json({ ok: true, off: off === '1' }, noStore);
  }
  const dry = searchParams.get('dry') === '1';
  try {
    const now = Date.now();
    const res = await runBfPush({ store, send: sendSignalPushes, now, dry, envOff: bfPushEnvOff(), etDay: etDay(new Date(now)) });
    return NextResponse.json(res, noStore);
  } catch (e) {
    console.error('[bf-push]', e);
    return NextResponse.json({ error: 'failed' }, { status: 500, ...noStore });
  }
}
