'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import styles from './ValueWall.module.css';
import { useProStatus } from '@/hooks/useProStatus';
import { AdFreeIcon } from '@/components/app/AdFreeIcon';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { ProPaywall } from './ProPaywall';
import { RedeemCodeLink } from './RedeemCodeLink';
import type { FunnelSrc } from '@/lib/app/funnelSchema';
import { proPurchaseState } from '@/lib/app/proPurchaseState';
import { markGateDay, readGateDay, storeProSignal, checkStorePro, gatePaywallSlot, decideFirstGatePaywall, decideNoFillPaywall } from '@/lib/app/gatePaywall';
import { beginGateFlow, endGateFlow, gateFlowActive, trialAnnouncedToday } from '@/lib/app/trialAnnounce';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { grantScopeUnlock, scopeUnlockedAt, unlockScopeName, noteRewardForFollow, migrateLegacyUnlock } from '@/lib/app/adUnlockScope';
const announcedTodaySafe = () => { try { return trialAnnouncedToday(window.localStorage); } catch { return false; } };

const UNLOCK_KEY = 'signum_ad_unlock';
const UNLOCK_MS = 60 * 60 * 1000;
// ★11/20 잠금(화면 가림)은 «범위»마다 따로 연다(lib/app/adUnlockScope) — 광고 한 편 = 누른 그 잠금 하나만 1시간.
//   앱 전역 키(UNLOCK_KEY)는 adManager 의 «보상형 뒤 1시간 전면 쉬기»용으로만 예전처럼 쓴다(잠금 판정에는 안 쓴다).
//   이번 실행 동안의 사본 — 저장소에 못 써도 1시간 동안 다시 잠그지 않는다(관문 11201522 ③)
const memUnlocks = new Map<string, number>();
let legacyChecked = false;
/** 이 범위의 광고 잠금해제가 지금 유효한가 — 콜백 안에서 렌더를 기다리지 않고 읽는다(useUnlockState 와 같은 해석) */
const scopeUnlockedNow = (scope: string) => {
  const now = Date.now();
  if (!legacyChecked) {
    legacyChecked = true;
    // 배포 전 받은 1시간 해제는 끝까지 준다(관문 11201522 ①) — 저장에 실패해도 이번 실행 동안은 기억(관문 11201525 ③)
    let legacy = 0;
    try { legacy = migrateLegacyUnlock(window.localStorage, now); } catch { /* 저장소 없음 */ }
    if (legacy > now) memUnlocks.set('*', legacy);
  }
  if ((memUnlocks.get(scope) ?? 0) > now || (memUnlocks.get('*') ?? 0) > now) return true;
  try { return scopeUnlockedAt(window.localStorage, scope, now); } catch { return false; }
};
/** 화면 쪽에서 ValueWall 과 «같은 판정»으로 범위 잠금을 읽을 때(flow 맥스페인 줄 = flow_chain) */
export const adScopeUnlockedNow = (scope: string) => scopeUnlockedNow(unlockScopeName(scope));

// IAP_LIVE is the single source of truth in src/config/iap.ts. While false, the
// "$9.99/mo ad-free" upsell line stays hidden (a non-purchasable price fails App
// Store 3.1.1 / Play review). See that file for the go-live checklist.

type ValueWallLocale = 'ko' | 'en' | 'ja';

const VALUE_WALL_COPY: Record<ValueWallLocale, {
  defaultSubtitle: ReactNode;
  ctaLabel: string;
  adFreeLabel: string;
  proCta: string;
  proErrorLabel: string;
  proNothingLabel: string;
  proRestoreLabel: string;
  previewChipLabel: string;
  legalNote: ReactNode;
  modalEyebrow: string;
  modalTitle: string;
  modalSubtitle: ReactNode;
  modalWaitPrefix: string;
  adTimeLabel: string;
  unlockedBanner: string;
  unlockedTitle: string;
  unlockedSubtitle: ReactNode;
  continueLabel: string;
  afterAdUpsell: string;
}> = {
  ko: {
    defaultSubtitle: <>광고를 시청하면 프리미엄 리서치 데이터를 1시간 동안 확인할 수 있습니다.</>,
    ctaLabel: '광고 보고 1시간 잠금해제',
    adFreeLabel: '또는 광고 없이 보기',
    proCta: 'SIGNUM Pro · 광고 없이 보기',
    proErrorLabel: '구매를 완료하지 못했어요. 다시 시도해주세요.',
    proNothingLabel: '복원할 구매 내역이 없어요.',
    proRestoreLabel: '구매 복원',
    previewChipLabel: '무료 미리보기',
    legalNote: <>교육 및 리서치용 시장 데이터입니다. 투자 조언이나 매수/매도 권유가 아니며, 정확성 또는 수익을 보장하지 않습니다.</>,
    modalEyebrow: '보상형 광고',
    modalTitle: '프리미엄 리서치 데이터 잠금해제 중',
    modalSubtitle: <>광고를 끝까지 시청하면 프리미엄 데이터가 1시간 동안 열립니다. 투자 판단과 책임은 사용자 본인에게 있습니다.</>,
    modalWaitPrefix: '잠시만 기다려주세요',
    adTimeLabel: '광고',
    unlockedBanner: '1시간 동안 잠금해제됨',
    unlockedTitle: '프리미엄 리서치 데이터 활성화',
    unlockedSubtitle: <>시장 데이터 참고용으로만 사용하세요. 정확성 또는 수익을 보장하지 않습니다.</>,
    continueLabel: '계속',
    afterAdUpsell: '매번 기다리지 않으려면 · 광고 없이 보기',
  },
  en: {
    defaultSubtitle: <>Watch an ad to unlock premium research data for 1 hour.</>,
    ctaLabel: 'Watch & Unlock · 1HR',
    adFreeLabel: 'or go ad-free',
    proCta: 'SIGNUM Pro · Go ad-free',
    proErrorLabel: "Couldn't complete the purchase. Please try again.",
    proNothingLabel: 'No previous purchase to restore.',
    proRestoreLabel: 'Restore purchase',
    previewChipLabel: 'Free preview',
    legalNote: <>Educational market-data research only. Not investment advice or a buy/sell recommendation. Accuracy and returns are not guaranteed.</>,
    modalEyebrow: 'Rewarded Ad',
    modalTitle: 'Unlocking premium research data',
    modalSubtitle: <>Watch the full ad to unlock premium data for 1 hour. Investment decisions remain your responsibility.</>,
    modalWaitPrefix: 'Please wait',
    adTimeLabel: 'Ad',
    unlockedBanner: 'Unlocked for 1:00:00',
    unlockedTitle: 'Premium research data is live',
    unlockedSubtitle: <>Use this as market-data context only. Accuracy and returns are not guaranteed.</>,
    continueLabel: 'Continue',
    afterAdUpsell: 'Tired of waiting? Go ad-free',
  },
  ja: {
    defaultSubtitle: <>広告を視聴すると、プレミアムリサーチデータを1時間確認できます。</>,
    ctaLabel: '広告を見て1時間解除',
    adFreeLabel: 'または広告なしで見る',
    proCta: 'SIGNUM Pro · 広告なしで見る',
    proErrorLabel: '購入を完了できませんでした。もう一度お試しください。',
    proNothingLabel: '復元できる購入履歴がありません。',
    proRestoreLabel: '購入を復元',
    previewChipLabel: '無料プレビュー',
    legalNote: <>教育およびリサーチ用の市場データです。投資助言や売買推奨ではなく、正確性または収益を保証しません。</>,
    modalEyebrow: 'リワード広告',
    modalTitle: 'プレミアムリサーチデータを解除中',
    modalSubtitle: <>広告を最後まで視聴すると、プレミアムデータが1時間有効になります。投資判断と責任は利用者本人にあります。</>,
    modalWaitPrefix: 'しばらくお待ちください',
    adTimeLabel: '広告',
    unlockedBanner: '1時間解除済み',
    unlockedTitle: 'プレミアムリサーチデータが有効です',
    unlockedSubtitle: <>市場データの参考情報としてのみ使用してください。正確性または収益を保証しません。</>,
    continueLabel: '続ける',
    afterAdUpsell: '毎回待たずに · 広告なしで見る',
  },
};

function resolveValueWallLocale(locale?: string): ValueWallLocale {
  if (locale === 'ko' || locale === 'ja') return locale;
  return 'en';
}

export function useUnlockState(scope?: string) {
  const scopeName = unlockScopeName(scope);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const check = () => setUnlocked(scopeUnlockedNow(scopeName));

    check();
    window.addEventListener('storage', check);
    window.addEventListener('signum:unlock', check as EventListener);
    const timer = setInterval(check, 30_000);

    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener('signum:unlock', check as EventListener);
      clearInterval(timer);
    };
  }, [scopeName]);

  /** 이 범위만 1시간 연다. writeGlobal = 앱 전역 키도 쓴다(대체 30초 창 — 예전처럼 1시간 전면 쉬기. 보상형은 adManager 가 이미 썼다).
   *  돌려주는 값: 이 범위 말고 이미 열려 있던 범위 수(예전 규칙이면 «광고 없이 같이 열렸을» 잠금이 있었다는 뜻) */
  const unlock = useCallback((writeGlobal = true) => {
    let others = 0;
    const now = Date.now();
    memUnlocks.set(scopeName, now + UNLOCK_MS);
    try {
      others = grantScopeUnlock(window.localStorage, scopeName, now);
      if (writeGlobal) window.localStorage.setItem(UNLOCK_KEY, JSON.stringify({ unlockedUntil: now + UNLOCK_MS, tier: 'premium' }));
      noteRewardForFollow(window.localStorage, now); // 계측만 — 해제 뒤 24시간 안의 페이월 열림·버튼·결제를 한 번씩 센다(funnelBeacon)
    } catch { /* 저장소 막힘 — 이번 화면 동안만 열린다 */ }
    window.dispatchEvent(new Event('signum:unlock'));
    setUnlocked(true);
    return others;
  }, [scopeName]);

  return { unlocked, unlock };
}

/* ── 광고 언락 게이트의 «동작»만 떼어낸 훅 ─────────────────────────────────
   9차 대시보드 게이트는 시안 레이아웃이 ValueWall 과 근본적으로 다르다
   (1번 신호는 안 가리고, 2~4번만 셔머 막대). 그래도 결제·광고 흐름은
   두 벌이 되면 안 되므로 ValueWall 과 «같은 코드»를 쓰게 여기서 내보낸다.
   ValueWall 자신도 이 훅을 쓴다 — 동작은 한 곳에만 있다.            */
export function useAdUnlockGate(locale?: string, onUnlock?: () => void, unlockScope?: string) {
  // ★11/20 이 게이트의 잠금 범위 — ValueWall 은 unlockScope 또는 제목, 대시보드 게이트는 'dash_gate'. 광고 한 편은 이 범위만 연다.
  const scopeName = unlockScopeName(unlockScope);
  const scopeRef = useRef(scopeName);
  scopeRef.current = scopeName;
  /** 이 게이트의 잠금이 지금 열려 있나(다른 게이트의 광고로는 열리지 않는다) */
  const adUnlockedNow = () => scopeUnlockedNow(scopeRef.current);
  const [showAd, setShowAd] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const unlockPending = useRef(false);
  const [purchasing, setPurchasing] = useState(false);
  const [proError, setProError] = useState(false);
  const [proNothing, setProNothing] = useState(false); // successful restore that found no entitlement
  const { unlocked, unlock } = useUnlockState(scopeName);
  // Pro (paid, ad-free) is inert while IAP_LIVE=false: isPro stays false, no SDK.
  const { isPro, ready, offers, purchase, restore, iapAvailable } = useProStatus();
  // ★11/16 게이트 흐름의 스토어 재조회(proCheck)가 PRO 를 확인했는데 이 훅의 isPro 가 아직 무료면(초기 조회 실패·갱신 지연) 그 값으로 연다 — 잠금에 가두지 않는다
  //   광고 잠금해제와 같은 1시간만 유효(그 사이 만료·회수돼도 영구히 열린 채 남지 않게) — 그 뒤는 훅의 isPro(스토어 갱신)를 따른다.
  //   ★11/16 밤 — 확인된 PRO 는 모듈 신호(storeProSignal)로 «모든 게이트»가 같이 본다: 다른 탭에서 새로 마운트된 게이트도
  //   초기 조회가 실패하든 말든 즉시 PRO 로 열린다(전에는 이 훅 안에만 남아 새 게이트가 PRO 사용자를 다시 잠갔다).
  //   «가장 최신 스토어 응답»(storeProSignal — 모든 useProStatus·게이트 재조회가 기록)이 있으면 그것을, 없으면 이 훅의 isPro 를 따른다.
  //   → 회수(더 최신 무료 응답) 뒤 이 훅의 옛 isPro 로 열린 채 남지 않고, 확인된 PRO 는 이 훅의 초기 조회 실패와 무관하게 열린다.
  const [, setSigVer] = useState(0); // 신호가 바뀌면 다시 그린다
  const markStorePro = useCallback((at: number) => storeProSignal.mark(at), []);
  // 첫 렌더는 서버 렌더와 같게 신호를 읽지 않는다(sessionStorage 복원값으로 hydration 이 어긋나지 않게) — 마운트 뒤 바로 다시 그려 반영
  const sigMounted = useRef(false);
  useEffect(() => {
    sigMounted.current = true;
    setSigVer((v) => v + 1); // 첫 렌더 ~ 구독 사이에 다른 게이트가 기록한 값도 받는다
    return storeProSignal.subscribe(() => setSigVer((v) => v + 1));
  }, []);
  // 공유 PRO 1시간 만료 때 다시 그린다(그 뒤는 이 훅의 isPro 를 따른다)
  const sigExp = sigMounted.current ? storeProSignal.proExpiresAt() : 0;
  useEffect(() => {
    if (!sigExp) return;
    const t = window.setTimeout(() => setSigVer((v) => v + 1), Math.max(0, sigExp - Date.now()));
    return () => window.clearTimeout(t);
  }, [sigExp]);
  const hookProRef = useRef(isPro);
  hookProRef.current = isPro;
  /** 지금 이 순간의 PRO 판정(동기) — 콜백 안에서도 최신 신호를 읽는다 */
  const gateProNow = () => { const l = sigMounted.current ? storeProSignal.latest() : null; return l === null ? hookProRef.current : l; };
  const gatePro = gateProNow();
  // A Pro subscriber bypasses the wall permanently (no ad, no timer).
  const isUnlocked = unlocked || gatePro;
  // ★11/17 대체 창이 닫혔거나(어느 경로든) 잠금이 풀려 창이 그려지지 않으면 창 몫 자리를 놓는다(관문 11170640)
  //   잠금이 풀리면(PRO 확인·구매 성공·광고 보상) 게이트 페이월도 닫힘 콜백 없이 사라질 수 있다 — 페이월 몫 자리도 놓는다(관문 11170642)
  useEffect(() => {
    if (!showAd || isUnlocked) { gatePaywallSlot.release(modalSlot.current); modalSlot.current = 0; }
    if (isUnlocked) { gatePaywallSlot.release(slotId.current); slotId.current = 0; }
  }, [showAd, isUnlocked]);
  const copy = VALUE_WALL_COPY[resolveValueWallLocale(locale)];

  // ★11/16 게이트 «가치 순간» 페이월(lib/app/gatePaywall) — 페이월을 닫은 «뒤»에 이어 할 일(광고 / 대체 창).
  //   콜백 안에서 최신 PRO 상태를 읽도록 ref 로 둔다(구매 성공으로 닫힌 경우 광고를 이어 붙이지 않는다).
  //   스토어 가격(offers)을 못 받았으면 «살 수 없는 페이월»이라 끼워 넣지 않는다(iapAvailable 에 묶는다).
  const sellable = iapAvailable && offers.length > 0;
  const gateRef = useRef({ iapAvailable: sellable, ready, isPro: gatePro });
  gateRef.current = { iapAvailable: sellable, ready, isPro: gatePro };
  const afterPaywall = useRef<null | 'ad' | 'fallback'>(null);

  const finishUnlock = useCallback(() => {
    const others = unlock(true);
    trackFunnel('reward_ok', { src: 'ad_modal' }); // ★11/20 계측만 — 대체 30초 창이 잠금을 열었다(하루 합계 · 식별자 없음)
    if (others > 0) trackFunnel('reward_ok', { src: 'rw_more' }); // ★11/20 계측만 — 다른 잠금이 이미 열린 채 또 열었다(예전 규칙이면 광고 없이 열렸을 몫)
    onUnlock?.();
  }, [onUnlock, unlock]);

  // Buy the ad-free Pro subscription. On success, isPro flips the wall open (isUnlocked).
  // ⚠️ 여기서 곧장 purchase() 를 부르면 안 된다 — 가격·기간·약관을 결제 «전에»
  //    보여주지 않는 것이 애플 3.1.2 반려 사유다. 페이월을 먼저 띄운다.
  //    (광고가 실제로 방해한 이 순간이 전환이 일어나는 자리라 진입점으로 남긴다.)
  const [paywallOpen, setPaywallOpen] = useState(false);
  // 퍼널 측정 — 누가 열었나. 버튼 onClick 에 그대로 꽂히면 인자가 클릭 이벤트라 «가치 벽»으로 본다.
  const [paywallSrc, setPaywallSrc] = useState<FunnelSrc>('value_wall');

  // 게이트 흐름이 진행 중(페이월 열림 ~ 이어 할 일 끝)인 시각 — 그 사이 다른 탭은 무시한다(빠른 두 번 탭에 페이월·광고가 겹치지 않게).
  //   onClose 가 끝내 안 불린 경우(화면 이동 등)를 위해 2분 지나면 풀린다.
  const gateFlowAt = useRef(0);
  const gateBusy = () => gateFlowAt.current > 0 && Date.now() - gateFlowAt.current < 120_000;
  // ★11/16 밤 게이트 흐름(탭→광고 준비·대체 창)이 도는 동안은 기존 사용자 체험 안내가 끼어들지 않게 앱 전역에도 알린다(lib/app/trialAnnounce)
  const gateFlowId = useRef(0);
  // ★11/17 게이트 페이월 자리(앱 전역 하나 — lib/app/gatePaywall gatePaywallSlot) — 이 게이트가 잡은 번호. 흐름 끝·언마운트에 놓는다
  const slotId = useRef(0);
  const releaseSlot = () => { gatePaywallSlot.release(slotId.current); slotId.current = 0; };
  // 대체 30초 창이 열린 동안 잡는 자리(관문 11170635 — 창이 열린 채 흐름 끝에 자리가 풀려 다른 게이트의 ad_nofill 이 겹치지 않게). 창 닫힘·언마운트에 놓는다
  const modalSlot = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      endGateFlow(gateFlowId.current); gateFlowId.current = 0; // 흐름 도중 화면을 떠났다 — 다른 게이트 탭을 2분 막지 않게
      gatePaywallSlot.release(slotId.current); slotId.current = 0;
      gatePaywallSlot.release(modalSlot.current); modalSlot.current = 0;
    };
  }, []);
  const endFlow = () => { gateFlowAt.current = 0; endGateFlow(gateFlowId.current); gateFlowId.current = 0; releaseSlot(); };
  /** 게이트 흐름의 대체 창 열기 — 이 게이트의 자리를 넘겨받거나(① 뒤) 새로 잡아 창 동안 유지(2분 상한 — 창이 닫힘 콜백 없이 사라져도 오래 남지 않게)
   *  자리를 못 잡으면(다른 게이트의 페이월·대체 창 흐름 중) 겹쳐 열지 않는다 — 그 흐름이 앱 전역 잠금을 연다(관문 11170640) */
  const openFallback = () => {
    if (!alive.current) return; // 언마운트 뒤 — 창도 자리도 만들지 않는다(정리 함수가 이미 돌아 자리가 남는다 — 관문 11170638)
    const own = slotId.current !== 0 && gatePaywallSlot.held(slotId.current);
    const id = own ? slotId.current : gatePaywallSlot.claim();
    if (!id) return;
    if (own) { gatePaywallSlot.unpin(id); slotId.current = 0; } // 흐름 끝(endFlow)에 풀리지 않게 창 몫으로 옮기고 2분 상한
    gatePaywallSlot.release(modalSlot.current);
    modalSlot.current = id;
    setShowAd(true);
  };
  const closeFallback = () => { gatePaywallSlot.release(modalSlot.current); modalSlot.current = 0; setShowAd(false); };

  /** PRO 여부를 «스토어에서 방금» 본다 — 'pro'(PRO 확인) · 'pending'(결제 진행 중) · 'free'(무료 확인) · 'unknown'(조회 실패·3초 초과) */
  //   ★11/16 밤 — 조회를 기다리는 동안 다른 경로(결제 SDK 알림·다른 게이트·광고 관리자)에서 PRO 로 바뀌었으면, 진행 중 조회가
  //   옛 무료 결과를 돌려줘도 'free' 로 판정하지 않는다 — 결과를 쓰기 «직전»에 최신 PRO 상태를 다시 본다.
  const proCheck = useCallback(() => checkStorePro({
    proNow: gateProNow,
    pending: () => proPurchaseState.getSnapshot(),
    // 광고 관리자 값은 SDK 를 따라가는 파생값 — 최신 SDK 응답이 무료면 믿지 않는다(늦게 따라오는 옛 PRO 로 탭이 멈추지 않게)
    adPro: async () => { const { adManager } = await import('@/services/adManager'); return storeProSignal.latest() !== false && adManager.isProActive(); },
    fetchPro: async () => (await import('@/services/revenueCat')).fetchProStatus(),
    markPro: markStorePro,
    markFree: (at) => { storeProSignal.revoke(at); },
    markAdPro: () => storeProSignal.latest() !== false && storeProSignal.mark(),
  }), [markStorePro]);
  /** 'free' 판정을 «쓰기 직전» 다시 확인 — 그 사이 PRO·결제 진행 중이면 페이월·하루 첫 노출 기록을 쓰지 않는다 */
  // ★11/16 밤 «페이월을 열어도 되는 무료» — 오늘 «새로 생긴 7일 무료 체험» 안내(trial_announce)가 떴으면 아니다.
  //   PRO 재조회를 기다리는 사이 그 안내가 먼저 열려도(표식은 보이기 직전에 남는다) 재조회 뒤 gate_first·ad_nofill 이 겹쳐 열리지 않는다(관문 11162016 ①)
  const stillFree = () => !gateProNow() && !proPurchaseState.getSnapshot() && !announcedTodaySafe();

  /** 광고 시도 → 안 나오면 (②) 페이월 또는 대체 창. 'paywall' = 페이월을 열었다(흐름이 닫힘까지 이어진다) */
  const runUnlock = useCallback(async (shownThisTap: boolean): Promise<'paywall' | 'done'> => {
    // State alone does not exclude two taps before React commits the next render.
    if (unlockPending.current) return 'done';
    unlockPending.current = true;
    setUnlocking(true);

    let native = false;
    try {
      const { Capacitor } = await import('@capacitor/core');
      native = Capacitor.isNativePlatform();
      if (native) {
        const { adManager } = await import('@/services/adManager');
        const reward = await adManager.showRewarded();
        if (reward) {
          // adManager grants once(앱 전역 키 = 1시간 전면 쉬기) and broadcasts signum:unlock.
          // ★11/20 잠금은 이 게이트의 범위만 연다 — 전역 키는 adManager 가 이미 썼다(writeGlobal=false).
          const others = unlock(false);
          trackFunnel('reward_ok', { src: 'value_wall' }); // ★11/20 계측만 — 보상형 광고를 끝까지 봐 1시간 잠금해제(하루 합계 · 식별자 없음)
          if (others > 0) trackFunnel('reward_ok', { src: 'rw_more' }); // ★11/20 계측만 — 다른 잠금이 이미 열린 채 또 열었다
          onUnlock?.();
          return 'done';
        }
        // The manager can return null when PRO activates during preparation.
        // Read its current policy state before opening the fallback portal.
        //   ★11/16 밤 — 단, 최신 스토어 응답(공유 신호)이 무료면 광고 관리자 PRO 는 옛 값(다른 훅이 늦게 따라옴) — 멈추지 않고 대체 경로로(잠긴 채 못 여는 상태 방지)
        if (adManager.isProActive() && storeProSignal.latest() !== false) return 'done';
      }
    } catch {
      // Browser previews and unavailable native ads fall back to the local modal.
    } finally {
      unlockPending.current = false;
      setUnlocking(false);
    }

    if (!alive.current || adUnlockedNow()) return 'done'; // ★11/17 광고를 기다리는 사이 화면을 떠났거나 잠금이 풀렸다 — 페이월·대체 창을 잇지 않는다
    // ② 네이티브에서 광고가 안 나왔다 — 대체 30초 창 «전에» 페이월 한 번(닫으면 대체 창 그대로)
    //   무료 확인 때만 페이월. PRO 면 멈춘다(재조회 PRO 는 storePro 로 잠금이 열린다) · 모름은 예전 그대로(대체 창)
    //   ★11/17 앱 전역 자리(gatePaywallSlot)를 재조회 «전»에 잡는다 — 다른 게이트의 페이월 흐름 중이면 페이월도 대체 창도 겹쳐 열지 않는다(그 흐름이 앱 전역 잠금을 연다)
    if (native) {
      const nf = await decideNoFillPaywall({
        state: () => gateRef.current, shownThisTap, slot: gatePaywallSlot, ownSlot: slotId.current, check: proCheck, proNow: gateProNow,
        stillFree: () => alive.current && !adUnlockedNow() && stillFree(), // 재조회 사이 화면을 떠났거나 다른 게이트 광고로 잠금이 풀렸으면 열지 않는다
      });
      if (nf.kind === 'pro' || nf.kind === 'busy') return 'done';
      if (nf.kind === 'paywall') {
        if (!alive.current) { gatePaywallSlot.release(nf.slot); return 'done'; } // 재조회 사이 화면을 떠났다 — 자리를 남기지 않는다
        releaseSlot();
        slotId.current = nf.slot;
        afterPaywall.current = 'fallback';
        setPaywallSrc('ad_nofill');
        setPaywallOpen(true);
        return 'paywall';
      }
    }
    // ★11/16 밤 — 광고를 기다리는 사이 다른 경로에서 PRO 로 확인됐으면 대체 창을 열지 않는다(잠금은 이미 열림)
    if (gateProNow()) return 'done';
    if (!alive.current || adUnlockedNow()) return 'done'; // ★11/17 재조회 사이 화면 이탈·잠금 해제 — 대체 창 안 엶(관문 11170647)
    openFallback();
    return 'done';
  }, [onUnlock, proCheck, unlock]);

  const handleUnlockPress = useCallback(async () => {
    if (unlockPending.current || gateBusy()) return;
    // ★11/17 다른 게이트의 흐름(재조회·광고 준비/표시·페이월)이 도는 중이면 이 탭은 넘긴다 — 게이트 흐름은 앱 전역 하나(관문 11170644 ①: A 광고 중 B 의 ad_nofill·gate_first 겹침)
    //   ★11/20 잠금해제는 범위마다(lib/app/adUnlockScope) — A 의 흐름은 A 만 연다. B 는 A 의 흐름이 끝난 뒤 다시 누르면 된다. 흐름 표식은 2분 상한·흐름 끝·언마운트에 지운다.
    if (gateFlowActive()) return;
    gateFlowAt.current = Date.now();
    endGateFlow(gateFlowId.current);
    gateFlowId.current = beginGateFlow();
    // ① 하루 첫 게이트 탭 — 광고 전에 페이월 한 번(닫으면 원래 누른 대로 광고가 이어진다)
    //   무료 확인 때만 페이월. PRO 면 멈춘다(재조회 PRO 는 storePro 로 잠금이 열린다) · 모름은 예전 흐름 그대로(광고 → 대체 창)
    //   ★11/17 앱 전역 자리(gatePaywallSlot)를 재조회 «전»에 선점 — 다른 게이트의 페이월 흐름이 진행 중이면 이 탭은 넘긴다(겹침 없음 · 그 흐름이 앱 전역 잠금을 연다).
    //   «오늘» 날짜는 실제로 여는 시점의 현지 날짜로 다시 판정·기록(자정 경계)
    const r = await decideFirstGatePaywall({
      state: () => gateRef.current, slot: gatePaywallSlot, check: proCheck, proNow: gateProNow,
      stillFree: () => alive.current && !adUnlockedNow() && stillFree(), // 재조회 사이 화면을 떠났거나 잠금이 풀렸으면 날짜를 기록하지 않는다(그날 기회 보존 — 관문 11170630 낮음·11170644)
      readDay: readGateDay, markDay: markGateDay,
      onChecking: setUnlocking, // 스토어 확인(보통 SDK 캐시 즉시) 동안 단추를 «잠시만»으로
    });
    if (r.kind === 'pro' || r.kind === 'busy' || !alive.current || adUnlockedNow()) { endFlow(); return; } // 재조회 사이 화면을 떠났으면 광고도 잇지 않는다(관문 11170635)
    if (r.kind === 'paywall') {
      if (!alive.current) { gatePaywallSlot.release(r.slot); endFlow(); return; } // 재조회 사이 화면을 떠났다 — 자리를 남기지 않는다
      slotId.current = r.slot;
      afterPaywall.current = 'ad';
      setPaywallSrc('gate_first');
      setPaywallOpen(true);
      return;
    }
    // ★11/16 밤 오늘 «새로 생긴 7일 무료 체험» 안내(trial_announce)를 봤으면 «이미 페이월 본 탭»과 같게 — 광고 없음(②)에도 페이월을 다시 들이밀지 않는다
    let announcedToday = false;
    try { announcedToday = trialAnnouncedToday(window.localStorage); } catch { /* 저장소 막힘 = 예전 그대로 */ }
    if ((await runUnlock(announcedToday)) !== 'paywall') endFlow();
  }, [runUnlock, proCheck]);

  const closePaywall = useCallback(() => {
    setPaywallOpen(false);
    const next = afterPaywall.current;
    afterPaywall.current = null;
    if (!next) return;
    gatePaywallSlot.unpin(slotId.current); // ★11/17 페이월은 닫혔다 — 이어 할 일 동안 자리는 2분 상한(흐름 끝 endFlow 에 해제)
    // 구매 성공으로 닫혔을 수 있다 — 스토어가 PRO 라 하면 광고·대체 창을 잇지 않는다.
    window.setTimeout(() => {
      void (async () => {
        try {
          // PRO 확인·결제 진행 중(막 결제함)이면 잇지 않는다. 조회 실패(unknown)는 무료 경로를 잇는다 — 광고 관리자가 PRO 면 스스로 거절한다
          const st = await proCheck();
          if (st === 'pro' || st === 'pending') return;
          if (gateProNow()) return; // 조회 뒤 다른 경로에서 PRO — 광고·대체 창 잇지 않음
          if (!alive.current || adUnlockedNow()) return; // ★11/17 조회 사이 화면을 떠났거나 잠금이 풀렸다 — 광고·대체 창 잇지 않음
          if (next === 'ad') await runUnlock(true);
          else openFallback();
        } finally {
          endFlow();
        }
      })();
    }, 300);
  }, [runUnlock, proCheck]);

  const openPaywall = useCallback((src?: unknown) => {
    afterPaywall.current = null; // 사용자가 직접 연 페이월 — 닫아도 이어 할 일 없음
    setPaywallSrc(typeof src === 'string' ? (src as FunnelSrc) : 'value_wall'); // 값 검증은 funnel.ts(isFunnelSrc)가 한다
    setPaywallOpen(true);
  }, []);

  const handleProPurchaseLegacy = useCallback(async () => {
    if (purchasing) return;
    setPurchasing(true);
    setProError(false);
    setProNothing(false);
    try {
      const res = await purchase();
      if (res.ok && res.isPro) { onUnlock?.(); return; }
      // Only real failures surface an error. user-cancel is silent; a rare
      // "purchased but entitlement not yet active" (ok:true) is left to the
      // customer-info listener to open the wall — not flagged as an error.
      if (!res.ok && !res.cancelled) setProError(true);
    } finally {
      setPurchasing(false);
    }
  }, [purchase, purchasing, onUnlock]);

  const handleRestore = useCallback(async () => {
    if (purchasing) return;
    setPurchasing(true);
    setProError(false);
    setProNothing(false);
    try {
      const res = await restore('value_wall');
      if (res.ok && res.isPro) { onUnlock?.(); return; }
      // Distinguish a successful no-op restore (nothing bought yet → neutral notice)
      // from a real failure (→ error). Both used to show the error message.
      if (res.ok) setProNothing(true);
      else setProError(true);
    } finally {
      setPurchasing(false);
    }
  }, [restore, purchasing, onUnlock]);


  const copyOut = copy;
  /* 광고 모달·구독 페이월은 호출부 어디에 있든 같아야 하므로 여기서 만들어 준다. */
  const portals = (
    <>
      {showAd && (
        <RewardedAdModal
          copy={copyOut}
          legalNote={copyOut.legalNote}
          onClose={closeFallback}
          onReward={finishUnlock}
          onUpgrade={iapAvailable ? () => openPaywall('ad_modal') : undefined}
        />
      )}
      {iapAvailable && paywallOpen && (
        <GatePaywall
          locale={resolveValueWallLocale(locale)}
          src={paywallSrc}
          onClose={closePaywall}
        />
      )}
    </>
  );

  return {
    // isPro 는 origin/main 그대로 이 훅의 값(대가 렌즈 PRO 전용 자리는 데이터도 proEntitlement 를 따르므로 이번 수리 범위 밖)
    isUnlocked, unlocked, isPro, iapAvailable,
    unlocking, purchasing, proError, proNothing,
    handleUnlockPress, openPaywall, handleRestore, finishUnlock,
    copy: copyOut, portals,
  };
}

interface TeaserSignal {
  label: string;
  value: string;
}

interface ValueWallProps {
  locale?: string;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  lockedPreview?: ReactNode;
  teaser?: TeaserSignal;
  socialProof?: string;
  onUnlock?: () => void;
  compact?: boolean;
  ctaLabel?: string;
  adFreeLabel?: string;
  previewChipLabel?: string;
  legalNote?: ReactNode;
  inset?: boolean;
  /** ★11/20 광고 잠금해제 범위(lib/app/adUnlockScope) — 없으면 제목. 같은 범위의 잠금끼리만 같이 열린다 */
  unlockScope?: string;
  /** ★11/20 이 잠금이 지금 열려 있나(광고 해제 «또는» PRO 구독·코드 — isUnlocked)를 바뀔 때마다 알린다.
   *  잠금 밖에서 같이 열리는 표시(flow 맥스페인 줄)가 이 잠금과 «같은 판정»을 쓰게 — PRO 인데 광고 해제 키만 봐서 흐리게 남지 않도록 */
  onOpenChange?: (open: boolean) => void;
}

export function ValueWall({
  locale,
  title,
  subtitle,
  children,
  lockedPreview,
  teaser,
  socialProof,
  onUnlock,
  compact = false,
  ctaLabel,
  previewChipLabel,
  legalNote,
  inset = false,
  unlockScope,
  onOpenChange,
}: ValueWallProps) {
  // NOTE: adFreeLabel prop is kept in ValueWallProps for caller compat but no longer
  // rendered — the paid upgrade is now the proCta button below the free ad CTA.
  // 동작은 useAdUnlockGate 한 곳에만 있다(9차 대시보드 게이트와 공유).
  const {
    isUnlocked, unlocking, purchasing, proError, proNothing, iapAvailable,
    handleUnlockPress, openPaywall, handleRestore, copy, portals,
  } = useAdUnlockGate(locale, onUnlock, unlockScope ?? title);
  useEffect(() => { onOpenChange?.(isUnlocked); }, [isUnlocked, onOpenChange]);
  const resolvedCtaLabel = ctaLabel || copy.ctaLabel;
  const resolvedPreviewChipLabel = previewChipLabel || copy.previewChipLabel;
  const resolvedLegalNote = legalNote || copy.legalNote;
  const preview = lockedPreview !== undefined ? lockedPreview : children;

  if (isUnlocked) {
    return (
      <div className={`${styles.revealed} ${compact ? styles.revealedCompact : ''} ${inset ? styles.inset : ''}`}>
        {children}
      </div>
    );
  }

  return (
    <div className={`${styles.vault} ${compact ? styles.compactVault : ''} ${inset ? styles.inset : ''}`}>
      <div className={styles.blurred} aria-hidden="true">
        {preview}
      </div>

      <div className={styles.veil}>
        {teaser && (
          <div className={styles.teaser}>
            <div>
              <div className={styles.teaserLabel}>{teaser.label}</div>
              <div className={styles.teaserValue}>{teaser.value}</div>
            </div>
            <span className={styles.teaserChip}>{resolvedPreviewChipLabel}</span>
          </div>
        )}

        <div className={styles.lockIcon}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="var(--amber)" strokeWidth="1.8" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </div>

        <div className={styles.title}>{title}</div>
        <div className={styles.sub}>{subtitle || copy.defaultSubtitle}</div>

        <button className={styles.cta} onClick={handleUnlockPress} disabled={unlocking}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#1a1206" aria-hidden="true">
            <path d="M7 5v14l11-7L7 5Z" />
          </svg>
          <span>{unlocking ? copy.modalWaitPrefix : resolvedCtaLabel}</span>
        </button>

        {/* 유료 광고제거. 살 수 없는 자리에선 아예 안 보인다(iapAvailable = IAP_LIVE && 네이티브).
            «가격은 있는데 못 산다»는 App Store 3.1.1 위반이다. 무료 광고 경로는 언제나 남는다. */}
        {iapAvailable && (
          <>
            <button className={styles.proCta} onClick={openPaywall} disabled={purchasing || unlocking}>
              <AdFreeIcon size={13} />
              <span>{purchasing ? copy.modalWaitPrefix : copy.proCta}</span>
            </button>
            {proError && <div className={styles.proError} role="alert">{copy.proErrorLabel}</div>}
            {proNothing && <div className={styles.proError} style={{ color: 'var(--text-muted)' }} role="status">{copy.proNothingLabel}</div>}
            <button className={styles.proRestore} onClick={handleRestore} disabled={purchasing}>
              {copy.proRestoreLabel}
            </button>
            {/* ★2026-10-05 «코드가 있으신가요? 🎟 쿠폰 코드 입력»(결제 단추보다 조용하게) */}
            <RedeemCodeLink locale={locale ?? 'en'} src="value_wall" />
          </>
        )}

        <div className={styles.metaRow}>
          {socialProof && <span><b>{socialProof}</b></span>}
        </div>
        <div className={styles.legalNote}>{resolvedLegalNote}</div>
      </div>

      {portals}
    </div>
  );
}

/* ★2026-09-29 — 게이트(ValueWall·9차 대시보드)에서 연 구독 페이월은 가운데 뜨는 카드(최대 88vh)라
   아래쪽의 «구매 복원·이용약관·개인정보» 줄이 네이티브 배너에 가렸다(애플 3.1.2 가 요구하는 줄이다).
   마운트된 동안 배너를 내린다. ProPaywall «안»에 넣지 않은 이유: 설정 화면도 ProPaywall 을 쓰는데
   설정은 화면 전체를 setBannerSuppressed(true) 로 이미 내려 두었다 — 페이월이 닫힐 때 이 훅이
   «억제 해제»를 보내면 설정 위로 배너가 다시 뜬다(설정의 억제는 훅의 개수 세기 밖이다). */
function GatePaywall(props: { locale: ValueWallLocale; onClose: () => void; src: FunnelSrc }) {
  useBannerSuppression(true);
  return <ProPaywall {...props} />;
}

function RewardedAdModal({
  copy,
  legalNote,
  onClose,
  onReward,
  onUpgrade,
}: {
  copy: typeof VALUE_WALL_COPY[ValueWallLocale];
  legalNote: ReactNode;
  onClose: () => void;
  onReward: () => void;
  onUpgrade?: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [canClose, setCanClose] = useState(false);
  // 네이티브 보상형이 없을 때 뜨는 대체 모달 — 마운트된 동안 배너를 내린다(아래 법적 고지·업셀 줄이 가려진다).
  // «광고 닫기 → 페이월 열기»(afterAdUpsell)는 한 커밋이라 열린 개수가 잠깐 0 이 되지만, adManager 가
  // 네이티브에 되살리기를 보내기 «직전»에 억제 여부를 다시 보므로 배너가 끼어들지 않는다
  // (scripts/test-banner-suppression.ts 「같은 커밋 닫힘→열림」).
  useBannerSuppression(true);

  useEffect(() => {
    const duration = 30_000;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const next = Math.min(100, ((Date.now() - startedAt) / duration) * 100);
      setProgress(next);
      if (next >= 100) {
        setCanClose(true);
        clearInterval(timer);
      }
    }, 250);

    return () => clearInterval(timer);
  }, []);

  const handleContinue = () => {
    onReward();
    onClose();
  };

  return (
    <div className={styles.scrim} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalEyebrow}>{copy.modalEyebrow}</div>
        <div className={styles.modalTitle}>{copy.modalTitle}</div>
        <div className={styles.modalSubtitle}>{copy.modalSubtitle}</div>

        <div className={styles.adPreview}>
          <div className={styles.adTimer}>{Math.ceil((100 - progress) * 0.3)}s</div>
          <div>{copy.adTimeLabel}</div>
        </div>

        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        {!canClose ? (
          <div className={styles.waiting}>{copy.modalWaitPrefix}...</div>
        ) : (
          <>
            <button className={styles.continueBtn} onClick={handleContinue}>
              {copy.continueLabel}
            </button>
            {/* 30초를 방금 참은 직후가 전환이 가장 높은 자리다. 밀지 않고 한 줄만 둔다. */}
            {onUpgrade && (
              <button
                type="button"
                className={styles.afterAdUpsell}
                onClick={() => { onClose(); onUpgrade(); }}
              >
                {copy.afterAdUpsell}
              </button>
            )}
          </>
        )}

        <div className={styles.modalLegal}>{legalNote}</div>
      </div>
    </div>
  );
}
