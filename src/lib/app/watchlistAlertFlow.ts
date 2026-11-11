// ============================================================================
// «내 종목» 잠긴 알림 벨 → 알림 안내 시트(alertUpsell) → 페이월 → (PRO 확인) → 그 종목의 알림 설정
// ----------------------------------------------------------------------------
// ★11/11 — 페이월이 PRO 를 확인하는 길은 셋이다: 구매 · 복원 · 쿠폰(코드 화면에서 돌아온 뒤 공용 상태가 바뀜).
//   셋 다 여기 «한 곳»으로 모인다. 취소·실패면 아무 것도 열지 않는다.
//   공용 PRO 상태(proEntitlement)는 RevenueCat 리스너가 늦거나 없을 수 있어 먼저 «PRO 다»라고 알린 뒤 설정을 연다
//   — 안 알리면 설정 시트의 토글이 서버 'not_pro' 에서 다시 안내 시트로 튕기고, 종목 한도도 무료로 판정된다.
// ============================================================================
import type { RowMeta, SheetRequest, VerifiedLevels, WatchlistUIState } from './watchlistUI';

type AlertContext = { ticker: string; levels?: VerifiedLevels | null; levelsOut?: boolean; levelsDelayAsOf?: string | null; meta?: RowMeta };

/** 벨을 눌렀을 때 — PRO 면 바로 그 종목 설정, 아니면 그 종목 맥락을 실은 알림 안내 */
export function alertSheetForBell(pro: boolean, context: AlertContext): SheetRequest {
  return pro ? { kind: 'alertSettings', ...context } : { kind: 'alertUpsell', src: 'bell', ...context };
}

/** 이 페이월이 «알림 안내 시트에서 열린 알림 페이월»인가 — 열릴 때의 시트 id(아니면 null) */
export function alertSheetIdFor(lead: 'watchlist' | 'alerts' | 'ads', state: WatchlistUIState): number | null {
  return lead === 'alerts' && state.sheet?.kind === 'alertUpsell' ? state.sheet.id : null;
}

/**
 * PRO 확인 → 페이월을 닫고, 공용 PRO 상태를 알리고, 시트를 그 종목 설정으로 넘긴다.
 * 이미 닫힌 페이월·바뀐 시트의 늦은 성공은 무시한다(한 번만). 처리했으면 true.
 */
export function finishAlertPaywall(
  state: WatchlistUIState,
  paywallId: number,
  sheetId: number | null,
  d: { close: () => void; notifyPro: () => void; becamePro: () => void },
): boolean {
  if (sheetId == null || state.paywall?.id !== paywallId || state.sheet?.id !== sheetId) return false;
  d.close();
  d.notifyPro();
  d.becamePro();
  return true;
}

/** 알림 안내 시트 자신의 «PRO 가 됐다» 처리를 미룰까 — 그 위에 알림 페이월이 떠 있는 동안은 페이월이 맡는다 */
export function upsellDefersToPaywall(state: WatchlistUIState): boolean {
  return !!state.paywall && state.paywall.lead === 'alerts' && state.sheet?.kind === 'alertUpsell';
}
