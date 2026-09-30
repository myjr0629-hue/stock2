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
import { outcomeStage, normalizeCode, normalizeVersion, isFunnelSrc, type FunnelSrc, type FunnelStage, type FunnelPlatform, type OutcomeLike } from '@/lib/app/funnelSchema';

/**
 * 안드로이드 «앱»에서는 보내지 않는다 (2026-09-30).
 *   Play 데이터 보안(공개 페이지 실측)에 «앱 활동 › 앱 상호작용»이 선언돼 있지 않다. 구글 정의상 익명·집계여도
 *   «수집»은 신고 대상이고 웹뷰 전송도 포함된다. 대표가 Play Console › 앱 콘텐츠 › 데이터 보안에
 *   «앱 상호작용 — 수집 — 분석 — 공유 안 함»을 더한 뒤에만 true 로 바꾼다. (안드로이드 «웹 브라우저»는 web 이라 해당 없음)
 */
export const FUNNEL_SEND_ANDROID = false;

let lastSrc: FunnelSrc = 'other';
/** 페이월·판매 시트를 연 화면을 적어 둔다 — 결과(구매·복원)가 출처 없이 들어올 때 이것을 쓴다. */
export function noteFunnelSrc(src: FunnelSrc) { lastSrc = src; }
export function currentFunnelSrc(): FunnelSrc { return lastSrc; }

function platformNow(): FunnelPlatform {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const p = cap.getPlatform?.();
      return p === 'ios' ? 'ios' : p === 'android' ? 'android' : 'web';
    }
  } catch { /* 웹 */ }
  return 'web';
}

let versionP: Promise<string> | null = null;
/** 바이너리 버전(@capacitor/app). 네이티브가 아니거나 1.5초 안에 못 재면 'na' — 지어내지 않는다. */
function appVersion(): Promise<string> {
  if (versionP) return versionP;
  versionP = (async () => {
    if (platformNow() === 'web') return 'na';
    try {
      const { App } = await import('@capacitor/app');
      const info = await Promise.race([
        App.getInfo(),
        new Promise<null>((r) => setTimeout(() => r(null), 1500)),
      ]);
      return normalizeVersion(info && (info as { version?: string }).version);
    } catch { return 'na'; }
  })();
  return versionP;
}

/** 퍼널 이벤트 하나. 화면·결제 흐름을 절대 막지 않는다(비동기·예외 삼킴). */
export function trackFunnel(stage: FunnelStage, opts: { src?: FunnelSrc; code?: string } = {}) {
  if (typeof window === 'undefined') return;
  try {
    const plat = platformNow();
    if (plat === 'android' && !FUNNEL_SEND_ANDROID) return;
    const src = isFunnelSrc(opts.src) ? opts.src : lastSrc; // 핸들러로 잘못 넘어온 클릭 이벤트 등은 버린다
    const code = opts.code ? normalizeCode(opts.code) : '';
    void appVersion().then((v) => {
      const q = `/api/funnel-hit?st=${stage}&s=${src}&p=${plat}&v=${encodeURIComponent(v)}${code ? `&c=${code}` : ''}`;
      try { if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(q)) return; } catch { /* 폴백 */ }
      void fetch(q, { method: 'POST', keepalive: true }).catch(() => {});
    }).catch(() => {});
  } catch { /* 측정이 기능을 깨뜨리지 않는다 */ }
}

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
