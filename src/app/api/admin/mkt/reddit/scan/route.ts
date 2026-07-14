import { NextResponse } from 'next/server';
import { requireMktAdmin, REDDIT_SUBS } from '@/lib/marketing-console/mkt';
import { redditConfigured, scanSubs } from '@/lib/marketing-console/reddit';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Reddit discovery — real when REDDIT_CLIENT_ID/SECRET set + approved; otherwise
// returns configured:false so the tab shows the on-demand (in-session) path.
export async function GET() {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  if (!redditConfigured()) {
    return NextResponse.json({ ok: true, configured: false, threads: [] });
  }
  try {
    const subs = REDDIT_SUBS.filter((s) => s.role === '밸류').map((s) => s.sub);
    const threads = await scanSubs(subs, 8);
    return NextResponse.json({ ok: true, configured: true, threads: threads.slice(0, 12) });
  } catch (e) {
    return NextResponse.json({ ok: true, configured: false, error: (e as Error).message, threads: [] });
  }
}
