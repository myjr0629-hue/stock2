import { NextRequest, NextResponse, after } from 'next/server';
import { UA_BOT_RE, isPreviewBot } from '@/lib/marketing/clickHuman';
import { validEvent } from '@/lib/giftShare/funnel.cjs';
import { bumpGiftFunnel } from '@/lib/giftShare/funnelServer';

export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const e = q.get('e') || '', s = q.get('s') || '', p = q.get('p') || '', d = q.get('d') || '';
  const ua = req.headers.get('user-agent') || '';
  // open/claim/redeem은 서버에서만 확정한다.
  let originOk = false;
  try {
    const origin = req.headers.get('origin');
    originOk = !origin || origin === 'null' || ['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'https://localhost'].includes(origin) || new URL(origin).origin === req.nextUrl.origin;
  } catch { /* 불명 출처 거부 */ }
  if (originOk && !UA_BOT_RE.test(ua) && !isPreviewBot(ua) && !['open', 'claim', 'redeem'].includes(e) && validEvent(e, s, p, d)) {
    after(() => bumpGiftFunnel(e, s, p, d));
  }
  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
