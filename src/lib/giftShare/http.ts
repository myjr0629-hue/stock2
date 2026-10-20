import { NextRequest, NextResponse } from 'next/server';
import { UA_BOT_RE, isPreviewBot } from '@/lib/marketing/clickHuman';
import { inviteClientIp, ipFamily } from '@/lib/invite/guard';
import { createClient } from '@/lib/supabase/server';
import { giftSecret, newToken, pseudonym } from './server';

export const giftHeaders = { 'cache-control': 'private, no-store, max-age=0', 'referrer-policy': 'no-referrer' };
const COOKIE = 'sg_gift_recipient';
export function giftOs(req: NextRequest) {
  const ua = req.headers.get('user-agent') || '';
  return /android/i.test(ua) ? 'android' as const : /iphone|ipad|ipod/i.test(ua) ? 'ios' as const : null;
}
export function validGiftPost(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') || '';
  if (!/Mozilla\//.test(ua) || UA_BOT_RE.test(ua) || isPreviewBot(ua)) return false;
  try { if (new URL(req.headers.get('origin') || '').origin !== req.nextUrl.origin) return false; } catch { return false; }
  const site = req.headers.get('sec-fetch-site');
  return !site || site === 'same-origin';
}
export function giftIdentity(req: NextRequest) {
  const secret = giftSecret();
  if (!secret) return null;
  const raw = req.cookies.get(COOKIE)?.value || '';
  const [id, sig] = raw.split('.');
  const valid = /^[A-Za-z0-9_-]{43}$/.test(id || '') && sig === pseudonym('cookie', id, secret);
  const value = valid ? id : newToken();
  const deviceKey = req.headers.get('x-gift-device') || '';
  const app = /^[A-Za-z0-9_-]{32,128}$/.test(deviceKey);
  return { device: pseudonym('device', app ? deviceKey : value, secret), app, validCookie: valid,
    cookie: `${value}.${pseudonym('cookie', value, secret)}` };
}
export function setGiftCookie(res: NextResponse, value: string) {
  res.cookies.set(COOKIE, value, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 400 * 86400 });
  return res;
}
export function giftIp(req: NextRequest): string | null {
  const ip = inviteClientIp(req.headers);
  return ip ? pseudonym('ip', ipFamily(ip), giftSecret()) : null;
}
/** 계정은 클라이언트 본문 대신 기존 인증 서버에서 검증한 ID만 사용한다. */
export async function giftAccount(req: NextRequest): Promise<string | undefined> {
  const auth = req.headers.get('authorization');
  if (!auth && !req.cookies.getAll().some(c => c.name.startsWith('sb-') && c.name.includes('auth-token'))) return undefined;
  if (auth && !/^Bearer [^\s]+$/.test(auth)) throw new Error('선물 계정 검증 실패');
  const client = await createClient();
  const { data, error } = auth ? await client.auth.getUser(auth.slice(7)) : await client.auth.getUser();
  if (error || !data.user) throw new Error('선물 계정 검증 실패');
  return pseudonym('account', data.user.id, giftSecret());
}
