'use client';

// ============================================================================
// Marketing Template: Pinterest Pin — "5 Indicators Smart Money Watches"
// GPT 구조 + Gemini 터미널 + Claude keyword + 실제 로고
// /marketing/templates/pin-indicators
// ============================================================================

import { Suspense } from 'react';

const INDICATORS = [
  { n: '01', title: 'Dark Pool Activity', desc: 'Large off-exchange institutional volume reveals hidden positioning', color: '#7c3aed', keyword: 'INSTITUTIONAL FLOW', icon: 'M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4z' },
  { n: '02', title: 'GEX (Gamma Exposure)', desc: 'Dealer hedging pressure that absorbs or amplifies market moves', color: '#06b6d4', keyword: 'OPTIONS STRUCTURE', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { n: '03', title: 'Options Flow (Net Premium)', desc: 'Net dollar flow of calls vs puts — real money directional bias', color: '#34d399', keyword: 'CAPITAL FLOW', icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' },
  { n: '04', title: 'IV Percentile Rank', desc: 'Where implied volatility sits relative to its 52-week range', color: '#fbbf24', keyword: 'VOLATILITY CONTEXT', icon: 'M12 20V10M18 20V4M6 20v-4' },
  { n: '05', title: 'Put/Call Ratio Skew', desc: 'Sentiment gauge — defensive or speculative positioning balance', color: '#f87171', keyword: 'SENTIMENT GAUGE', icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' },
];

function PinCard() {
  return (
    <div style={{
      width: '1000px', height: '1500px',
      background: '#080c14',
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      overflow: 'hidden', position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Background effects */}
      <div style={{ position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '400px', background: 'radial-gradient(ellipse, rgba(124,58,237,0.12) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-100px', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '400px', background: 'radial-gradient(ellipse, rgba(6,182,212,0.10) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '28px 28px', pointerEvents: 'none' }} />

      {/* Top accent */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #7c3aed 0%, #06b6d4 100%)' }} />

      {/* Border glow */}
      <div style={{ position: 'absolute', inset: '5px', borderRadius: '12px', border: '1px solid rgba(124,58,237,0.12)', boxShadow: '0 0 30px rgba(124,58,237,0.06)', pointerEvents: 'none', zIndex: 1 }} />

      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%', padding: '36px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #7c3aed, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px rgba(124,58,237,0.3)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="" width={24} height={24} style={{ borderRadius: '5px' }} />
            </div>
            <span style={{ fontSize: '16px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '2px' }}>SIGNUM HQ</span>
          </div>
          {/* Terminal info (Gemini) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontSize: '8px', fontWeight: 600, color: '#475569', letterSpacing: '0.12em' }}>DATA FEED <span style={{ color: '#34d399' }}>LIVE</span></span>
            <span style={{ fontSize: '8px', fontWeight: 600, color: '#475569', letterSpacing: '0.12em' }}>STATUS <span style={{ color: '#34d399' }}>ACTIVE</span></span>
          </div>
        </div>

        {/* Title — SEO optimized large text */}
        <div style={{ marginTop: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#7c3aed' }} />
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.2em', padding: '4px 12px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: '16px' }}>SMART MONEY GUIDE</span>
          </div>
          <div style={{ fontSize: '60px', fontWeight: 900, color: '#f1f5f9', lineHeight: 0.95, letterSpacing: '-0.03em' }}>5 Indicators</div>
          <div style={{ fontSize: '60px', fontWeight: 900, color: '#7c3aed', lineHeight: 0.95, letterSpacing: '-0.03em' }}>Smart Money</div>
          <div style={{ fontSize: '44px', fontWeight: 800, color: '#f1f5f9', lineHeight: 1.1, letterSpacing: '-0.02em', marginTop: '4px' }}>Watches Daily</div>
          <p style={{ fontSize: '14px', color: '#94a3b8', marginTop: '12px', lineHeight: 1.5 }}>
            Institutional-grade signals that hedge funds monitor every session
          </p>
        </div>

        {/* Indicators list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '28px', flex: 1 }}>
          {INDICATORS.map((ind) => (
            <div key={ind.n} style={{
              display: 'flex', alignItems: 'center', gap: '16px',
              padding: '16px 20px', borderRadius: '0 12px 12px 0',
              background: `${ind.color}06`, borderLeft: `4px solid ${ind.color}`,
              border: `1px solid ${ind.color}15`,
            }}>
              {/* Number */}
              <div style={{
                width: '52px', height: '52px', borderRadius: '12px', flexShrink: 0,
                background: `${ind.color}10`, border: `1px solid ${ind.color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: '22px', fontWeight: 900, color: ind.color }}>{ind.n}</span>
              </div>

              {/* Icon */}
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                background: `${ind.color}08`, border: `1px solid ${ind.color}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ind.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ind.icon} /></svg>
              </div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#f1f5f9' }}>{ind.title}</span>
                </div>
                <span style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>{ind.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* CTA box (Claude inspired) */}
        <div style={{
          marginTop: '20px', padding: '22px 28px', borderRadius: '14px',
          background: 'linear-gradient(135deg, rgba(124,58,237,0.14) 0%, rgba(6,182,212,0.14) 100%)',
          border: '1.5px solid rgba(124,58,237,0.3)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.18em', marginBottom: '4px' }}>TRACK ALL 5 IN REAL-TIME</div>
            <div style={{ fontSize: '28px', fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.02em' }}>signumhq.com</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
            <span style={{ fontSize: '20px', fontWeight: 900, color: '#06b6d4' }}>$79<span style={{ fontSize: '12px', color: '#94a3b8' }}>/mo Elite</span></span>
            <span style={{ fontSize: '10px', color: '#475569' }}>vs $24K/yr Bloomberg</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '14px', paddingTop: '10px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Institutional Intelligence, Democratized</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#06b6d4', letterSpacing: '0.08em' }}>SAVE FOR LATER ↗</span>
        </div>
      </div>

      {/* Bottom accent */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, #06b6d4 0%, #7c3aed 100%)' }} />
    </div>
  );
}

export default function PinIndicatorsPage() {
  return (
    <html>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { margin: 0; padding: 0; background: #000; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        `}</style>
      </head>
      <body>
        <Suspense fallback={<div style={{color:'#fff'}}>Loading...</div>}>
          <PinCard />
        </Suspense>
      </body>
    </html>
  );
}
