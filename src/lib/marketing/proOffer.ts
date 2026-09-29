// ============================================================================
// SIGNUM Pro — 웹에 보이는 «지금의 PRO» 한 벌 (2026-09-30)
// ----------------------------------------------------------------------------
// 요금 페이지·PC 하단 띠·홈 배지가 이 한 곳만 읽는다. 가격이 바뀌면 여기만 고친다.
//
// 상품 정의(9/8 법적 전제·9/29 대표 결정): 유료 = 광고 제거 + 용량(내 종목 100개). 잠기는 지표 없음.
// 결제는 앱에서만(App Store·Google Play). 웹은 스마트링크 /app?from=… 로 스토어에 보낸다(PC 는 QR 넘겨주기).
//
// 가격 = 스토어 실제 가격(2026-09-30 공개 스토어 페이지 실측 — App Store·Play 동일):
//   미국 $9.99 · 한국 ₩11,900 · 일본 ¥1,280 (월간 자동 갱신). 사이트 언어별로 그 나라 가격을 보인다.
//   스토어 국가가 다르면 가격이 다를 수 있어 «국가별로 다를 수 있음» 한 줄을 함께 둔다.
// 문구 기준(대표 9/29): 트리거·구매욕 한 줄만 — 설명 문장 없이.
// ============================================================================

export type OfferLocale = 'ko' | 'en' | 'ja';

export const offerLocale = (l: string | null | undefined): OfferLocale => (l === 'ko' || l === 'ja' ? l : 'en');

/** 스토어 실제 월 가격(사이트 언어 = 그 나라 스토어 가격). */
export const PRO_MONTHLY_PRICE: Record<OfferLocale, string> = { en: '$9.99', ko: '₩11,900', ja: '¥1,280' };
/** 무료의 0 원(표시용, 같은 통화 기호). */
export const FREE_PRICE: Record<OfferLocale, string> = { en: '$0', ko: '₩0', ja: '¥0' };

/** 앱 받기 스마트링크 — 폰은 스토어로 302, PC 는 QR 넘겨주기 화면(언어 l). from 은 [a-z0-9_] 만. */
export function proAppHref(from: string, loc: OfferLocale): string {
  return `/app?from=${from}&l=${loc}`;
}

export const PRO_COPY: Record<OfferLocale, {
  title: string;
  free: string;
  per: string;
  allData: string;
  wlFree: string;
  wlPro: string;
  withAds: string;
  noAds: string;
  cta: string;
  fine: string;
  webPlan: string;
  cancel: string;
  /** PC 하단 띠·홈 배지 한 줄 */
  line: string;
  barCta: string;
}> = {
  ko: {
    title: '광고 없이, 내 종목 100개',
    free: '무료',
    per: '/ 월',
    allData: '모든 데이터·지표',
    wlFree: '내 종목 5개',
    wlPro: '내 종목 100개',
    withAds: '광고 포함',
    noAds: '광고 없음',
    cta: '앱에서 시작',
    fine: '결제는 앱에서(App Store·Google Play) · 국가별로 가격이 다를 수 있습니다',
    webPlan: '웹 요금제 이용 중',
    cancel: '해지',
    line: '광고 없이 · 내 종목 100개',
    barCta: '앱 받기',
  },
  en: {
    title: 'No ads. 100-stock watchlist.',
    free: 'Free',
    per: '/ month',
    allData: 'All data & metrics',
    wlFree: '5-stock watchlist',
    wlPro: '100-stock watchlist',
    withAds: 'With ads',
    noAds: 'No ads',
    cta: 'Start in the app',
    fine: 'Subscribe in the app (App Store · Google Play) · Price may vary by country',
    webPlan: "You're on a web plan",
    cancel: 'Cancel',
    line: 'No ads · 100-stock watchlist',
    barCta: 'Get the app',
  },
  ja: {
    title: '広告なし、マイ銘柄100',
    free: '無料',
    per: '/ 月',
    allData: '全データ・指標',
    wlFree: 'マイ銘柄5',
    wlPro: 'マイ銘柄100',
    withAds: '広告あり',
    noAds: '広告なし',
    cta: 'アプリで始める',
    fine: '購入はアプリ内（App Store・Google Play）・国・地域により価格が異なる場合があります',
    webPlan: 'ウェブプラン利用中',
    cancel: '解約',
    line: '広告なし・マイ銘柄100',
    barCta: 'アプリを入手',
  },
};
