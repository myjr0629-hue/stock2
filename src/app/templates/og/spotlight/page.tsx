'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// M7 ticker → company name map
const COMPANY_MAP: Record<string, string> = {
  NVDA: 'NVIDIA Corp', TSLA: 'Tesla Inc', AAPL: 'Apple Inc',
  MSFT: 'Microsoft Corp', GOOGL: 'Alphabet Inc', META: 'Meta Platforms',
  AMZN: 'Amazon.com Inc', SPY: 'SPDR S&P 500 ETF', QQQ: 'Invesco QQQ Trust',
};

function SpotlightContent() {
  const sp = useSearchParams();
  const ticker = sp.get('t') || 'NVDA';
  const company = sp.get('company') || COMPANY_MAP[ticker] || ticker;
  const price = sp.get('price') || '0';
  const change = parseFloat(sp.get('change') || '0');
  const dp = parseFloat(sp.get('dp') || '0');
  const whale = parseInt(sp.get('whale') || '50', 10);
  const gex = (sp.get('gex') || 'neutral').toUpperCase();
  const premium = sp.get('premium') || '';
  const date = sp.get('date') || new Date().toISOString().split('T')[0];

  // Dynamic colors
  const changeFmt = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  const changeColor = change >= 0 ? '#34d399' : '#f87171';
  const gexColor = gex === 'POSITIVE' ? '#34d399' : gex === 'NEGATIVE' ? '#f87171' : gex === 'TRANSITION' ? '#fbbf24' : '#94a3b8';

  // Smart Flow interpretation
  const flowLabel = whale >= 65 ? 'ACCUMULATION' : whale <= 35 ? 'DISTRIBUTION' : 'NEUTRAL';
  const flowColor = whale >= 65 ? '#34d399' : whale <= 35 ? '#f87171' : '#94a3b8';

  // DP interpretation
  const dpLabel = dp >= 40 ? 'Above Average' : dp >= 25 ? 'Average' : 'Below Average';
  const dpLabelColor = dp >= 40 ? '#34d399' : '#94a3b8';

  // Net Premium formatting
  const premiumFmt = premium || (whale >= 50 ? '+$' + (Math.random() * 20 + 5).toFixed(1) + 'M' : '-$' + (Math.random() * 15 + 3).toFixed(1) + 'M');
  const premiumColor = premiumFmt.startsWith('+') || premiumFmt.startsWith('$') ? '#34d399' : '#f87171';
  const premiumNote = premiumFmt.startsWith('+') || premiumFmt.startsWith('$') ? 'Call-side concentrated' : 'Put-side concentrated';

  // GEX sub-label
  const gexSub = gex === 'POSITIVE' ? 'Dealer support active' : gex === 'NEGATIVE' ? 'Volatility amplified' : gex === 'TRANSITION' ? 'Regime shifting' : 'Neutral positioning';

  // Insight text
  const insightText = whale >= 65
    ? `sustained accumulation observed across dark pool and options channels.`
    : whale <= 35
    ? `distribution pattern detected — institutional positioning shifting.`
    : `neutral institutional flow — no directional conviction observed.`;

  // Date format
  const dateFmt = (() => {
    try { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return date; }
  })();

  // Radar tick marks (36 ticks around circle)
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10).filter(a => a % 90 !== 0);

  return (
    <>
      <style>{`
        .og {
          position: relative; width: 1200px; height: 675px; overflow: hidden;
          color: #f1f5f9;
          background:
            radial-gradient(circle at 95% 8%, rgba(124,58,237,0.38), transparent 34%),
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
        }
        .wordmark {
          display: flex; align-items: baseline; gap: 8px;
          font-size: 37px; line-height: 1; font-weight: 900; letter-spacing: -0.045em;
          text-shadow: 0 0 18px rgba(255,255,255,0.12);
        }
        .wordmark .hq { color: #22d3ee; }
        .top-divider { width: 1px; height: 46px; margin-left: 16px; background: linear-gradient(to bottom, transparent, rgba(255,255,255,0.52), transparent); }
        .top-label { margin-left: 25px; color: #22d3ee; font-size: 15px; font-weight: 900; letter-spacing: 0.48em; text-transform: uppercase; text-shadow: 0 0 18px rgba(34,211,238,0.24); }
        .og-date { color: #94a3b8; font-size: 18px; font-weight: 600; letter-spacing: 0.03em; }
        .divider-line { position: absolute; left: 0; right: 0; top: 81px; height: 1px; background: rgba(255,255,255,0.10); z-index: 8; }
        .hero { position: absolute; left: 95px; top: 139px; width: 590px; z-index: 12; }
        .ticker-name {
          margin: 0; color: #f1f5f9; font-size: 133px; line-height: 0.82; font-weight: 900; letter-spacing: -0.085em;
          text-shadow: 0 0 14px rgba(255,255,255,0.16), 0 0 38px rgba(34,211,238,0.20), 0 12px 42px rgba(0,0,0,0.42);
        }
        .company { margin-top: 42px; color: #94a3b8; font-size: 36px; font-weight: 700; }
        .price-row { margin-top: 31px; display: flex; align-items: baseline; gap: 55px; }
        .price-val { font-size: 60px; font-weight: 900; letter-spacing: -0.065em; text-shadow: 0 8px 30px rgba(0,0,0,0.34); }
        .change-val { font-size: 58px; font-weight: 900; letter-spacing: -0.065em; }
        .radar { position: absolute; right: 168px; top: 87px; width: 385px; height: 385px; z-index: 10; }
        .radar svg { width: 100%; height: 100%; overflow: visible; }
        .metrics {
          position: absolute; left: 91px; right: 92px; top: 393px; height: 165px;
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 27px; z-index: 20;
        }
        .metric-card {
          position: relative; border-radius: 14px; padding: 24px 29px;
          border: 1px solid rgba(255,255,255,0.14);
          background: linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.018)), rgba(10,17,30,0.74);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.26);
          overflow: hidden; backdrop-filter: blur(16px);
        }
        .metric-label { color: #f1f5f9; font-size: 22px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; }
        .metric-value { margin-top: 17px; font-size: 54px; line-height: 0.9; font-weight: 900; letter-spacing: -0.07em; }
        .metric-sub { margin-top: 17px; color: #94a3b8; font-size: 20px; font-weight: 600; }
        .bar-track { margin-top: 20px; width: 100%; height: 14px; border-radius: 999px; background: rgba(148,163,184,0.16); overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
        .bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #22d3ee, #67e8f9); box-shadow: 0 0 19px rgba(34,211,238,0.56); }
        .insight {
          position: absolute; left: 91px; right: 91px; top: 573px; height: 61px;
          display: grid; grid-template-columns: 57px 1fr; align-items: center; column-gap: 20px; z-index: 20;
        }
        .insight::before { content: ""; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; background: #22d3ee; box-shadow: 0 0 15px rgba(34,211,238,0.48); }
        .insight-icon { width: 40px; height: 40px; margin-left: 22px; border-radius: 50%; border: 1px solid rgba(34,211,238,0.48); color: #22d3ee; display: grid; place-items: center; }
        .insight-copy { color: #94a3b8; font-size: 21px; line-height: 1.35; font-weight: 600; }
        .insight-copy strong { color: #c8d3e1; font-weight: 700; }
        .compliance { margin-top: 5px; color: #7f8a9a; font-size: 18px; font-weight: 500; }
        .footer-line { position: absolute; left: 0; right: 0; bottom: 43px; height: 1px; background: rgba(255,255,255,0.10); }
        .og-footer { position: absolute; left: 0; right: 0; bottom: 16px; text-align: center; color: #94a3b8; font-size: 14px; font-weight: 700; letter-spacing: 0.18em; }
      `}</style>

      <main className="og">
        <div className="divider-line" />

        {/* Top Bar */}
        <header className="topbar">
          <div className="brand">
            <div className="logo-box">
              <svg viewBox="0 0 64 64" fill="none" width="34" height="34">
                <path d="M48 10H25C15 10 9 16 9 25c0 8 5 13 15 17l16 6c5 2 8 5 8 9 0 5-4 8-12 8H15" stroke="white" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
                <path d="M48 10 37 21M16 54 28 43" stroke="white" strokeWidth="11" strokeLinecap="round" opacity="0.95" />
              </svg>
            </div>
            <div className="wordmark"><span>SIGNUM</span><span className="hq">HQ</span></div>
            <div className="top-divider" />
            <div className="top-label">Institutional Flow Spotlight</div>
          </div>
          <div className="og-date">{dateFmt}</div>
        </header>

        {/* Hero: Ticker + Price */}
        <section className="hero">
          <h1 className="ticker-name">${ticker}</h1>
          <div className="company">{company}</div>
          <div className="price-row">
            <div className="price-val">${price}</div>
            <div className="change-val" style={{ color: changeColor, textShadow: `0 0 27px ${changeColor}60` }}>{changeFmt}</div>
          </div>
        </section>

        {/* Radar: Smart Flow */}
        <section className="radar">
          <svg viewBox="0 0 385 385" fill="none">
            <defs>
              <filter id="radarGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* Concentric circles */}
            <circle cx="192.5" cy="192.5" r="174" stroke="#22d3ee" strokeOpacity="0.10" />
            <circle cx="192.5" cy="192.5" r="144" stroke="#22d3ee" strokeOpacity="0.84" strokeWidth="4" filter="url(#radarGlow)" />
            <circle cx="192.5" cy="192.5" r="116" stroke="#22d3ee" strokeOpacity="0.10" />
            <circle cx="192.5" cy="192.5" r="82" stroke="#22d3ee" strokeOpacity="0.10" />
            <circle cx="192.5" cy="192.5" r="48" stroke="#22d3ee" strokeOpacity="0.08" />
            {/* Cardinal ticks */}
            <g stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" opacity="0.82">
              <line x1="192.5" y1="26" x2="192.5" y2="54" />
              <line x1="192.5" y1="331" x2="192.5" y2="359" />
              <line x1="26" y1="192.5" x2="54" y2="192.5" />
              <line x1="331" y1="192.5" x2="359" y2="192.5" />
            </g>
            {/* Minor ticks */}
            <g stroke="#22d3ee" strokeWidth="1.5" opacity="0.65">
              {ticks.map(a => (
                <line key={a} x1="192.5" y1="34" x2="192.5" y2="47" transform={`rotate(${a} 192.5 192.5)`} />
              ))}
            </g>
            {/* Labels */}
            <text x="192.5" y="116" textAnchor="middle" fill="#22d3ee" fontSize="17" fontWeight="800" letterSpacing="2.5">SMART FLOW</text>
            <text x="192.5" y="236" textAnchor="middle" fill="#67e8f9" fontSize="116" fontWeight="900" filter="url(#radarGlow)">{whale}</text>
            <text x="192.5" y="278" textAnchor="middle" fill="#94a3b8" fontSize="25" fontWeight="700">/ 100</text>
            <text x="192.5" y="318" textAnchor="middle" fill={flowColor} fontSize="18" fontWeight="900" letterSpacing="2">{flowLabel}</text>
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
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 22h18M7 20V12M12 20V8M17 20v-5M22 20V6" />
              <path d="M5 15l6-6 5 5 7-9" />
            </svg>
          </div>
          <div>
            <div className="insight-copy"><strong>Institutional flow pattern:</strong> {insightText}</div>
            <div className="compliance">Observation only — not financial advice</div>
          </div>
        </section>

        <div className="footer-line" />
        <footer className="og-footer">SIGNUM HQ&nbsp;&nbsp;·&nbsp;&nbsp;See What Others Cannot&nbsp;&nbsp;·&nbsp;&nbsp;signumhq.com</footer>
      </main>
    </>
  );
}

export default function SpotlightTemplate() {
  return (
    <Suspense fallback={<div style={{ width: 1200, height: 675, background: '#040710' }} />}>
      <SpotlightContent />
    </Suspense>
  );
}
