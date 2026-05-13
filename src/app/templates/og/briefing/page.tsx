'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function BriefingContent() {
  const sp = useSearchParams();
  const spy = parseFloat(sp.get('spy') || '0');
  const vix = parseFloat(sp.get('vix') || '18');
  const gex = sp.get('gex') || 'neutral';
  const rlsi = parseInt(sp.get('rlsi') || '50', 10);
  const rlsiHist = (sp.get('rlsi_hist') || `${rlsi - 6},${rlsi - 2},${rlsi + 1},${rlsi - 3},${rlsi}`).split(',').map(Number);
  const date = sp.get('date') || new Date().toISOString().split('T')[0];
  const preview = sp.get('preview') || '';

  // Dynamic calculations
  const spyFmt = `${spy >= 0 ? '+' : ''}${spy.toFixed(2)}%`;
  const spyColor = spy > 0 ? '#34d399' : spy < 0 ? '#f87171' : '#94a3b8';
  const vixColor = vix >= 30 ? '#f87171' : vix >= 25 ? '#f97316' : vix >= 18 ? '#fbbf24' : '#34d399';
  const vixLabel = vix >= 30 ? 'EXTREME' : vix >= 25 ? 'HIGH' : vix >= 18 ? 'ELEVATED' : 'CALM';
  const gexUpper = gex.toUpperCase();
  const gexColor = gex === 'positive' ? '#34d399' : gex === 'negative' ? '#f87171' : gex === 'transition' ? '#fbbf24' : '#94a3b8';

  // RLSI risk level
  const riskLabel = rlsi >= 70 ? 'LOW RISK' : rlsi >= 50 ? 'MODERATE RISK' : rlsi >= 30 ? 'ELEVATED RISK' : 'HIGH RISK';
  const riskColor = rlsi >= 70 ? '#34d399' : rlsi >= 50 ? '#34d399' : rlsi >= 30 ? '#fbbf24' : '#f87171';

  // Date formatting
  const dateFmt = (() => {
    try {
      const d = new Date(date + 'T12:00:00Z');
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${days[d.getDay()]}`;
    } catch { return date; }
  })();

  // RLSI chart coordinates (5 points across 565px width, 190px height)
  const chartW = 565;
  const chartH = 190;
  const xPad = 88;
  const xSpacing = (540 - xPad) / 4;
  const yMin = 20;
  const yMax = 80;

  const points = rlsiHist.slice(-5).map((val, i) => {
    const x = xPad + i * xSpacing;
    const y = chartH - 30 - ((val - yMin) / (yMax - yMin)) * 130;
    return { x, y: Math.max(28, Math.min(155, y)), val };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x} 158 L${points[0].x} 158 Z`;

  // Briefing preview text
  const previewText = preview ||
    `Pre-market: S&P 500 futures at 5,650 (${spyFmt}). VIX at ${vix.toFixed(1)} — ${vixLabel.toLowerCase()} volatility. GEX regime ${gexUpper}. Structure analysis in progress...`;

  return (
    <>
      <style>{`
        .og {
          position: relative;
          width: 1200px; height: 675px; overflow: hidden;
          color: #f1f5f9;
          background:
            radial-gradient(circle at 96% 0%, rgba(124,58,237,0.42), transparent 35%),
            radial-gradient(circle at 0% 100%, rgba(34,211,238,0.35), transparent 34%),
            linear-gradient(135deg, #040710 0%, #060d1a 100%);
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          isolation: isolate;
        }
        .og::before {
          content: ""; position: absolute; inset: 0; z-index: -5; opacity: 0.42;
          background-image:
            linear-gradient(rgba(34,211,238,0.10) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.10) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(circle at 50% 50%, black 0%, transparent 82%);
        }
        .og::after {
          content: ""; position: absolute; inset: 0; z-index: 90; pointer-events: none; opacity: 0.05;
          background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.95) 0, rgba(255,255,255,0.95) 1px, transparent 1px, transparent 5px);
          mix-blend-mode: overlay;
        }
        .topbar {
          position: absolute; left: 45px; right: 45px; top: 33px; height: 64px;
          display: flex; align-items: center; justify-content: space-between; z-index: 10;
        }
        .brand { display: flex; align-items: center; gap: 22px; }
        .logo-box {
          width: 58px; height: 58px; border-radius: 13px;
          display: grid; place-items: center;
          background: radial-gradient(circle at 28% 18%, rgba(255,255,255,0.26), transparent 34%), linear-gradient(135deg, #8b5cf6 0%, #7c3aed 46%, #22d3ee 100%);
          border: 1px solid rgba(255,255,255,0.18);
          box-shadow: 0 0 26px rgba(34,211,238,0.22), inset 0 1px 0 rgba(255,255,255,0.24);
        }
        .wordmark {
          display: flex; align-items: baseline; gap: 7px;
          font-size: 42px; line-height: 1; font-weight: 900; letter-spacing: -0.05em;
          text-shadow: 0 0 18px rgba(255,255,255,0.12);
        }
        .wordmark .hq { color: #22d3ee; }
        .top-divider {
          width: 1px; height: 40px; margin-left: 25px;
          background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.55), transparent);
        }
        .brief-label {
          margin-left: 36px; color: #22d3ee;
          font-size: 20px; font-weight: 900; letter-spacing: 0.42em; text-transform: uppercase;
          text-shadow: 0 0 18px rgba(34,211,238,0.26);
        }
        .og-date { color: #94a3b8; font-size: 18px; line-height: 1; font-weight: 600; letter-spacing: -0.02em; }
        .main-card {
          position: absolute; left: 49px; right: 49px; top: 120px; height: 386px;
          border-radius: 28px; border: 1.5px solid rgba(213,236,255,0.33);
          background: radial-gradient(circle at 94% 3%, rgba(124,58,237,0.15), transparent 32%), linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025)), rgba(10,17,30,0.72);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.17), 0 28px 72px rgba(0,0,0,0.34), 0 0 40px rgba(34,211,238,0.07);
          overflow: hidden; backdrop-filter: blur(16px);
          display: grid; grid-template-columns: 55% 45%;
        }
        .main-card::before {
          content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
          background: linear-gradient(90deg, rgba(34,211,238,0.25), transparent 22%, transparent 76%, rgba(124,58,237,0.22));
          opacity: 0.28;
        }
        .left-side {
          position: relative; padding: 39px 46px 34px 46px;
          border-right: 1px solid rgba(255,255,255,0.18);
        }
        .right-side { position: relative; padding: 45px 45px 35px 43px; }
        .chart-label {
          color: #94a3b8; font-size: 18px; line-height: 1; font-weight: 800;
          letter-spacing: 0.13em; text-transform: uppercase;
        }
        .chart { position: absolute; left: 57px; right: 34px; top: 96px; height: 178px; }
        .chart svg { width: 100%; height: 100%; overflow: visible; }
        .rlsi-bottom {
          position: absolute; left: 80px; right: 70px; bottom: 29px;
          display: flex; align-items: center; gap: 45px;
        }
        .rlsi-value {
          font-size: 92px; line-height: 0.82; font-weight: 900; letter-spacing: -0.08em;
        }
        .risk-badge {
          height: 54px; padding: 0 31px;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 15px; font-size: 24px; line-height: 1; font-weight: 900;
          letter-spacing: 0.07em; text-transform: uppercase;
        }
        .metric-row {
          position: relative; height: 112px;
          display: grid; grid-template-columns: 210px 1fr; align-items: center;
          border-bottom: 1px solid rgba(255,255,255,0.14);
        }
        .metric-row:last-child { border-bottom: none; }
        .metric-label {
          color: #94a3b8; font-size: 28px; line-height: 1; font-weight: 800;
          letter-spacing: -0.04em; text-transform: uppercase;
        }
        .metric-value {
          justify-self: end; font-size: 62px; line-height: 0.9; font-weight: 900; letter-spacing: -0.065em;
        }
        .elevated-badge {
          display: inline-flex; align-items: center; margin-left: 25px;
          height: 46px; padding: 0 24px; border-radius: 13px;
          font-size: 24px; line-height: 1; font-weight: 900; letter-spacing: 0.03em;
          transform: translateY(-8px);
        }
        .preview-text {
          position: absolute; left: 77px; right: 75px; top: 535px; height: 78px;
          color: #c8d3e1; font-size: 25px; line-height: 1.45; font-weight: 500;
          letter-spacing: -0.045em; overflow: hidden;
        }
        .preview-text::after {
          content: ""; position: absolute; top: 0; right: 0;
          width: 430px; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(4,7,16,0.84) 78%, rgba(4,7,16,1));
          pointer-events: none;
        }
        .og-footer {
          position: absolute; left: 0; right: 0; bottom: 22px; text-align: center;
          color: #94a3b8; font-size: 13px; line-height: 1; font-weight: 700;
          letter-spacing: 0.34em; text-transform: uppercase;
        }
      `}</style>

      <main className="og">
        {/* Top Bar */}
        <header className="topbar">
          <div className="brand">
            <div className="logo-box">
              <svg viewBox="0 0 64 64" fill="none" width="36" height="36">
                <path d="M48 10H25C15 10 9 16 9 25c0 8 5 13 15 17l16 6c5 2 8 5 8 9 0 5-4 8-12 8H15" stroke="white" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
                <path d="M48 10 37 21M16 54 28 43" stroke="white" strokeWidth="11" strokeLinecap="round" opacity="0.95" />
              </svg>
            </div>
            <div className="wordmark"><span>SIGNUM</span><span className="hq">HQ</span></div>
            <div className="top-divider" />
            <div className="brief-label">Morning Briefing</div>
          </div>
          <div className="og-date">{dateFmt}</div>
        </header>

        {/* Main Card */}
        <section className="main-card">
          {/* Left: RLSI Chart */}
          <div className="left-side">
            <div className="chart-label">RLSI — Risk Level Stability Index</div>
            <div className="chart">
              <svg viewBox="0 0 565 190" fill="none">
                <defs>
                  <linearGradient id="areaFill" x1="0" y1="50" x2="0" y2="185" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#22d3ee" stopOpacity="0.25" />
                    <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
                  </linearGradient>
                  <filter id="cyanGlow" x="-20%" y="-30%" width="140%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                {/* Grid lines */}
                <g stroke="rgba(148,163,184,0.27)" strokeDasharray="4 8">
                  <path d="M45 28H548" /><path d="M45 83H548" /><path d="M45 138H548" />
                </g>
                <g stroke="rgba(148,163,184,0.25)">
                  <path d="M45 28V158" /><path d="M45 158H548" />
                  <path d="M158 28V158" opacity="0.5" /><path d="M271 28V158" opacity="0.5" />
                  <path d="M384 28V158" opacity="0.5" /><path d="M497 28V158" opacity="0.5" />
                </g>
                {/* Y-axis labels */}
                <text x="18" y="33" fill="#94a3b8" fontSize="17" fontWeight="600">80</text>
                <text x="18" y="88" fill="#94a3b8" fontSize="17" fontWeight="600">60</text>
                <text x="18" y="143" fill="#94a3b8" fontSize="17" fontWeight="600">40</text>
                <text x="18" y="162" fill="#94a3b8" fontSize="17" fontWeight="600">20</text>
                {/* Area + Line */}
                <path d={areaPath} fill="url(#areaFill)" />
                <path d={linePath} stroke="#22d3ee" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter="url(#cyanGlow)" />
                {/* Data points */}
                <g fill="#67e8f9" filter="url(#cyanGlow)">
                  {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="5" />)}
                </g>
                {/* Value labels */}
                <g fill="#22d3ee" fontSize="18" fontWeight="800" textAnchor="middle">
                  {points.map((p, i) => <text key={i} x={p.x} y={p.y - 18}>{p.val}</text>)}
                </g>
                {/* Day labels */}
                <g fill="#94a3b8" fontSize="16" fontWeight="600" textAnchor="middle">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => (
                    <text key={d} x={points[i]?.x || xPad + i * xSpacing} y="184">{d}</text>
                  ))}
                </g>
              </svg>
            </div>
            <div className="rlsi-bottom">
              <div className="rlsi-value" style={{ color: riskColor, textShadow: `0 0 28px ${riskColor}60` }}>{rlsi}</div>
              <div className="risk-badge" style={{ borderColor: `${riskColor}aa`, background: `${riskColor}14`, color: riskColor, boxShadow: `inset 0 0 22px ${riskColor}08, 0 0 18px ${riskColor}16` }}>
                {riskLabel}
              </div>
            </div>
          </div>

          {/* Right: Key Metrics */}
          <div className="right-side">
            <div className="metric-row">
              <div className="metric-label">S&amp;P 500</div>
              <div className="metric-value" style={{ color: spyColor, textShadow: `0 0 25px ${spyColor}50` }}>{spyFmt}</div>
            </div>
            <div className="metric-row">
              <div className="metric-label">VIX</div>
              <div className="metric-value" style={{ color: vixColor, textShadow: `0 0 20px ${vixColor}36` }}>
                {vix.toFixed(1)}
                <span className="elevated-badge" style={{ borderColor: `${vixColor}c0`, color: vixColor, background: `${vixColor}0a` }}>{vixLabel}</span>
              </div>
            </div>
            <div className="metric-row">
              <div className="metric-label">GEX Regime</div>
              <div className="metric-value" style={{ color: gexColor, textShadow: `0 0 25px ${gexColor}50` }}>{gexUpper}</div>
            </div>
          </div>
        </section>

        {/* Briefing Preview */}
        <div className="preview-text">{previewText}</div>

        {/* Footer */}
        <footer className="og-footer">
          SIGNUM HQ&nbsp;&nbsp;·&nbsp;&nbsp;See What Others Cannot&nbsp;&nbsp;·&nbsp;&nbsp;signumhq.com
        </footer>
      </main>
    </>
  );
}

export default function BriefingTemplate() {
  return (
    <Suspense fallback={<div style={{ width: 1200, height: 675, background: '#040710' }} />}>
      <BriefingContent />
    </Suspense>
  );
}
