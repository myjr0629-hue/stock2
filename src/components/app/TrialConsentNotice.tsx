'use client';

import { useEffect, useRef, useState } from 'react';
import { trackFunnel } from '@/lib/app/funnel';
import { openSubscriptionManagement } from '@/lib/app/subscriptionManagement';
import { TRIAL_CONSENT_STORAGE_KEY, emptyTrialConsentMemory, parseTrialConsentMemory, type TrialConsentMemory } from '@/lib/app/trialConsent';
import { createTrialConsentController, type TrialConsentView } from '@/lib/app/trialConsentController';
import { listenTrialConsentUpdates, loadTrialConsentSnapshot } from '@/services/trialConsent';
import s from './TrialConsentNotice.module.css';

// Storage-denied WebViews still honor dismissal for the lifetime of this app run.
let memory = emptyTrialConsentMemory();
let storageFailed = false;
function readMemory() {
  if (storageFailed) return memory;
  try { memory = parseTrialConsentMemory(localStorage.getItem(TRIAL_CONSENT_STORAGE_KEY)); } catch { storageFailed = true; }
  return memory;
}
function saveMemory(next: TrialConsentMemory) {
  memory = next;
  try { localStorage.setItem(TRIAL_CONSENT_STORAGE_KEY, JSON.stringify(next)); } catch { storageFailed = true; }
}

export function TrialConsentNotice({ locale, classes }: { locale: string; classes: { sect: string; surf: string } }) {
  const [view, setView] = useState<TrialConsentView | null>(null);
  const control = useRef<ReturnType<typeof createTrialConsentController> | null>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (locale !== 'ko') return;
    let disposed = false;
    let stopListening: (() => void) | undefined;
    const controller = createTrialConsentController({
      locale, load: loadTrialConsentSnapshot, readMemory, saveMemory, publish: setView,
      track: (stage) => trackFunnel(stage, { src: 'trial_notice' }),
    });
    control.current = controller;
    const refresh = () => { if (document.visibilityState === 'visible') void controller.refresh(true); };
    const poll = () => { if (document.visibilityState === 'visible') void controller.refresh(); };
    refresh();
    // Listener covers cancellation/paid renewal while on the dashboard. Resume
    // re-reads both storefront and switch, including a return from management.
    void listenTrialConsentUpdates(refresh).then((off) => {
      if (disposed) off(); else stopListening = off;
    }).catch(() => {});
    const interval = window.setInterval(poll, 60_000);
    document.addEventListener('app:resume', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      disposed = true;
      controller.dispose();
      control.current = null;
      stopListening?.();
      window.clearInterval(interval);
      document.removeEventListener('app:resume', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [locale]);

  useEffect(() => {
    if (!view || !card.current) return;
    const show = () => { if (document.visibilityState === 'visible') control.current?.shown(); };
    if (typeof IntersectionObserver === 'undefined') { show(); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) show();
    });
    observer.observe(card.current);
    return () => observer.disconnect();
  }, [view]);

  useEffect(() => {
    if (!view) return;
    const timer = window.setTimeout(() => { void control.current?.refresh(true); },
      Math.min(2_147_483_647, Math.max(0, view.expiresAt - Date.now())));
    return () => window.clearTimeout(timer);
  }, [view]);

  if (locale !== 'ko' || !view) return null;
  return (
    <div ref={card} className={classes.sect} lang="ko" data-testid="trial-consent-notice">
      <div className={`${classes.surf} ${s.card}`}>
        <p className={s.copy}>{view.text}</p>
        <div className={s.actions}>
          {/* Existing app-view layout supplies one light haptic per button tap. */}
          <button type="button" onClick={() => {
            const store = control.current?.manage();
            if (store) void openSubscriptionManagement(store).catch(() => {});
          }}>구독 관리에서 확인</button>
          <button type="button" onClick={() => control.current?.snooze()}>7일간 보지 않기</button>
        </div>
      </div>
    </div>
  );
}
