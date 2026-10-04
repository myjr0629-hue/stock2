import type { StoreApp } from './storeRedirect';

/**
 * 스마트링크 «링크 미리보기» 공용 모듈.
 *
 * ★2026-09-20 만들어진 이유: 이 기계가 `/app`(SIGNUM)에만 있었고 `/app-uc`·`/app-wim` 에는
 *   **한 줄도 없었다.** 그래서 UC·WIM 링크는 카카오톡·슬랙·X·블루스카이 어디에 붙여도
 *   «카드 없이 맨 URL»로 떴다. 게다가 그 두 라우트는 봇 요청도 recordHit 로 세고 있어
 *   클릭 수까지 부풀리고 있었다(메인 라우트는 봇을 세지 않는다).
 *
 *   같은 것을 세 군데에 각각 붙이면 또 갈라진다 → 여기 한 곳에 둔다(§사례가 아니라 종류를 고친다).
 */

export const PREVIEW_BOT_RE =
  /LinkedInBot|facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|TelegramBot|WhatsApp|kakaotalk-scrap|Kakao|Bluesky|cardyb|redditbot|Pinterest|Embedly|vkShare|Quora Link Preview|Applebot|Googlebot|bingbot|Mastodon|Threads|Yeti|Daumoa|line-?poker|Iframely|SkypeUriPreview|Viber|Snapchat/i;

// 한국어·일본어 채널 태그. 카드 언어를 여기서 고른다(`&l=ko` 같은 명시값이 항상 우선).
const KO_TAGS = /_kr$|_ko$|^x_kr$|^naver|^okky$|^daum|^tistory$|^fmkorea$|^dcinside$|^kr_/;
const JA_TAGS = /_jp$|^note$|^quora_jp|^x_jp$|^qiita$|^zenn$|^hatena|^mybest|^jp_/;

export type PreviewLang = 'en' | 'ja' | 'ko';

/**
 * 사람(PC) 화면용 언어 — ?l= 이 있으면 그것, 태그가 한·일이면 그것, 아니면 브라우저 언어(Accept-Language 첫 항목).
 *   태그만 보면 from=home·bluesky 같은 중립 태그의 한국·일본 PC 방문자가 영어 화면을 받았다(2026-09-30).
 */
export function visitorLang(fromTag: string | null, explicit: string | null, acceptLanguage: string | null): PreviewLang {
  const byTag = previewLang(fromTag, explicit);
  if (byTag !== 'en' || explicit === 'en') return byTag;
  const first = (acceptLanguage || '').split(',')[0]?.trim().toLowerCase() || '';
  return first.startsWith('ko') ? 'ko' : first.startsWith('ja') ? 'ja' : 'en';
}

export function previewLang(fromTag: string | null, explicit: string | null): PreviewLang {
  if (explicit === 'ja' || explicit === 'ko' || explicit === 'en') return explicit;
  const f = fromTag || '';
  if (JA_TAGS.test(f)) return 'ja';
  if (KO_TAGS.test(f)) return 'ko';
  return 'en';
}

export type Copy = { title: string; desc: string };

/**
 * 앱별 카드 문구. 예측·투자권유 표현은 넣지 않는다(스토어·플랫폼 공통 안전선).
 * 이미지: SIGNUM 만 전용 1200×675 카드가 있고, UC·WIM 은 1024² 아이콘뿐이라
 *         카드 종류를 `summary`(작은 정사각)로 내린다 — 가로 카드에 정사각을 넣으면 잘린다.
 *         전용 카드가 생기면 `image.wide` 를 채우고 그때 summary_large_image 로 올린다.
 */
export const COPY: Record<StoreApp, Record<PreviewLang, Copy>> = {
  signum: {
    en: {
      title: 'SIGNUM HQ — the whole US market in one free app',
      desc: 'Premarket movers, earnings calendar, macro & rates, sector heatmap, an AI brief every morning, and institutional footprints (options, dark pool, short volume). Free on iOS & Android, no account needed.',
    },
    ja: {
      title: 'SIGNUM HQ — 米国市場のすべてを、無料アプリひとつで',
      desc: 'プレマーケット・決算カレンダー・マクロ・セクター・毎朝のAI要約・機関投資家の足跡（オプション・ダークプール・空売り）。iOS・Android 無料、登録不要。',
    },
    ko: {
      title: 'SIGNUM HQ — 미국 시장 전체를 무료 앱 하나로',
      desc: '프리마켓·실적 일정·거시·섹터·매일 아침 AI 브리핑·기관의 흔적(옵션·다크풀·공매도). iOS·Android 무료, 가입 없이 바로.',
    },
  },
  uc: {
    en: {
      title: 'Undercurrent — where the news and the money disagree',
      desc: 'A daily brief that puts each headline next to what the money actually did: options flow, dark pool share and short volume for the same name. Free on iOS & Android, no account needed.',
    },
    ja: {
      title: 'Undercurrent — ニュースとマネーが食い違うところ',
      desc: '見出しの横に「実際のお金の動き」を並べる毎日のブリーフ。同じ銘柄のオプションフロー・ダークプール比率・空売り出来高まで。iOS・Android 無料、登録不要。',
    },
    ko: {
      title: 'Undercurrent — 뉴스와 돈이 어긋나는 지점',
      desc: '헤드라인 옆에 «돈이 실제로 한 일»을 나란히 놓는 데일리 브리프. 같은 종목의 옵션 플로우·다크풀 비중·공매도량까지. iOS·Android 무료, 가입 없이 바로.',
    },
  },
  wim: {
    en: {
      title: "Why'd It Move? — learn market structure by quiz",
      desc: "Each day, one real move from the US market and the mechanism behind it — sessions, earnings timing, options expiry, dealer hedging. 30 seconds a day. Free on iOS & Android, no account needed.",
    },
    ja: {
      title: "Why'd It Move? — クイズで学ぶ市場の仕組み",
      desc: '毎日ひとつ、米国市場で実際に起きた値動きとその仕組み（セッション・決算のタイミング・オプション満期・ディーラーのヘッジ）。1日30秒。iOS・Android 無料、登録不要。',
    },
    ko: {
      title: "Why'd It Move? — 퀴즈로 배우는 시장의 구조",
      desc: '하루 하나, 미국 시장에서 실제로 일어난 움직임과 그 원리(세션·실적 시점·옵션 만기·딜러 헤지). 하루 30초. iOS·Android 무료, 가입 없이 바로.',
    },
  },
};

const SITE = 'https://www.signumhq.com'; // www 직접 — 이미지 스크래퍼가 apex→www 307 을 안 따라갈 수 있다

/** 앱별 og:image. wide 가 있으면 큰 가로 카드, 없으면 아이콘 + 작은 카드. */
const IMAGE: Record<StoreApp, { wide?: (lang: PreviewLang) => string; square: string }> = {
  signum: { wide: (l) => `${SITE}/promo/card-app-${l}.png`, square: `${SITE}/app-icons/signum.png` },
  // ★2026-09-20(2차) — 「한글 TTF 가 없어 못 한다」는 내 판단이 틀렸다. Google Fonts 의
  //   `text=` 서브셋이 TTF 를 준다(한국어 9.5KB). 방법이 막힌 것을 못 한다고 적었던 것.
  //   → /api/og/app 로 1200×675 카드를 즉석 생성해 UC·WIM 도 풀카드로 올린다.
  uc: { wide: (l) => `${SITE}/api/og/app?app=uc&l=${l}`, square: `${SITE}/app-icons/uc.png` },
  wim: { wide: (l) => `${SITE}/api/og/app?app=wim&l=${l}`, square: `${SITE}/app-icons/wim-1024.png` },
};

export const SITE_NAME: Record<StoreApp, string> = {
  signum: 'SIGNUM HQ',
  uc: 'Undercurrent',
  wim: "Why'd It Move?",
};

const esc = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * ★2026-10-05 리딤 코드 링크 카드 — `/app?…&code=<우리 맞춤 코드>` 를 붙이면 링크 카드도 «PRO 1개월 무료»를 보여 준다
 *   (note·네이버·카카오톡처럼 링크가 큰 카드로 펴지는 곳). 문구 규칙은 웹 칩과 같다: «무료» 문장 안에 자동 갱신 가격 ·
 *   선착순 500명(애플이 코드에 강제하는 한도)·10/30(실제 만료 PT)만 · 아이폰 전용 명시. 카드 이미지엔 채널 코드가 없다(공용).
 *   우리 코드가 아니거나 만료 뒤면 route 가 promo 를 주지 않아 예전 카드 그대로다.
 */
export const PROMO_COPY: Record<PreviewLang, Copy> = {
  en: {
    title: 'SIGNUM PRO — 1 month free · first 500 · until Oct 30 (iPhone)',
    desc: 'PRO (no ads + 100-ticker watchlist) is free for your first month, then the regular price (US$9.99/mo) — auto-renews, cancel anytime. One tap on iPhone installs and applies. Options flow & dark pool data app.',
  },
  ja: {
    title: 'SIGNUM PRO 1か月無料 — 先着500名・10/30まで(iPhone)',
    desc: 'PRO(広告なし+マイ銘柄100件)が最初の1か月無料、以降は月額¥1,280で自動更新(いつでも解約可)。iPhoneならタップ1回でインストール+適用。オプションフロー/ダークプールのアプリ。',
  },
  ko: {
    title: 'SIGNUM PRO 1개월 무료 — 선착순 500명 · 10/30까지(아이폰)',
    desc: 'PRO(광고 없음 + 내 종목 100개)를 첫 달 무료로, 이후 월 ₩11,900 자동 갱신(언제든 해지). 아이폰에서 탭 한 번이면 설치 + 적용. 옵션 흐름·다크풀 데이터 앱.',
  },
};
const PROMO_IMAGE = (l: PreviewLang) => `${SITE}/promo/redeem-card-${l}.png`;

/** 링크 카드용 «살아 있는 우리 맞춤 코드»인가 — 오퍼 «SIGNUM PRO 1 Month Free (Launch)»(ASC 51bd34ef) 의 맞춤 코드 8종,
 *  만료 2026-10-31 00:00 PT(= 07:00 UTC). /app 의 이동(302) 동작과는 무관하다 — 카드 문구만 고른다. 코드를 새로 만들면 여기에 더한다. */
const LIVE_PROMO_CODES = new Set(['WEBPRO', 'THREADSPRO', 'XPRO', 'XJPPRO', 'BSKYPRO', 'NOTEJP', 'NAVERPRO', 'IHPRO']);
const PROMO_EXPIRES_AT = Date.parse('2026-10-31T07:00:00Z');
export function isLivePromoCode(raw: string | null, now = Date.now()): boolean {
  const code = (raw || '').trim().toUpperCase();
  return LIVE_PROMO_CODES.has(code) && now < PROMO_EXPIRES_AT;
}

export function previewHtml(
  app: StoreApp,
  lang: PreviewLang,
  canonical: string,
  storeUrl: string,
  promo = false,
): string {
  const usePromo = promo && app === 'signum';
  const c = usePromo ? PROMO_COPY[lang] : COPY[app][lang];
  const img = IMAGE[app];
  const wide = usePromo ? PROMO_IMAGE(lang) : img.wide?.(lang);
  const imgUrl = wide || img.square;
  const card = wide ? 'summary_large_image' : 'summary';
  const dims = wide
    ? '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="675">'
    : '<meta property="og:image:width" content="1024"><meta property="og:image:height" content="1024">';
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME[app])}">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${imgUrl}">
${dims}
<meta name="twitter:card" content="${card}">
<meta name="twitter:title" content="${esc(c.title)}">
<meta name="twitter:description" content="${esc(c.desc)}">
<meta name="twitter:image" content="${imgUrl}">
<meta http-equiv="refresh" content="0;url=${esc(storeUrl)}">
</head><body><a href="${esc(storeUrl)}">${esc(c.title)}</a></body></html>`;
}

/**
 * 미리보기 봇용 응답. ★반드시 캐시 불가로 내보낸다.
 * Vercel CDN 은 URL 단위로 캐시하고 Vary 에 User-Agent 가 없다 → 캐시 가능하게 내면
 * 봇이 한 번 긁은 뒤 «사람»도 이 HTML 을 받고, meta refresh 한 곳으로만 갈 수 있게 된다
 * (2026-09-20 실측: 안드로이드 사용자가 apps.apple.com 으로 보내져 설치를 못 했다).
 */
export function previewResponseInit(): ResponseInit {
  return {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store, max-age=0',
      vary: 'User-Agent',
    },
  };
}
