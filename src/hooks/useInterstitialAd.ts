'use client';

import { useCallback, useRef } from 'react';

/**
 * Interstitial ad hook — fires after every N tab navigations.
 * 
 * Rules:
 * - Minimum 3 minutes between ads
 * - Maximum 2 ads per session
 * - First session after install: no interstitial
 * - Does NOT fire during data loading
 * 
 * Currently shows a placeholder. Replace with AdMob SDK when ready.
 */

const TRIGGER_EVERY = 5;        // every 5 tab switches
const MIN_INTERVAL_MS = 180000; // 3 minutes
const MAX_PER_SESSION = 2;

// Session-level state (resets on app restart)
let navCount = 0;
let adShownCount = 0;
let lastAdTimestamp = 0;

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

    // Skip on first session (onboarding experience)
    if (isFirstSession.current) return;

    // Check frequency conditions
    if (navCount % TRIGGER_EVERY !== 0) return;
    if (adShownCount >= MAX_PER_SESSION) return;
    if (Date.now() - lastAdTimestamp < MIN_INTERVAL_MS) return;

    // Show interstitial
    adShownCount++;
    lastAdTimestamp = Date.now();

    // TODO: Replace with actual AdMob interstitial
    // import { AdMob } from '@capacitor-community/admob';
    // await AdMob.showInterstitial();
    console.log('[Ad] Interstitial triggered', { navCount, adShownCount });

  }, []);

  return { onTabSwitch };
}
