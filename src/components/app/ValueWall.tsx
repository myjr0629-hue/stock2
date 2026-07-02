'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import styles from './ValueWall.module.css';

const UNLOCK_KEY = 'signum_ad_unlock';
const UNLOCK_MS = 60 * 60 * 1000;

// The paid ad-removal / Pro upsell (e.g. "$9.99/mo ad-free") is NOT shipped yet —
// no billing is wired. Showing a non-purchasable price fails App Store 3.1.1 /
// Play review, so hide the upsell line until IAP goes live. Flip to true when the
// Pro subscription is implemented and store products are configured.
const IAP_LIVE = false;

type ValueWallLocale = 'ko' | 'en' | 'ja';

const VALUE_WALL_COPY: Record<ValueWallLocale, {
  defaultSubtitle: ReactNode;
  ctaLabel: string;
  adFreeLabel: string;
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
}> = {
  ko: {
    defaultSubtitle: <>광고를 시청하면 프리미엄 리서치 데이터를 1시간 동안 확인할 수 있습니다.</>,
    ctaLabel: '광고 보고 1시간 잠금해제',
    adFreeLabel: '또는 월 $9.99로 광고 제거',
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
  },
  en: {
    defaultSubtitle: <>Watch an ad to unlock premium research data for 1 hour.</>,
    ctaLabel: 'Watch & Unlock · 1HR',
    adFreeLabel: 'or $9.99/mo ad-free',
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
  },
  ja: {
    defaultSubtitle: <>広告を視聴すると、プレミアムリサーチデータを1時間確認できます。</>,
    ctaLabel: '広告を見て1時間解除',
    adFreeLabel: 'または月$9.99で広告なし',
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
  adFreeLabel,
  previewChipLabel,
  legalNote,
  inset = false,
}: ValueWallProps) {
  const [showAd, setShowAd] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const { unlocked, unlock } = useUnlockState();
  const copy = VALUE_WALL_COPY[resolveValueWallLocale(locale)];
  const resolvedCtaLabel = ctaLabel || copy.ctaLabel;
  const resolvedAdFreeLabel = adFreeLabel || copy.adFreeLabel;
  const resolvedPreviewChipLabel = previewChipLabel || copy.previewChipLabel;
  const resolvedLegalNote = legalNote || copy.legalNote;
  const preview = lockedPreview !== undefined ? lockedPreview : children;

  const finishUnlock = useCallback(() => {
    unlock();
    onUnlock?.();
  }, [onUnlock, unlock]);

  const handleUnlockPress = useCallback(async () => {
    if (unlocking) return;
    setUnlocking(true);

    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { adManager } = await import('@/services/adManager');
        const reward = await adManager.showRewarded();
        if (reward) {
          finishUnlock();
          return;
        }
      }
    } catch {
      // Browser previews and unavailable native ads fall back to the local modal.
    } finally {
      setUnlocking(false);
    }

    setShowAd(true);
  }, [finishUnlock, unlocking]);

  if (unlocked) {
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

        <div className={styles.metaRow}>
          {socialProof && <span><b>{socialProof}</b></span>}
          {IAP_LIVE && (
            <>
              {socialProof && <span>·</span>}
              <span>{resolvedAdFreeLabel}</span>
            </>
          )}
        </div>
        <div className={styles.legalNote}>{resolvedLegalNote}</div>
      </div>

      {showAd && (
        <RewardedAdModal
          copy={copy}
          legalNote={resolvedLegalNote}
          onClose={() => setShowAd(false)}
          onReward={finishUnlock}
        />
      )}
    </div>
  );
}

function RewardedAdModal({
  copy,
  legalNote,
  onClose,
  onReward,
}: {
  copy: typeof VALUE_WALL_COPY[ValueWallLocale];
  legalNote: ReactNode;
  onClose: () => void;
  onReward: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [canClose, setCanClose] = useState(false);

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
          <button className={styles.continueBtn} onClick={handleContinue}>
            {copy.continueLabel}
          </button>
        )}

        <div className={styles.modalLegal}>{legalNote}</div>
      </div>
    </div>
  );
}
