'use client';

// ============================================================================
// Marketing Template: Default OG Image (Link Preview)
// GPT 기준 — 데이터 시각화 배경 + 실제 로고 + 파티클 웨이브
// /marketing/templates/og-default?v=1
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function OGCard() {
  const searchParams = useSearchParams();
  const gex = searchParams.get('gex') || '+2.48B';
  const dpPct = searchParams.get('dp') || '58.3';
  const ivr = searchParams.get('iv') || '67.2';

  return (
    <div style={{
      width: '1200px', height: '630px',
      background: '#060910',
      fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
      overflow: 'hidden', position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* ── Background: Gradient ambient ── */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '1000px', height: '800px',
        background: 'radial-gradient(ellipse, rgba(124,58,237,0.18) 0%, rgba(6,182,212,0.08) 50%, transparent 75%)',
        pointerEvents: 'none',
      }} />

      {/* ── Background: Dot grid ── */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.03,
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }} />

      {/* ── Background: Data chart (GPT style — right side) ── */}
      <svg style={{ position: 'absolute', right: '40px', top: '40px', opacity: 0.06, pointerEvents: 'none' }} width="400" height="260" viewBox="0 0 400 260">
        {/* Chart line */}
        <polyline points="0,200 30,190 60,180 90,175 120,160 150,170 180,140 210,130 240,145 270,110 300,95 330,80 360,90 390,60" fill="none" stroke="#7c3aed" strokeWidth="2" />
        <polygon points="0,200 30,190 60,180 90,175 120,160 150,170 180,140 210,130 240,145 270,110 300,95 330,80 360,90 390,60 400,60 400,260 0,260" fill="url(#chartGrad)" />
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Volume bars */}
        {Array.from({ length: 20 }).map((_, i) => {
          const h = 10 + Math.sin(i * 0.8 + 2) * 15 + Math.abs(Math.cos(i * 1.2)) * 20;
          return <rect key={i} x={i * 20} y={260 - h} width="8" height={h} fill="#06b6d4" opacity="0.3" rx="1" />;
        })}
      </svg>

      {/* ── Background: Data hints (GPT inspired) ── */}
      <div style={{
        position: 'absolute', right: '60px', top: '60px', opacity: 0.08, pointerEvents: 'none',
        display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'flex-end',
      }}>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#7c3aed', letterSpacing: '0.15em' }}>GEX EXPOSURE</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#7c3aed' }}>{gex}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#06b6d4', letterSpacing: '0.15em' }}>DARK POOL %</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#06b6d4' }}>{dpPct}%</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#a855f7', letterSpacing: '0.15em' }}>IV RANK</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#a855f7' }}>{ivr}</div>
        </div>
      </div>

      {/* ── Background: Particle wave (GPT inspired — bottom) ── */}
      <svg style={{ position: 'absolute', bottom: '0', left: '0', right: '0', opacity: 0.08, pointerEvents: 'none' }} width="1200" height="120" viewBox="0 0 1200 120">
        <path d="M0,80 Q100,40 200,70 Q300,100 400,60 Q500,20 600,55 Q700,90 800,50 Q900,10 1000,45 Q1100,80 1200,40" fill="none" stroke="#06b6d4" strokeWidth="1.5" />
        <path d="M0,90 Q100,50 200,80 Q300,110 400,70 Q500,30 600,65 Q700,100 800,60 Q900,20 1000,55 Q1100,90 1200,50" fill="none" stroke="#7c3aed" strokeWidth="1" opacity="0.6" />
        {Array.from({ length: 60 }).map((_, i) => {
          const x = i * 20 + Math.sin(i) * 5;
          const y = 80 + Math.sin(i * 0.5) * 25 + Math.cos(i * 0.3) * 10;
          const r = 1 + Math.sin(i * 0.7) * 0.8;
          return <circle key={i} cx={x} cy={y} r={r} fill="#06b6d4" opacity={0.3 + Math.sin(i * 0.4) * 0.2} />;
        })}
      </svg>

      {/* ── Top/Bottom accent lines (Claude) ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
        background: 'linear-gradient(90deg, transparent 0%, #7c3aed 50%, #06b6d4 100%)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px',
        background: 'linear-gradient(90deg, #06b6d4 0%, #7c3aed 50%, transparent 100%)',
      }} />

      {/* ── Center content ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', flexDirection: 'column',
        flex: 1, justifyContent: 'center', alignItems: 'center',
      }}>
        {/* Logo */}
        <div style={{
          width: '120px', height: '120px', borderRadius: '24px',
          background: 'linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 60px rgba(124,58,237,0.3), 0 0 120px rgba(6,182,212,0.15)',
          marginBottom: '32px',
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-512x512.png" alt="SIGNUM HQ" width={90} height={90} style={{ borderRadius: '16px' }} />
        </div>

        {/* Brand name */}
        <div style={{
          fontSize: '72px', fontWeight: 900, color: '#f1f5f9',
          letterSpacing: '-0.03em', lineHeight: 1,
          textShadow: '0 0 60px rgba(124,58,237,0.2)',
        }}>SIGNUM HQ</div>

        {/* Tagline */}
        <div style={{
          fontSize: '22px', fontWeight: 500, color: '#94a3b8',
          letterSpacing: '0.08em', marginTop: '16px',
        }}>Institutional Intelligence, Democratized</div>

        {/* Feature keywords (Gemini) */}
        <div style={{
          display: 'flex', gap: '6px', marginTop: '20px',
        }}>
          {['GEX', 'DARK POOL', 'OPTIONS FLOW', 'AI VERDICTS'].map((feat) => (
            <div key={feat} style={{
              padding: '5px 14px', borderRadius: '16px',
              background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#cbd5e1', letterSpacing: '0.1em' }}>• {feat}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom URL ── */}
      <div style={{
        position: 'relative', zIndex: 10,
        display: 'flex', justifyContent: 'center',
        padding: '0 0 28px',
      }}>
        <div style={{
          padding: '6px 24px', borderRadius: '20px',
          background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#06b6d4', letterSpacing: '0.2em' }}>SIGNUMHQ.COM</span>
        </div>
      </div>
    </div>
  );
}

export default function OGDefaultPage() {
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
          <OGCard />
        </Suspense>
      </body>
    </html>
  );
}
