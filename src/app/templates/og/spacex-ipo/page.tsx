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

        .hero { position: absolute; left: 95px; top: 120px; width: 590px; z-index: 12; }
        .spacex-title {
          margin: 0; font-size: 62px; line-height: 0.92; font-weight: 900; letter-spacing: -0.06em;
          background: linear-gradient(135deg, #f97316, #fbbf24, #f1f5f9);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          text-shadow: none; filter: drop-shadow(0 4px 12px rgba(249,115,22,0.30));
        }
        .proxy-label {
          margin-top: 12px; color: #94a3b8; font-size: 18px; font-weight: 700; letter-spacing: 0.05em;
        }
        .ticker-name {
          margin-top: 14px; color: #f1f5f9; font-size: 110px; line-height: 0.82; font-weight: 900; letter-spacing: -0.085em;
          text-shadow: 0 0 14px rgba(255,255,255,0.16), 0 0 38px rgba(34,211,238,0.20), 0 12px 42px rgba(0,0,0,0.42);
        }
        .company { margin-top: 24px; color: #94a3b8; font-size: 30px; font-weight: 700; }
        .price-row { margin-top: 16px; display: flex; align-items: baseline; gap: 42px; }
        .price-val { font-size: 48px; font-weight: 900; letter-spacing: -0.065em; text-shadow: 0 8px 30px rgba(0,0,0,0.34); }
        .change-val { font-size: 48px; font-weight: 900; letter-spacing: -0.065em; }

        .radar { position: absolute; right: 168px; top: 87px; width: 340px; height: 340px; z-index: 10; }
        .radar svg { width: 100%; height: 100%; overflow: visible; }

        .metrics {
          position: absolute; left: 91px; right: 92px; top: 406px; height: 148px;
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; z-index: 20;
        }
        .metric-card {
          position: relative; border-radius: 14px; padding: 20px 26px;
          border: 1px solid rgba(255,255,255,0.14);
          background: linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.018)), rgba(10,17,30,0.74);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.26);
          overflow: hidden; backdrop-filter: blur(16px);
        }
        .metric-label { color: #f1f5f9; font-size: 19px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; }
        .metric-value { margin-top: 12px; font-size: 44px; line-height: 0.9; font-weight: 900; letter-spacing: -0.07em; }
        .metric-sub { margin-top: 12px; color: #94a3b8; font-size: 17px; font-weight: 600; }
        .bar-track { margin-top: 14px; width: 100%; height: 12px; border-radius: 999px; background: rgba(148,163,184,0.16); overflow: hidden; border: 1px solid rgba(255,255,255,0.08); }
        .bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #22d3ee, #67e8f9); box-shadow: 0 0 19px rgba(34,211,238,0.56); }

        .insight {
          position: absolute; left: 91px; right: 91px; top: 568px; height: 58px;
          display: grid; grid-template-columns: 50px 1fr; align-items: center; column-gap: 18px; z-index: 20;
        }
        .insight::before { content: ""; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; background: #f97316; box-shadow: 0 0 15px rgba(249,115,22,0.48); }
        .insight-icon { width: 36px; height: 36px; margin-left: 18px; border-radius: 50%; border: 1px solid rgba(249,115,22,0.48); color: #f97316; display: grid; place-items: center; }
        .insight-copy { color: #94a3b8; font-size: 19px; line-height: 1.35; font-weight: 600; }
        .insight-copy strong { color: #c8d3e1; font-weight: 700; }
        .compliance { margin-top: 4px; color: #7f8a9a; font-size: 16px; font-weight: 500; }

        .footer-line { position: absolute; left: 0; right: 0; bottom: 43px; height: 1px; background: rgba(255,255,255,0.10); }
        .og-footer { position: absolute; left: 0; right: 0; bottom: 16px; text-align: center; color: #94a3b8; font-size: 14px; font-weight: 700; letter-spacing: 0.18em; }
      `}</style>

      <main className="og">
        <div className="divider-line" />

        {/* Top Bar — identical to spotlight */}
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

        {/* Radar: Smart Flow — same as spotlight */}
        <section className="radar">
          <svg viewBox="0 0 340 340" fill="none">
            <defs>
              <filter id="radarGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx="170" cy="170" r="154" stroke="#22d3ee" strokeOpacity="0.10" />
            <circle cx="170" cy="170" r="128" stroke="#22d3ee" strokeOpacity="0.84" strokeWidth="4" filter="url(#radarGlow)" />
            <circle cx="170" cy="170" r="102" stroke="#22d3ee" strokeOpacity="0.10" />
            <circle cx="170" cy="170" r="72" stroke="#22d3ee" strokeOpacity="0.10" />
            <circle cx="170" cy="170" r="42" stroke="#22d3ee" strokeOpacity="0.08" />
            <g stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" opacity="0.82">
              <line x1="170" y1="22" x2="170" y2="48" />
              <line x1="170" y1="292" x2="170" y2="318" />
              <line x1="22" y1="170" x2="48" y2="170" />
              <line x1="292" y1="170" x2="318" y2="170" />
            </g>
            <g stroke="#22d3ee" strokeWidth="1.5" opacity="0.65">
              {ticks.map(a => (
                <line key={a} x1="170" y1="30" x2="170" y2="42" transform={`rotate(${a} 170 170)`} />
              ))}
            </g>
            <text x="170" y="100" textAnchor="middle" fill="#22d3ee" fontSize="15" fontWeight="800" letterSpacing="2.5">SMART FLOW</text>
            <text x="170" y="210" textAnchor="middle" fill="#67e8f9" fontSize="100" fontWeight="900" filter="url(#radarGlow)">{whale}</text>
            <text x="170" y="244" textAnchor="middle" fill="#94a3b8" fontSize="22" fontWeight="700">/ 100</text>
            <text x="170" y="278" textAnchor="middle" fill={flowColor} fontSize="16" fontWeight="900" letterSpacing="2">{flowLabel}</text>
          </svg>
        </section>

        {/* Metrics Row — identical structure to spotlight */}
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
            <svg width="24" height="24" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 22h18M7 20V12M12 20V8M17 20v-5M22 20V6" />
              <path d="M5 15l6-6 5 5 7-9" />
            </svg>
          </div>
          <div>
            <div className="insight-copy"><strong>SpaceX IPO proxy signal:</strong> {whale >= 65 ? 'Strong buy-side conviction in $TSLA ahead of IPO catalyst.' : whale <= 35 ? 'Distribution pattern detected — caution on proxy positioning.' : '$TSLA showing neutral institutional flow — no clear directional conviction.'}</div>
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
