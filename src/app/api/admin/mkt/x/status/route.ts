import { NextResponse } from 'next/server';
import { requireMktAdmin } from '@/lib/marketing-console/mkt';
import { getConnection } from '@/lib/marketing-console/xOAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Connection status for both accounts (X Ops tab).
export async function GET() {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;
  const [en, jp] = await Promise.all([getConnection('en'), getConnection('jp')]);
  return NextResponse.json({ ok: true, en, jp });
}
