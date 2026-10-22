/** 앱·웹 공통. 코드 등록 화면의 열림/복귀는 무료 적용의 증거가 아니다.
 *  ja 는 웹 쿠폰 화면의 phrases()가 «、・» 뒤에서만 접으므로 、 로 접힘 자리를 둔다(없으면 320~390px 에서 한 덩어리가 카드 밖으로 넘쳤다 — 10/23). */
export function couponSafetyCopy(locale: 'ko' | 'en' | 'ja', priceString?: string | null): string {
  // 정가는 RevenueCat 월간 패키지의 현지 문자열만 사용한다. 웹 등 가격을 못 읽는 곳은 금액을 생략한다.
  const price = priceString?.trim() ? priceString : null;
  if (locale === 'ko') {
    return `결제 창에 30일 무료가 보일 때만 승인하세요. 금액${price ? `(월 ${price})` : ''}이 바로 청구되는 화면이면 취소하세요.`;
  }
  if (locale === 'ja') {
    return `購入画面に30日間無料と表示された場合のみ、承認してください。${price ? `月${price}` : '金額'}が、すぐに請求される画面なら、キャンセルしてください。`;
  }
  return `Approve only when checkout shows free for 30 days. Cancel if the screen shows an immediate charge${price ? ` (${price}/month)` : ''}.`;
}

/** 스토어 가격을 읽을 수 없는 웹 안내용. 언어로 통화를 추정하지 않는다. */
export const COUPON_SAFETY = {
  ko: couponSafetyCopy('ko'),
  en: couponSafetyCopy('en'),
  ja: couponSafetyCopy('ja'),
} as const;
