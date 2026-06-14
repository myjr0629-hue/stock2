'use client';
/* ============================================================
   04 — ValueWall v2 (드롭인 교체용 TSX)
   변경점 (REVIEW.md §1-2, §1-3, §3):
   1. 전역 잠금해제: useUnlockState() — localStorage 만료 타임스탬프,
      모든 ValueWall 인스턴스가 공유. 1시간 후 자동 재잠금.
   2. 잠금 상태에서 children을 마운트하지 않음 — `lockedPreview`로
      데모 데이터만 렌더 → API 호출/데이터 노출 차단.
   3. teaser prop — 블러 없이 노출하는 무료 시그널 1개 (훅 전략).
   4. RewardedAdModal은 기존 것 재사용 (import 경로만 맞추세요).
   ============================================================ */
import { useState, useEffect, useCallback, ReactNode } from 'react';
import styles from './ValueWall-v2.module.css';
// import { RewardedAdModal } from './RewardedAdModal'; // 기존 모달 분리 후 import

const UNLOCK_KEY = 'signum.unlockUntil';
const UNLOCK_MS = 60 * 60 * 1000; // 1 hour

/** 전역 잠금해제 상태 — 모든 ValueWall이 공유, 만료 자동 처리 */
export function useUnlockState() {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const check = () => {
      const until = Number(localStorage.getItem(UNLOCK_KEY) || 0);
      setUnlocked(Date.now() < until);
    };
    check();
    // 다른 인스턴스/탭에서의 해제 동기화
    window.addEventListener('storage', check);
    window.addEventListener('signum:unlock', check as EventListener);
    const t = setInterval(check, 30_000); // 만료 폴링
    return () => {
      window.removeEventListener('storage', check);
      window.removeEventListener('signum:unlock', check as EventListener);
      clearInterval(t);
    };
  }, []);

  const unlock = useCallback(() => {
    localStorage.setItem(UNLOCK_KEY, String(Date.now() + UNLOCK_MS));
    window.dispatchEvent(new Event('signum:unlock'));
    setUnlocked(true);
  }, []);

  return { unlocked, unlock };
}

interface TeaserSignal {
  label: string;   // e.g. 'GAMMA FLIP · 1 OF 6 SIGNALS FREE'
  value: string;   // e.g. '$132.50'
}

interface ValueWallProps {
  title: string;
  subtitle?: ReactNode;
  /** 해제 시 렌더할 실제 콘텐츠 (잠금 중에는 마운트되지 않음) */
  children: ReactNode;
  /** 잠금 중 블러 뒤에 보여줄 데모/플레이스홀더 — 실데이터 금지 */
  lockedPreview: ReactNode;
  /** 블러 없이 노출하는 무료 시그널 1개 */
  teaser?: TeaserSignal;
  socialProof?: string; // e.g. '12,400 unlocked today'
  onUnlock?: () => void;
}

export function ValueWall({
  title, subtitle, children, lockedPreview, teaser, socialProof, onUnlock,
}: ValueWallProps) {
  const [showAd, setShowAd] = useState(false);
  const { unlocked, unlock } = useUnlockState();

  if (unlocked) {
    return <div className={styles.revealed}>{children}</div>;
  }

  return (
    <div className={styles.vault}>
      {/* 잠금 중: 데모 데이터만 — children은 마운트하지 않음 */}
      <div className={styles.blurred} aria-hidden="true">{lockedPreview}</div>

      <div className={styles.veil}>
        {teaser && (
          <div className={styles.teaser}>
            <div>
              <div className={styles.teaserLabel}>{teaser.label}</div>
              <div className={styles.teaserValue}>{teaser.value}</div>
            </div>
            <span className={styles.teaserChip}>FREE PREVIEW</span>
          </div>
        )}

        <div className={styles.lockIcon}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="5" y="11" width="14" height="9" rx="2" stroke="var(--amber)" strokeWidth="1.8"/>
            <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>

        <div className={styles.title}>{title}</div>
        <div className={styles.sub}>
          {subtitle || <>5 more live signals behind the wall — updating <b>right now</b>. 30-second video unlocks everything for 1 hour.</>}
        </div>

        <button className={styles.cta} onClick={() => setShowAd(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#1a1206"><path d="M7 5v14l11-7L7 5Z"/></svg>
          Watch &amp; Unlock · 1HR
        </button>

        <div className={styles.metaRow}>
          {socialProof && <><span><b>{socialProof}</b></span><span>·</span></>}
          <span>or <b>$9.99/mo</b> ad-free</span>
        </div>
      </div>

      {showAd && (
        /* 기존 RewardedAdModal 재사용 */
        <RewardedAdModalPlaceholder
          onClose={() => setShowAd(false)}
          onReward={() => { unlock(); onUnlock?.(); }}
        />
      )}
    </div>
  );
}

/* 기존 ValueWall.tsx의 RewardedAdModal을 별도 파일로 분리해 import하고,
   이 플레이스홀더는 삭제하세요. */
function RewardedAdModalPlaceholder(_: { onClose: () => void; onReward: () => void }) {
  return null;
}
