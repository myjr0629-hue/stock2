import { NextRequest, NextResponse } from 'next/server';
import { bskyStatus } from '@/lib/marketing-console/bluesky';

// TEMPORARY probe — confirms Bluesky creds resolve + auth works (no secrets in
// response, no posting). Delete after verifying.
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-bsky-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  return NextResponse.json({ ok: true, ...(await bskyStatus()) });
}
