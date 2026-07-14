import { NextRequest, NextResponse } from 'next/server';
import { X_TARGETS } from '@/lib/marketing-console/mkt';
import { scanTargets } from '@/lib/marketing-console/xScan';

// TEMPORARY probe — verifies the real scan route's import chain (xScan, no bedrock).
// Delete after verifying.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-xscan-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    const tweets = await scanTargets(X_TARGETS.map((t) => t.handle), 8);
    return NextResponse.json({
      ok: true,
      count: tweets.length,
      sample: tweets.slice(0, 3).map((t) => ({
        author: t.author,
        ticker: t.ticker,
        score: t.score,
        likes: t.likes,
        impressions: t.impressions,
        text: t.text.slice(0, 70),
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
