import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin } from '@/lib/marketing-console/mkt';
import { fetchInbox, getConnection, type Acct } from '@/lib/marketing-console/xOAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Replies/mentions to our own posts (author-reply = top lever). Requires OAuth.
export async function GET(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  const acct = (req.nextUrl.searchParams.get('acct') === 'jp' ? 'jp' : 'en') as Acct;
  const conn = await getConnection(acct);
  if (!conn.connected) return NextResponse.json({ ok: true, connected: false, items: [] });

  const result = await fetchInbox(acct);
  if (!result.ok) return NextResponse.json({ ok: false, connected: true, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, connected: true, items: result.items || [] });
}
