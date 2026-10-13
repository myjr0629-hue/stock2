import { NextResponse } from 'next/server';
import { inviteConfig } from '@/lib/invite/engine';
import { giftConfig } from '@/lib/gift/giftConfig';

// ============================================================================
// GET /api/invite/config — 공유 카드 단추·선물함이 보일지 (2026-10-14, 브랜치 feat/viral-loop)
// ----------------------------------------------------------------------------
//   응답: {share:boolean, rewards:boolean, code:string|null, android:boolean}
//   · share   = 공유 단추를 그릴지 — 끄기 스위치 INVITE_SHARE_OFF=1 (재배포 없이 환경변수만)
//   · rewards = 초대자 보상(선물함 번호 배정)이 켜져 있나 — INVITE_REWARD=1
//   · code    = 선물 맞춤 코드(GIFT_PROMO_CODE — 서버 환경변수, 저장소에 없음)가 «살아 있을 때만» — 받는 쪽 페이지가 CTA 에 붙여 쿠폰 화면이 먼저 뜬다. 공개 쿠폰 번호라 이 응답이 비밀을 새는 것은 아니다.
//   · android = 안드로이드 쿠폰(내 쿠폰 받기)이 켜져 있나
//   사용자·기기 정보를 읽지도 쓰지도 않는다(레디스 0). CDN 에 60초(+재검증 5분) — 끄면 최대 6분 안에 입구가 사라진다.
// ============================================================================

export const dynamic = 'force-dynamic';

export async function GET() {
  const i = inviteConfig();
  const g = giftConfig();
  return NextResponse.json(
    { share: i.share, rewards: i.rewards, code: g.live ? g.code : null, android: g.live ? g.android : false },
    { headers: { 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } },
  );
}
