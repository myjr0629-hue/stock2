import { NextRequest, NextResponse } from 'next/server';
import { couponHtml } from '@/lib/marketing/couponHtml';
import { desktopRedeemHtml } from '@/lib/marketing/desktopHandoff';
import { isPreviewBot, UA_BOT_RE } from '@/lib/marketing/clickHuman';
import { previewHtml, previewResponseInit, visitorLang } from '@/lib/marketing/linkPreview';
import { normalizeFrom } from '@/lib/marketing/storeRedirect';
import { giftToken, installUrl } from './config';
import { giftHeaders, giftIdentity, giftOs, setGiftCookie } from './http';

/** GET·HEAD는 Redis 호출 없이 기존 쿠폰·QR 템플릿만 렌더한다. */
export async function giftLanding(req: NextRequest): Promise<NextResponse> {
  const os = giftOs(req);
  const token = giftToken(req.nextUrl.searchParams.get('gift'));
  const headers = { ...previewResponseInit().headers, ...giftHeaders, vary: 'User-Agent, Cookie' };
  if (!token) return NextResponse.redirect(installUrl(os), { status: 302, headers });
  const lang = visitorLang('gift', req.nextUrl.searchParams.get('l'), req.headers.get('accept-language'));
  const ua = req.headers.get('user-agent') || '';
  if (isPreviewBot(ua) || UA_BOT_RE.test(ua)) {
    // OG 주소에도 토큰을 복제하지 않는다.
    return new NextResponse(req.method === 'HEAD' ? null : previewHtml('signum', lang, 'https://www.signumhq.com/app', installUrl(os), false), { headers });
  }
  const identity = giftIdentity(req);
  const fromTag = normalizeFrom(req.nextUrl.searchParams.get('from')) || 'gift';
  const masked = '•••• •••• •••• ••••';
  const html = os ? couponHtml({ platform: os, lang, fromTag: 'gift', code: masked, gift: token,
    appleRedeemUrl: installUrl('ios'), playInstallUrl: installUrl('android') })
    : await desktopRedeemHtml({ fromTag, lang, code: masked, gift: token,
      redeemUrl: `https://www.signumhq.com/app?gift=${encodeURIComponent(token)}&l=${lang}`,
      coupon: true, androidCoupon: true });
  const res = new NextResponse(req.method === 'HEAD' ? null : html, { headers });
  return identity ? setGiftCookie(res, identity.cookie) : res;
}
