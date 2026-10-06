import { NextRequest, NextResponse, after } from 'next/server';
import { normalizeFrom } from '@/lib/marketing/storeRedirect';
import { recordClick, clickDevice, UA_BOT_RE, isPreviewBot } from '@/lib/marketing/clickHuman';
import { isCouponTap } from '@/lib/marketing/coupon';
import { GIFT_FROM, normalizeGiftRef } from '@/lib/gift/gift';

// ============================================================================
// POST /api/coupon/event?ev=<apply|play|copy|install>&f=<from> — 쿠폰 화면 단추 비콘 (2026-10-05, 브랜치 feat/coupon-ux)
// ----------------------------------------------------------------------------
//   lib/marketing/couponHtml.ts 의 단추가 navigator.sendBeacon 으로 보낸다(본문 없음, 값은 쿼리 — 전부 닫힌 목록).
//   저장: clk:coupon:<from>:<ET날짜> 필드 «<기기>|tap:<단추>» — EC2 전용 키(clk:), 미리보기는 clkp:(운영 숫자 오염 없음).
//   선물 링크(f=gift)는 &r=<익명 초대자 id> 가 있으면 clk:gift:<ref>:<ET날짜> 에도 같은 필드를 더한다(2026-10-06, lib/gift).
//   응답은 항상 204 — 집계 실패가 이동을 막지 않는다(쓰기는 응답 뒤 after()). 패턴 출처: /api/funnel-hit.
//   싣지 않는 것: IP·기기 식별자. 헤더는 봇 판정·출처 확인에만 쓴다.
// ============================================================================

export const dynamic = 'force-dynamic';

/** 다른 사이트가 숫자를 부풀리지 못하게 — 오리진이 있으면 우리 것이어야 한다(/api/funnel-hit 와 같은 규칙). */
function originOk(req: NextRequest): boolean {
  const o = req.headers.get('origin');
  if (!o || o === 'null') return true;
  try {
    const h = new URL(o).hostname;
    return h === 'signumhq.com' || h.endsWith('.signumhq.com') || h.endsWith('.vercel.app') || h === 'localhost';
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ev = q.get('ev');
  const from = normalizeFrom(q.get('f'));
  const ua = req.headers.get('user-agent') || '';
  const human = /Mozilla\//.test(ua) && !UA_BOT_RE.test(ua) && !isPreviewBot(ua) && !!(req.headers.get('accept-language') || '').trim();
  if (isCouponTap(ev) && from && human && originOk(req)) {
    const field = `${clickDevice(ua)}|tap:${ev}`;
    after(() => recordClick('coupon', from, [field]));
    // ★2026-10-06 선물 링크(from=gift)면 같은 단추를 «초대자별» 칸(clk:gift:<ref>)에도 센다 — ref 는 형식 검사를 통과한 익명 id 만(lib/gift/gift.ts)
    const giftRef = from === GIFT_FROM ? normalizeGiftRef(q.get('r')) : null;
    if (giftRef) after(() => recordClick('gift', giftRef, [field]));
  }
  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
