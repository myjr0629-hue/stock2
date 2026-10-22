/** 앱·웹 공통. 코드 등록 화면의 열림/복귀는 무료 적용의 증거가 아니다. */
export const COUPON_SAFETY = {
  ko: '30일 무료가 표시되지 않으면 구독하지 마세요',
  en: 'Do not subscribe unless 30 days free is shown',
  ja: '30日間無料と表示されない場合は定期購入しないでください',
} as const;

/** 쿠폰 흐름의 마지막 단계(앱 시트 ② · 웹 쿠폰 화면 ②) — 등록 뒤 구독 구매로 넘기지 않고 앱에서 PRO 를 확인한다(2026-10-23). */
export const COUPON_CHECK_PRO = {
  ko: '등록 후 앱에서 PRO 확인',
  en: 'After redeeming, check PRO in the app',
  ja: '登録後、アプリでPROを確認',
} as const;
