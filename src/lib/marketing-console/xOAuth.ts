// ============================================================================
// X OAuth 2.0 (PKCE, confidential client) — connect @signumhq / @signumhq_jp
// so the console can POST replies on their behalf. Publishing is still a human
// click; there is no automated posting loop. Tokens live in Redis (mkt:x:token:*).
// ============================================================================

import crypto from 'crypto';
import { getFromCache, setInCache, deleteFromCache } from '@/services/redisClient';

const AUTH_URL = 'https://x.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const SCOPES = 'tweet.read tweet.write users.read offline.access';
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';
export const REDIRECT_URI = `${SITE}/api/admin/x-oauth/callback`;

export type Acct = 'en' | 'jp';
export const ACCTS: Record<Acct, string> = { en: '@signumhq', jp: '@signumhq_jp' };

interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
  username?: string;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function clientId(): string {
  const id = process.env.X_CLIENT_ID;
  if (!id) throw new Error('X_CLIENT_ID not set');
  return id;
}
function basicAuth(): string {
  const id = process.env.X_CLIENT_ID;
  const secret = process.env.X_CLIENT_SECRET;
  if (!id || !secret) throw new Error('X_CLIENT_ID / X_CLIENT_SECRET not set');
  return Buffer.from(`${id}:${secret}`).toString('base64');
}

// ---- Authorize (step 1) ---------------------------------------------------
export async function buildAuthUrl(acct: Acct): Promise<string> {
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  // Persist verifier+acct keyed by state (10 min).
  await setInCache(`mkt:x:oauth:state:${state}`, { verifier, acct }, 600);

  const p = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(),
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${p.toString()}`;
}

// ---- Callback exchange (step 2) -------------------------------------------
export async function exchangeCode(code: string, state: string): Promise<{ acct: Acct; username?: string }> {
  const saved = await getFromCache<{ verifier: string; acct: Acct }>(`mkt:x:oauth:state:${state}`);
  if (!saved) throw new Error('state 만료 또는 불일치 — 다시 시도하세요');
  await deleteFromCache(`mkt:x:oauth:state:${state}`);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: saved.verifier,
    client_id: clientId(),
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth()}` },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`token 교환 실패 ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const tok = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };

  const username = await fetchUsername(tok.access_token).catch(() => undefined);
  const stored: StoredToken = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
    username,
  };
  await setInCache(`mkt:x:token:${saved.acct}`, stored); // no TTL; refreshed as needed
  return { acct: saved.acct, username };
}

async function fetchUsername(accessToken: string): Promise<string | undefined> {
  const res = await fetch('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return undefined;
  const j = (await res.json()) as { data?: { username?: string } };
  return j.data?.username;
}

// ---- Refresh + valid access token -----------------------------------------
async function refresh(acct: Acct, stored: StoredToken): Promise<StoredToken | null> {
  if (!stored.refresh_token) return null;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: stored.refresh_token,
    client_id: clientId(),
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basicAuth()}` },
    body,
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const tok = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  const next: StoredToken = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || stored.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 60) * 1000,
    username: stored.username,
  };
  await setInCache(`mkt:x:token:${acct}`, next);
  return next;
}

export async function getConnection(acct: Acct): Promise<{ connected: boolean; username?: string }> {
  const stored = await getFromCache<StoredToken>(`mkt:x:token:${acct}`);
  return stored ? { connected: true, username: stored.username } : { connected: false };
}

async function validAccessToken(acct: Acct): Promise<string | null> {
  let stored = await getFromCache<StoredToken>(`mkt:x:token:${acct}`);
  if (!stored) return null;
  if (Date.now() >= stored.expires_at) {
    stored = await refresh(acct, stored);
    if (!stored) return null;
  }
  return stored.access_token;
}

// ---- Post a reply ---------------------------------------------------------
export async function postReply(
  acct: Acct,
  replyToId: string,
  text: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const token = await validAccessToken(acct);
  if (!token) return { ok: false, error: '계정 미연결 또는 토큰 만료 — 연결 페이지에서 재승인' };
  try {
    const res = await fetch('https://api.x.com/2/tweets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, reply: { in_reply_to_tweet_id: replyToId } }),
      signal: AbortSignal.timeout(12000),
    });
    const j = (await res.json()) as { data?: { id: string }; detail?: string; title?: string };
    if (!res.ok) return { ok: false, error: j.detail || j.title || `X ${res.status}` };
    return { ok: true, id: j.data?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
