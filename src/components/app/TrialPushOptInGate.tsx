'use client';

// ============================================================================
// TrialPushOptInGate — 체험자 알림 권한 다시 묻기 판정기 (TrialPushOptInHost 가 가벼운 문을 통과한 기기에서만 불러온다)
// ----------------------------------------------------------------------------
// 두 층:
//   ① 자격 읽기(SDK) — OS 권한(읽기만)이 'prompt' 이고 새 고객 정보가 «검증된 활성 TRIAL» 인가. 실행·복귀·체험 시작·첫 AI 줄 때 다시 읽는다(30초 묶음).
//      권한이 정해졌으면(허용·거절) 이번 실행은 끝 · 체험이 아니면 박자를 세우지 않는다(다음 읽기 때 다시).
//   ② 박자(화면만) — ①이 참인 동안, 앱이 앞에 있을 때 1.5초마다 lib/app/trialPushOptIn tickStep 으로 본다(네트워크 없음).
//      첫 가치 순간(실제 AI 줄이 지금 화면에 보임)이 우선, 아니면 «다음 날» 경로. 같은 트리거 'show' 2박자 연속 → 권한을 다시 읽고
//      «그 직후의 화면 상태로» 한 번 더 'show' 일 때만 기록(다시 읽어 확인) → 시트. 아니면 박자를 계속한다(회차가 끝나 버리는 길 없음).
// ============================================================================

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { gateFlowActive } from '@/lib/app/trialAnnounce';
import { isNativeShell } from '@/lib/app/onboardingConfig';
import { readStoredPushPrefs } from '@/lib/push/prefs';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { PRO_ACTIVATED_EVENT } from '@/lib/app/ratingMoments';
import { checkPushPerm } from '@/lib/native/pushPerm';
import { freshCustomerInfo } from '@/lib/native/rcFresh';
import {
  ONBOARDED_KEY, READ_RETRY_MAX, READ_RETRY_MS, REFRESH_MIN_MS, SHOW_STREAK, TICK_MS, TRIAL_VALUE_EVENT, VERIFY_MS,
  aiLineVisible, claimShown, inProQuiet, nextStreak, prefsOff, readShown, routeOk, tickStep, trialFromInfo, trialPushStep, trialValueSeen, triggerSrc,
  type MiniStore, type PermState, type TrialInfo, type TrialPushSrc, type Trigger,
} from '@/lib/app/trialPushOptIn';

const TrialPushOptInSheet = dynamic(() => import('./TrialPushOptInSheet').then((m) => m.TrialPushOptInSheet), { ssr: false, loading: () => null });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}

// 이번 웹뷰 실행에서 끝났나(띄웠거나 권한이 정해짐) — 레이아웃이 다시 마운트돼도 하나만
const run = { done: false };

type Shown = { src: TrialPushSrc; loc: string; trial: TrialInfo };

export function TrialPushOptInGate() {
  const [show, setShow] = useState<Shown | null>(null);

  useEffect(() => {
    let alive = true;
    const store = localStore();
    /** ①의 결과 — 둘 다 참일 때만 박자가 돈다 */
    let perm: PermState = 'unknown';
    let trial: TrialInfo | null = null;
    let readAt = 0;
    let reading = false;
    let rereadAfter = false;
    let tickT = 0;
    let streak: { n: number; trigger: Trigger | null } = { n: 0, trigger: null };
    let finalizing = false;
    let retryT = 0;
    let retries = 0;

    const snapshot = (p: PermState) => {
      let onboarded = false;
      try { onboarded = store?.getItem(ONBOARDED_KEY) === 'accepted'; } catch { onboarded = false; }
      const now = Date.now();
      return {
        native: isNativeShell(), shown: readShown(store), prefsOff: prefsOff(readStoredPushPrefs()), perm: p, trial, now, onboarded,
        dialogOpen: !!document.querySelector('[aria-modal="true"]'), purchasePending: proPurchaseState.getSnapshot(), gateFlow: gateFlowActive(),
        visible: document.visibilityState === 'visible', routeOk: routeOk(window.location.pathname), proQuiet: inProQuiet(store, now),
        aiVisible: aiLineVisible(document, window.innerHeight),
      };
    };
    const stopTick = () => { if (tickT) { window.clearInterval(tickT); tickT = 0; } streak = { n: 0, trigger: null }; };
    const finish = () => { run.done = true; stopTick(); };

    const tick = async () => {
      // 자격을 다시 읽는 중이면 옛 체험 정보로 박자를 채우지 않는다(관문 4차)
      if (!alive || run.done || finalizing || reading || !trial) return;
      if (document.visibilityState !== 'visible') { streak = { n: 0, trigger: null }; return; }
      const cur = tickStep(snapshot(perm), trialValueSeen());
      if (cur.step === 'stop') { finish(); return; }
      if (cur.step === 'skip') { stopTick(); return; } // 체험·권한·설정·날짜 조건이 아직 아니다 — 다음 읽기(복귀·AI 줄·체험 시작) 때 다시
      streak = nextStreak(streak, cur);
      if (streak.n < SHOW_STREAK) return;
      // 보이기 직전 — 권한을 다시 읽고, 읽은 «뒤»의 화면 상태와 같은 트리거로 한 번 더(사이에 바뀌었으면 박자를 이어 간다)
      finalizing = true;
      try {
        const p2 = await checkPushPerm();
        if (!alive || run.done) return;
        perm = p2;
        if (reading || !trial) { streak = { n: 0, trigger: null }; return; }
        // 트리거도 다시 고른다 — 기다리는 사이 AI 줄이 보였으면 AI 로(출처 우선순위 · 관문 4차)
        const last = tickStep(snapshot(p2), trialValueSeen());
        if (last.step === 'stop') { finish(); return; }
        if (last.step !== 'show') { streak = { n: 0, trigger: null }; return; }
        // 기록 실패(저장소 막힘·이미 있음) = 안 보인다
        if (!claimShown(store)) { finish(); return; }
        const shownTrial = trial;
        finish();
        const src = triggerSrc(last.trigger);
        trackFunnel('trial_push_shown', { src });
        setShow({ src, loc: window.location.pathname.split('/')[1] || 'en', trial: shownTrial });
      } catch { /* 읽기 실패 = 이번 박자는 넘김 */ } finally { finalizing = false; }
    };
    const startTick = () => { if (!tickT && alive && !run.done) tickT = window.setInterval(() => { void tick(); }, TICK_MS); };

    /** ① 자격 읽기 — force 가 아니면 30초 안에 다시 읽지 않는다(박자는 다시 세운다). 읽는 중에 또 오면 끝난 뒤 한 번 더 */
    const read = async (force = false) => {
      if (!alive || run.done) return;
      if (reading) { rereadAfter = true; return; }
      if (!force && readAt && Date.now() - readAt < REFRESH_MIN_MS) { if (trial && perm === 'prompt') startTick(); return; }
      reading = true;
      try {
        const p = await checkPushPerm();
        if (!alive) return;
        perm = p;
        // 체험을 모르는 채로 «멈출 것인가»만 먼저(웹·이미 봄·권한 정해짐 = 끝 · 권한 모름·설정 OFF = 이번엔 넘김)
        const first = trialPushStep({ ...snapshot(p), trial: { expiresAt: Infinity, startedAt: null }, trigger: 'ai' });
        if (first === 'stop') { finish(); return; }
        if (first === 'skip') { trial = null; readAt = Date.now(); stopTick(); return; }
        const info = await freshCustomerInfo(VERIFY_MS);
        if (!alive) return;
        streak = { n: 0, trigger: null };
        if (info == null) {
          // 조회 실패·시간 초과 = 모름 — 박자를 멈추고, 30초 묶음에 넣지 않으며(다음 트리거는 곧바로 다시 읽는다) 10초 뒤 최대 3번 다시(관문 4차)
          trial = null; stopTick();
          if (retries < READ_RETRY_MAX && !retryT) { retries += 1; retryT = window.setTimeout(() => { retryT = 0; void read(true); }, READ_RETRY_MS); }
          return;
        }
        retries = 0;
        trial = trialFromInfo(info as Parameters<typeof trialFromInfo>[0], Date.now());
        readAt = Date.now();
        if (trial) startTick(); else stopTick();
      } catch { /* 읽기 실패 = 안 보인다 */ } finally {
        reading = false;
        if (rereadAfter && alive && !run.done) { rereadAfter = false; void read(true); }
      }
    };

    // 첫 AI 줄 · 앱 복귀 = 다시 보기(30초 묶음) · 체험 시작 직후 = 바로 다시 읽기
    const onValue = () => { void read(); };
    const onPro = () => { void read(true); };
    const onFg = () => { if (document.visibilityState === 'visible') void read(); };
    window.addEventListener(TRIAL_VALUE_EVENT, onValue);
    window.addEventListener(PRO_ACTIVATED_EVENT, onPro);
    document.addEventListener('visibilitychange', onFg);
    document.addEventListener('app:resume', onFg);
    void read(true);
    return () => {
      alive = false;
      stopTick();
      if (retryT) window.clearTimeout(retryT);
      window.removeEventListener(TRIAL_VALUE_EVENT, onValue);
      window.removeEventListener(PRO_ACTIVATED_EVENT, onPro);
      document.removeEventListener('visibilitychange', onFg);
      document.removeEventListener('app:resume', onFg);
    };
  }, []);

  if (!show) return null;
  return <TrialPushOptInSheet loc={show.loc} src={show.src} trial={show.trial} onClose={() => setShow(null)} />;
}
