'use client';

import { useEffect, useState } from 'react';
import { activeLaunch, anyActiveLaunch, LABEL, type PhApp } from '@/lib/marketing/phLaunch';

// ============================================================================
// 런치 당일에만 뜨는 얇은 상단 배너.
// ----------------------------------------------------------------------------
// · 날짜 판정은 클라이언트에서 한다 — 이 페이지들은 캐시될 수 있어서
//   서버에서 판정하면 «어제 캐시»가 하루 종일 남을 수 있다.
// · 네이티브 앱(sig_native 쿠키) 안에서는 숨긴다. 앱 화면에 외부 사이트로
//   나가는 배너를 띄우면 앱 경험이 지저분해진다.
// · 닫으면 그 런치 동안 다시 안 뜬다(localStorage, 런치별 키).
// ============================================================================
export default function PhLaunchBanner({ app, locale }: { app?: PhApp; locale: string }) {
  const [show, setShow] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (typeof document !== 'undefined' && document.cookie.includes('sig_native=1')) return;
    const l = app ? activeLaunch(app) : anyActiveLaunch();
    if (!l) return;
    const key = `ph.dismiss.${app || 'any'}.${l.startUtc}`;
    try { if (localStorage.getItem(key)) return; } catch {}
    setUrl(`${l.url}&from=site`);
    setShow(true);
  }, [app]);

  if (!show) return null;
  const t = LABEL[locale] || LABEL.en;

  const dismiss = () => {
    const l = app ? activeLaunch(app) : anyActiveLaunch();
    try { if (l) localStorage.setItem(`ph.dismiss.${app || 'any'}.${l.startUtc}`, '1'); } catch {}
    setShow(false);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
      background: 'linear-gradient(90deg,#DA552F,#FF6154)', color: '#fff',
      padding: '10px 44px 10px 16px', fontSize: 14, fontWeight: 700, position: 'relative',
      fontFamily: 'Pretendard, system-ui, sans-serif',
    }}>
      <span style={{ opacity: 0.95 }}>🚀 {t.live}</span>
      <a href={url} target="_blank" rel="noopener"
         style={{ background: '#fff', color: '#DA552F', borderRadius: 999, padding: '5px 14px', textDecoration: 'none', fontWeight: 800, whiteSpace: 'nowrap' }}>
        {t.cta} →
      </a>
      <button onClick={dismiss} aria-label="close"
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#fff', fontSize: 18, lineHeight: 1, cursor: 'pointer', appearance: 'none', padding: 4 }}>
        ×
      </button>
    </div>
  );
}
