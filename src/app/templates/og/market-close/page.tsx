'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function MarketCloseContent() {
  const sp = useSearchParams();
  const spy = parseFloat(sp.get('spy') || '0');
  const qqq = parseFloat(sp.get('qqq') || '0');
  const dia = parseFloat(sp.get('dia') || '0');
  const vix = parseFloat(sp.get('vix') || '18');
  const dp = parseFloat(sp.get('dp') || '0');
  const gex = (sp.get('gex') || 'neutral').toLowerCase();
  const fgi = parseInt(sp.get('fgi') || '50', 10);
  const date = sp.get('date') || new Date().toISOString().split('T')[0];

  // Format helpers
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const clr = (v: number) => v > 0 ? '#34d399' : v < 0 ? '#f87171' : '#94a3b8';
  const cls = (v: number) => v > 0 ? 'green' : v < 0 ? 'red' : '';

  // VIX
  const vixColor = vix >= 30 ? '#f87171' : vix >= 25 ? '#f97316' : vix >= 18 ? '#fbbf24' : '#34d399';
  const vixLabel = vix >= 30 ? 'EXTREME' : vix >= 25 ? 'HIGH' : vix >= 18 ? 'ELEVATED' : 'CALM';

  // GEX
  const gexCfg: Record<string, { color: string; label: string; pct: number }> = {
    positive:   { color: '#34d399', label: 'POSITIVE',   pct: 73 },
    negative:   { color: '#f87171', label: 'NEGATIVE',   pct: 18 },
    neutral:    { color: '#94a3b8', label: 'NEUTRAL',    pct: 50 },
    transition: { color: '#fbbf24', label: 'TRANSITION', pct: 50 },
  };
  const g = gexCfg[gex] || gexCfg.neutral;

  // Fear & Greed
  const fgiLabel = fgi >= 75 ? 'EXTREME GREED' : fgi >= 55 ? 'GREED' : fgi >= 45 ? 'NEUTRAL' : fgi >= 25 ? 'FEAR' : 'EXTREME FEAR';
  const fgiColor = fgi >= 55 ? '#34d399' : fgi >= 45 ? '#fbbf24' : '#f87171';
  // Needle angle: 0=left(-90deg), 100=right(90deg)
  const needleAngle = -90 + (fgi / 100) * 180;

  // Dark pool
  const dpColor = dp >= 40 ? '#fbbf24' : '#22d3ee';

  const dateFmt = (() => {
    try { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return date; }
  })();

  // Sparkline path generators — simple deterministic from value
  const makeSpark = (val: number, seed: number) => {
    const pts: number[] = [];
    let y = 40;
    for (let i = 0; i <= 12; i++) {
      const noise = Math.sin(i * 1.7 + seed) * 12 + Math.cos(i * 0.9 + seed * 2) * 8;
      y = 44 - (val * 30) + noise + (i / 12) * (val * -20);
      pts.push(Math.max(4, Math.min(84, y)));
    }
    const step = 320 / 12;
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(0)} ${p.toFixed(0)}`).join(' ');
  };

  const spySpark = makeSpark(spy, 1);
  const qqqSpark = makeSpark(qqq, 2);
  const diaSpark = makeSpark(dia, 3);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #02040a; margin: 0; padding: 0; }
        body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }

        .og {
          position: relative; width: 1200px; height: 675px; overflow: hidden; color: #f1f5f9;
          background: radial-gradient(circle at 88% 14%, rgba(167,139,250,0.24), transparent 34%),
            radial-gradient(circle at 5% 92%, rgba(34,211,238,0.23), transparent 34%),
            linear-gradient(135deg, #040710, #060d1a);
          isolation: isolate;
        }
        .og::before {
          content: ""; position: absolute; inset: 0; z-index: -5; opacity: 0.35;
          background-image: linear-gradient(rgba(34,211,238,0.075) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.075) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(circle at 50% 48%, black, transparent 84%);
        }
        .og::after {
          content: ""; position: absolute; inset: 0; z-index: 100; pointer-events: none; opacity: 0.045;
          background: repeating-linear-gradient(to bottom, rgba(255,255,255,0.95) 0, rgba(255,255,255,0.95) 1px, transparent 1px, transparent 5px);
          mix-blend-mode: overlay;
        }

        .floor-grid {
          position: absolute; left: -80px; right: -80px; bottom: -82px; height: 180px; opacity: 0.24;
          transform: perspective(500px) rotateX(62deg); transform-origin: bottom center;
          background-image: linear-gradient(rgba(34,211,238,0.20) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.20) 1px, transparent 1px);
          background-size: 32px 32px;
        }

        .header {
          position: absolute; left: 22px; right: 28px; top: 14px; height: 64px;
          display: grid; grid-template-columns: 300px 1fr 180px; align-items: start; z-index: 20;
        }
        .brand { display: flex; align-items: flex-start; gap: 14px; }
        .logo-box {
          width: 52px; height: 52px; display: grid; place-items: center; overflow: hidden;
          filter: drop-shadow(0 0 12px rgba(34,211,238,0.25));
        }
        .logo-box img { width: 52px; height: 52px; object-fit: contain; }
        .wordmark { margin-top: 8px; font-size: 28px; font-weight: 800; letter-spacing: 0.09em; text-shadow: 0 0 18px rgba(255,255,255,0.12); }
        .wordmark span { color: #22d3ee; }
        .tagline { margin-top: 6px; color: #94a3b8; font-size: 14px; font-weight: 500; letter-spacing: -0.02em; }

        .market-title {
          justify-self: center; margin-top: 14px; text-align: center; font-size: 26px; font-weight: 900;
          letter-spacing: 0.46em; text-transform: uppercase; text-shadow: 0 0 18px rgba(255,255,255,0.18);
        }
        .title-glow {
          width: 200px; height: 3px; margin: 12px auto 0; border-radius: 999px;
          background: linear-gradient(90deg, transparent, #22d3ee, #a78bfa, transparent);
          box-shadow: 0 0 20px rgba(34,211,238,0.50);
        }
        .date { justify-self: end; margin-top: 16px; color: #94a3b8; font-size: 17px; font-weight: 600; }

        .index-row {
          position: absolute; left: 22px; right: 22px; top: 82px; height: 256px;
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; z-index: 12;
        }
        .index-card {
          position: relative; border: 1px solid rgba(255,255,255,0.12);
          background: linear-gradient(135deg, rgba(255,255,255,0.050), rgba(255,255,255,0.014)), rgba(10,17,30,0.60);
          overflow: hidden; padding: 20px 22px 16px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.07);
        }
        .index-card:first-child { border-radius: 16px 0 0 16px; }
        .index-card:last-child { border-radius: 0 16px 16px 0; }
        .index-title { font-size: 20px; font-weight: 900; letter-spacing: 0.10em; text-align: center; text-transform: uppercase; }
        .index-value { margin-top: 16px; font-size: 60px; line-height: 0.85; font-weight: 900; letter-spacing: -0.07em; text-align: center; }
        .index-value.red { color: #f87171; text-shadow: 0 0 25px rgba(248,113,113,0.32); }
        .index-value.green { color: #34d399; text-shadow: 0 0 25px rgba(52,211,153,0.32); }

        .sparkline { position: absolute; left: 20px; right: 20px; bottom: 14px; height: 90px; }
        .axis-labels {
          position: absolute; left: 8px; top: 4px; bottom: 12px; width: 38px;
          display: flex; flex-direction: column; justify-content: space-between; color: #cbd5e1; font-size: 10px; font-weight: 500;
        }
        .time-labels {
          position: absolute; left: 48px; right: 4px; bottom: -2px;
          display: flex; justify-content: space-between; color: #cbd5e1; font-size: 10px; font-weight: 500;
        }

        .metric-row {
          position: absolute; left: 22px; right: 22px; top: 354px; height: 290px;
          display: grid; grid-template-columns: 1fr 1.12fr 1.12fr 1.35fr; gap: 12px; z-index: 18;
        }
        .metric-card {
          position: relative; border-radius: 14px; border: 1px solid rgba(255,255,255,0.16);
          background: linear-gradient(135deg, rgba(255,255,255,0.070), rgba(255,255,255,0.018)), rgba(10,17,30,0.72);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.28);
          backdrop-filter: blur(14px); overflow: hidden; padding: 22px 22px;
        }
        .metric-card.mc-cyan { border-color: rgba(34,211,238,0.42); box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 0 28px rgba(34,211,238,0.10); }
        .metric-card.mc-purple { border-color: rgba(167,139,250,0.42); box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 0 28px rgba(167,139,250,0.10); }
        .metric-card.mc-green { border-color: rgba(52,211,153,0.42); box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 0 28px rgba(52,211,153,0.10); }

        .metric-head { display: flex; align-items: center; gap: 14px; font-size: 18px; font-weight: 900; letter-spacing: 0.16em; text-transform: uppercase; }
        .metric-icon { width: 40px; height: 40px; border-radius: 50%; border: 1.5px solid currentColor; display: grid; place-items: center; flex: 0 0 auto; }

        .vix-value { margin-top: 24px; font-size: 68px; line-height: 0.85; font-weight: 900; letter-spacing: -0.075em; }
        .elevated-badge {
          margin-top: 20px; display: inline-flex; align-items: center; height: 38px; padding: 0 20px;
          border-radius: 10px; font-size: 22px; font-weight: 900; letter-spacing: 0.08em;
        }

        .dp-value { margin-top: 26px; font-size: 62px; line-height: 0.85; font-weight: 900; letter-spacing: -0.075em; }
        .progress-track { margin-top: 24px; height: 18px; border-radius: 999px; border: 1px solid rgba(34,211,238,0.55); background: rgba(148,163,184,0.12); overflow: hidden; }
        .progress-fill { height: 100%; border-radius: inherit; }
        .progress-labels { margin-top: 12px; display: flex; justify-content: space-between; color: #94a3b8; font-size: 14px; font-weight: 600; }

        .gex-value { margin-top: 36px; font-size: 46px; line-height: 0.9; font-weight: 900; letter-spacing: -0.045em; text-align: center; }
        .gex-scale { position: absolute; left: 22px; right: 22px; bottom: 48px; height: 3px; background: linear-gradient(90deg, #f87171, #94a3b8, #34d399); }
        .gex-marker {
          position: absolute; top: -10px; width: 0; height: 0;
          border-left: 7px solid transparent; border-right: 7px solid transparent;
        }
        .scale-label-row {
          position: absolute; left: 22px; right: 22px; bottom: 20px;
          display: flex; justify-content: space-between; font-size: 13px; font-weight: 800; text-transform: uppercase;
        }

        .fg-grid { position: relative; height: 150px; margin-top: 14px; }
        .fg-value { position: absolute; left: 0; top: 0; font-size: 52px; line-height: 0.9; font-weight: 900; letter-spacing: -0.055em; }
        .fg-label { position: absolute; left: 0; top: 58px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; text-transform: uppercase; }
        .fg-gauge { position: absolute; right: -4px; bottom: 2px; width: 190px; height: 120px; }

        .og-footer {
          position: absolute; left: 0; right: 0; bottom: 8px; z-index: 20; text-align: center;
          color: #94a3b8; font-size: 13px; font-weight: 700; letter-spacing: 0.22em;
        }
      `}</style>

      <main className="og">
        <div className="floor-grid" />

        {/* Header */}
        <header className="header">
          <div className="brand">
            <div className="logo-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192x192.png" alt="" />
            </div>
            <div>
              <div className="wordmark">SIGNUM <span>HQ</span></div>
              <div className="tagline">See What Others Cannot</div>
            </div>
          </div>
          <div className="market-title">MARKET CLOSE<div className="title-glow" /></div>
          <div className="date">{dateFmt}</div>
        </header>

        {/* 3 Major Indices */}
        <section className="index-row">
          {[
            { title: 'S&P 500', val: spy, spark: spySpark },
            { title: 'NASDAQ', val: qqq, spark: qqqSpark },
            { title: 'DOW', val: dia, spark: diaSpark },
          ].map((idx) => (
            <article key={idx.title} className="index-card" style={{ borderColor: `${clr(idx.val)}33` }}>
              <div className="index-title">{idx.title}</div>
              <div className={`index-value ${cls(idx.val)}`}>{fmt(idx.val)}</div>
              <div className="sparkline">
                <div className="axis-labels"><span>1.0%</span><span>0.0%</span><span>-1.0%</span><span>-2.0%</span></div>
                <svg viewBox="0 0 320 88" style={{ position: 'absolute', left: 58, right: 0, bottom: 15, width: 'calc(100% - 58px)', height: 70 }} fill="none">
                  <path d={idx.spark} stroke={clr(idx.val)} strokeWidth="2" strokeLinecap="round" fill="none" />
                  <path d={`${idx.spark}V88H0Z`} fill={clr(idx.val)} opacity="0.14" />
                  <path d="M0 35H320" stroke="rgba(255,255,255,.13)" strokeDasharray="3 6" />
                </svg>
                <div className="time-labels"><span>9:30</span><span>11:00</span><span>12:30</span><span>2:00</span><span>3:30</span><span>4:00</span></div>
              </div>
            </article>
          ))}
        </section>

        {/* 4 Metric Cards */}
        <section className="metric-row">
          {/* VIX */}
          <article className="metric-card mc-purple">
            <div className="metric-head">
              <span className="metric-icon" style={{ color: '#a78bfa' }}>
                <svg width="29" height="29" viewBox="0 0 29 29" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 15h5l3-9 6 20 4-11h7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>VIX
            </div>
            <div className="vix-value" style={{ color: vixColor, textShadow: `0 0 30px ${vixColor}44` }}>{vix.toFixed(1)}</div>
            <div className="elevated-badge" style={{ color: vixColor, border: `1.5px solid ${vixColor}bb`, background: `${vixColor}14` }}>{vixLabel}</div>
          </article>

          {/* Dark Pool */}
          <article className="metric-card mc-cyan">
            <div className="metric-head">
              <span className="metric-icon" style={{ color: '#22d3ee' }}>
                <svg width="29" height="29" viewBox="0 0 29 29" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 3 C10 9 6 14 6 19a8.5 8.5 0 0 0 17 0c0-5-4-10-8.5-16Z" /></svg>
              </span>DARK POOL
            </div>
            <div className="dp-value" style={{ color: dpColor, textShadow: `0 0 30px ${dpColor}44` }}>{dp > 0 ? `${dp.toFixed(1)}%` : '—'}</div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(dp * 2, 100)}%`, background: `linear-gradient(90deg, #22d3ee, ${dpColor})`, boxShadow: `0 0 23px ${dpColor}55` }} />
            </div>
            <div className="progress-labels"><span>0%</span><span>100%</span></div>
          </article>

          {/* GEX Regime */}
          <article className="metric-card mc-purple">
            <div className="metric-head">
              <span className="metric-icon" style={{ color: g.color }}>
                <svg width="29" height="29" viewBox="0 0 29 29" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19c5-8 9-8 14 0s8 8 11 0" strokeLinecap="round" /></svg>
              </span>GEX REGIME
            </div>
            <div className="gex-value" style={{ color: g.color, textShadow: `0 0 26px ${g.color}36` }}>{g.label}</div>
            <div className="gex-scale">
              <span className="gex-marker" style={{ left: `${g.pct}%`, borderTopColor: g.color, filter: `drop-shadow(0 0 7px ${g.color}88)` }} />
            </div>
            <div className="scale-label-row">
              <span style={{ color: '#f87171' }}>Negative</span>
              <span style={{ color: '#94a3b8' }}>Neutral</span>
              <span style={{ color: '#34d399' }}>Positive</span>
            </div>
          </article>

          {/* Fear & Greed */}
          <article className="metric-card mc-purple">
            <div className="metric-head">
              <span className="metric-icon" style={{ color: '#e9d5ff' }}>
                <svg width="29" height="29" viewBox="0 0 29 29" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 21a11 11 0 0 1 22 0" /><path d="M14.5 21l7-11" strokeLinecap="round" /></svg>
              </span>FEAR &amp; GREED
            </div>
            <div className="fg-grid">
              <div className="fg-value">{fgi}</div>
              <div className="fg-label" style={{ color: fgiColor }}>{fgiLabel}</div>
              <svg className="fg-gauge" viewBox="0 0 205 130" fill="none">
                <defs>
                  <linearGradient id="fgGrad" x1="18" y1="105" x2="187" y2="105" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#f87171" />
                    <stop offset="0.48" stopColor="#fbbf24" />
                    <stop offset="1" stopColor="#34d399" />
                  </linearGradient>
                </defs>
                <path d="M24 108A78 78 0 0 1 181 108" stroke="url(#fgGrad)" strokeWidth="14" strokeLinecap="butt" />
                <line x1="103" y1="108" x2={103 + 55 * Math.cos((needleAngle - 90) * Math.PI / 180)} y2={108 + 55 * Math.sin((needleAngle - 90) * Math.PI / 180)} stroke="#f1f5f9" strokeWidth="5" strokeLinecap="round" />
                <circle cx="103" cy="108" r="12" fill="#0a111e" stroke="#94a3b8" strokeWidth="2" />
                <text x="20" y="129" fill="#f87171" fontSize="16" fontWeight="800">0</text>
                <text x="174" y="129" fill="#34d399" fontSize="16" fontWeight="800">100</text>
              </svg>
            </div>
          </article>
        </section>

        <footer className="og-footer">SIGNUM HQ&nbsp;&nbsp;·&nbsp;&nbsp;See What Others Cannot&nbsp;&nbsp;·&nbsp;&nbsp;signumhq.com</footer>
      </main>
    </>
  );
}

export default function MarketCloseTemplate() {
  return (
    <Suspense fallback={<div style={{ width: 1200, height: 675, background: '#040710' }} />}>
      <MarketCloseContent />
    </Suspense>
  );
}
