import { giftStore } from '@/lib/giftShare/server';
import { authorized, insert, normalize } from '@/lib/rcCohort/core';
import { ensurePromoYear, evalPromoLedger, promoYearFromWebhook, promoYearRefundFromWebhook, recordPromoYearRefund } from '@/lib/promoYear/core';

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
  const item = normalize(body, secret);
  if (!item) return reply(400);
  if (item !== 'ignore') {
    const store = giftStore();
    if (!store) return reply(503);
    try { await insert(store, item); }
    catch { return reply(503); }
  }
  // «1년 PRO 이용권(자동 갱신 없음)» 구매 → 구매 + 365일 프로모셔널 pro (lib/promoYear/core · 2026-11-14)
  //   코호트 기록 «뒤에» 한다(기존 기록이 부여 장애에 막히지 않게). 부여를 못 하면 503 → RC 가 다시 보낸다(코호트는 이벤트 ID 로 중복 제거).
  //   고객 기록에 구매가 아직 안 보이면(반영 지연) 웹훅의 구매 시각을 쓴다 — 웹훅은 인증돼 있다.
  const promo = promoYearFromWebhook(body);
  const refund = promoYearRefundFromWebhook(body);
  if (!promo && !refund) return reply(200);
  const ledgerStore = giftStore();
  if (!ledgerStore) return reply(503);
  const deps = { secret: process.env.REVENUECAT_SECRET_API_KEY || '', ledger: evalPromoLedger(ledgerStore) };
  if (promo) {
    const r = await ensurePromoYear(promo.uid, deps, promo.purchase);
    if (r.kind === 'unavailable') return reply(503);
  }
  // 이 이용권의 환불 → 환불 기록(이후 그 구매로 다시 붙이지 않는다 · 자동 회수는 하지 않는다 — lib/promoYear/core recordPromoYearRefund)
  if (refund && (await recordPromoYearRefund(refund.uid, refund.keys, deps)) === 'unavailable') return reply(503);
  return reply(200);
}
