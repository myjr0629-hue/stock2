'use client';

// ============================================================================
// 첫 실행이 끝난 직후 1회 «7일 무료 체험» 페이월 — 판정은 lib/app/firstRunPaywall(순수), 화면은 기존 ProPaywall 그대로.
// AppFirstRunOnboarding 이 첫 실행을 마친 순간에만 동적으로 불러온다(이미 마친 기기는 이 모듈을 받지 않는다).
// 조건이 하나라도 아니면 아무것도 그리지 않고 onDone — 앱 진입은 예전과 같다.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useProStatus } from '@/hooks/useProStatus';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { storeProSignal } from '@/lib/app/gatePaywall';
import { fetchProStatus } from '@/services/revenueCat';
import {
  FIRST_RUN_PAYWALL_WAIT_MS, firstRunPaywallStep, markFirstRunPaywallShown, readFirstRunPaywallShown, type MiniStore,
} from '@/lib/app/firstRunPaywall';
import { ProPaywall } from './ProPaywall';

const store = (): MiniStore | null => { try { return window.localStorage; } catch { return null; } };

export function FirstRunTrialPaywall({ locale, onDone }: { locale: string; onDone: () => void }) {
  const { isPro, ready, offers, iapAvailable, trialsReady } = useProStatus();
  const [show, setShow] = useState(false);
  const shownRef = useRef(false);
  const decided = useRef(false);
  const checking = useRef(false);
  // 해제됐나(문서 화면 이동 등) — 해제 뒤 끝난 조회는 기록·표시하지 않는다(관문 11161302)
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const finish = () => { if (!decided.current) { decided.current = true; doneRef.current(); } };

  // 상한 — PRO 상태·오퍼링을 끝내 못 받으면 조용히 건너뛴다
  useEffect(() => {
    const id = window.setTimeout(() => { if (!shownRef.current && !checking.current) finish(); }, FIRST_RUN_PAYWALL_WAIT_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (decided.current || show || checking.current) return;
    const step = firstRunPaywallStep({
      iapAvailable, ready: ready && trialsReady, isPro, pending: proPurchaseState.getSnapshot(), sharedPro: storeProSignal.latest() === true,
      offers, shown: readFirstRunPaywallShown(store()),
    });
    // 오퍼링이 PRO 상태보다 늦게 올 수 있다 — ready 뒤 체험 플랜이 아직 없으면 상한까지 기다린다(그 사이 오면 다시 판정)
    if (step === 'wait' || (step === 'skip' && ready && iapAvailable && !isPro && !offers.length)) return;
    if (step === 'skip') { finish(); return; }
    // 'check' — 스토어에서 «지금 무료»를 한 번 더 확인(코드 PRO 조회 지연·막 결제한 사람 보호). 실패·시간 초과 = 안 보인다
    checking.current = true;
    void (async () => {
      let free = false;
      try {
        const pro = await Promise.race([fetchProStatus(), new Promise<boolean>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3_000))]);
        free = !pro;
      } catch { free = false; }
      checking.current = false;
      if (decided.current || !alive.current) return;
      if (!free || proPurchaseState.getSnapshot() || storeProSignal.latest() === true) { finish(); return; }
      if (!markFirstRunPaywallShown(store())) { finish(); return; }
      shownRef.current = true;
      setShow(true);
    })();
  }, [iapAvailable, ready, trialsReady, isPro, offers, show]);

  if (!show) return null;
  return (
    <ProPaywall
      locale={locale}
      src="first_run"
      trialHead
      offers={offers}
      onClose={() => { setShow(false); finish(); }}
    />
  );
}
