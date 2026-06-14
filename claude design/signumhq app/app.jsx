/* global React */
const { useState, useEffect, useRef } = React;

/* ─────────────────────────  Icons  ───────────────────────── */
const Ico = {
  dashboard: (p) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M3 13h6V3H3v10Zm0 8h6v-6H3v6Zm8 0h10V11H11v10Zm0-18v6h10V3H11Z"
        stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
    </svg>
  ),
  command: (p) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7"/>
      <path d="m7 9 3 3-3 3M13 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  flow: (p) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M3 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-9 5-9"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  intel: (p) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M12 12 19 5M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
    </svg>
  ),
  arrow: (p) => (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" {...p}><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  lock: (p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><rect x="5" y="11" width="14" height="9" rx="2" stroke="var(--amber)" strokeWidth="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="var(--amber)" strokeWidth="1.8"/></svg>),
  play: (p) => (<svg width="13" height="13" viewBox="0 0 24 24" fill="#1a1206" {...p}><path d="M7 5v14l11-7L7 5Z"/></svg>),
  check: (p) => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" {...p}><path d="m5 13 4 4 10-11" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  ad: (p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><path d="M3 10v4a2 2 0 0 0 2 2h2l5 4V4L7 8H5a2 2 0 0 0-2 2Z" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinejoin="round"/><path d="M16 9a4 4 0 0 1 0 6" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  bell: (p) => (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>),
  globe: (p) => (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" {...p}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke="currentColor" strokeWidth="1.7"/></svg>),
  sparkle: (p) => (<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--amber)" {...p}><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/></svg>),
  back: (p) => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" {...p}><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  search: (p) => (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" {...p}><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/><path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>),
  caret: (p) => (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" {...p}><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  filter: (p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><path d="M3 5h18M6 12h12M10 19h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>),
  refresh: (p) => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" {...p}><path d="M20 11a8 8 0 1 0-.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M20 4v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>),
};

/* ─────────────────────────  OPI speedometer gauge  ───────────────────────── */
function OPIGauge({ value = 1.45, max = 2 }) {
  const [rot, setRot] = useState(-92);
  useEffect(() => { const t = setTimeout(() => setRot((value / max - 0.5) * 184), 350); return () => clearTimeout(t); }, []);
  const W = 240, H = 132, cx = 120, cy = 120, r = 96;
  const polar = (deg, rad) => [cx + rad * Math.cos((180 - deg) * Math.PI / 180), cy - rad * Math.sin((180 - deg) * Math.PI / 180)];
  // tick marks every 18deg across the 180deg sweep
  const ticks = Array.from({ length: 11 }, (_, i) => i * 18);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="gaugeArc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ef4444"/><stop offset="50%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#10b981"/>
        </linearGradient>
        <filter id="needleShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.5"/>
        </filter>
      </defs>
      {/* track */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" strokeLinecap="round"/>
      {/* colored arc */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="url(#gaugeArc)" strokeWidth="10" strokeLinecap="round" opacity="0.92"/>
      {/* ticks */}
      {ticks.map((d, i) => {
        const [x1, y1] = polar(d, r - 14), [x2, y2] = polar(d, r - 7);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.25)" strokeWidth={i % 5 === 0 ? 2 : 1}/>;
      })}
      {/* needle */}
      <g transform={`rotate(${rot} ${cx} ${cy})`} style={{ transition: 'transform 1.3s cubic-bezier(.34,1.4,.5,1)' }} filter="url(#needleShadow)">
        <polygon points={`${cx - 4},${cy} ${cx + 4},${cy} ${cx},${cy - r + 16}`} fill="#f1f5f9"/>
      </g>
      <circle cx={cx} cy={cy} r="9" fill="#0a1120" stroke="#f1f5f9" strokeWidth="2"/>
      <circle cx={cx} cy={cy} r="3" fill="#22d3ee"/>
    </svg>
  );
}

/* ─────────────────────────  Flow screen  ───────────────────────── */
const FLOW_TRADES = [
  { cp: 'CALL', k: '$140', exp: 'Jul 12', prem: '$2.4M', type: 'SWEEP', sent: 'BULLISH', up: true },
  { cp: 'PUT',  k: '$125', exp: 'Aug 15', prem: '$890K', type: 'BLOCK', sent: 'BEARISH', up: false },
  { cp: 'CALL', k: '$145', exp: 'Jul 19', prem: '$1.7M', type: 'SWEEP', sent: 'BULLISH', up: true },
  { cp: 'CALL', k: '$150', exp: 'Sep 20', prem: '$3.1M', type: 'BLOCK', sent: 'BULLISH', up: true },
  { cp: 'PUT',  k: '$130', exp: 'Jul 12', prem: '$640K', type: 'SWEEP', sent: 'BEARISH', up: false },
  { cp: 'CALL', k: '$138', exp: 'Jul 05', prem: '$1.2M', type: 'SWEEP', sent: 'BULLISH', up: true },
];

function FlowScreen({ unlocked, openAd }) {
  const [calls, setCalls] = useState(0);
  useEffect(() => { const t = setTimeout(() => setCalls(68), 300); return () => clearTimeout(t); }, []);
  const tradeRow = (t, i, blur) => (
    <div className="frow" key={i}>
      <span className={'f-cp ' + (t.up ? 'cp-call' : 'cp-put')}>{t.cp}</span>
      <span className="f-strike">{t.k}<small>{t.exp}</small></span>
      <span className="f-prem tnum">{t.prem}</span>
      <span className="f-type">{t.type}<br/><span className={t.up ? 'pos' : 'neg'}>{t.sent}</span></span>
    </div>
  );

  return (
    <div className="scroll">
      {/* 1 — top bar */}
      <header className="hdr glass flow-bar">
        <button className="icon-btn">{Ico.back({ width: 18, height: 18 })}</button>
        <div className="center">
          <div className="ttl">FLOW</div>
          <div className="ticker-dd">NVDA {Ico.caret()}</div>
        </div>
        <button className="icon-btn">{Ico.filter({ width: 18, height: 18 })}</button>
      </header>

      {/* 2a — OPI gauge */}
      <div className="lbl">OPTIONS PRESSURE INDEX</div>
      <section className="gauge-card">
        <div className="gauge-wrap">
          <OPIGauge value={1.45} max={2} />
          <div className="gauge-read tnum">1.45</div>
        </div>
        <div className="gauge-interp">▲ Call Dominance — Bullish Pressure</div>
        <div className="gauge-zones">
          <span className="neg">BEARISH</span><span style={{ color: 'var(--text-muted)' }}>NEUTRAL</span><span className="pos">BULLISH</span>
        </div>
      </section>

      {/* 2b — P/C ratio */}
      <section className="pc-card">
        <div className="pc-left">
          <div className="k">PUT / CALL RATIO</div>
          <div className="v tnum">0.68</div>
          <div className="trend tnum">▼ from 0.82 yesterday</div>
        </div>
        <div className="pc-right">
          <span className="pc-badge">BULLISH</span>
          <Spark data={[0.82, 0.79, 0.74, 0.77, 0.71, 0.68]} up={true} h={40} fill />
        </div>
      </section>

      {/* 3 — flow summary */}
      <div className="lbl">FLOW SUMMARY · TODAY</div>
      <section className="sum-card">
        <div className="sum-top">
          <div className="sum-prem"><div className="k">TOTAL PREMIUM</div><div className="v tnum">$2.4B</div></div>
          <span className="sum-alerts"><span className="dot"></span>23 alerts</span>
        </div>
        <div className="cp-split"><div className="calls" style={{ width: calls + '%' }}></div><div className="puts"></div></div>
        <div className="cp-legend"><span className="pos">68% Calls</span><span className="neg">32% Puts</span></div>
        <div className="sum-net">Net premium <b>+$450M</b> · Call heavy</div>
      </section>

      {/* 4 — VALUE WALL: live flow */}
      <div className="lbl-premium">{Ico.lock({ width: 14, height: 14 })} LIVE OPTIONS FLOW</div>
      {unlocked ? (
        <section className="vault-open reveal" style={{ paddingTop: 14 }}>
          <div className="flow-table">{FLOW_TRADES.map((t, i) => tradeRow(t, i, false))}</div>
          <div className="vault-dp">
            <div><div className="k">DARK POOL</div><div className="v tnum pos">68.4%</div></div>
            <div><div className="k">BLOCK TRADES</div><div className="v tnum">214</div></div>
            <div><div className="k">SMART MONEY</div><div className="v pos" style={{ font: "800 15px/1 'Inter'" }}>▲ BUY</div></div>
          </div>
        </section>
      ) : (
        <div className="vault" style={{ marginBottom: 22 }}>
          <div className="vault-blur" style={{ filter: 'blur(12px) saturate(0.7)' }}>
            <div className="flow-table">{FLOW_TRADES.map((t, i) => tradeRow(t, i, true))}</div>
            <div className="vault-dp">
              <div><div className="k">DARK POOL</div><div className="v tnum">██.█%</div></div>
              <div><div className="k">BLOCK TRADES</div><div className="v tnum">███</div></div>
              <div><div className="k">SMART MONEY</div><div className="v">███</div></div>
            </div>
          </div>
          <div className="vault-veil">
            <div className="vault-lock">{Ico.lock({ width: 26, height: 26 })}</div>
            <div className="vault-title">Live Options Flow</div>
            <div className="vault-sub">Watch a 30-second video to unlock real-time flow for 1 hour.</div>
            <button className="vault-cta" onClick={openAd}>{Ico.play({ width: 14, height: 14 })} Watch &amp; Unlock</button>
            <div className="vault-sale">or subscribe for <b>$9.99/mo</b> — ad free</div>
          </div>
        </div>
      )}

      {/* 5 — banner ad */}
      <div className="ad-slot">
        <span className="ad-flag">AD</span>
        <div className="ad-icon">{Ico.ad()}</div>
        <div className="ad-body"><div className="t">Sponsored placement</div><div className="s">ADMOB · BANNER 320×50</div></div>
        <div className="ad-cta">Learn</div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Placeholder tab  ───────────────────────── */

/* ─────────────────────────  Data  ───────────────────────── */
const PULSE = [
  { sym: 'SPY', px: '542.30', chg: '+0.82%', up: true,  spark: [5,5,6,5,7,8,7,9,10] },
  { sym: 'QQQ', px: '470.15', chg: '+1.24%', up: true,  spark: [4,5,5,6,6,8,9,9,11] },
  { sym: 'VIX', px: '21.5',   chg: '−3.1%',  up: false, spark: [11,10,11,9,8,8,7,6,6] },
];
const SECTORS = [
  { name: 'Tech',        pct: +2.1 }, { name: 'Energy',      pct: +1.2 },
  { name: 'Cons. Disc',  pct: +0.9 }, { name: 'Materials',   pct: +0.6 },
  { name: 'Industrials', pct: +0.4 }, { name: 'Finance',     pct: +0.3 },
  { name: 'Healthcare',  pct: -0.5 }, { name: 'Utilities',   pct: -0.8 },
];
const MOVERS = [
  { sym: 'NVDA', px: '136.42', chg: '+5.2%', up: true,  spark: [4,5,5,7,8,9,11,13,14] },
  { sym: 'TSLA', px: '168.90', chg: '−2.1%', up: false, spark: [12,11,12,10,9,9,8,7,7] },
  { sym: 'AAPL', px: '212.55', chg: '+1.8%', up: true,  spark: [6,6,7,6,8,8,9,10,11] },
  { sym: 'AMD',  px: '164.30', chg: '+3.4%', up: true,  spark: [5,6,5,7,8,8,10,11,12] },
];

/* heatmap cell tint by magnitude */
function heatStyle(pct) {
  const up = pct >= 0;
  const a = Math.min(0.32, 0.07 + Math.abs(pct) / 9);
  const rgb = up ? '16,185,129' : '239,68,68';
  return { background: `rgba(${rgb},${a})`, borderColor: `rgba(${rgb},${a + 0.12})` };
}

/* ─────────────────────────  Sparkline  ───────────────────────── */
function Spark({ data, up, h = 22, fill = false }) {
  const w = 60, max = Math.max(...data), min = Math.min(...data);
  const coords = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d - min) / (max - min || 1)) * (h - 4) - 2;
    return [x, y];
  });
  const pts = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${h} ` + pts + ` ${w},${h}`;
  const c = up ? 'var(--green)' : 'var(--red)';
  const gid = 'g' + Math.random().toString(36).slice(2, 8);
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', maxWidth: 60, height: h }}>
      {fill && (
        <>
          <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c} stopOpacity="0.3"/><stop offset="100%" stopColor={c} stopOpacity="0"/>
          </linearGradient></defs>
          <polygon points={area} fill={`url(#${gid})`} />
        </>
      )}
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ─────────────────────────  Rewarded modal  ───────────────────────── */
function RewardModal({ onClose, onReward }) {
  const DURATION = 30; // seconds (label); demo runs faster
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const start = useRef(Date.now());

  useEffect(() => {
    const realMs = 4500; // demo speed
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - start.current) / realMs);
      setElapsed(p * DURATION);
      if (p >= 1) { clearInterval(id); setDone(true); }
    }, 50);
    return () => clearInterval(id);
  }, []);

  const remain = Math.ceil(DURATION - elapsed);
  const pct = (elapsed / DURATION) * 100;
  const R = 20, C = 2 * Math.PI * R;

  return (
    <div className="modal-scrim" onClick={(e) => { if (e.target === e.currentTarget && done) onClose(); }}>
      <div className="modal">
        {!done ? (
          <>
            <div className="modal-eyebrow">REWARDED · ADMOB</div>
            <div className="modal-title">Unlocking premium intel</div>
            <div className="ad-play">
              <div className="ad-time">Ad · 0:{String(Math.max(0, remain)).padStart(2,'0')}</div>
              <svg className="ring" width="52" height="52" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r={R} stroke="rgba(255,255,255,0.12)" strokeWidth="4" fill="none"/>
                <circle cx="26" cy="26" r={R} stroke="var(--cyan)" strokeWidth="4" fill="none"
                  strokeDasharray={C} strokeDashoffset={C - (pct/100)*C} strokeLinecap="round"
                  transform="rotate(-90 26 26)" style={{ transition: 'stroke-dashoffset .1s linear' }}/>
              </svg>
              <div className="ad-progress" style={{ width: pct + '%' }} />
            </div>
            <div className="modal-sub">Watch the full ad to unlock all premium content for 1 hour.</div>
            <button className="modal-close" disabled>Please wait… {remain}s</button>
          </>
        ) : (
          <>
            <div className="unlocked-banner">{Ico.check()} Unlocked for 1:00:00</div>
            <div className="modal-title">Premium intel is live</div>
            <div className="modal-sub">Dark-pool prints, full options chains and AI signals are now unlocked across the app.</div>
            <button className="modal-close" style={{ marginTop: 16, color: 'var(--cyan)', borderColor: 'rgba(34,211,238,0.3)' }}
              onClick={() => { onReward(); onClose(); }}>Continue</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────  Dashboard  ───────────────────────── */
function Dashboard() {
  return (
    <div className="scroll">
      {/* 1 — top bar */}
      <header className="hdr glass">
        <div className="brand">
          <div className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M17 5H8a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6" stroke="#04181d" strokeWidth="2.6" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="brand-name glow">SIGNUM<b> HQ</b></div>
            <div className="brand-sub">DARK POOL INTEL</div>
          </div>
        </div>
        <div className="hdr-icons">
          <button className="icon-btn">{Ico.bell({ width: 18, height: 18 })}<span className="badge"></span></button>
          <button className="icon-btn">{Ico.globe({ width: 18, height: 18 })}</button>
        </div>
      </header>

      {/* 2 — Market Pulse */}
      <section className="s-card pulse-card">
        <div className="card-head">
          <div className="card-title"><span className="pulse-dot"></span>MARKET PULSE</div>
          <span style={{ font: "600 10px/1 'Inter'", color: 'var(--text-muted)', letterSpacing: '0.06em' }}>LIVE · 16:00 ET</span>
        </div>
        <div className="pulse-grid">
          {PULSE.map((p) => (
            <div className="pulse-item" key={p.sym}>
              <div className="pulse-sym">{p.sym}</div>
              <div className="pulse-px tnum">{p.px}</div>
              <div className={'pulse-chg ' + (p.up ? 'pos' : 'neg')}>{p.up ? '▲' : '▼'} {p.chg}</div>
              <Spark data={p.spark} up={p.up} h={30} />
            </div>
          ))}
        </div>
      </section>

      {/* 3 — Sector Heatmap */}
      <section className="s-card">
        <div className="card-head">
          <div className="card-title">SECTOR HEATMAP</div>
          <span style={{ font: "600 10px/1 'Inter'", color: 'var(--text-muted)', letterSpacing: '0.06em' }}>S&amp;P 500</span>
        </div>
        <div className="heat-grid">
          {SECTORS.map((s) => (
            <div className="heat-cell" key={s.name} style={heatStyle(s.pct)}>
              <div className="heat-name">{s.name}</div>
              <div className={'heat-pct ' + (s.pct >= 0 ? 'pos' : 'neg')}>{s.pct >= 0 ? '+' : ''}{s.pct.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — AI Morning Briefing */}
      <section className="s-card ai-card">
        <div className="card-head">
          <div className="card-title"><span className="ai-spark">{Ico.sparkle()}</span>AI MORNING BRIEFING</div>
          <span style={{ font: "600 10px/1 'Inter'", color: 'var(--text-muted)', letterSpacing: '0.06em' }}>06:30 ET</span>
        </div>
        <div className="ai-body">
          Futures point <b>higher</b> as cooling CPI revives rate-cut bets. <b>Semis</b> lead pre-market on AI capex headlines, while <b>energy</b> firms on crude's third up-day. Watch <b>NVDA</b> into its options expiry — dealer gamma is pinning price near $135.
        </div>
        <a className="ai-link">Read Full Report {Ico.arrow()}</a>
      </section>

      {/* 5 — Top Movers */}
      <div className="sec-hdr">
        <div className="sec-title"><span className="bar"></span>Top Movers</div>
        <a className="sec-link">VIEW ALL {Ico.arrow()}</a>
      </div>
      <div className="movers-scroll">
        {MOVERS.map((m) => (
          <div className="mover" key={m.sym}>
            <div className="mover-top">
              <span className="mover-sym">{m.sym}</span>
              <span className={'mover-chg ' + (m.up ? 'pos' : 'neg')}>{m.up ? '+' : ''}{m.chg.replace('+','')}</span>
            </div>
            <div className="mover-px tnum">${m.px}</div>
            <Spark data={m.spark} up={m.up} h={34} fill />
          </div>
        ))}
      </div>

      {/* 6 — banner ad */}
      <div className="ad-slot" style={{ marginTop: 16 }}>
        <span className="ad-flag">AD</span>
        <div className="ad-icon">{Ico.ad()}</div>
        <div className="ad-body"><div className="t">Sponsored placement</div><div className="s">ADMOB · BANNER 320×50</div></div>
        <div className="ad-cta">Learn</div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Candlestick chart  ───────────────────────── */
function genCandles(n) {
  let s = 1337, price = 108;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff); };
  const out = [];
  for (let i = 0; i < n; i++) {
    const drift = 0.9 + (i / n) * 1.4;          // gentle uptrend
    const open = price;
    const move = (rnd() - 0.42) * 4.5 * drift;
    const close = Math.max(40, open + move);
    const high = Math.max(open, close) + rnd() * 2.4;
    const low  = Math.min(open, close) - rnd() * 2.4;
    out.push({ open, high, low, close });
    price = close;
  }
  return out;
}
function sma(arr, p) {
  return arr.map((_, i) => {
    if (i < p - 1) return null;
    let sum = 0; for (let j = i - p + 1; j <= i; j++) sum += arr[j].close;
    return sum / p;
  });
}
const CANDLES = genCandles(34);

function CandleChart() {
  const W = 330, H = 150, pad = 6;
  const all = CANDLES.flatMap(c => [c.high, c.low]);
  const max = Math.max(...all), min = Math.min(...all);
  const y = (v) => pad + (1 - (v - min) / (max - min)) * (H - pad * 2);
  const step = W / CANDLES.length;
  const bw = step * 0.58;
  const fast = sma(CANDLES, 7), slow = sma(CANDLES, 20);
  const line = (vals) => vals.map((v, i) => v == null ? null : `${(i * step + step / 2).toFixed(1)},${y(v).toFixed(1)}`).filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 150, display: 'block' }} preserveAspectRatio="none">
      {CANDLES.map((c, i) => {
        const up = c.close >= c.open;
        const col = up ? '#10b981' : '#ef4444';
        const cx = i * step + step / 2;
        const top = y(Math.max(c.open, c.close));
        const bot = y(Math.min(c.open, c.close));
        return (
          <g key={i}>
            <line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} stroke={col} strokeWidth="1" />
            <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} fill={col} rx="0.5" />
          </g>
        );
      })}
      <polyline points={line(slow)} fill="none" stroke="#22d3ee" strokeWidth="1.4" opacity="0.9" />
      <polyline points={line(fast)} fill="none" stroke="#f59e0b" strokeWidth="1.4" opacity="0.95" />
    </svg>
  );
}

/* ─────────────────────────  Command screen  ───────────────────────── */
const RANGES = ['1D', '1W', '1M', '3M', '1Y'];
const GEX = [-3,-5,-2,4,8,14,22,30,18,9,5,-2,-6,-3];

function CommandScreen({ unlocked, openAd }) {
  const [range, setRange] = useState('3M');
  const [bars, setBars] = useState(false);
  useEffect(() => { const t = setTimeout(() => setBars(true), 200); return () => clearTimeout(t); }, []);

  return (
    <div className="scroll">
      {/* 1 — top bar */}
      <header className="hdr glass cmd-bar">
        <button className="icon-btn">{Ico.back({ width: 18, height: 18 })}</button>
        <div className="center"><div className="tkr">NVDA</div><div className="co">NVIDIA Corp</div></div>
        <button className="icon-btn">{Ico.search({ width: 18, height: 18 })}</button>
      </header>

      {/* 2 — price header */}
      <section className="price-card">
        <svg className="bg-spark" viewBox="0 0 100 40" preserveAspectRatio="none">
          <polyline points="0,34 12,30 24,32 36,24 48,26 60,18 72,20 84,10 100,6" fill="none" stroke="#10b981" strokeWidth="1.6"/>
        </svg>
        <span className="price-status"><span className="dot"></span>MARKET OPEN</span>
        <div className="price-big tnum">$135.20</div>
        <div className="price-chg tnum">▲ +$3.45 (+2.62%)</div>
      </section>

      {/* 3 — free analysis */}
      <div className="lbl">ANALYSIS</div>

      {/* 3a — chart */}
      <section className="chart-card">
        <div className="chart-legend">
          <span className="leg"><span className="swatch" style={{ background: '#f59e0b' }}></span>SMA 7</span>
          <span className="leg"><span className="swatch" style={{ background: '#22d3ee' }}></span>SMA 20</span>
          <span className="leg" style={{ marginLeft: 'auto', color: 'var(--green)' }}>● Golden Cross</span>
        </div>
        <div className="candle-wrap"><CandleChart /></div>
        <div className="range-tabs">
          {RANGES.map(r => (
            <button key={r} className={'range-tab' + (range === r ? ' active' : '')} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </section>

      {/* 3b — analyst consensus */}
      <section className="chart-card">
        <div className="analyst-top">
          <div className="rating-badge">STRONG BUY</div>
          <div className="target"><div className="k">12M TARGET</div><div className="v tnum">$180.00 <span style={{ font: "700 11px/1 'Inter'" }}>+33.1%</span></div></div>
        </div>
        <div className="consensus-bars">
          {[
            { lab: 'Buy',  n: 15, c: 'var(--green)', w: 79 },
            { lab: 'Hold', n: 3,  c: 'var(--amber)', w: 16 },
            { lab: 'Sell', n: 1,  c: 'var(--red)',   w: 5 },
          ].map(b => (
            <div className="cbar-row" key={b.lab}>
              <span className="cbar-lab">{b.lab}</span>
              <div className="cbar-track"><div className="cbar-fill" style={{ background: b.c, width: (bars ? b.w : 0) + '%' }}></div></div>
              <span className="cbar-num">{b.n}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3c — fundamentals */}
      <section className="chart-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="fund-grid">
          <div className="fund-cell"><div className="fund-k">P / E</div><div className="fund-v tnum">45.2 <span className="trend-up">▲</span></div><div className="fund-sub">Industry avg 38.5</div></div>
          <div className="fund-cell"><div className="fund-k">ROE</div><div className="fund-v tnum">56.3% <span className="trend-up">▲</span></div><div className="fund-sub">vs 22.1% sector</div></div>
          <div className="fund-cell"><div className="fund-k">REVENUE TTM</div><div className="fund-v tnum">$35.1B <span className="trend-up">▲</span></div><div className="fund-sub">+122% YoY</div></div>
          <div className="fund-cell"><div className="fund-k">EPS</div><div className="fund-v tnum">$2.12 <span className="trend-up">▲</span></div><div className="fund-sub">Beat by $0.08</div></div>
        </div>
      </section>

      {/* 3d — earnings */}
      <section className="earn-card">
        <div className="earn-top">
          <div className="earn-date"><span>NEXT EARNINGS</span>Aug 25, 2026</div>
          <div className="dcount">D-80</div>
        </div>
        <div className="earn-progress"><div style={{ width: '62%' }}></div></div>
        <span className="amc-tag">⏱ After Market Close (AMC)</span>
      </section>

      {/* 4 — VALUE WALL */}
      <div className="lbl-premium">{Ico.lock({ width: 14, height: 14 })} PREMIUM INTELLIGENCE</div>

      {unlocked ? (
        <section className="vault-open reveal">
          <div className="gex-title">{Ico.check({ width: 13, height: 13 })} GAMMA EXPOSURE (GEX)</div>
          <div className="gex-chart">
            {GEX.map((g, i) => (
              <div key={i} className="gex-bar" style={{ height: Math.abs(g) * 2.4 + '%', alignSelf: g >= 0 ? 'flex-end' : 'flex-start',
                background: g >= 0 ? 'var(--green)' : 'var(--red)', opacity: 0.85 }}></div>
            ))}
          </div>
          <div className="vault-stats">
            <div><div className="k">GAMMA FLIP</div><div className="v tnum">$132.50</div></div>
            <div><div className="k">DARK POOL</div><div className="v tnum pos">68.4%</div></div>
            <div><div className="k">BLOCK TRADES</div><div className="v tnum">214</div></div>
          </div>
          <div className="vault-ai" style={{ color: 'var(--text)' }}>
            <b style={{ color: 'var(--cyan)' }}>AI Deep Insight:</b> Dealers are short gamma below $132.50 — a break lower accelerates volatility. Heavy dark-pool accumulation (68%) plus 214 block prints signal institutional positioning ahead of expiry. Bias: <b className="pos">bullish above flip</b>.
          </div>
        </section>
      ) : (
        <div className="vault" style={{ marginBottom: 22 }}>
          <div className="vault-blur">
            <div className="gex-title">GAMMA EXPOSURE (GEX)</div>
            <div className="gex-chart">
              {GEX.map((g, i) => (
                <div key={i} className="gex-bar" style={{ height: Math.abs(g) * 2.4 + '%', alignSelf: g >= 0 ? 'flex-end' : 'flex-start',
                  background: g >= 0 ? 'var(--green)' : 'var(--red)', opacity: 0.85 }}></div>
              ))}
            </div>
            <div className="vault-stats">
              <div><div className="k">GAMMA FLIP</div><div className="v tnum">$1██.██</div></div>
              <div><div className="k">DARK POOL</div><div className="v tnum">██.█%</div></div>
              <div><div className="k">BLOCK TRADES</div><div className="v tnum">███</div></div>
            </div>
            <div className="vault-ai">Dealers are short gamma below the flip level, with heavy dark-pool accumulation suggesting institutional positioning ahead of the next expiry cycle and elevated volatility risk.</div>
          </div>
          <div className="vault-veil">
            <div className="vault-lock">{Ico.lock({ width: 26, height: 26 })}</div>
            <div className="vault-title">Premium Intelligence</div>
            <div className="vault-sub">Watch a 30-second video to unlock all premium data for 1 hour.</div>
            <button className="vault-cta" onClick={openAd}>{Ico.play({ width: 14, height: 14 })} Watch &amp; Unlock</button>
            <div className="vault-sale">or subscribe for <b>$9.99/mo</b> — ad free</div>
          </div>
        </div>
      )}

      {/* 5 — banner ad */}
      <div className="ad-slot">
        <span className="ad-flag">AD</span>
        <div className="ad-icon">{Ico.ad()}</div>
        <div className="ad-body"><div className="t">Sponsored placement</div><div className="s">ADMOB · BANNER 320×50</div></div>
        <div className="ad-cta">Learn</div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Sector icons (monoline)  ───────────────────────── */
const Sec = {
  mag7:    () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3c1 3-1 4-1 6a3 3 0 0 0 6 .2c0 2 1 3 1 5a6 6 0 0 1-12 0c0-3 2-4 3-6 .8 1.4 2 1.5 2 2.8 0-2-1-3 0-5 .4-.8 1-1.4 1-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>),
  physicalAI: () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="5" y="8" width="14" height="11" rx="3" stroke="currentColor" strokeWidth="1.6"/><path d="M12 5v3M9 4v1M15 4v1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><circle cx="9.5" cy="13" r="1.3" fill="currentColor"/><circle cx="14.5" cy="13" r="1.3" fill="currentColor"/></svg>),
  silicon: () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="7" y="7" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  power:   () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="2" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.6" stroke="currentColor" strokeWidth="1.5"/><ellipse cx="12" cy="12" rx="9" ry="3.6" stroke="currentColor" strokeWidth="1.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" stroke="currentColor" strokeWidth="1.5" transform="rotate(120 12 12)"/></svg>),
  bio:     () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M8 3c0 5 8 7 8 9s-8 4-8 9M16 3c0 5-8 7-8 9s8 4 8 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M9 7h6M9.5 10h5M9.5 14h5M9 17h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>),
  cyber:   () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  orbit:   () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3c3 2 4 5 4 8 0 2-1 4-4 7-3-3-4-5-4-7 0-3 1-6 4-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><circle cx="12" cy="10" r="1.6" fill="currentColor"/><path d="M8.5 16l-2 4M15.5 16l2 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  quantum: () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="2" fill="currentColor"/><ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" strokeWidth="1.5" transform="rotate(45 12 12)"/><ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" strokeWidth="1.5" transform="rotate(-45 12 12)"/></svg>),
  fintech: () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6"/><path d="M3 10h18" stroke="currentColor" strokeWidth="1.6"/><path d="M7 14h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>),
  cloud:   () => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M7 18a4 4 0 0 1-.5-8 5 5 0 0 1 9.6-1.2A3.5 3.5 0 0 1 17 18H7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>),
};

/* ─────────────────────────  Intel screen  ───────────────────────── */
const SECTORS_INTEL = [
  { ico: 'mag7',       name: 'Magnificent 7',  insight: 'NVDA leads with record GEX positioning',         pct: +2.1 },
  { ico: 'physicalAI', name: 'Physical AI',    insight: 'Robotics momentum building on TSLA Optimus',      pct: +1.8 },
  { ico: 'silicon',    name: 'Silicon Core',   insight: 'Semiconductor cycle peak signals emerging',       pct: -0.3 },
  { ico: 'power',      name: 'Power Matrix',   insight: 'Nuclear renaissance driving utility rotation',    pct: +3.2 },
  { ico: 'bio',        name: 'Bio Pulse',      insight: 'GLP-1 pipeline dominating pharma flows',          pct: +0.5 },
  { ico: 'cyber',      name: 'Cyber Shield',   insight: 'Zero-trust spending acceleration confirmed',      pct: +1.1 },
  { ico: 'orbit',      name: 'Orbit Defense',  insight: 'Space defense contracts expanding rapidly',       pct: +0.8 },
  { ico: 'quantum',    name: 'Quantum Edge',   insight: 'Quantum computing nearing commercial viability',  pct: -1.2 },
  { ico: 'fintech',    name: 'Fintech Pulse',  insight: 'BNPL regulation creating new winners',            pct: +0.4 },
  { ico: 'cloud',      name: 'Cloud Fortress', insight: 'AI inference demand reshaping cloud margins',     pct: +1.5 },
];

function sentClass(pct) { return pct < 0 ? 's-dn' : pct >= 1.0 ? 's-up' : 's-flat'; }

function IntelScreen() {
  const [spin, setSpin] = useState(false);
  const card = (s, i) => (
    <div className={'sector-card ' + sentClass(s.pct) + (i % 2 ? ' alt' : '')} key={s.name}>
      <div className="sec-ico">{Sec[s.ico]()}</div>
      <div className="sec-body">
        <div className="sec-name">{s.name}</div>
        <div className="sec-insight">{s.insight}</div>
        <div className="sec-meta">Updated 2hr ago</div>
      </div>
      <div className="sec-right">
        <span className={'sec-perf ' + (s.pct >= 0 ? 'up' : 'dn')}>{s.pct >= 0 ? '+' : ''}{s.pct.toFixed(1)}%</span>
        <span className="sec-chev">{Ico.arrow({ width: 12, height: 12 })}</span>
      </div>
    </div>
  );

  return (
    <div className="scroll">
      {/* 1 — top bar */}
      <header className="hdr glass intel-bar">
        <button className="icon-btn">{Ico.back({ width: 18, height: 18 })}</button>
        <div className="center">INTEL</div>
        <button className="icon-btn" onClick={() => { setSpin(true); setTimeout(() => setSpin(false), 700); }}>
          <span style={{ display: 'inline-flex', transition: 'transform .7s ease', transform: spin ? 'rotate(360deg)' : 'none' }}>{Ico.refresh({ width: 18, height: 18 })}</span>
        </button>
      </header>

      {/* 2 — intro */}
      <div className="intel-intro">
        <div className="h">Sector Intelligence</div>
        <div className="s">AI-powered analysis updated every 4 hours.</div>
        <span className="intel-updated"><span className="dot"></span>UPDATED 2 HOURS AGO</span>
      </div>

      {/* 3 — sector cards with ad break after #3 and #6 */}
      <div className="sector-list">{SECTORS_INTEL.slice(0, 3).map(card)}</div>
      <div className="ad-break">
        <span className="line"></span>
        <span className="tag">{Ico.ad({ width: 13, height: 13 })} INTERSTITIAL · EVERY 3 SECTORS</span>
        <span className="line"></span>
      </div>
      <div className="sector-list">{SECTORS_INTEL.slice(3, 6).map((s, i) => card(s, i + 3))}</div>
      <div className="ad-break">
        <span className="line"></span>
        <span className="tag">{Ico.ad({ width: 13, height: 13 })} INTERSTITIAL · EVERY 3 SECTORS</span>
        <span className="line"></span>
      </div>
      <div className="sector-list" style={{ marginBottom: 22 }}>{SECTORS_INTEL.slice(6).map((s, i) => card(s, i + 6))}</div>
    </div>
  );
}

/* ─────────────────────────  Placeholder tab  ───────────────────────── */
function Coming({ name }) {
  return (
    <div className="scroll" style={{ display: 'flex' }}>
      <div className="coming">
        <div className="ring2">{Ico[name.toLowerCase()] ? Ico[name.toLowerCase()]({ style: { color: 'var(--cyan)' } }) : null}</div>
        <div className="t">{name}</div>
        <div className="s">Send me this screen's spec and I'll build it on the same system.</div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Shell  ───────────────────────── */
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: Ico.dashboard },
  { id: 'command',   label: 'Command',   icon: Ico.command },
  { id: 'flow',      label: 'Flow',      icon: Ico.flow },
  { id: 'intel',     label: 'Intel',     icon: Ico.intel },
];

function App() {
  const [tab, setTab] = useState(window.__SIGNUM_TAB || 'dashboard');
  const [showAd, setShowAd] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  return (
    <div className="viewport">
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'command' && <CommandScreen unlocked={unlocked} openAd={() => setShowAd(true)} />}
      {tab === 'flow' && <FlowScreen unlocked={unlocked} openAd={() => setShowAd(true)} />}
      {tab === 'intel' && <IntelScreen />}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            {t.icon()}
            <span className="tlabel">{t.label}</span>
            <span className="glow"></span>
          </button>
        ))}
      </nav>

      {showAd && <RewardModal onClose={() => setShowAd(false)} onReward={() => setUnlocked(true)} />}
    </div>
  );
}

function Root() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <IOSDevice dark width={390} height={844}>
        <App />
      </IOSDevice>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
