'use client';

// ============================================================================
// WarmBfGate — 웜 블프 카드 판정기 (WarmBfHost 가 가벼운 문을 통과한 기기에서만 싣는다) · 규칙은 lib/app/warmBf 머리말
// ----------------------------------------------------------------------------
// ① 자동(WarmBfGate): 앱이 앞으로 올 때마다 warmStep 으로 보고 'check' 면 8초 기다린 뒤(다른 시작 시트가 먼저) 다시 보고
//    → 스위치·캐시를 비운 새 고객 정보·스토어 가격(loadWarm) → 대상이면 기기 표식(오늘) + 게이트 하루 표식(오늘 다른 페이월·안내 쉼) → 카드(open warm_bf).
// ② 체험 종료 안내의 «PRO 요금제 보기»(WarmBfOffer, 출처 warm_bf_plans): 같은 loadWarm — 대상이 아니거나 스위치가 꺼져 있으면 예전 정가 페이월(onFallback).
// 프리뷰 확인 모드(로컬·*.vercel.app 만): ?sgwarm=1 — 더미 대상(15일 뒤 끝남 · 월간, ?sgwarmp=annual 이면 연간 · ?sgwarma=1 이면 연간 모드).
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { localDay, markGateDay } from '@/lib/app/gatePaywall';
import { gateFlowActive, otherSheetToday, trialAnnounceRouteOk } from '@/lib/app/trialAnnounce';
import { dailyPaywallShownOn } from '@/lib/app/dailyPaywall';
import { redeemReturnActive } from '@/lib/app/redeem';
import { previewFlag } from '@/lib/app/proEntitlement';
import { initRevenueCat } from '@/services/revenueCat';
import { bfOfferAmount, bfPriceView, type BfPriceView } from '@/lib/app/blackFriday';
import { WATCHLIST_STORAGE_KEY, parseWatchlist } from '@/lib/app/watchlist';
import {
  WARM_BF_DELAY_MS, WARM_BF_OFFER_WAIT_MS, WARM_BF_VERIFY_MS, bfSheetSeenToday, markWarmShown, readWarmLast, warmAnnualPerMonth, warmBfTarget, warmDay, warmDue,
  warmPlans, warmStep, warmSwitchFrom, type MiniStore, type WarmTarget,
} from '@/lib/app/warmBf';
import { storePrices } from './BlackFridayGate';
import { WarmBfSheet, type WarmSrcs } from './WarmBfSheet';
import type { PaywallPlan } from './ProPaywall';

const TrialSavePaywall = dynamic(() => import('./TrialSavePaywall'), { ssr: false });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}
const dialogOpen = () => !!document.querySelector('[aria-modal="true"]');
const isNative = () => {
  try { return !!(globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(); } catch { return false; }
};
const capped = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
const isPreview = () => { try { return !isNative() && previewFlag('sgwarm'); } catch { return false; } };
const localeNow = () => window.location.pathname.split('/')[1] || 'en';
function readWatchCount(): number {
  try { return parseWatchlist(localStorage.getItem(WATCHLIST_STORAGE_KEY)).length; } catch { return 0; }
}

/** 끄기 스위치·연간 모드 — 실패·시간 초과·모양 다름 = 꺼짐 */
async function askSwitch(): Promise<{ on: boolean; annual: boolean }> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), WARM_BF_VERIFY_MS);
  try {
    const r = await fetch('/api/app/warm-bf', ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' });
    if (!r.ok) return { on: false, annual: false };
    return warmSwitchFrom(await r.json());
  } catch { return { on: false, annual: false }; } finally { clearTimeout(timer); }
}

/** 캐시를 비운 새 고객 정보로 대상 판정 — 실패·시간 초과 = null(안 보인다) */
async function targetNow(): Promise<WarmTarget | null> {
  try {
    if (!(await initRevenueCat())) return null;
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    // 캐시를 못 비웠으면(실패·시간 초과) 안 보인다 — 옛 «갱신 꺼진 체험» 정보로 이미 결제한 사람에게 뜨지 않게(관문 11240021 ②)
    const cleared = await capped(Purchases.invalidateCustomerInfoCache().then(() => true), WARM_BF_VERIFY_MS);
    if (cleared !== true) return null;
    const r = await capped(Purchases.getCustomerInfo(), WARM_BF_VERIFY_MS);
    return r ? warmBfTarget(r.customerInfo as unknown as Parameters<typeof warmBfTarget>[0], 'ios', Date.now()) : null;
  } catch { return null; }
}

export type WarmView = {
  locale: string; target: WarmTarget; plans: ReturnType<typeof warmPlans>;
  prices: { annual: BfPriceView; monthly: BfPriceView }; perMonth: string | null; watchCount: number; preview: boolean;
};

/** 카드에 필요한 것 전부 — 하나라도 안 되면 null */
export async function loadWarm(locale: string): Promise<WarmView | null> {
  const preview = isPreview();
  let target: WarmTarget | null;
  let annualMode: boolean;
  if (preview) {
    const q = new URLSearchParams(window.location.search);
    target = { expiresAt: Date.now() + 15 * 86_400_000, product: q.get('sgwarmp') === 'annual' ? 'annual' : 'monthly' };
    annualMode = q.get('sgwarma') === '1';
  } else {
    if (!isNative()) return null;
    const [sw, t] = await Promise.all([askSwitch(), targetNow()]);
    if (!sw.on || !t) return null;
    target = t; annualMode = sw.annual;
  }
  const sp = await storePrices(locale);
  const plans0 = warmPlans(target.product, annualMode);
  const prices = { annual: bfPriceView('annual', sp.annual, locale), monthly: bfPriceView('monthly', sp.monthly, locale) };
  // 주 단추의 정가를 스토어에서 못 받았으면 안 보인다(가격을 지어내지 않는다 · 3.1.2 고지에 정가가 들어간다)
  if (!prices[plans0.primary].regular) return null;
  // 둘째 단추도 그 정가가 있을 때만(관문 11240028 ② — 할인 뒤 갱신 가격이 화면에 있어야 한다)
  const plans = { primary: plans0.primary, secondary: plans0.secondary && prices[plans0.secondary].regular ? plans0.secondary : null };
  const amt = bfOfferAmount('annual', sp.annual);
  const perMonth = plans.primary === 'annual' && amt ? warmAnnualPerMonth(amt.offer, amt.currency, locale) : null;
  return { locale, target, plans, prices, perMonth, watchCount: readWatchCount(), preview };
}

const track = (src: 'warm_bf' | 'warm_bf_plans') => { void import('@/lib/app/funnel').then((m) => m.trackFunnel('open', { src })).catch(() => {}); };

// 개발 미리보기 전용 정가 더미(«다른 요금제 보기» 화면 확인) — 실제 앱은 스토어 값만
const PREVIEW_PLANS: Record<string, PaywallPlan[]> = {
  ko: [{ plan: 'monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW' }, { plan: 'annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW', pricePerMonthString: '₩7,417' }],
  ja: [{ plan: 'monthly', priceString: '¥1,280', price: 1280, currencyCode: 'JPY' }, { plan: 'annual', priceString: '¥12,000', price: 12000, currencyCode: 'JPY', pricePerMonthString: '¥1,000' }],
  en: [{ plan: 'monthly', priceString: '$9.99', price: 9.99, currencyCode: 'USD' }, { plan: 'annual', priceString: '$74.99', price: 74.99, currencyCode: 'USD', pricePerMonthString: '$6.25' }],
};

/** 카드 + «다른 요금제 보기»(정가 페이월 · 출처 warm_bf_reg) */
function WarmCard({ view, srcs, onDone }: { view: WarmView; srcs: WarmSrcs; onDone: () => void }) {
  const [other, setOther] = useState(false);
  if (other) {
    return <TrialSavePaywall locale={view.locale} src="warm_bf_reg" onClose={onDone} previewPlans={view.preview ? (PREVIEW_PLANS[view.locale] ?? PREVIEW_PLANS.en) : undefined} />;
  }
  return (
    <WarmBfSheet
      locale={view.locale} expiresAt={view.target.expiresAt} plans={view.plans} prices={view.prices} perMonth={view.perMonth}
      watchCount={view.watchCount} srcs={srcs} preview={view.preview} onClose={onDone}
      onOther={() => { void import('@/components/app/watchlist/BottomSheet').then((m) => m.afterSheetHistory()).then(() => setOther(true)).catch(() => setOther(true)); }}
    />
  );
}

// 이번 웹뷰 실행·이 현지 날짜에서 끝났나
const run = { done: false, day: '' };

/** ① 자동 — 이틀에 한 번(마지막 24시간엔 그날 한 번) */
export function WarmBfGate() {
  const pathname = usePathname() || '';
  const [view, setView] = useState<WarmView | null>(null);
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
    const today = warmDay(Date.now());
    if (run.day !== today) { run.day = today; run.done = false; }
    if (run.done || view || checking.current) return;
    const store = localStore();
    const state = () => {
      const now = Date.now();
      const last = readWarmLast(store);
      return {
        due: last !== undefined && warmDue(last, warmDay(now), now),
        routeOk: trialAnnounceRouteOk(window.location.pathname),
        otherToday: otherSheetToday(store, now),
        bfToday: bfSheetSeenToday(store, now),
        dailyToday: dailyPaywallShownOn(store, now),
        dialogOpen: dialogOpen(),
        visible: document.visibilityState === 'visible',
        gateFlow: gateFlowActive(now),
        pending: proPurchaseState.getSnapshot(),
        redeemBusy: redeemReturnActive(now),
      };
    };
    const step = warmStep(state());
    if (step === 'stop') { run.done = true; return; }
    if (step !== 'check') return;
    checking.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          if (warmStep(state()) !== 'check') return;
          const v = await loadWarm(localeNow());
          if (!alive.current || run.done) return;
          // 대상 아님·스위치 꺼짐·가격 없음 = 이번 실행 끝(다음 실행에 다시)
          if (!v) { run.done = true; return; }
          const last = warmStep(state());
          if (last !== 'check') { if (last === 'stop') run.done = true; return; }
          if (!v.preview && !markWarmShown(store)) { run.done = true; return; }
          run.done = true;
          // 오늘 다른 페이월·안내(블프 1회·하루 첫 페이월·체험 안내·선물·게이트)는 쉬게 한다 — 같은 날 두 번 들이밀지 않는다
          if (!v.preview) { markGateDay(localDay()); track('warm_bf'); }
          setView(v);
        } finally {
          checking.current = false;
        }
      })();
    }, WARM_BF_DELAY_MS);
    return () => { window.clearTimeout(timer); checking.current = false; };
  }, [view, fg, pathname]);

  // 화면을 옮기면 닫는다(블프 시트와 같다)
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setView(null);
  }, [pathname]);

  if (!view) return null;
  return <WarmCard view={view} srcs={{ annual: 'warm_bf', monthly: 'warm_bf_m' }} onDone={() => setView(null)} />;
}

/**
 * ② 체험 종료 안내 «PRO 요금제 보기» — 블프 기간·iOS·App Store 체험이면 정가 페이월 대신 이 카드(출처 warm_bf_plans).
 *   loadWarm 이 null(스위치 꺼짐·대상 아님·가격 없음)이면 onFallback(예전 정가 페이월 그대로).
 */
export function WarmBfOffer({ locale, onClose, onFallback }: { locale: string; onClose: () => void; onFallback: () => void }) {
  const [view, setView] = useState<WarmView | null>(null);
  useEffect(() => {
    let alive = true;
    // 사용자가 누른 뒤라 오래 비워 두지 않는다 — 3.5초 안에 카드가 준비 안 되면 예전 정가 페이월(늦게 온 결과는 버린다)
    const late = window.setTimeout(() => { if (alive) { alive = false; onFallback(); } }, WARM_BF_OFFER_WAIT_MS);
    void loadWarm(locale).catch(() => null).then((v) => {
      if (!alive) return;
      alive = false; window.clearTimeout(late);
      if (!v) { onFallback(); return; }
      // 오늘 표식을 못 남기면(저장소 막힘) 카드 대신 예전 정가 페이월 — 같은 날 다른 안내가 이어지지 않게(관문 11240036)
      if (!v.preview) { if (!markWarmShown(localStore())) { onFallback(); return; } markGateDay(localDay()); track('warm_bf_plans'); }
      setView(v);
    });
    return () => { alive = false; window.clearTimeout(late); };
    // 한 번만(열릴 때)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!view) return null;
  return <WarmCard view={view} srcs={{ annual: 'warm_bf_plans', monthly: 'warm_bf_pm' }} onDone={onClose} />;
}
