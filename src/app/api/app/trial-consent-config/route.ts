import { NextResponse } from 'next/server';
import { getAuthoritativeCache } from '@/services/redisClient';
import { TRIAL_CONSENT_OFF_KEY, trialConsentEnabled } from '@/lib/app/trialConsent';

export const dynamic = 'force-dynamic';

/** Read only. Enable only after this request confirms the authoritative switch. */
export async function GET() {
  const reply = (enabled: boolean) => NextResponse.json({ enabled }, { headers: { 'Cache-Control': 'no-store' } });
  if (process.env.TRIAL_CONSENT_OFF === '1') return reply(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      getAuthoritativeCache<unknown>(TRIAL_CONSENT_OFF_KEY),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 1_500); }),
    ]);
    return reply(result.ok && trialConsentEnabled({ redis: result.value }));
  } catch { return reply(false); }
  finally { clearTimeout(timer); }
}
