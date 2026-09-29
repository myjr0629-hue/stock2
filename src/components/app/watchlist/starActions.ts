'use client';

// ============================================================================
// 별 누르기의 «동작» 한 벌 — 별 버튼·길게 누르기 시트·원탭 칩·검색 결과가 모두 이걸 부른다
// ----------------------------------------------------------------------------
//   담기   → 즉시 ★(호박색) + Success 진동 + 토스트 «내 종목에 추가 · 3/5 · 보기»(2.5초)
//            처음 한 번은 «★ 종목은 대시보드 맨 위와 종목 칩 줄 맨 앞에 모입니다»(4초)
//   한도   → 별을 채우지 않고 Warning 진동 + 한도 시트(PRO 시작하기 · 기존 종목 정리하기 · 코드 입력 · 나중에)
//   빼기   → 토스트 «내 종목에서 뺐습니다 · 되돌리기»(4초) — 빼는 건 언제나 무료
// 누름 자체의 Light 진동은 앱 레이아웃이 모든 탭에 이미 낸다(layout.tsx) — 여기서 또 내지 않는다.
// ============================================================================

import { FREE_LIMIT, getWatchlistStore, normalizeTicker, type UndoToken, type WatchlistSource } from '@/lib/app/watchlist';
import { getProSnapshot, whenProReady } from '@/lib/app/proEntitlement';
import { wlUI } from '@/lib/app/watchlistUI';
import { trackWatchlist } from '@/lib/app/watchlistAnalytics';
import { hapticNotification } from '@/lib/native/capacitorBridge';

const TIP_KEY = 'sg-watchlist-tip-v1';

function firstTimeTip(): boolean {
  try {
    if (localStorage.getItem(TIP_KEY)) return false;
    localStorage.setItem(TIP_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

async function currentLimit(): Promise<number> {
  let pro = getProSnapshot();
  // 권한 확인 전에 5개가 차 있으면 «PRO 인데 한도 시트»가 뜰 수 있다 → 잠깐 기다린다
  if (!pro.ready && getWatchlistStore().count() >= FREE_LIMIT) pro = await whenProReady(2500);
  return pro.isPro ? Infinity : FREE_LIMIT;
}

export type StarOutcome = 'added' | 'removed' | 'limit' | 'invalid' | 'already';

/** 담기만(이미 있으면 아무 일도 안 한다) — 원탭 칩·길게 누르기 «추가» */
export async function addStar(raw: string, src: WatchlistSource, trigger?: HTMLElement | null): Promise<StarOutcome> {
  const t = normalizeTicker(raw);
  if (!t) return 'invalid';
  const store = getWatchlistStore();
  if (store.has(t)) return 'already';
  const limit = await currentLimit();
  const r = store.add(t, src, limit);
  if (!r.ok) {
    if (r.reason === 'limit') {
      void hapticNotification('warning');
      trackWatchlist('wl_limit_sheet', { src, t, count: r.count });
      wlUI.openSheet({ kind: 'limit', ticker: t, src }, trigger);
      return 'limit';
    }
    return 'invalid';
  }
  void hapticNotification('success');
  trackWatchlist('wl_star_add', { src, t, count: r.count });
  wlUI.showToast({ kind: 'added', ticker: t, count: r.count, limit: limit === Infinity ? 0 : limit, first: firstTimeTip() });
  return 'added';
}

/** 빼기 — 되돌리기 토스트(4초) */
export function removeStar(raw: string, src: WatchlistSource | string): StarOutcome {
  const t = normalizeTicker(raw);
  if (!t) return 'invalid';
  const token = getWatchlistStore().remove(t);
  if (!token) return 'invalid';
  trackWatchlist('wl_star_remove', { src, t, count: getWatchlistStore().count() });
  wlUI.showToast({ kind: 'removed', ticker: t, undo: token });
  // 알림을 켜 둔 종목이면 그 설정도 걷는다(플래그 켜졌을 때만 의미가 있다)
  try { window.dispatchEvent(new CustomEvent('sg:watchlist-removed', { detail: { t } })); } catch { /* noop */ }
  return 'removed';
}

/** 별 버튼 — 담겨 있으면 빼고, 아니면 담는다 */
export async function toggleStar(raw: string, src: WatchlistSource, trigger?: HTMLElement | null): Promise<StarOutcome> {
  const t = normalizeTicker(raw);
  if (!t) return 'invalid';
  if (getWatchlistStore().has(t)) return removeStar(t, src);
  return addStar(t, src, trigger);
}

/** 되돌리기 — 한도를 넘으면(빼고 다른 걸 담은 뒤) 한도 시트 */
export async function undoRemove(token: UndoToken): Promise<StarOutcome> {
  const limit = await currentLimit();
  const r = getWatchlistStore().restore(token, limit);
  if (!r.ok) {
    if (r.reason === 'limit') {
      void hapticNotification('warning');
      wlUI.openSheet({ kind: 'limit', ticker: token.t, src: 'restore' });
      return 'limit';
    }
    return 'invalid';
  }
  trackWatchlist('wl_star_undo', { t: token.t });
  wlUI.dismissToast();
  return r.added ? 'added' : 'already';
}
