'use client';

import { openExternalUrl } from '@/lib/native/capacitorBridge';
import type { TrialStore } from '@/lib/app/trialConsent';

/** Extracted from settings. Its no-argument platform behavior is unchanged. */
export async function openSubscriptionManagement(store?: TrialStore): Promise<void> {
  const isIOS = store ? store === 'APP_STORE'
    : typeof document !== 'undefined' && document.documentElement.classList.contains('native-ios');
  await openExternalUrl(isIOS
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions');
}
