import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { normalizeFrom, playUrlWithReferrer, appleStoreUrl } from '@/lib/marketing/storeRedirect';
import { previewLang, previewHtml, previewResponseInit } from '@/lib/marketing/linkPreview';
import { isPreviewBot, clickFields, recordClick } from '@/lib/marketing/clickHuman';
import { recordRef, refBucketFor, refDevice } from '@/lib/marketing/clickRef';

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
  if (isPreviewBot(ua)) {   // 카카오톡 인앱 브라우저(사람)는 빼고 본다 — clickHuman.isPreviewBot
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
  // 어디서 왔나(?ref= 또는 Referer 호스트 분류) — 응답 뒤, 실패해도 무해. lib/marketing/clickRef.ts
  const refBucket = refBucketFor(request);
  after(() => recordRef('uc', fromTag, refDevice(ua), refBucket));
  // ★2026-10-04 사람 판정 집계(clk:uc:<from>:<날짜>) — 이 라우트의 원시 카운터는 /app 과 «같은» mkt:attr:hit:<from> 키를
  //   쓰므로(홈은 세 앱이 한 칸) 앱별·사람별 숫자는 이 키로만 갈린다. lib/marketing/clickHuman.ts
  const clickFieldsNow = clickFields(request.headers, request.method, refBucket);
  after(() => recordClick('uc', fromTag, clickFieldsNow));

  if (/android/i.test(ua)) {
    return NextResponse.redirect(playUrlWithReferrer(UC_PLAY_STORE_URL, fromTag, 'uc'), 302);
  }
  // CPP(ppid) + 캠페인(pt·ct=<from>·mt=8) — storeRedirect.appleStoreUrl (같은 제공자라 pt 도 같다)
  return NextResponse.redirect(appleStoreUrl(UC_APP_STORE_URL, fromTag, 'uc'), 302);
}
