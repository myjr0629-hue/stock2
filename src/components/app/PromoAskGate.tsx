'use client';

// ============================================================================
// PromoAskGate — 혜택·할인 알림 동의 한 번 묻기 판정기 (PromoAskHost 가 가벼운 문을 통과한 기기에서만 불러온다)
// ----------------------------------------------------------------------------
// 규칙·문구·기록은 lib/app/promoAsk 머리말. 여기는 박자만:
//   앱이 앞에 있는 동안 1.5초마다 화면 상태(시트·결제·게이트·광고·평점·경로·앞으로 온 뒤 시간·조용한 시간·페이월 뒤 시간)를 보고,
//   OS 권한(읽기만, 30초 묶음)이 'granted' 이고 조건이 맞으면 유료 여부를 RC 새 고객 정보로 한 번 읽는다(실패 = 이번 실행은 안 보인다).
//   'show' 2박자 연속 → 기록(다시 읽어 확인) → 시트. 답하면 끝 · [받기]면 동의 일자 토스트.
// ============================================================================

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { gateFlowActive, PAYWALL_OPEN_KEY } from '@/lib/app/trialAnnounce';
import { gatePaywallSlot } from '@/lib/app/gatePaywall';
import { isNativeShell } from '@/lib/app/onboardingConfig';
import { ONBOARDED_KEY, inProQuiet } from '@/lib/app/trialPushOptIn';
import { reviewBusyAt } from '@/lib/app/dailyPaywall';
import { reviewBlockReason, reviewRequestedAt } from '@/hooks/useReviewPrompt';
import { readStoredPushPrefs } from '@/lib/push/prefs';
import { promoToast, toPromoLoc } from '@/lib/push/promoConsent';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { checkPushPerm } from '@/lib/native/pushPerm';
import { freshCustomerInfo } from '@/lib/native/rcFresh';
import {
  PROMO_ASK_STREAK, PROMO_ASK_TICK_MS, PROMO_ASK_VERIFY_MS, PUSH_TOKEN_KEY,
  askDue, askRound, claimAsk, deviceTz, nativePlatformNow, needsAsk, paidPro, pathLoc, promoAskSrc, promoAskStep, promoRouteOk, readAsk,
  type MiniStore, type PromoAskSrc, type PromoAskState,
} from '@/lib/app/promoAsk';
import s from './PromoAskSheet.module.css';

const PromoAskSheet = dynamic(() => import('./PromoAskSheet').then((m) => m.PromoAskSheet), { ssr: false, loading: () => null });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}
const anyDialog = () => { try { return !!document.querySelector('[aria-modal="true"], [data-pro-paywall]'); } catch { return true; } };

// 이번 웹뷰 실행에서 끝났나(띄웠거나 대상 아님) — 레이아웃이 다시 마운트돼도 하나만
const run = { done: false };

export function PromoAskGate() {
  const [show, setShow] = useState<{ loc: string; src: PromoAskSrc } | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (run.done) return;
    let alive = true;
    const store = localStore();
    let fgAt = document.visibilityState === 'visible' ? Date.now() : Infinity;
    let lastDialogAt = 0;
    let perm: PromoAskState['perm'] = 'unknown';
    let permAt = 0;
    let permReading = false;
    let paid: boolean | null = null;
    let infoReading = false;
    let infoTries = 0;
    let streak = 0;
    let tickT = 0;

    const finish = () => { run.done = true; if (tickT) { window.clearInterval(tickT); tickT = 0; } };

    const readPerm = async () => {
      if (permReading) return;
      permReading = true;
      try {
        const p = await checkPushPerm();
        perm = p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : p === 'unknown' ? 'unknown' : 'prompt';
        permAt = Date.now();
      } catch { perm = 'unknown'; } finally { permReading = false; }
    };
    const readInfo = async () => {
      if (infoReading) return;
      infoReading = true;
      infoTries += 1;
      try {
        paid = paidPro(await freshCustomerInfo(PROMO_ASK_VERIFY_MS));
      } catch { paid = null; } finally {
        infoReading = false;
        if (paid === null && infoTries >= 3) finish(); // 끝내 모름 = 이번 실행은 안 보인다
      }
    };

    const snapshot = (): PromoAskState => {
      const now = Date.now();
      const dlg = anyDialog();
      if (dlg) lastDialogAt = now;
      const prefs = readStoredPushPrefs();
      let onboarded = false;
      let hasToken = false;
      let pwAt = 0;
      try { onboarded = store?.getItem(ONBOARDED_KEY) === 'accepted'; } catch { onboarded = false; }
      try { hasToken = !!store?.getItem(PUSH_TOKEN_KEY); } catch { hasToken = false; }
      try { pwAt = Number(store?.getItem(PAYWALL_OPEN_KEY)) || 0; } catch { pwAt = 0; }
      let reviewBusy = true;
      try { reviewBusy = reviewBusyAt(reviewRequestedAt(), now); } catch { reviewBusy = true; }
      let adBusy = true;
      try { const why = reviewBlockReason(now); adBusy = why === 'ad' || why === 'gift' || why === 'err'; } catch { adBusy = true; }
      return {
        native: isNativeShell(),
        due: askDue(readAsk(store), now),
        needs: needsAsk(nativePlatformNow(), pathLoc(), deviceTz(), prefs?.promo),
        appOff: prefs?.enabled === false,
        hasToken,
        perm,
        paid,
        onboarded,
        dialogOpen: dlg,
        purchasePending: proPurchaseState.getSnapshot(),
        gateFlow: gateFlowActive(now) || gatePaywallSlot.busy(),
        adBusy,
        reviewBusy,
        visible: document.visibilityState === 'visible',
        routeOk: promoRouteOk(window.location.pathname),
        proQuiet: inProQuiet(store, now),
        fgFor: now - fgAt,
        quietFor: lastDialogAt ? now - lastDialogAt : Infinity,
        paywallFor: pwAt > 0 && pwAt <= now ? now - pwAt : Infinity,
      };
    };

    const tick = () => {
      if (!alive || run.done) return;
      if (document.visibilityState !== 'visible') { streak = 0; return; }
      if (!permAt || Date.now() - permAt > 30_000) void readPerm();
      const step = promoAskStep(snapshot());
      if (step === 'stop') { finish(); return; }
      if (step === 'need_info') { streak = 0; void readInfo(); return; }
      if (step !== 'show') { streak = 0; return; }
      streak += 1;
      if (streak < PROMO_ASK_STREAK) return;
      const src = promoAskSrc(askRound(readAsk(store)), pathLoc());
      if (!claimAsk(store)) { finish(); return; } // 기록 실패 = 안 보인다
      finish();
      trackFunnel('promo_ask_show', { src });
      setShow({ loc: pathLoc(), src });
    };

    const onFg = () => {
      if (document.visibilityState === 'visible') { fgAt = Date.now(); permAt = 0; streak = 0; }
      else { fgAt = Infinity; }
    };
    document.addEventListener('visibilitychange', onFg);
    document.addEventListener('app:resume', onFg);
    void readPerm();
    tickT = window.setInterval(tick, PROMO_ASK_TICK_MS);
    return () => {
      alive = false;
      if (tickT) { window.clearInterval(tickT); tickT = 0; }
      document.removeEventListener('visibilitychange', onFg);
      document.removeEventListener('app:resume', onFg);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3_500);
    return () => window.clearTimeout(id);
  }, [toast]);

  return (
    <>
      {show ? (
        <PromoAskSheet
          loc={show.loc}
          src={show.src}
          onDone={(ans, saved) => {
            setShow(null);
            if (ans === 'yes' && saved) setToast(promoToast(toPromoLoc(show.loc), true, new Date()));
          }}
        />
      ) : null}
      {toast ? <div className={s.toast} role="status" aria-live="polite" data-promo-toast="">{toast}</div> : null}
    </>
  );
}
