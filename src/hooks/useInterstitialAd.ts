'use client';

import { useCallback, useEffect } from 'react';
import { isFirstRunGraceActive, __resetFirstRunForTest } from '@/services/interstitialFirstRun';

/**
 * Interstitial ad hook for tab navigation.
 *
 * Cadence here = attempt an ad every third tab switch, or retry one pending
 * trigger on the next switch. Policy caps (first-install/cold-start grace,
 * ≥3 min spacing, local daily cap) live in adManager and are SHARED
 * across every interstitial trigger, so the user never sees back-to-back ads no
 * matter which trigger fires.
 */

const TRIGGER_EVERY = 3;

// Session-level nav counter (resets on app restart)
let navCount = 0;

/** 시험 전용 — 모듈 상태를 새 JS 수명처럼 되돌린다. */
export function __resetInterstitialHookForTest() { navCount = 0; __resetFirstRunForTest(); }

export function useInterstitialAd() {
  useEffect(() => { if (typeof window !== 'undefined') isFirstRunGraceActive(); }, []);

  const onTabSwitch = useCallback(() => {
    navCount++;

    if (typeof window === 'undefined') return;
    const triggerDue = navCount % TRIGGER_EVERY === 0;

    void (async () => {
      try {
        const { adManager } = await import('@/services/adManager');
        await adManager.onInterstitialTabSwitch(triggerDue);
      } catch {
        /* not native / ads unavailable — no-op */
      }
    })();
  }, []);

  return { onTabSwitch };
}
