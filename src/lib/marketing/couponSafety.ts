/** 앱·웹 공통. 코드 등록 화면의 열림/복귀는 무료 적용의 증거가 아니다.
 *  ja 는 웹 쿠폰 화면의 phrases()가 «、・» 뒤에서만 접으므로 、 로 접힘 자리를 둔다(없으면 320~390px 에서 한 덩어리가 카드 밖으로 넘쳤다 — 10/23). */
export const COUPON_SAFETY = {
  ko: '결제 창에 ₩0 · 30일 무료가 보일 때만 승인하세요. 금액(월 11,900원)이 바로 청구되는 화면이면 취소하세요.',
  en: 'Approve only when checkout shows ₩0 · 30 days free. Cancel if the screen shows an immediate charge (₩11,900/month).',
  ja: '購入画面に₩0・30日間無料と表示された場合のみ、承認してください。月11,900ウォンが、すぐに請求される画面なら、キャンセルしてください。',
} as const;
