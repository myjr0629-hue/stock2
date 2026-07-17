import { NextRequest, NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Maintenance utility (CRON_SECRET-gated, NOT user-facing): list/delete our own
// X posts via the stored OAuth tokens. Exists because operator-side cleanup
// (e.g., deleting the Hangul-contaminated @signumhq_jp post, 2026-07-18) needs
// the server's token-refresh context.

interface StoredToken { access_token: string; refresh_token?: string; expires_at: number; username?: string }

async function validToken(acct: 'en' | 'jp'): Promise<string | null> {
  const key = `mkt:x:token:${acct}`;
  const stored = await getFromCache<StoredToken>(key);
  if (!stored) return null;
  if (Date.now() < stored.expires_at) return stored.access_token;
  if (!stored.refresh_token) return null;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: stored.refresh_token, client_id: process.env.X_CLIENT_ID || '' });
  const basic = Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` }, body,
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) return null;
  const tok = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  await setInCache(key, { access_token: tok.access_token, refresh_token: tok.refresh_token || stored.refresh_token, expires_at: Date.now() + (tok.expires_in - 60) * 1000, username: stored.username });
  return tok.access_token;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const sp = request.nextUrl.searchParams;
  const auth = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    if (auth !== `Bearer ${cronSecret}` && sp.get('secret') !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  const acct = sp.get('acct') === 'en' ? 'en' : 'jp';
  const action = sp.get('action');
  const t = await validToken(acct);
  if (!t) return NextResponse.json({ ok: false, error: 'token unavailable' }, { status: 502 });

  if (action === 'list') {
    const me = await fetch('https://api.x.com/2/users/me', { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(9000) }).then((r) => r.json()) as { data?: { id?: string } };
    const uid = me?.data?.id;
    if (!uid) return NextResponse.json({ ok: false, error: 'me failed', me }, { status: 502 });
    const tw = await fetch(`https://api.x.com/2/users/${uid}/tweets?max_results=5&tweet.fields=created_at`, { headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(9000) }).then((r) => r.json());
    return NextResponse.json({ ok: true, acct, tweets: tw });
  }
  if (action === 'delete') {
    const id = sp.get('id') || '';
    if (!/^[0-9]{5,25}$/.test(id)) return NextResponse.json({ ok: false, error: 'bad id' }, { status: 400 });
    const r = await fetch(`https://api.x.com/2/tweets/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` }, signal: AbortSignal.timeout(9000) });
    const j = await r.json().catch(() => ({}));
    return NextResponse.json({ ok: r.ok, status: r.status, result: j });
  }
  return NextResponse.json({ ok: false, error: 'action=list|delete' }, { status: 400 });
}
