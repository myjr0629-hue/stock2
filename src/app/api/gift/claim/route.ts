import { NextRequest, NextResponse, after } from 'next/server';
import { giftFunnelTask } from '@/lib/giftShare/funnelServer';
import { giftEnabled, installUrl } from '@/lib/giftShare/config';
import { claimGift, giftStore } from '@/lib/giftShare/server';
import { giftAccount, giftHeaders, giftIdentity, giftOs, setGiftCookie, validGiftPost } from '@/lib/giftShare/http';

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const os = giftOs(req);
  const valid = validGiftPost(req);
  const metric = (stage: string, detail = 'all') => {
    if (valid) {
      const task = giftFunnelTask(req, stage, 'all', os ?? 'desktop', detail);
      if (task) after(task);
    }
  };
  const fallback = (reason?: string) => {
    if (reason) metric('claim', reason);
    return NextResponse.redirect(installUrl(os), { status: 303, headers: giftHeaders });
  };
  if (!valid) return fallback();
  // 기존 폼의 제출 = 등록 버튼 탭. 스토어 등록·구독 완료를 의미하지 않는다.
  metric('redeem');
  if (!giftEnabled()) return fallback('disabled');
  if (!os) return fallback('os');
  try {
    const identity = giftIdentity(req);
    // 쿠키 없는 POST는 배정하지 않는다. 응답 유실 뒤에도 같은 수신자를 복원하기 위함이다.
    if (!identity?.validCookie) return fallback('cookie');
    const type = req.headers.get('content-type') || '';
    if (!type.startsWith('application/x-www-form-urlencoded') || Number(req.headers.get('content-length') || 0) > 2048) return fallback('body');
    const form = await req.formData();
    const store = giftStore();
    if (!store) return fallback('store');
    const account = await giftAccount(req);
    const url = await claimGift(store, { token: form.get('gift'), os, device: identity.device, account }, Date.now(), status => metric('claim', status));
    return setGiftCookie(url ? NextResponse.redirect(url, { status: 303, headers: giftHeaders }) : fallback(), identity.cookie);
  } catch { return fallback('error'); }
}
