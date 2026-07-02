'use client';

import { useCallback, useRef } from 'react';

/**
 * Interstitial ad hook for tab navigation.
 *
 * Cadence here = "attempt an ad every Nth tab switch, and never on the very
 * first session (onboarding)". The actual policy/UX safety caps (cold-start
 * grace, ≥3 min spacing, per-session hard cap) live in adManager and are SHARED
 * across every interstitial trigger, so the user never sees back-to-back ads no
 * matter which trigger fires.
 */

const TRIGGER_EVERY = 5; // attempt an ad every 5 tab switches

// Session-level nav counter (resets on app restart)
let navCount = 0;

export function useInterstitialAd() {
  const isFirstSession = useRef(
    typeof window !== 'undefined' && !sessionStorage.getItem('app-session-started')
  );

  // Mark session as started
  if (typeof window !== 'undefined') {
    sessionStorage.setItem('app-session-started', '1');
  }

  const onTabSwitch = useCallback(() => {
    navCount++;

    // No interstitials during the first session (onboarding experience).
    if (isFirstSession.current) return;

    // Only attempt on the cadence; adManager enforces the real frequency caps.
    if (navCount % TRIGGER_EVERY !== 0) return;

    void (async () => {
      try {
        const { adManager } = await import('@/services/adManager');
        await adManager.maybeShowInterstitial();
      } catch {
        /* not native / ads unavailable — no-op */
      }
    })();
  }, []);

  return { onTabSwitch };
}
