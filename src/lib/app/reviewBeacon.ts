// ============================================================================
// 스토어 평점 요청 계측(11/20) — «OS 시트를 실제로 요청했나 / 왜 못 했나 / 플러그인이 있나»를 하루 합계로만 센다
// ----------------------------------------------------------------------------
// 왜: 평점 한국 5·미국 2·일본 0 인데 앱 안의 요청 순간이 몇 번이나 실제로 OS 까지 갔는지 볼 수단이 없었다(11/20 실측 — 퍼널에 평점 단계 0).
//   rv_cap  — 기기마다 ET 하루 1회: InAppReview 플러그인이 바이너리에 있나(rv_yes / rv_no). 분모 = 같은 날 active
//   rv_ask  — OS 평점 API(requestReview)를 실제로 불렀다 · 출처 = 순간(rv_day·rv_run·rv_watch·rv_ai·rv_intel·rv_earn·rv_push·rv_pro)
//   rv_block — 순간이 왔지만 부르지 못했다 · 출처 = 순간
//   rv_why  — 못 부른 이유(rv_block 과 1:1) · 출처 = rv_modal(시트·페이월이 떠 있음) · rv_ad(광고 중·직후) · rv_gift(선물 안내 직후)
//             · rv_hidden(앱이 뒤로 감) · rv_today(오늘 다른 순간이 이미 물음) · rv_gone(화면 이동·취소) · rv_noplug(플러그인 없음)
// OS 가 시트를 «보였는지»는 알 수 없다(애플·구글 모두 결과를 주지 않는다 — 가이드라인 5.6.1 상 읽지도 않는다). rv_ask 는 «요청» 횟수다.
// 개인정보: 퍼널과 같다(funnelSchema 머리말) — 닫힌 목록 값·플랫폼·앱 버전만, 식별자 없음. SIGNUM 앱(app-view)에서만 보낸다.
// 읽기: scripts/mkt-funnel.js «스토어 평점 요청» 칸.
// ============================================================================

import { etDay, type FunnelSrc } from '@/lib/app/funnelSchema';
import { AI_LINE_REVIEW, APP_SESSION_REVIEW, WATCH_ADD_REVIEW } from '@/lib/app/reviewMoments';

export type ReviewBeaconStage = 'rv_cap' | 'rv_ask' | 'rv_block' | 'rv_why';
/** 못 부른 이유(useReviewPrompt.scheduleReviewRequest 가 넘긴다). 'cancel' 은 화면 이동으로 보고 rv_gone 으로 센다 */
export type ReviewSkipReason = 'modal' | 'ad' | 'gift' | 'hidden' | 'err' | 'gone' | 'cancel' | 'today' | 'noplug';

const WHY_SRC: Record<ReviewSkipReason, FunnelSrc> = {
  modal: 'rv_modal', ad: 'rv_ad', gift: 'rv_gift', hidden: 'rv_hidden', err: 'rv_gone', gone: 'rv_gone', cancel: 'rv_gone', today: 'rv_today', noplug: 'rv_noplug',
};
export const reviewWhySrc = (r: ReviewSkipReason): FunnelSrc => WHY_SRC[r] || 'rv_gone';

/** capacitorBridge 의 기존 마일스톤 저장 키 — 사용일 2·7 = rv_day · 실행 4번째(0) = rv_run · 101 실적 반응 · 102 알림 탭 · 103 PRO 성공 */
const BRIDGE_KEY = 'signumhq.review.prompted';
const HOOK_SRC: Record<string, FunnelSrc> = {
  [APP_SESSION_REVIEW.storageKey]: 'rv_run',
  [WATCH_ADD_REVIEW.storageKey]: 'rv_watch',
  [AI_LINE_REVIEW.storageKey]: 'rv_ai',
  'signum.reportOpens': 'rv_intel',
  'signum.earningsOpens': 'rv_earn',
};

/** 저장 키·마일스톤 → 순간 출처. SIGNUM 순간이 아니면(UC·WIM 등) null — 보내지 않는다 */
export function reviewSrcFor(key: string, milestone: number): FunnelSrc | null {
  if (key === BRIDGE_KEY) {
    if (milestone === 0) return 'rv_run';
    if (milestone === 101) return 'rv_earn';
    if (milestone === 102) return 'rv_push';
    if (milestone === 103) return 'rv_pro';
    return 'rv_day';
  }
  return HOOK_SRC[key] ?? null;
}

type Sender = (stage: ReviewBeaconStage, src: FunnelSrc) => void;
const defaultSender: Sender = (stage, src) => {
  void import('@/lib/app/funnelBeacon').then((m) => m.trackFunnel(stage, { src })).catch(() => {});
};
let sender: Sender = defaultSender;
/** 시험용 — 전송기를 바꿔 끼운다(인자 없으면 원래대로) */
export function setReviewBeaconSender(fn?: Sender): void { sender = fn ?? defaultSender; }

/** 하나 보낸다 — 화면·평점 흐름을 절대 막지 않는다(비동기·예외 삼킴) */
export function reviewBeacon(stage: ReviewBeaconStage, src: FunnelSrc): void {
  try {
    if (typeof window === 'undefined') return;
    sender(stage, src);
  } catch { /* 측정이 기능을 깨뜨리지 않는다 */ }
}

export const REVIEW_CAP_DAY_KEY = 'signum.rv.capDay';

type CapWin = {
  Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { InAppReview?: { requestReview?: unknown } } };
  localStorage?: Pick<Storage, 'getItem' | 'setItem'>;
};

/**
 * 네이티브에서 ET 하루 1회 «플러그인이 있나»를 보낸다. 보냈으면 'rv_yes' | 'rv_no', 아니면 null.
 * 저장소가 막히면 중복을 거를 수 없으니 보내지 않는다(active 와 같은 규칙).
 */
export function reportReviewCapability(win: CapWin | null | undefined, day = etDay(), send: typeof reviewBeacon = reviewBeacon): 'rv_yes' | 'rv_no' | null {
  try {
    if (!win?.Capacitor?.isNativePlatform?.()) return null;
    const store = win.localStorage;
    if (!store || store.getItem(REVIEW_CAP_DAY_KEY) === day) return null;
    store.setItem(REVIEW_CAP_DAY_KEY, day);
    const src = typeof win.Capacitor?.Plugins?.InAppReview?.requestReview === 'function' ? 'rv_yes' : 'rv_no';
    send('rv_cap', src);
    return src;
  } catch { return null; }
}
