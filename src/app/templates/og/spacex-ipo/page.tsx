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
  const date = sp.get('date') || new Date().toISOString().split('T')[0];

  const changeFmt = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;

  const dateFmt = (() => {
    try { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return date; }
  })();

  // GEX display
  const gexDisplay = gex === 'POSITIVE' ? 'POSITIVE' : gex === 'NEGATIVE' ? 'NEGATIVE' : gex === 'TRANSITION' ? 'TRANSITION' : 'NEUTRAL';

  return (
    <>
      <style>{`
        :root {
          --bg: #040710;
          --bg2: #060d1a;
          --cyan: #22d3ee;
          --cyan2: #06b6d4;
          --orange: #f97316;
          --amber: #fbbf24;
          --green: #34d399;
          --purple: #7c3aed;
          --white: #f1f5f9;
          --text: #c8d3e1;
          --muted: #94a3b8;
          --slate: #64748b;
          --panel: rgba(10, 17, 30, 0.70);
          --border: rgba(255,255,255,0.14);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
          margin: 0; width: 100%; min-height: 100%;
          background: #02040a;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        body { display: block; }

        .og {
          position: relative; width: 1200px; height: 675px; overflow: hidden;
          color: var(--white);
          background:
            radial-gradient(circle at 83% 23%, rgba(249,115,22,0.32), transparent 28%),
            radial-gradient(circle at 56% 61%, rgba(34,211,238,0.18), transparent 30%),
            radial-gradient(circle at 6% 95%, rgba(34,211,238,0.15), transparent 25%),
            linear-gradient(135deg, var(--bg) 0%, var(--bg2) 100%);
          isolation: isolate;
        }
        .og::before {
          content: ""; position: absolute; inset: 0; z-index: -8; opacity: 0.32;
          background-image:
            linear-gradient(rgba(34,211,238,0.055) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.055) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(circle at 55% 50%, black 0%, transparent 85%);
        }
        .og::after {
          content: ""; position: absolute; inset: 0; z-index: 90; pointer-events: none; opacity: 0.045;
          background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.95) 0, rgba(255,255,255,0.95) 1px, transparent 1px, transparent 5px);
          mix-blend-mode: overlay;
        }
        .starfield {
          position: absolute; inset: 0; z-index: -7; opacity: 0.55;
          background:
            radial-gradient(circle, rgba(241,245,249,0.9) 0 1px, transparent 1.4px),
            radial-gradient(circle, rgba(34,211,238,0.65) 0 1px, transparent 1.4px),
            radial-gradient(circle, rgba(251,191,36,0.45) 0 1px, transparent 1.4px);
          background-size: 83px 83px, 127px 127px, 173px 173px;
          mask-image: radial-gradient(circle at 62% 22%, black 0%, transparent 56%);
        }
        .earth-glow {
          position: absolute; right: -82px; top: -44px; width: 458px; height: 458px;
          border-radius: 50%;
          background:
            radial-gradient(circle at 68% 70%, rgba(255,255,255,0.85) 0 1%, rgba(251,191,36,0.72) 2%, rgba(249,115,22,0.36) 16%, transparent 42%),
            radial-gradient(circle at 28% 76%, rgba(34,211,238,0.28), transparent 48%);
          box-shadow: -35px 46px 110px rgba(249,115,22,0.18);
          opacity: 0.94; z-index: -1;
        }
        .earth-glow::before {
          content: ""; position: absolute; inset: 44px -90px -80px 54px;
          border-radius: 50%;
          border-left: 4px solid rgba(167, 210, 240, 0.72);
          border-top: 2px solid rgba(255,255,255,0.22);
          transform: rotate(33deg);
          box-shadow: -18px 0 38px rgba(34,211,238,0.25), inset 20px 0 65px rgba(34,211,238,0.10);
        }
        .hud-right {
          position: absolute; right: 45px; top: 252px; width: 315px; height: 260px;
          opacity: 0.38; z-index: 2;
        }
        .top-brand {
          position: absolute; left: 43px; top: 38px;
          display: flex; align-items: center; gap: 16px;
          z-index: 10;
        }
        .logo-icon {
          width: 48px; height: 48px;
          filter: drop-shadow(0 0 8px rgba(255,255,255,0.25));
        }
        .small-wordmark {
          color: var(--muted); font-size: 20px; line-height: 1;
          font-weight: 800; letter-spacing: 0.30em; text-transform: uppercase;
        }
        .hero-copy {
          position: absolute; left: 43px; top: 209px; width: 650px; z-index: 12;
        }
        .headline {
          margin: 0; color: var(--white); font-size: 82px; line-height: 0.94;
          font-weight: 900; letter-spacing: -0.078em;
          text-shadow: 0 10px 42px rgba(0,0,0,0.40), 0 0 20px rgba(255,255,255,0.10);
        }
        .subhead {
          margin-top: 37px; color: var(--cyan); font-size: 47px; line-height: 1;
          font-weight: 700; letter-spacing: -0.055em;
          text-shadow: 0 0 24px rgba(34,211,238,0.22);
        }
        .data-line {
          margin-top: 16px; color: var(--muted); font-size: 22px; line-height: 1;
          font-weight: 600; letter-spacing: 0.01em;
        }
        .data-line .ticker-sym { color: var(--white); font-weight: 800; }
        .data-line .change-up { color: var(--green); }
        .data-line .change-down { color: #f87171; }
        .rocket-wrap {
          position: absolute; left: 492px; top: 62px; width: 318px; height: 505px;
          z-index: 6; opacity: 0.94;
        }
        .rocket-wrap svg { width: 100%; height: 100%; overflow: visible; }
        .metric-row {
          position: absolute; left: 44px; right: 210px; bottom: 89px; height: 126px;
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 17px; z-index: 20;
        }
        .metric-card {
          position: relative; border-radius: 14px; border: 1px solid rgba(255,255,255,0.14);
          background: linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.018)), var(--panel);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 44px rgba(0,0,0,0.28);
          overflow: hidden; padding: 25px 26px 20px 132px; backdrop-filter: blur(14px);
        }
        .metric-card::before {
          content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px;
          background: currentColor; box-shadow: 0 0 18px currentColor;
        }
        .metric-card.green { color: var(--green); border-color: rgba(52,211,153,0.35); }
        .metric-card.cyan { color: var(--cyan); border-color: rgba(34,211,238,0.35); }
        .metric-card.amber { color: var(--amber); border-color: rgba(251,191,36,0.35); }
        .metric-card.red { color: #f87171; border-color: rgba(248,113,113,0.35); }
        .metric-icon {
          position: absolute; left: 26px; top: 26px; width: 72px; height: 72px;
          border-radius: 50%; border: 1px solid currentColor;
          display: grid; place-items: center;
          background: rgba(255,255,255,0.02);
          box-shadow: inset 0 0 22px rgba(255,255,255,0.03), 0 0 16px color-mix(in srgb, currentColor 18%, transparent);
        }
        .metric-label {
          color: currentColor; font-size: 20px; line-height: 1; font-weight: 700; letter-spacing: -0.02em;
        }
        .metric-value {
          margin-top: 13px; color: currentColor; font-size: 48px; line-height: 0.88;
          font-weight: 900; letter-spacing: -0.055em;
          text-shadow: 0 0 22px color-mix(in srgb, currentColor 30%, transparent);
        }
        .metric-value.positive-text { font-size: 38px; letter-spacing: -0.04em; }
        .footer {
          position: absolute; left: 43px; right: 43px; bottom: 27px; z-index: 20;
          display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: end; gap: 20px;
        }
        .footer-left {
          color: var(--slate); font-size: 19px; line-height: 1; font-weight: 600; letter-spacing: -0.02em;
        }
        .disclaimer {
          text-align: center; color: var(--slate); font-size: 15px; line-height: 1;
          font-weight: 500; letter-spacing: 0.02em;
        }
        .site {
          text-align: right; color: var(--cyan); font-size: 26px; line-height: 1;
          font-weight: 800; letter-spacing: 0.04em;
          text-shadow: 0 0 18px rgba(34,211,238,0.24);
        }
      `}</style>

      <main className="og">
        <div className="starfield" />
        <div className="earth-glow" />

        {/* Brand — REAL LOGO + inline text */}
        <aside className="top-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo-icon" src="/signum-sg-vectorized.svg" alt="SIGNUM HQ" width={48} height={48} />
          <div className="small-wordmark">SIGNUM HQ</div>
        </aside>

        {/* Hero Copy */}
        <section className="hero-copy">
          <h1 className="headline">SpaceX IPO</h1>
          <div className="subhead">× TSLA Proxy Analysis</div>
          <div className="data-line">
            <span className="ticker-sym">$TSLA</span>{' '}
            ${price}{' '}
            (<span className={change >= 0 ? 'change-up' : 'change-down'}>{changeFmt}</span>){' '}
            · {dateFmt}
          </div>
        </section>

        {/* Rocket */}
        <section className="rocket-wrap">
          <svg viewBox="0 0 318 505" fill="none">
            <defs>
              <linearGradient id="rocketStroke" x1="158" y1="0" x2="158" y2="360" gradientUnits="userSpaceOnUse">
                <stop stopColor="#f1f5f9" stopOpacity="0.85" />
                <stop offset="0.62" stopColor="#22d3ee" stopOpacity="0.82" />
                <stop offset="1" stopColor="#22d3ee" stopOpacity="0.18" />
              </linearGradient>
              <linearGradient id="thrust" x1="158" y1="300" x2="158" y2="505" gradientUnits="userSpaceOnUse">
                <stop stopColor="#22d3ee" />
                <stop offset="0.35" stopColor="#67e8f9" />
                <stop offset="0.62" stopColor="#fbbf24" />
                <stop offset="1" stopColor="#f97316" stopOpacity="0" />
              </linearGradient>
              <filter id="rocketGlow" x="-80%" y="-80%" width="260%" height="260%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="thrustGlow" x="-100%" y="-40%" width="300%" height="180%">
                <feGaussianBlur stdDeviation="14" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <g opacity="0.22">
              <circle cx="158" cy="212" r="188" stroke="#22d3ee" strokeOpacity="0.20" strokeDasharray="3 10" />
              <circle cx="158" cy="212" r="142" stroke="#22d3ee" strokeOpacity="0.14" />
              <circle cx="158" cy="212" r="96" stroke="#22d3ee" strokeOpacity="0.12" />
            </g>
            <g filter="url(#rocketGlow)">
              <path d="M158 17 C127 64 124 138 124 237 L124 332 L192 332 L192 237 C192 138 189 64 158 17Z" stroke="url(#rocketStroke)" strokeWidth="3" fill="rgba(4,7,16,0.40)" />
              <path d="M124 245 C88 255 80 326 80 365 L124 337" stroke="url(#rocketStroke)" strokeWidth="3" fill="rgba(4,7,16,0.35)" />
              <path d="M192 245 C228 255 236 326 236 365 L192 337" stroke="url(#rocketStroke)" strokeWidth="3" fill="rgba(4,7,16,0.35)" />
              <path d="M139 333V223M177 333V223" stroke="#22d3ee" strokeOpacity="0.46" strokeWidth="2" />
              <path d="M124 113H192M126 171H190M124 275H192" stroke="#f1f5f9" strokeOpacity="0.25" strokeWidth="2" />
              <path d="M158 17 C150 33 144 52 141 73H175C172 52 166 33 158 17Z" fill="rgba(241,245,249,0.08)" />
            </g>
            <g filter="url(#thrustGlow)">
              <path d="M132 332 C128 382 128 432 158 505 C188 432 188 382 184 332Z" fill="url(#thrust)" opacity="0.92" />
              <path d="M150 332 C145 377 148 425 158 482 C168 425 171 377 166 332Z" fill="#f1f5f9" opacity="0.50" />
              <path d="M104 352 C88 394 75 445 46 505" stroke="#22d3ee" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M212 352 C228 394 241 445 270 505" stroke="#f97316" strokeOpacity="0.25" strokeWidth="3" />
            </g>
          </svg>
        </section>

        {/* HUD Right */}
        <aside className="hud-right">
          <svg viewBox="0 0 315 260" fill="none">
            <g opacity="0.85">
              <text x="0" y="20" fill="#22d3ee" fontSize="10" fontWeight="700">FLOW INTENSITY</text>
              <rect x="0" y="36" width="260" height="62" rx="4" stroke="#22d3ee" strokeOpacity="0.25" />
              <g fill="#22d3ee" opacity="0.62">
                <rect x="16" y="74" width="6" height="16" /><rect x="28" y="66" width="6" height="24" />
                <rect x="40" y="62" width="6" height="28" /><rect x="52" y="70" width="6" height="20" />
                <rect x="64" y="58" width="6" height="32" /><rect x="76" y="55" width="6" height="35" />
                <rect x="88" y="69" width="6" height="21" /><rect x="100" y="60" width="6" height="30" />
                <rect x="112" y="51" width="6" height="39" /><rect x="124" y="72" width="6" height="18" />
                <rect x="136" y="66" width="6" height="24" /><rect x="148" y="58" width="6" height="32" />
                <rect x="160" y="74" width="6" height="16" /><rect x="172" y="54" width="6" height="36" />
                <rect x="184" y="63" width="6" height="27" /><rect x="196" y="71" width="6" height="19" />
                <rect x="208" y="48" width="6" height="42" /><rect x="220" y="64" width="6" height="26" />
                <rect x="232" y="42" width="6" height="48" />
              </g>
            </g>
            <g opacity="0.55">
              <text x="25" y="196" fill="#22d3ee" fontSize="10" fontWeight="700">MARKET BREADTH</text>
              <rect x="25" y="210" width="245" height="42" rx="4" stroke="#22d3ee" strokeOpacity="0.24" />
              <path d="M40 242 63 229 78 237 96 221 120 228 144 211 165 217 188 202 211 207 240 191 264 186" stroke="#22d3ee" strokeWidth="2" />
            </g>
          </svg>
        </aside>

        {/* Metric Row — DYNAMIC DATA */}
        <section className="metric-row">
          <article className="metric-card green">
            <div className="metric-icon">
              <svg width="50" height="50" viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="25" cy="25" r="22" opacity="0.22" />
                <path d="M4 30 C12 12 18 42 26 24 C34 6 40 35 46 23" />
              </svg>
            </div>
            <div className="metric-label">Dark Pool</div>
            <div className="metric-value">{dp > 0 ? `${dp.toFixed(1)}%` : 'N/A'}</div>
          </article>

          <article className="metric-card cyan">
            <div className="metric-icon">
              <svg width="50" height="50" viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M7 16 C18 8 28 25 43 12" />
                <path d="M7 25 C18 17 28 34 43 21" opacity="0.65" />
                <path d="M7 34 C18 26 28 43 43 30" opacity="0.45" />
                <circle cx="43" cy="12" r="3" fill="currentColor" />
                <circle cx="43" cy="21" r="3" fill="currentColor" />
                <circle cx="43" cy="30" r="3" fill="currentColor" />
              </svg>
            </div>
            <div className="metric-label">Smart Flow</div>
            <div className="metric-value">{whale}<span style={{ fontSize: '28px', opacity: 0.7 }}>/100</span></div>
          </article>

          <article className={`metric-card ${gexDisplay === 'POSITIVE' ? 'amber' : gexDisplay === 'NEGATIVE' ? 'red' : 'amber'}`}>
            <div className="metric-icon">
              <svg width="50" height="50" viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M10 40V27M20 40V18M30 40V10M40 40V22" />
                <path d="M6 40h38" opacity="0.6" />
              </svg>
            </div>
            <div className="metric-label">GEX</div>
            <div className="metric-value positive-text">{gexDisplay}</div>
          </article>
        </section>

        {/* Footer */}
        <footer className="footer">
          <div className="footer-left">Institutional Structure Analysis</div>
          <div className="disclaimer">Observation only — not financial advice.</div>
          <div className="site">signumhq.com</div>
        </footer>
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
