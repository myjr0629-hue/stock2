import { timingSafeEqual } from 'node:crypto';
import { pseudonym } from '../giftShare/server';

export const TTL_SECONDS = 120 * 86400;
export const PREFIX = 'rc:cohort:v1';
const TYPES = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'CANCELLATION', 'UNCANCELLATION', 'EXPIRATION', 'NON_RENEWING_PURCHASE']);
const REASONS = new Set(['UNSUBSCRIBE', 'BILLING_ERROR', 'DEVELOPER_INITIATED', 'PRICE_INCREASE', 'CUSTOMER_SUPPORT', 'UNKNOWN', 'PRODUCT_CHANGE']);
export type RecordEvent = { user: string; transaction: string | null; type: string; period: string; at: number; purchased: number | null; expires: number | null; reason: string | null; environment: string };
const timestamp = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 8640000000000000 ? v : null;
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 1024;
export function authorized(header: string | null, secret: string): boolean {
  if (!secret || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function normalize(body: unknown, secret: string): { key: string; event: RecordEvent } | 'ignore' | null {
  if (!secret || !body || typeof body !== 'object') return null;
  const e = (body as {event?: Record<string, unknown>}).event;
  if (!e || typeof e !== 'object' || !id(e.id) || !id(e.type)) return null;
  if (!TYPES.has(e.type)) return 'ignore';
  if (!id(e.app_user_id) || !timestamp(e.event_timestamp_ms)) return null;
  const period = e.period_type === 'TRIAL' ? 'TRIAL' : e.period_type === 'NORMAL' ? 'NORMAL' : 'OTHER';
  const environment = e.environment === 'PRODUCTION' ? 'PRODUCTION' : e.environment === 'SANDBOX' ? 'SANDBOX' : 'UNKNOWN';
  const hash = (kind: string, value: string) => pseudonym(`rc-cohort-${kind}`, value, secret);
  return { key: `${PREFIX}:event:${hash('event', e.id)}`, event: {
    user: hash('user', e.app_user_id), transaction: id(e.original_transaction_id) ? hash('transaction', e.original_transaction_id) : null,
    type: e.type, period, at: timestamp(e.event_timestamp_ms)!, purchased: timestamp(e.purchased_at_ms), expires: timestamp(e.expiration_at_ms),
    reason: typeof e.cancel_reason === 'string' && REASONS.has(e.cancel_reason) ? e.cancel_reason :
      typeof e.expiration_reason === 'string' && REASONS.has(e.expiration_reason) ? e.expiration_reason : null, environment,
  }};
}
// Validate key types before the first write: Redis Lua does not roll back runtime errors.
export const INSERT_LUA = `
local eventType = redis.call('TYPE', KEYS[1]).ok
local countType = redis.call('TYPE', KEYS[2]).ok
if (eventType ~= 'none' and eventType ~= 'string') or (countType ~= 'none' and countType ~= 'hash') then return redis.error_reply('invalid key type') end
if eventType ~= 'none' then return 0 end
local old = redis.call('HGET', KEYS[2], ARGV[3])
if old and (not tonumber(old) or tonumber(old) ~= math.floor(tonumber(old)) or tonumber(old) < 0 or tonumber(old) >= 9007199254740991) then return redis.error_reply('invalid count') end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('HINCRBY', KEYS[2], ARGV[3], 1)
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1
`;
export type Store = { eval: (script: string, keys: string[], args: (string | number)[]) => Promise<unknown> };
export async function insert(store: Store, normalized: {key: string; event: RecordEvent}, now = Date.now()): Promise<'inserted' | 'duplicate'> {
  const day = new Date(now).toISOString().slice(0, 10);
  const result = await store.eval(INSERT_LUA, [normalized.key, `${PREFIX}:received:${day}`], [JSON.stringify(normalized.event), TTL_SECONDS, normalized.event.type]);
  if (result === 1) return 'inserted';
  if (result === 0) return 'duplicate';
  throw new Error('invalid storage response');
}
