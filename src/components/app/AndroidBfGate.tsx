'use client';

// ============================================================================
// AndroidBfGate — 안드로이드 블프 «진짜 할인» 판정기 (AndroidBfHost 가 가벼운 문을 통과한 기기에서만 싣는다) · 규칙은 lib/app/androidBf 머리말
// ----------------------------------------------------------------------------
// ① 자동(auto): 앱이 앞으로 올 때마다 androidBfStep 으로 보고 'check' 면 3초 뒤(iOS 블프 시트와 같다 — 하루 첫 페이월 7초보다 먼저) 다시 보고
//    → 스위치(android=true)·고객 정보·기기 오퍼(loadAndroidBf) → 시트(기기당 1회) 또는 웜 카드(이틀에 한 번 · 5초 더 기다려 체험 종료 안내가 먼저)
//    → 기기 표식 + 게이트 하루 표식(오늘 다른 페이월·안내 쉼) → 카드(open bf_and / warm_bf_and).
// ② 블프 줄(request): 같은 loadAndroidBf — 못 보이면 줄만 내린다(줄이 있던 페이월·가치 벽·게이트의 정가 단추가 그대로 남음).
// 시트(무료) 안 결제 오류 = 새 고객 정보로 «지금도 무료»를 확인한 경우만 정가 페이월(bf_and_reg — 체험 문구 없는 일반 페이월), 아니면 «다시 시도» 줄.
// 웜 카드(체험 중)는 정가 페이월로 보내지 않는다(같은 상품 재구매 = Play «이미 소유»).
// 프리뷰 확인 모드(로컬·*.vercel.app 만): ?sgbfa=1 시트 · ?sgbfaw=1 웜(월간 체험 → 연간) · ?sgbfawp=annual(연간 체험 → 월간) · ?sgbfam=1 월간만.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { localDay, markGateDay } from '@/lib/app/gatePaywall';
import { gateFlowActive, otherSheetToday, trialAnnounceRouteOk } from '@/lib/app/trialAnnounce';
import { dailyPaywallShownOn, reviewBusyAt } from '@/lib/app/dailyPaywall';
import { reviewBlockReason, reviewRequestedAt } from '@/hooks/useReviewPrompt';
import { redeemReturnActive } from '@/lib/app/redeem';
import { previewFlag } from '@/lib/app/proEntitlement';
import { initRevenueCat, loadAndroidBfPicks } from '@/services/revenueCat';
import { BF_DELAY_MS, bfLive, markBfSeen, readBfSeen } from '@/lib/app/blackFriday';
import { WARM_BF_DELAY_MS, WARM_BF_VERIFY_MS, bfSheetSeenToday, markWarmShown, readWarmLast, warmAndroidFrom, warmDay, warmDue, type MiniStore } from '@/lib/app/warmBf';
import {
  ANDROID_BF_LINE_HIDE_EVENT, ANDROID_BF_PREVIEW_FLAG, androidBfAudience, androidBfAutoOk, androidBfButtons, androidBfOwnsSub, androidBfStep,
  type AndroidBfPick, type AndroidBfPicks, type AndroidBfState,
} from '@/lib/app/androidBf';
import { WATCHLIST_STORAGE_KEY, parseWatchlist } from '@/lib/app/watchlist';
import { AndroidBfSheet, type AndroidBfView } from './AndroidBfSheet';
import type { PaywallPlan } from './ProPaywall';

const RegularPaywall = dynamic(() => import('./AndroidBfRegular'), { ssr: false });

function localStore(): MiniStore | null {
  try { return window.localStorage; } catch { return null; }
}
const dialogOpen = () => !!document.querySelector('[aria-modal="true"]');
const isNative = () => {
  try { return !!(globalThis as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(); } catch { return false; }
};
const capped = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
const isPreview = () => { try { return !isNative() && (previewFlag(ANDROID_BF_PREVIEW_FLAG) || previewFlag('sgbfaw')); } catch { return false; } };
const localeNow = () => window.location.pathname.split('/')[1] || 'en';
const ANDROID_BF_LINE_WAIT_MS = 4_500;
/** OS 평점 시트 요청 직후·전면 광고·선물 안내 중이면 기다린다(하루 첫 페이월과 같다 — 관문 11241350 ②). 모르면 기다림 */
function osBusyNow(now: number): boolean {
  let rb = false;
  try { rb = reviewBusyAt(reviewRequestedAt(), now); } catch { rb = true; }
  let ad = false;
  try { const why = reviewBlockReason(now); ad = why === 'ad' || why === 'gift' || why === 'err'; } catch { ad = true; }
  return rb || ad;
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function readWatchCount(): number {
  try { return parseWatchlist(localStorage.getItem(WATCHLIST_STORAGE_KEY)).length; } catch { return 0; }
}
const track = (src: 'bf_and' | 'bf_and_line' | 'warm_bf_and' | 'bf_and_noopt') => {
  void import('@/lib/app/funnel').then((m) => m.trackFunnel('open', { src })).catch(() => {});
};

/** 끄기 스위치 — 응답의 android 가 true 일 때만(실패·시간 초과·모양 다름 = 꺼짐) */
async function androidSwitchOn(): Promise<boolean> {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), WARM_BF_VERIFY_MS);
  try {
    const r = await fetch('/api/app/warm-bf', ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' });
    if (!r.ok) return false;
    return warmAndroidFrom(await r.json());
  } catch { return false; } finally { clearTimeout(timer); }
}

/** 고객 정보 — fresh 면 캐시를 비우고 다시(못 비우면 null). 실패·시간 초과 = null */
async function infoNow(fresh: boolean): Promise<unknown | null> {
  try {
    if (!(await initRevenueCat())) return null;
    const { Purchases } = await import('@revenuecat/purchases-capacitor');
    if (fresh) {
      const cleared = await capped(Purchases.invalidateCustomerInfoCache().then(() => true), WARM_BF_VERIFY_MS);
      if (cleared !== true) return null;
    }
    const r = await capped(Purchases.getCustomerInfo(), WARM_BF_VERIFY_MS);
    return r ? r.customerInfo : null;
  } catch { return null; }
}

// 프리뷰 확인 모드 전용 더미(화면 언어의 나라 값 — Play 콘솔 11/24 판독: KRW 44,500/89,000 · 5,950/11,900 · USD 37.50/74.99 · 5.00/9.99 · JPY 6,550/13,100 · 640/1,280)
function previewPicks(locale: string): AndroidBfPicks {
  const t = locale === 'ko' ? { c: 'KRW', a: ['₩44,500', '₩89,000', 44500], m: ['₩5,950', '₩11,900', 5950] }
    : locale === 'ja' ? { c: 'JPY', a: ['¥6,550', '¥13,100', 6550], m: ['¥640', '¥1,280', 640] }
      : { c: 'USD', a: ['$37.50', '$74.99', 37.5], m: ['$5.00', '$9.99', 5] };
  const mk = (plan: 'annual' | 'monthly', v: (string | number)[]) => ({
    platform: 'android', plan, priceString: v[0], regularPriceString: v[1], offerAmount: v[2], currency: t.c, pct: 50,
    pkg: {} as never, option: {} as never,
  }) as unknown as AndroidBfPick;
  const monthlyOnly = new URLSearchParams(window.location.search).get('sgbfam') === '1';
  return { annual: monthlyOnly ? null : mk('annual', t.a), monthly: mk('monthly', t.m) };
}

/** 카드에 필요한 것 전부 — 하나라도 안 되면 null · 'owned' = 활성 권한·구독이 있다(블프 줄에서도 정가 페이월로 보내지 않는다) */
export async function loadAndroidBf(locale: string): Promise<AndroidBfView | 'owned' | null> {
  if (isPreview()) {
    const q = new URLSearchParams(window.location.search);
    const warm = previewFlag('sgbfaw');
    const picks = previewPicks(locale);
    const plans = warm ? [q.get('sgbfawp') === 'annual' ? 'monthly' as const : 'annual' as const] : ['annual' as const, 'monthly' as const];
    return { locale, kind: warm ? 'warm' : 'sheet', buttons: androidBfButtons(plans, picks), expiresAt: warm ? Date.now() + 5 * 86_400_000 : null, watchCount: readWatchCount(), preview: true };
  }
  if (!isNative()) return null;
  const [on, info0] = await Promise.all([androidSwitchOn(), infoNow(false)]);
  type Info = Parameters<typeof androidBfAudience>[0];
  if (info0 && androidBfOwnsSub(info0 as Info) && !androidBfAudience(info0 as Info, 'android', Date.now())) return 'owned';
  if (!on || !info0) return null;
  const aud0 = androidBfAudience(info0 as Info, 'android', Date.now());
  if (!aud0) return null;
  // 보일 사람이면 캐시를 비운 새 정보로 다시 확인 — 다른 기기에서 막 구독한 사람·이미 결제한 체험자에게 옛 «무료/갱신 꺼짐» 정보로 뜨지 않게
  //   (못 비우면 안 보임 · 모양이 바뀌면 안 보임 — 관문 11241325 ①). 캐시상 대상이 아닌 사람은 네트워크 조회 없이 끝(매 실행 부하 없음)
  const info1 = await infoNow(true);
  const aud = info1 ? androidBfAudience(info1 as Info, 'android', Date.now()) : null;
  if (!aud || aud.kind !== aud0.kind) return info1 && androidBfOwnsSub(info1 as Info) ? 'owned' : null;
  // 웜(체험 중)은 아래에서 실패해도 'owned' — 블프 줄에서도 정가 페이월로 보내지 않는다
  let picks: AndroidBfPicks | null = null;
  try { picks = await capped(loadAndroidBfPicks(), WARM_BF_VERIFY_MS); } catch { picks = null; }
  const buttons = picks ? androidBfButtons(aud.plans, picks) : [];
  if (!buttons.length) { track('bf_and_noopt'); return aud.kind === 'warm' ? 'owned' : null; }
  if (!bfLive(Date.now())) return aud.kind === 'warm' ? 'owned' : null;
  return {
    locale, kind: aud.kind, buttons, expiresAt: aud.kind === 'warm' ? aud.target.expiresAt : null,
    watchCount: readWatchCount(), preview: false,
  };
}

/**
 * 블프 줄을 안드로이드에서 그려도 되나 — 무료(캐시상 시트 대상) · 스위치 켜짐 · 기기에 오퍼가 있을 때만, 그 주 단추 상품(줄 문구가 실제 선택지와 맞게 — 관문 11241331 ③).
 *   웜(체험 중)·유료는 줄이 없다(웜은 이틀에 한 번 자동 카드). 실패·모름 = null(줄 없음).
 */
export async function androidLinePlan(): Promise<'annual' | 'monthly' | null> {
  if (isPreview()) return new URLSearchParams(window.location.search).get('sgbfam') === '1' ? 'monthly' : 'annual';
  if (!isNative() || !bfLive(Date.now())) return null;
  const [on, info] = await Promise.all([androidSwitchOn(), infoNow(false)]);
  if (!on || !info) return null;
  const aud = androidBfAudience(info as Parameters<typeof androidBfAudience>[0], 'android', Date.now());
  if (!aud || aud.kind !== 'sheet') return null;
  let picks: AndroidBfPicks | null = null;
  try { picks = await capped(loadAndroidBfPicks(), WARM_BF_VERIFY_MS); } catch { picks = null; }
  const b = picks ? androidBfButtons(aud.plans, picks) : [];
  return b.length ? b[0].plan : null;
}

/** 결제 직전 재확인 — 캐시 비운 새 고객 정보로 같은 모양(시트/웜)이고 그 상품이 여전히 허락되는가. 못 읽음 = 'unknown'(사지 않음·다시 시도) · 프리뷰 = 'ok' */
async function stillEligible(view: AndroidBfView, plan: 'annual' | 'monthly'): Promise<'ok' | 'no' | 'unknown'> {
  if (view.preview) return 'ok';
  const info = await infoNow(true);
  if (!info) return 'unknown';
  const aud = androidBfAudience(info as Parameters<typeof androidBfAudience>[0], 'android', Date.now());
  return !!aud && aud.kind === view.kind && aud.plans.includes(plan) ? 'ok' : 'no';
}

// 개발 미리보기 전용 정가 더미(정가 페이월 화면 확인) — 실제 앱은 스토어 값만
const PREVIEW_PLANS: Record<string, PaywallPlan[]> = {
  ko: [{ plan: 'monthly', priceString: '₩11,900', price: 11900, currencyCode: 'KRW' }, { plan: 'annual', priceString: '₩89,000', price: 89000, currencyCode: 'KRW', pricePerMonthString: '₩7,417' }],
  ja: [{ plan: 'monthly', priceString: '¥1,280', price: 1280, currencyCode: 'JPY' }, { plan: 'annual', priceString: '¥13,100', price: 13100, currencyCode: 'JPY', pricePerMonthString: '¥1,091' }],
  en: [{ plan: 'monthly', priceString: '$9.99', price: 9.99, currencyCode: 'USD' }, { plan: 'annual', priceString: '$74.99', price: 74.99, currencyCode: 'USD', pricePerMonthString: '$6.25' }],
};

// 이번 웹뷰 실행·이 현지 날짜에서 자동 안내가 끝났나
const run = { done: false, day: '' };

export function AndroidBfGate({ auto, request }: { auto: boolean; request: number }) {
  const pathname = usePathname() || '';
  const [view, setView] = useState<AndroidBfView | null>(null);
  const viewRef = useRef<AndroidBfView | null>(null);
  viewRef.current = view;
  const [regular, setRegular] = useState<{ locale: string; preview: boolean } | null>(null);
  const [fg, setFg] = useState(0);
  const checking = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  /**
   * 시트(무료) 결제 오류 → 정가 페이월. 넘기기 직전 캐시를 비운 새 고객 정보로 «지금도 권한·활성 구독 0»을 다시 확인한 경우만(true).
   *   확인 못 함·권한/구독 있음 = false → 시트에 «다시 시도» 줄(같은 상품 재구매·중복 구독 경로를 만들지 않는다 — 관문 11241338)
   */
  const toRegular = async (locale: string, preview: boolean): Promise<boolean> => {
    if (!preview) {
      const info = await infoNow(true);
      const aud = info ? androidBfAudience(info as Parameters<typeof androidBfAudience>[0], 'android', Date.now()) : null;
      if (!aud || aud.kind !== 'sheet' || !alive.current) return false;
    }
    // 확인하는 사이 시트를 닫았으면(뒤로가기 등) 정가 페이월을 열지 않는다
    if (!viewRef.current) return false;
    setView(null);
    void import('@/components/app/watchlist/BottomSheet').then((m) => m.afterSheetHistory()).catch(() => {}).then(() => { if (alive.current) setRegular({ locale, preview }); });
    return true;
  };

  // ② 블프 줄에서 연다
  const lastReq = useRef(0);
  const lineBusy = useRef(false);
  const lineSeq = useRef(0);
  useEffect(() => {
    if (request <= lastReq.current) return;
    lastReq.current = request;
    run.done = true;            // 줄로 본 사람에게 오늘 자동 안내를 또 띄우지 않는다
    markBfSeen(localStore());
    // 조회 중 또 누르면 무시 · 결과는 «가장 최근 요청»이고 시트가 안 떠 있을 때만 쓴다 — 닫은 시트가 늦은 결과로 다시 열리지 않게(관문 11241348)
    if (lineBusy.current || viewRef.current) return;
    lineBusy.current = true;
    const seq = ++lineSeq.current;
    const locale = localeNow();
    const fromPath = window.location.pathname;
    // 누른 줄(들) 자체 — 결과가 왔을 때 그 줄이 아직 화면에 붙어 있어야 연다(닫고 다른 페이월을 열었으면 새 줄이라 버린다 — 관문 11241350 ①)
    const lines = Array.from(document.querySelectorAll('[data-bf-line]'));
    // 사용자가 누른 뒤라 오래 비워 두지 않는다 — 4.5초 안에 준비 안 되면 줄을 내린다(늦게 온 결과는 버린다)
    void capped(loadAndroidBf(locale).catch(() => null), ANDROID_BF_LINE_WAIT_MS).then((v) => {
      lineBusy.current = false;
      if (!alive.current || seq !== lineSeq.current || viewRef.current) return;
      // 기다리는 사이 화면을 옮겼거나 줄이 있던 페이월을 닫았으면 버린다 — 떠난 화면 위에 늦게 뜨지 않게(관문 11241339 ③)
      if (window.location.pathname !== fromPath || !lines.some((n) => n.isConnected)) return;
      // 못 보이면(활성 권한·구독·스위치 꺼짐·오퍼 없음·늦음) 줄만 내린다 — 줄은 페이월·가치 벽·게이트 안에 있어 그 화면의 정가 결제 단추가 그대로 남는다.
      //   여기서 정가 페이월을 새로 열지 않는다: 확인이 끝나기 전엔 체험·구독 중인 사람이 같은 상품을 다시 고를 수 있다(Play «이미 소유» — 관문 11241331 ② · 11241338)
      if (!v || v === 'owned') { window.dispatchEvent(new CustomEvent(ANDROID_BF_LINE_HIDE_EVENT)); return; }
      // 오늘 다른 페이월·안내(하루 첫 페이월·체험 안내·웜 카드)는 쉬게 한다 — 자동 시트와 같다(관문 11241346 ②)
      if (!v.preview) { markGateDay(localDay()); track('bf_and_line'); }
      setView(v);
    });
  }, [request]);

  useEffect(() => {
    if (!auto) return;
    const bump = () => { if (document.visibilityState === 'visible') setFg((n) => n + 1); };
    document.addEventListener('visibilitychange', bump);
    document.addEventListener('app:resume', bump);
    return () => { document.removeEventListener('visibilitychange', bump); document.removeEventListener('app:resume', bump); };
  }, [auto]);

  // ① 자동
  useEffect(() => {
    if (!auto) return;
    const today = warmDay(Date.now());
    if (run.day !== today) { run.day = today; run.done = false; }
    if (run.done || view || regular || checking.current) return;
    const store = localStore();
    const state = (): AndroidBfState => {
      const now = Date.now();
      const last = readWarmLast(store);
      return {
        live: bfLive(now), sheetSeen: readBfSeen(store), warmDue: last !== undefined && warmDue(last, warmDay(now), now), bfToday: bfSheetSeenToday(store, now),
        routeOk: trialAnnounceRouteOk(window.location.pathname), otherToday: otherSheetToday(store, now), dailyToday: dailyPaywallShownOn(store, now),
        dialogOpen: dialogOpen(), visible: document.visibilityState === 'visible', gateFlow: gateFlowActive(now),
        pending: proPurchaseState.getSnapshot(), redeemBusy: redeemReturnActive(now), osBusy: osBusyNow(now),
      };
    };
    const step = androidBfStep(state());
    if (step === 'stop') { run.done = true; return; }
    if (step !== 'check') return;
    checking.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          if (androidBfStep(state()) !== 'check') return;
          const v = await loadAndroidBf(localeNow());
          if (!alive.current || run.done) return;
          // 대상 아님·스위치 꺼짐·오퍼 없음 = 이번 실행 끝(다음 실행에 다시)
          if (!v || v === 'owned') { run.done = true; return; }
          if (!androidBfAutoOk(v.kind, state())) { run.done = true; return; }
          // 웜은 체험 종료 안내(조회 뒤 뜸)가 먼저 자리를 잡게 iOS 웜과 같은 8초까지 기다린다
          if (v.kind === 'warm') await sleep(Math.max(0, WARM_BF_DELAY_MS - BF_DELAY_MS));
          if (!alive.current || run.done) return;
          const last = state();
          const st = androidBfStep(last);
          if (st !== 'check' || !androidBfAutoOk(v.kind, last)) { if (st === 'stop') run.done = true; return; }
          if (!bfLive(Date.now())) { run.done = true; return; }
          if (!v.preview) {
            const marked = v.kind === 'sheet' ? markBfSeen(store) : markWarmShown(store);
            if (!marked) { run.done = true; return; }
          }
          run.done = true;
          if (!v.preview) { markGateDay(localDay()); track(v.kind === 'sheet' ? 'bf_and' : 'warm_bf_and'); }
          setView(v);
        } finally {
          checking.current = false;
        }
      })();
    }, BF_DELAY_MS);
    return () => { window.clearTimeout(timer); checking.current = false; };
  }, [auto, view, regular, fg, pathname]);

  // 화면을 옮기면 닫는다(블프 시트와 같다)
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setView(null);
  }, [pathname]);

  if (regular) {
    return <RegularPaywall locale={regular.locale} onClose={() => setRegular(null)} previewPlans={regular.preview ? (PREVIEW_PLANS[regular.locale] ?? PREVIEW_PLANS.en) : undefined} />;
  }
  if (!view) return null;
  // 정가 페이월 폴백은 무료(시트) 사람만 — 웜(체험 중) 사람은 정가 페이월에서 지금 체험 상품을 다시 고르면 Play 가 «이미 소유»로 거절한다(관문 11241325 ②)
  return <AndroidBfSheet view={view} onClose={() => setView(null)} onFallback={view.kind === 'sheet' ? () => toRegular(view.locale, view.preview) : null} confirm={(plan) => stillEligible(view, plan)} />;
}
