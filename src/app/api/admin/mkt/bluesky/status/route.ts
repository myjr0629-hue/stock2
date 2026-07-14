import { NextResponse } from 'next/server';
import { requireMktAdmin } from '@/lib/marketing-console/mkt';
import { bskyStatus } from '@/lib/marketing-console/bluesky';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Bluesky connection status (configured + auth check). No posting.
export async function GET() {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;
  return NextResponse.json({ ok: true, ...(await bskyStatus()) });
}
