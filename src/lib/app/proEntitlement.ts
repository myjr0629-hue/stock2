// ============================================================================
// PRO 권한(RevenueCat 'pro') — 앱 전체가 «한 번만» 구독하는 공용 상태
// ----------------------------------------------------------------------------
// 왜 useProStatus() 를 그대로 쓰지 않나:
//   useProStatus 는 부를 때마다 SDK 초기화·getCustomerInfo·getOfferings·리스너를
//   «그 컴포넌트 몫으로» 새로 건다. 별 버튼은 칩 줄·목록 행·검색 결과마다 수십 개가
//   동시에 뜨므로, 한도(무료 5 / PRO 100)만 알면 되는 곳에서 그걸 매번 부르면
//   오퍼링 조회가 수십 번 나간다. 판정 기준은 같다 — 같은 서비스 함수
//   (initRevenueCat · isProFromCustomerInfo, 권한 'pro')를 한 번 부르고 모두가 나눠 읽는다.
//   결제·복원·가격(offers)은 여전히 useProStatus() 가 맡는다(시트가 열릴 때만).
//
// 프리뷰 확인용: *.vercel.app · localhost 에서만 `?sgpro=1` 로 PRO 화면을 볼 수 있다
//   (운영 도메인에서는 절대 켜지지 않는다 — 결제 우회 통로가 되면 안 된다).
// ============================================================================

import { useSyncExternalStore } from 'react';
import { IAP_LIVE } from '@/config/iap';
import { initRevenueCat, isProFromCustomerInfo } from '@/services/revenueCat';

export interface ProState {
  isPro: boolean;
  /** 권한 확인이 끝났는가(웹·SDK 없음이면 즉시 true) */
  ready: boolean;
  /** 프리뷰 강제 표시(?sgpro=1) 중인가 */
  preview: boolean;
}

const SERVER_STATE: ProState = Object.freeze({ isPro: false, ready: false, preview: false });
let state: ProState = { isPro: false, ready: !IAP_LIVE, preview: false };
const listeners = new Set<() => void>();
let started = false;
let realPro = false;

/** 운영이 아닌 호스트인가(프리뷰·로컬). 운영 도메인에서는 항상 false. */
export function isPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname || '';
  return h.endsWith('.vercel.app') || h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost');
}

/** 프리뷰 전용 강제 플래그 — `?name=1` 로 켜고 `?name=0` 으로 끈다(세션 동안 유지). */
export function previewFlag(name: string): boolean {
  if (!isPreviewHost()) return false;
  const k = `sg-preview-${name}`;
  try {
    const q = new URLSearchParams(window.location.search).get(name);
    if (q === '1') sessionStorage.setItem(k, '1');
    else if (q === '0') sessionStorage.removeItem(k);
    return sessionStorage.getItem(k) === '1';
  } catch {
    return false;
  }
}

function set(next: Partial<ProState>) {
  const merged = { ...state, ...next };
  if (merged.isPro === state.isPro && merged.ready === state.ready && merged.preview === state.preview) return;
  state = merged;
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

function applyReal(isPro: boolean) {
  realPro = isPro;
  const preview = previewFlag('sgpro');
  set({ isPro: realPro || preview, ready: true, preview });
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const preview = previewFlag('sgpro');
  if (preview) set({ isPro: true, preview: true });
  if (!IAP_LIVE) { applyReal(false); return; }
  (async () => {
    const ok = await initRevenueCat();
    if (!ok) { applyReal(false); return; }
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    try {
      const { customerInfo } = await Purchases.getCustomerInfo();
      applyReal(isProFromCustomerInfo(customerInfo));
    } catch {
      applyReal(false);
    }
    try {
      await Purchases.addCustomerInfoUpdateListener((info) => applyReal(isProFromCustomerInfo(info)));
    } catch { /* 리스너를 못 걸어도 현재 값은 유지된다 */ }
  })().catch(() => applyReal(false));
}

export function subscribePro(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getProSnapshot(): ProState {
  return state;
}

/** 확인이 끝날 때까지(최대 timeoutMs) 기다린다 — 한도 판정 직전에만 쓴다. */
export function whenProReady(timeoutMs = 2500): Promise<ProState> {
  start();
  if (state.ready) return Promise.resolve(state);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; off(); clearTimeout(timer); resolve(state); };
    const off = subscribePro(() => { if (state.ready) finish(); });
    const timer = setTimeout(finish, timeoutMs);
  });
}

/** 구매·복원 직후 등 «지금 바로» 반영하고 싶을 때 */
export function notifyProPurchased(isPro: boolean) {
  if (isPro) applyReal(true);
}

export function useWatchlistPro(): ProState {
  return useSyncExternalStore(subscribePro, getProSnapshot, () => SERVER_STATE);
}
