import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin, appendAudit } from '@/lib/marketing-console/mkt';
import { postReply, type Acct } from '@/lib/marketing-console/xOAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Post a reply as a connected account. Triggered by a human [게시] click —
// there is no automated posting loop. Every post is audited.
export async function POST(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  let body: { acct?: string; replyToId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const acct = (body.acct === 'jp' ? 'jp' : 'en') as Acct;
  const text = (body.text || '').trim();
  if (!body.replyToId || !text) {
    return NextResponse.json({ ok: false, error: 'replyToId·text 필요' }, { status: 400 });
  }

  try {
    const result = await postReply(acct, body.replyToId, text);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }
    await appendAudit(gate.admin.email, 'x-reply-posted', `${acct} → ${body.replyToId}`);
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `post 예외: ${(e as Error).message}` }, { status: 502 });
  }
}
