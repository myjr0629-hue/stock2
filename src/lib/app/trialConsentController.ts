import type { CustomerInfo, PurchasesStoreProduct } from '@revenuecat/purchases-capacitor';
import {
  TRIAL_CONSENT_SNOOZE_MS, trialConsentCopy, trialConsentNotice, trialConsentPrice,
  type TrialConsentMemory, type TrialConsentNotice,
} from '@/lib/app/trialConsent';

export type TrialConsentSnapshot = {
  customerInfo: Pick<CustomerInfo, 'entitlements'> | null;
  products: readonly PurchasesStoreProduct[];
  countryCode: string | null;
  platform: string;
  enabled: boolean;
};
export type TrialConsentView = TrialConsentNotice & { text: string };
export type TrialConsentStage = 'trial_notice_show' | 'trial_notice_manage' | 'trial_notice_snooze';

/** Framework-independent lifecycle: late reads cannot revive a closed/off card. */
export function createTrialConsentController(deps: {
  locale: string;
  load: (options?: { freshCustomerInfo?: boolean }) => Promise<TrialConsentSnapshot | null>;
  readMemory: () => TrialConsentMemory;
  saveMemory: (memory: TrialConsentMemory) => void;
  publish: (view: TrialConsentView | null) => void;
  track: (stage: TrialConsentStage) => void;
  now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  let generation = 0;
  let disposed = false;
  let view: TrialConsentView | null = null;
  let earlyVisiblePeriod: string | null = null;
  let awaitingResume = false;
  let suspended = false;
  let freshRequired = true;
  let freshRead: Promise<TrialConsentSnapshot | null> | null = null;
  const seen = new Set<string>();
  const publish = (next: TrialConsentView | null) => { view = next; deps.publish(next); };
  async function refresh(hide = false) {
    if (disposed || awaitingResume || suspended) return;
    const run = ++generation;
    if (hide || freshRequired) publish(null);
    try {
      // One fresh attempt per entry, including initial mount. Retain failed/null
      // attempts too: polls and duplicate lifecycle events must not invalidate
      // again or fall back to an unverified cached result during this entry.
      const read = freshRequired
        ? (freshRead ??= deps.load({ freshCustomerInfo: true }))
        : deps.load();
      const snapshot = await read;
      if (disposed || run !== generation) return;
      if (snapshot) freshRequired = false;
      const notice = snapshot && trialConsentNotice({ ...snapshot, locale: deps.locale, now: now(), memory: deps.readMemory(), earlyVisiblePeriod });
      publish(notice && snapshot ? { ...notice, text: trialConsentCopy(notice, trialConsentPrice(snapshot.customerInfo, snapshot.products)) } : null);
    } catch { if (!disposed && run === generation) publish(null); }
  }
  return {
    refresh,
    suspend() {
      if (disposed || suspended) return;
      suspended = true;
      ++generation;
      freshRequired = true;
      freshRead = null;
      publish(null);
    },
    resume() {
      if (disposed) return Promise.resolve();
      awaitingResume = false;
      suspended = false;
      return refresh(true);
    },
    /** Called only once the card intersects the visible dashboard. */
    shown() {
      if (!view || disposed) return;
      const key = `${view.period}:${view.reason}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (view.reason === 'early') {
        earlyVisiblePeriod = view.period;
        deps.saveMemory({ ...deps.readMemory(), earlySeenPeriod: view.period });
      }
      deps.track('trial_notice_show');
    },
    manage() {
      if (!view || disposed || view.expiresAt <= now()) return null;
      deps.track('trial_notice_manage');
      const store = view.store;
      ++generation;
      awaitingResume = true;
      freshRequired = true;
      freshRead = null;
      publish(null);
      return store;
    },
    snooze() {
      if (!view || disposed) return;
      ++generation;
      deps.saveMemory({ ...deps.readMemory(), snoozedUntil: now() + TRIAL_CONSENT_SNOOZE_MS });
      seen.clear();
      earlyVisiblePeriod = null;
      publish(null);
      deps.track('trial_notice_snooze');
    },
    dispose() { disposed = true; ++generation; },
  };
}
