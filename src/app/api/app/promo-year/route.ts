// ============================================================================
// POST /api/app/promo-year — «1년 PRO 이용권(자동 갱신 없음)» 코드 사용 직후 앱이 부른다(2026-11-14 · lib/promoYear/core)
//   { rcAppUserId } → 200 {ok, status: granted|covered|no_purchase|expired} | 400 bad_request | 429 rate_limited | 503 unavailable
//   · 기기가 보낸 것은 RC 고객 ID 하나뿐 — 붙일지는 서버가 RC 기록(non_subscriptions 에 이 상품 구매)으로만 정한다.
//     남의 ID 를 보내도 그 사람이 실제로 산 기간만큼만(이미 붙었으면 아무 일 없음) — 얻는 것이 없다.
//   · RC v1 GET 은 없는 ID 를 «만든다» → 형식 검사 + 예산(IP 10분 10 · ID 10분 5 · 전체 10분 600) 통과분만 부른다.
//   · 웹훅(/api/webhooks/revenuecat)이 같은 일을 먼저 했으면 'covered' 로 끝난다.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { clientIpFrom } from '@/lib/guruLens/proAccess';
import { ensurePromoYear, evalRefundLedger, RC_UID_RE } from '@/lib/promoYear/core';
import { giftStore } from '@/lib/giftShare/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const h = (kind: string, v: string) => createHash('sha256').update(`promo-year:${kind}:${v}`).digest('hex').slice(0, 24);
export const PROMO_YEAR_BUDGET = { windowS: 600, ip: 10, uid: 5, all: 600 } as const;

// IP → ID → 전체 순서로 센다. 앞 단계에서 걸린 요청은 뒤 카운터를 올리지 않는다(한 IP 가 전체 한도를 태우지 못하게).
//   반환: 0 = 통과 · 1/2/3 = 그 단계에서 걸림
const COUNT_LUA = `for i, k in ipairs(KEYS) do
  local c = redis.call('INCR', k)
  if c == 1 then redis.call('EXPIRE', k, ARGV[1]) end
  if c > tonumber(ARGV[i + 1]) then return i end
end
return 0`;

let _redis: Redis | null = null;
const redis = () => (_redis ??= Redis.fromEnv());

export async function POST(req: NextRequest) {
  if (Number(req.headers.get('content-length') || 0) > 2048) return json({ error: 'bad_request' }, 413);
  let body: unknown;
  try { const t = await req.text(); if (t.length > 2048) return json({ error: 'bad_request' }, 413); body = JSON.parse(t); }
  catch { return json({ error: 'bad_request' }, 400); }
  const uid = (body as { rcAppUserId?: unknown } | null)?.rcAppUserId;
  if (typeof uid !== 'string' || !RC_UID_RE.test(uid)) return json({ error: 'bad_request' }, 400);
  const secret = process.env.REVENUECAT_SECRET_API_KEY || '';
  if (!secret) return json({ error: 'unavailable' }, 503);

  const w = Math.floor(Date.now() / 1000 / PROMO_YEAR_BUDGET.windowS);
  try {
    const c = await redis().eval(COUNT_LUA,
      [`promo-year:v1:rl:ip:${h('ip', clientIpFrom(req.headers) || 'none')}:${w}`, `promo-year:v1:rl:id:${h('id', uid)}:${w}`, `promo-year:v1:rl:all:${w}`],
      [PROMO_YEAR_BUDGET.windowS * 2, PROMO_YEAR_BUDGET.ip, PROMO_YEAR_BUDGET.uid, PROMO_YEAR_BUDGET.all]);
    const code = Number(c);
    if (!Number.isInteger(code) || code < 0 || code > 3) return json({ error: 'unavailable' }, 503);
    if (code > 0) return json({ error: 'rate_limited' }, 429);
  } catch { return json({ error: 'unavailable' }, 503); }

  const ledgerStore = giftStore();
  if (!ledgerStore) return json({ error: 'unavailable' }, 503);
  const r = await ensurePromoYear(uid, { secret, refunds: evalRefundLedger(ledgerStore) });
  if (r.kind === 'unavailable') return json({ error: 'unavailable' }, 503);
  if (r.kind === 'granted') return json({ ok: true, status: 'granted' });
  if (r.why === 'uid') return json({ error: 'bad_request' }, 400);
  return json({ ok: true, status: r.why });
}
