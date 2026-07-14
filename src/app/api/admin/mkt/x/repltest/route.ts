import { NextRequest, NextResponse } from 'next/server';
import { searchTickers } from '@/lib/marketing-console/xScan';
import { diagnoseReplies } from '@/lib/marketing-console/xOAuth';

// TEMPORARY probe — tests whether @signumhq can reply to GENERAL ticker tweets
// (any account, not just big targets). Post+delete on success; rejects post
// nothing. Answers: is the reply block account-wide or just big accounts? Delete after.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-repl-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    const tweets = await searchTickers(['NVDA', 'MU', 'AMD', 'TSLA', 'AAPL', 'SPY'], 40);
    // Pick tweets from DISTINCT authors, prefer smaller accounts (lower impressions).
    const bySmall = [...tweets].sort((a, b) => a.impressions - b.impressions);
    const seen = new Set<string>();
    const picks: { id: string; author: string; impressions: number }[] = [];
    for (const t of bySmall) {
      if (picks.length >= 8) break;
      if (seen.has(t.author)) continue;
      seen.add(t.author);
      picks.push({ id: t.id, author: t.author, impressions: t.impressions });
    }
    const results = await diagnoseReplies('en', picks.map((p) => ({ id: p.id, author: p.author })));
    // merge impressions for context
    const merged = results.map((r, i) => ({ ...r, impressions: picks[i]?.impressions }));
    const worked = merged.filter((r) => (r as { replyWorks?: boolean }).replyWorks === true).length;
    return NextResponse.json({ ok: true, tested: picks.length, worked, results: merged });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
