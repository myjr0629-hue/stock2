import { NextRequest, NextResponse } from 'next/server';

// TEMPORARY bisect probe — self-contained scan (no local imports) to confirm the
// scan+parse logic works, isolating the crash to the import chain. Delete after.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-xscan-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: 'no token' });

  const handles = ['unusual_whales', 'spotgamma', 'KobeissiLetter', 'CheddarFlow', 'Barchart'];
  const from = handles.map((h) => `from:${h}`).join(' OR ');
  const q = encodeURIComponent(`(${from}) -is:retweet -is:reply`);
  const fields =
    'tweet.fields=public_metrics,created_at,author_id&expansions=author_id&user.fields=username';
  try {
    const res = await fetch(
      `https://api.x.com/2/tweets/search/recent?query=${q}&max_results=10&${fields}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(9000) }
    );
    const status = res.status;
    const json = (await res.json()) as {
      data?: Array<{ id: string; text: string; author_id: string; public_metrics?: Record<string, number> }>;
      includes?: { users?: Array<{ id: string; username: string }> };
    };
    const users = new Map((json.includes?.users || []).map((u) => [u.id, u.username]));
    const sample = (json.data || []).slice(0, 3).map((t) => ({
      author: users.get(t.author_id) || t.author_id,
      likes: t.public_metrics?.like_count ?? 0,
      text: t.text.slice(0, 70),
    }));
    return NextResponse.json({ ok: res.ok, status, count: json.data?.length ?? 0, sample });
  } catch (e) {
    return NextResponse.json({ ok: false, phase: 'threw', error: (e as Error).message });
  }
}
