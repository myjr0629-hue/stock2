import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { kstDay, playRedeemUrl } from '@/lib/marketing/coupon';
import { giftCap, giftPrefix, giftToken, type GiftOs } from './config';
import { CLAIM_LUA, ISSUE_LUA } from './atomic.cjs';

export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export const pseudonym = (kind: string, value: string, secret: string) => createHmac('sha256', secret).update(`${kind}|${value}`).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export function giftSecret(): string {
  return process.env.GIFT_SHARE_SECRET || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
}
export type GiftStore = { eval: (script: string, keys: string[], args: (string | number)[]) => Promise<unknown> };
/** 기존 쿠폰·추천 저장소와 같은 Upstash 클라이언트·연결 설정. EC2 캐시 폴백은 사용하지 않는다. */
export function giftStore(): GiftStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const r = new Redis({ url, token, automaticDeserialization: false, enableTelemetry: false,
    retry: { retries: 0 }, signal: () => AbortSignal.timeout(3000) });
  return { eval: (script, keys, args) => r.eval(script, keys, args) };
}
export async function issueGift(store: GiftStore, input: { device: string; account?: string; ip: string; app: boolean }, now = Date.now()) {
  const p = giftPrefix();
  const day = kstDay(now);
  const token = newToken();
  const identities = [`${p}:issue:${day}:device:${input.device}`];
  const limits = [input.app ? 3 : 1];
  if (input.account) { identities.push(`${p}:issue:${day}:account:${input.account}`); limits.push(3); }
  identities.push(`${p}:issue:${day}:ip:${input.ip}`, `${p}:issue:${day}:all`);
  limits.push(10, 400);
  const result = await store.eval(ISSUE_LUA, [`${p}:token:${digest(token)}`, ...identities], [now, 7 * 86400, ...limits]);
  return result === 'issued' ? { token, expiresAt: now + 7 * 86400_000 } : null;
}
export async function claimGift(store: GiftStore, input: { token: unknown; os: GiftOs; device: string; account?: string }, now = Date.now()): Promise<string | null> {
  const token = giftToken(input.token);
  if (!token) return null;
  const p = giftPrefix();
  const hash = digest(token);
  const recipients = [`${p}:recipient:device:${input.device}`];
  if (input.account) recipients.push(`${p}:recipient:account:${input.account}`);
  const result = await store.eval(CLAIM_LUA, [
    `${p}:token:${hash}`, `${p}:batches:${input.os}`,
    `${p}:day:${kstDay(now)}:${input.os}`, `${p}:ledger`, ...recipients,
  ], [now, input.os, input.device, giftCap(input.os), hash, p, input.account || '']);
  if (!Array.isArray(result) || !['new', 'again'].includes(result[0]) || typeof result[1] !== 'string') return null;
  const code = result[1];
  if (!(input.os === 'ios' ? /^[A-Z0-9]{18}$/ : /^[A-Z0-9]{23}$/).test(code)) return null;
  return input.os === 'ios'
    ? `https://apps.apple.com/redeem?ctx=offercodes&id=6783130444&code=${encodeURIComponent(code)}`
    : playRedeemUrl(code);
}
