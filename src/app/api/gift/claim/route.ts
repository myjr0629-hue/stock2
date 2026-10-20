import { NextRequest, NextResponse } from 'next/server';
import { giftEnabled, installUrl } from '@/lib/giftShare/config';
import { claimGift, giftStore } from '@/lib/giftShare/server';
import { giftAccount, giftHeaders, giftIdentity, giftOs, setGiftCookie, validGiftPost } from '@/lib/giftShare/http';

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const os = giftOs(req);
  const fallback = () => NextResponse.redirect(installUrl(os), { status: 303, headers: giftHeaders });
  if (!giftEnabled() || !os || !validGiftPost(req)) return fallback();
  try {
    const identity = giftIdentity(req);
    // 쿠키 없는 POST는 배정하지 않는다. 응답 유실 뒤에도 같은 수신자를 복원하기 위함이다.
    if (!identity?.validCookie) return fallback();
    const type = req.headers.get('content-type') || '';
    if (!type.startsWith('application/x-www-form-urlencoded') || Number(req.headers.get('content-length') || 0) > 2048) return fallback();
    const form = await req.formData();
    const store = giftStore();
    if (!store) return fallback();
    const account = await giftAccount(req);
    const url = await claimGift(store, { token: form.get('gift'), os, device: identity.device, account });
    return setGiftCookie(url ? NextResponse.redirect(url, { status: 303, headers: giftHeaders }) : fallback(), identity.cookie);
  } catch { return fallback(); }
}
