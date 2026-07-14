import { NextRequest, NextResponse } from 'next/server';
import { getMarketingAdmin } from '@/lib/marketing-console/auth';
import { buildAuthUrl, type Acct } from '@/lib/marketing-console/xOAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Browser navigation: admin clicks "연결" → redirect to X authorize.
export async function GET(req: NextRequest) {
  const admin = await getMarketingAdmin();
  if (!admin) return new NextResponse('Not found', { status: 404 });

  const acct = (req.nextUrl.searchParams.get('acct') === 'jp' ? 'jp' : 'en') as Acct;
  try {
    const url = await buildAuthUrl(acct);
    return NextResponse.redirect(url);
  } catch (e) {
    return new NextResponse(`OAuth 시작 실패: ${(e as Error).message}`, { status: 500 });
  }
}
