'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import dynamic from 'next/dynamic';
import { afterSheetHistory, useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { trackFunnel } from '@/lib/app/funnel';
import { openSubscriptionManagement } from '@/lib/app/subscriptionManagement';
import { TRIAL_KEEP_BF_KEY, TRIAL_OFF_EARLY_KEY, TRIAL_OFF_STORAGE_KEY, trialRenewalOffNotice, verifiedTrialRenewalOffNotice, type TrialOffKind, type TrialOffNotice } from '@/lib/app/trialRenewalOff';
import { dailyPaywallShownOn } from '@/lib/app/dailyPaywall';
import { WARM_COPY, markWarmShown, toWarmLang, warmBfWhy, warmPlans, type WarmTarget } from '@/lib/app/warmBf';
import { warmShownOn } from '@/lib/app/warmBf';
import { BF_COPY, BF_VALID_UNTIL, bfLive, bfPriceView, type BfPlan } from '@/lib/app/blackFriday';
import { localDay, markGateDay } from '@/lib/app/gatePaywall';
import { previewFlag } from '@/lib/app/proEntitlement';
import type { WarmView } from './WarmBfGate';
import b from './BlackFridaySheet.module.css';
import { TRIAL_EXPIRED_STORAGE_KEY, TRIAL_USAGE_MIN_DAYS, trialExpiredContext, trialExpiredNotice, trialExpiredScorecard, trialUsageDays, verifiedTrialExpiredNotice, type TrialExpiredNotice, type TrialExpiredScore } from '@/lib/app/trialExpired';
import { scheduleTrialOffExpiry, waitForOtherModal } from '@/lib/app/trialOffLifecycle';
import { beginTrialRenewalOffEntry, loadFreshTrialRenewalOff, refreshTrialRenewalOffOnResume, verifyTrialRenewalOff } from '@/services/trialRenewalOff';
import { canPresentCancelReason, canShowCancelReason } from '@/lib/app/cancelReason';
import { CancelReasonSheet } from './CancelReasonSheet';
import { TRIAL_SAVE_PUSH_FLAG, trialEndDateText, trialOffLede, trialSaveCopy, trialScorecard, trialWatchlistLine, type TrialScorecard } from '@/lib/app/trialSave';
import { WATCHLIST_STORAGE_KEY, parseWatchlist } from '@/lib/app/watchlist';
import { calendarScorecardWeek } from '@/lib/earnings/calendarScorecardDisplay';
import { etDateOf } from '@/lib/marketCalendar';
import type { PaywallPlan } from './ProPaywall';
import { expiredOfferEligible, type ExpiredOfferView } from '@/lib/app/expiredOffer';
import { loadExpiredOffer, type ExpiredOffer } from '@/services/revenueCat';
import p from './ProPaywall.module.css';
import s from './GiftAnnounceSheet.module.css';

// ★2026-11-11 «PRO 요금제 보기» → 기존 ProPaywall(체험 중에도 열린 채 · 연간 기본 선택은 페이월 규칙 그대로). 누를 때만 받는다.
const TrialSavePaywall = dynamic(() => import('./TrialSavePaywall'), { ssr: false });
// ★11/24 블프 기간·iOS App Store 체험의 «PRO 요금제 보기» → 웜 블프 카드(정가 페이월 대신 · 대상 아님/스위치 꺼짐이면 예전 정가 페이월)
const WarmBfOffer = dynamic(() => import('./WarmBfGate').then((m) => m.WarmBfOffer), { ssr: false, loading: () => null });
/** 개발 미리보기(?trialOffPreview=1) 전용 더미 요금 — 실제 앱은 스토어 문자열만 쓴다(paywall-preview 와 같은 값) */
const PREVIEW_PLANS: Record<string, PaywallPlan[]> = {
  ko: [{ plan: 'monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW' }, { plan: 'annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW', pricePerMonthString: '₩7,417' }],
  ja: [{ plan: 'monthly', priceString: '¥1,280', price: 1280, currencyCode: 'JPY' }, { plan: 'annual', priceString: '¥12,000', price: 12000, currencyCode: 'JPY', pricePerMonthString: '¥1,000' }],
  en: [{ plan: 'monthly', priceString: '$9.99', price: 9.99, currencyCode: 'USD' }, { plan: 'annual', priceString: '$74.99', price: 74.99, currencyCode: 'USD', pricePerMonthString: '$6.25' }],
};
/** 개발 미리보기(?trialOffPreview=expired&expiredOffer=1) 전용 할인 카드 값 — 실제 앱은 스토어 오퍼 값만 쓴다(결제 불가) */
const PREVIEW_OFFER: Record<string, ExpiredOfferView> = {
  ko: { priceString: '₩5,900', regularPriceString: '₩11,900', pct: 50 },
  ja: { priceString: '¥640', regularPriceString: '¥1,280', pct: 50 },
  en: { priceString: '$4.99', regularPriceString: '$9.99', pct: 50 },
};
/** 할인 오퍼(오퍼링·애플 서명) 확인을 기다리는 최대 시간 — 넘으면 카드 없이 기존 페이월 그대로 */
const OFFER_WAIT_MS = 2500;
/** ★11/27 시트 안 블프 줄(스위치·스토어 정가) 준비를 기다리는 최대 시간 — 넘으면 블프 줄 없이 예전 시트(블프 이어가기 1회는 안 보인다) */
const BF_SHEET_WAIT_MS = 2500;
const sleep = (ms: number) => new Promise<null>((r) => setTimeout(() => r(null), ms));

/** 체험 종료 푸시를 눌러 들어왔으면 «오늘 이미 봤음»을 한 번 건너뛴다(layout 이 세션 표식을 남긴다) */
function pushTapped() {
  try { return sessionStorage.getItem(TRIAL_SAVE_PUSH_FLAG) === '1'; } catch { return false; }
}

let sessionSeen: string | null = null;
let sessionEarly: string | null = null;
function readSeen() {
  try { return localStorage.getItem(TRIAL_OFF_STORAGE_KEY) || sessionSeen; } catch { return sessionSeen; }
}
/** ★11/11 «갱신 끈 직후 1회» 기기 저장 표식(체험 기간|현지 날짜) — D-3 표식과 따로 둔다 */
function readEarly() {
  try { return localStorage.getItem(TRIAL_OFF_EARLY_KEY) || sessionEarly; } catch { return sessionEarly; }
}
/** ★11/27 «블프 이어가기» 표식(체험 기간|현지 날짜) — 블프 줄이 그려진 시트(종류 무관)와 블프 이어가기 1회가 남긴다 */
let sessionBf: string | null = null;
function readBf() {
  try { return localStorage.getItem(TRIAL_KEEP_BF_KEY) || sessionBf; } catch { return sessionBf; }
}
function saveBf(mark: string) {
  sessionBf = mark;
  try { localStorage.setItem(TRIAL_KEEP_BF_KEY, mark); } catch { /* session fallback */ }
}
function saveSeen(mark: string, kind: TrialOffKind) {
  if (kind === 'bf') {
    saveBf(mark);
  } else if (kind === 'early') {
    sessionEarly = mark;
    try { localStorage.setItem(TRIAL_OFF_EARLY_KEY, mark); } catch { /* session fallback */ }
  } else {
    sessionSeen = mark;
    try { localStorage.setItem(TRIAL_OFF_STORAGE_KEY, mark); } catch { /* session fallback */ }
  }
  try { sessionStorage.removeItem(TRIAL_SAVE_PUSH_FLAG); } catch { /* noop */ }
}
/** ★11/11 체험 만료 뒤 1회 표식(체험 기간|현지 날짜) — 체험 중 시트 표식과 따로 */
let sessionExpired: string | null = null;
function readExpired() {
  try { return localStorage.getItem(TRIAL_EXPIRED_STORAGE_KEY) || sessionExpired; } catch { return sessionExpired; }
}
function saveExpired(mark: string) {
  sessionExpired = mark;
  try { localStorage.setItem(TRIAL_EXPIRED_STORAGE_KEY, mark); } catch { /* session fallback */ }
}
const dailyShownTodaySafe = () => { try { return dailyPaywallShownOn(window.localStorage); } catch { return false; } };
/** ★11/24 오늘 웜 블프 카드를 봤나 — 봤으면 체험 중 안내(조기·D-3)는 내일(같은 날 두 번 금지) */
const warmShownTodaySafe = () => { try { return warmShownOn(window.localStorage); } catch { return false; } };
/** 사용일 기록(capacitorBridge maybePromptReview 가 대시보드마다 남기는 기기 현지 날짜 목록) — 읽기만 */
const USAGE_DAYS_KEY = 'signumhq.review.days';
function readUsageRaw(): string | null {
  try { return localStorage.getItem(USAGE_DAYS_KEY); } catch { return null; }
}
/** 계측 출처 — 조기 안내는 따로 센다(시트 단계·그 시트가 연 페이월 모두) */
const srcOf = (kind: TrialOffKind) => kind === 'early' ? 'trial_off_early' as const : kind === 'bf' ? 'trial_off_bf' as const : 'trial_off' as const;
/** 체험 중 사용일 묶음(활성화 판독 · 하루 합계만) */
const usageSrc = (days: number) => days >= 5 ? 'tk_u5' as const : days >= 2 ? 'tk_u2' as const : 'tk_u0' as const;
/** ★11/27 프리뷰 호스트(로컬·*.vercel.app — 운영 도메인·앱에선 안 켜짐) 확인 모드: ?sgtk=1 시트 · ?sgtkbf=1 블프 줄 · ?sgtkk=window|bf 종류 · ?sgtkp=annual 연간 체험 */
function hostPreview(): { kind: TrialOffKind; bf: boolean; product: 'monthly' | 'annual' } | null {
  try {
    if (!previewFlag('sgtk')) return null;
    const q = new URLSearchParams(location.search);
    const k = q.get('sgtkk');
    return { kind: k === 'window' || k === 'bf' ? k : 'early', bf: previewFlag('sgtkbf'), product: q.get('sgtkp') === 'annual' ? 'annual' : 'monthly' };
  } catch { return null; }
}
function previewWarmView(locale: string, product: 'monthly' | 'annual'): WarmView {
  const plans = PREVIEW_PLANS[locale] ?? PREVIEW_PLANS.en;
  const m = plans.find((x) => x.plan === 'monthly'), a = plans.find((x) => x.plan === 'annual');
  return {
    locale, target: { expiresAt: Date.now() + 24.6 * 86400000, product }, plans: warmPlans(product, false),
    prices: { annual: bfPriceView('annual', a, locale), monthly: bfPriceView('monthly', m, locale) }, perMonth: null, watchCount: 0, preview: true,
  };
}

/** bf = 시트 안 블프 줄(블프 기간·iOS App Store 체험·스위치 켜짐·스토어 정가 확인 — 없으면 예전 시트) · known = 검증 읽기로 확인된 웜 대상(요금제 탭 카드가 다시 읽지 않게) */
type View = TrialOffNotice & { preview: boolean; bf: WarmView | null; known: WarmTarget | null };
export function TrialRenewalOffNotice({ locale }: { locale: string }) {
  const [view, setView] = useState<View | null>(null);
  const [reason, setReason] = useState(false);
  const [paywall, setPaywall] = useState<{ preview: boolean; kind: TrialOffKind } | null>(null);
  const [warm, setWarm] = useState<{ preview: boolean; kind: TrialOffKind; known: WarmTarget | null } | null>(null);
  const localeRef = useRef(locale);
  localeRef.current = locale;
  // ★11/11 체험 만료 뒤 1회 페이월 — 앱이 잠깐 뒤로 가도(안드 결제 창 = onPause) 닫지 않는다(suspend 대상 아님)
  const [expired, setExpired] = useState<(TrialExpiredNotice & { preview: boolean; offerEligible: boolean }) | null>(null);
  const expiredOpen = useRef(false);
  const current = useRef<View | null>(null);
  useEffect(() => {
    let disposed = false, generation = 0;
    let suspended = document.visibilityState !== 'visible';
    let stopWaiting: (() => void) | undefined;
    const hp = hostPreview();
    const previewParam = process.env.NODE_ENV === 'development' ? new URLSearchParams(location.search).get('trialOffPreview') : hp ? (hp.kind === 'window' ? '1' : 'early') : null;
    const preview = previewParam === '1' || previewParam === 'early' || previewParam === 'expired';
    const enter = async () => {
      if (process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('cancelReasonPreview') === '1') return;
      const run = ++generation;
      stopWaiting?.(); stopWaiting = undefined;
      if (document.visibilityState !== 'visible' || current.current || expiredOpen.current) return;
      if (document.querySelector('[aria-modal="true"]')) {
        stopWaiting = waitForOtherModal(document, () => { stopWaiting = undefined; void enter(); });
        return;
      }
      try {
        const snapshot = preview ? null : await loadFreshTrialRenewalOff();
        // ★11/11 D-2 푸시용 체험 상태 보고(같은 SDK 읽기 결과 · 하루 한 번 · 토큰 있을 때만 — lib/app/trialPushReport)
        if (snapshot) void import('@/lib/app/trialPushReport').then((m) => m.reportTrialPush(snapshot)).catch(() => {});
        if (disposed || run !== generation || document.visibilityState !== 'visible') return;
        const seen = pushTapped() ? null : readSeen();
        // ★11/27 블프 기간·iOS 면 «블프 이어가기» 1회 표식도 넘긴다(조기 안내를 이미 본 1개월 코드·7일 체험자에게 체험 기간당 한 번 더)
        const early: { early: string | null; bf?: string | null } = { early: readEarly() };
        if (!preview && snapshot?.platform === 'ios' && bfLive(Date.now())) early.bf = readBf();
        let notice: TrialOffNotice | null = previewParam === 'expired' ? null : preview
          ? { store: 'APP_STORE' as const, startedAt: Date.now() - (previewParam === 'early' ? 2.6 : 27.6) * 86400000, expiresAt: Date.now() + (previewParam === 'early' ? 27.4 : 2.4) * 86400000, period: 'preview', mark: 'preview', kind: hp ? hp.kind : previewParam === 'early' ? 'early' : 'window' }
          : snapshot && trialRenewalOffNotice(snapshot.customerInfo, snapshot.platform, Date.now(), seen, undefined, early);
        // ★11/11 체험 중 시트가 없을 때만 «만료 뒤 1회»를 본다(체험 중 시트는 활성 체험에서만 — 둘은 겹치지 않는다). 오늘 체험 시트를 봤으면 내일
        const marks = { offSeen: readSeen(), early: early.early };
        let lapsed: TrialExpiredNotice | null = notice ? null : previewParam === 'expired'
          ? { store: 'APP_STORE' as const, startedAt: Date.now() - 31 * 86400000, expiresAt: Date.now() - 86400000, period: 'preview', mark: 'preview' }
          : snapshot && trialExpiredNotice(snapshot.customerInfo, snapshot.platform, Date.now(), readExpired(), undefined, marks);
        // ★11/23 오늘 «하루 첫 실행 페이월»(daily_open)을 이미 봤으면 만료 1회 페이월은 내일(같은 날 페이월 두 번 금지 · 관문 11231807)
        if (lapsed && !preview && dailyShownTodaySafe()) lapsed = null;
        // ★11/24 오늘 웜 블프 카드를 봤으면 체험 중 안내·만료 1회 페이월 모두 내일(관문 11240021·11240032 ①)
        if (!preview && warmShownTodaySafe()) { notice = null; lapsed = null; }
        if (!notice && !lapsed) return;
        // ★11/12 첫 달 할인 대상(과거 결제 0) — 첫 읽기·새 읽기 둘 다 참일 때만. 미리보기는 ?expiredOffer=1
        let offerEligible = preview ? new URLSearchParams(location.search).get('expiredOffer') === '1' : false;
        // A sheet may have opened while the SDK read was in flight.
        if (document.querySelector('[aria-modal="true"]')) {
          stopWaiting = waitForOtherModal(document, () => { stopWaiting = undefined; void enter(); });
          return;
        }
        let bf: WarmView | null = preview && hp?.bf ? previewWarmView(localeRef.current, hp.product) : null;
        let known: WarmTarget | null = null;
        if (!preview && snapshot) {
          const attempt = verifyTrialRenewalOff();
          if (!attempt) return;
          const fresh = await attempt.result.catch(() => null);
          if (disposed || run !== generation || document.visibilityState !== 'visible' || document.querySelector('[aria-modal="true"]')) {
            attempt.release();
            if (!disposed && run === generation && document.visibilityState === 'visible' && document.querySelector('[aria-modal="true"]')) {
              stopWaiting = waitForOtherModal(document, () => { stopWaiting = undefined; void enter(); });
            }
            return;
          }
          if (notice) {
            notice = fresh && fresh.platform === snapshot.platform
              ? verifiedTrialRenewalOffNotice(snapshot.customerInfo, fresh.customerInfo, fresh.platform, Date.now(), seen, undefined, early) : null;
            // ★11/27 블프 기간·iOS App Store 체험이면 방금 캐시를 비운 이 새 읽기로 웜 대상(1개월 코드·7일 체험 · 갱신 꺼짐 · 40일 안 · 월간/연간)을 확인하고
            //   스위치·스토어 정가를 받아 시트 안에 블프 줄을 넣는다(받지 못하면 예전 시트). 요금제 탭 카드도 이 대상을 받아 고객 정보를 다시 읽지 않는다.
            if (notice && fresh && fresh.platform === 'ios' && notice.store === 'APP_STORE' && bfLive(Date.now())) {
              const t = warmBfWhy(fresh.customerInfo as unknown as Parameters<typeof warmBfWhy>[0], 'ios', Date.now());
              if (typeof t === 'object') {
                known = t;
                bf = await Promise.race([import('./WarmBfGate').then((m) => m.loadWarm(localeRef.current, t)).catch(() => null), sleep(BF_SHEET_WAIT_MS)]);
                if (disposed || run !== generation || document.visibilityState !== 'visible') return;
                if (document.querySelector('[aria-modal="true"]')) {
                  stopWaiting = waitForOtherModal(document, () => { stopWaiting = undefined; void enter(); });
                  return;
                }
              }
            }
            // 블프 이어가기 1회는 블프 줄이 준비됐을 때만(아니면 오늘은 없음 — 다음 진입에 다시 본다)
            if (notice?.kind === 'bf' && !bf) notice = null;
          } else {
            // 만료 판정도 캐시를 비운 새 읽기로 한 번 더 — 방금 다른 경로로 구매·복원했으면 활성 'pro' 가 보여 안 뜬다
            lapsed = fresh && fresh.platform === snapshot.platform
              ? verifiedTrialExpiredNotice(snapshot.customerInfo, fresh.customerInfo, fresh.platform, Date.now(), readExpired(), undefined, marks) : null;
            offerEligible = !!lapsed && !!fresh && expiredOfferEligible(snapshot.customerInfo) && expiredOfferEligible(fresh.customerInfo);
          }
          if (!notice && !lapsed) return;
        }
        // 새 읽기를 기다리는 사이 웜 카드가 떴다 닫혔으면(오늘 표식) 오늘은 쉰다(관문 11240032 ②)
        if (!preview && warmShownTodaySafe()) return;
        if (!notice && lapsed) {
          expiredOpen.current = true;
          setExpired({ ...lapsed, preview, offerEligible });
          return;
        }
        if (!notice) return;
        if (notice.kind === 'bf' && !bf) return;
        const next = { ...notice, preview, bf, known };
        current.current = next;
        setView(next);
      } catch { /* failed fresh reads are ineligible */ }
    };
    const suspend = () => { suspended = true; ++generation; stopWaiting?.(); stopWaiting = undefined; current.current = null; setView(null); };
    const resume = () => {
      if (document.visibilityState !== 'visible' || !suspended) return;
      suspended = false;
      refreshTrialRenewalOffOnResume();
      void enter();
    };
    const visibility = () => { if (document.visibilityState === 'visible') resume(); else suspend(); };
    beginTrialRenewalOffEntry();
    void enter();
    document.addEventListener('visibilitychange', visibility);
    document.addEventListener('app:resume', resume);
    let removeNative: (() => void) | undefined;
    void import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) resume(); else suspend();
    })).then((listener) => { if (disposed) void listener.remove(); else removeNative = () => { void listener.remove(); }; }).catch(() => {});
    return () => { disposed = true; ++generation; stopWaiting?.(); removeNative?.(); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('app:resume', resume); };
  }, []);
  const close = useCallback((stage: 'trial_off_close' | 'trial_off_manage' | 'trial_off_expired' | 'trial_off_plans') => {
    const active = current.current;
    if (!active) return;
    current.current = null;
    setView(null);
    if (!active.preview) trackFunnel(stage, { src: srcOf(active.kind) });
    if (stage === 'trial_off_manage' && !active.preview && active.expiresAt > Date.now()) void openSubscriptionManagement(active.store).catch(() => {});
    // 시트의 히스토리 칸을 걷은 «뒤»에 페이월을 연다(늦게 온 popstate 가 새 페이월을 닫지 않게)
    // ★11/24 블프 기간·iOS App Store 체험이면 웜 블프 카드 먼저(정가 페이월은 11/10~23 열림 12·버튼 1·결제 0 — RESULT 2026-11-24/warm-bf) · 아니면 예전 그대로
    // ★11/27 시트에 블프 줄이 이미 있었으면 «다른 요금제 보기» = 정가 페이월 바로(웜 카드 또 안 띄움) · 없었으면 웜 카드에 검증된 대상(known)을 넘긴다
    if (stage === 'trial_off_plans' && active.expiresAt > Date.now()) void afterSheetHistory().then(() => {
      if (!active.bf && active.store === 'APP_STORE' && bfLive(Date.now())) setWarm({ preview: active.preview, kind: active.kind, known: active.known });
      else setPaywall({ preview: active.preview, kind: active.kind });
    });
  }, []);
  /** ★11/27 시트 안 블프 단추 — 블프 코드가 채워진 애플 적용 창(lib/app/redeem openWarmBfRedeem · 결제는 애플 창에서만). 시트는 닫는다 */
  const takeBf = useCallback((plan: BfPlan) => {
    const active = current.current;
    if (!active) return;
    if (!bfLive(Date.now())) { close('trial_off_plans'); return; }
    current.current = null;
    setView(null);
    const src = plan === 'annual' ? 'tk_bf' as const : 'tk_bf_m' as const;
    if (!active.preview) { trackFunnel('trial_off_plans', { src: srcOf(active.kind) }); trackFunnel('cta', { src }); }
    // 프리뷰 호스트는 openWarmBfRedeem 이 새 탭으로 주소만 연다(결제·계측 없음)
    void import('@/lib/app/redeem').then((m) => m.openWarmBfRedeem(plan, src)).catch(() => {});
  }, [close]);
  return <>{view && <TrialOffSheet view={view} locale={locale} onClose={() => close('trial_off_close')} onLater={() => { const active = current.current; close('trial_off_close'); if (active && !active.preview && canShowCancelReason()) void afterSheetHistory().then(() => { if (canShowCancelReason() && canPresentCancelReason()) setReason(true); }); }} onManage={() => close('trial_off_manage')} onPlans={() => close('trial_off_plans')} onBf={takeBf} onExpired={() => close('trial_off_expired')} />}<CancelReasonPreview locale={locale} />{reason && <CancelReasonSheet locale={locale} preview={false} onDone={() => setReason(false)} />}{warm && <WarmBfOffer locale={locale} known={warm.known ?? undefined} onClose={() => setWarm(null)} onFallback={() => { const w = warm; setWarm(null); setPaywall({ preview: w.preview, kind: w.kind }); }} />}{paywall && <TrialSavePaywall locale={locale} src={srcOf(paywall.kind)} onClose={() => setPaywall(null)} previewPlans={paywall.preview ? (PREVIEW_PLANS[locale] ?? PREVIEW_PLANS.en) : undefined} />}{expired && <TrialExpiredPaywall notice={expired} locale={locale} onClose={() => { expiredOpen.current = false; setExpired(null); }} />}</>;
}

function CancelReasonPreview({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('cancelReasonPreview') === '1') setOpen(true); }, []);
  return open ? <CancelReasonSheet locale={locale} preview onDone={() => setOpen(false)} /> : null;
}

/** 운영 실적 채점(숫자) — 실패하면 줄을 그리지 않는다. 개발 미리보기는 ?trialScore=n,within[,prev] 로 «운영에서 읽은 값»을 넣는다 */
function useTrialScorecard(preview: boolean, startedAt: number) {
  const [score, setScore] = useState<TrialScorecard | null>(null);
  useEffect(() => {
    if (preview) {
      const q = new URLSearchParams(location.search).get('trialScore')?.split(',');
      if (q && q.length >= 2) setScore({ n: Number(q[0]), within: Number(q[1]), previous: q[2] === 'prev' });
      return;
    }
    const ctrl = new AbortController();
    void trialScorecard(async (w) => {
      const r = await fetch(`/api/earnings/scorecard?week=${w}`, { signal: ctrl.signal });
      if (!r.ok) throw new Error('scorecard unavailable');
      return r.json();
    }, calendarScorecardWeek(etDateOf(Date.now())), startedAt).then((v) => { if (!ctrl.signal.aborted) setScore(v); });
    return () => ctrl.abort();
  }, [preview, startedAt]);
  return score;
}

/** ★11/11 체험 만료 뒤 1회 페이월 — 실제 값(체험 기간 안의 사용일·체험 마지막 앞 주 운영 실적 채점·지금 담긴 내 종목 수)을 모은 뒤
 *  기존 ProPaywall(연간 기본·구매 복원)을 연다. 채점은 최대 1.5초만 기다린다(못 읽으면 그 줄 없이).
 *  «봤음» 표식은 페이월이 실제로 화면에 그려지고(동적 로드 끝) 앱이 앞에 있을 때만 남긴다(관문 11111805 ① — 뒤로 간 사이 소진 금지) */
function TrialExpiredPaywall({ notice, locale, onClose }: { notice: TrialExpiredNotice & { preview: boolean; offerEligible: boolean }; locale: string; onClose: () => void }) {
  const [score, setScore] = useState<TrialExpiredScore | null | undefined>(undefined);
  // ★11/12 첫 달 할인 오퍼 — 대상이 아니면 바로 null(카드 없음). 대상이면 오퍼링·애플 서명을 최대 2.5초 기다리고, 못 받으면 카드 없이
  const [offer, setOffer] = useState<ExpiredOffer | ExpiredOfferView | null | undefined>(() => notice.offerEligible ? (notice.preview ? (PREVIEW_OFFER[locale] ?? PREVIEW_OFFER.en) : undefined) : null);
  useEffect(() => {
    if (offer !== undefined) return;
    let alive = true;
    const timer = window.setTimeout(() => { if (alive) setOffer((v) => (v === undefined ? null : v)); }, OFFER_WAIT_MS);
    void loadExpiredOffer().catch(() => null).then((v) => { if (alive) setOffer((cur) => (cur === undefined ? v : cur)); });
    return () => { alive = false; window.clearTimeout(timer); };
    // 한 번만(마운트 때)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [watchCount] = useState(readWatchCount);
  const [usageDays] = useState(() => notice.preview ? Number(new URLSearchParams(location.search).get('trialDays') ?? 0) : trialUsageDays(readUsageRaw(), notice.startedAt, notice.expiresAt));
  const marked = useRef(false);
  useEffect(() => {
    if (notice.preview) {
      const q = new URLSearchParams(location.search).get('trialScore')?.split(',');
      setScore(q && q.length >= 3 ? { n: Number(q[0]), within: Number(q[1]), week: q[2] } : null);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => setScore((v) => (v === undefined ? null : v)), 1500);
    void trialExpiredScorecard(async (w) => {
      const r = await fetch(`/api/earnings/scorecard?week=${w}`, { signal: ctrl.signal });
      if (!r.ok) throw new Error('scorecard unavailable');
      return r.json();
    }, notice.startedAt, notice.expiresAt).then((v) => { if (!ctrl.signal.aborted) setScore((cur) => (cur === undefined ? v : cur)); });
    return () => { ctrl.abort(); window.clearTimeout(timer); };
  }, [notice.preview, notice.startedAt, notice.expiresAt]);
  const ready = score !== undefined && offer !== undefined;
  useEffect(() => {
    if (!ready || marked.current || notice.preview) return;
    const shown = () => document.visibilityState === 'visible' && !!document.querySelector('[data-pro-paywall][data-paywall-src="trial_expired"]');
    let observer: MutationObserver | undefined;
    const done = () => { observer?.disconnect(); document.removeEventListener('visibilitychange', check); };
    function check() {
      if (marked.current || !shown()) return;
      marked.current = true;
      saveExpired(notice.mark);
      done();
    }
    observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', check);
    check();
    return done;
  }, [ready, notice]);
  if (!ready) return null;
  const context = trialExpiredContext(locale, { expiresAt: notice.expiresAt, usageDays, watchCount, score: score ?? null });
  return <TrialSavePaywall locale={locale} src="trial_expired" context={context} onClose={onClose} previewPlans={notice.preview ? (PREVIEW_PLANS[locale] ?? PREVIEW_PLANS.en) : undefined} discountOffer={offer ?? null} />;
}

function readWatchCount(): number {
  try { return parseWatchlist(localStorage.getItem(WATCHLIST_STORAGE_KEY)).length; } catch { return 0; }
}

function TrialOffSheet({ view, locale, onClose, onLater, onManage, onPlans, onBf, onExpired }: { view: View; locale: string; onClose: () => void; onLater: () => void; onManage: () => void; onPlans: () => void; onBf: (plan: BfPlan) => void; onExpired: () => void }) {
  const copy = trialSaveCopy(locale);
  // ★11/27 «무엇을 썼나» — 체험 중 앱을 연 날(기기 기록 · 시작일·끝나는 날 제외). 이틀 이상일 때만 줄을 그린다
  const [usageDays] = useState(() => view.preview ? Number(new URLSearchParams(location.search).get('trialDays') ?? 0) : trialUsageDays(readUsageRaw(), view.startedAt, view.expiresAt));
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const later = useRef<HTMLButtonElement>(null);
  const marked = useRef(false);
  const score = useTrialScorecard(view.preview, view.startedAt);
  const [watchCount] = useState(readWatchCount);
  useBackToClose(true, onClose);
  useBannerSuppression(true);
  const isTop = useLayer(true, onClose, sheet);
  useEffect(() => {
    if (!marked.current) {
      marked.current = true;
      if (!view.preview) {
        saveSeen(view.mark, view.kind);
        trackFunnel('trial_off_show', { src: srcOf(view.kind) });
        if (view.kind !== 'early') trackFunnel('tk_use', { src: usageSrc(usageDays) });
        // 블프 줄이 그려졌다 = 웜 카드를 본 것과 같다(오늘 웜 카드·다른 페이월 쉼 · 이 체험 기간 블프 이어가기 끝) — WarmBfOffer 와 같은 표식
        if (view.bf) { saveBf(view.mark); try { markWarmShown(window.localStorage); } catch { /* noop */ } markGateDay(localDay()); trackFunnel('open', { src: 'tk_bf' }); }
      }
    }
    const focus = window.setTimeout(() => later.current?.focus({ preventScroll: true }), 40);
    const cancelExpiry = scheduleTrialOffExpiry(view.expiresAt, onExpired);
    return () => { window.clearTimeout(focus); cancelExpiry(); };
    // usageDays 는 처음 값 그대로(마운트 때 한 번)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, onExpired]);
  // 블프 기간이 끝나는 순간 열린 시트의 블프 줄도 내린다(만료된 코드를 안내하지 않게 — 웜 카드와 같은 규칙)
  const [bfOn, setBfOn] = useState(() => !!view.bf && bfLive(Date.now()));
  useEffect(() => {
    if (!view.bf) return;
    const check = () => { if (!bfLive(Date.now())) setBfOn(false); };
    const left = BF_VALID_UNTIL - Date.now();
    const t = left > 0 && left < 2 ** 31 - 1 ? window.setTimeout(check, left + 50) : 0;
    document.addEventListener('visibilitychange', check);
    return () => { if (t) window.clearTimeout(t); document.removeEventListener('visibilitychange', check); };
  }, [view.bf]);
  const bf = bfOn ? view.bf : null;
  const wl = toWarmLang(locale);
  const bfc = BF_COPY[wl], wc = WARM_COPY[wl];
  const endDate = trialEndDateText(view.expiresAt, locale).replace(/ /g, '\u00a0');
  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !isTop()) return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons[buttons.length - 1]?.focus(); }
    else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) { e.preventDefault(); buttons[0]?.focus(); }
  };
  return <div className={p.overlay} data-testid="trial-off-notice">
    <div ref={sheet} className={`${p.sheet} ${s.box}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}>
      <div className={p.head}>
        <span className={bf ? `${p.eyebrow} ${b.eyebrow}` : p.eyebrow}>{bf ? bfc.eyebrow : 'SIGNUM PRO'}</span>
        <h1 className={p.title} id={titleId}>{copy.title(endDate)}</h1>
        <p className={`${p.lede} ${s.lede}`}>{trialOffLede(locale, view.kind !== 'window')}</p>
        {bf && <p className={b.offer} data-trial-bf={bf.plans.primary}>{bf.plans.primary === 'annual' ? bfc.annualSub(bf.prices.annual.regular, bf.prices.annual.offer) : wc.monthlySub(bf.prices.monthly.regular, bf.prices.monthly.offer)}</p>}
      </div>
      {score && <>
        <p className={p.fine} style={{ textAlign: 'left', marginTop: 4 }}>{copy.seen}</p>
        <ul className={p.benefits} data-trial-value="scorecard"><li className={`${p.benefit} ${p.benefitLead}`}>{copy.scorecard(score)}</li></ul>
      </>}
      <p className={p.fine} style={{ textAlign: 'left', marginTop: 4 }}>{copy.keep}</p>
      <ul className={p.benefits} data-trial-value="keep">
        {usageDays >= TRIAL_USAGE_MIN_DAYS && <li className={p.benefit} data-trial-usage="">{copy.usage(usageDays)}</li>}
        <li className={p.benefit}>{trialWatchlistLine(watchCount, locale)}</li>
        <li className={p.benefit}>{copy.unlocked}</li>
      </ul>
      {bf ? <>
        <button type="button" className={`${p.cta} ${b.cta}`} onClick={() => onBf(bf.plans.primary)} data-trial-bf-plan={bf.plans.primary}>
          {bf.plans.primary === 'annual' ? bfc.annualCta(bf.prices.annual.offer) : bfc.monthlyCta(bf.prices.monthly.regular, bf.prices.monthly.offer)}
        </button>
        {bf.plans.secondary && <button type="button" className={b.alt} onClick={() => onBf(bf.plans.secondary as BfPlan)} data-trial-bf-plan={bf.plans.secondary}>
          {bf.plans.secondary === 'annual' ? bfc.annualCta(bf.prices.annual.offer) : bfc.monthlyCta(bf.prices.monthly.regular, bf.prices.monthly.offer)}
        </button>}
        <p className={p.fine} data-trial-bf-fine="">{wc.fine(endDate, bf.prices.annual.regular, bf.prices.monthly.regular)}</p>
        <button type="button" className={p.link} style={{ display: 'block', margin: '4px auto 0' }} onClick={onPlans}>{copy.otherPlans}</button>
      </> : <button type="button" className={`${p.cta} ${s.cta}`} onClick={onPlans}>{copy.cta}</button>}
      <button type="button" className={p.link} style={{ display: 'block', margin: bf ? '2px auto 0' : '10px auto 0' }} onClick={onManage}>{copy.manage}</button>
      <button ref={later} type="button" className={p.close} style={{ position: 'static', width: '100%' }} onClick={onLater}>{copy.later}</button>
    </div>
  </div>;
}
