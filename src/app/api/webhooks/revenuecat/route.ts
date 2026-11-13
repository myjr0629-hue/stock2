import { giftStore } from '@/lib/giftShare/server';
import { authorized, insert, normalize } from '@/lib/rcCohort/core';
import { ensurePromoYear, promoYearUidFromWebhook } from '@/lib/promoYear/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request): Promise<Response> {
  const auth = process.env.REVENUECAT_WEBHOOK_AUTH || '';
  const secret = process.env.RC_COHORT_HMAC_SECRET || '';
  if (!auth || !secret) return reply(503);
  if (!authorized(request.headers.get('authorization'), auth)) return reply(401);
  if (Number(request.headers.get('content-length') || 0) > 65536) return reply(413);
  let body: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 65536) return reply(413);
    body = JSON.parse(text);
  } catch { return reply(400); }
  // «1년 PRO 이용권(자동 갱신 없음)» 구매 → 구매 + 365일 프로모셔널 pro (lib/promoYear/core · 2026-11-14)
  //   일시 장애면 503 → RC 가 다시 보낸다(코호트 기록은 이벤트 ID 로 중복 제거). 키가 없으면 앱 경로(/api/app/promo-year)·재처리에 맡기고 막지 않는다.
  const promoUid = promoYearUidFromWebhook(body);
  if (promoUid) {
    const r = await ensurePromoYear(promoUid, { secret: process.env.REVENUECAT_SECRET_API_KEY || '' });
    if (r.kind === 'unavailable' && r.why !== 'no_key') return reply(503);
  }
  const item = normalize(body, secret);
  if (!item) return reply(400);
  if (item === 'ignore') return reply(200);
  const store = giftStore();
  if (!store) return reply(503);
  try { await insert(store, item); return reply(200); }
  catch { return reply(503); }
}
