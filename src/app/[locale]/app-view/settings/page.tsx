'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { IAP_LIVE } from '@/config/iap';
import { useProStatus } from '@/hooks/useProStatus';
import { openExternalUrl, canRequestReview, requestAppReview } from '@/lib/native/capacitorBridge';
import s from './settings.module.css';

// ── Translations ──
const T: Record<string, {
  title: string;
  language: string;
  notifications: string;
  notifSub: string;
  morning: string;
  morningSub: string;
  closing: string;
  closingSub: string;
  cache: string;
  cacheSub: string;
  rate: string;
  rateSub: string;
  terms: string;
  privacy: string;
  cacheDialogTitle: string;
  cacheDialogText: string;
  cacheCancel: string;
  cacheConfirm: string;
  cacheToast: string;
  proTitle: string;
  proUpgradeSub: string;
  proActiveSub: string;
  proCta: string;
  proRestore: string;
  proManage: string;
  proActiveBadge: string;
  proRestoredToast: string;
  proNothingToRestoreToast: string;
  proErrorToast: string;
  ucSub: string;
}> = {
  ko: {
    title: '설정',
    language: '언어',
    notifications: '알림',
    notifSub: '푸시 알림을 설정합니다',
    morning: '모닝 브리핑',
    morningSub: '장 전 시장 요약 알림',
    closing: '장마감 리포트',
    closingSub: '장마감 후 분석 리포트 알림',
    cache: '캐시 초기화',
    cacheSub: '임시 데이터를 삭제합니다',
    rate: '앱 평가하기',
    rateSub: 'App Store에서 별점 남기기',
    terms: '이용약관',
    privacy: '개인정보 처리방침',
    cacheDialogTitle: '캐시 초기화',
    cacheDialogText: '캐시된 데이터가 삭제됩니다. 앱이 다시 로드됩니다.',
    cacheCancel: '취소',
    cacheConfirm: '초기화',
    cacheToast: '캐시가 초기화되었습니다',
    proTitle: 'SIGNUM Pro',
    proUpgradeSub: '광고 없이 · 월 $9.99',
    proActiveSub: '광고 없이 이용 중',
    proCta: '업그레이드',
    proRestore: '구매 복원',
    proManage: '구독 관리',
    proActiveBadge: '활성',
    proRestoredToast: '구매가 복원되었습니다',
    proNothingToRestoreToast: '복원할 구매 내역이 없어요',
    proErrorToast: '구매를 완료하지 못했어요',
    ucSub: '뉴스 뒤의 돈 · 무료',
  },
  en: {
    title: 'Settings',
    language: 'Language',
    notifications: 'Notifications',
    notifSub: 'Configure push notifications',
    morning: 'Morning Briefing',
    morningSub: 'Pre-market summary alert',
    closing: 'Closing Report',
    closingSub: 'Post-market analysis alert',
    cache: 'Clear Cache',
    cacheSub: 'Delete temporary data',
    rate: 'Rate SIGNUM HQ',
    rateSub: 'Leave a rating on the App Store',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    cacheDialogTitle: 'Clear Cache',
    cacheDialogText: 'Cached data will be deleted. The app will reload.',
    cacheCancel: 'Cancel',
    cacheConfirm: 'Clear',
    cacheToast: 'Cache cleared successfully',
    proTitle: 'SIGNUM Pro',
    proUpgradeSub: 'Ad-free · $9.99/mo',
    proActiveSub: 'Ad-free is active',
    proCta: 'Upgrade',
    proRestore: 'Restore purchase',
    proManage: 'Manage subscription',
    proActiveBadge: 'Active',
    proRestoredToast: 'Purchase restored',
    proNothingToRestoreToast: 'No previous purchase to restore',
    proErrorToast: "Couldn't complete the purchase",
    ucSub: 'The news behind the money · Free',
  },
  ja: {
    title: '設定',
    language: '言語',
    notifications: '通知',
    notifSub: 'プッシュ通知の設定',
    morning: 'モーニングブリーフ',
    morningSub: 'プレマーケットサマリー通知',
    closing: 'クロージングレポート',
    closingSub: '引け後の分析レポート通知',
    cache: 'キャッシュクリア',
    cacheSub: '一時データを削除します',
    rate: 'アプリを評価',
    rateSub: 'App Storeで評価する',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    cacheDialogTitle: 'キャッシュクリア',
    cacheDialogText: 'キャッシュデータが削除されます。アプリが再読み込みされます。',
    cacheCancel: 'キャンセル',
    proTitle: 'SIGNUM Pro',
    proUpgradeSub: '広告なし · 月$9.99',
    proActiveSub: '広告なしで利用中',
    proCta: 'アップグレード',
    proRestore: '購入を復元',
    proManage: 'サブスク管理',
    proActiveBadge: '有効',
    proRestoredToast: '購入を復元しました',
    proNothingToRestoreToast: '復元できる購入履歴がありません',
    proErrorToast: '購入を完了できませんでした',
    cacheConfirm: 'クリア',
    cacheToast: 'キャッシュをクリアしました',
    ucSub: 'ニュースの裏側のお金 · 無料',
  },
};

// Order: English → Japanese → Korean
const LANGS = [
  { code: 'en', flag: '🇺🇸', name: 'English' },
  { code: 'ja', flag: '🇯🇵', name: '日本語' },
  { code: 'ko', flag: '🇰🇷', name: '한국어' },
];

const PREFS_KEY = 'signumhq.push.prefs';

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: true, morning: true, closing: true };
}

function savePrefs(prefs: { enabled: boolean; morning: boolean; closing: boolean }) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

function getCurrentLang(locale: string) {
  return LANGS.find(l => l.code === locale) ?? LANGS[0];
}

export default function SettingsPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = T[locale] ?? T.en;

  const [prefs, setPrefs] = useState({ enabled: true, morning: true, closing: true });
  const [showCacheDialog, setShowCacheDialog] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  // Pro (ad-free) — inert while IAP_LIVE=false (isPro false, no SDK, card hidden).
  const { isPro, purchase, restore } = useProStatus();
  const [proBusy, setProBusy] = useState(false);

  // In-app review — only show the row when the native plugin is present in the
  // binary (current v1.0 shell lacks it → row stays hidden until the v1.1 build).
  const [canRate, setCanRate] = useState(false);
  // Companion-app cross-promo (Undercurrent) — shown on iOS + web; hidden on native
  // Android until UC's Play listing is live (in review) to avoid a 404 on tap.
  const [showUc, setShowUc] = useState(true);

  const handleProUpgrade = useCallback(async () => {
    if (proBusy || isPro) return;
    setProBusy(true);
    try {
      const res = await purchase();
      if (!res.ok && !res.cancelled) setToastMsg(t.proErrorToast);
    } finally { setProBusy(false); }
  }, [purchase, proBusy, isPro, t]);

  const handleProRestore = useCallback(async () => {
    if (proBusy) return;
    setProBusy(true);
    try {
      const res = await restore();
      // 3-way: restored (ok+Pro) / nothing to restore (ok, no entitlement) / real failure.
      setToastMsg(res.ok && res.isPro ? t.proRestoredToast : res.ok ? t.proNothingToRestoreToast : t.proErrorToast);
    } finally { setProBusy(false); }
  }, [restore, proBusy, t]);

  const handleManageSub = useCallback(() => {
    const isIOS = typeof document !== 'undefined' && document.documentElement.classList.contains('native-ios');
    openExternalUrl(isIOS
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions');
  }, []);

  // Cross-promo → Undercurrent store (device-aware smart link, ?from tagged for attribution).
  const handleOpenUc = useCallback(() => {
    openExternalUrl('https://www.signumhq.com/app-uc?from=signum_app');
  }, []);

  // Swipe-down tracking
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    setPrefs(loadPrefs());
    setCanRate(canRequestReview());
    setShowUc(!document.documentElement.classList.contains('native-android'));
  }, []);

  const updatePrefs = useCallback((patch: Partial<typeof prefs>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      const token = localStorage.getItem('signumhq.push.token');
      if (token) {
        fetch('/api/push/preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, morning: next.morning, closing: next.closing }),
        }).catch(() => {});
      }
      return next;
    });
  }, []);

  const handleLangChange = (code: string) => {
    if (code === locale) return;
    setLangOpen(false);
    // Remember the user's EXPLICIT choice so the native app honors it over the
    // device language on the next cold launch (see app-view/layout.tsx).
    try { localStorage.setItem('signumhq.app.locale', code); } catch { /* storage unavailable */ }
    const currentPath = window.location.pathname;
    const newPath = currentPath.replace(/^\/(ko|en|ja)/, `/${code}`);
    router.push(newPath);
  };

  const handleClearCache = () => {
    setShowCacheDialog(false);
    try {
      const keysToKeep = ['signumhq.app.onboarding.v1', 'signumhq.push.prefs', 'signumhq.push.token'];
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(k => {
        if (!keysToKeep.includes(k)) localStorage.removeItem(k);
      });
    } catch {}
    try { sessionStorage.clear(); } catch {}
    setToastMsg(t.cacheToast);
    setTimeout(() => window.location.reload(), 1500);
  };

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      router.push(`/${locale}/app-view/dash`);
    }, 250);
  }, [locale, router]);

  // Touch handlers for swipe-down to dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = sheetRef.current;
    if (!el) return;
    // Only allow drag from top of sheet (scroll position 0)
    if (el.scrollTop > 5) return;
    startYRef.current = e.touches[0].clientY;
    isDraggingRef.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta < 0) return; // Only track downward swipe
    currentYRef.current = delta;
    const el = sheetRef.current;
    if (el) {
      el.style.transform = `translateY(${delta}px)`;
      el.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const el = sheetRef.current;
    if (!el) return;
    
    if (currentYRef.current > 120) {
      // Dismiss
      el.style.transition = 'transform 0.25s ease';
      el.style.transform = 'translateY(100%)';
      setTimeout(() => {
        router.push(`/${locale}/app-view/dash`);
      }, 250);
    } else {
      // Snap back
      el.style.transition = 'transform 0.2s ease';
      el.style.transform = 'translateY(0)';
    }
    currentYRef.current = 0;
  }, [locale, router]);

  const currentLang = getCurrentLang(locale);

  if (!mounted) return <div className={s.page} />;

  return (
    <div className={`${s.overlay} ${closing ? s.overlayClosing : ''}`} onClick={handleClose}>
      <div
        ref={sheetRef}
        className={`${s.sheet} ${closing ? s.sheetClosing : ''}`}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className={s.dragHandle}>
          <div className={s.dragBar} />
        </div>

        {/* Header */}
        <div className={s.sheetHeader}>
          <h1 className={s.sheetTitle}>{t.title}</h1>
        </div>

        {/* Content */}
        <div className={s.content}>
          {/* ── SIGNUM Pro (ad-free) — only when IAP is live (non-purchasable price
                fails App Store 3.1.1). Upgrade / status / restore / manage. ── */}
          {IAP_LIVE && (
            <div className={s.card}>
              <div
                className={s.row}
                onClick={isPro ? undefined : handleProUpgrade}
                style={{ cursor: isPro ? 'default' : 'pointer' }}
              >
                <div className={s.rowLeft}>
                  <div className={s.rowIcon} style={{ color: '#04140f', background: 'linear-gradient(135deg,#10b981,#06b6d4)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 2l2.9 6.3 6.9.6-5.2 4.5 1.6 6.7L12 17.3 5.8 20.6l1.6-6.7L2.2 8.9l6.9-.6L12 2Z" />
                    </svg>
                  </div>
                  <div>
                    <div className={s.rowLabel}>{t.proTitle}</div>
                    <div className={s.rowSub}>{isPro ? t.proActiveSub : t.proUpgradeSub}</div>
                  </div>
                </div>
                {isPro
                  ? <span className={s.rowValue} style={{ color: '#10b981', fontWeight: 700 }}>✓ {t.proActiveBadge}</span>
                  : <span className={s.rowChevron}>{proBusy ? '···' : `${t.proCta} ›`}</span>}
              </div>
              <div
                className={s.row}
                onClick={isPro ? handleManageSub : handleProRestore}
                style={{ cursor: 'pointer' }}
              >
                <div className={s.rowLeft}>
                  <div className={s.rowLabel} style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
                    {isPro ? t.proManage : t.proRestore}
                  </div>
                </div>
                <span className={s.rowChevron}>›</span>
              </div>
            </div>
          )}

          {/* ── Language (Accordion) ── */}
          <div className={s.card}>
            <div className={s.row} onClick={() => setLangOpen(!langOpen)}>
              <div className={s.rowLeft}>
                <div className={`${s.rowIcon} ${s.rowIconLang}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2Z" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                </div>
                <div className={s.rowLabel}>{t.language}</div>
              </div>
              <div className={s.rowRight}>
                <span className={s.rowValue}>{currentLang.flag} {currentLang.name}</span>
                <span className={`${s.chevron} ${langOpen ? s.chevronOpen : ''}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
            </div>
            {/* Accordion content */}
            <div className={`${s.accordion} ${langOpen ? s.accordionOpen : ''}`}>
              {LANGS.map(lang => (
                <button
                  key={lang.code}
                  className={`${s.langItem} ${locale === lang.code ? s.langItemActive : ''}`}
                  onClick={() => handleLangChange(lang.code)}
                >
                  <span className={s.langFlag}>{lang.flag}</span>
                  <span className={s.langName}>{lang.name}</span>
                  {locale === lang.code && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={s.langCheck}>
                      <path d="M5 13l4 4L19 7" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Notifications ── */}
          <div className={s.card}>
            <div className={s.row} onClick={() => updatePrefs({ enabled: !prefs.enabled })}>
              <div className={s.rowLeft}>
                <div className={`${s.rowIcon} ${s.rowIconNotif}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div className={s.rowLabel}>{t.notifications}</div>
                  <div className={s.rowSub}>{t.notifSub}</div>
                </div>
              </div>
              <button className={`${s.toggle} ${prefs.enabled ? s.toggleOn : ''}`} />
            </div>
            <div className={`${s.accordion} ${prefs.enabled ? s.accordionOpen : ''}`}>
              <div className={s.subRow}>
                <div>
                  <div className={s.subLabel}>{t.morning}</div>
                  <div className={s.subNote}>{t.morningSub}</div>
                </div>
                <button
                  className={`${s.toggle} ${prefs.morning ? s.toggleOn : ''}`}
                  onClick={() => updatePrefs({ morning: !prefs.morning })}
                />
              </div>
              <div className={s.subRow}>
                <div>
                  <div className={s.subLabel}>{t.closing}</div>
                  <div className={s.subNote}>{t.closingSub}</div>
                </div>
                <button
                  className={`${s.toggle} ${prefs.closing ? s.toggleOn : ''}`}
                  onClick={() => updatePrefs({ closing: !prefs.closing })}
                />
              </div>
            </div>
          </div>

          {/* ── General ── */}
          <div className={s.card}>
            <div className={s.row} onClick={() => setShowCacheDialog(true)}>
              <div className={s.rowLeft}>
                <div className={`${s.rowIcon} ${s.rowIconCache}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className={s.rowLabel}>{t.cache}</div>
                  <div className={s.rowSub}>{t.cacheSub}</div>
                </div>
              </div>
              <span className={s.rowChevron}>›</span>
            </div>
            {/* Rate app — shown only when the native review plugin is in the binary (v1.1+). */}
            {canRate && (
              <div className={s.row} onClick={() => { requestAppReview(); }}>
                <div className={s.rowLeft}>
                  <div className={s.rowIcon} style={{ color: '#04140f', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 2l2.9 6.3 6.9.6-5.2 4.5 1.6 6.7L12 17.3 5.8 20.6l1.6-6.7L2.2 8.9l6.9-.6L12 2Z" />
                    </svg>
                  </div>
                  <div>
                    <div className={s.rowLabel}>{t.rate}</div>
                    <div className={s.rowSub}>{t.rateSub}</div>
                  </div>
                </div>
                <span className={s.rowChevron}>›</span>
              </div>
            )}
            <div className={s.row} onClick={() => router.push(`/${locale}/app-view/terms`)}>
              <div className={s.rowLeft}>
                <div className={`${s.rowIcon} ${s.rowIconLegal}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <div className={s.rowLabel}>{t.terms}</div>
              </div>
              <span className={s.rowChevron}>›</span>
            </div>
            <div className={s.row} onClick={() => router.push(`/${locale}/app-view/privacy`)}>
              <div className={s.rowLeft}>
                <div className={`${s.rowIcon} ${s.rowIconLegal}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className={s.rowLabel}>{t.privacy}</div>
              </div>
              <span className={s.rowChevron}>›</span>
            </div>
          </div>

          {/* ── Companion app: Undercurrent (cross-promo). iOS + web only; hidden on
                native Android until UC's Play listing is live (avoids a 404 on tap). ── */}
          {showUc && (
            <div className={s.card}>
              <div className={s.row} onClick={handleOpenUc} style={{ cursor: 'pointer' }}>
                <div className={s.rowLeft}>
                  <div className={s.rowIcon} style={{ background: '#F6F3ED', padding: 4 }}>
                    <img src="/undercurrent-symbol.svg" alt="Undercurrent" width={18} height={18} style={{ objectFit: 'contain', display: 'block' }} />
                  </div>
                  <div>
                    <div className={s.rowLabel}>Undercurrent</div>
                    <div className={s.rowSub}>{t.ucSub}</div>
                  </div>
                </div>
                <span className={s.rowChevron}>›</span>
              </div>
            </div>
          )}

          {/* Version */}
          <div className={s.versionBox}>
            <div className={s.versionLogo}>SIGNUM<span>HQ</span></div>
            <div className={s.versionNum}>v1.0.0</div>
          </div>
        </div>

        {/* Cache Dialog */}
        {showCacheDialog && (
          <div className={s.dialogOverlay} onClick={() => setShowCacheDialog(false)}>
            <div className={s.dialog} onClick={e => e.stopPropagation()}>
              <div className={s.dialogTitle}>{t.cacheDialogTitle}</div>
              <div className={s.dialogText}>{t.cacheDialogText}</div>
              <div className={s.dialogActions}>
                <button className={s.dialogCancel} onClick={() => setShowCacheDialog(false)}>
                  {t.cacheCancel}
                </button>
                <button className={s.dialogConfirm} onClick={handleClearCache}>
                  {t.cacheConfirm}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast */}
        {toastMsg && (
          <div className={s.toast}>✓ {toastMsg}</div>
        )}
      </div>
    </div>
  );
}
