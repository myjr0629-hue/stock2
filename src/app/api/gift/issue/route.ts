import { NextRequest, NextResponse, after } from 'next/server';
import { giftFunnelTask } from '@/lib/giftShare/funnelServer';
import { giftEnabled, installUrl } from '@/lib/giftShare/config';
import { giftStore, issueGift } from '@/lib/giftShare/server';
import { giftAccount, giftHeaders, giftIdentity, giftIp, giftOs, setGiftCookie, validGiftPost } from '@/lib/giftShare/http';

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const fallback = () => NextResponse.json({ ok: false, url: installUrl(giftOs(req)) }, { headers: giftHeaders });
  if (!giftEnabled() || !validGiftPost(req)) return fallback();
  try {
    const identity = giftIdentity(req);
    const ip = giftIp(req);
    const store = giftStore();
    if (!identity || !ip || !store) return fallback();
    // JSON {token, at}. 사전 예약 경로도 이 처리를 재사용한다. 최초 성공 시각의 날짜 한도를 확보한다.
    if (!(req.headers.get('content-type') || '').startsWith('application/json') || Number(req.headers.get('content-length') || 0) > 512) return fallback();
    const body = await req.json().catch(() => null);
    const account = await giftAccount(req);
    const gift = await issueGift(store, { ...identity, ip, account, token: body?.token, sharedAt: body?.at });
    // 새 예약 성공만 서버에서 확정한다. 멱등 확인(exists)은 중복 집계하지 않는다.
    if (gift?.status === 'issued') {
      const task = giftFunnelTask(req, 'issue', 'all', giftOs(req) ?? 'web', 'new');
      if (task) after(task);
    }
    const response = gift ? NextResponse.json({ ok: true }, { headers: giftHeaders }) : fallback();
    return setGiftCookie(response, identity.cookie);
  } catch { return fallback(); }
}
