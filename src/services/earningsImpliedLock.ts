import { Redis } from '@upstash/redis';
import { EARNINGS_IMPLIED_KEY } from '@/lib/earnings/earningsImplied';
import { withinImpliedDeadline } from '@/lib/earnings/impliedDeadline';

const LOCK_SEC = 90;
let client: Redis | undefined;

/** One authoritative store: cache GET/SET and cross-store fallback cannot acquire a lock. */
export async function acquireEarningsImpliedLock(deadlineMs?: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  try {
    client ??= new Redis({ url, token, retry: { retries: 0 } });
    // Leave the short lease to expire, preserving the existing 90-second refresh throttle.
    // A failed/late acknowledgement never permits supplier work or a fallback lock.
    return await withinImpliedDeadline(
      () => client!.set(`${EARNINGS_IMPLIED_KEY}:lock`, String(Date.now()), { nx: true, ex: LOCK_SEC }).then(result => result === 'OK'),
      Math.min(deadlineMs ?? Infinity, Date.now() + 2500),
    );
  } catch { return false; }
}
