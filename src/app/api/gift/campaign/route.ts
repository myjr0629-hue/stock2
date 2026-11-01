import { NextRequest, NextResponse, after } from 'next/server';
import { giftFunnelTask } from '@/lib/giftShare/funnelServer';
import { giftEnabled, installUrl } from '@/lib/giftShare/config';
import { campaignUntil, claimCampaign, giftCampaign, type CampaignResult } from '@/lib/giftShare/campaign';
import { giftStore } from '@/lib/giftShare/server';
import { giftAccount, giftHeaders, giftIdentity, giftIp, giftOs, setGiftCookie, validGiftPost } from '@/lib/giftShare/http';
import { campaignResultHtml, campaignSubline, type CampaignView } from '@/lib/marketing/couponHtml';
import { nextKstMidnight } from '@/lib/marketing/coupon';
import { visitorLang } from '@/lib/marketing/linkPreview';
import { normalizeFrom } from '@/lib/marketing/storeRedirect';
import { isInviteFrom } from '@/lib/invite/kinds';
import { isAndroidInAppBrowser } from '@/lib/marketing/androidInApp';

/**
 * POST /api/gift/campaign — 공개 캠페인 쿠폰 화면의 등록 버튼(같은 출처 폼). 2026-11-01.
 * 방어는 선물 등록(/api/gift/claim)과 같다: 사람 브라우저 UA·같은 출처 Origin·Fetch Metadata · 서버 서명 수신자 쿠키 필수 · 작은 폼 본문.
 * 더해 IP 하루 상한·캠페인 하루/전체 상한·선물 몫(reserve)을 한 Lua 에서 검사한다(src/lib/giftShare/campaign.ts).
 * 성공: 아이폰 → 애플 등록 주소 303(원탭) · 안드로이드 → 내 쿠폰 번호 화면(복사·Play 등록·② 구독 안내).
 * 실패: 사실대로의 안내 화면(이미 받음·오늘 몫 끝·모두 소진·지금 발급 불가·다시 시도) + 앱 설치. 코드·토큰은 로그에 남기지 않는다.
 */
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  const os = giftOs(req);
  const valid = validGiftPost(req);
  const metric = (stage: string, detail = 'all') => {
    if (valid) {
      const task = giftFunnelTask(req, stage, 'camp', os ?? 'desktop', detail);
      if (task) after(task);
    }
  };
  const redirect = (reason?: string) => {
    if (reason) metric('claim', reason);
    return NextResponse.redirect(installUrl(os), { status: 303, headers: giftHeaders });
  };
  if (!valid) return redirect();
  metric('redeem');
  if (!os) return redirect('os');
  const type = req.headers.get('content-type') || '';
  if (!type.startsWith('application/x-www-form-urlencoded') || Number(req.headers.get('content-length') || 0) > 2048) return redirect('body');
  let form: FormData;
  try { form = await req.formData(); } catch { return redirect('body'); }
  const campaign = giftCampaign(form.get('camp'));
  if (!campaign) return redirect('invalid');
  const rawFrom = normalizeFrom(typeof form.get('from') === 'string' ? form.get('from') as string : null);
  const fromTag = rawFrom && !isInviteFrom(rawFrom) ? rawFrom : null;
  const l = form.get('l');
  const lang = visitorLang(fromTag, typeof l === 'string' ? l : null, req.headers.get('accept-language'));
  const view = { id: campaign.id, from: fromTag, sub: campaignSubline(lang, fromTag, campaignUntil(campaign, lang, ' ')) };
  const androidInApp = os === 'android' && isAndroidInAppBrowser({ userAgent: req.headers.get('user-agent') || '',
    requestedWith: req.headers.get('x-requested-with'), nativeCookie: req.cookies.get('sig_native')?.value ?? null });
  const page = (v: CampaignView, extra: { code?: string; resetAt?: number } = {}) => new NextResponse(
    campaignResultHtml({ platform: os, lang, view: v, campaign: view, installUrl: installUrl(os), androidInApp, ...extra }),
    { headers: { ...giftHeaders, 'content-type': 'text/html; charset=utf-8', vary: 'User-Agent, Cookie' } });
  const identity = giftIdentity(req);
  const withCookie = (res: NextResponse) => identity ? setGiftCookie(res, identity.cookie) : res;
  if (!giftEnabled()) { metric('claim', 'disabled'); return page('off'); }
  // 쿠키 없는 POST 는 배정하지 않는다(응답 유실 뒤 같은 수신자 복원). 새 서명 쿠키를 주고 «다시 시도» 폼을 보인다.
  if (!identity) { metric('claim', 'error'); return page('err'); }
  if (!identity.validCookie) { metric('claim', 'cookie'); return withCookie(page('err')); }
  const now = Date.now();
  try {
    const store = giftStore();
    const ip = giftIp(req);
    if (!store || !ip) { metric('claim', 'store'); return withCookie(page('err')); }
    const account = await giftAccount(req);
    const result: CampaignResult = await claimCampaign(store, { campaign, os, device: identity.device, account, ip, from: fromTag || 'direct' },
      now, status => metric('claim', status));
    if (result.status === 'new' || result.status === 'again') {
      return withCookie(os === 'ios'
        ? NextResponse.redirect(result.url, { status: 303, headers: giftHeaders })
        : page(result.status === 'again' ? 'again' : 'code', { code: result.code }));
    }
    if (result.status === 'recipient') return withCookie(page('recipient'));
    if (result.status === 'cap') {
      const next = nextKstMidnight(now);
      // 다음 배정 시각이 마감 뒤면 «내일 다시»는 사실이 아니다 → 발급 불가 안내.
      return withCookie(next >= campaign.endsAt ? page('off') : page('cap', { resetAt: next }));
    }
    if (result.status === 'empty' || result.status === 'total') return withCookie(page('empty'));
    // reserve = 선물 몫만 남음(전체 소진 아님) → «지금은 발급할 수 없습니다»가 사실이다.
    if (result.status === 'off' || result.status === 'ip' || result.status === 'reserve') return withCookie(page('off'));
    return withCookie(page('err'));
  } catch { metric('claim', 'error'); return withCookie(page('err')); }
}
