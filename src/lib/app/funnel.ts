// ============================================================================
// 구독 퍼널 측정 — 클라이언트 (전송: /api/funnel-hit 비콘, 실패해도 무해)
// ----------------------------------------------------------------------------
// 부르는 곳:
//   · ProPaywall        — 열림(open)·구매 버튼(cta) + 결과는 아래 useProStatus 가
//   · useProStatus      — purchase()/restore() 결과(buy_*·restore_*)를 «한 곳에서» 센다(모든 호출부 공통, 오류 코드 포함)
//   · «내 종목» 시트     — trackWatchlist 전송기 자리에 watchlistToFunnel 을 꽂아 시트 열림·PRO 시작을 옮긴다
//                          (wl_purchase 는 옮기지 않는다 — 결과는 useProStatus 가 이미 센다, 이중 계산 방지)
// 출처(src): 페이월을 연 화면이 명시한다. 명시가 없으면 가장 최근에 연 화면(noteFunnelSrc)을 쓴다.
// 개인정보: funnelSchema.ts 머리말 참조 — 닫힌 목록의 값과 앱 버전만, 식별자 없음.
// ============================================================================

import { setWatchlistAnalyticsTransport, type WatchlistEventName, type WatchlistEventProps } from '@/lib/app/watchlistAnalytics';
import { outcomeStage, type FunnelSrc, type OutcomeLike } from '@/lib/app/funnelSchema';

export { FUNNEL_SEND_ANDROID, noteFunnelSrc, currentFunnelSrc, trackFunnel } from '@/lib/app/funnelBeacon';
import { noteFunnelSrc, trackFunnel } from '@/lib/app/funnelBeacon';

/** 구매·복원 결과 → 단계(오류면 코드까지). useProStatus 가 부른다. */
export function trackFunnelOutcome(kind: 'buy' | 'restore', outcome: OutcomeLike, src?: FunnelSrc) {
  const { stage, code } = outcomeStage(kind, outcome);
  trackFunnel(stage, { src, code });
}

// ── «내 종목» 시트 → 퍼널 ─────────────────────────────────────────────────────
const sheetSrc = (sheet: unknown): FunnelSrc => (sheet === 'limit' ? 'wl_limit' : 'wl_upsell');

export function watchlistToFunnel(event: WatchlistEventName, props: WatchlistEventProps) {
  if (event === 'wl_limit_sheet') { noteFunnelSrc('wl_limit'); trackFunnel('open', { src: 'wl_limit' }); return; }
  if (event === 'wl_upsell_sheet') { noteFunnelSrc('wl_upsell'); trackFunnel('open', { src: 'wl_upsell' }); return; }
  if (event === 'wl_cta') {
    const s = sheetSrc(props.sheet);
    if (props.cta === 'pro_start') { noteFunnelSrc(s); trackFunnel('cta', { src: s }); }
    else if (props.cta === 'restore') noteFunnelSrc(s);
  }
}

// trackWatchlist 의 전송기 자리는 지금까지 비어 있었다(watchlistAnalytics.ts «나중에 한 줄로 꽂을 수 있다»).
if (typeof window !== 'undefined') {
  try { setWatchlistAnalyticsTransport(watchlistToFunnel); } catch { /* 무해 */ }
}
