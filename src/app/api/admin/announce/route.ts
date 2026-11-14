// ============================================================================
// /api/admin/announce — 관리자 전용 «공지 푸시»(문구 지정 · 1회성) (2026-11-14)
//   POST { id, copy: { ko?: {title, body}, ja?: {…}, en: {…} }, path: '/app-view/watchlist' | …, dry?: boolean, platforms?: ['ios','android'] }
//   · dry 가 «정확히 false» 가 아니면 드라이런 — 대상 수·언어/플랫폼 분포·상한 상태만 돌려주고 발송·자리·기록 0.
//   · 규칙(대상·언어·상한·중복·조용한 시간·죽은 토큰·기록)은 lib/push/announce 한 곳.
//   · GET ?id=<공지 ID> — 그 공지의 발송 기록(없으면 null). 비밀번호 대신 같은 인증.
// 인증: Authorization: Bearer <CRON_SECRET> «헤더만»(쿼리 비밀 없음 · x-cron-secret 없음). CRON_SECRET 이 없으면 어디서든 닫힌다(401).
// 응답·로그에 토큰·비밀 없음(숫자와 문구 미리보기만).
// ============================================================================
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { Redis } from '@upstash/redis';
import { sendSignalPushes } from '@/lib/push/sendSignal';
import { ANN_KEYS, parseAnnounceRequest, runAnnounce, type AnnounceStore } from '@/lib/push/announce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return false;
  const h = request.headers.get('authorization') || '';
  if (!/^Bearer\s+/i.test(h)) return false;
  const given = h.replace(/^Bearer\s+/i, '').trim();
  if (!given) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

function redisStore(redis: Redis): AnnounceStore {
  return {
    smembers: (k) => redis.smembers(k) as Promise<string[]>,
    mget: async (keys) => (keys.length ? ((await redis.mget<unknown[]>(...keys)) as unknown[]) : []),
    eval: (script, keys, args) => redis.eval(script, keys, args),
    set: (k, v, ttl) => (ttl > 0 ? redis.set(k, v, { ex: ttl }) : redis.set(k, v)),
    lpush: async (k, v) => { await redis.lpush(k, v); await redis.ltrim(k, 0, 199); },
    srem: (k, members) => (members.length ? redis.srem(k, ...members) : Promise.resolve(0)),
    del: (keys) => (keys.length ? redis.del(...keys) : Promise.resolve(0)),
  };
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }); }
  const parsed = parseAnnounceRequest(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  try {
    const report = await runAnnounce(parsed.req, { store: redisStore(Redis.fromEnv()), send: sendSignalPushes });
    console.log(`[Admin/Announce] id=${report.id} dry=${report.dry} status=${report.status} targets=${report.targets} sent=${report.sent} fail=${report.fail} dead=${report.dead}${report.reason ? ` reason=${report.reason}` : ''}`);
    return NextResponse.json(report, { status: report.status });
  } catch (err: unknown) {
    console.error('[Admin/Announce] failed:', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ ok: false, error: 'announce failed' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-z0-9][a-z0-9-]{2,47}$/.test(id)) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  const redis = Redis.fromEnv();
  const [log, last] = await redis.mget<unknown[]>(ANN_KEYS.log(id), ANN_KEYS.last);
  return NextResponse.json({ ok: true, id, log: log ?? null, last24h: last ?? null });
}
