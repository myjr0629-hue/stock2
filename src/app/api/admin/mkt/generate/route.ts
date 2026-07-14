import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin, appendAudit } from '@/lib/marketing-console/mkt';
import { generateDrafts } from '@/lib/marketing-console/generate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Bedrock

export async function POST(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  let body: { ticker?: string; eventType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const ticker = (body.ticker || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!ticker) return NextResponse.json({ ok: false, error: '티커를 입력하세요' }, { status: 400 });

  try {
    const result = await generateDrafts(ticker, body.eventType || 'event');
    await appendAudit(gate.admin.email, 'generate', `${ticker} (${result.drafts.length} drafts)`);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
