import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { normalizeFrom, playUrlWithReferrer, appleUrlWithProductPage } from '@/lib/marketing/storeRedirect';
import { PREVIEW_BOT_RE, previewLang, previewHtml, previewResponseInit } from '@/lib/marketing/linkPreview';

// /app-uc — device-aware store smart link for Undercurrent (cross-promo from SIGNUM etc.).
// Mirrors /app: counts ?from=<channel> into `mkt:attr:hit:<from>:<etDate>` via after() so
// the store redirect stays instant. Middleware matcher must exclude `app-uc$` (like `app$`).
// ⚠️ UC Android is still in review (Play 404 until live) — the Android branch self-heals
// once the listing is public; SIGNUM Android hides the promo card until then.

const UC_APP_STORE_URL =
  'https://apps.apple.com/app/undercurrent-news-money/id6788779895';
const UC_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.signumhq.undercurrent';

// ET market-day key component — identical to mkt.ts etDate() so the metrics tab reads it.
function etDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function recordHit(fromRaw: string | null): Promise<void> {
  const from = (fromRaw || '').toLowerCase();
  if (!/^[a-z0-9_]{1,24}$/.test(from)) return;
  try {
    const key = `mkt:attr:hit:${from}:${etDate()}`;
    const current = (await getFromCache<number>(key)) || 0;
    await setInCache(key, current + 1, 60 * 60 * 24 * 45);
  } catch {
    /* swallow — a metrics write must never break the store redirect */
  }
}

export function GET(request: NextRequest) {
  const ua = request.headers.get('user-agent') || '';

  // ★2026-09-20 신설 — 이 라우트엔 미리보기 분기가 «0개»였다. 그래서 카카오톡·슬랙·X·
  //   블루스카이에 이 링크를 붙이면 카드 없이 맨 URL 로 떴고, 봇 요청이 recordHit 까지 타서
  //   클릭 수도 부풀렸다. 봇은 클릭이 아니므로 여기서 «세지 않고» 되돌려 보낸다.
  if (PREVIEW_BOT_RE.test(ua)) {
    const botFrom = normalizeFrom(request.nextUrl.searchParams.get('from'));
    const lang = previewLang(botFrom, request.nextUrl.searchParams.get('l'));
    const storeUrl = /android/i.test(ua) ? UC_PLAY_STORE_URL : UC_APP_STORE_URL;
    return new NextResponse(previewHtml('uc', lang, request.nextUrl.href, storeUrl), previewResponseInit());
  }
  const fromTag = normalizeFrom(request.nextUrl.searchParams.get('from'));

  // Play Install Referrer — 이게 있어야 Play Console 획득 보고서가 «어느 채널이
  // 설치를 만들었는지»를 보여준다. 없으면 클릭만 알고 설치는 영영 모른다.
  // ⚠️ 정규화된 값을 넘긴다. 원본을 넘기면 하이픈 태그가 recordHit 의
  //    같은 정규식에 다시 걸려 클릭 카운터만 «조용히» 비게 된다.
  after(() => recordHit(fromTag));

  if (/android/i.test(ua)) {
    return NextResponse.redirect(playUrlWithReferrer(UC_PLAY_STORE_URL, fromTag, 'uc'), 302);
  }
  return NextResponse.redirect(appleUrlWithProductPage(UC_APP_STORE_URL, fromTag, 'uc'), 302);
}
