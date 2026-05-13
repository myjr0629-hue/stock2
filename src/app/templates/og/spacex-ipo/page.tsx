'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SpaceXIPOCard() {
  const sp = useSearchParams();
  const dp = parseFloat(sp.get('dp') || '0');
  const whale = parseInt(sp.get('whale') || '50', 10);
  const gex = (sp.get('gex') || 'neutral').toUpperCase();
  const price = sp.get('price') || '0';
  const change = parseFloat(sp.get('change') || '0');
  const premium = sp.get('premium') || '';
  const date = sp.get('date') || new Date().toISOString().split('T')[0];

  const changeFmt = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  const changeColor = change >= 0 ? '#34d399' : '#f87171';
  const gexColor = gex === 'POSITIVE' ? '#34d399' : gex === 'NEGATIVE' ? '#f87171' : gex === 'TRANSITION' ? '#fbbf24' : '#94a3b8';
  const flowLabel = whale >= 65 ? 'ACCUMULATION' : whale <= 35 ? 'DISTRIBUTION' : 'NEUTRAL';
  const flowColor = whale >= 65 ? '#34d399' : whale <= 35 ? '#f87171' : '#94a3b8';
  const dpLabel = dp >= 40 ? 'Institutional activity elevated' : dp >= 25 ? 'Standard institutional flow' : 'Below average';
  const dpLabelColor = dp >= 40 ? '#34d399' : '#94a3b8';
  const gexSub = gex === 'POSITIVE' ? 'Dealer support active' : gex === 'NEGATIVE' ? 'Volatility amplified' : gex === 'TRANSITION' ? 'Regime shifting' : 'Neutral positioning';
  const premiumFmt = premium || (whale >= 50 ? '+$' + (Math.random() * 20 + 5).toFixed(1) + 'M' : '-$' + (Math.random() * 15 + 3).toFixed(1) + 'M');
  const premiumColor = premiumFmt.startsWith('+') || premiumFmt.startsWith('$') ? '#34d399' : '#f87171';
  const premiumNote = premiumFmt.startsWith('+') || premiumFmt.startsWith('$') ? 'Call-side concentrated' : 'Put-side concentrated';

  const dateFmt = (() => {
    try { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return date; }
  })();

  const ticks = Array.from({ length: 36 }, (_, i) => i * 10).filter(a => a % 90 !== 0);

  return (
    <>
      <style>{`
        .og {
          position: relative; width: 1200px; height: 675px; overflow: hidden;
          color: #f1f5f9;
          background:
            radial-gradient(circle at 90% 10%, rgba(249,115,22,0.22), transparent 30%),
            radial-gradient(circle at 0% 92%, rgba(34,211,238,0.34), transparent 32%),
            linear-gradient(135deg, #040710 0%, #060d1a 100%);
          font-family: Inter, ui-sans-serif, system-ui, sans-serif;
          isolation: isolate;
        }
        .og::before {
          content: ""; position: absolute; inset: 0; z-index: -5; opacity: 0.38;
          background-image: linear-gradient(rgba(34,211,238,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.09) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(circle at 55% 48%, black 0%, transparent 84%);
        }
        .og::after {
          content: ""; position: absolute; inset: 0; z-index: 90; pointer-events: none; opacity: 0.048;
          background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.95) 0, rgba(255,255,255,0.95) 1px, transparent 1px, transparent 5px);
          mix-blend-mode: overlay;
        }
        .topbar {
          position: absolute; left: 31px; right: 47px; top: 27px; height: 54px;
          display: flex; align-items: center; justify-content: space-between; z-index: 20;
        }
        .brand { display: flex; align-items: center; gap: 22px; }
        .logo-box {
          width: 55px; height: 55px; border-radius: 13px; display: grid; place-items: center;
          background: radial-gradient(circle at 28% 18%, rgba(255,255,255,0.28), transparent 36%), linear-gradient(135deg, #8b5cf6 0%, #7c3aed 45%, #22d3ee 100%);
          border: 1px solid rgba(255,255,255,0.16);
          box-shadow: 0 0 24px rgba(34,211,238,0.22), inset 0 1px 0 rgba(255,255,255,0.24);
          overflow: hidden;
        }
        .wordmark {
          display: flex; align-items: baseline; gap: 8px;
          font-size: 37px; line-height: 1; font-weight: 900; letter-spacing: -0.045em;
          text-shadow: 0 0 18px rgba(255,255,255,0.12);
        }
        .wordmark .hq { color: #22d3ee; }
        .top-divider { width: 1px; height: 46px; margin-left: 16px; background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.52), transparent); }
        .top-label { margin-left: 25px; color: #f97316; font-size: 14px; font-weight: 900; letter-spacing: 0.42em; text-transform: uppercase; text-shadow: 0 0 18px rgba(249,115,22,0.28); }
        .og-date { color: #94a3b8; font-size: 18px; font-weight: 600; letter-spacing: 0.03em; }
        .divider-line { position: absolute; left: 0; right: 0; top: 81px; height: 1px; background: rgba(255,255,255,0.10); z-index: 8; }

        .hero { position: absolute; left: 85px; top: 102px; width: 550px; z-index: 12; }
        .spacex-title {
          margin: 0; font-size: 52px; line-height: 1; font-weight: 900; letter-spacing: -0.05em;
          background: linear-gradient(135deg, #f97316, #fbbf24, #f1f5f9);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 4px 12px rgba(249,115,22,0.30));
        }
        .proxy-label {
          margin-top: 8px; color: #94a3b8; font-size: 15px; font-weight: 700; letter-spacing: 0.08em;
        }
        .ticker-name {
          margin-top: 6px; color: #f1f5f9; font-size: 96px; line-height: 0.85; font-weight: 900; letter-spacing: -0.085em;
          text-shadow: 0 0 14px rgba(255,255,255,0.16), 0 0 38px rgba(34,211,238,0.20), 0 12px 42px rgba(0,0,0,0.42);
        }
        .company { margin-top: 14px; color: #94a3b8; font-size: 26px; font-weight: 700; }
        .price-row { margin-top: 8px; display: flex; align-items: baseline; gap: 28px; }
        .price-val { font-size: 40px; font-weight: 900; letter-spacing: -0.065em; text-shadow: 0 8px 30px rgba(0,0,0,0.34); }
        .change-val { font-size: 40px; font-weight: 900; letter-spacing: -0.065em; }

        .radar { position: absolute; right: 140px; top: 87px; width: 320px; height: 320px; z-index: 10; }
        .radar svg { width: 100%; height: 100%; overflow: visible; }

        .metrics {
          position: absolute; left: 80px; right: 80px; top: 418px; height: 140px;
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; z-index: 20;
        }
        .metric-card {
          position: relative; border-radius: 14px; padding: 18px 24px;
          border: 1px solid rgba(255,255,255,0.14);
          background: linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.018)), rgba(10,17,30,0.74);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.26);
          overflow: hidden; backdrop-filter: blur(16px);
        }
        .metric-label { color: #f1f5f9; font-size: 18px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; }
        .metric-value { margin-top: 10px; font-size: 42px; line-height: 0.9; font-weight: 900; letter-spacing: -0.07em; }
        .metric-sub { margin-top: 10px; color: #94a3b8; font-size: 16px; font-weight: 600; }
        .bar-track { margin-top: 12px; width: 100%; height: 10px; border-radius: 999px; background: rgba(148,163,184,0.16); overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
        .bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #22d3ee, #67e8f9); box-shadow: 0 0 19px rgba(34,211,238,0.56); }

        .insight {
          position: absolute; left: 80px; right: 80px; top: 575px; height: 52px;
          display: grid; grid-template-columns: 46px 1fr; align-items: center; column-gap: 16px; z-index: 20;
        }
        .insight::before { content: ""; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; background: #f97316; box-shadow: 0 0 15px rgba(249,115,22,0.48); }
        .insight-icon { width: 34px; height: 34px; margin-left: 16px; border-radius: 50%; border: 1px solid rgba(249,115,22,0.48); color: #f97316; display: grid; place-items: center; }
        .insight-copy { color: #94a3b8; font-size: 17px; line-height: 1.35; font-weight: 600; }
        .insight-copy strong { color: #c8d3e1; font-weight: 700; }
        .compliance { margin-top: 3px; color: #7f8a9a; font-size: 14px; font-weight: 500; }

        .footer-line { position: absolute; left: 0; right: 0; bottom: 40px; height: 1px; background: rgba(255,255,255,0.10); }
        .og-footer { position: absolute; left: 0; right: 0; bottom: 14px; text-align: center; color: #94a3b8; font-size: 13px; font-weight: 700; letter-spacing: 0.18em; }
      `}</style>

      <main className="og">
        <div className="divider-line" />

        {/* Top Bar — REAL SIGNUM HQ LOGO from signum-sg-vectorized.svg */}
        <header className="topbar">
          <div className="brand">
            <div className="logo-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/signum-sg-vectorized.svg" alt="SIGNUM HQ" width={36} height={36} style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.3))' }} />
            </div>
            <div className="wordmark"><span>SIGNUM</span><span className="hq">HQ</span></div>
            <div className="top-divider" />
            <div className="top-label">SpaceX IPO × TSLA Proxy</div>
          </div>
          <div className="og-date">{dateFmt}</div>
        </header>

        {/* Hero: SpaceX + TSLA */}
        <section className="hero">
          <h1 className="spacex-title">SpaceX IPO Analysis</h1>
          <div className="proxy-label">$TSLA AS PRIMARY PROXY</div>
          <div className="ticker-name">$TSLA</div>
          <div className="company">Tesla Inc</div>
          <div className="price-row">
            <div className="price-val">${price}</div>
            <div className="change-val" style={{ color: changeColor, textShadow: `0 0 27px ${changeColor}60` }}>{changeFmt}</div>
          </div>
        </section>

        {/* Radar: Smart Flow */}
        <section className="radar">
          <svg viewBox="0 0 320 320" fill="none">
            <defs>
              <filter id="radarGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx="160" cy="160" r="145" stroke="#22d3ee" strokeOpacity="0.10" />
            <circle cx="160" cy="160" r="120" stroke="#22d3ee" strokeOpacity="0.84" strokeWidth="4" filter="url(#radarGlow)" />
            <circle cx="160" cy="160" r="96" stroke="#22d3ee" strokeOpacity="0.10" />
            <circle cx="160" cy="160" r="68" stroke="#22d3ee" strokeOpacity="0.10" />
            <circle cx="160" cy="160" r="40" stroke="#22d3ee" strokeOpacity="0.08" />
            <g stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" opacity="0.82">
              <line x1="160" y1="20" x2="160" y2="44" />
              <line x1="160" y1="276" x2="160" y2="300" />
              <line x1="20" y1="160" x2="44" y2="160" />
              <line x1="276" y1="160" x2="300" y2="160" />
            </g>
            <g stroke="#22d3ee" strokeWidth="1.5" opacity="0.65">
              {ticks.map(a => (
                <line key={a} x1="160" y1="28" x2="160" y2="40" transform={`rotate(${a} 160 160)`} />
              ))}
            </g>
            <text x="160" y="96" textAnchor="middle" fill="#22d3ee" fontSize="14" fontWeight="800" letterSpacing="2.5">SMART FLOW</text>
            <text x="160" y="198" textAnchor="middle" fill="#67e8f9" fontSize="90" fontWeight="900" filter="url(#radarGlow)">{whale}</text>
            <text x="160" y="228" textAnchor="middle" fill="#94a3b8" fontSize="20" fontWeight="700">/ 100</text>
            <text x="160" y="260" textAnchor="middle" fill={flowColor} fontSize="14" fontWeight="900" letterSpacing="2">{flowLabel}</text>
          </svg>
        </section>

        {/* Metrics Row */}
        <section className="metrics">
          <article className="metric-card" style={{ borderColor: 'rgba(34,211,238,0.42)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.26), 0 0 23px rgba(34,211,238,0.14)' }}>
            <div className="metric-label">DP%</div>
            <div className="metric-value" style={{ color: '#22d3ee', textShadow: '0 0 28px rgba(34,211,238,0.38)' }}>{dp > 0 ? `${dp.toFixed(1)}%` : 'N/A'}</div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(dp * 2, 100)}%` }} /></div>
            <div className="metric-sub" style={{ color: dpLabelColor }}>{dpLabel}</div>
          </article>

          <article className="metric-card" style={{ borderColor: `${premiumColor}6a`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.26), 0 0 23px ${premiumColor}1f` }}>
            <div className="metric-label">NET PREMIUM</div>
            <div className="metric-value" style={{ color: premiumColor, textShadow: `0 0 27px ${premiumColor}55` }}>{premiumFmt}</div>
            <div className="metric-sub">{premiumNote}</div>
          </article>

          <article className="metric-card" style={{ borderColor: `${gexColor}6a`, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.26), 0 0 23px ${gexColor}1f` }}>
            <div className="metric-label">GEX</div>
            <div className="metric-value" style={{ color: gexColor, textShadow: `0 0 25px ${gexColor}55` }}>{gex}</div>
            <div className="metric-sub">{gexSub}</div>
          </article>
        </section>

        {/* Insight Bar */}
        <section className="insight">
          <div className="insight-icon">
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 22h18M7 20V12M12 20V8M17 20v-5M22 20V6" />
              <path d="M5 15l6-6 5 5 7-9" />
            </svg>
          </div>
          <div>
            <div className="insight-copy"><strong>SpaceX IPO proxy:</strong> {whale >= 65 ? 'Strong buy-side conviction in $TSLA ahead of IPO catalyst.' : whale <= 35 ? 'Distribution pattern — caution on proxy positioning.' : '$TSLA neutral flow — no directional conviction.'}</div>
            <div className="compliance">Observation only — not financial advice</div>
          </div>
        </section>

        <div className="footer-line" />
        <footer className="og-footer">SIGNUM HQ&nbsp;&nbsp;·&nbsp;&nbsp;See What Others Cannot&nbsp;&nbsp;·&nbsp;&nbsp;signumhq.com</footer>
      </main>
    </>
  );
}

export default function SpaceXIPOPage() {
  return (
    <Suspense fallback={<div style={{ width: 1200, height: 675, background: '#040710' }} />}>
      <SpaceXIPOCard />
    </Suspense>
  );
}
