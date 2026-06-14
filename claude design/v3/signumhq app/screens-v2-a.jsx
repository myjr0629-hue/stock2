/* global React */
/* Screens A: Dashboard v2 + Guardian v2 + shared primitives */
const { useState, useEffect, useMemo, useRef } = React;

/* ── tiny sparkline ── */
function Spk({ data, up, w = 56, h = 24 }) {
  const mx = Math.max(...data), mn = Math.min(...data);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${(h - 3) - ((d - mn) / (mx - mn || 1)) * (h - 6)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', marginTop: 6 }}>
      <polyline points={pts} fill="none" stroke={up ? 'var(--green)' : 'var(--red)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>
    </svg>
  );
}

/* ── generic premium vault (teaser + spinning lock + shimmer CTA) ── */
function VaultMini({ teaserLabel, teaserValue, title, sub, preview, unlocked, onUnlock, children }) {
  if (unlocked) return <div className="reveal2">{children}</div>;
  return (
    <div className="vw2 vault-mini">
      <div className="vw2-blur">{preview}</div>
      <div className="vw2-veil" style={{ padding: '18px 18px 15px' }}>
        {teaserLabel && (
          <div className="vw2-teaser">
            <div><div className="lab">{teaserLabel}</div><div className="val" style={{ color: 'var(--amber)' }}>{teaserValue}</div></div>
            <span className="free-chip">FREE PREVIEW</span>
          </div>
        )}
        <div className="vw2-lock" style={{ width: 46, height: 46 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="var(--amber)" strokeWidth="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </div>
        <div className="vw2-title" style={{ fontSize: 15 }}>{title}</div>
        <div className="vw2-sub" style={{ fontSize: 11 }}>{sub}</div>
        <button className="vw2-cta" style={{ height: 44 }} onClick={onUnlock}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="#1a1206"><path d="M7 5v14l11-7L7 5Z"/></svg>
          Watch &amp; Unlock · 1HR
        </button>
      </div>
    </div>
  );
}

/* ── semicircular gauge (guardian gravity + flow OPI) ── */
function Gauge({ value, color, size = 230 }) {
  const [v, setV] = useState(0);
  useEffect(() => { const t = setTimeout(() => setV(value), 350); return () => clearTimeout(t); }, [value]);
  const W = size, H = size / 2 + 14, cx = W / 2, cy = size / 2 + 4, R = size / 2 - 16;
  const arc = (a0, a1, col, op) => {
    const p = a => [cx + R * Math.cos(Math.PI * (1 - a)), cy - R * Math.sin(Math.PI * (1 - a))];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return <path d={`M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}`} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" opacity={op} />;
  };
  const ang = (v / 100) * 180 - 90;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      {arc(0.02, 0.32, 'var(--red)', 0.75)}
      {arc(0.36, 0.64, 'var(--amber)', 0.75)}
      {arc(0.68, 0.98, 'var(--green)', 0.75)}
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const a = Math.PI * (1 - f), r1 = R - 13, r2 = R - 19;
        return <line key={f} x1={cx + r1 * Math.cos(a)} y1={cy - r1 * Math.sin(a)} x2={cx + r2 * Math.cos(a)} y2={cy - r2 * Math.sin(a)} stroke="rgba(255,255,255,0.18)" strokeWidth="1.4"/>;
      })}
      <g style={{ transform: `rotate(${(v / 100) * 180 - 90}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'transform 1.3s cubic-bezier(0.22,1,0.36,1)' }}>
        <line x1={cx} y1={cy} x2={cx} y2={cy - R + 26} stroke={color} strokeWidth="3" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color})` }}/>
        <circle cx={cx} cy={cy - R + 22} r="3.4" fill={color}/>
      </g>
      <circle cx={cx} cy={cy} r="7" fill="#0a1120" stroke={color} strokeWidth="2.5"/>
    </svg>
  );
}

/* ════════════════ DASHBOARD v2 ════════════════ */
const HEAT = [
  { n: 'Tech', p: 2.1 }, { n: 'Energy', p: 1.2 }, { n: 'Finance', p: 0.3 }, { n: 'Utilities', p: 0.9 },
  { n: 'Health', p: -0.5 }, { n: 'Cons. Disc', p: 0.6 }, { n: 'Industrial', p: -0.2 }, { n: 'Materials', p: -0.8 },
];
const MOVERS = [
  { t: 'NVDA', p: '+5.2%', up: true, d: [4,6,5,8,9,12,14] }, { t: 'TSLA', p: '−2.1%', up: false, d: [12,10,11,8,7,6,5] },
  { t: 'AAPL', p: '+1.8%', up: true, d: [5,6,6,7,8,8,9] }, { t: 'AMD', p: '+3.4%', up: true, d: [3,4,6,5,8,9,11] },
  { t: 'META', p: '−0.9%', up: false, d: [9,8,9,7,7,6,6] },
];

function DashV2({ unlocked, openAd }) {
  return (
    <div className="scroll" data-screen-label="Dashboard v2">
      <header className="pg-hdr">
        <div>
          <div className="brand-name" style={{ font: "800 17px/1 'Inter'", letterSpacing: '0.04em' }}>SIGNUM<b style={{ color: 'var(--cyan)' }}> HQ</b></div>
          <div className="pg-sub">DARK POOL INTEL</div>
        </div>
        <div className="status-pill"><span className="dot"></span><span>MARKETS OPEN</span></div>
      </header>

      {/* MARKET PULSE */}
      <div className="sec-hdr"><div className="sec-title"><span className="bar"></span>Market Pulse</div><span className="live-pill"><span className="d"></span>LIVE</span></div>
      <div className="pulse-grid">
        {[{ s: 'SPY', px: '542.30', c: '+0.82%', up: true, d: [4,5,5,6,7,7,8] },
          { s: 'QQQ', px: '470.15', c: '+1.24%', up: true, d: [3,4,6,5,7,8,9] },
          { s: 'VIX', px: '21.50', c: '−3.10%', up: false, d: [9,8,8,7,6,6,5] }].map(m => (
          <div className="pulse-cell" key={m.s}>
            <div className="tk-row"><TickerIcon sym={m.s} size={17}/><span className="sym">{m.s}</span></div>
            <div className="px">${m.px}</div>
            <div className={'chg ' + (m.up ? 'pos' : 'neg')}>{m.up ? '▲' : '▼'} {m.c}</div>
            <Spk data={m.d} up={m.up} w={70} h={22}/>
          </div>
        ))}
      </div>

      {/* MACRO BOARD */}
      <div className="macro-grid">
        {[{ k: 'US10Y', v: '4.18%', c: '+2bp', up: false }, { k: 'DXY', v: '104.2', c: '−0.3', up: true },
          { k: 'GOLD', v: '2,388', c: '+0.6%', up: true }, { k: 'BTC', v: '71.4K', c: '+2.1%', up: true }].map(m => (
          <div className="macro-cell" key={m.k}>
            <div className="tk-row"><TickerIcon sym={m.k} size={13}/><span className="k">{m.k}</span></div><div className="v">{m.v}</div>
            <div className={'c ' + (m.up ? 'pos' : 'neg')}>{m.c}</div>
          </div>
        ))}
      </div>

      {/* SECTOR HEATMAP */}
      <div className="sec-hdr"><div className="sec-title"><span className="bar"></span>Sector Heatmap</div></div>
      <div className="heat-grid" style={{ marginBottom: 12 }}>
        {HEAT.map(h => {
          const a = Math.min(1, Math.abs(h.p) / 2.5);
          const bg = h.p >= 0 ? `rgba(16,185,129,${0.10 + a * 0.30})` : `rgba(239,68,68,${0.10 + a * 0.30})`;
          return (
            <div className="heat-tile" key={h.n} style={{ background: bg }}>
              <span className="n">{h.n}</span>
              <span className={'p ' + (h.p >= 0 ? 'pos' : 'neg')}>{h.p >= 0 ? '+' : ''}{h.p}%</span>
            </div>
          );
        })}
      </div>

      {/* AI MORNING BRIEFING */}
      <div className="brief-card">
        <div className="sec-title" style={{ color: 'var(--amber)' }}>✦ AI Morning Briefing</div>
        <div className="brief-txt">
          Futures point higher as <b>NVDA leads pre-market</b> on record dark-pool accumulation. Dealer gamma flips positive above SPX 5,420 — expect <b>vol compression</b> into Friday OPEX. Watch semis and utilities rotation.
        </div>
        <a className="brief-link">Read Full Report →</a>
      </div>

      {/* INSTITUTIONAL PULSE (PREMIUM) */}
      <div className="sec-hdr"><div className="sec-title"><span className="bar" style={{ background: 'var(--amber)', boxShadow: '0 0 8px var(--amber)' }}></span>Institutional Pulse</div><span className="sec-link" style={{ color: 'var(--amber)' }}>{unlocked ? 'LIVE' : 'PREMIUM'}</span></div>
      <VaultMini
        unlocked={unlocked} onUnlock={openAd}
        teaserLabel="VOL REGIME · 1 OF 4 FREE" teaserValue="COMPRESSION"
        title="Institutional Pulse" sub={<>Volatility regime + dark-pool flow map, updating <b>right now</b>.</>}
        preview={
          <div>
            <div className="mrow"><span className="k">Volatility Regime</span><span className="v">COMPRESSION</span></div>
            <div className="mrow"><span className="k">Dark Pool Net Flow</span><span className="v">+$1.8B</span></div>
            <div className="mrow"><span className="k">Block Print Ratio</span><span className="v">38.2%</span></div>
          </div>
        }>
        <div className="dp-card" style={{ marginBottom: 12, borderColor: 'rgba(16,185,129,0.25)' }}>
          <div className="mrow"><span className="k">Volatility Regime</span><span className="chip" style={{ background: 'var(--cyan-dim)', color: 'var(--cyan)' }}>COMPRESSION</span></div>
          <div className="mrow"><span className="k">Dark Pool Net Flow</span><span className="v pos">+$1.8B</span></div>
          <div className="mrow"><span className="k">Block Print Ratio</span><span className="v">38.2%</span></div>
          <div className="mrow"><span className="k">Smart Money Bias</span><span className="chip" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>ACCUMULATING</span></div>
        </div>
      </VaultMini>

      {/* TOP MOVERS */}
      <div className="sec-hdr"><div className="sec-title"><span className="bar"></span>Top Movers</div></div>
      <div className="movers">
        {MOVERS.map(m => (
          <div className="mover" key={m.t}>
            <div className="tk-row"><TickerIcon sym={m.t} size={17}/><span className="t">{m.t}</span></div>
            <div className={'p ' + (m.up ? 'pos' : 'neg')}>{m.p}</div>
            <Spk data={m.d} up={m.up} w={84} h={26}/>
          </div>
        ))}
      </div>

      <div className="ad-slot">
        <span className="ad-flag">AD</span>
        <div className="ad-body"><div className="t">Sponsored placement</div><div className="s">ADMOB · BANNER 320×50</div></div>
        <div className="ad-cta">Learn</div>
      </div>
    </div>
  );
}

/* ════════════════ GUARDIAN v2 ════════════════ */
function GuardianV2({ unlocked, openAd }) {
  const [gtab, setGtab] = useState(0);
  const GT = ['Overview', 'Reality', 'Shield', 'Flow'];
  return (
    <div className="scroll" data-screen-label="Guardian v2">
      <header className="pg-hdr">
        <div><div className="pg-title">GUARDIAN</div><div className="pg-sub">MARKET RISK SENTINEL</div></div>
        <span className="live-pill"><span className="d"></span>SCANNING</span>
      </header>

      {/* GUARDIAN EYE BANNER */}
      <div className="geye">
        <div className="geye-ring"><span className="r1"></span><span className="r2"></span><span className="core"></span></div>
        <div>
          <div className="geye-name">GUARDIAN EYE</div>
          <div className="geye-desc">Real-time liquidity stress monitor</div>
        </div>
        <div className="rlsi-badge"><div className="s">62</div><div className="l">RLSI · GREED</div></div>
      </div>

      {/* MACRO GRID */}
      <div className="macro-grid">
        {[{ k: 'FNG', l: 'FEAR&GREED', v: '62', c: 'GREED', col: '#86efac' }, { k: 'VIX', l: 'VIX', v: '21.5', c: 'ELEVATED', col: 'var(--amber)' },
          { k: 'DOW', l: 'DOW', v: '43.2K', c: '+0.4%', col: 'var(--green)' }, { k: 'NDX', l: 'NDX', v: '21.8K', c: '+1.1%', col: 'var(--green)' }].map(m => (
          <div className="macro-cell" key={m.k}>
            <div className="tk-row"><TickerIcon sym={m.k} size={13}/><span className="k">{m.l}</span></div><div className="v">{m.v}</div>
            <div className="c" style={{ color: m.col }}>{m.c}</div>
          </div>
        ))}
      </div>

      {/* SUB TABS */}
      <div className="seg" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <span className="seg-pill" style={{ left: `calc(${gtab * 25}% + 3px)` }}></span>
        {GT.map((t, i) => <button key={t} className={i === gtab ? 'on' : ''} onClick={() => setGtab(i)}>{t}</button>)}
      </div>

      {gtab === 0 && (
        <>
          {/* GRAVITY GAUGE (HUD) */}
          <div className="hud">
            <span className="hud-corner tl"></span><span className="hud-corner tr"></span><span className="hud-corner bl"></span><span className="hud-corner br"></span>
            <span className="hud-scan"></span>
            <div className="c2-title" style={{ textAlign: 'center', marginBottom: 6 }}>GRAVITY GAUGE · RLSI</div>
            <div className="gauge-wrap">
              <Gauge value={62} color="#34d399"/>
              <div className="gauge-val" style={{ color: '#34d399' }}>62</div>
              <div className="gauge-tag" style={{ color: '#86efac' }}>GREED</div>
              <div className="gauge-scale"><span>EXT. FEAR</span><span>NEUTRAL</span><span>EXT. GREED</span></div>
              <div className="gauge-read">Liquidity supportive — dip-buying regime intact</div>
            </div>
          </div>

          {/* FEDWATCH & LIQUIDITY (PREMIUM) */}
          <VaultMini
            unlocked={unlocked} onUnlock={openAd}
            teaserLabel="FEDWATCH · NEXT FOMC" teaserValue="CUT 25bp · 64%"
            title="FedWatch & Liquidity" sub={<>Rate-path odds + net liquidity drivers, updating <b>live</b>.</>}
            preview={
              <div>
                <div className="c2-title">FEDWATCH · SEP FOMC</div>
                <div className="fed-bar"><div style={{ width: '64%', background: 'var(--green)' }}></div><div style={{ width: '28%', background: 'var(--amber)' }}></div><div style={{ width: '8%', background: 'var(--red)' }}></div></div>
                <div className="mrow" style={{ marginTop: 10 }}><span className="k">Net Liquidity</span><span className="v">+$42B / wk</span></div>
                <div className="mrow"><span className="k">RRP Drain</span><span className="v">−$18B</span></div>
              </div>
            }>
            <div className="dp-card" style={{ marginBottom: 12, borderColor: 'rgba(16,185,129,0.25)' }}>
              <div className="c2-title">FEDWATCH · SEP FOMC</div>
              <div className="fed-bar"><div style={{ width: '64%', background: 'var(--green)' }}></div><div style={{ width: '28%', background: 'var(--amber)' }}></div><div style={{ width: '8%', background: 'var(--red)' }}></div></div>
              <div className="fed-leg">
                <span><i style={{ background: 'var(--green)' }}></i>CUT 25bp 64%</span>
                <span><i style={{ background: 'var(--amber)' }}></i>HOLD 28%</span>
                <span><i style={{ background: 'var(--red)' }}></i>HIKE 8%</span>
              </div>
              <div className="mrow" style={{ marginTop: 8 }}><span className="k">Net Liquidity</span><span className="v pos">+$42B / wk</span></div>
              <div className="mrow"><span className="k">RRP Drain</span><span className="v">−$18B</span></div>
              <div className="mrow"><span className="k">TGA Build</span><span className="v neg">−$26B</span></div>
            </div>
          </VaultMini>
        </>
      )}

      {gtab === 1 && (
        <div className="dp-card" style={{ marginBottom: 12 }}>
          <div className="c2-title" style={{ marginBottom: 4 }}>REALITY CHECK · PRICE VS LIQUIDITY</div>
          <div className="mrow"><span className="k">SPX vs RLSI Divergence</span><span className="chip" style={{ background: 'var(--amber-dim)', color: 'var(--amber)' }}>MILD STRETCH</span></div>
          <div className="mrow"><span className="k">Breadth (A/D 10d)</span><span className="v pos">+1.34</span></div>
          <div className="mrow"><span className="k">Volume Confirmation</span><span className="v">0.92×</span></div>
          <div className="mrow"><span className="k">Momentum Quality</span><span className="chip" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>HEALTHY</span></div>
        </div>
      )}
      {gtab === 2 && <GammaShieldV2/>}
      {gtab === 3 && <FlowTopoV2/>}

      <div className="ad-slot">
        <span className="ad-flag">AD</span>
        <div className="ad-body"><div className="t">Sponsored placement</div><div className="s">ADMOB · BANNER 320×50</div></div>
        <div className="ad-cta">Learn</div>
      </div>
    </div>
  );
}

Object.assign(window, { DashV2, GuardianV2, VaultMini, Gauge, Spk });
