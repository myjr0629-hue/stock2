'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useBackToClose, useLayer } from '@/components/app/watchlist/BottomSheet';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { trackFunnel } from '@/lib/app/funnel';
import { openSubscriptionManagement } from '@/lib/app/subscriptionManagement';
import { TRIAL_OFF_STORAGE_KEY, trialOffCopy, trialRenewalOffNotice, verifiedTrialRenewalOffNotice, type TrialOffNotice } from '@/lib/app/trialRenewalOff';
import { scheduleTrialOffExpiry, waitForOtherModal } from '@/lib/app/trialOffLifecycle';
import { beginTrialRenewalOffEntry, loadFreshTrialRenewalOff, refreshTrialRenewalOffOnResume, verifyTrialRenewalOff } from '@/services/trialRenewalOff';
import p from './ProPaywall.module.css';
import s from './GiftAnnounceSheet.module.css';

let sessionSeen: string | null = null;
function readSeen() {
  try { return localStorage.getItem(TRIAL_OFF_STORAGE_KEY) || sessionSeen; } catch { return sessionSeen; }
}
function saveSeen(period: string) {
  sessionSeen = period;
  try { localStorage.setItem(TRIAL_OFF_STORAGE_KEY, period); } catch { /* session fallback */ }
}

type View = TrialOffNotice & { preview: boolean };
export function TrialRenewalOffNotice({ locale }: { locale: string }) {
  const [view, setView] = useState<View | null>(null);
  const current = useRef<View | null>(null);
  useEffect(() => {
    let disposed = false, generation = 0;
    let suspended = document.visibilityState !== 'visible';
    let stopWaiting: (() => void) | undefined;
    const preview = process.env.NODE_ENV === 'development' && new URLSearchParams(location.search).get('trialOffPreview') === '1';
    const enter = async () => {
      const run = ++generation;
      stopWaiting?.(); stopWaiting = undefined;
      if (document.visibilityState !== 'visible' || current.current) return;
      if (document.querySelector('[aria-modal="true"]')) {
        stopWaiting = waitForOtherModal(document, () => { stopWaiting = undefined; void enter(); });
        return;
      }
      try {
        const snapshot = preview ? null : await loadFreshTrialRenewalOff();
        if (disposed || run !== generation || document.visibilityState !== 'visible') return;
        let notice = preview ? { store: 'APP_STORE' as const, expiresAt: Date.now() + 3600000, period: 'preview' }
          : snapshot && trialRenewalOffNotice(snapshot.customerInfo, snapshot.platform, Date.now(), readSeen());
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
            ? verifiedTrialRenewalOffNotice(snapshot.customerInfo, fresh.customerInfo, fresh.platform, Date.now(), readSeen()) : null;
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
  const close = useCallback((stage: 'trial_off_close' | 'trial_off_manage' | 'trial_off_expired') => {
    const active = current.current;
    if (!active) return;
    current.current = null;
    setView(null);
    if (!active.preview) trackFunnel(stage, { src: 'trial_off' });
    if (stage === 'trial_off_manage' && !active.preview && active.expiresAt > Date.now()) void openSubscriptionManagement(active.store).catch(() => {});
  }, []);
  return view ? <TrialOffSheet view={view} locale={locale} onClose={() => close('trial_off_close')} onManage={() => close('trial_off_manage')} onExpired={() => close('trial_off_expired')} /> : null;
}

function TrialOffSheet({ view, locale, onClose, onManage, onExpired }: { view: View; locale: string; onClose: () => void; onManage: () => void; onExpired: () => void }) {
  const copy = trialOffCopy(locale);
  const titleId = useId();
  const sheet = useRef<HTMLDivElement>(null);
  const later = useRef<HTMLButtonElement>(null);
  const marked = useRef(false);
  useBackToClose(true, onClose);
  useBannerSuppression(true);
  const isTop = useLayer(true, onClose, sheet);
  useEffect(() => {
    if (!marked.current) {
      marked.current = true;
      if (!view.preview) { saveSeen(view.period); trackFunnel('trial_off_show', { src: 'trial_off' }); }
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
    <div ref={sheet} className={p.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trapTab}>
      <div className={p.head}><h1 className={p.title} id={titleId}>{copy.title}</h1><p className={p.lede}>{copy.intro}</p></div>
      <ul className={p.benefits}><li className={p.benefit}>{copy.watchlist}</li><li className={p.benefit}>{copy.ads}</li></ul>
      <button type="button" className={`${p.cta} ${s.cta}`} onClick={onManage}>{copy.manage}</button>
      <button ref={later} type="button" className={p.close} style={{ position: 'static', width: '100%' }} onClick={onClose}>{copy.later}</button>
    </div>
  </div>;
}
