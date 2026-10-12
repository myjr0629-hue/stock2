'use client';

// ============================================================================
// 첫 실행 끄기 스위치 읽기 — 가벼운 클라이언트 모듈 (2026-10-12)
// ----------------------------------------------------------------------------
// 모든 앱 화면에 실리는 오버레이(AppFirstRunOnboarding)가 읽는다 — 무거운 가치 단계 모듈(시세·레벨·AI 줄)은 여기서 가져오지 않는다.
// ============================================================================

import { useEffect, useState } from 'react';
import { parseOnbConfig, type OnbMode } from '@/lib/app/onboardingConfig';

// 5초 — 콜드 스타트한 서버리스 함수도 기다린다. 이 읽기는 오버레이가 뜰 때 시작하고 «계속»을 누를 때만 기다리므로(보통 그 전에 끝난다) 길어도 사용자는 못 느낀다.
const CONFIG_TIMEOUT_MS = 5_000;
let configPromise: Promise<OnbMode> | null = null;

/** /api/app/onboarding-config — 앱 실행당 한 번. 못 읽으면(오프라인·시간 초과·오류) legacy: 모르면 알려진 정상 경로로 간다. */
export function loadOnbMode(): Promise<OnbMode> {
  if (configPromise) return configPromise;
  configPromise = (async () => {
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tid = setTimeout(() => ctl?.abort(), CONFIG_TIMEOUT_MS);
    try {
      const r = await fetch('/api/app/onboarding-config', ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' });
      if (!r.ok) return 'legacy';
      return parseOnbConfig(await r.json()) ?? 'legacy';
    } catch {
      return 'legacy';
    } finally {
      clearTimeout(tid);
    }
  })();
  return configPromise;
}

/** 시험·재시도용 */
export function _resetOnbModeForTest() { configPromise = null; }

/** 모드 — 아직 모르면 null(첫 그림은 v2 로 가정하고, 법적 고지를 «계속» 누를 때 loadOnbMode 를 기다린다) */
export function useOnbMode(enabled: boolean): OnbMode | null {
  const [mode, setMode] = useState<OnbMode | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    void loadOnbMode().then((m) => { if (!dead) setMode(m); });
    return () => { dead = true; };
  }, [enabled]);
  return mode;
}
