'use client';

// ============================================================================
// DailyPaywallGate — 무료 사용자 «하루 한 번» 앱 열 때 체험 페이월 판정기 (DailyPaywallHost 가 가벼운 문을 통과한 기기에서만 불러온다)
// ----------------------------------------------------------------------------
// 앱이 앞으로 올 때(실행·복귀)마다 lib/app/dailyPaywall dailyStep 으로 본다. 'check' 면 7초 기다린 뒤(다른 시작 시트가 먼저 자리를 잡게)
// 끄기 스위치 → 스토어 재조회(checkStorePro — 11/16 게이트와 같은 PRO 보호 4상태)가 «무료 확인»이면 오늘 표식을 남기고
// 첫 실행과 같은 체험 페이월(ProPaywall trialHead · 출처 daily_open)을 띄운다. 닫으면 그날은 끝. 가격·버튼·고지문은 페이월 그대로.
// 프리뷰 확인 모드: 로컬·*.vercel.app 에서만 `?sgdp=1`(운영 도메인에선 previewFlag 가 항상 false) — 스토어 조회 대신 «무료·체험 7일» 더미로 그린다.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useProStatus } from '@/hooks/useProStatus';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { reviewBlockReason, reviewRequestedAt } from '@/hooks/useReviewPrompt';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { checkStorePro, gatePaywallSlot, localDay, markGateDay, storeProSignal } from '@/lib/app/gatePaywall';
import { gateFlowActive, otherSheetToday, TRIAL_OFF_KEYS } from '@/lib/app/trialAnnounce';
import { trialExpiredNotice } from '@/lib/app/trialExpired';
import { redeemReturnActive } from '@/lib/app/redeem';
import { previewFlag } from '@/lib/app/proEntitlement';
import { initRevenueCat, isProFromCustomerInfo, type PlanOffer } from '@/services/revenueCat';
import {
  DAILY_PAYWALL_CHECK_MS, DAILY_PAYWALL_DELAY_MS, DAILY_PAYWALL_MAX_TRIES, DAILY_PAYWALL_SWITCH_MS,
  dailyDay, dailyOnFor, dailyRouteOk, dailyShownToday, dailyStep, markDailyShown, reviewBusyAt, type DailyPlatform, type MiniStore,
} from '@/lib/app/dailyPaywall';
import { ProPaywall, type PaywallPlan } from './ProPaywall';

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}
const dialogOpen = () => !!document.querySelector('[aria-modal="true"]');
const platformNow = (): DailyPlatform => {
  try {
    const pf = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
    return pf === 'ios' ? 'ios' : pf === 'android' ? 'android' : 'web';
  } catch { return 'web'; }
};
const isPreview = () => { try { return previewFlag('sgdp'); } catch { return false; } };

/** 끄기 스위치 — 실행당 한 번 묻는다. 실패·시간 초과·모양 다름 = 꺼짐(안 보인다) */
let switchAsk: Promise<boolean> | null = null;
function switchOn(platform: DailyPlatform): Promise<boolean> {
  if (!switchAsk) {
    switchAsk = (async () => {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => ctl?.abort(), DAILY_PAYWALL_SWITCH_MS);
      try {
        const r = await fetch('/api/app/daily-paywall', ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' });
        if (!r.ok) return false;
        return dailyOnFor(await r.json(), platform);
      } catch { return false; } finally { clearTimeout(timer); }
    })();
    // 실패(꺼짐)는 이번 실행 동안 그대로 둔다 — 같은 실행에서 다시 묻지 않는다(호출 상한)
  }
  return switchAsk;
}

/** 마지막 스토어 재조회의 고객 정보 — 체험 만료 1회 페이월 차례인지 보는 데만 쓴다 */
let lastInfo: unknown = null;
/** 스토어 «지금 PRO» — SDK 초기화 실패·조회 실패는 던진다(«무료»로 보지 않는다 — PRO 보호) */
async function fetchProStrict(): Promise<boolean> {
  lastInfo = null;
  if (!(await initRevenueCat())) throw new Error('rc_init');
  const { Purchases } = await import('@revenuecat/purchases-capacitor');
  const { customerInfo } = await Purchases.getCustomerInfo();
  lastInfo = customerInfo;
  return isProFromCustomerInfo(customerInfo);
}

/** ★관문 11231807 — 체험 만료 1회 페이월(TrialRenewalOffNotice · 첫 달 할인 카드)이 오늘 차례인가. 차례면 그쪽이 먼저(이번 회차는 넘긴다).
 *  같은 규칙 함수(trialExpiredNotice)·같은 기기 표식으로 본다. 모름(고객 정보 없음)은 «차례 아님» — 그 페이월도 같은 정보 없이는 안 뜬다 */
function expiredPaywallDue(info: unknown, platform: DailyPlatform, store: MiniStore | null): boolean {
  if (!info || platform === 'web') return false;
  const get = (k: string) => { try { return store ? store.getItem(k) : null; } catch { return null; } };
  const [offKey, earlyKey, expiredKey] = TRIAL_OFF_KEYS;
  try {
    return !!trialExpiredNotice(info as Parameters<typeof trialExpiredNotice>[0], platform, Date.now(), get(expiredKey), undefined, { offSeen: get(offKey), early: get(earlyKey) });
  } catch { return false; }
}

// 프리뷰 확인 모드의 더미 플랜(paywall-preview 와 같은 값 · 실제 앱은 스토어 값만)
const PREVIEW_PLANS: Record<string, PaywallPlan[]> = {
  ko: [
    { plan: 'monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW', trialDays: 7 },
    { plan: 'annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW', pricePerMonthString: '₩7,417' },
  ],
  ja: [
    { plan: 'monthly', priceString: '¥1,280', price: 1280, currencyCode: 'JPY', trialDays: 7 },
    { plan: 'annual', priceString: '¥12,000', price: 12000, currencyCode: 'JPY', pricePerMonthString: '¥1,000' },
  ],
  en: [
    { plan: 'monthly', priceString: '$9.99', price: 9.99, currencyCode: 'USD', trialDays: 7 },
    { plan: 'annual', priceString: '$74.99', price: 74.99, currencyCode: 'USD', pricePerMonthString: '$6.25' },
  ],
};

// 이번 웹뷰 실행·이 현지 날짜에서 끝났나(띄웠거나 대상 아님) · 스토어 재조회 «모름» 횟수 — 날짜가 바뀌면(앱이 메모리에 남은 채 다음 날) 다시 본다
const run = { done: false, tries: 0, day: '' };

export function DailyPaywallGate() {
  const { isPro, ready, offers, iapAvailable, trialsReady } = useProStatus();
  const pathname = usePathname() || '';
  const [show, setShow] = useState<string | null>(null);
  /** 포그라운드 회차 — 앱이 앞으로 올 때마다 +1(그때 다시 판정) */
  const [fg, setFg] = useState(0);
  const checking = useRef(false);
  const alive = useRef(true);
  const isProRef = useRef(isPro);
  isProRef.current = isPro;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    const bump = () => { if (document.visibilityState === 'visible') setFg((n) => n + 1); };
    document.addEventListener('visibilitychange', bump);
    document.addEventListener('app:resume', bump);
    return () => { document.removeEventListener('visibilitychange', bump); document.removeEventListener('app:resume', bump); };
  }, []);

  useEffect(() => {
    const today = dailyDay(Date.now());
    if (run.day !== today) { run.day = today; run.done = false; run.tries = 0; switchAsk = null; }
    if (run.done || show || checking.current) return;
    const store = localStore();
    const preview = isPreview();
    const state = () => {
      const now = Date.now();
      let rb = false;
      try { rb = reviewBusyAt(reviewRequestedAt(), now); } catch { rb = true; }
      let adBusy = false;
      try { const why = reviewBlockReason(now); adBusy = why === 'ad' || why === 'gift' || why === 'err'; } catch { adBusy = true; }
      return {
        iapAvailable: preview || iapAvailable,
        ready: preview || (ready && trialsReady),
        isPro: !preview && isPro,
        sharedPro: !preview && storeProSignal.active(),
        pending: proPurchaseState.getSnapshot(),
        offerCount: preview ? 2 : offers.length,
        shownToday: dailyShownToday(store, now),
        routeOk: dailyRouteOk(window.location.pathname),
        otherToday: otherSheetToday(store, now),
        dialogOpen: dialogOpen(),
        visible: document.visibilityState === 'visible',
        gateBusy: gateFlowActive(now) || gatePaywallSlot.busy(),
        redeemBusy: redeemReturnActive(now),
        reviewBusy: rb,
        adBusy,
      };
    };
    const step = dailyStep(state());
    if (step === 'stop') { run.done = true; return; }
    if (step !== 'check') return; // wait·later — 상태가 바뀌거나 다음 포그라운드에 다시
    checking.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          // 기다리는 사이 다른 시트가 떴거나·화면을 옮겼거나·뒤로 갔으면 이번 회차는 넘긴다
          const again = dailyStep(state());
          if (again !== 'check') { if (again === 'stop') run.done = true; return; }
          if (!preview) {
            if (!(await switchOn(platformNow()))) { run.done = true; return; }
            if (!alive.current || run.done) return;
            const st = await checkStorePro({
              proNow: () => isProRef.current || storeProSignal.active(),
              pending: () => proPurchaseState.getSnapshot(),
              adPro: async () => { const { adManager } = await import('@/services/adManager'); return storeProSignal.latest() !== false && adManager.isProActive(); },
              fetchPro: fetchProStrict,
              markPro: (at) => storeProSignal.mark(at),
              markFree: (at) => { storeProSignal.revoke(at); },
              markAdPro: () => storeProSignal.latest() !== false && storeProSignal.mark(),
              timeoutMs: DAILY_PAYWALL_CHECK_MS,
            });
            if (!alive.current || run.done) return;
            if (st === 'pro') { run.done = true; return; }
            // 모름·결제 진행 중 = 안 보인다. 모름은 다음 포그라운드에 다시(실행당 상한)
            if (st !== 'free') { run.tries += 1; if (run.tries >= DAILY_PAYWALL_MAX_TRIES) run.done = true; return; }
            // 체험 만료 1회 페이월 차례면 그쪽이 먼저 — 뜨면 그 표식(오늘)으로 오늘은 쉰다. 안 뜨는 경우를 위해 재조회 횟수에 센다(호출 상한)
            if (expiredPaywallDue(lastInfo, platformNow(), store)) { run.tries += 1; if (run.tries >= DAILY_PAYWALL_MAX_TRIES) run.done = true; return; }
          }
          // 재조회를 기다리는 사이 다른 시트·페이월이 떴거나 PRO·결제 진행 중이 됐으면 다시 본다
          const last = dailyStep(state());
          if (last !== 'check') { if (last === 'stop') run.done = true; return; }
          if (!markDailyShown(store)) { run.done = true; return; }
          run.done = true;
          // 오늘 게이트 «하루 첫 탭» 페이월(gate_first)은 쉬게 한다 — 같은 날 페이월을 두 번 들이밀지 않는다(내일 다시)
          markGateDay(localDay());
          setShow(window.location.pathname.split('/')[1] || 'en');
        } finally {
          checking.current = false;
        }
      })();
    }, DAILY_PAYWALL_DELAY_MS);
    return () => { window.clearTimeout(timer); checking.current = false; };
  }, [iapAvailable, ready, trialsReady, isPro, offers, show, fg, pathname]);

  if (!show) return null;
  const preview = isPreview();
  return (
    <DailyPaywall
      locale={show}
      offers={preview ? undefined : offers}
      previewPlans={preview ? (PREVIEW_PLANS[show] ?? PREVIEW_PLANS.en) : undefined}
      onClose={() => setShow(null)}
    />
  );
}

/** 떠 있는 동안 네이티브 배너를 내린다 — 아래 «구매 복원·이용약관·개인정보» 줄(애플 3.1.2)이 배너에 가리지 않게(체험 안내와 같은 방식) */
function DailyPaywall({ locale, offers, previewPlans, onClose }: { locale: string; offers?: PlanOffer[]; previewPlans?: PaywallPlan[]; onClose: () => void }) {
  useBannerSuppression(true);
  return <ProPaywall locale={locale} src="daily_open" trialHead offers={offers} previewPlans={previewPlans} onClose={onClose} />;
}
