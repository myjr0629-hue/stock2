import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { normalizeFrom, playUrlWithReferrer, appleUrlWithProductPage } from '@/lib/marketing/storeRedirect';
import { PREVIEW_BOT_RE, previewLang, previewHtml, previewResponseInit } from '@/lib/marketing/linkPreview';

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

// 링크 미리보기 기계는 `@/lib/marketing/linkPreview` 한 곳에 있다.
// ★2026-09-20: 예전엔 이 파일 안에만 있었고 /app-uc·/app-wim 에는 아예 없었다
//   (UC·WIM 링크가 카드 없이 맨 URL 로 떴다). 공용 모듈로 빼서 세 라우트가 같은 것을 쓴다.
export function GET(request: NextRequest) {
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
  after(() => recordHit(fromTag));

  if (/android/i.test(ua)) {
    return NextResponse.redirect(playUrlWithReferrer(PLAY_STORE_URL, fromTag, 'signum'), 302);
  }

  // iOS opens the native App Store sheet; desktop lands on the App Store web page.
  return NextResponse.redirect(appleUrlWithProductPage(APP_STORE_URL, fromTag, 'signum'), 302);
}
