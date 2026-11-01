import { giftStore } from '@/lib/giftShare/server';
import { authorized, insert, normalize } from '@/lib/rcCohort/core';

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
  if (item === 'ignore') return reply(200);
  const store = giftStore();
  if (!store) return reply(503);
  try { await insert(store, item); return reply(200); }
  catch { return reply(503); }
}
