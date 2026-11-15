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
import { localDay, markGateDay, readGateDay, shouldShowFirstGatePaywall, shouldShowNoFillPaywall, storeProSignal, checkStorePro } from '@/lib/app/gatePaywall';

const UNLOCK_KEY = 'signum_ad_unlock';
const UNLOCK_MS = 60 * 60 * 1000;

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

export function useUnlockState() {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const check = () => {
      const raw = localStorage.getItem(UNLOCK_KEY);
      if (!raw) {
        setUnlocked(false);
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        const until = parsed.unlockedUntil || parsed;
        setUnlocked(Date.now() < Number(until));
      } catch {
        setUnlocked(Date.now() < Number(raw));
      }
    };

    check();
    window.addEventListener('storage', check);
    window.addEventListener('signum:unlock', check as EventListener);
    const timer = setInterval(check, 30_000);

    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener('signum:unlock', check as EventListener);
      clearInterval(timer);
    };
  }, []);

  const unlock = useCallback(() => {
    const state = { unlockedUntil: Date.now() + UNLOCK_MS, tier: 'premium' };
    localStorage.setItem(UNLOCK_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event('signum:unlock'));
    setUnlocked(true);
  }, []);

  return { unlocked, unlock };
}

/* ── 광고 언락 게이트의 «동작»만 떼어낸 훅 ─────────────────────────────────
   9차 대시보드 게이트는 시안 레이아웃이 ValueWall 과 근본적으로 다르다
   (1번 신호는 안 가리고, 2~4번만 셔머 막대). 그래도 결제·광고 흐름은
   두 벌이 되면 안 되므로 ValueWall 과 «같은 코드»를 쓰게 여기서 내보낸다.
   ValueWall 자신도 이 훅을 쓴다 — 동작은 한 곳에만 있다.            */
export function useAdUnlockGate(locale?: string, onUnlock?: () => void) {
  const [showAd, setShowAd] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const unlockPending = useRef(false);
  const [purchasing, setPurchasing] = useState(false);
  const [proError, setProError] = useState(false);
  const [proNothing, setProNothing] = useState(false); // successful restore that found no entitlement
  const { unlocked, unlock } = useUnlockState();
  // Pro (paid, ad-free) is inert while IAP_LIVE=false: isPro stays false, no SDK.
  const { isPro, ready, offers, purchase, restore, iapAvailable } = useProStatus();
  // ★11/16 게이트 흐름의 스토어 재조회(proCheck)가 PRO 를 확인했는데 이 훅의 isPro 가 아직 무료면(초기 조회 실패·갱신 지연) 그 값으로 연다 — 잠금에 가두지 않는다
  //   광고 잠금해제와 같은 1시간만 유효(그 사이 만료·회수돼도 영구히 열린 채 남지 않게) — 그 뒤는 훅의 isPro(스토어 갱신)를 따른다.
  //   ★11/16 밤 — 확인된 PRO 는 모듈 신호(storeProSignal)로 «모든 게이트»가 같이 본다: 다른 탭에서 새로 마운트된 게이트도
  //   초기 조회가 실패하든 말든 즉시 PRO 로 열린다(전에는 이 훅 안에만 남아 새 게이트가 PRO 사용자를 다시 잠갔다).
  const [storeProUntil, setStoreProUntil] = useState(() => storeProSignal.until());
  const markStorePro = useCallback((at: number) => { storeProSignal.mark(at); }, []);
  useEffect(() => {
    setStoreProUntil(storeProSignal.until()); // 첫 렌더 ~ 구독 사이에 다른 게이트가 표시한 값도 받는다
    return storeProSignal.subscribe(() => setStoreProUntil(storeProSignal.until()));
  }, []);
  //   (이 훅의 스토어 PRO·무료 응답은 useProStatus 가 조회 시작 시각과 함께 신호에 기록한다 — 회수도 거기서)
  //   storePro 는 신호의 «지금» 값만 본다(회수 직후 이 훅의 옛 만료 시각으로 열린 채 남지 않게). storeProUntil 은 다시 그리기용.
  const storePro = storeProUntil > 0 && storeProSignal.active();
  useEffect(() => {
    if (!storeProUntil) return;
    const t = window.setTimeout(() => setStoreProUntil(0), Math.max(0, storeProUntil - Date.now()));
    return () => window.clearTimeout(t);
  }, [storeProUntil]);
  // A Pro subscriber bypasses the wall permanently (no ad, no timer).
  const isUnlocked = unlocked || isPro || storePro;
  const copy = VALUE_WALL_COPY[resolveValueWallLocale(locale)];

  // ★11/16 게이트 «가치 순간» 페이월(lib/app/gatePaywall) — 페이월을 닫은 «뒤»에 이어 할 일(광고 / 대체 창).
  //   콜백 안에서 최신 PRO 상태를 읽도록 ref 로 둔다(구매 성공으로 닫힌 경우 광고를 이어 붙이지 않는다).
  //   스토어 가격(offers)을 못 받았으면 «살 수 없는 페이월»이라 끼워 넣지 않는다(iapAvailable 에 묶는다).
  const sellable = iapAvailable && offers.length > 0;
  const gateRef = useRef({ iapAvailable: sellable, ready, isPro: isPro || storePro });
  gateRef.current = { iapAvailable: sellable, ready, isPro: isPro || storePro };
  const afterPaywall = useRef<null | 'ad' | 'fallback'>(null);

  const finishUnlock = useCallback(() => {
    unlock();
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
  const endFlow = () => { gateFlowAt.current = 0; };

  /** PRO 여부를 «스토어에서 방금» 본다 — 'pro'(PRO 확인) · 'pending'(결제 진행 중) · 'free'(무료 확인) · 'unknown'(조회 실패·3초 초과) */
  //   ★11/16 밤 — 조회를 기다리는 동안 다른 경로(결제 SDK 알림·다른 게이트·광고 관리자)에서 PRO 로 바뀌었으면, 진행 중 조회가
  //   옛 무료 결과를 돌려줘도 'free' 로 판정하지 않는다 — 결과를 쓰기 «직전»에 최신 PRO 상태를 다시 본다.
  const proCheck = useCallback(() => checkStorePro({
    proNow: () => gateRef.current.isPro || storeProSignal.active(),
    pending: () => proPurchaseState.getSnapshot(),
    adPro: async () => (await import('@/services/adManager')).adManager.isProActive(),
    fetchPro: async () => (await import('@/services/revenueCat')).fetchProStatus(),
    markPro: markStorePro,
    markFree: (at) => { storeProSignal.revoke(at); },
    // 광고 관리자 PRO(결제 SDK 를 따라가는 파생값) — 가장 늦은 SDK 응답이 무료가 아닐 때만 잠금 해제(회수 직후 늦게 따라오는 값으로 되살리지 않음)
    markAdPro: () => { if (storeProSignal.latest() !== false) storeProSignal.mark(); },
  }), [markStorePro]);
  /** 'free' 판정을 «쓰기 직전» 다시 확인 — 그 사이 PRO·결제 진행 중이면 페이월·하루 첫 노출 기록을 쓰지 않는다 */
  const stillFree = () => !gateRef.current.isPro && !storeProSignal.active() && !proPurchaseState.getSnapshot();

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
          // adManager grants once and broadcasts signum:unlock to update the wall.
          onUnlock?.();
          return 'done';
        }
        // The manager can return null when PRO activates during preparation.
        // Read its current policy state before opening the fallback portal.
        if (adManager.isProActive()) return 'done';
      }
    } catch {
      // Browser previews and unavailable native ads fall back to the local modal.
    } finally {
      unlockPending.current = false;
      setUnlocking(false);
    }

    // ② 네이티브에서 광고가 안 나왔다 — 대체 30초 창 «전에» 페이월 한 번(닫으면 대체 창 그대로)
    if (native && shouldShowNoFillPaywall(gateRef.current, shownThisTap)) {
      // 무료 확인 때만 페이월. PRO 면 멈춘다(재조회 PRO 는 storePro 로 잠금이 열린다) · 모름은 예전 그대로(대체 창)
      const st = await proCheck();
      if (st === 'pro' || (st === 'free' && (gateRef.current.isPro || storeProSignal.active()))) return 'done';
      if (st === 'free' && stillFree()) {
        afterPaywall.current = 'fallback';
        setPaywallSrc('ad_nofill');
        setPaywallOpen(true);
        return 'paywall';
      }
    }
    setShowAd(true);
    return 'done';
  }, [onUnlock, proCheck]);

  const handleUnlockPress = useCallback(async () => {
    if (unlockPending.current || gateBusy()) return;
    gateFlowAt.current = Date.now();
    // ① 하루 첫 게이트 탭 — 광고 전에 페이월 한 번(닫으면 원래 누른 대로 광고가 이어진다)
    const today = localDay();
    const first = shouldShowFirstGatePaywall(gateRef.current, readGateDay(), today);
    if (first) setUnlocking(true); // 스토어 확인(보통 SDK 캐시 즉시) 동안 단추를 «잠시만»으로
    const st = first ? await proCheck() : null;
    if (first) setUnlocking(false);
    // 무료 확인 때만 페이월. PRO 면 멈춘다(재조회 PRO 는 storePro 로 잠금이 열린다) · 모름은 예전 흐름 그대로(광고 → 대체 창)
    if (st === 'pro' || (st !== null && (gateRef.current.isPro || storeProSignal.active()))) { endFlow(); return; }
    const open = st === 'free' && stillFree() && markGateDay(today);
    if (open) {
      afterPaywall.current = 'ad';
      setPaywallSrc('gate_first');
      setPaywallOpen(true);
      return;
    }
    if ((await runUnlock(false)) !== 'paywall') endFlow();
  }, [runUnlock, proCheck]);

  const closePaywall = useCallback(() => {
    setPaywallOpen(false);
    const next = afterPaywall.current;
    afterPaywall.current = null;
    if (!next) return;
    // 구매 성공으로 닫혔을 수 있다 — 스토어가 PRO 라 하면 광고·대체 창을 잇지 않는다.
    window.setTimeout(() => {
      void (async () => {
        try {
          // PRO 확인·결제 진행 중(막 결제함)이면 잇지 않는다. 조회 실패(unknown)는 무료 경로를 잇는다 — 광고 관리자가 PRO 면 스스로 거절한다
          const st = await proCheck();
          if (st === 'pro' || st === 'pending') return;
          if (gateRef.current.isPro || storeProSignal.active()) return; // 조회 뒤 다른 경로에서 PRO — 광고·대체 창 잇지 않음
          if (next === 'ad') await runUnlock(true);
          else setShowAd(true);
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
          onClose={() => setShowAd(false)}
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
    // ★11/16 밤 — PRO 전용 자리(대가 렌즈 4~10위)도 공유 PRO 를 본다(그 훅의 초기 조회 실패에 PRO 를 가두지 않음)
    isUnlocked, unlocked, isPro: isPro || storePro, iapAvailable,
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
}: ValueWallProps) {
  // NOTE: adFreeLabel prop is kept in ValueWallProps for caller compat but no longer
  // rendered — the paid upgrade is now the proCta button below the free ad CTA.
  // 동작은 useAdUnlockGate 한 곳에만 있다(9차 대시보드 게이트와 공유).
  const {
    isUnlocked, unlocking, purchasing, proError, proNothing, iapAvailable,
    handleUnlockPress, openPaywall, handleRestore, copy, portals,
  } = useAdUnlockGate(locale, onUnlock);
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
