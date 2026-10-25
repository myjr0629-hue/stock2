import { NextRequest, NextResponse, after } from 'next/server';
import { couponHtml } from '@/lib/marketing/couponHtml';
import { desktopRedeemHtml } from '@/lib/marketing/desktopHandoff';
import { classifyClick, isPreviewBot, UA_BOT_RE } from '@/lib/marketing/clickHuman';
import { previewHtml, previewResponseInit, visitorLang } from '@/lib/marketing/linkPreview';
import { normalizeFrom } from '@/lib/marketing/storeRedirect';
import { normalizeGiftRef } from '@/lib/gift/gift';
import { bumpGiftFunnel } from './funnelServer';
import { giftToken, installUrl } from './config';
import { giftHeaders, giftIdentity, giftOs, setGiftCookie } from './http';

/** GET·HEAD는 배정 없이 기존 템플릿을 렌더한다. 사람 GET 열람만 응답 뒤 집계한다. */
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
  // PC → 폰 QR·iPad 이동에서도 초대자 ref 를 잃지 않게 한다(폰에서 연 요청이 추천 터치를 남긴다).
  const ref = normalizeGiftRef(req.nextUrl.searchParams.get('ref'));
  const refQuery = ref ? `&ref=${encodeURIComponent(ref)}` : '';
  const masked = '•••• •••• •••• ••••';
  const html = os ? couponHtml({ platform: os, lang, fromTag: 'gift', code: masked, gift: token,
    appleRedeemUrl: installUrl('ios'), playInstallUrl: installUrl('android') })
    : await desktopRedeemHtml({ fromTag, lang, code: masked, gift: token, giftRef: ref,
      redeemUrl: `https://www.signumhq.com/app?from=${encodeURIComponent(fromTag)}&gift=${encodeURIComponent(token)}&l=${lang}${refQuery}`,
      coupon: true, androidCoupon: true });
  if (classifyClick(req.headers, req.method) === 'human') after(() => bumpGiftFunnel('open', 'all', os ?? 'desktop'));
  const res = new NextResponse(req.method === 'HEAD' ? null : html, { headers });
  return identity ? setGiftCookie(res, identity.cookie) : res;
}
