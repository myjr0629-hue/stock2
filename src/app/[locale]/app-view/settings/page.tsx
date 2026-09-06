'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { IAP_LIVE } from '@/config/iap';
import { ProPaywall } from '@/components/app/ProPaywall';
import { useProStatus } from '@/hooks/useProStatus';
import { openExternalUrl, openStoreReview, getNativeAppVersion, hapticImpact, platform as nativePlatform } from '@/lib/native/capacitorBridge';
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
  adPrivacy: string;
  cacheDialogTitle: string;
  cacheDialogText: string;
  cacheCancel: string;
  cacheConfirm: string;
  cacheToast: string;
  proTitle: string;
  /* ⚠️ 여기에 가격을 쓰지 말 것. 애플·구글은 «사용자 스토어 계정 국가 통화»로 청구한다
     (한국은 ₩13,000). 실제 청구액과 다른 통화 표시는 애플 3.1.1 / 한국 전자상거래법
     위반이다. 가격은 스토어가 준 priceString 을 ProPaywall 이 보여준다.
     ValueWall 에서 같은 버그를 2026-09-02 에 고쳤는데 여기가 남아 있었다. */
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
  wimSub: string;
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
    adPrivacy: '광고 개인정보 설정',
    cacheDialogTitle: '캐시 초기화',
    cacheDialogText: '캐시된 데이터가 삭제됩니다. 앱이 다시 로드됩니다.',
    cacheCancel: '취소',
    cacheConfirm: '초기화',
    cacheToast: '캐시가 초기화되었습니다',
    proTitle: 'SIGNUM Pro',
    proUpgradeSub: '광고 없이 · 월 구독',
    proActiveSub: '광고 없이 이용 중',
    proCta: '업그레이드',
    proRestore: '구매 복원',
    proManage: '구독 관리',
    proActiveBadge: '활성',
    proRestoredToast: '구매가 복원되었습니다',
    proNothingToRestoreToast: '복원할 구매 내역이 없어요',
    proErrorToast: '구매를 완료하지 못했어요',
    ucSub: '뉴스 뒤의 돈 · 무료',
    wimSub: '오늘 왜 움직였는지 퀴즈로 · 무료',
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
    adPrivacy: 'Ad privacy settings',
    cacheDialogTitle: 'Clear Cache',
    cacheDialogText: 'Cached data will be deleted. The app will reload.',
    cacheCancel: 'Cancel',
    cacheConfirm: 'Clear',
    cacheToast: 'Cache cleared successfully',
    proTitle: 'SIGNUM Pro',
    proUpgradeSub: 'Ad-free · monthly',
    proActiveSub: 'Ad-free is active',
    proCta: 'Upgrade',
    proRestore: 'Restore purchase',
    proManage: 'Manage subscription',
    proActiveBadge: 'Active',
    proRestoredToast: 'Purchase restored',
    proNothingToRestoreToast: 'No previous purchase to restore',
    proErrorToast: "Couldn't complete the purchase",
    ucSub: 'The news behind the money · Free',
    wimSub: 'Daily market-move quiz · Free',
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
    adPrivacy: '広告プライバシー設定',
    cacheDialogTitle: 'キャッシュクリア',
    cacheDialogText: 'キャッシュデータが削除されます。アプリが再読み込みされます。',
    cacheCancel: 'キャンセル',
    proTitle: 'SIGNUM Pro',
    proUpgradeSub: '広告なし · 月額',
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
    wimSub: '値動きの理由をクイズで · 無料',
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
  // 구글 UMP: 동의를 «받은» 사용자에게는 철회 진입점이 상시 보여야 한다.
  // 요건이 없는 지역(EEA 밖)에서는 false 라 행 자체가 렌더되지 않는다.
  const [showAdPrivacy, setShowAdPrivacy] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const { adManager } = await import('@/services/adManager');
        // init 은 NativeAppProvider 가 이미 돌린다. 여기선 결과만 읽는다.
        if (!dead) setShowAdPrivacy(adManager.needsPrivacyOptions());
      } catch { /* 웹 / 광고 비활성 — 행을 숨긴 채로 둔다 */ }
    })();
    return () => { dead = true; };
  }, []);

  /* ── 설정이 열려 있는 동안 «네이티브» 배너를 내린다 (2026-09-07) ────────────
     layout.tsx 의 `hideAd = isSettingsRoute` 는 **웹 슬롯**(<AppAnchorAd/>)만 감춘다.
     실제 광고는 AdMob 네이티브 뷰라 웹뷰 «위에» 그대로 떠 있었고, 설정 시트를 덮었다
     (대표 실기기 확인 2026-09-07).
     끄는 함수는 이미 있다 — 온보딩이 같은 방식으로 쓴다(AppFirstRunOnboarding.tsx:157).
     설정만 이 호출이 빠져 있었다.
     ※ 언마운트에서 false 로 되돌린다. adManager 는 recomputeWantBanner() 로
        Pro 여부까지 함께 보고 결정하므로 여기서 «켠다»가 아니라 «억제를 푼다»가 맞다. */
  useEffect(() => {
    let dead = false;
    const apply = async (suppressed: boolean) => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;
        const { adManager } = await import('@/services/adManager');
        await adManager.setBannerSuppressed(suppressed);
      } catch { /* 웹 프리뷰 / 플러그인 없음 */ }
    };
    apply(true);
    return () => { dead = true; void dead; apply(false); };
  }, []);

  // Pro (ad-free) — inert while IAP_LIVE=false (isPro false, no SDK, card hidden).
  const { isPro, restore } = useProStatus();
  const [proBusy, setProBusy] = useState(false);

  // 바이너리 실제 버전 (@capacitor/app). 플러그인 없으면 라이브 스토어 버전으로 폴백
  // — 하드코딩 v1.0.0 이 v1.1 바이너리와 어긋났던 문제(2026-08-08)의 해결.
  const [appVersion, setAppVersion] = useState('1.1');
  // Companion-app cross-promo — UC·WIM 모두 iOS/Android 라이브 (2026-08-08 전 앱 승인).
  const [showCompanions] = useState(true);

  // ⚠️ 여기서 곧장 purchase() 를 부르면 안 된다 — 결제 «전에» 가격·기간·약관을
  //    보여주지 않는 것이 애플 3.1.2 반려 사유다. 페이월을 먼저 띄운다.
  const [paywallOpen, setPaywallOpen] = useState(false);
  const handleProUpgrade = useCallback(() => {
    if (proBusy || isPro) return;
    setPaywallOpen(true);
  }, [proBusy, isPro]);

  const handleProRestore = useCallback(async () => {
    if (proBusy) return;
    setProBusy(true);
    try {
      const res = await restore();
      // 3-way: restored (ok+Pro) / nothing to restore (ok, no entitlement) / real failure.
      setToastMsg(res.ok && res.isPro ? t.proRestoredToast : res.ok ? t.proNothingToRestoreToast : t.proErrorToast);
    } finally { setProBusy(false); }
  }, [restore, proBusy, t]);

  // ── 하단 정렬 진단 (안드로이드 네이티브 전용, 임시) ───────────────────────
  // 실기기에서만 나는 문제라 «앱 안에 숫자를 찍어» 받는 게 최단거리다(UC 에서 검증됨).
  const [bottomDiag, setBottomDiag] = useState('');
  useEffect(() => {
    let isAndroid = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      isAndroid = require('@capacitor/core').Capacitor?.getPlatform?.() === 'android';
    } catch { /* web */ }
    if (!isAndroid) return;
    let bannerDiag = 'banner=?';
    import('@/services/adManager')
      .then(({ bannerGeometryDiag }) => { bannerDiag = bannerGeometryDiag('android'); })
      .catch(() => {});
    const read = () => {
      const vp = document.querySelector('.app-viewport') as HTMLElement | null;
      const cs = getComputedStyle(document.documentElement);
      const vcs = vp ? getComputedStyle(vp) : null;
      const nav = document.querySelector('.app-tabbar');
      const r = nav?.getBoundingClientRect();
      setBottomDiag([
        `inner ${window.innerWidth}x${window.innerHeight}`,
        `screen ${window.screen?.width}x${window.screen?.height}`,
        `dpr ${window.devicePixelRatio}`,
        `floor ${cs.getPropertyValue('--sig-bottom-floor').trim() || '-'}`,
        `safe ${(vcs?.getPropertyValue('--app-bottom-safe') || '').trim() || '-'}`,
        `lift ${(vcs?.getPropertyValue('--app-tabbar-lift') || '').trim() || '-'}`,
        r ? `nav h=${Math.round(r.height)} bottom=${Math.round(r.bottom)} gapToVh=${Math.round(window.innerHeight - r.bottom)}` : 'nav=hidden(설정화면)',
        bannerDiag,
      ].join(' · '));
    };
    const timers = [0, 600, 1600, 3400].map((d) => window.setTimeout(read, d));
    const iv = window.setInterval(read, 4000);
    return () => { timers.forEach(clearTimeout); clearInterval(iv); };
  }, []);

  const handleManageSub = useCallback(() => {
    const isIOS = typeof document !== 'undefined' && document.documentElement.classList.contains('native-ios');
    openExternalUrl(isIOS
      ? 'https://apps.apple.com/account/subscriptions'
      : 'https://play.google.com/store/account/subscriptions');
  }, []);

  // Cross-promo → 형제 앱 스토어 (device-aware smart link, ?from tagged for attribution).
  const handleOpenUc = useCallback(() => {
    hapticImpact('light');
    openExternalUrl('https://www.signumhq.com/app-uc?from=signum_app');
  }, []);
  const handleOpenWim = useCallback(() => {
    hapticImpact('light');
    openExternalUrl('https://www.signumhq.com/app-wim?from=signum_app');
  }, []);

  // Swipe-down tracking
  const sheetRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    setPrefs(loadPrefs());
    getNativeAppVersion().then(v => { if (v) setAppVersion(v); });
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
    // Keep the PUSH-notification language in sync with the chosen locale: re-register
    // the stored device token so future report pushes arrive in this language too.
    // (Registration otherwise happens only at onboarding, so a later switch would
    // leave the server sending the old language.) Native-only; no-op on web.
    try {
      const token = localStorage.getItem('signumhq.push.token');
      const cap = require('@capacitor/core').Capacitor;
      if (token && cap?.isNativePlatform?.()) {
        fetch('/api/push/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: cap.getPlatform?.() || 'unknown', locale: code }),
        }).catch(() => {});
      }
    } catch { /* plugin unavailable / web */ }
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
            <div className={s.row} onClick={() => { hapticImpact('light'); setLangOpen(!langOpen); }}>
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
                  onClick={() => { hapticImpact('light'); handleLangChange(lang.code); }}
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
            <div className={s.row} onClick={() => { hapticImpact('light'); updatePrefs({ enabled: !prefs.enabled }); }}>
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
                  onClick={() => { hapticImpact('light'); updatePrefs({ morning: !prefs.morning }); }}
                />
              </div>
              <div className={s.subRow}>
                <div>
                  <div className={s.subLabel}>{t.closing}</div>
                  <div className={s.subNote}>{t.closingSub}</div>
                </div>
                <button
                  className={`${s.toggle} ${prefs.closing ? s.toggleOn : ''}`}
                  onClick={() => { hapticImpact('light'); updatePrefs({ closing: !prefs.closing }); }}
                />
              </div>
            </div>
          </div>

          {/* ── General ── */}
          <div className={s.card}>
            <div className={s.row} onClick={() => { hapticImpact('light'); setShowCacheDialog(true); }}>
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
            {/* Rate app — 항상 렌더(조건부 삽입이 마운트 후 레이아웃을 밀어 iOS 터치
                어긋남 보고의 유력 원인이었다). 탭 = openStoreReview: iOS 는 스토어
                리뷰 딥링크(항상 시트가 뜸 — 조용한 SKStoreReviewController 는 애플이
                억제해 «안 눌리는» 것처럼 보였음), Android 는 인앱 시트→Play 폴백. */}
            <div className={s.row} onClick={() => { hapticImpact('light'); openStoreReview(); }}>
              <div className={s.rowLeft}>
                <div className={s.rowIcon} style={{ color: '#04140f', background: 'linear-gradient(135deg,#fbbf24,#f59e0b)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2l2.9 6.3 6.9.6-5.2 4.5 1.6 6.7L12 17.3 5.8 20.6l1.6-6.7L2.2 8.9l6.9-.6L12 2Z" />
                  </svg>
                </div>
                <div>
                  <div className={s.rowLabel}>{t.rate}</div>
                  <div className={s.rowSub}>{nativePlatform === 'android' ? t.rateSub.replace('App Store', 'Google Play') : t.rateSub}</div>
                </div>
              </div>
              <span className={s.rowChevron}>›</span>
            </div>
            <div className={s.row} onClick={() => { hapticImpact('light'); router.push(`/${locale}/app-view/terms`); }}>
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
            <div className={s.row} onClick={() => { hapticImpact('light'); router.push(`/${locale}/app-view/privacy`); }}>
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
            {showAdPrivacy && (
              <div
                className={s.row}
                onClick={async () => {
                  hapticImpact('light');
                  const { adManager } = await import('@/services/adManager');
                  await adManager.openPrivacyOptions();
                }}
              >
                <div className={s.rowLeft}>
                  <div className={`${s.rowIcon} ${s.rowIconLegal}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className={s.rowLabel}>{t.adPrivacy}</div>
                </div>
                <span className={s.rowChevron}>›</span>
              </div>
            )}
          </div>

          {/* ── Companion apps (cross-promo) — UC·WIM 모두 iOS/Android 라이브. ── */}
          {showCompanions && (
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
              <div className={s.row} onClick={handleOpenWim} style={{ cursor: 'pointer' }}>
                <div className={s.rowLeft}>
                  <div className={s.rowIcon} style={{ background: '#F4F1FF', padding: 3 }}>
                    <img src="/app-icons/wim.png" alt="Why'd It Move?" width={20} height={20} style={{ objectFit: 'contain', display: 'block', borderRadius: 5 }} />
                  </div>
                  <div>
                    <div className={s.rowLabel}>Why&apos;d It Move?</div>
                    <div className={s.rowSub}>{t.wimSub}</div>
                  </div>
                </div>
                <span className={s.rowChevron}>›</span>
              </div>
            </div>
          )}

          {/* Version — 바이너리 실제 버전 (@capacitor/app, 폴백=라이브 스토어 버전) */}
          <div className={s.versionBox}>
            <div className={s.versionLogo}>SIGNUM<span>HQ</span></div>
            <div className={s.versionNum}>v{appVersion}</div>
          </div>

          {/* ── 하단 정렬 진단 (안드로이드 네이티브 전용, 임시) ──────────────
              에뮬레이터와 실기기가 달라 추측으로 여러 번 틀렸다. UC 에 같은 줄을
              넣어 원인(셸이 내비바 높이를 부풀려 게시)을 한 번에 잡았다.
              SIGNUM 도 같은 방식으로 확인한다. 원인 확정 후 제거. */}
          {bottomDiag && (
            <div style={{
              marginTop: 12, padding: '8px 10px', borderRadius: 10,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
              fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 9.5, lineHeight: 1.5,
              color: 'var(--text-muted)', wordBreak: 'break-all', textAlign: 'left',
            }}>{bottomDiag}</div>
          )}
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

      {/* 구독 페이월 — 결제 «전에» 가격·기간·약관을 보여준다(애플 3.1.2 / Play 고지) */}
      {IAP_LIVE && paywallOpen && (
        <ProPaywall locale={locale} onClose={() => setPaywallOpen(false)} />
      )}
    </div>
  );
}
