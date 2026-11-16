'use client';

// ============================================================================
// TrialAnnounceGate — «새로 생긴 PRO 7일 무료 체험» 1회 안내 판정기 (TrialAnnounceHost 가 가벼운 문을 통과한 기기에서만 불러온다)
// ----------------------------------------------------------------------------
// 앱이 앞으로 올 때(실행·복귀)마다 lib/app/trialAnnounce trialAnnounceStep 으로 본다. 'check' 면 잠깐 기다린 뒤(다른 시트가 먼저 자리를 잡게)
// 새 고객 정보로 «PRO 아님 + 구매·체험 이력 0»을 한 번 더 확인하고, 표식을 남긴 다음 오늘 만든 체험 페이월(ProPaywall trialHead · 출처 trial_announce)을 띄운다.
// 닫으면 끝(다시 안 뜬다). 가격·버튼·고지문은 페이월 그대로.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useProStatus } from '@/hooks/useProStatus';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { localDay, markGateDay, storeProSignal } from '@/lib/app/gatePaywall';
import { initRevenueCat, isProFromCustomerInfo } from '@/services/revenueCat';
import {
  TRIAL_ANNOUNCE_DELAY_MS, TRIAL_ANNOUNCE_VERIFY_MS, markTrialAnnounced, noPurchaseHistory, otherSheetToday, readTrialAnnounced,
  trialAnnounceRouteOk, trialAnnounceStep, FIRST_RUN_SHOWN_KEY, type MiniStore,
} from '@/lib/app/trialAnnounce';
import { ProPaywall } from './ProPaywall';

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}
const dialogOpen = () => !!document.querySelector('[aria-modal="true"]');
function seenAny(store: MiniStore | null): boolean {
  if (readTrialAnnounced(store)) return true;
  try { return store!.getItem(FIRST_RUN_SHOWN_KEY) !== null; } catch { return true; }
}

/** 새 고객 정보 — 실패·시간 초과 = null(안 보인다) */
async function freshInfo(): Promise<Parameters<typeof isProFromCustomerInfo>[0] | null> {
  try {
    if (!(await initRevenueCat())) return null;
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const r = await Promise.race([
      Purchases.getCustomerInfo(),
      new Promise<null>((res) => setTimeout(() => res(null), TRIAL_ANNOUNCE_VERIFY_MS)),
    ]);
    return r ? r.customerInfo : null;
  } catch { return null; }
}

// 이번 웹뷰 실행에서 이미 끝났나(띄웠거나 대상 아님) — 레이아웃이 다시 마운트돼도 다시 묻지 않는다
const run = { done: false };

export function TrialAnnounceGate() {
  const { isPro, ready, offers, iapAvailable, trialsReady } = useProStatus();
  const pathname = usePathname() || '';
  const [show, setShow] = useState<string | null>(null);
  /** 포그라운드 회차 — 앱이 앞으로 올 때마다 +1(그때 다시 판정) */
  const [fg, setFg] = useState(0);
  const checking = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    const bump = () => { if (document.visibilityState === 'visible') setFg((n) => n + 1); };
    document.addEventListener('visibilitychange', bump);
    document.addEventListener('app:resume', bump);
    return () => { document.removeEventListener('visibilitychange', bump); document.removeEventListener('app:resume', bump); };
  }, []);

  useEffect(() => {
    if (run.done || show || checking.current) return;
    const store = localStore();
    const state = () => ({
      iapAvailable, ready: ready && trialsReady, isPro, sharedPro: storeProSignal.latest() === true, pending: proPurchaseState.getSnapshot(), offers,
      seen: seenAny(store), routeOk: trialAnnounceRouteOk(window.location.pathname), otherToday: otherSheetToday(store),
      dialogOpen: dialogOpen(), visible: document.visibilityState === 'visible',
    });
    const step = trialAnnounceStep(state());
    if (step === 'stop') { run.done = true; return; }
    if (step !== 'check') return; // wait·later — 상태가 바뀌거나 다음 포그라운드에 다시
    checking.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        // 기다리는 사이 다른 시트가 떴거나·화면을 옮겼거나·뒤로 갔으면 이번 회차는 넘긴다
        const again = trialAnnounceStep(state());
        if (again !== 'check') { checking.current = false; if (again === 'stop') run.done = true; return; }
        const info = await freshInfo();
        checking.current = false;
        if (!alive.current || run.done) return;
        // 지금 PRO·이력 있음·모름 = 이번 실행 끝(다음 실행에 다시 보지만 이력은 남으므로 계속 안 뜬다)
        if (!info || isProFromCustomerInfo(info) || !noPurchaseHistory(info as Parameters<typeof noPurchaseHistory>[0])) { run.done = true; return; }
        const last = trialAnnounceStep(state());
        if (last !== 'check') { if (last === 'stop') run.done = true; return; }
        if (!markTrialAnnounced(store)) { run.done = true; return; }
        run.done = true;
        // 오늘 게이트 «하루 첫 탭» 페이월(gate_first)은 쉬게 한다 — 같은 날 페이월을 두 번 들이밀지 않는다(게이트 자신의 하루 표식 · 내일 다시)
        markGateDay(localDay());
        setShow(window.location.pathname.split('/')[1] || 'en');
      })();
    }, TRIAL_ANNOUNCE_DELAY_MS);
    return () => { window.clearTimeout(timer); checking.current = false; };
  }, [iapAvailable, ready, trialsReady, isPro, offers, show, fg, pathname]);

  if (!show) return null;
  return <AnnouncePaywall locale={show} offers={offers} onClose={() => setShow(null)} />;
}

/** 떠 있는 동안 네이티브 배너를 내린다 — 아래 «구매 복원·이용약관·개인정보» 줄(애플 3.1.2)이 배너에 가리지 않게(ValueWall GatePaywall 과 같은 방식) */
function AnnouncePaywall({ locale, offers, onClose }: { locale: string; offers: ReturnType<typeof useProStatus>['offers']; onClose: () => void }) {
  useBannerSuppression(true);
  return <ProPaywall locale={locale} src="trial_announce" trialHead trialAnnounce offers={offers} onClose={onClose} />;
}
