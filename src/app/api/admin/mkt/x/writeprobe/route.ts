import { NextRequest, NextResponse } from 'next/server';
import { diagnoseWrite, type Acct } from '@/lib/marketing-console/xOAuth';

// TEMPORARY probe — server-side X write diagnostic (posts + immediately deletes a
// throwaway tweet) to reveal the exact write error. Delete after use.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-write-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  const acct = (req.nextUrl.searchParams.get('acct') === 'jp' ? 'jp' : 'en') as Acct;
  const result = await diagnoseWrite(acct);
  return NextResponse.json({ ok: true, acct, result });
}
