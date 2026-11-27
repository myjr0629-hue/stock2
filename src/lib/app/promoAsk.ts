// ============================================================================
// 혜택·할인 알림(광고성 푸시) 동의 «한 번 묻기» (2026-11-27) — 순수 모듈(판정기 PromoAskGate · 시트 · 시험이 같이 쓴다)
// ----------------------------------------------------------------------------
// 왜: 11/26 설정 › 알림 › «혜택·할인 알림» 토글을 만들었지만 동의자 0 → 블프 푸시 iOS 185·한국 안드 32대, 체험 종료 할인 푸시 20대에 0통.
//   동의는 애플 4.5.4(명시적 동의)·정보통신망법 50조(사전 동의·광고 표시·수신거부 방법)를 지켜 앱 화면에서 직접 받아야 한다.
// 자리(측정, 11/27 운영 토큰 286): «알림 권한을 이미 허용한 기기가 앱을 열 때» — 최근 7일 연 동의 필요 기기 68(iOS 61·한국 안드 7)
//   > 첫 실행 알림 허용 32/7일(새 설치만) > 블프 시트(기기당 1회, 이미 대부분 봄). 첫 실행에서 허용한 새 사용자도 같은 세션 뒤쪽에 이 자리를 만난다.
// 보이는 조건(전부 참 — 하나라도 모르면 안 보인다):
//   · 네이티브 앱 · 동의가 «필요한» 기기(lib/push/promoConsent promoDefaultOn = false: iOS 전체 · 한국 안드)
//   · 혜택 알림 값을 아직 정하지 않음(설정에서 켜거나 끈 기기는 묻지 않는다) · 앱 알림(전체)을 끄지 않음 · 푸시 토큰 있음
//   · OS 알림 권한 'granted' · 돈 내는 PRO 아님(RC 활성 'pro' 가 TRIAL 이 아니면 유료로 본다 · 조회 실패 = 안 보인다)
//   · 첫 실행 마침 · 다른 시트(aria-modal)·결제·게이트·광고·평점 요청이 없음 · 앱이 앞에 있음 · 앱 화면 경로(설정·문서 아님)
//   · 앞으로 온 뒤 12초 · 마지막 시트가 닫힌 뒤 8초 · 페이월이 열린 뒤 60초가 지남(시작 시트·하루 페이월이 먼저 자리 잡게)
// 빈도: 기기당 1번 + «괜찮아요»(또는 닫기)면 30일 뒤 딱 1번 더. «받기»면 끝. 보이기 «직전» 기록하고 다시 읽어 확인(저장 실패 = 안 보인다).
// 저장: 설정 토글과 같은 길 — localStorage signumhq.push.prefs 에 promo 를 더하고 PUT /api/push/preferences(서버가 promoAt 기록).
//   PUT 이 실패해도 다음 실행의 /api/push/register 가 같은 저장값(readStoredPushPrefs)을 싣는다 → 블프 크론·comeback 이 promoAllowed 로 자동 포함.
// 계측: promo_ask_show · promo_ask_yes · promo_ask_no × 출처 pa_{ko|en|ja}(첫 번째) · pa2_{ko|en|ja}(30일 뒤 다시) — 플랫폼은 비콘이 붙인다.
// ============================================================================

import { PRO_ENTITLEMENT_ID } from '@/config/iap';
import { promoDefaultOn, toPromoLoc, type PromoLoc } from '@/lib/push/promoConsent';

export const PROMO_ASK_KEY = 'signumhq.promoAsk.v1';
export const PROMO_ASK_REASK_MS = 30 * 86400_000;
export const PROMO_ASK_MAX = 2;
/** 앱이 앞으로 온 뒤 이만큼은 기다린다(첫 실행 체험 페이월·하루 페이월 7초+재조회·블프 시트가 먼저) */
export const PROMO_ASK_FG_MS = 12_000;
/** 다른 시트가 닫힌 뒤 이만큼 조용해야 한다(연달아 뜨지 않게) */
export const PROMO_ASK_QUIET_MS = 8_000;
/** 페이월이 열린 뒤 이만큼은 묻지 않는다 */
export const PROMO_ASK_PAYWALL_MS = 60_000;
export const PROMO_ASK_TICK_MS = 1_500;
export const PROMO_ASK_STREAK = 2;
export const PROMO_ASK_VERIFY_MS = 3_000;
export const PUSH_TOKEN_KEY = 'signumhq.push.token';

export type MiniStore = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export type AskRecord = { n: number; last: number; ans?: 'yes' | 'no' };

export function readAsk(store: MiniStore | null): AskRecord | null | 'blocked' {
  try {
    if (!store) return 'blocked';
    const raw = store.getItem(PROMO_ASK_KEY);
    if (raw == null) return null;
    const o = JSON.parse(raw) as Partial<AskRecord>;
    const n = Number(o?.n), last = Number(o?.last);
    if (!Number.isFinite(n) || n < 1 || !Number.isFinite(last) || last <= 0) return { n: PROMO_ASK_MAX, last: 0 }; // 깨진 값 = 다 쓴 것으로(다시 묻지 않는다)
    return { n: Math.floor(n), last, ...(o.ans === 'yes' || o.ans === 'no' ? { ans: o.ans } : {}) };
  } catch { return 'blocked'; }
}

/** 지금 물어도 되는 차례인가 — 첫 번째 · 또는 거절(또는 답 없이 닫힘) 뒤 30일 지난 두 번째 */
export function askDue(r: AskRecord | null | 'blocked', now: number): boolean {
  if (r === 'blocked') return false;
  if (r === null) return true;
  if (r.ans === 'yes' || r.n >= PROMO_ASK_MAX) return false;
  return now - r.last >= PROMO_ASK_REASK_MS;
}

/** 이번이 몇 번째인가(출처 pa_ / pa2_) */
export function askRound(r: AskRecord | null | 'blocked'): 1 | 2 {
  return r && r !== 'blocked' && r.n >= 1 ? 2 : 1;
}

/** 보이기 직전 기록 — 다시 읽어 같은 값이면 true(아니면 안 보인다) */
export function claimAsk(store: MiniStore | null, now = Date.now()): boolean {
  try {
    const cur = readAsk(store);
    if (cur === 'blocked' || !askDue(cur, now) || !store) return false;
    const next: AskRecord = { n: (cur ? cur.n : 0) + 1, last: now };
    const v = JSON.stringify(next);
    store.setItem(PROMO_ASK_KEY, v);
    return store.getItem(PROMO_ASK_KEY) === v;
  } catch { return false; }
}

/** 답 기록(받기 = 다시 묻지 않음 · 괜찮아요 = 30일 뒤 1번 더) */
export function recordAnswer(store: MiniStore | null, ans: 'yes' | 'no'): void {
  try {
    const cur = readAsk(store);
    if (!store || !cur || cur === 'blocked') return;
    store.setItem(PROMO_ASK_KEY, JSON.stringify({ ...cur, ans }));
  } catch { /* 저장소 막힘 */ }
}

/** 이 기기가 «동의를 물어야 하는» 기기인가 — 기본이 꺼짐(iOS·한국)이고 아직 값을 정하지 않았다 */
export function needsAsk(platform: unknown, loc: PromoLoc, tz: unknown, storedPromo: unknown): boolean {
  if (typeof storedPromo === 'boolean') return false;
  const pf = String(platform).toLowerCase();
  if (pf !== 'ios' && pf !== 'android') return false;
  return !promoDefaultOn(pf, loc, tz);
}

type EntLike = { isActive?: unknown; periodType?: unknown };
type InfoLike = { entitlements?: { active?: Record<string, EntLike | undefined> | null } | null } | null | undefined;
/** 돈 내는 PRO 인가 — 활성 'pro' 가 TRIAL 이 아니면 유료(NORMAL·INTRO·PREPAID). 정보 없음 = null(모름) */
export function paidPro(info: unknown): boolean | null {
  if (!info || typeof info !== 'object') return null;
  const ents = (info as InfoLike)?.entitlements;
  if (!ents || typeof ents !== 'object') return null;
  const pro = ents.active?.[PRO_ENTITLEMENT_ID];
  if (!pro || pro.isActive !== true) return false;
  return pro.periodType !== 'TRIAL';
}

/** 앱 화면 경로인가 — 문서·첫 실행·설정에서는 띄우지 않는다(trialPushOptIn routeOk 와 같은 규칙) */
export function promoRouteOk(path: string): boolean {
  if (!/\/app-view(\/|$)/.test(path)) return false;
  return !/\/app-view\/(terms|privacy|onboarding|settings)(\/|$)/.test(path);
}

export type PromoAskState = {
  native: boolean;
  due: boolean;
  needs: boolean;
  /** 앱 알림 전체를 껐다 */
  appOff: boolean;
  hasToken: boolean;
  /** OS 알림 권한 — prompt(미결정: 이번 실행 첫 실행에서 정할 수 있다) = 잠시 뒤 · denied = 끝 */
  perm: 'granted' | 'prompt' | 'denied' | 'unknown';
  /** null = 아직 모름(조회 전·실패) */
  paid: boolean | null;
  onboarded: boolean;
  dialogOpen: boolean;
  purchasePending: boolean;
  gateFlow: boolean;
  adBusy: boolean;
  reviewBusy: boolean;
  visible: boolean;
  routeOk: boolean;
  proQuiet: boolean;
  /** 앱이 앞으로 온 뒤 흐른 시간 */
  fgFor: number;
  /** 마지막으로 시트가 보인 뒤 흐른 시간(이번 실행에 본 적 없으면 Infinity) */
  quietFor: number;
  /** 페이월이 열린 뒤 흐른 시간(기록 없으면 Infinity) */
  paywallFor: number;
};

/**
 * 'stop' = 이번 실행은 끝(대상 아님·이미 정함·유료·권한 없음) · 'need_info' = 유료 여부를 읽어야 한다 ·
 * 'later' = 잠시 뒤 다시 · 'show' = 기록 후 보인다
 */
export function promoAskStep(s: PromoAskState): 'stop' | 'need_info' | 'later' | 'show' {
  if (!s.native || !s.due || !s.needs || s.appOff) return 'stop';
  if (s.perm === 'denied') return 'stop';
  // 권한 미결정·토큰 아직 없음 = 첫 실행 알림 단계에서 이번 실행에 정해질 수 있다 → 잠시 뒤 다시
  if (s.perm !== 'granted' || !s.hasToken) return 'later';
  if (s.paid === true) return 'stop';
  if (!s.onboarded || s.dialogOpen || s.purchasePending || s.gateFlow || s.adBusy || s.reviewBusy || !s.visible || !s.routeOk || s.proQuiet) return 'later';
  if (s.fgFor < PROMO_ASK_FG_MS || s.quietFor < PROMO_ASK_QUIET_MS || s.paywallFor < PROMO_ASK_PAYWALL_MS) return 'later';
  if (s.paid === null) return 'need_info';
  return 'show';
}

/** 기기 종류(Capacitor) — 모름 = web */
export function nativePlatformNow(): 'ios' | 'android' | 'web' {
  try {
    const pf = (globalThis as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
    return pf === 'ios' ? 'ios' : pf === 'android' ? 'android' : 'web';
  } catch { return 'web'; }
}
/** 기기 시간대(설정 화면 deviceTz 와 같다) */
export function deviceTz(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}
/** 앱 화면 언어(경로 /{ko|en|ja}/app-view — 설정 화면 toPromoLoc(locale) 과 같다) */
export function pathLoc(): PromoLoc {
  try { return toPromoLoc(window.location.pathname.split('/')[1] || 'en'); } catch { return 'en'; }
}

export type PromoAskSrc = 'pa_ko' | 'pa_en' | 'pa_ja' | 'pa2_ko' | 'pa2_en' | 'pa2_ja';
export const promoAskSrc = (round: 1 | 2, loc: PromoLoc): PromoAskSrc => `${round === 2 ? 'pa2' : 'pa'}_${loc}` as PromoAskSrc;

/** 저장할 알림 설정 — 설정 화면 loadPrefs 와 같은 기본값 위에 저장값을 얹고 promo 만 바꾼다 */
export function nextStoredPrefs(raw: string | null, on: boolean): { enabled: boolean; morning: boolean; closing: boolean; signals: boolean; promo: boolean } {
  let base: Record<string, unknown> = { enabled: true, morning: true, closing: true, signals: true };
  if (raw) {
    try {
      const o = JSON.parse(raw);
      if (o && typeof o === 'object' && !Array.isArray(o)) base = { signals: true, ...o };
    } catch { /* 깨진 값 — 기본값 */ }
  }
  const b = (k: string) => (typeof base[k] === 'boolean' ? (base[k] as boolean) : true);
  return { enabled: b('enabled'), morning: b('morning'), closing: b('closing'), signals: b('signals'), promo: on };
}

// ── 문구 — 광고성 정보임·무엇을 받는지·끄는 곳(설정 › 알림 › 혜택·할인 알림)·기본 미동의 · 두 단추 같은 무게 ──
//   «미국 주식 앱» 정체성 · 이모지 없음 · 투자 권유 없음 · 설정 토글 이름과 같은 말
export const PROMO_ASK_COPY = {
  ko: {
    eyebrow: '광고성 정보 수신 동의 (선택)',
    title: '할인 소식을 알림으로 받을까요?',
    body: '미국 주식 앱 SIGNUM HQ의 구독 할인·이벤트 같은 광고성 정보를 가끔 푸시 알림으로 보내 드려요.',
    bf: '지금 진행 중인 블랙프라이데이 할인이 끝나기 전 안내도 이 알림으로 보내 드려요.',
    off: '언제든 설정 › 알림 › 혜택·할인 알림에서 끌 수 있어요.',
    fine: '받지 않아도 앱의 모든 기능을 그대로 쓸 수 있어요. 밤 9시~아침 8시에는 보내지 않아요.',
    yes: '받기',
    no: '괜찮아요',
    close: '닫기',
  },
  en: {
    eyebrow: 'Promotional notifications (optional)',
    title: 'Get notified about discounts?',
    body: 'SIGNUM HQ, the US stock app, will occasionally send promotional push notifications about subscription discounts and offers.',
    bf: 'This includes a reminder before the current Black Friday offer ends.',
    off: 'Turn them off anytime in Settings › Notifications › Offers & Discounts.',
    fine: 'Every feature works the same whether or not you opt in.',
    yes: 'Notify me',
    no: 'No thanks',
    close: 'Close',
  },
  ja: {
    eyebrow: '広告・宣伝の通知(任意)',
    title: '割引のお知らせを受け取りますか?',
    body: '米国株アプリ SIGNUM HQ から、サブスクリプションの割引やキャンペーンなどの広告・宣伝のお知らせを、ときどきプッシュ通知でお送りします。',
    bf: '開催中のブラックフライデー割引が終わる前のお知らせも含みます。',
    off: '設定 › 通知 › お得な情報の通知 でいつでもオフにできます。',
    fine: '受け取らなくても、アプリの機能はすべてそのまま使えます。',
    yes: '受け取る',
    no: '今はしない',
    close: '閉じる',
  },
} as const;
export const promoAskCopy = (loc: string) => PROMO_ASK_COPY[toPromoLoc(loc)];
