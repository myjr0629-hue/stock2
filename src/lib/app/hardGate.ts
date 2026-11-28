import { LEGAL_SEEN_KEY } from './legalDiag';
import { FIRST_RUN_SHOWN_KEY, ONBOARDED_KEY, type MiniStore } from './trialAnnounce';
import { fetchResponseWithDeadline } from './requestDeadline';

export const HARD_GATE_KEY = 'signumhq.app.hardGate.v1';
export const HARD_GATE_WAIT_MS = 8000;

// 배포 뒤 시작한 설치는 스위치와 무관하게 한 번 표시한다. 이전에 법적 고지만 본 설치도 보호한다.
export function hardGateCohort(store: MiniStore | null, starting: boolean): 'new' | 'marked' | 'existing' {
  try {
    if (store?.getItem(HARD_GATE_KEY) === '1') return 'marked';
    if (!store || !starting || store.getItem(ONBOARDED_KEY) === 'accepted' ||
        store.getItem(FIRST_RUN_SHOWN_KEY) !== null || store.getItem(LEGAL_SEEN_KEY) !== null) return 'existing';
    store.setItem(HARD_GATE_KEY, '1');
    return store.getItem(HARD_GATE_KEY) === '1' ? 'new' : 'existing';
  } catch { return 'existing'; }
}

let switchRead: Promise<boolean> | undefined;
export function hardGateSwitch(): Promise<boolean> {
  return switchRead ??= fetchResponseWithDeadline('/api/app/hard-gate', 2000, { cache: 'no-store' })
    .then(async r => r.ok && (await r.json())?.on === true)
    .catch(() => false);
}

export type HardGateFacts = {
  marked: boolean; on: boolean; platform: string; iapAvailable: boolean;
  pro: boolean | null; sharedPro: boolean; pending: boolean; offers: number; elapsed: number;
};

export function hardGateDecision(f: HardGateFacts) {
  if (!f.marked || !f.on || (f.platform !== 'ios' && f.platform !== 'android')) return 'off';
  if (f.pro || f.sharedPro || f.pending) return 'entitled';
  if (f.elapsed >= HARD_GATE_WAIT_MS) return 'hg_timeout';
  if (!f.iapAvailable) return 'hg_noiap';
  if (f.pro !== false) return 'hg_status';
  if (f.offers === 0) return 'hg_nooffer';
  return 'gate';
}
