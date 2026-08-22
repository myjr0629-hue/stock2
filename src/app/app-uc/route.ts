import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { normalizeFrom, playUrlWithReferrer } from '@/lib/marketing/storeRedirect';

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
  const fromTag = normalizeFrom(request.nextUrl.searchParams.get('from'));

  // Play Install Referrer — 이게 있어야 Play Console 획득 보고서가 «어느 채널이
  // 설치를 만들었는지»를 보여준다. 없으면 클릭만 알고 설치는 영영 모른다.
  after(() => recordHit(request.nextUrl.searchParams.get('from')));

  if (/android/i.test(ua)) {
    return NextResponse.redirect(playUrlWithReferrer(UC_PLAY_STORE_URL, fromTag), 302);
  }
  return NextResponse.redirect(UC_APP_STORE_URL, 302);
}
