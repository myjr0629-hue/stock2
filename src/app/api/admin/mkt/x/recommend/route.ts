import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin, X_TARGETS, X_TARGETS_JP, marketSession } from '@/lib/marketing-console/mkt';
import { scanTargets, type ScanTweet } from '@/lib/marketing-console/xScan';
import { draftReply } from '@/lib/marketing-console/xApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // scan + up to N Bedrock drafts

// AUTO-SELECT: scan targets, keep only tweets worth replying to (has a ticker we
// can ground + meaningful engagement), rank, and auto-generate drafts for the top
// few. Minimises human work: operator reviews ready drafts and clicks 게시.
export async function POST(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  let body: { lang?: string; top?: number };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const lang = body.lang === 'ja' ? 'ja' : 'en';
  const topN = Math.min(Math.max(body.top ?? 3, 1), 5);
  const targets = (lang === 'ja' ? X_TARGETS_JP : X_TARGETS).map((t) => t.handle);

  try {
    const all = await scanTargets(targets, 20);
    // Filter: repliable (author allows replies) + mentions a ticker we can ground + non-trivial reach.
    const candidates = all.filter(
      (t) => t.canReply && t.ticker && (t.likes + t.replies > 0 || t.impressions > 500)
    );
    const picks = candidates.slice(0, topN);

    // Auto-draft the picks (grounded). Drop ones we have no data for.
    const drafted = await Promise.all(
      picks.map(async (t): Promise<(ScanTweet & { draft: string; grounded: boolean }) | null> => {
        const d = await draftReply(t, lang);
        if (!d.grounded || !d.draft) return null; // no fabricated numbers → skip
        return { ...t, draft: d.draft, grounded: true };
      })
    );
    const recommended = drafted.filter(Boolean);

    return NextResponse.json({
      ok: true,
      lang,
      session: marketSession(),
      recommended,
      scannedCount: all.length,
      candidateCount: candidates.length,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
