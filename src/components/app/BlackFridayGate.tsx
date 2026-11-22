'use client';

// ============================================================================
// BlackFridayGate — 블랙프라이데이 안내 판정기 (BlackFridayHost 가 문을 통과한 기기에서만 싣는다)
// ----------------------------------------------------------------------------
// 자동(auto): 앱이 앞으로 올 때마다 bfStep 으로 보고, 'check' 면 3초 기다린 뒤(체험 종료·만료 시트가 먼저 자리를 잡게)
//   새 고객 정보로 «돈 내는 PRO 아님»(bfEligibleInfo — 무료·체험·코드 체험)을 확인 → 기기에 «봄» 표식 → 시트.
//   뜨면 게이트 하루 표식(gate_first)을 오늘로 — 같은 날 페이월을 두 번 들이밀지 않는다(체험 안내와 같은 규칙. 체험 안내·선물 안내도 이 표식으로 오늘은 쉰다).
// 줄(request): 페이월·설정 블프 줄을 누를 때마다 같은 시트(대상 판정 없음 — 줄은 PRO 가 아닌 자리에만 있다).
// 가격: 스토어 상품(연간·월간)의 통화·정가로 lib/app/blackFriday bfPriceView. 못 받으면 «50%»만 + 정가 대신 «연간 정가» 말.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { localDay, markGateDay } from '@/lib/app/gatePaywall';
import { initRevenueCat } from '@/services/revenueCat';
import { PRO_ANNUAL_PRODUCT_ID, PRO_ENTITLEMENT_ID, PRO_MONTHLY_PRODUCT_ID } from '@/config/iap';
import { isPreviewHost } from '@/lib/app/proEntitlement';
import { gateFlowActive, otherSheetToday, trialAnnounceRouteOk } from '@/lib/app/trialAnnounce';
import {
  BF_DELAY_MS, BF_VERIFY_MS, bfEligibleInfo, bfLive, bfPriceView, bfStep, markBfSeen, readBfSeen,
  type BfPriceView, type BfStorePrice, type MiniStore,
} from '@/lib/app/blackFriday';
import { BlackFridaySheet } from './BlackFridaySheet';

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}
const dialogOpen = () => !!document.querySelector('[aria-modal="true"]');
const isNative = () => {
  try { return !!(globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(); } catch { return false; }
};
const capped = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** 새 고객 정보로 대상 확인 — 실패·시간 초과 = false(안 보인다) · 프리뷰 확인 모드 = true */
async function eligibleNow(): Promise<boolean> {
  if (!isNative()) return isPreviewHost();
  try {
    if (!(await initRevenueCat())) return false;
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const r = await capped(Purchases.getCustomerInfo(), BF_VERIFY_MS);
    return !!r && bfEligibleInfo(r.customerInfo as unknown as Parameters<typeof bfEligibleInfo>[0], PRO_ENTITLEMENT_ID);
  } catch { return false; }
}

/** 스토어 연간·월간 상품 값(정가) — 못 받으면 null */
async function storePrices(locale: string): Promise<{ annual: BfStorePrice; monthly: BfStorePrice }> {
  if (!isNative()) {
    // 프리뷰 확인 모드 — 화면 언어의 나라 값(KOR·JPN·USA 정가)으로 그려 본다
    const cur = locale === 'ko' ? 'KRW' : locale === 'ja' ? 'JPY' : 'USD';
    const v = { KRW: [89000, 11900], JPY: [12000, 1280], USD: [74.99, 9.99] }[cur];
    return { annual: { price: v[0], currencyCode: cur, priceString: null }, monthly: { price: v[1], currencyCode: cur, priceString: null } };
  }
  try {
    if (!(await initRevenueCat())) return { annual: null, monthly: null };
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    const o = await capped(Purchases.getOfferings(), BF_VERIFY_MS);
    const pkgs = o?.current?.availablePackages ?? [];
    const find = (id: string) => pkgs.find((p) => (p?.product?.identifier ?? '').split(':')[0] === id)?.product ?? null;
    const pick = (pr: ReturnType<typeof find>): BfStorePrice => (pr ? { price: pr.price, currencyCode: pr.currencyCode, priceString: pr.priceString } : null);
    return { annual: pick(find(PRO_ANNUAL_PRODUCT_ID)), monthly: pick(find(PRO_MONTHLY_PRODUCT_ID)) };
  } catch { return { annual: null, monthly: null }; }
}

const localeNow = () => window.location.pathname.split('/')[1] || 'en';
const track = (src: 'bf_sheet' | 'bf_line') => { void import('@/lib/app/funnel').then((m) => m.trackFunnel('open', { src })).catch(() => {}); };

// 이번 웹뷰 실행에서 자동 안내가 끝났나(띄웠거나 대상 아님)
const run = { done: false };

export function BlackFridayGate({ auto, request }: { auto: boolean; request: number }) {
  const pathname = usePathname() || '';
  const [show, setShow] = useState<{ locale: string; prices: { annual: BfPriceView; monthly: BfPriceView } } | null>(null);
  const [fg, setFg] = useState(0);
  const checking = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const open = async (src: 'bf_sheet' | 'bf_line') => {
    const locale = localeNow();
    const sp = await storePrices(locale);
    if (!alive.current) return;
    track(src);
    setShow({ locale, prices: { annual: bfPriceView('annual', sp.annual, locale), monthly: bfPriceView('monthly', sp.monthly, locale) } });
  };

  // ② 줄에서 연다
  const lastReq = useRef(0);
  useEffect(() => {
    if (request <= lastReq.current) return;
    lastReq.current = request;
    run.done = true;            // 줄로 본 사람에게 자동 안내를 또 띄우지 않는다
    markBfSeen(localStore());
    void open('bf_line');
  }, [request]);

  useEffect(() => {
    if (!auto) return;
    const bump = () => { if (document.visibilityState === 'visible') setFg((n) => n + 1); };
    document.addEventListener('visibilitychange', bump);
    document.addEventListener('app:resume', bump);
    return () => { document.removeEventListener('visibilitychange', bump); document.removeEventListener('app:resume', bump); };
  }, [auto]);

  // ① 자동 1회
  useEffect(() => {
    if (!auto || run.done || show || checking.current) return;
    const store = localStore();
    const state = () => ({
      seen: readBfSeen(store), live: bfLive(Date.now()), routeOk: trialAnnounceRouteOk(window.location.pathname),
      otherToday: otherSheetToday(store), dialogOpen: dialogOpen(), visible: document.visibilityState === 'visible',
      gateFlow: gateFlowActive(), pending: proPurchaseState.getSnapshot(),
    });
    const step = bfStep(state());
    if (step === 'stop') { run.done = true; return; }
    if (step !== 'check') return;
    checking.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const again = bfStep(state());
        if (again !== 'check') { checking.current = false; if (again === 'stop') run.done = true; return; }
        const ok = await eligibleNow();
        checking.current = false;
        if (!alive.current || run.done) return;
        if (!ok) { run.done = true; return; }
        const last = bfStep(state());
        if (last !== 'check') { if (last === 'stop') run.done = true; return; }
        if (!markBfSeen(store)) { run.done = true; return; }
        run.done = true;
        markGateDay(localDay());
        await open('bf_sheet');
      })();
    }, BF_DELAY_MS);
    return () => { window.clearTimeout(timer); checking.current = false; };
  }, [auto, show, fg, pathname]);

  // 화면을 옮기면 닫는다(선물 안내와 같다)
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setShow(null);
  }, [pathname]);

  if (!show) return null;
  return <BlackFridaySheet locale={show.locale} prices={show.prices} onClose={() => setShow(null)} />;
}
