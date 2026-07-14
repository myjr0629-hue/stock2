import { NextRequest, NextResponse } from 'next/server';
import { X_TARGETS } from '@/lib/marketing-console/mkt';
import { scanTargets } from '@/lib/marketing-console/xScan';
import { diagnoseReplies } from '@/lib/marketing-console/xOAuth';

// TEMPORARY probe — definitively tests whether @signumhq can reply to scanned
// target tweets (posts a reply, deletes on success; rejected replies post
// nothing). Reveals if the block is account-wide or per-account. Delete after.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-repl-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    const tweets = await scanTargets(X_TARGETS.map((t) => t.handle), 12);
    // Test up to 6 tweets across distinct authors.
    const seen = new Set<string>();
    const picks: { id: string; author: string }[] = [];
    for (const t of tweets) {
      if (picks.length >= 6) break;
      picks.push({ id: t.id, author: t.author });
      seen.add(t.author);
    }
    const results = await diagnoseReplies('en', picks);
    return NextResponse.json({ ok: true, tested: picks.length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
