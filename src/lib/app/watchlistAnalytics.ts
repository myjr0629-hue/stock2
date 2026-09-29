// ============================================================================
// «내 종목» 측정 — 가벼운 이벤트 훅 (네트워크 전송 없음, 실패해도 무해)
// ----------------------------------------------------------------------------
// 실측(9/29): 앱 화면(app-view)에는 클라이언트 측정 수단이 «없다». 기존 mkt:attr:* 카운터는
//   서버 리다이렉트 라우트(/app·/app-uc·/app-wim)가 스스로 올리는 값이고, 앱 화면에서
//   부를 수 있는 공용 헬퍼·엔드포인트가 없다. 기획서 9절의 정본은 «EC2 레디스 카운터»인데
//   그 엔드포인트는 아직 없다 — 그리고 이 작업에서 Upstash 쓰기를 새로 만들지 않는다(지시).
//
// 그래서 여기서는 «이벤트를 한 곳으로 모으기만» 한다:
//   1) window 에 CustomEvent('sg:analytics', { detail }) 를 쏜다
//   2) setWatchlistAnalyticsTransport(fn) 로 전송기를 나중에 한 줄로 꽂을 수 있다
//      (예: EC2 카운터 엔드포인트가 생기면 navigator.sendBeacon 으로 보내는 함수)
// 전송기가 없으면 아무 일도 일어나지 않는다. 어떤 경우에도 던지지 않는다.
// ============================================================================

export type WatchlistEventName =
  | 'wl_star_add'        // { src, t, count }
  | 'wl_star_remove'     // { src, t, count }
  | 'wl_star_undo'       // { t }
  | 'wl_limit_sheet'     // { src, t, count }  — 한도 시트가 열렸다
  | 'wl_upsell_sheet'    // { src, t? }        — 알림(벨)·PRO 안내 시트가 열렸다
  | 'wl_cta'             // { sheet, cta }     — 시트 버튼(pro_start·code·later·manage·restore)
  | 'wl_purchase'        // { sheet, ok, cancelled? }
  | 'wl_alert_save'      // { tickers, events } — PRO 알림 설정 저장(플래그 켜졌을 때만)
  | 'wl_view'            // { count, isPro, src? } — 목록 화면을 열었다(src: 들어온 곳 — 'dash_header' 등, 모르면 없음)
  | 'wl_reorder'         // { count }
  | 'wl_sort';           // { key }

export type WatchlistEventProps = Record<string, string | number | boolean | null | undefined>;

type Transport = (event: WatchlistEventName, props: WatchlistEventProps, at: number) => void;
let transport: Transport | null = null;

/** 전송기를 꽂는다(없으면 null). 이 함수를 부르기 전까지 네트워크로 아무것도 나가지 않는다. */
export function setWatchlistAnalyticsTransport(fn: Transport | null) {
  transport = fn;
}

export function trackWatchlist(event: WatchlistEventName, props: WatchlistEventProps = {}) {
  const at = Date.now();
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sg:analytics', { detail: { event, props, at } }));
    }
  } catch { /* 오래된 웹뷰 */ }
  try { transport?.(event, props, at); } catch { /* 측정이 기능을 깨뜨리지 않는다 */ }
}

// ── 진입 출처 — 목록 화면의 wl_view 한 번에 «어디서 들어왔나»를 싣는다 ──
// 누른 곳(예: 대시보드 헤더 하트)이 이동 직전에 적고, 목록 화면이 wl_view 를 쏠 때 꺼낸다(한 번 쓰면 지운다).
// URL 에 싣지 않는다 — 뒤로가기로 목록에 돌아올 때 같은 출처가 다시 세지지 않게.
let entry: { src: string; at: number } | null = null;
const ENTRY_TTL_MS = 10_000;

export function noteWatchlistEntry(src: string) {
  entry = { src, at: Date.now() };
}

export function takeWatchlistEntry(): string | undefined {
  const e = entry;
  entry = null;
  return e && Date.now() - e.at < ENTRY_TTL_MS ? e.src : undefined;
}
