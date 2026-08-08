import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

// /app-wim — device-aware store smart link for Why'd It Move? (cross-promo from SIGNUM/UC).
// Mirrors /app-uc: counts ?from=<channel> into `mkt:attr:hit:<from>:<etDate>` via after() so
// the store redirect stays instant. Middleware matcher must exclude `app-wim$` (like `app-uc$`).
// iOS 1.0 · Android 1.0 라이브 (2026-08-08 승인 확인, id는 iTunes lookup 실측).

const WIM_APP_STORE_URL =
  'https://apps.apple.com/app/whyd-it-move-stock-quiz/id6794356135';
const WIM_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.signumhq.wim';

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
  after(() => recordHit(request.nextUrl.searchParams.get('from')));

  if (/android/i.test(ua)) {
    return NextResponse.redirect(WIM_PLAY_STORE_URL, 302);
  }
  return NextResponse.redirect(WIM_APP_STORE_URL, 302);
}
