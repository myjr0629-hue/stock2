import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/marketing-console/xOAuth';

// TEMPORARY probe — confirms whether US/JP OAuth tokens are stored (connection
// state) without exposing the tokens. Delete after verifying.
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-conn-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  const [en, jp] = await Promise.all([getConnection('en'), getConnection('jp')]);
  return NextResponse.json({
    ok: true,
    en: { connected: en.connected, username: en.username || null },
    jp: { connected: jp.connected, username: jp.username || null },
  });
}
