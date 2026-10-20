import { NextRequest, NextResponse } from 'next/server';
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
    const account = await giftAccount(req);
    const gift = await issueGift(store, { ...identity, ip, account });
    const response = gift ? NextResponse.json({ ok: true, ...gift }, { headers: giftHeaders }) : fallback();
    return setGiftCookie(response, identity.cookie);
  } catch { return fallback(); }
}
