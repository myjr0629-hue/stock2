'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';

const LABELS = {
  ko: { offline: '오프라인', reconnecting: '재연결 중...' },
  en: { offline: 'Offline', reconnecting: 'Reconnecting...' },
  ja: { offline: 'オフライン', reconnecting: '再接続中...' },
};

export function NetworkStatus() {
  const [online, setOnline] = useState(true);
  const locale = useLocale() as 'ko' | 'en' | 'ja';
  const t = LABELS[locale] || LABELS.en;

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);

    if (typeof navigator !== 'undefined') setOnline(navigator.onLine);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 120,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      background: 'rgba(239, 68, 68, 0.95)',
      backdropFilter: 'blur(12px)',
      color: '#fff',
      padding: '8px 20px',
      borderRadius: '999px',
      font: 'var(--f-small)',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      boxShadow: '0 4px 20px rgba(239,68,68,0.4)',
      animation: 'fadeInUp 0.3s ease',
      maxWidth: 'calc(100vw - 32px)',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
      <span>{t.offline}</span>
      <span style={{ opacity: 0.7 }}>·</span>
      <span style={{ opacity: 0.7, fontWeight: 400 }}>{t.reconnecting}</span>
    </div>
  );
}
