// ============================================================================
// «내 종목» 화면 공용 상태 — 토스트 하나 · 시트 하나 · 페이월
// ----------------------------------------------------------------------------
// 별 버튼은 커맨드·플로우·칩 줄·검색·목록 행·대시보드 어디서든 눌린다. 토스트와 시트는
// «한 번에 하나»여야 하므로(시안 06-F) 앱 레이아웃에 하나만 둔 WatchlistHost 가 이 상태를 그린다.
// ============================================================================

import { useSyncExternalStore } from 'react';
import type { UndoToken } from '@/lib/app/watchlist';

export interface RowMeta {
  name?: string | null;
  price?: number | null;
  changePct?: number | null;
}

/** 알림 예시·설정 시트가 쓰는 «검사를 통과한» 레벨(없으면 null — 숫자를 지어내지 않는다) */
export interface VerifiedLevels {
  S: number;
  pf: number;
  mp: number;
  cw: number;
  gf: number | null;
  /** 레벨 기준 날짜(알면) — «레벨 9/28 마감 기준» */
  asOf?: string | null;
  /** 가격이 종가인가 장중인가 */
  basisLabel?: string | null;
}

export type SheetRequest =
  | { kind: 'longpress'; ticker: string; src: string; meta?: RowMeta }
  | { kind: 'limit'; ticker: string; src: string }
  | { kind: 'alertUpsell'; ticker?: string | null; src: string; levels?: VerifiedLevels | null; meta?: RowMeta }
  | { kind: 'alertSettings'; ticker: string; levels?: VerifiedLevels | null; meta?: RowMeta }
  /** focus 'chips' — 잠긴 두 번째 칩에서 열렸다(«모든 인사이트 칩»을 앞에) */
  | { kind: 'proGeneric'; src: string; focus?: 'chips' }
  | { kind: 'mapInfo' };

export type ToastRequest =
  | { kind: 'added'; ticker: string; count: number; limit: number }
  | { kind: 'removed'; ticker: string; undo: UndoToken }
  | { kind: 'text'; text: { ko: string; en: string; ja: string }; tone?: 'ok' | 'warn' };

export interface WatchlistUIState {
  sheet: (SheetRequest & { id: number; trigger: HTMLElement | null }) | null;
  toast: (ToastRequest & { id: number; duration: number }) | null;
  paywall: { lead: 'watchlist' | 'alerts' | 'ads'; id: number } | null;
}

let state: WatchlistUIState = { sheet: null, toast: null, paywall: null };
const SERVER: WatchlistUIState = Object.freeze({ sheet: null, toast: null, paywall: null });
const listeners = new Set<() => void>();
let seq = 0;

function set(next: Partial<WatchlistUIState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

function activeElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.activeElement as HTMLElement | null;
  return el && el !== document.body ? el : null;
}

export const wlUI = {
  openSheet(req: SheetRequest, trigger?: HTMLElement | null) {
    set({ sheet: { ...req, id: ++seq, trigger: trigger ?? activeElement() } });
  },
  closeSheet(id?: number) {
    if (id != null && state.sheet?.id !== id) return;
    set({ sheet: null });
  },
  /** 한 번에 하나 — 새 토스트가 이전 것을 바로 바꾼다. 추가 2.5초 · 빼기(되돌리기) 4초(시안 06-F) */
  showToast(req: ToastRequest, duration?: number) {
    const d = duration ?? (req.kind === 'removed' ? 4000 : 2500);
    set({ toast: { ...req, id: ++seq, duration: d } });
  },
  dismissToast(id?: number) {
    if (id != null && state.toast?.id !== id) return;
    set({ toast: null });
  },
  openPaywall(lead: 'watchlist' | 'alerts' | 'ads' = 'watchlist') {
    set({ paywall: { lead, id: ++seq } });
  },
  closePaywall() {
    set({ paywall: null });
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot: () => state,
};

export function useWatchlistUI(): WatchlistUIState {
  return useSyncExternalStore(wlUI.subscribe, wlUI.getSnapshot, () => SERVER);
}
