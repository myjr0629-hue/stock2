// ============================================================================
// 대가 렌즈 4~10위(PRO 전용) — 화면·데이터 요청이 함께 보는 PRO 판정
// ----------------------------------------------------------------------------
// 왜(11/16 FIX-PRO «범위 밖» 수리):
//   렌즈 데이터 요청은 proEntitlement(useWatchlistPro) 의 isPro 만, 잠금 자리는 useProStatus 의 isPro 만 따랐다.
//   둘 중 한쪽의 초기 SDK 조회가 실패하면(applyReal(false)·isPro false 유지) 돈 낸 PRO 사용자에게
//   «무료 요청 → 서버가 4~10위를 잠금 자리로 응답 → 잠금 화면»이 계속 보였다(다른 게이트는 이미 PRO 로 열렸는데도).
// 규칙(게이트 공유 상태 lib/app/gatePaywall storeProSignal 과 같은 원칙):
//   · «가장 최신 스토어 응답»(모든 useProStatus·proEntitlement·게이트 재조회·구매·복원이 기록)이 있으면 그것을 따른다
//     → 스토어가 확인한 PRO 는 렌즈도 즉시 인정, 더 최신 무료 응답(만료·회수)은 즉시 반영.
//   · 응답 기록이 없으면(조회 실패·1시간 지난 PRO) 훅들의 isPro 중 하나라도 PRO 면 PRO — 불확실하면 PRO 를 잠그지 않는다.
//   · 첫 렌더(서버 렌더·hydration)는 신호를 읽지 않는다(getServerSnapshot = null) → 마운트 직후 반영.
//   서버(/api/guru-lens · lib/guruLens/proAccess)는 RevenueCat 을 따로 확인한다 — 무료 사용자가 이 값을 바꿔도 4~10위는 열리지 않는다.
// ============================================================================

import { useSyncExternalStore } from 'react';
import { storeProSignal } from './gatePaywall';
import { useWatchlistPro } from '@/lib/app/proEntitlement';

type Signal = Pick<typeof storeProSignal, 'latest' | 'proExpiresAt' | 'subscribe'>;

/** 최신 스토어 응답(없으면 null)이 이기고, 없으면 훅 값 중 하나라도 PRO 면 PRO */
export function lensProNow(latest: boolean | null, ...hookPro: boolean[]): boolean {
  return latest === null ? hookPro.some(Boolean) : latest;
}

/** 신호 변화 + PRO 1시간 만료(알림 없이 null 로 바뀜) 때 다시 그리게 한다 */
export function subscribeLensProSignal(listener: () => void, signal: Signal = storeProSignal): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const exp = signal.proExpiresAt();
    if (exp) timer = setTimeout(() => { timer = undefined; listener(); arm(); }, Math.max(0, exp - Date.now()) + 5);
  };
  arm();
  const off = signal.subscribe(() => { arm(); listener(); });
  return () => { off(); if (timer !== undefined) clearTimeout(timer); };
}

const subscribeSignal = (listener: () => void) => subscribeLensProSignal(listener);
const signalSnapshot = () => storeProSignal.latest();
const serverSnapshot = () => null;

/** 대가 렌즈 PRO — hookPro: 호출부가 이미 아는 PRO(잠금 자리의 useProStatus 등) */
export function useGuruLensPro(hookPro = false): { isPro: boolean } {
  const ent = useWatchlistPro();
  const latest = useSyncExternalStore(subscribeSignal, signalSnapshot, serverSnapshot);
  // 프리뷰 강제 표시(?sgpro=1 — 운영 도메인에서는 절대 켜지지 않음)는 그대로 PRO
  return { isPro: ent.preview || lensProNow(latest, ent.isPro, hookPro) };
}
