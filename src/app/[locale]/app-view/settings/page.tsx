'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import s from './settings.module.css';

// ── Translations ──
const T: Record<string, {
  title: string;
  language: string;
  languageSub: string;
  notifications: string;
  notifSub: string;
  morning: string;
  morningSub: string;
  closing: string;
  closingSub: string;
  cache: string;
  cacheSub: string;
  legal: string;
  terms: string;
  privacy: string;
  version: string;
  cacheDialogTitle: string;
  cacheDialogText: string;
  cacheCancel: string;
  cacheConfirm: string;
  cacheToast: string;
  selectLang: string;
}> = {
  ko: {
    title: '설정',
    language: '언어',
    languageSub: '앱 표시 언어를 선택합니다',
    notifications: '알림',
    notifSub: '푸시 알림을 설정합니다',
    morning: '모닝 브리핑',
    morningSub: '장 전 시장 요약 알림',
    closing: '장마감 리포트',
    closingSub: '장마감 후 분석 리포트 알림',
    cache: '캐시 초기화',
    cacheSub: '임시 데이터를 삭제합니다',
    legal: '법적 고지',
    terms: '이용약관',
    privacy: '개인정보 처리방침',
    version: '버전',
    cacheDialogTitle: '캐시 초기화',
    cacheDialogText: '캐시된 데이터가 삭제됩니다. 앱이 다시 로드됩니다.',
    cacheCancel: '취소',
    cacheConfirm: '초기화',
    cacheToast: '캐시가 초기화되었습니다',
    selectLang: '언어 선택',
  },
  en: {
    title: 'Settings',
    language: 'Language',
    languageSub: 'Select display language',
    notifications: 'Notifications',
    notifSub: 'Configure push notifications',
    morning: 'Morning Briefing',
    morningSub: 'Pre-market summary alert',
    closing: 'Closing Report',
    closingSub: 'Post-market analysis alert',
    cache: 'Clear Cache',
    cacheSub: 'Delete temporary data',
    legal: 'Legal',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    version: 'Version',
    cacheDialogTitle: 'Clear Cache',
    cacheDialogText: 'Cached data will be deleted. The app will reload.',
    cacheCancel: 'Cancel',
    cacheConfirm: 'Clear',
    cacheToast: 'Cache cleared successfully',
    selectLang: 'Select Language',
  },
  ja: {
    title: '設定',
    language: '言語',
    languageSub: 'アプリの表示言語を選択',
    notifications: '通知',
    notifSub: 'プッシュ通知の設定',
    morning: 'モーニングブリーフ',
    morningSub: 'プレマーケットサマリー通知',
    closing: 'クロージングレポート',
    closingSub: '引け後の分析レポート通知',
    cache: 'キャッシュクリア',
    cacheSub: '一時データを削除します',
    legal: '法的情報',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    version: 'バージョン',
    cacheDialogTitle: 'キャッシュクリア',
    cacheDialogText: 'キャッシュデータが削除されます。アプリが再読み込みされます。',
    cacheCancel: 'キャンセル',
    cacheConfirm: 'クリア',
    cacheToast: 'キャッシュをクリアしました',
    selectLang: '言語を選択',
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

function getCurrentLangLabel(locale: string) {
  return LANGS.find(l => l.code === locale) ?? LANGS[0];
}

export default function SettingsPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = T[locale] ?? T.en;

  const [prefs, setPrefs] = useState({ enabled: true, morning: true, closing: true });
  const [showCacheDialog, setShowCacheDialog] = useState(false);
  const [showLangSheet, setShowLangSheet] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPrefs(loadPrefs());
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
    setShowLangSheet(false);
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

  const currentLang = getCurrentLangLabel(locale);

  if (!mounted) return <div className={s.page} />;

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <header className={s.header}>
        <button className={s.backBtn} onClick={() => router.push(`/${locale}/app-view/dash`)} aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className={s.headerTitle}>{t.title}</h1>
      </header>

      {/* ══ LANGUAGE + NOTIFICATIONS ══ */}
      <div className={s.section}>
        <div className={s.sectionLabel}>{t.language} & {t.notifications}</div>
        <div className={s.card}>
          {/* Language row */}
          <div className={s.row} onClick={() => setShowLangSheet(true)}>
            <div className={s.rowLeft}>
              <div className={`${s.rowIcon} ${s.rowIconLang}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2Z" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              </div>
              <div className={s.rowLabel}>{t.language}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={s.rowValue}>{currentLang.flag} {currentLang.name}</span>
              <span className={s.rowChevron}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>

          {/* Notifications master toggle */}
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
          <div className={`${s.notifItems} ${prefs.enabled ? s.notifItemsOpen : ''}`}>
            <div className={s.notifRow}>
              <div>
                <div className={s.notifLabel}>{t.morning}</div>
                <div className={s.notifSub}>{t.morningSub}</div>
              </div>
              <button
                className={`${s.toggle} ${prefs.morning ? s.toggleOn : ''}`}
                onClick={() => updatePrefs({ morning: !prefs.morning })}
              />
            </div>
            <div className={s.notifRow}>
              <div>
                <div className={s.notifLabel}>{t.closing}</div>
                <div className={s.notifSub}>{t.closingSub}</div>
              </div>
              <button
                className={`${s.toggle} ${prefs.closing ? s.toggleOn : ''}`}
                onClick={() => updatePrefs({ closing: !prefs.closing })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ══ GENERAL ══ */}
      <div className={s.section}>
        <div className={s.sectionLabel}>General</div>
        <div className={s.card}>
          {/* Cache */}
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
            <span className={s.rowChevron}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>

          {/* Terms */}
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
            <span className={s.rowChevron}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>

          {/* Privacy */}
          <div className={s.row} onClick={() => router.push(`/${locale}/app-view/privacy`)}>
            <div className={s.rowLeft}>
              <div className={`${s.rowIcon} ${s.rowIconLegal}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className={s.rowLabel}>{t.privacy}</div>
            </div>
            <span className={s.rowChevron}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      {/* ══ VERSION ══ */}
      <div className={s.versionBox}>
        <div className={s.versionLogo}>SIGNUM<span>HQ</span></div>
        <div className={s.versionNum}>v1.0.0</div>
      </div>

      {/* ── Language Bottom Sheet ── */}
      {showLangSheet && (
        <div className={s.sheetOverlay} onClick={() => setShowLangSheet(false)}>
          <div className={s.sheet} onClick={e => e.stopPropagation()}>
            <div className={s.sheetHandle} />
            <div className={s.sheetTitle}>{t.selectLang}</div>
            {LANGS.map(lang => (
              <button
                key={lang.code}
                className={`${s.sheetOption} ${locale === lang.code ? s.sheetOptionActive : ''}`}
                onClick={() => handleLangChange(lang.code)}
              >
                <span className={s.sheetFlag}>{lang.flag}</span>
                <span className={s.sheetLangName}>{lang.name}</span>
                {locale === lang.code && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={s.sheetCheck}>
                    <path d="M5 13l4 4L19 7" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Cache Confirm Dialog ── */}
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

      {/* ── Toast ── */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(52,211,153,0.3)',
          borderRadius: 12, padding: '12px 20px', zIndex: 300,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          font: '600 13px/1 Inter, sans-serif', color: '#34d399',
          animation: 'fadeIn 0.2s ease',
        }}>
          ✓ {toastMsg}
        </div>
      )}
    </div>
  );
}
