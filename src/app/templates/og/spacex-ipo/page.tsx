'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SpaceXIPOCard() {
  const sp = useSearchParams();
  const dp = sp.get('dp') || '45.3';
  const whale = sp.get('whale') || '82';
  const gex = (sp.get('gex') || 'positive').toUpperCase();
  const price = sp.get('price') || '';
  const change = sp.get('change') || '';
  const date = sp.get('date') || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const changeFmt = change ? `${parseFloat(change) >= 0 ? '+' : ''}${parseFloat(change).toFixed(2)}%` : '';
  const tslaLine = price && change ? `$TSLA $${price} (${changeFmt})` : '';

  return (
    <main
      style={{
        position: 'relative',
        width: 1200,
        height: 675,
        overflow: 'hidden',
        color: '#f1f5f9',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        background: `
          radial-gradient(circle at 83% 23%, rgba(249,115,22,0.32), transparent 28%),
          radial-gradient(circle at 56% 61%, rgba(34,211,238,0.18), transparent 30%),
          radial-gradient(circle at 6% 95%, rgba(34,211,238,0.15), transparent 25%),
          linear-gradient(135deg, #040710 0%, #060d1a 100%)
        `,
        isolation: 'isolate',
      }}
    >
      {/* Grid overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, opacity: 0.32,
        backgroundImage: `
          linear-gradient(rgba(34,211,238,0.055) 1px, transparent 1px),
          linear-gradient(90deg, rgba(34,211,238,0.055) 1px, transparent 1px)
        `,
        backgroundSize: '36px 36px',
        maskImage: 'radial-gradient(circle at 55% 50%, black 0%, transparent 85%)',
        WebkitMaskImage: 'radial-gradient(circle at 55% 50%, black 0%, transparent 85%)',
      }} />

      {/* Starfield */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, opacity: 0.55,
        background: `
          radial-gradient(circle, rgba(241,245,249,0.9) 0 1px, transparent 1.4px),
          radial-gradient(circle, rgba(34,211,238,0.65) 0 1px, transparent 1.4px),
          radial-gradient(circle, rgba(251,191,36,0.45) 0 1px, transparent 1.4px)
        `,
        backgroundSize: '83px 83px, 127px 127px, 173px 173px',
        maskImage: 'radial-gradient(circle at 62% 22%, black 0%, transparent 56%)',
        WebkitMaskImage: 'radial-gradient(circle at 62% 22%, black 0%, transparent 56%)',
      }} />

      {/* Earth glow */}
      <div style={{
        position: 'absolute', right: -82, top: -44, width: 458, height: 458, borderRadius: '50%',
        background: `
          radial-gradient(circle at 68% 70%, rgba(255,255,255,0.85) 0 1%, rgba(251,191,36,0.72) 2%, rgba(249,115,22,0.36) 16%, transparent 42%),
          radial-gradient(circle at 28% 76%, rgba(34,211,238,0.28), transparent 48%)
        `,
        boxShadow: '-35px 46px 110px rgba(249,115,22,0.18)',
        opacity: 0.94, zIndex: 0,
      }} />

      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 90, pointerEvents: 'none', opacity: 0.045,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.95) 0, rgba(255,255,255,0.95) 1px, transparent 1px, transparent 5px)',
        mixBlendMode: 'overlay',
      }} />

      {/* Logo */}
      <div style={{ position: 'absolute', left: 43, top: 55, zIndex: 10 }}>
        <div style={{
          width: 63, height: 63, display: 'grid', placeItems: 'center', borderRadius: 14,
          background: 'linear-gradient(135deg, #67e8f9 0%, #22d3ee 45%, #2563eb 100%)',
          boxShadow: '0 0 30px rgba(34,211,238,0.25), inset 0 1px 0 rgba(255,255,255,0.24)',
          border: '1px solid rgba(255,255,255,0.16)',
        }}>
          <svg width={39} height={39} viewBox="0 0 64 64" fill="none">
            <path d="M48 10H25C15 10 9 16 9 25c0 8 5 13 15 17l16 6c5 2 8 5 8 9 0 5-4 8-12 8H15" stroke="white" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
            <path d="M48 10 37 21M16 54 28 43" stroke="white" strokeWidth={11} strokeLinecap="round" opacity={0.95} />
          </svg>
        </div>
        <div style={{
          marginTop: 28, color: '#94a3b8', fontSize: 20, lineHeight: 1, fontWeight: 800,
          letterSpacing: '0.30em', textTransform: 'uppercase' as const,
        }}>SIGNUM HQ</div>
      </div>

      {/* Hero copy */}
      <div style={{ position: 'absolute', left: 43, top: 209, width: 650, zIndex: 12 }}>
        <h1 style={{
          margin: 0, color: '#f1f5f9', fontSize: 82, lineHeight: 0.94, fontWeight: 900,
          letterSpacing: '-0.078em',
          textShadow: '0 10px 42px rgba(0,0,0,0.40), 0 0 20px rgba(255,255,255,0.10)',
        }}>SpaceX IPO</h1>
        <div style={{
          marginTop: 37, color: '#22d3ee', fontSize: 47, lineHeight: 1, fontWeight: 700,
          letterSpacing: '-0.055em', textShadow: '0 0 24px rgba(34,211,238,0.22)',
        }}>× TSLA Proxy Analysis</div>
        {tslaLine && (
          <div style={{
            marginTop: 16, color: '#94a3b8', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em',
          }}>{tslaLine} · {date}</div>
        )}
      </div>

      {/* Rocket SVG */}
      <div style={{ position: 'absolute', left: 492, top: 62, width: 318, height: 505, zIndex: 6, opacity: 0.94 }}>
        <svg width="100%" height="100%" viewBox="0 0 318 505" fill="none" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="rs" x1="158" y1="0" x2="158" y2="360" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f1f5f9" stopOpacity={0.85} />
              <stop offset={0.62} stopColor="#22d3ee" stopOpacity={0.82} />
              <stop offset={1} stopColor="#22d3ee" stopOpacity={0.18} />
            </linearGradient>
            <linearGradient id="th" x1="158" y1="300" x2="158" y2="505" gradientUnits="userSpaceOnUse">
              <stop stopColor="#22d3ee" />
              <stop offset={0.35} stopColor="#67e8f9" />
              <stop offset={0.62} stopColor="#fbbf24" />
              <stop offset={1} stopColor="#f97316" stopOpacity={0} />
            </linearGradient>
            <filter id="rg" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation={6} result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="tg" x="-100%" y="-40%" width="300%" height="180%">
              <feGaussianBlur stdDeviation={14} result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g opacity={0.22}>
            <circle cx={158} cy={212} r={188} stroke="#22d3ee" strokeOpacity={0.20} strokeDasharray="3 10" />
            <circle cx={158} cy={212} r={142} stroke="#22d3ee" strokeOpacity={0.14} />
            <circle cx={158} cy={212} r={96} stroke="#22d3ee" strokeOpacity={0.12} />
          </g>
          <g filter="url(#rg)">
            <path d="M158 17 C127 64 124 138 124 237 L124 332 L192 332 L192 237 C192 138 189 64 158 17Z" stroke="url(#rs)" strokeWidth={3} fill="rgba(4,7,16,0.40)" />
            <path d="M124 245 C88 255 80 326 80 365 L124 337" stroke="url(#rs)" strokeWidth={3} fill="rgba(4,7,16,0.35)" />
            <path d="M192 245 C228 255 236 326 236 365 L192 337" stroke="url(#rs)" strokeWidth={3} fill="rgba(4,7,16,0.35)" />
            <path d="M139 333V223M177 333V223" stroke="#22d3ee" strokeOpacity={0.46} strokeWidth={2} />
            <path d="M124 113H192M126 171H190M124 275H192" stroke="#f1f5f9" strokeOpacity={0.25} strokeWidth={2} />
            <path d="M158 17 C150 33 144 52 141 73H175C172 52 166 33 158 17Z" fill="rgba(241,245,249,0.08)" />
          </g>
          <g filter="url(#tg)">
            <path d="M132 332 C128 382 128 432 158 505 C188 432 188 382 184 332Z" fill="url(#th)" opacity={0.92} />
            <path d="M150 332 C145 377 148 425 158 482 C168 425 171 377 166 332Z" fill="#f1f5f9" opacity={0.50} />
            <path d="M104 352 C88 394 75 445 46 505" stroke="#22d3ee" strokeOpacity={0.25} strokeWidth={3} />
            <path d="M212 352 C228 394 241 445 270 505" stroke="#f97316" strokeOpacity={0.25} strokeWidth={3} />
          </g>
        </svg>
      </div>

      {/* HUD right */}
      <div style={{ position: 'absolute', right: 45, top: 252, width: 315, height: 260, opacity: 0.38, zIndex: 2 }}>
        <svg viewBox="0 0 315 260" fill="none" width="100%" height="100%">
          <g opacity={0.85}>
            <text x={0} y={20} fill="#22d3ee" fontSize={10} fontWeight={700}>FLOW INTENSITY</text>
            <rect x={0} y={36} width={260} height={62} rx={4} stroke="#22d3ee" strokeOpacity={0.25} />
            <g fill="#22d3ee" opacity={0.62}>
              {[16,28,40,52,64,76,88,100,112,124,136,148,160,172,184,196,208,220,232].map((x, i) => {
                const heights = [16,24,28,20,32,35,21,30,39,18,24,32,16,36,27,19,42,26,48];
                return <rect key={i} x={x} y={90 - heights[i]} width={6} height={heights[i]} />;
              })}
            </g>
          </g>
          <g opacity={0.55}>
            <text x={25} y={196} fill="#22d3ee" fontSize={10} fontWeight={700}>MARKET BREADTH</text>
            <rect x={25} y={210} width={245} height={42} rx={4} stroke="#22d3ee" strokeOpacity={0.24} />
            <path d="M40 242 63 229 78 237 96 221 120 228 144 211 165 217 188 202 211 207 240 191 264 186" stroke="#22d3ee" strokeWidth={2} />
          </g>
        </svg>
      </div>

      {/* Metric cards */}
      <div style={{
        position: 'absolute', left: 44, right: 210, bottom: 89, height: 126,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 17, zIndex: 20,
      }}>
        {/* Dark Pool */}
        <MetricCard color="#34d399" borderColor="rgba(52,211,153,0.35)" label="Dark Pool" value={`${dp}%`}
          icon={<svg width={50} height={50} viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx={25} cy={25} r={22} opacity={0.22} /><path d="M4 30 C12 12 18 42 26 24 C34 6 40 35 46 23" /></svg>} />
        {/* Smart Flow */}
        <MetricCard color="#22d3ee" borderColor="rgba(34,211,238,0.35)" label="Smart Flow" value={`${whale}/100`}
          icon={<svg width={50} height={50} viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M7 16 C18 8 28 25 43 12" /><path d="M7 25 C18 17 28 34 43 21" opacity={0.65} /><path d="M7 34 C18 26 28 43 43 30" opacity={0.45} /><circle cx={43} cy={12} r={3} fill="currentColor" /><circle cx={43} cy={21} r={3} fill="currentColor" /><circle cx={43} cy={30} r={3} fill="currentColor" /></svg>} />
        {/* GEX */}
        <MetricCard color="#fbbf24" borderColor="rgba(251,191,36,0.35)" label="GEX" value={gex} smallValue
          icon={<svg width={50} height={50} viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M10 40V27M20 40V18M30 40V10M40 40V22" /><path d="M6 40h38" opacity={0.6} /></svg>} />
      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute', left: 43, right: 43, bottom: 27, zIndex: 20,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'end', gap: 20,
      }}>
        <div style={{ color: '#64748b', fontSize: 19, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.02em' }}>
          Institutional Structure Analysis
        </div>
        <div style={{ textAlign: 'center', color: '#64748b', fontSize: 15, lineHeight: 1, fontWeight: 500, letterSpacing: '0.02em' }}>
          Observation only — not financial advice.
        </div>
        <div style={{
          textAlign: 'right', color: '#22d3ee', fontSize: 26, lineHeight: 1, fontWeight: 800,
          letterSpacing: '0.04em', textShadow: '0 0 18px rgba(34,211,238,0.24)',
        }}>signumhq.com</div>
      </div>
    </main>
  );
}

function MetricCard({ color, borderColor, label, value, icon, smallValue }: {
  color: string; borderColor: string; label: string; value: string; icon: React.ReactNode; smallValue?: boolean;
}) {
  return (
    <div style={{
      position: 'relative', borderRadius: 14, border: `1px solid ${borderColor}`,
      background: 'linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.018)), rgba(10,17,30,0.70)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 44px rgba(0,0,0,0.28)',
      overflow: 'hidden', padding: '25px 26px 20px 132px',
      backdropFilter: 'blur(14px)', color,
    }}>
      {/* Bottom glow bar */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 3,
        background: color, boxShadow: `0 0 18px ${color}`,
      }} />
      {/* Icon */}
      <div style={{
        position: 'absolute', left: 26, top: 26, width: 72, height: 72, borderRadius: '50%',
        border: `1px solid ${color}`, display: 'grid', placeItems: 'center',
        background: 'rgba(255,255,255,0.02)',
        boxShadow: `inset 0 0 22px rgba(255,255,255,0.03), 0 0 16px ${color}33`,
      }}>{icon}</div>
      <div style={{ color, fontSize: 20, lineHeight: 1, fontWeight: 700, letterSpacing: '-0.02em' }}>{label}</div>
      <div style={{
        marginTop: 13, color, fontSize: smallValue ? 38 : 48, lineHeight: 0.88, fontWeight: 900,
        letterSpacing: smallValue ? '-0.04em' : '-0.055em',
        textShadow: `0 0 22px ${color}4D`,
      }}>{value}</div>
    </div>
  );
}

export default function SpaceXIPOPage() {
  return (
    <Suspense fallback={<div style={{ width: 1200, height: 675, background: '#040710' }} />}>
      <SpaceXIPOCard />
    </Suspense>
  );
}
