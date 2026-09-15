import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { normalizeFrom, playUrlWithReferrer } from '@/lib/marketing/storeRedirect';

// /app — device-aware store smart link (single URL for bios, QR codes, and post CTAs).
// Measurement: ?from=<channel> is counted into `mkt:attr:hit:<from>:<etDate>` (the exact
// key the marketing-console metrics tab reads) via after(), so the store redirect stays
// instant and Redis latency/outages can never delay or break it.
// Middleware matcher excludes `app$` so this route is never locale-rewritten by next-intl.

const APP_STORE_URL =
  'https://apps.apple.com/app/signum-hq-stock-market-intel/id6783130444';
// Play listing live since 2026-07-13 (com.signumhq.app returns 200).
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.signumhq.app';

// ET market-day key component — MUST stay identical to mkt.ts etDate() / K.attrHit()
// so the metrics tab reads the same keys we write here. Replicated (not imported) to keep
// this public redirect route free of the admin-auth module mkt.ts pulls in.
function etDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Attribution is best-effort: the `from` tag is bounded (no arbitrary key-space growth),
// the write is TTL'd, and any failure is swallowed so measurement never affects the redirect.
async function recordHit(fromRaw: string | null): Promise<void> {
  const from = (fromRaw || '').toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(from)) return; // ignore missing / malformed tags
  try {
    const key = `mkt:attr:hit:${from}:${etDate()}`;
    const current = (await getFromCache<number>(key)) || 0;
    await setInCache(key, current + 1, 60 * 60 * 24 * 45); // 45-day TTL auto-cleans old daily keys
  } catch {
    /* swallow — a metrics write must never break the store redirect */
  }
}

// ★ 2026-09-16 (#T4, 대표 지적 «앱 화면을 써라»): 링크 미리보기 봇에게는 스토어로 보내지 않고
//   OG 태그가 달린 얇은 HTML 을 준다. 그래야 LinkedIn·Slack·카카오·X 카드에 «앱 전체 카드»가
//   그려진다(스토어로 307 시키면 아이콘만 뜬다). 사람은 아래 302 그대로.
//   봇은 클릭이 아니므로 attr hit 도 기록하지 않는다(카운터가 봇을 세던 문제도 함께 막힌다).
const PREVIEW_BOT_RE =
  /LinkedInBot|facebookexternalhit|Facebot|Twitterbot|Slackbot|Discordbot|TelegramBot|WhatsApp|kakaotalk-scrap|Kakao|Bluesky|cardyb|redditbot|Pinterest|Embedly|vkShare|Quora Link Preview|Applebot|Googlebot|bingbot|Mastodon|Threads/i;

function previewLang(fromTag: string | null, explicit: string | null): 'en' | 'ja' | 'ko' {
  if (explicit === 'ja' || explicit === 'ko' || explicit === 'en') return explicit;
  const f = fromTag || '';
  if (/_jp$|^note$|^quora_jp|^x_jp$/.test(f)) return 'ja';
  if (/_kr$|^x_kr$|_ko$/.test(f)) return 'ko';
  return 'en';
}

const OG_COPY = {
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
} as const;

function previewHtml(lang: 'en' | 'ja' | 'ko', canonical: string): string {
  const c = OG_COPY[lang];
  const img = `https://www.signumhq.com/promo/card-app-${lang}.png`; // www 직접 — 이미지 스크래퍼가 apex→www 307 을 안 따라갈 수 있다
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SIGNUM HQ">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="675">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(c.title)}">
<meta name="twitter:description" content="${esc(c.desc)}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0;url=${esc(APP_STORE_URL)}">
</head><body><a href="${esc(APP_STORE_URL)}">${esc(c.title)}</a></body></html>`;
}

export function GET(request: NextRequest) {
  const ua = request.headers.get('user-agent') || '';

  if (PREVIEW_BOT_RE.test(ua)) {
    const fromTag = normalizeFrom(request.nextUrl.searchParams.get('from'));
    const lang = previewLang(fromTag, request.nextUrl.searchParams.get('l'));
    return new NextResponse(previewHtml(lang, request.nextUrl.href), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' },
    });
  }

  // Count the hit AFTER the response is sent (zero added latency to the redirect).
  const fromTag = normalizeFrom(request.nextUrl.searchParams.get('from'));

  // Play Install Referrer — 이게 있어야 Play Console 획득 보고서가 «어느 채널이
  // 설치를 만들었는지»를 보여준다. 없으면 클릭만 알고 설치는 영영 모른다.
  // ⚠️ 정규화된 값을 넘긴다. 원본을 넘기면 하이픈 태그가 recordHit 의
  //    같은 정규식에 다시 걸려 클릭 카운터만 «조용히» 비게 된다.
  after(() => recordHit(fromTag));

  if (/android/i.test(ua)) {
    return NextResponse.redirect(playUrlWithReferrer(PLAY_STORE_URL, fromTag), 302);
  }

  // iOS opens the native App Store sheet; desktop lands on the App Store web page.
  return NextResponse.redirect(APP_STORE_URL, 302);
}
