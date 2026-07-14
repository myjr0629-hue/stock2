import { NextRequest, NextResponse } from 'next/server';
import { getMarketingAdmin } from '@/lib/marketing-console/auth';
import { exchangeCode } from '@/lib/marketing-console/xOAuth';
import { appendAudit } from '@/lib/marketing-console/mkt';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// X redirects here after the admin approves. Same-domain, so the admin's session
// cookie is present — we re-verify admin, exchange the code, store tokens.
export async function GET(req: NextRequest) {
  const admin = await getMarketingAdmin();
  if (!admin) return new NextResponse('Not found', { status: 404 });

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const console = `${req.nextUrl.origin}/en/admin/marketing?tab=x`;

  if (!code || !state) {
    return NextResponse.redirect(`${console}&x_error=${encodeURIComponent('code/state 누락')}`);
  }
  try {
    const { acct, username } = await exchangeCode(code, state);
    await appendAudit(admin.email, 'x-oauth-connect', `${acct}${username ? ` (@${username})` : ''}`);
    return NextResponse.redirect(`${console}&x_connected=${acct}`);
  } catch (e) {
    return NextResponse.redirect(`${console}&x_error=${encodeURIComponent((e as Error).message)}`);
  }
}
