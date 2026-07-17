import { NextRequest, NextResponse } from 'next/server';
import { callToss } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// CRON_SECRET-gated diagnostic: dump RAW Toss responses so we can see the exact
// account-identifier shape (X-Tossinvest-Account expects an accountId, which is
// NOT the human account number). Read-only. Never user-facing.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const sp = request.nextUrl.searchParams;
  const auth = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    if (auth !== `Bearer ${cronSecret}` && sp.get('secret') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  const accounts = await callToss({ path: '/api/v1/accounts' });
  const buying = await callToss({ path: '/api/v1/buying-power', query: { currency: 'USD' } });
  const holdings = await callToss({ path: '/api/v1/holdings' });
  return NextResponse.json({ accounts, buying, holdings });
}
