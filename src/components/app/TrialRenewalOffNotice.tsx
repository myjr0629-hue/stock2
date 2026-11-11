'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import dynamic from 'next/dynamic';
import { afterSheetHistory, useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { trackFunnel } from '@/lib/app/funnel';
import { openSubscriptionManagement } from '@/lib/app/subscriptionManagement';
import { TRIAL_OFF_EARLY_KEY, TRIAL_OFF_STORAGE_KEY, trialRenewalOffNotice, verifiedTrialRenewalOffNotice, type TrialOffKind, type TrialOffNotice } from '@/lib/app/trialRenewalOff';
import { TRIAL_EXPIRED_STORAGE_KEY, trialExpiredContext, trialExpiredNotice, trialUsageDays, verifiedTrialExpiredNotice, type TrialExpiredNotice } from '@/lib/app/trialExpired';
import { scheduleTrialOffExpiry, waitForOtherModal } from '@/lib/app/trialOffLifecycle';
import { beginTrialRenewalOffEntry, loadFreshTrialRenewalOff, refreshTrialRenewalOffOnResume, verifyTrialRenewalOff } from '@/services/trialRenewalOff';
import { canPresentCancelReason, canShowCancelReason } from '@/lib/app/cancelReason';
import { CancelReasonSheet } from './CancelReasonSheet';
import { TRIAL_SAVE_PUSH_FLAG, trialEndDateText, trialOffLede, trialSaveCopy, trialScorecard, trialWatchlistLine, type TrialScorecard } from '@/lib/app/trialSave';
import { WATCHLIST_STORAGE_KEY, parseWatchlist } from '@/lib/app/watchlist';
import { calendarScorecardWeek } from '@/lib/earnings/calendarScorecardDisplay';
import { etDateOf } from '@/lib/marketCalendar';
import type { PaywallPlan } from './ProPaywall';
import p from './ProPaywall.module.css';
import s from './GiftAnnounceSheet.module.css';

// ★2026-11-11 «PRO 요금제 보기» → 기존 ProPaywall(체험 중에도 열린 채 · 연간 기본 선택은 페이월 규칙 그대로). 누를 때만 받는다.
const TrialSavePaywall = dynamic(() => import('./TrialSavePaywall'), { ssr: false });
/** 개발 미리보기(?trialOffPreview=1) 전용 더미 요금 — 실제 앱은 스토어 문자열만 쓴다(paywall-preview 와 같은 값) */
const PREVIEW_PLANS: Record<string, PaywallPlan[]> = {
  ko: [{ plan: 'monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW' }, { plan: 'annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW', pricePerMonthString: '₩7,417' }],
  ja: [{ plan: 'monthly', priceString: '¥1,280', price: 1280, currencyCode: 'JPY' }, { plan: 'annual', priceString: '¥12,000', price: 12000, currencyCode: 'JPY', pricePerMonthString: '¥1,000' }],
  en: [{ plan: 'monthly', priceString: '$9.99', price: 9.99, currencyCode: 'USD' }, { plan: 'annual', priceString: '$74.99', price: 74.99, currencyCode: 'USD', pricePerMonthString: '$6.25' }],
};

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
function saveSeen(mark: string, kind: TrialOffKind) {
  if (kind === 'early') {
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
/** 사용일 기록(capacitorBridge maybePromptReview 가 대시보드마다 남기는 기기 현지 날짜 목록) — 읽기만 */
const USAGE_DAYS_KEY = 'signumhq.review.days';
function readUsageRaw(): string | null {
  try { return localStorage.getItem(USAGE_DAYS_KEY); } catch { return null; }
}
/** 계측 출처 — 조기 안내는 따로 센다(시트 단계·그 시트가 연 페이월 모두) */
const srcOf = (kind: TrialOffKind) => kind === 'early' ? 'trial_off_early' as const : 'trial_off' as const;

type View = TrialOffNotice & { preview: boolean };
export function TrialRenewalOffNotice({ locale }: { locale: string }) {
  const [view, setView] = useState<View | null>(null);
  const [reason, setReason] = useState(false);
  const [paywall, setPaywall] = useState<{ preview: boolean; kind: TrialOffKind } | null>(null);
  // ★11/11 체험 만료 뒤 1회 페이월 — 앱이 잠깐 뒤로 가도(안드 결제 창 = onPause) 닫지 않는다(suspend 대상 아님)
  const [expired, setExpired] = useState<(TrialExpiredNotice & { preview: boolean }) | null>(null);
  const expiredOpen = useRef(false);
  const current = useRef<View | null>(null);
  useEffect(() => {
    let disposed = false, generation = 0;
    let suspended = document.visibilityState !== 'visible';
    let stopWaiting: (() => void) | undefined;
    const previewParam = process.env.NODE_ENV === 'development' ? new URLSearchParams(location.search).get('trialOffPreview') : null;
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
        const early = { early: readEarly() };
        let notice: TrialOffNotice | null = previewParam === 'expired' ? null : preview
          ? { store: 'APP_STORE' as const, expiresAt: Date.now() + (previewParam === 'early' ? 27.4 : 2.4) * 86400000, period: 'preview', mark: 'preview', kind: previewParam === 'early' ? 'early' : 'window' }
          : snapshot && trialRenewalOffNotice(snapshot.customerInfo, snapshot.platform, Date.now(), seen, undefined, early);
        // ★11/11 체험 중 시트가 없을 때만 «만료 뒤 1회»를 본다(체험 중 시트는 활성 체험에서만 — 둘은 겹치지 않는다). 오늘 체험 시트를 봤으면 내일
        const marks = { offSeen: readSeen(), early: early.early };
        let lapsed: TrialExpiredNotice | null = notice ? null : previewParam === 'expired'
          ? { store: 'APP_STORE' as const, startedAt: Date.now() - 31 * 86400000, expiresAt: Date.now() - 86400000, period: 'preview', mark: 'preview' }
          : snapshot && trialExpiredNotice(snapshot.customerInfo, snapshot.platform, Date.now(), readExpired(), undefined, marks);
        if (!notice && !lapsed) return;
        // A sheet may have opened while the SDK read was in flight.
        if (document.querySelector('[aria-modal="true"]')) {
          stopWaiting = waitForOtherModal(document, () => { stopWaiting = undefined; void enter(); });
          return;
        }
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
          } else {
            // 만료 판정도 캐시를 비운 새 읽기로 한 번 더 — 방금 다른 경로로 구매·복원했으면 활성 'pro' 가 보여 안 뜬다
            lapsed = fresh && fresh.platform === snapshot.platform
              ? verifiedTrialExpiredNotice(snapshot.customerInfo, fresh.customerInfo, fresh.platform, Date.now(), readExpired(), undefined, marks) : null;
          }
          if (!notice && !lapsed) return;
        }
        if (!notice && lapsed) {
          expiredOpen.current = true;
          setExpired({ ...lapsed, preview });
          return;
        }
        if (!notice) return;
        const next = { ...notice, preview };
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
    if (stage === 'trial_off_plans' && active.expiresAt > Date.now()) void afterSheetHistory().then(() => setPaywall({ preview: active.preview, kind: active.kind }));
  }, []);
  return <>{view && <TrialOffSheet view={view} locale={locale} onClose={() => close('trial_off_close')} onLater={() => { const active = current.current; close('trial_off_close'); if (active && !active.preview && canShowCancelReason()) void afterSheetHistory().then(() => { if (canShowCancelReason() && canPresentCancelReason()) setReason(true); }); }} onManage={() => close('trial_off_manage')} onPlans={() => close('trial_off_plans')} onExpired={() => close('trial_off_expired')} />}<CancelReasonPreview locale={locale} />{reason && <CancelReasonSheet locale={locale} preview={false} onDone={() => setReason(false)} />}{paywall && <TrialSavePaywall locale={locale} src={srcOf(paywall.kind)} onClose={() => setPaywall(null)} previewPlans={paywall.preview ? (PREVIEW_PLANS[locale] ?? PREVIEW_PLANS.en) : undefined} />}{expired && <TrialExpiredPaywall notice={expired} locale={locale} onClose={() => { expiredOpen.current = false; setExpired(null); }} />}</>;
}

function CancelReasonPreview({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('cancelReasonPreview') === '1') setOpen(true); }, []);
  return open ? <CancelReasonSheet locale={locale} preview onDone={() => setOpen(false)} /> : null;
}

/** 운영 실적 채점(숫자) — 실패하면 줄을 그리지 않는다. 개발 미리보기는 ?trialScore=n,within[,prev] 로 «운영에서 읽은 값»을 넣는다 */
function useTrialScorecard(preview: boolean) {
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
    }, calendarScorecardWeek(etDateOf(Date.now()))).then((v) => { if (!ctrl.signal.aborted) setScore(v); });
    return () => ctrl.abort();
  }, [preview]);
  return score;
}

/** ★11/11 체험 만료 뒤 1회 페이월 — 실제 값(사용일·내 종목·운영 실적 채점)을 모은 뒤 기존 ProPaywall(연간 기본·구매 복원)을 연다.
 *  채점은 최대 1.5초만 기다린다(못 읽으면 그 줄 없이). 보인 순간 «이 체험 기간엔 봤음»을 남긴다 */
function TrialExpiredPaywall({ notice, locale, onClose }: { notice: TrialExpiredNotice & { preview: boolean }; locale: string; onClose: () => void }) {
  const [score, setScore] = useState<TrialScorecard | null | undefined>(undefined);
  const [watchCount] = useState(readWatchCount);
  const [usageDays] = useState(() => notice.preview ? Number(new URLSearchParams(location.search).get('trialDays') ?? 0) : trialUsageDays(readUsageRaw(), notice.startedAt, notice.expiresAt));
  const marked = useRef(false);
  useEffect(() => {
    if (notice.preview) {
      const q = new URLSearchParams(location.search).get('trialScore')?.split(',');
      setScore(q && q.length >= 2 ? { n: Number(q[0]), within: Number(q[1]), previous: q[2] === 'prev' } : null);
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => setScore((v) => (v === undefined ? null : v)), 1500);
    void trialScorecard(async (w) => {
      const r = await fetch(`/api/earnings/scorecard?week=${w}`, { signal: ctrl.signal });
      if (!r.ok) throw new Error('scorecard unavailable');
      return r.json();
    }, calendarScorecardWeek(etDateOf(Date.now()))).then((v) => { if (!ctrl.signal.aborted) setScore((cur) => (cur === undefined ? v : cur)); });
    return () => { ctrl.abort(); window.clearTimeout(timer); };
  }, [notice.preview]);
  const ready = score !== undefined;
  useEffect(() => {
    if (!ready || marked.current) return;
    marked.current = true;
    if (!notice.preview) saveExpired(notice.mark);
  }, [ready, notice]);
  if (!ready) return null;
  const context = trialExpiredContext(locale, { expiresAt: notice.expiresAt, usageDays, watchCount, score: score ?? null });
  return <TrialSavePaywall locale={locale} src="trial_expired" context={context} onClose={onClose} previewPlans={notice.preview ? (PREVIEW_PLANS[locale] ?? PREVIEW_PLANS.en) : undefined} />;
}

function readWatchCount(): number {
  try { return parseWatchlist(localStorage.getItem(WATCHLIST_STORAGE_KEY)).length; } catch { return 0; }
}

function TrialOffSheet({ view, locale, onClose, onLater, onManage, onPlans, onExpired }: { view: View; locale: string; onClose: () => void; onLater: () => void; onManage: () => void; onPlans: () => void; onExpired: () => void }) {
  const copy = trialSaveCopy(locale);
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const later = useRef<HTMLButtonElement>(null);
  const marked = useRef(false);
  const score = useTrialScorecard(view.preview);
  const [watchCount] = useState(readWatchCount);
  useBackToClose(true, onClose);
  useBannerSuppression(true);
  const isTop = useLayer(true, onClose, sheet);
  useEffect(() => {
    if (!marked.current) {
      marked.current = true;
      if (!view.preview) { saveSeen(view.mark, view.kind); trackFunnel('trial_off_show', { src: srcOf(view.kind) }); }
    }
    const focus = window.setTimeout(() => later.current?.focus({ preventScroll: true }), 40);
    const cancelExpiry = scheduleTrialOffExpiry(view.expiresAt, onExpired);
    return () => { window.clearTimeout(focus); cancelExpiry(); };
  }, [view, onExpired]);
  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !isTop()) return;
    const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons[buttons.length - 1]?.focus(); }
    else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) { e.preventDefault(); buttons[0]?.focus(); }
  };
  return <div className={p.overlay} data-testid="trial-off-notice">
    <div ref={sheet} className={`${p.sheet} ${s.box}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}>
      <div className={p.head}>
        <span className={p.eyebrow}>SIGNUM PRO</span>
        <h1 className={p.title} id={titleId}>{copy.title(trialEndDateText(view.expiresAt, locale).replace(/ /g, '\u00a0'))}</h1>
        <p className={`${p.lede} ${s.lede}`}>{trialOffLede(locale, view.kind === 'early')}</p>
      </div>
      {score && <>
        <p className={p.fine} style={{ textAlign: 'left', marginTop: 4 }}>{copy.seen}</p>
        <ul className={p.benefits} data-trial-value="scorecard"><li className={`${p.benefit} ${p.benefitLead}`}>{copy.scorecard(score)}</li></ul>
      </>}
      <p className={p.fine} style={{ textAlign: 'left', marginTop: 4 }}>{copy.keep}</p>
      <ul className={p.benefits} data-trial-value="keep">
        <li className={p.benefit}>{trialWatchlistLine(watchCount, locale)}</li>
        <li className={p.benefit}>{copy.unlocked}</li>
      </ul>
      <button type="button" className={`${p.cta} ${s.cta}`} onClick={onPlans}>{copy.cta}</button>
      <button type="button" className={p.link} style={{ display: 'block', margin: '10px auto 0' }} onClick={onManage}>{copy.manage}</button>
      <button ref={later} type="button" className={p.close} style={{ position: 'static', width: '100%' }} onClick={onLater}>{copy.later}</button>
    </div>
  </div>;
}
