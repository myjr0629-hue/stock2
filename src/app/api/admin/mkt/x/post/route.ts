import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin, appendAudit, isReplyRestrictedError, markRestrictedAuthor } from '@/lib/marketing-console/mkt';
import { postReply, type Acct } from '@/lib/marketing-console/xOAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // headroom for auth + token refresh + post + retry

// Post a reply as a connected account. Human-triggered [게시] click — no auto loop.
// Whole handler is wrapped so any failure returns JSON (never a platform 502).
export async function POST(req: NextRequest) {
  try {
    const gate = await requireMktAdmin();
    if ('error' in gate) return gate.error;

    let body: { acct?: string; replyToId?: string; text?: string; author?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
    }

    const acct = (body.acct === 'jp' ? 'jp' : 'en') as Acct;
    const text = (body.text || '').trim();
    if (!body.replyToId || !text) {
      return NextResponse.json({ ok: false, error: 'replyToId·text 필요' }, { status: 400 });
    }

    const result = await postReply(acct, body.replyToId, text);
    if (!result.ok) {
      // Learn: if the author restricts replies, remember them so they drop out of recommendations.
      const restricted = isReplyRestrictedError(result.error);
      if (restricted && body.author) await markRestrictedAuthor(body.author);
      return NextResponse.json({ ok: false, error: result.error, restricted }, { status: 200 });
    }
    // Audit is best-effort; never let it delay/fail the response.
    try { await appendAudit(gate.admin.email, 'x-reply-posted', `${acct} → ${body.replyToId}`); } catch { /* ignore */ }
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `post 예외: ${(e as Error).message}` }, { status: 200 });
  }
}
