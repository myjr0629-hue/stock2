'use client';

// ============================================================================
// 첫 실행이 끝난 직후 1회 «7일 무료 체험» 페이월 — 판정은 lib/app/firstRunPaywall(순수), 화면은 기존 ProPaywall 그대로.
// AppFirstRunOnboarding 이 첫 실행을 마친 순간에만 동적으로 불러온다(이미 마친 기기는 이 모듈을 받지 않는다).
// 조건이 하나라도 아니면 아무것도 그리지 않고 onDone — 앱 진입은 예전과 같다.
// ★11/20 도달 수리(lib/app/firstRunPaywall 머리말 ★11/20):
//   · 예전 상한(8초) 안에 정해지면 예전과 똑같이 바로 보인다(겹침 검사 없음 — 첫 실행 오버레이가 막 닫힌 자리).
//   · «모름»(iOS 자격 조회 지연·오퍼링 0·스토어 재조회 실패)은 첫 세션 30초 안에서 다시 묻고, 늦게 보일 땐 다른 시트·게이트 흐름·
//     다른 페이월이 없고 앱이 앞에 있고 앱 화면일 때만 보인다. 판정 시작·결론을 실행당 한 번 센다(fr_judge).
//   · 떠 있는 동안 네이티브 배너를 내린다 — 아래 «구매 복원·이용약관·개인정보» 줄(애플 3.1.2)이 배너에 가리지 않게(TrialAnnounceGate·GatePaywall 과 같다).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useProStatus } from '@/hooks/useProStatus';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { storeProSignal } from '@/lib/app/gatePaywall';
import { fetchProStatus, rawProOffers, withTrialsStatus, type PlanOffer } from '@/services/revenueCat';
import {
  markFirstRunPaywallShown, readFirstRunPaywallShown, runFirstRunLoop, type FirstRunSkip, type MiniStore,
} from '@/lib/app/firstRunPaywall';
import { PAYWALL_OPEN_KEY, gateFlowActive, trialAnnounceRouteOk } from '@/lib/app/trialAnnounce';
import { claimOnbShow } from '@/lib/app/onboardingConfig';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { ProPaywall } from './ProPaywall';

const store = (): MiniStore | null => { try { return window.localStorage; } catch { return null; } };
const session = (): Storage | null => { try { return window.sessionStorage; } catch { return null; } };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const platformNow = (): string => {
  try { return (globalThis as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() || ''; } catch { return ''; }
};
const dialogOpen = () => { try { return !!document.querySelector('[aria-modal="true"]'); } catch { return true; } };

/** 계측(실행당 한 번씩 — 언어 이동 재마운트에도 같은 세션이면 다시 안 센다 · 하루 합계 · 식별자 없음) */
function countOnce(src: 'fr_try' | 'fr_late' | FirstRunSkip, guard: string) {
  if (claimOnbShow(guard, session())) trackFunnel('fr_judge', { src });
}

type Snap = {
  isPro: boolean; ready: boolean; trialsReady: boolean; iapAvailable: boolean; offers: PlanOffer[];
};

export function FirstRunTrialPaywall({ locale, onDone }: { locale: string; onDone: () => void }) {
  const { isPro, ready, offers, iapAvailable, trialsReady } = useProStatus();
  const [show, setShow] = useState<PlanOffer[] | null>(null);
  // 최신 훅 값 — 판정 고리(비동기)가 매번 지금 값을 읽는다
  const snap = useRef<Snap>({ isPro, ready, trialsReady, iapAvailable, offers });
  snap.current = { isPro, ready, trialsReady, iapAvailable, offers };
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const decided = useRef(false);

  const finish = () => { if (!decided.current) { decided.current = true; doneRef.current(); } };

  useEffect(() => {
    let alive = true;
    countOnce('fr_try', 'fr_try');
    void runFirstRunLoop<PlanOffer>({
      now: () => Date.now(),
      sleep,
      alive: () => alive && !decided.current,
      snap: () => snap.current,
      pending: () => proPurchaseState.getSnapshot(),
      sharedPro: () => storeProSignal.latest() === true,
      shown: () => readFirstRunPaywallShown(store()),
      platform: platformNow(),
      rawOffers: rawProOffers,
      trials: withTrialsStatus,
      fetchPro: fetchProStatus,
      lateEnv: () => ({ dialogOpen: dialogOpen(), gateFlow: gateFlowActive(), visible: document.visibilityState === 'visible', routeOk: trialAnnounceRouteOk(window.location.pathname) }),
      openedAt: readOpenedAt,
      mark: () => markFirstRunPaywallShown(store()),
    }).then((r) => {
      if (!alive || decided.current || r.kind === 'gone') return;   // 판정 중 해제(화면 이동) — 결론을 세지 않는다
      if (r.kind === 'skip') { countOnce(r.reason, 'fr_out'); finish(); return; }
      if (r.late) countOnce('fr_late', 'fr_late');
      setShow(r.offers);   // 닫을 때 finish(onDone) · 열림은 ProPaywall 이 open/first_run 으로 센다
    }).catch(() => { if (alive) finish(); });
    return () => { alive = false; };
    // 마운트당 한 번 — 최신 훅 값은 snap 으로 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!show) return null;
  return <FirstRunPaywallSheet locale={locale} offers={show} onClose={() => { setShow(null); finish(); }} />;
}

function readOpenedAt(): string | null {
  try { return window.localStorage.getItem(PAYWALL_OPEN_KEY); } catch { return null; }
}

/** 떠 있는 동안 네이티브 배너를 내린다(TrialAnnounceGate AnnouncePaywall 과 같은 방식) — 화면(DOM)은 ProPaywall 그대로 */
function FirstRunPaywallSheet({ locale, offers, onClose }: { locale: string; offers: PlanOffer[]; onClose: () => void }) {
  useBannerSuppression(true);
  return (
    <ProPaywall
      locale={locale}
      src="first_run"
      trialHead
      offers={offers}
      onClose={onClose}
    />
  );
}
