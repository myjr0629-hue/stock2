import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin, getRepliedIds, markReplied, appendAudit } from '@/lib/marketing-console/mkt';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Track which target posts we've already answered (manual reply) so the console
// can check them off and exclude them from the next scan (no duplicate replies).
export async function GET() {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;
  return NextResponse.json({ ok: true, ids: Array.from(await getRepliedIds()) });
}

export async function POST(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;
  let body: { id?: string; where?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ ok: false, error: 'id 필요' }, { status: 400 });
  await markReplied(String(body.id));
  await appendAudit(gate.admin.email, 'reply-marked', `${body.where || ''} ${body.id}`);
  return NextResponse.json({ ok: true });
}
