import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { normalizeFrom, playUrlWithReferrer, appleUrlWithProductPage } from '@/lib/marketing/storeRedirect';
import { PREVIEW_BOT_RE, previewLang, previewHtml, previewResponseInit } from '@/lib/marketing/linkPreview';
import { desktopHandoffHtml } from '@/lib/marketing/desktopHandoff';

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
// 리딤 주소(apps.apple.com/redeem)가 요구하는 «숫자 id». 위 APP_STORE_URL 의 id 와 같은 값이다.
const APPLE_APP_ID = '6783130444';

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
/**
 * ★2026-09-22 — 클릭을 «기기»로도 센다.
 * 왜: 21일 클릭 882 건인데 Play 등록정보 열람은 11 건이었다. 등록정보를 연 사람의 61% 가 설치하므로
 * 클릭이 스토어까지 갔다면 설치는 수백이어야 한다. 즉 «클릭이 스토어에 닿지 못한다».
 * 가장 유력한 구멍은 데스크톱이다 — Medium·LinkedIn·IndieHackers·Quora 는 데스크톱 독자가 많은데
 * 데스크톱에서 apps.apple.com 을 열면 «설치할 방법이 없다». 그런데 지금 집계는 기기를 구분하지 않아
 * 그 구멍의 «크기»를 잴 수가 없었다. 태그당 하루 한 칸을 더 쓰는 것으로 그걸 잰다.
 * 리다이렉트에는 영향이 없다(응답 후 after() 안에서 돌고, 실패는 삼킨다).
 */
type HitPlatform = 'android' | 'ios' | 'desktop';

async function bump(key: string): Promise<void> {
  const current = (await getFromCache<number>(key)) || 0;
  await setInCache(key, current + 1, 60 * 60 * 24 * 45); // 45-day TTL auto-cleans old daily keys
}

async function recordHit(fromRaw: string | null, platform?: HitPlatform): Promise<void> {
  const from = (fromRaw || '').toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(from)) return; // ignore missing / malformed tags
  try {
    const day = etDate();
    // 기존 키는 «그대로» 둔다 — 21일치 추세가 여기에 쌓여 있다(형식을 바꾸면 과거가 끊긴다).
    await bump(`mkt:attr:hit:${from}:${day}`);
    if (platform) await bump(`mkt:attr:hit:${from}:${platform}:${day}`);
  } catch {
    /* swallow — a metrics write must never break the store redirect */
  }
}

/**
 * ★2026-09-26 — «데스크톱 클릭»이 사람인지 잰다(동작은 그대로, 카운터만 더한다).
 * 왜: 9/23~25 블루스키 계열 태그(bluesky·bluesky_bip·bluesky_pin) 91클릭이 «폰 0»이었다. 블루스키는 모바일 앱
 * 사용자가 많아서, 사람이 누른 것이라면 나오기 어려운 비율이다. 게시물은 대부분 좋아요 0·팔로워 25였다.
 * PREVIEW_BOT_RE 에 없는 수집기(meta-externalagent·Go-http-client·python-requests·헤드리스 브라우저 등)는
 * 지금 전부 «desktop 클릭»으로 잡힌다 — 그 숫자가 «키우기» 레인(어디에 더 쓸지)을 정하고 있다.
 * 그래서 데스크톱으로 분류된 요청을 UA 계열로 한 칸 더 센다: mkt:attr:ua:<from>:<kind>:<ET날짜>
 *   nomoz = UA 에 Mozilla/ 가 없다(라이브러리·스크립트) · bot = 수집기 표지 · nolang = Accept-Language 없음
 *   mac · win · linux · other = 사람 브라우저로 보이는 것
 */
const UA_BOT_RE = /bot|crawl|spider|slurp|headless|python|curl|wget|go-http|okhttp|java\/|axios|node-fetch|undici|libwww|http-?client|scrapy|externalagent|externalfetcher|preview|monitor|checker|lighthouse|phantom|puppeteer|playwright/i;

function uaKind(ua: string, acceptLanguage: string | null): string {
  if (!/Mozilla\//.test(ua)) return 'nomoz';
  if (UA_BOT_RE.test(ua)) return 'bot';
  if (!acceptLanguage) return 'nolang';
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/Windows/.test(ua)) return 'win';
  if (/Linux|X11|CrOS/.test(ua)) return 'linux';
  return 'other';
}

async function recordUa(fromRaw: string | null, kind: string) {
    const from = (fromRaw || '').toLowerCase();
    if (!/^[a-z0-9_]{1,24}$/.test(from)) return;
    try { await bump(`mkt:attr:ua:${from}:${kind}:${etDate()}`); } catch { /* 집계 실패가 이동을 막지 않는다 */ }
}

/** PC 넘겨주기 QR 로 «폰에서» 들어온 클릭 — 넘겨주기가 먹히는지 따로 잰다. */
async function recordQrHit(fromRaw: string | null) {
    const from = (fromRaw || '').toLowerCase();
    if (!/^[a-z0-9_]{1,24}$/.test(from)) return;
    try { await bump(`mkt:attr:qr:${from}:${etDate()}`); } catch { /* 집계 실패가 이동을 막지 않는다 */ }
}

/** 코드 링크 클릭 — 일반 클릭과 «따로» 센다. 섞으면 코드가 먹혔는지 영영 못 잰다. */
async function recordCodeHit(fromRaw: string | null) {
    const from = (fromRaw || '').toLowerCase();
    if (!/^[a-z0-9_]{1,24}$/.test(from)) return;
    try { await bump(`mkt:attr:code:${from}:${etDate()}`); } catch { /* 집계 실패가 이동을 막지 않는다 */ }
}

// 링크 미리보기 기계는 `@/lib/marketing/linkPreview` 한 곳에 있다.
// ★2026-09-20: 예전엔 이 파일 안에만 있었고 /app-uc·/app-wim 에는 아예 없었다
//   (UC·WIM 링크가 카드 없이 맨 URL 로 떴다). 공용 모듈로 빼서 세 라우트가 같은 것을 쓴다.
export async function GET(request: NextRequest) {
  const ua = request.headers.get('user-agent') || '';

  if (PREVIEW_BOT_RE.test(ua)) {
    const fromTag = normalizeFrom(request.nextUrl.searchParams.get('from'));
    const lang = previewLang(fromTag, request.nextUrl.searchParams.get('l'));
    // ★2026-09-20 §50 수리 — 이 응답을 «캐시 가능»하게 내보내면 안 된다.
    //   Vercel CDN 은 URL 단위로 캐시하고 Vary 에 User-Agent 가 없다 → 미리보기 봇이 한 번 긁으면
    //   그 뒤 10분 동안 «사람»도 302 대신 이 HTML 을 받았다. 그리고 이 HTML 의 유일한 탈출구인
    //   meta refresh 가 «항상 애플»이었으므로 **안드로이드 사용자가 apps.apple.com 으로 보내져
    //   설치를 못 했다**(실측·재현: x-vercel-cache HIT, age 97s, 안드로이드 UA).
    //   그 클릭은 recordHit 도 안 타므로 집계에서도 사라졌다.
    return new NextResponse(
      previewHtml('signum', lang, request.nextUrl.href, /android/i.test(ua) ? PLAY_STORE_URL : APP_STORE_URL),
      previewResponseInit(),
    );
  }

  // Count the hit AFTER the response is sent (zero added latency to the redirect).
  const fromTag = normalizeFrom(request.nextUrl.searchParams.get('from'));

  // Play Install Referrer — 이게 있어야 Play Console 획득 보고서가 «어느 채널이
  // 설치를 만들었는지»를 보여준다. 없으면 클릭만 알고 설치는 영영 모른다.
  // ⚠️ 정규화된 값을 넘긴다. 원본을 넘기면 하이픈 태그가 recordHit 의
  //    같은 정규식에 다시 걸려 클릭 카운터만 «조용히» 비게 된다.
  const hitPlatform: HitPlatform = /android/i.test(ua) ? 'android'
    : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'desktop';
  after(() => recordHit(fromTag, hitPlatform));
  if (hitPlatform === 'desktop') {
    const kind = uaKind(ua, request.headers.get('accept-language'));
    after(() => recordUa(fromTag, kind));
  }

  // ── 리딤코드 한 줄 링크 ──────────────────────────────────────────────
  //
  // ★2026-09-23 실측으로 설계했다. 리딤코드의 문제는 «코드를 어떻게 쓰게 하느냐»다:
  //   · 앱 안에는 코드 사용 입구가 «없다». RevenueCat SDK 에 presentCodeRedemptionSheet()
  //     가 들어는 있지만(node_modules 확인) 어떤 화면에도 연결돼 있지 않다 → 붙이려면 빌드·심사.
  //   · 그래서 코드만 뿌리면 사용자는 스토어 앱을 직접 열어 «기프트카드 또는 코드 사용»을
  //     찾아 들어가야 한다. 그 몇 단계에서 대부분이 떨어진다.
  //
  //   빌드 없이 한 번에 여는 길이 있다 — 스토어의 «리딤 주소»다. 둘 다 실측했다:
  //     애플  apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=X
  //           → 302, code·id 가 그대로 살아남는다(데스크톱 웹에서도 열린다)
  //     Play  play.google.com/redeem?code=X → 302 (store/redeem 은 400 이다)
  //
  //   그래서 «한 줄 링크»를 여기서 만든다: signumhq.com/app?from=<채널>&code=<코드>.
  //   기기 분기와 채널 집계는 이미 있는 것을 그대로 타고, 코드가 있을 때만 목적지가 바뀐다.
  //   코드가 없으면 동작이 «완전히 이전과 같다» — 기존 링크는 아무 영향이 없다.
  const rawCode = (request.nextUrl.searchParams.get('code') || '').trim().toUpperCase();
  const code = /^[A-Z0-9]{4,24}$/.test(rawCode) ? rawCode : '';   // 형식이 아니면 «없는 것»으로 본다
  if (code) {
    // 코드 링크 클릭은 따로 센다 — 일반 클릭과 섞으면 «코드가 먹혔는지»를 영영 못 잰다.
    after(() => recordCodeHit(fromTag));
    if (/android/i.test(ua)) {
      return NextResponse.redirect(`https://play.google.com/redeem?code=${encodeURIComponent(code)}`, 302);
    }
    return NextResponse.redirect(
      `https://apps.apple.com/redeem?ctx=offercodes&id=${APPLE_APP_ID}&code=${encodeURIComponent(code)}`, 302);
  }

  // PC 넘겨주기 QR 로 폰에서 들어온 것은 따로도 센다(원래 채널 집계는 위 recordHit 이 이미 했다).
  if (hitPlatform !== 'desktop' && request.nextUrl.searchParams.get('via') === 'qr') {
    after(() => recordQrHit(fromTag));
  }

  if (/android/i.test(ua)) {
    return NextResponse.redirect(playUrlWithReferrer(PLAY_STORE_URL, fromTag, 'signum'), 302);
  }
  if (hitPlatform === 'ios') {
    // iOS opens the native App Store sheet.
    return NextResponse.redirect(appleUrlWithProductPage(APP_STORE_URL, fromTag, 'signum'), 302);
  }

  // ── PC: 스토어로 바로 보내지 않고 «폰으로 넘겨주기» 페이지를 보여준다 ──
  // ★2026-09-23 실측: 소셜 클릭의 81% 가 PC 였다(2일 83클릭 중 67). PC 에서 apps.apple.com 을 열면
  //   폰에 설치할 방법이 없다 — 발행을 늘려도 설치가 안 늘던 기계적 원인. 자세한 근거는 desktopHandoff.ts.
  //   스토어 버튼 2개는 그대로 둔다(애플 실리콘 맥은 앱스토어에서 설치할 수 있다).
  //   ⚠ 반드시 no-store + Vary: User-Agent — CDN 이 이 HTML 을 폰에게 주면 폰이 스토어로 못 간다.
  try {
    const html = await desktopHandoffHtml({
      fromTag,
      lang: previewLang(fromTag, request.nextUrl.searchParams.get('l')),
      appStoreUrl: appleUrlWithProductPage(APP_STORE_URL, fromTag, 'signum'),
      playStoreUrl: playUrlWithReferrer(PLAY_STORE_URL, fromTag, 'signum'),
    });
    return new NextResponse(html, previewResponseInit());
  } catch {
    // 페이지를 못 만들면 예전처럼 앱스토어로 보낸다 — 넘겨주기 실패가 이동을 막으면 안 된다.
    return NextResponse.redirect(appleUrlWithProductPage(APP_STORE_URL, fromTag, 'signum'), 302);
  }
}
