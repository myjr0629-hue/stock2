// ============================================================================
// 앱 3종의 «구조화 데이터» 단일 출처
// ----------------------------------------------------------------------------
// 왜 (2026-08-22 실측: 세 랜딩 페이지 전부 0건이었다):
//   구글은 SoftwareApplication/MobileApplication 스키마가 있는 페이지에
//   가격·플랫폼·평점을 붙여 «앱 리치결과»로 띄운다. 우리는 이 마크업이
//   하나도 없어서, 검색결과에서 그냥 파란 링크 한 줄로만 노출되고 있었다.
//   설치를 만드는 표면인데 통째로 비어 있었다는 뜻이다.
//
// ⚠️ aggregateRating 은 «넣지 않는다» — 현재 실제 평점이 0건이다.
//    없는 평점을 마크업하면 구조화 데이터 스팸으로 수동조치 대상이 된다.
//    리뷰가 쌓이면 그때 실측값으로 추가할 것.
// ============================================================================

export type AppKey = 'signum' | 'undercurrent' | 'wim';
export type Loc = 'en' | 'ko' | 'ja';

type AppDef = {
  key: AppKey;
  appleId: string;
  androidPackage: string;
  /** schema.org applicationCategory — 구글이 인식하는 값만 쓴다 */
  category: string;
  /** 로케일별 이름/설명 */
  name: Record<Loc, string>;
  desc: Record<Loc, string>;
  /** 사이트 내 랜딩 경로 (locale 앞에 붙는다) */
  path: string;
  /** OG/스크린샷 이미지 (절대경로로 조립) */
  image: string;
};

export const APPS: Record<AppKey, AppDef> = {
  signum: {
    key: 'signum',
    appleId: '6783130444',
    androidPackage: 'com.signumhq.app',
    category: 'FinanceApplication',
    path: '',
    image: '/og-brand.png',
    name: {
      en: 'SIGNUM HQ',
      ko: 'SIGNUM HQ',
      ja: 'SIGNUM HQ',
    },
    desc: {
      en: 'Institutional US-equity intelligence for everyone: dark pool share, max pain, gamma exposure, call wall, unusual options flow and AI sector briefings — free, refreshed through every US session.',
      ko: '기관이 보던 미국 주식 데이터를 누구나: 다크풀 비중, 맥스페인, 감마 노출, 콜월, 이상 옵션 흐름, AI 섹터 브리핑 — 무료, 미국장 세션마다 갱신.',
      ja: '機関投資家が見ていた米国株データを誰でも：ダークプール比率、マックスペイン、ガンマエクスポージャー、コールウォール、異常オプションフロー、AIセクターブリーフィング — 無料、米国市場のセッションごとに更新。',
    },
  },
  undercurrent: {
    key: 'undercurrent',
    appleId: '6788779895',
    androidPackage: 'com.signumhq.undercurrent',
    category: 'FinanceApplication',
    path: '/undercurrent',
    image: '/og-brand.png',
    name: {
      en: 'Undercurrent — the money behind the news',
      ko: 'Undercurrent — 뉴스 뒤의 돈',
      ja: 'Undercurrent — ニュースの裏のお金',
    },
    desc: {
      en: 'Every market headline, paired with what the institutional money actually did on that ticker — dark pool share, options positioning and flow. Two to three editions daily, free.',
      ko: '모든 시장 헤드라인에 그 종목에서 «기관 자금이 실제로 한 일»을 붙여 보여줍니다 — 다크풀 비중, 옵션 포지션, 자금 흐름. 하루 2~3회 발행, 무료.',
      ja: 'すべての市場ニュースに、その銘柄で「機関投資家の資金が実際に何をしたか」を並べて表示 — ダークプール比率、オプションのポジション、資金フロー。1日2〜3回配信、無料。',
    },
  },
  wim: {
    key: 'wim',
    appleId: '6794356135',
    androidPackage: 'com.signumhq.wim',
    category: 'EducationalApplication',
    path: '/wim',
    image: '/og-brand.png',
    name: {
      en: "Why'd It Move?",
      ko: "Why'd It Move? — 오늘 시장이 낸 문제",
      ja: "Why'd It Move? — 今日の市場が出す問題",
    },
    desc: {
      en: 'A three-minute nightly investigation built on real US market data. Learn to read charts, institutional flow, macro and news through a daily quiz. Free.',
      ko: '매일 밤, 실제 미국 시장 데이터로 푸는 3분 수사. 차트·기관 흐름·거시·뉴스 읽는 법을 퀴즈로 익힙니다. 무료.',
      ja: '毎晩、実際の米国市場データで解く3分の捜査。チャート・機関フロー・マクロ・ニュースの読み方をクイズで身につけます。無料。',
    },
  },
};

export const APPLE_URL = (id: string) => `https://apps.apple.com/app/id${id}`;
export const PLAY_URL = (pkg: string) => `https://play.google.com/store/apps/details?id=${pkg}`;

/**
 * 앱 랜딩 페이지용 JSON-LD.
 * iOS·Android 두 스토어를 함께 표기해야 구글이 «양쪽 플랫폼 앱»으로 인식한다.
 */
export function appJsonLd(app: AppDef, locale: Loc, base: string) {
  const url = `${base}/${locale}${app.path}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    '@id': `${url}#app`,
    name: app.name[locale],
    description: app.desc[locale],
    url,
    applicationCategory: app.category,
    operatingSystem: 'iOS 14.0+, Android 8.0+',
    inLanguage: ['en', 'ko', 'ja'],
    image: `${base}${app.image}`,
    installUrl: [APPLE_URL(app.appleId), PLAY_URL(app.androidPackage)],
    downloadUrl: [APPLE_URL(app.appleId), PLAY_URL(app.androidPackage)],
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    author: { '@type': 'Organization', name: 'SIGNUM HQ, LLC', url: base },
    publisher: { '@type': 'Organization', name: 'SIGNUM HQ, LLC', url: base },
    // ⚠️ aggregateRating 없음 — 실제 평점이 0건이라 넣으면 스팸이다.
  };
}
