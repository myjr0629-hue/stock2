/**
 * «친구에게 PRO 1개월 선물» 서버 설정 — 2026-10-06 (브랜치 feat/gift-pro)
 *
 * 선물 맞춤 코드(애플 오퍼 «SIGNUM PRO 1 Month Free (Launch)» 의 맞춤 코드 — 500회·만료 2026-10-31)의 «값»은 이 공개 저장소에 없다.
 *   서버 환경변수 GIFT_PROMO_CODE 로만 들어온다(Vercel 프로젝트 설정). 앱은 /api/gift/config 로 읽는다.
 *   · 변수 없음 · 형식 아님 · 만료 뒤(linkPreview.isLivePromoCode — 같은 2026-10-31 07:00Z) → live:false → 앱 어디에도 선물 입구가 안 그려진다(킬 스위치).
 *   · android = 안드로이드 쿠폰(내 쿠폰 받기, COUPON_ANDROID=1 + Play 프로모션 종료 전)이 «지금 켜져 있나» — 꺼져 있으면 앱 문구가 «아이폰 친구용»으로 바뀐다.
 * 순수 함수(환경·시각을 인자로 받는다) — tests/gift.test.ts 가 고정한다.
 */
import { isLivePromoCode } from '@/lib/marketing/linkPreview';
import { androidCouponFlag, androidCouponLive } from '@/lib/marketing/coupon';

export type GiftServerConfig = { live: false } | { live: true; code: string; android: boolean };

export function giftConfig(
  env: Record<string, string | undefined> = process.env,
  now = Date.now(),
): GiftServerConfig {
  const code = (env.GIFT_PROMO_CODE || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,24}$/.test(code) || !isLivePromoCode(code, now)) return { live: false };
  return { live: true, code, android: androidCouponLive(now, androidCouponFlag(env.COUPON_ANDROID)) };
}
