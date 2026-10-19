'use client';

import { useCallback, useEffect } from 'react';

/**
 * Interstitial ad hook for tab navigation.
 *
 * Cadence here = "attempt an ad every Nth tab switch, and never during the
 * very first app run after install (onboarding)". The actual policy/UX safety caps (cold-start
 * grace, ≥3 min spacing, per-session hard cap) live in adManager and are SHARED
 * across every interstitial trigger, so the user never sees back-to-back ads no
 * matter which trigger fires.
 */

const TRIGGER_EVERY = 5; // attempt an ad every 5 tab switches

// Session-level nav counter (resets on app restart)
let navCount = 0;

// ★ 2026-10-19 «첫 세션» 판정 수리.
//   예전엔 sessionStorage('app-session-started') 를 useRef 초기값으로 읽었다. sessionStorage 는
//   앱을 «켤 때마다» 비므로, 하단 탭(AppBottomNav)이 한 번 마운트된 채 유지되는 실행에서는
//   설치 첫 실행이 아니어도 매번 «첫 세션»으로 판정돼 탭 전면이 그 실행 내내 막혔다.
//   이제 «설치 후 첫 실행»만 첫 세션이다: localStorage 표식(없으면 기존 사용자 증거 =
//   signum_ad_stats 로 대신)을 JS 수명당 한 번 읽고, 렌더 중이 아니라 마운트 뒤에 쓴다.
const FIRST_RUN_KEY = 'signum_app_first_run_at';
const EXISTING_USER_EVIDENCE = 'signum_ad_stats'; // adManager 가 배너 노출부터 기록한다
let firstRun: boolean | undefined;

/** 이 JS 수명이 «설치 후 첫 실행»인가. 처음 부를 때 한 번 판정·기록하고 그 값을 유지한다. */
export function isFirstAppRun(): boolean {
  if (firstRun !== undefined) return firstRun;
  try {
    firstRun = !localStorage.getItem(FIRST_RUN_KEY) && !localStorage.getItem(EXISTING_USER_EVIDENCE);
    if (!localStorage.getItem(FIRST_RUN_KEY)) localStorage.setItem(FIRST_RUN_KEY, String(Date.now()));
  } catch {
    firstRun = false; // 저장소를 못 쓰면 «첫 실행» 보호를 영구 적용하지 않는다(adManager 의 60초 유예는 그대로)
  }
  return firstRun;
}

/** 시험 전용 — 모듈 상태를 새 JS 수명처럼 되돌린다. */
export function __resetInterstitialHookForTest() { navCount = 0; firstRun = undefined; }

export function useInterstitialAd() {
  // 판정은 첫 마운트 뒤에(렌더 중 저장소 쓰기 없음). 재마운트돼도 JS 수명당 값은 하나다.
  useEffect(() => { if (typeof window !== 'undefined') isFirstAppRun(); }, []);

  const onTabSwitch = useCallback(() => {
    navCount++;

    // No interstitials during the first app run after install (onboarding experience).
    if (typeof window === 'undefined' || isFirstAppRun()) return;

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
