'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function PulseContent() {
  const sp = useSearchParams();
  const spy = parseFloat(sp.get('spy') || '0');
  const vix = parseFloat(sp.get('vix') || '18');
  const gex = sp.get('gex') || 'neutral';
  const dp = parseFloat(sp.get('dp') || '0');
  const date = sp.get('date') || new Date().toISOString().split('T')[0];

  // GEX config
  const gc: Record<string, { color: string; label: string; desc: string; signal: string; pct: number }> = {
    positive:   { color: '#34d399', label: 'POSITIVE',   desc: 'Dealer positioning may dampen volatility and support mean reversion.', signal: 'STRONG', pct: 75.7 },
    negative:   { color: '#f87171', label: 'NEGATIVE',   desc: 'Dealer hedging amplifies directional moves — trend acceleration likely.', signal: 'WEAK', pct: 18 },
    neutral:    { color: '#94a3b8', label: 'NEUTRAL',    desc: 'No directional conviction from dealers — watch for breakout signals.', signal: 'MIXED', pct: 50 },
    transition: { color: '#fbbf24', label: 'TRANSITION', desc: 'Regime shifting — structural transition in progress, elevated uncertainty.', signal: 'MIXED', pct: 50 },
  };
  const g = gc[gex.toLowerCase()] || gc.neutral;

  // VIX
  const vixColor = vix >= 30 ? '#f87171' : vix >= 25 ? '#f97316' : vix >= 18 ? '#fbbf24' : '#34d399';
  const vixLabel = vix >= 30 ? 'EXTREME' : vix >= 25 ? 'HIGH' : vix >= 18 ? 'ELEVATED' : 'CALM';
  const spyColor = spy > 0 ? '#34d399' : spy < 0 ? '#f87171' : '#94a3b8';
  const spyFmt = `${spy >= 0 ? '+' : ''}${spy.toFixed(2)}%`;
  const dpColor = dp >= 40 ? '#fbbf24' : '#22d3ee';

  const dateFmt = (() => {
    try { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return date; }
  })();

  return (
    <>
      <style>{`
        .og-card {
          position: relative; width: 1200px; height: 630px; overflow: hidden;
          color: #f1f5f9;
          background:
            radial-gradient(circle at 78% 8%, rgba(124,58,237,0.22), transparent 32%),
            radial-gradient(circle at 96% 42%, rgba(34,211,238,0.14), transparent 34%),
            radial-gradient(circle at 6% 92%, rgba(124,58,237,0.18), transparent 30%),
            linear-gradient(135deg, #040710 0%, #060d1a 45%, #030610 100%);
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          isolation: isolate;
        }
        .og-card::before {
          content: ""; position: absolute; inset: 0; opacity: 0.28;
          background-image: linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(circle at 50% 44%, black 0%, transparent 82%);
          z-index: -4;
        }
        .og-card::after {
          content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0.05;
          background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.8) 0, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 5px);
          mix-blend-mode: overlay; z-index: 20;
        }
        .mesh {
          position: absolute; inset: 0; z-index: -3;
          background: radial-gradient(circle at 92% 20%, rgba(34,211,238,0.22) 0 1px, transparent 2px), radial-gradient(circle at 7% 70%, rgba(167,139,250,0.20) 0 1px, transparent 2px);
          background-size: 14px 14px, 18px 18px;
          mask-image: radial-gradient(circle at 92% 28%, black 0%, transparent 25%), radial-gradient(circle at 4% 78%, black 0%, transparent 28%);
          mask-composite: add;
        }
        .wave-bg { position: absolute; right: -24px; top: 84px; width: 630px; height: 270px; opacity: 0.7; z-index: -1; }
        .bottom-wave { position: absolute; left: -80px; bottom: -58px; width: 720px; height: 210px; opacity: 0.45; z-index: -2; }
        .og-header { position: absolute; left: 44px; right: 44px; top: 32px; display: flex; justify-content: space-between; align-items: center; }
        .brand { display: flex; align-items: center; gap: 18px; }
        .logo-mark { position: relative; width: 52px; height: 52px; filter: drop-shadow(0 0 18px rgba(34,211,238,0.22)); border-radius: 14px; background: linear-gradient(135deg, #7c3aed, #06b6d4); display: grid; place-items: center; overflow: hidden; }
        .logo-mark img { width: 36px; height: 36px; object-fit: contain; }
        .wordmark { font-size: 32px; font-weight: 900; letter-spacing: 0.08em; line-height: 1; white-space: nowrap; }
        .wordmark span { color: #22d3ee; }
        .header-divider { width: 1px; height: 36px; margin-left: 10px; background: linear-gradient(to bottom, transparent, rgba(203,231,255,0.38), transparent); }
        .pulse-label { margin-left: 18px; color: #bfd5e7; font-size: 15px; font-weight: 600; letter-spacing: 0.48em; }
        .og-date { color: #94a3b8; font-size: 18px; font-weight: 600; letter-spacing: 0.04em; }
        .hero-card {
          position: absolute; left: 50px; right: 50px; top: 104px; height: 250px;
          border: 1.5px solid rgba(203,231,255,0.50); border-radius: 20px;
          background: linear-gradient(120deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02) 38%, rgba(34,211,238,0.05)), rgba(11,18,30,0.74);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 0 20px rgba(203,231,255,0.12), 0 0 56px rgba(34,211,238,0.10), 0 18px 52px rgba(0,0,0,0.35);
          overflow: hidden; backdrop-filter: blur(18px);
        }
        .hero-card::before {
          content: ""; position: absolute; inset: -80px -30px auto auto; width: 540px; height: 320px;
          background: radial-gradient(circle, rgba(34,211,238,0.20), transparent 63%); opacity: 0.55; pointer-events: none;
        }
        .hero-content { position: relative; padding: 24px 46px; height: 100%; display: flex; flex-direction: column; }
        .eyebrow { color: #dbe9ff; font-size: 18px; font-weight: 800; letter-spacing: 0.42em; margin-bottom: 4px; }
        .status { font-size: 84px; line-height: 0.94; margin: 0; font-weight: 900; letter-spacing: -0.04em; }
        .og-description { margin-top: 6px; color: #c8d3e1; font-size: 14px; font-weight: 500; letter-spacing: 0.015em; }
        .scale-wrap { margin-top: auto; padding-right: 120px; }
        .scale-title { color: #c9d7ea; font-size: 10px; font-weight: 800; letter-spacing: 0.36em; margin-bottom: 8px; }
        .scale { position: relative; height: 8px; display: grid; grid-template-columns: repeat(16, 1fr); gap: 5px; }
        .scale i { display: block; border-radius: 999px; background: linear-gradient(90deg, #a78bfa, #5e697d 52%, #34d399); box-shadow: 0 0 10px rgba(52,211,153,0.13); }
        .scale .knob {
          position: absolute; top: 50%; width: 28px; height: 28px; transform: translate(-50%, -50%);
          border-radius: 50%; border: 4px solid; background: #082317;
        }
        .scale-labels { display: flex; justify-content: space-between; margin-top: 13px; font-size: 12px; font-weight: 800; letter-spacing: 0.18em; }
        .signal-orb {
          position: absolute; right: 50px; top: 42px; width: 130px; height: 130px; border-radius: 999px;
          display: grid; place-items: center; border: 1.5px solid rgba(203,231,255,0.25);
          background: radial-gradient(circle, rgba(6,9,15,0.92) 0 40%, rgba(34,211,238,0.05) 41% 100%), repeating-radial-gradient(circle, rgba(148,163,184,0.15) 0 1px, transparent 1px 14px);
          box-shadow: 0 0 54px rgba(34,211,238,0.13), inset 0 0 40px rgba(34,211,238,0.07);
        }
        .signal-orb::before, .signal-orb::after {
          content: ""; position: absolute; top: 50%; width: 164px; height: 2px; filter: blur(0.3px);
        }
        .signal-orb::before { right: 100%; }
        .signal-orb::after { left: 100%; }
        .signal-inner { text-align: center; }
        .signal-inner small { display: block; color: #e8f2ff; font-size: 11px; font-weight: 800; letter-spacing: 0.36em; }
        .signal-inner strong { display: block; margin-top: 10px; font-size: 18px; font-weight: 900; letter-spacing: 0.28em; }
        .metrics { position: absolute; left: 50px; right: 50px; top: 368px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .metric-card {
          position: relative; height: 182px; border-radius: 14px;
          border: 1.5px solid rgba(203,231,255,0.35);
          background: linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.018)), rgba(13,22,38,0.88);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), 0 0 16px rgba(203,231,255,0.10), 0 0 24px rgba(34,211,238,0.06), 0 16px 32px rgba(0,0,0,0.24);
          backdrop-filter: blur(16px); overflow: hidden; padding: 26px 36px;
        }
        .metric-card.spx::after { content: ""; position: absolute; inset: auto 0 0 0; height: 58px; background: radial-gradient(ellipse at 80% 100%, rgba(52,211,153,0.20), transparent 60%); opacity: 0.9; }
        .metric-card.dark::after { content: ""; position: absolute; inset: auto 0 0 0; height: 58px; background: radial-gradient(ellipse at 70% 100%, rgba(34,211,238,0.20), transparent 62%); opacity: 0.9; }
        .metric-card.vix-card::after { content: ""; position: absolute; inset: auto 0 0 0; height: 58px; background: radial-gradient(ellipse at 80% 100%, rgba(167,139,250,0.20), transparent 62%); opacity: 0.9; }
        .metric-head { display: flex; justify-content: space-between; align-items: center; font-size: 16px; font-weight: 900; letter-spacing: 0.17em; margin-bottom: 16px; }
        .metric-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; }
        .metric-value { position: relative; z-index: 2; font-size: 56px; line-height: 0.96; font-weight: 900; letter-spacing: -0.04em; }
        .metric-sub { position: relative; z-index: 2; margin-top: 24px; color: #94a3b8; font-size: 12px; font-weight: 700; letter-spacing: 0.24em; text-transform: uppercase; display: flex; align-items: center; gap: 10px; }
        .dot { width: 7px; height: 7px; border-radius: 50%; }
        .og-sparkline { position: absolute; right: -4px; bottom: 32px; width: 205px; height: 82px; opacity: 0.8; }
        .bar-track { position: relative; z-index: 2; margin-top: 22px; width: 100%; height: 19px; border-radius: 999px; background: rgba(148,163,184,0.13); overflow: hidden; }
        .bar-fill { height: 100%; border-radius: inherit; background: linear-gradient(90deg, #22d3ee, #67e8f9); box-shadow: 0 0 20px rgba(34,211,238,0.44); }
        .bar-labels { position: relative; z-index: 2; margin-top: 10px; display: flex; justify-content: space-between; color: #93a5bd; font-size: 13px; font-weight: 600; }
        .vix-row { display: flex; align-items: center; gap: 26px; }
        .badge { padding: 10px 19px; border-radius: 999px; font-size: 16px; font-weight: 900; letter-spacing: 0.08em; }
        .og-footer { position: absolute; left: 0; right: 0; bottom: 26px; text-align: center; color: #b7c2d4; font-size: 14px; font-weight: 600; letter-spacing: 0.32em; }
      `}</style>

      <main className="og-card">
        <div className="mesh" />

        {/* Wave backgrounds */}
        <svg className="wave-bg" viewBox="0 0 640 280" fill="none">
          <defs><linearGradient id="waveGrad" x1="0" y1="0" x2="640" y2="0"><stop stopColor={g.color} stopOpacity="0" /><stop offset="0.45" stopColor={g.color} stopOpacity="0.75" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></linearGradient></defs>
          <g opacity="0.6"><path d="M0 144 C90 78 146 202 232 132 C326 56 394 168 490 114 C552 80 598 104 640 76" stroke="url(#waveGrad)" strokeWidth="2" /><path d="M0 160 C94 94 148 214 235 149 C326 82 397 184 488 134 C548 101 597 126 640 98" stroke="url(#waveGrad)" strokeWidth="1" opacity="0.45" /><path d="M0 128 C90 62 142 186 228 116 C326 40 392 152 490 96 C552 62 598 86 640 58" stroke="url(#waveGrad)" strokeWidth="1" opacity="0.35" /></g>
        </svg>
        <svg className="bottom-wave" viewBox="0 0 720 210" fill="none">
          <defs><linearGradient id="bottomGrad" x1="0" y1="0" x2="720" y2="0"><stop stopColor="#a78bfa" stopOpacity="0" /><stop offset="0.42" stopColor="#a78bfa" stopOpacity="0.58" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></linearGradient></defs>
          <path d="M0 160 C82 84 128 212 214 124 C300 36 376 192 465 104 C560 12 626 156 720 72" stroke="url(#bottomGrad)" strokeWidth="1.5" /><path d="M0 178 C82 102 128 228 214 142 C300 58 376 210 465 126 C560 34 626 174 720 94" stroke="url(#bottomGrad)" strokeWidth="1" opacity="0.45" />
        </svg>

        {/* Header */}
        <header className="og-header">
          <div className="brand">
            <div className="logo-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="" />
            </div>
            <div className="wordmark">SIGNUM <span>HQ</span></div>
            <div className="header-divider" />
            <div className="pulse-label">MARKET PULSE</div>
          </div>
          <div className="og-date">{dateFmt}</div>
        </header>

        {/* GEX Hero */}
        <section className="hero-card">
          <div className="hero-content">
            <div className="eyebrow">GEX REGIME</div>
            <h1 className="status" style={{ color: g.color, textShadow: `0 0 40px ${g.color}55, 0 0 80px ${g.color}25` }}>{g.label}</h1>
            <p className="og-description">{g.desc}</p>

            <div className="scale-wrap">
              <div className="scale-title">GEX REGIME SCALE</div>
              <div className="scale">
                {Array.from({length: 16}, (_, i) => <i key={i} />)}
                <span className="knob" style={{ left: `${g.pct}%`, borderColor: g.color, boxShadow: `0 0 0 7px ${g.color}22, 0 0 28px ${g.color}88` }} />
              </div>
              <div className="scale-labels">
                <span style={{ color: '#a78bfa' }}>NEGATIVE</span>
                <span style={{ color: '#8fa0b6' }}>NEUTRAL</span>
                <span style={{ color: '#34d399' }}>POSITIVE</span>
              </div>
            </div>

            <div className="signal-orb" style={{ '--sig-color': g.color } as React.CSSProperties}>
              <style>{`.signal-orb::before, .signal-orb::after { background: linear-gradient(90deg, transparent, ${g.color}dd, transparent); }`}</style>
              <div className="signal-inner">
                <small>GEX SIGNAL</small>
                <strong style={{ color: g.color, textShadow: `0 0 24px ${g.color}80` }}>{g.signal}</strong>
              </div>
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="metrics">
          {/* S&P 500 */}
          <article className="metric-card spx">
            <div className="metric-head">
              <span>S&amp;P 500</span>
              <span className="metric-icon" style={{ border: `1px solid ${spyColor}66`, color: spyColor, background: `${spyColor}0f` }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 17l6-6 4 4 6-8" /><path d="M14 7h6v6" /></svg>
              </span>
            </div>
            <div className="metric-value" style={{ color: spyColor, textShadow: `0 0 30px ${spyColor}44` }}>{spyFmt}</div>
            <svg className="og-sparkline" viewBox="0 0 210 82" fill="none">
              <defs><linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="82"><stop stopColor={spyColor} stopOpacity="0.35" /><stop offset="1" stopColor={spyColor} stopOpacity="0" /></linearGradient></defs>
              <path d="M0 72 L18 65 L33 55 L50 58 L66 46 L86 50 L104 34 L126 38 L145 22 L162 25 L181 14 L198 10 L210 4 L210 82 L0 82 Z" fill="url(#sparkFill)" />
              <path d="M0 72 L18 65 L33 55 L50 58 L66 46 L86 50 L104 34 L126 38 L145 22 L162 25 L181 14 L198 10 L210 4" stroke={spyColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="metric-sub"><span className="dot" style={{ background: spyColor, boxShadow: `0 0 16px ${spyColor}aa` }} />Today&apos;s change</div>
          </article>

          {/* Dark Pool */}
          <article className="metric-card dark">
            <div className="metric-head">
              <span>DARK POOL</span>
              <span className="metric-icon" style={{ border: `1px solid ${dpColor}66`, color: dpColor, background: `${dpColor}0f` }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>
              </span>
            </div>
            <div className="metric-value" style={{ color: dpColor, textShadow: `0 0 30px ${dpColor}44` }}>{dp > 0 ? `${dp.toFixed(1)}%` : '—'}</div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(dp * 2, 100)}%`, background: `linear-gradient(90deg, #22d3ee, ${dpColor})`, boxShadow: `0 0 20px ${dpColor}70` }} /></div>
            <div className="bar-labels"><span>0%</span><span>50%</span><span>100%</span></div>
          </article>

          {/* VIX */}
          <article className="metric-card vix-card">
            <div className="metric-head">
              <span>VIX</span>
              <span className="metric-icon" style={{ border: '1px solid rgba(167,139,250,0.42)', color: '#a78bfa', background: 'rgba(167,139,250,0.06)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2-7 4 14 2-7h6" /></svg>
              </span>
            </div>
            <div className="vix-row">
              <div className="metric-value" style={{ color: vixColor, textShadow: `0 0 30px ${vixColor}44` }}>{vix.toFixed(1)}</div>
              <div className="badge" style={{ color: vixColor, border: `1px solid ${vixColor}77`, background: `${vixColor}14`, boxShadow: `inset 0 0 22px ${vixColor}0d` }}>{vixLabel}</div>
            </div>
            <div className="metric-sub"><span className="dot" style={{ background: '#a78bfa', boxShadow: '0 0 16px rgba(167,139,250,0.65)' }} />Market volatility</div>
          </article>
        </section>

        <footer className="og-footer">SIGNUM HQ&nbsp;&nbsp;·&nbsp;&nbsp;See What Others Cannot&nbsp;&nbsp;·&nbsp;&nbsp;signumhq.com</footer>
      </main>
    </>
  );
}

export default function PulseTemplate() {
  return (
    <Suspense fallback={<div style={{ width: 1200, height: 630, background: '#06090f' }} />}>
      <PulseContent />
    </Suspense>
  );
}
