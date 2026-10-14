import { NextResponse } from 'next/server';
import { getFromCache, getRedisStatus } from '@/services/redisClient';
import { TRIAL_CONSENT_OFF_KEY, trialConsentEnabled } from '@/lib/app/trialConsent';

export const dynamic = 'force-dynamic';

/** Read only. Same Redis kill-switch pattern as /api/app/onboarding-config. */
export async function GET() {
  const reply = (enabled: boolean) => NextResponse.json({ enabled }, { headers: { 'Cache-Control': 'no-store' } });
  if (process.env.TRIAL_CONSENT_OFF === '1') return reply(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const redis = await Promise.race([
      getFromCache<unknown>(TRIAL_CONSENT_OFF_KEY),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 1_500); }),
    ]);
    // getFromCache also returns null on backend failure. Only trust an enabled
    // result while the authoritative EC2 backend is healthy (otherwise hide).
    return reply(trialConsentEnabled({ redis }) && getRedisStatus().ecProxyAvailable === true);
  } catch { return reply(false); }
  finally { clearTimeout(timer); }
}
