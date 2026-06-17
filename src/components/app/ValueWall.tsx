'use client';

import { useState, useEffect, useCallback, ReactNode } from 'react';
import styles from './ValueWall.module.css';

const UNLOCK_KEY = 'signum_ad_unlock';
const UNLOCK_MS = 60 * 60 * 1000; // 1 hour

/** 전역 잠금해제 상태 — 모든 ValueWall이 공유, 만료 자동 처리 */
export function useUnlockState() {
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const check = () => {
      const raw = localStorage.getItem(UNLOCK_KEY);
      if (!raw) { setUnlocked(false); return; }
      try {
        // Support both formats: adManager JSON and legacy raw timestamp
        const parsed = JSON.parse(raw);
        const until = parsed.unlockedUntil || parsed;
        setUnlocked(Date.now() < Number(until));
      } catch {
        // Legacy format: raw timestamp string
        setUnlocked(Date.now() < Number(raw));
      }
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
    const state = { unlockedUntil: Date.now() + UNLOCK_MS, tier: 'premium' };
    localStorage.setItem(UNLOCK_KEY, JSON.stringify(state));
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
  children?: ReactNode;
  /** 잠금 중 블러 뒤에 보여줄 데모/플레이스홀더 — 실데이터 금지 */
  lockedPreview?: ReactNode;
  /** 블러 없이 노출하는 무료 시그널 1개 */
  teaser?: TeaserSignal;
  socialProof?: string; // e.g. '12,400 unlocked today'
  onUnlock?: () => void;
}

export function ValueWall({
  title,
  subtitle,
  children,
  lockedPreview,
  teaser,
  socialProof,
  onUnlock,
}: ValueWallProps) {
  const [showAd, setShowAd] = useState(false);
  const { unlocked, unlock } = useUnlockState();

  if (unlocked) {
    return <div className={styles.revealed}>{children}</div>;
  }

  // Fallback to children for preview if no custom lockedPreview is supplied (backward compatibility)
  const preview = lockedPreview !== undefined ? lockedPreview : children;

  return (
    <div className={styles.vault}>
      {/* 잠금 중: 데모 데이터만 — children은 마운트하지 않음 */}
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#1a1206">
            <path d="M7 5v14l11-7L7 5Z"/>
          </svg>
          Watch &amp; Unlock · 1HR
        </button>

        <div className={styles.metaRow}>
          {socialProof && <><span><b>{socialProof}</b></span><span>·</span></>}
          <span>or <b>$9.99/mo</b> ad-free</span>
        </div>
      </div>

      {showAd && (
        <RewardedAdModal
          onClose={() => setShowAd(false)}
          onReward={() => { unlock(); onUnlock?.(); }}
        />
      )}
    </div>
  );
}

function RewardedAdModal({ onClose, onReward }: { onClose: () => void; onReward: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const DURATION = 30;

  // Demo: run 4.5 seconds mapped to 30s visual countdown
  useEffect(() => {
    const start = Date.now();
    const realMs = 4500;
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / realMs);
      setElapsed(p * DURATION);
      if (p >= 1) {
        clearInterval(id);
        setDone(true);
      }
    }, 50);
    return () => clearInterval(id);
  }, []);

  const remain = Math.ceil(DURATION - elapsed);
  const pct = (elapsed / DURATION) * 100;
  const R = 20;
  const C = 2 * Math.PI * R;

  return (
    <div
      className={styles.scrim}
      onClick={(e) => { if (e.target === e.currentTarget && done) onClose(); }}
    >
      <div className={styles.modal}>
        {!done ? (
          <>
            <div className={styles.eyebrow}>REWARDED · ADMOB</div>
            <div className={styles.modalTitle}>Unlocking premium intel</div>
            <div className={styles.adPlay}>
              <svg width="52" height="52" viewBox="0 0 52 52">
                <circle
                  cx="26" cy="26" r={R}
                  stroke="rgba(255,255,255,0.12)" strokeWidth="4" fill="none"
                />
                <circle
                  cx="26" cy="26" r={R}
                  stroke="var(--cyan)" strokeWidth="4" fill="none"
                  strokeDasharray={C}
                  strokeDashoffset={C - (pct / 100) * C}
                  strokeLinecap="round"
                  transform="rotate(-90 26 26)"
                  style={{ transition: 'stroke-dashoffset .1s linear' }}
                />
              </svg>
              <div className={styles.adTime}>
                Ad · 0:{String(Math.max(0, remain)).padStart(2, '0')}
              </div>
              <div className={styles.adProgress} style={{ width: pct + '%' }} />
            </div>
            <div className={styles.modalSub}>
              Watch the full ad to unlock all premium content for 1 hour.
            </div>
            <button className={styles.modalBtn} disabled>
              Please wait… {remain}s
            </button>
          </>
        ) : (
          <>
            <div className={styles.unlockedBanner}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <path
                  d="m5 13 4 4 10-11"
                  stroke="var(--green)" strokeWidth="2.4"
                  strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
              Unlocked for 1:00:00
            </div>
            <div className={styles.modalTitle}>Premium intel is live</div>
            <div className={styles.modalSub}>
              Dark-pool prints, full options chains and AI signals are now unlocked across the app.
            </div>
            <button
              className={`${styles.modalBtn} ${styles.modalBtnActive}`}
              onClick={() => { onReward(); onClose(); }}
            >
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
