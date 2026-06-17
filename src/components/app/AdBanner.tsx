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

  // In native app, real AdMob banner is displayed by adManager.showBanner()
  // Don't show HTML mockup to avoid double banners
  if (isNative) return null;

  return (
    <div className="app-ad-slot">
      <span className="app-ad-flag">AD</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M3 10v4a2 2 0 0 0 2 2h2l5 4V4L7 8H5a2 2 0 0 0-2 2Z"
            stroke="var(--text-muted)" strokeWidth="1.6" strokeLinejoin="round"/>
          <path d="M16 9a4 4 0 0 1 0 6" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ font: 'var(--f-small)', color: 'var(--text)' }}>Sponsored placement</div>
        <div style={{ font: 'var(--f-micro)', color: 'var(--text-muted)', marginTop: 2 }}>{"ADMOB · BANNER 320×50"}</div>
      </div>
      <div style={{
        font: 'var(--f-small)',
        color: 'var(--cyan)',
        border: '1px solid rgba(34,211,238,0.3)',
        borderRadius: 'var(--r-btn)',
        padding: '4px 12px'
      }}>Learn</div>
    </div>
  );
}
