import { NextRequest, NextResponse, after } from 'next/server';
import { normalizeFrom } from '@/lib/marketing/storeRedirect';
import { recordClick, clickDevice, UA_BOT_RE, isPreviewBot } from '@/lib/marketing/clickHuman';
import { isInAppTap } from '@/lib/marketing/androidInApp';

// ============================================================================
// POST /api/inapp/event?ev=<market|web>&f=<from> — 안드로이드 «앱 안 브라우저» 화면 단추 비콘 (2026-10-05, 브랜치 fix/android-inapp-play)
// ----------------------------------------------------------------------------
//   lib/marketing/androidInApp.ts 의 단추가 navigator.sendBeacon 으로 보낸다(본문 없음, 값은 쿼리 — 전부 닫힌 목록).
//     market = «Play 스토어에서 열기»(intent → Play 스토어 앱) · web = «안 열리면 여기»(https Play 주소)
//   저장: clk:inapp:<from>:<ET날짜> 필드 «<기기>|tap:<단추>» — EC2 전용 키(clk:), 미리보기는 clkp:(운영 숫자 오염 없음).
//   응답은 항상 204 — 집계 실패가 이동을 막지 않는다(쓰기는 응답 뒤 after()). 패턴 출처: /api/coupon/event(같은 규칙).
//   싣지 않는 것: IP·기기 식별자. 헤더는 봇 판정·출처 확인에만 쓴다.
// ============================================================================

export const dynamic = 'force-dynamic';

/** 다른 사이트가 숫자를 부풀리지 못하게 — 오리진이 있으면 우리 것이어야 한다(/api/coupon/event 와 같은 규칙). */
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
  if (isInAppTap(ev) && from && human && originOk(req)) {
    const field = `${clickDevice(ua)}|tap:${ev}`;
    after(() => recordClick('inapp', from, [field]));
  }
  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
