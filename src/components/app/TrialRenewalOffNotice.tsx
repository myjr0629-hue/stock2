'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import dynamic from 'next/dynamic';
import { afterSheetHistory, useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { trackFunnel } from '@/lib/app/funnel';
import { openSubscriptionManagement } from '@/lib/app/subscriptionManagement';
import { TRIAL_OFF_STORAGE_KEY, trialRenewalOffNotice, verifiedTrialRenewalOffNotice, type TrialOffNotice } from '@/lib/app/trialRenewalOff';
import { scheduleTrialOffExpiry, waitForOtherModal } from '@/lib/app/trialOffLifecycle';
import { beginTrialRenewalOffEntry, loadFreshTrialRenewalOff, refreshTrialRenewalOffOnResume, verifyTrialRenewalOff } from '@/services/trialRenewalOff';
import { canPresentCancelReason, canShowCancelReason } from '@/lib/app/cancelReason';
import { CancelReasonSheet } from './CancelReasonSheet';
import { TRIAL_SAVE_PUSH_FLAG, trialEndDateText, trialSaveCopy, trialScorecard, trialWatchlistLine, type TrialScorecard } from '@/lib/app/trialSave';
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
function readSeen() {
  try { return localStorage.getItem(TRIAL_OFF_STORAGE_KEY) || sessionSeen; } catch { return sessionSeen; }
}
function saveSeen(mark: string) {
  sessionSeen = mark;
  try { localStorage.setItem(TRIAL_OFF_STORAGE_KEY, mark); } catch { /* session fallback */ }
  try { sessionStorage.removeItem(TRIAL_SAVE_PUSH_FLAG); } catch { /* noop */ }
}

type View = TrialOffNotice & { preview: boolean };
export function TrialRenewalOffNotice({ locale }: { locale: string }) {
  const [view, setView] = useState<View | null>(null);
  const [reason, setReason] = useState(false);
  const [paywall, setPaywall] = useState<{ preview: boolean } | null>(null);
  const current = useRef<View | null>(null);
  useEffect(() => {
    let disposed = false, generation = 0;
    let suspended = document.visibilityState !== 'visible';
    let stopWaiting: (() => void) | undefined;
    const preview = process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('trialOffPreview') === '1';
    const enter = async () => {
      if (process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('cancelReasonPreview') === '1') return;
      const run = ++generation;
      stopWaiting?.(); stopWaiting = undefined;
      if (document.visibilityState !== 'visible' || current.current) return;
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
        let notice = preview ? { store: 'APP_STORE' as const, expiresAt: Date.now() + 2.4 * 86400000, period: 'preview', mark: 'preview' }
          : snapshot && trialRenewalOffNotice(snapshot.customerInfo, snapshot.platform, Date.now(), seen);
        if (!notice) return;
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
          notice = fresh && fresh.platform === snapshot.platform
            ? verifiedTrialRenewalOffNotice(snapshot.customerInfo, fresh.customerInfo, fresh.platform, Date.now(), seen) : null;
          if (!notice) return;
        }
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
    if (!active.preview) trackFunnel(stage, { src: 'trial_off' });
    if (stage === 'trial_off_manage' && !active.preview && active.expiresAt > Date.now()) void openSubscriptionManagement(active.store).catch(() => {});
    // 시트의 히스토리 칸을 걷은 «뒤»에 페이월을 연다(늦게 온 popstate 가 새 페이월을 닫지 않게)
    if (stage === 'trial_off_plans' && active.expiresAt > Date.now()) void afterSheetHistory().then(() => setPaywall({ preview: active.preview }));
  }, []);
  return <>{view && <TrialOffSheet view={view} locale={locale} onClose={() => close('trial_off_close')} onLater={() => { const active = current.current; close('trial_off_close'); if (active && !active.preview && canShowCancelReason()) void afterSheetHistory().then(() => { if (canShowCancelReason() && canPresentCancelReason()) setReason(true); }); }} onManage={() => close('trial_off_manage')} onPlans={() => close('trial_off_plans')} onExpired={() => close('trial_off_expired')} />}<CancelReasonPreview locale={locale} />{reason && <CancelReasonSheet locale={locale} preview={false} onDone={() => setReason(false)} />}{paywall && <TrialSavePaywall locale={locale} onClose={() => setPaywall(null)} previewPlans={paywall.preview ? (PREVIEW_PLANS[locale] ?? PREVIEW_PLANS.en) : undefined} />}</>;
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
      if (!view.preview) { saveSeen(view.mark); trackFunnel('trial_off_show', { src: 'trial_off' }); }
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
        <p className={`${p.lede} ${s.lede}`}>{copy.lede}</p>
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
