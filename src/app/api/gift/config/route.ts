import { NextResponse } from 'next/server';
import { giftConfig } from '@/lib/gift/giftConfig';

// ============================================================================
// GET /api/gift/config — «친구에게 PRO 1개월 선물» 입구가 보일지·어떤 코드로 링크를 만들지 (2026-10-06, 브랜치 feat/gift-pro)
// ----------------------------------------------------------------------------
//   응답: {live:false} 또는 {live:true, code, android}  — 값은 서버 환경변수 GIFT_PROMO_CODE(저장소에 없음, lib/gift/giftConfig.ts)
//   · 코드는 어차피 모든 선물 링크에 실려 나가는 «공개 쿠폰 번호»다(채널 코드 WEBPRO 등과 같다) — 이 응답이 비밀을 새는 것은 아니다.
//   · 사용자·기기 정보를 읽지도 쓰지도 않는다(레디스 0). CDN 에 60초 두어 앱이 열릴 때마다 함수가 돌지 않게 한다 —
//     끄려면(환경변수 삭제) 최대 60초(+재검증 5분) 안에 입구가 사라진다.
// ============================================================================

export const dynamic = 'force-dynamic';

export async function GET() {
  const cfg = giftConfig();
  return NextResponse.json(cfg, {
    headers: { 'cache-control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' },
  });
}
