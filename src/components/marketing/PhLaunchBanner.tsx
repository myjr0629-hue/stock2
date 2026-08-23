'use client';

import { useEffect, useState } from 'react';
import { activeLaunch, anyActiveLaunch, LABEL, type PhApp } from '@/lib/marketing/phLaunch';

// ============================================================================
// 런치 당일에만 뜨는 얇은 상단 배너.
// ----------------------------------------------------------------------------
// · 날짜 판정은 클라이언트에서 한다 — 이 페이지들은 캐시될 수 있어서
//   서버에서 판정하면 «어제 캐시»가 하루 종일 남을 수 있다.
// · 네이티브 앱 안에서는 숨긴다. 앱 화면에 외부 사이트로 나가는 배너를
//   띄우면 앱 경험이 지저분해진다.
//   ★ 2026-08-23: 쿠키(sig_native) «만» 보다가 iOS UC 앱에서 배너가 그대로 떴다.
//   UC 앱은 마케팅 라우트와 «같은 경로»(/{locale}/undercurrent)를 로드하는데,
//   쿠키는 NativeAppProvider 가 심으므로 첫 페인트 시점엔 아직 없을 수 있다.
//   그래서 판정 순서를 코드베이스 정본인 Capacitor.isNativePlatform() 우선으로
//   바꿨다(동기라 레이스가 없다). 쿠키는 폴백으로만 남긴다.
// · 닫으면 그 런치 동안 다시 안 뜬다(localStorage, 런치별 키).
// ============================================================================
export default function PhLaunchBanner({ app, locale }: { app?: PhApp; locale: string }) {
  const [show, setShow] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    // 네이티브 판정 — Capacitor 우선(동기), 쿠키는 폴백.
    let isNative = false;
    try { isNative = require('@capacitor/core').Capacitor.isNativePlatform(); } catch { /* web */ }
    if (!isNative && typeof document !== 'undefined') {
      isNative = document.cookie.includes('sig_native=1')
        || document.documentElement.classList.contains('native-app')
        || document.documentElement.classList.contains('native-android')
        || document.documentElement.classList.contains('native-ios');
    }
    if (isNative) return;
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
      paddingTop: 'max(10px, env(safe-area-inset-top))', paddingRight: 44, paddingBottom: 10, paddingLeft: 16,
      fontSize: 14, fontWeight: 700, position: 'relative',
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
