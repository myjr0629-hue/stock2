import { NextRequest, NextResponse } from 'next/server';
import { scanTargets } from '@/lib/marketing-console/xScan';
import { draftReply } from '@/lib/marketing-console/xApi';
import { X_TARGETS } from '@/lib/marketing-console/mkt';

// TEMPORARY probe — verifies the Bedrock-backed grounded draft path (maxDuration=60).
// Picks the top scanned tweet that has a ticker, generates a grounded reply. Delete after.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-xdraft-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    const tweets = await scanTargets(X_TARGETS.map((t) => t.handle), 10);
    const withTicker = tweets.find((t) => t.ticker) || tweets[0];
    if (!withTicker) return NextResponse.json({ ok: false, error: 'no tweets' });
    const result = await draftReply(withTicker, 'en');
    return NextResponse.json({
      ok: true,
      tweet: { author: withTicker.author, ticker: withTicker.ticker, text: withTicker.text.slice(0, 90) },
      ...result,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
