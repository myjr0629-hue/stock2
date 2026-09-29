'use client';

// ============================================================================
// 별 누르기의 «동작» 한 벌 — 별 버튼·길게 누르기 시트·원탭 칩·검색 결과가 모두 이걸 부른다
// ----------------------------------------------------------------------------
//   담기   → 즉시 ★(호박색) + Success 진동 + 토스트 «내 종목에 담았습니다 · 3/5 · 보기»(2.5초)
//            처음 한 번은 «담은 종목은 Dashboard 위쪽과 Command·Flow 상단 종목 칩 맨 앞에 모입니다»(4초)
//   한도   → 별을 채우지 않고 Warning 진동 + 한도 시트(PRO 시작하기 · 기존 종목 정리하기 · 코드 입력 · 나중에)
//   상한   → PRO 도 기기 상한(MAX_ITEMS)에 닿으면 한도 시트가 아니라 «최대 N종목» 토스트
//            (시트 → «PRO 가 됐다» → 다시 담기 → 시트 … 로 끝없이 돌지 않게)
//   빼기   → 토스트 «내 종목에서 뺐습니다 · 되돌리기»(4초) — 빼는 건 언제나 무료
//   저장 실패(사생활 모드·용량 초과) → «기기에 저장하지 못했습니다» 토스트(앱을 닫으면 사라질 수 있다)
// 누름 자체의 Light 진동은 앱 레이아웃이 모든 탭에 이미 낸다(layout.tsx) — 여기서 또 내지 않는다.
// ============================================================================

import {
  FREE_LIMIT, MAX_ITEMS, addOutcome, getWatchlistStore, normalizeTicker, type UndoToken, type WatchlistSource,
} from '@/lib/app/watchlist';
import { getProSnapshot, whenProReady } from '@/lib/app/proEntitlement';
import { wlUI } from '@/lib/app/watchlistUI';
import { trackWatchlist } from '@/lib/app/watchlistAnalytics';
import { hapticNotification } from '@/lib/native/capacitorBridge';
import { WL_COPY, type WlCopy } from './copy';

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

export type StarOutcome = 'added' | 'removed' | 'limit' | 'max' | 'invalid' | 'already';

/** 토스트용 세 언어 문구 — 문구는 copy.ts 한 곳에 둔다 */
export function wlText(pick: (c: WlCopy) => string): { ko: string; en: string; ja: string } {
  return { ko: pick(WL_COPY.ko), en: pick(WL_COPY.en), ja: pick(WL_COPY.ja) };
}

/** 기기 상한에 닿았다 — PRO 로도 넘지 못하므로 구매 시트가 아니라 사실만 알린다 */
function showMaxToast() {
  void hapticNotification('warning');
  wlUI.showToast({ kind: 'text', tone: 'warn', text: wlText((c) => c.maxItems(MAX_ITEMS)) }, 3500);
}

/**
 * 방금 쓴 목록이 기기 저장소에 못 들어갔으면(사생활 모드·용량 초과 — 메모리에서만 동작 중) 알린다.
 * 알렸으면 true(그 자리의 보통 토스트 대신 이것을 보인다).
 */
export function warnIfNotSaved(): boolean {
  if (!getWatchlistStore().isMemoryOnly()) return false;
  wlUI.showToast({ kind: 'text', tone: 'warn', text: wlText((c) => c.saveFail) }, 4000);
  return true;
}

/**
 * 담기만(이미 있으면 아무 일도 안 한다) — 원탭 칩·길게 누르기 «추가»·검색 Enter
 * opts.sheet === false: 한도에 걸려도 한도 시트를 열지 않는다(한도 시트에서 PRO 가 된 직후의 자동 담기 — 재진입 차단)
 */
export async function addStar(
  raw: string,
  src: WatchlistSource,
  trigger?: HTMLElement | null,
  opts: { sheet?: boolean } = {},
): Promise<StarOutcome> {
  const t = normalizeTicker(raw);
  if (!t) return 'invalid';
  const store = getWatchlistStore();
  if (store.has(t)) return 'already';
  const limit = await currentLimit();
  const r = store.add(t, src, limit);
  const out = addOutcome(r);
  // 확인(PRO)을 기다리는 사이 다른 누름이 먼저 담았다 — 두 번째 누름은 토스트·진동 없이 끝낸다
  if (out === 'already' || out === 'invalid') return out;
  if (out === 'max') { showMaxToast(); return 'max'; }
  if (out === 'limit') {
    void hapticNotification('warning');
    if (opts.sheet === false) {
      wlUI.showToast({ kind: 'text', tone: 'warn', text: wlText((c) => c.limitTitle(FREE_LIMIT)) }, 3500);
      return 'limit';
    }
    trackWatchlist('wl_limit_sheet', { src, t, count: r.count });
    wlUI.openSheet({ kind: 'limit', ticker: t, src }, trigger);
    return 'limit';
  }
  void hapticNotification('success');
  trackWatchlist('wl_star_add', { src, t, count: r.count });
  if (!warnIfNotSaved()) {
    wlUI.showToast({ kind: 'added', ticker: t, count: r.count, limit: limit === Infinity ? 0 : limit, first: firstTimeTip() });
  }
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

/**
 * 되돌리기 — 빼기 직전 개수까지는 언제나 되돌린다(무료 한도보다 많이 가진 목록 포함).
 * 빼고 다른 걸 담아 그 개수를 넘으면 한도 시트, 기기 상한이면 토스트.
 */
export async function undoRemove(token: UndoToken): Promise<StarOutcome> {
  const limit = await currentLimit();
  const r = getWatchlistStore().restore(token, limit);
  const out = addOutcome(r);
  if (out === 'invalid') return 'invalid';
  if (out === 'max') { showMaxToast(); return 'max'; }
  if (out === 'limit') {
    void hapticNotification('warning');
    wlUI.openSheet({ kind: 'limit', ticker: token.t, src: 'restore' });
    return 'limit';
  }
  trackWatchlist('wl_star_undo', { t: token.t });
  if (out === 'added' && warnIfNotSaved()) return out;
  wlUI.dismissToast();
  return out;
}
