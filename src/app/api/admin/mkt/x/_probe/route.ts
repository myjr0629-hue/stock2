import { NextRequest, NextResponse } from 'next/server';
import { scanTargets } from '@/lib/marketing-console/xApi';
import { X_TARGETS } from '@/lib/marketing-console/mkt';

// TEMPORARY probe — verifies X recent-search works with our Bearer + pay-per-use
// access level. Probe-gated (no data beyond public tweets). Delete after verifying.
export const dynamic = 'force-dynamic';
const PROBE = 'signum-xscan-2026';

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== PROBE) {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    const tweets = await scanTargets(X_TARGETS.map((t) => t.handle), 5);
    return NextResponse.json({
      ok: true,
      count: tweets.length,
      sample: tweets.slice(0, 3).map((t) => ({
        author: t.author,
        ticker: t.ticker,
        score: t.score,
        likes: t.likes,
        replies: t.replies,
        text: t.text.slice(0, 80),
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
