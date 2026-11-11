import type { RowMeta, SheetRequest, VerifiedLevels, WatchlistUIState } from './watchlistUI';

type AlertContext = { ticker: string; levels?: VerifiedLevels | null; levelsOut?: boolean; levelsDelayAsOf?: string | null; meta?: RowMeta };

export function alertSheetForBell(pro: boolean, context: AlertContext): SheetRequest {
  return pro ? { kind: 'alertSettings', ...context } : { kind: 'alertUpsell', src: 'bell', ...context };
}

export function finishAlertPaywall(state: WatchlistUIState, paywallId: number, sheetId: number | null, close: () => void, becamePro: () => void) {
  if (sheetId == null || state.paywall?.id !== paywallId || state.sheet?.id !== sheetId) return;
  close();
  becamePro();
}

export function completeSuccessfulPro(result: { ok: boolean; isPro?: boolean }, success?: () => void) {
  if (result.ok && result.isPro) success?.();
}
