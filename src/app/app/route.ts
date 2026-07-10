import { NextRequest, NextResponse } from 'next/server';

// /app — device-aware store smart link (single URL for bios, QR codes, and post CTAs).
// Measurement: every hit is logged by Vercel with its ?from=<channel> tag intact.
// Middleware matcher excludes `app$` so this route is never locale-rewritten by next-intl.

const APP_STORE_URL =
  'https://apps.apple.com/app/signum-hq-stock-market-intel/id6783130444';
// TODO(Android launch): swap to Play Store URL once com.signumhq.app passes review.
// const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.signumhq.app';

export function GET(request: NextRequest) {
  const ua = request.headers.get('user-agent') || '';

  // Android: Play listing still in review — land on the web home (usable product) for now.
  if (/android/i.test(ua)) {
    return NextResponse.redirect(new URL('/', request.url), 302);
  }

  // iOS opens the native App Store sheet; desktop lands on the App Store web page.
  return NextResponse.redirect(APP_STORE_URL, 302);
}
