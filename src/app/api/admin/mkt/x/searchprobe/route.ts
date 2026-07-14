import { NextRequest, NextResponse } from 'next/server';

// TEMPORARY self-contained diagnostic — zero local imports. Isolates whether
// X recent-search itself works with our Bearer, vs a crash in the import chain.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-xsearch-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: 'no token' });

  const q = encodeURIComponent('(from:unusual_whales OR from:spotgamma) -is:retweet');
  const url = `https://api.x.com/2/tweets/search/recent?query=${q}&max_results=10&tweet.fields=public_metrics,created_at`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(9000),
    });
    const status = res.status;
    const text = await res.text();
    return NextResponse.json({
      ok: res.ok,
      status,
      bodySnippet: text.slice(0, 400),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, phase: 'fetch-threw', error: (e as Error).message });
  }
}
