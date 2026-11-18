'use client';

// ============================================================================
// TrialPushOptInGate — 체험자 알림 권한 다시 묻기 판정기 (TrialPushOptInHost 가 가벼운 문을 통과한 기기에서만 불러온다)
// ----------------------------------------------------------------------------
// 트리거: ① 내 종목이 실제 AI 한 줄을 그렸다(TRIAL_VALUE_EVENT — 판정기가 늦게 실려도 trialValueSeen 으로 잡는다 · 줄이 보인 뒤 체험을 시작하면 PRO_ACTIVATED_EVENT 로 다시)
//         ② 앱 실행·복귀(체험 시작 다음 날 이후만 — lib/app/trialPushOptIn nextDayDue)
// 회차마다: OS 권한(읽기만) 'prompt' → 새 고객 정보로 검증된 체험 → 잠깐 기다린 뒤(다른 시트가 먼저 자리 잡게) 막힌 동안 2초마다 다시(약 1분)
//   → 보이기 직전 권한을 다시 읽고 → 기록(다시 읽어 확인)이 성공할 때만 시트. 권한이 정해졌거나 이미 봤으면 이번 실행은 끝.
// ============================================================================

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { gateFlowActive } from '@/lib/app/trialAnnounce';
import { isNativeShell } from '@/lib/app/onboardingConfig';
import { readStoredPushPrefs } from '@/lib/push/prefs';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { freshCustomerInfo } from '@/lib/native/rcFresh';
import { PRO_ACTIVATED_EVENT } from '@/lib/app/ratingMoments';
import { checkPushPerm } from '@/lib/native/pushPerm';
import {
  ONBOARDED_KEY, RETRY_MAX, RETRY_MS, SETTLE_MS, TRIAL_VALUE_EVENT, VERIFY_MS,
  aiLineVisible, claimShown, inProQuiet, prefsOff, readShown, routeOk, trialFromInfo, trialPushStep, trialValueSeen, triggerSrc,
  type MiniStore, type PermState, type TrialInfo, type TrialPushSrc, type Trigger,
} from '@/lib/app/trialPushOptIn';

const TrialPushOptInSheet = dynamic(() => import('./TrialPushOptInSheet').then((m) => m.TrialPushOptInSheet), { ssr: false, loading: () => null });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

// 이번 웹뷰 실행에서 끝났나(띄웠거나 권한이 정해짐) · 회차가 도는 중인가 — 레이아웃이 다시 마운트돼도 하나만
//   도는 동안 들어온 트리거는 버리지 않고 하나씩 남겨 두었다가 끝나면 이어서 본다(다음 날 판정 중 AI 한 줄이 그려진 경우 — 관문 1차)
const run = { done: false, busy: false, queued: null as Trigger | null };

type Shown = { src: TrialPushSrc; loc: string; trial: TrialInfo };

export function TrialPushOptInGate() {
  const [show, setShow] = useState<Shown | null>(null);

  useEffect(() => {
    let alive = true;
    const store = localStore();
    const snapshot = (perm: PermState, trial: TrialInfo | null, trigger: Trigger) => {
      let onboarded = false;
      try { onboarded = store?.getItem(ONBOARDED_KEY) === 'accepted'; } catch { onboarded = false; }
      const now = Date.now();
      return {
        native: isNativeShell(), shown: readShown(store), prefsOff: prefsOff(readStoredPushPrefs()), perm, trial, trigger, now, onboarded,
        dialogOpen: !!document.querySelector('[aria-modal="true"]'), purchasePending: proPurchaseState.getSnapshot(), gateFlow: gateFlowActive(),
        visible: document.visibilityState === 'visible', routeOk: routeOk(window.location.pathname), proQuiet: inProQuiet(store, now),
        aiVisible: aiLineVisible(document, window.innerHeight),
      };
    };

    const evaluate = async (trigger: Trigger): Promise<void> => {
      if (run.done) return;
      // AI 트리거가 다음 날 트리거보다 우선(다음 날은 AI 가 없을 때의 대체 경로)
      if (run.busy) { if (run.queued !== 'ai') run.queued = trigger; return; }
      run.busy = true;
      try {
        // 싸게 먼저: 권한(읽기만) → 고객 정보. 'stop'·'skip' 은 여기서 끝난다
        const perm = await checkPushPerm();
        if (!alive) return;
        const first = trialPushStep(snapshot(perm, { expiresAt: Infinity, startedAt: null }, 'ai'));
        if (first === 'stop') { run.done = true; return; }
        if (first === 'skip') return;
        const trial = trialFromInfo(await freshCustomerInfo(VERIFY_MS) as Parameters<typeof trialFromInfo>[0], Date.now());
        if (!alive || !trial) return;
        let wait: number = SETTLE_MS[trigger];
        for (let i = 0; i <= RETRY_MAX; i++) {
          await sleep(wait);
          wait = RETRY_MS;
          if (!alive || run.done) return;
          const step = trialPushStep(snapshot(perm, trial, trigger));
          if (step === 'stop') { run.done = true; return; }
          if (step === 'skip') return;
          if (step === 'later') continue;
          // 보이기 직전 — 권한을 다시 읽고 그 값으로 한 번 더
          const perm2 = await checkPushPerm();
          if (!alive) return;
          const last = trialPushStep(snapshot(perm2, trial, trigger));
          if (last === 'stop') { run.done = true; return; }
          if (last !== 'show') return;
          // 기록 실패(저장소 막힘·이미 있음) = 안 보인다
          if (!claimShown(store)) { run.done = true; return; }
          run.done = true;
          const src = triggerSrc(trigger);
          trackFunnel('trial_push_shown', { src });
          setShow({ src, loc: window.location.pathname.split('/')[1] || 'en', trial });
          return;
        }
      } catch { /* 판정 실패 = 안 보인다 */ } finally {
        run.busy = false;
        const next = run.queued;
        run.queued = null;
        if (next && alive && !run.done) void evaluate(next);
      }
    };

    const onValue = () => { void evaluate('ai'); };
    // 같은 화면에서 체험을 막 시작했다(AI 한 줄은 그 전부터 보였다 — 줄이 다시 그려지지 않아도) → 이미 본 가치 순간으로 다시 판정
    const onPro = () => { if (trialValueSeen()) void evaluate('ai'); };
    const onFg = () => { if (document.visibilityState === 'visible') void evaluate('day1'); };
    window.addEventListener(TRIAL_VALUE_EVENT, onValue);
    window.addEventListener(PRO_ACTIVATED_EVENT, onPro);
    document.addEventListener('visibilitychange', onFg);
    document.addEventListener('app:resume', onFg);
    // 실행 = 이 판정기가 처음 실린 때 — 이미 AI 한 줄을 그렸으면 그 순간으로, 아니면 «다음 날» 경로로
    void evaluate(trialValueSeen() ? 'ai' : 'day1');
    return () => {
      alive = false;
      window.removeEventListener(TRIAL_VALUE_EVENT, onValue);
      window.removeEventListener(PRO_ACTIVATED_EVENT, onPro);
      document.removeEventListener('visibilitychange', onFg);
      document.removeEventListener('app:resume', onFg);
    };
  }, []);

  if (!show) return null;
  return <TrialPushOptInSheet loc={show.loc} src={show.src} trial={show.trial} onClose={() => setShow(null)} />;
}
