'use client';

import { useState, useEffect } from 'react';

export function AdBanner() {
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    // Detect Capacitor native environment
    try {
      const { Capacitor } = require('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        setIsNative(true); // Real AdMob banner is shown by adManager, hide HTML mockup
      }
    } catch {
      // Not in native environment, show mockup
    }
  }, []);

  // In native app, the real AdMob banner is displayed as a native overlay at the bottom.
  // We return a 50px blank spacer to prevent the banner overlay from covering any webview content.
  if (isNative) {
    return <div style={{ height: 50, width: '100%', flexShrink: 0 }} aria-hidden />;
  }

  return (
    <div 
      className="app-ad-slot" 
      style={{
        background: 'radial-gradient(circle at 10% 10%, rgba(99,102,241,0.08) 0%, transparent 60%), rgba(30, 41, 59, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.02), 0 4px 12px rgba(0,0,0,0.15)',
        borderRadius: '12px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'relative',
        overflow: 'hidden',
        margin: '16px'
      }}
    >
      {/* Subtle light shimmer glow */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 80,
        height: '100%',
        background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.02))',
        pointerEvents: 'none'
      }} />

      {/* Styled Sponsored Tag */}
      <span style={{
        fontSize: '8px',
        fontWeight: 900,
        color: 'rgba(255, 255, 255, 0.4)',
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '3px',
        padding: '2px 4px',
        letterSpacing: '0.05em',
        fontFamily: 'var(--f-sans)',
        textTransform: 'uppercase'
      }}>SPONSOR</span>

      {/* Tech Shield/Activity Icon */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        width: 28, 
        height: 28, 
        borderRadius: '50%', 
        background: 'rgba(99,102,241,0.12)',
        border: '1px solid rgba(99,102,241,0.2)'
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2.5">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      </div>

      {/* Content block */}
      <div style={{ flex: 1 }}>
        <div style={{ font: 'var(--f-small)', color: 'var(--text)', fontWeight: 800, fontSize: '12px' }}>
          Apex Clearing Intelligence Feed
        </div>
        <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', marginTop: 2, fontSize: '10px', opacity: 0.8 }}>
          실시간 기관 다크풀 블록 및 대형 옵션 체인 플로우
        </div>
      </div>

      {/* Premium CTA Button */}
      <div style={{
        font: 'var(--f-small)',
        fontWeight: 800,
        color: '#a5b4fc',
        border: '1px solid rgba(165,180,252,0.3)',
        borderRadius: '8px',
        padding: '5px 12px',
        fontSize: '11px',
        cursor: 'pointer',
        background: 'rgba(99,102,241,0.08)',
        transition: 'all 0.2s ease'
      }}>연결</div>
    </div>
  );
}
