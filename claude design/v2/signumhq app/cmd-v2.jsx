/* global React, ReactDOM, IOSDevice */
const { useState, useEffect, useMemo, useRef } = React;

/* ───────── icons ───────── */
const I2 = {
  back: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  search: () => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/><path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>),
  lock: (p) => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" {...p}><rect x="5" y="11" width="14" height="9" rx="2" stroke="var(--amber)" strokeWidth="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="var(--amber)" strokeWidth="1.8" strokeLinecap="round"/></svg>),
  play: () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="#1a1206"><path d="M7 5v14l11-7L7 5Z"/></svg>),
  check: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4 10-11" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
};

/* ───────── deterministic candles ───────── */
function genCandles(n, base, seed) {
  let x = seed;
  const rnd = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
  const out = []; let prev = base * 0.93;
  for (let i = 0; i < n; i++) {
    const o = prev, c = o + (rnd() - 0.47) * base * 0.024;
    out.push({ o, c, h: Math.max(o, c) + rnd() * base * 0.008, l: Math.min(o, c) - rnd() * base * 0.008 });
    prev = c;
  }
  return out;
}
const sma = (cs, w) => cs.map((_, i) => i < w - 1 ? null : cs.slice(i - w + 1, i + 1).reduce((a, c) => a + c.c, 0) / w);

/* ───────── interactive chart v2 ───────── */
function ChartV2({ price }) {
  const [range, setRange] = useState(2);
  const [type, setType] = useState('line');
  const [hover, setHover] = useState(null);
  const RANGES = ['1D', '1W', '1M', '3M', '1Y'];
  const candles = useMemo(() => genCandles([24, 35, 30, 60, 52][range], 135, [77, 33, 42, 19, 7][range]), [range]);
  const W = 340, H = 170;
  const all = candles.flatMap(c => [c.h, c.l]);
  const mn = Math.min(...all), mx = Math.max(...all), pad = (mx - mn) * 0.08;
  const y = v => H - ((v - mn + pad) / (mx - mn + pad * 2)) * H;
  const gap = W / candles.length, bw = Math.max(2, gap * 0.55);
  const s7 = sma(candles, 7), s20 = sma(candles, 20);
  const vwap = candles.reduce((a, c) => a + c.c, 0) / candles.length;
  const lpath = candles.map((c, i) => `${i ? 'L' : 'M'}${(i * gap + gap / 2).toFixed(1)},${y(c.c).toFixed(1)}`).join('');
  const apath = `M${gap / 2},${H} ` + candles.map((c, i) => `L${(i * gap + gap / 2).toFixed(1)},${y(c.c).toFixed(1)}`).join('') + ` L${(candles.length - 1) * gap + gap / 2},${H} Z`;
  const spath = vals => vals.map((v, i) => v == null ? '' : `${vals[i - 1] == null ? 'M' : 'L'}${(i * gap + gap / 2).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const onMove = (cx, el) => {
    const r = el.getBoundingClientRect();
    setHover(Math.max(0, Math.min(candles.length - 1, Math.floor(((cx - r.left) / r.width) * candles.length))));
  };
  const hc = hover != null ? candles[hover] : null;
  const nbboB = (price * 0.9994).toFixed(2), nbboA = (price * 1.0006).toFixed(2);

  return (
    <section className="c2-card">
      <div className="c2-head">
        <span className="c2-title">PRICE HISTORY</span>
        <div className="c2-toggle">
          <button className={type === 'line' ? 'on' : ''} onClick={() => setType('line')}>LINE</button>
          <button className={type === 'candle' ? 'on' : ''} onClick={() => setType('candle')}>CANDLE</button>
        </div>
      </div>
      <div className="nbbo2">
        <span>NBBO <b style={{ color: 'var(--green)' }}>${nbboB}</b> ×100</span>
        <span className="spread">Spread 0.11%</span>
        <span><b style={{ color: 'var(--red)' }}>${nbboA}</b> ×100</span>
      </div>
      <div className="c2-wrap">
        {hc && (
          <div className="c2-tip" style={{ left: `${((hover * gap + gap / 2) / W) * 100}%` }}>
            <span>O <b>{hc.o.toFixed(2)}</b></span>
            <span style={{ color: 'var(--green)' }}>H <b>{hc.h.toFixed(2)}</b></span>
            <span style={{ color: 'var(--red)' }}>L <b>{hc.l.toFixed(2)}</b></span>
            <span>C <b>{hc.c.toFixed(2)}</b></span>
          </div>
        )}
        <svg className="c2-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          onMouseMove={e => onMove(e.clientX, e.currentTarget)}
          onTouchMove={e => e.touches[0] && onMove(e.touches[0].clientX, e.currentTarget)}
          onMouseLeave={() => setHover(null)} onTouchEnd={() => setHover(null)}>
          <defs>
            <linearGradient id="a2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.28"/><stop offset="100%" stopColor="#22d3ee" stopOpacity="0"/>
            </linearGradient>
            <filter id="glow2"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(255,255,255,0.04)" strokeWidth="0.6"/>)}
          {/* VWAP */}
          <line x1="0" x2={W} y1={y(vwap)} y2={y(vwap)} stroke="#22d3ee" strokeWidth="0.9" strokeDasharray="4 4" opacity="0.55"/>
          <g transform={`translate(${W - 64} ${y(vwap) - 14})`}>
            <rect width="62" height="13" rx="3.5" fill="rgba(34,211,238,0.14)" stroke="rgba(34,211,238,0.35)" strokeWidth="0.6"/>
            <text x="31" y="9" textAnchor="middle" fill="#67e8f9" fontSize="7.5" fontWeight="700" fontFamily="JetBrains Mono, monospace">VWAP {vwap.toFixed(2)}</text>
          </g>
          {type === 'line' ? (
            <>
              <path d={apath} fill="url(#a2)"/>
              <path d={lpath} fill="none" stroke="#22d3ee" strokeWidth="1.6" filter="url(#glow2)"/>
            </>
          ) : candles.map((c, i) => {
            const cx = i * gap + gap / 2, up = c.c >= c.o, col = up ? '#10b981' : '#ef4444';
            return (
              <g key={i}>
                <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1"/>
                <rect x={cx - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} fill={col} rx="0.5"/>
              </g>
            );
          })}
          <path d={spath(s7)} fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.75"/>
          <path d={spath(s20)} fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.5"/>
          {hover != null && (
            <g>
              <line x1={hover * gap + gap / 2} x2={hover * gap + gap / 2} y1="0" y2={H} stroke="rgba(241,245,249,0.25)" strokeWidth="0.7" strokeDasharray="3 3"/>
              <circle cx={hover * gap + gap / 2} cy={y(candles[hover].c)} r="4.5" fill="#f1f5f9" stroke="#22d3ee" strokeWidth="2.2" filter="url(#glow2)"/>
            </g>
          )}
        </svg>
      </div>
      <div className="c2-legend">
        <span className="li"><span className="dot" style={{ background: '#f59e0b' }}></span>SMA 7</span>
        <span className="li"><span className="dot" style={{ background: '#22d3ee' }}></span>SMA 20</span>
        <span className="li" style={{ marginLeft: 'auto', color: 'var(--green)' }}>✦ Golden Cross</span>
      </div>
      <div className="c2-ranges">
        <span className="c2-rpill" style={{ left: `calc(${range * 20}% + 3px)` }}></span>
        {RANGES.map((r, i) => <button key={r} className={i === range ? 'on' : ''} onClick={() => setRange(i)}>{r}</button>)}
      </div>
    </section>
  );
}

/* ───────── GEX v2 ───────── */
const GEX2 = [-3, -5, -2, 4, 8, 14, 22, 30, 18, 9, 5, -2, -6, -3];
function GexV2() {
  const max = Math.max(...GEX2.map(Math.abs));
  const flipIdx = 3; // first positive bar
  return (
    <div>
      <div className="c2-title" style={{ marginBottom: 18 }}>GEX PROFILE · BY STRIKE</div>
      <div className="gex2">
        <div className="gex2-bars">
          <div className="gex2-zero" style={{ top: '50%' }}></div>
          <div className="gex2-flip" style={{ left: `${((flipIdx + 0.1) / GEX2.length) * 100}%` }}>
            <span className="gex2-flip-tag">FLIP $132.50</span>
          </div>
          {GEX2.map((v, i) => {
            const h = (Math.abs(v) / max) * 46;
            const up = v >= 0;
            return (
              <div key={i} className="gex2-bar" style={{
                height: h + '%',
                alignSelf: up ? 'flex-start' : 'flex-end',
                marginTop: up ? `calc(50% - ${h}%)` : 0,
                transform: up ? 'translateY(calc(48px - 100%))' : 'translateY(48px)',
                background: up ? 'linear-gradient(180deg, #34d399, rgba(16,185,129,0.25))' : 'linear-gradient(0deg, #f87171, rgba(239,68,68,0.25))',
                boxShadow: up ? '0 0 10px rgba(16,185,129,0.25)' : '0 0 10px rgba(239,68,68,0.25)',
              }}></div>
            );
          })}
        </div>
        <div className="gex2-strikes"><span>$120</span><span>$128</span><span>$135</span><span>$142</span><span>$150</span></div>
      </div>
    </div>
  );
}

/* ───────── Value Wall v2 ───────── */
function ValueWallV2({ unlocked, onUnlock }) {
  /* blurred numbers tick live so the wall feels ALIVE */
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 900); return () => clearInterval(id); }, []);
  const fake = (b, a) => (b + Math.sin(tick * 1.7 + a) * b * 0.04).toFixed(1);

  if (unlocked) {
    return (
      <section className="c2-card reveal2" style={{ border: '1px solid rgba(16,185,129,0.25)' }}>
        <GexV2 />
        <div className="p2-vitals" style={{ marginTop: 16 }}>
          <div className="p2-vital"><div className="k">GAMMA FLIP</div><div className="v">$132.50</div></div>
          <div className="p2-vital"><div className="k">DARK POOL</div><div className="v pos">68.4%</div></div>
          <div className="p2-vital"><div className="k">BLOCKS</div><div className="v">214</div></div>
        </div>
        <div style={{ marginTop: 14, font: "400 12.5px/1.55 'Inter'", color: 'var(--text-dim)' }}>
          <b style={{ color: 'var(--cyan)' }}>AI Deep Insight:</b> Dealers short gamma below $132.50 — break lower accelerates volatility. 68% dark-pool accumulation + 214 blocks = institutional positioning into expiry. <b className="pos">Bullish above flip.</b>
        </div>
      </section>
    );
  }

  return (
    <div className="vw2">
      <div className="vw2-blur">
        <GexV2 />
        <div className="p2-vitals" style={{ marginTop: 16 }}>
          <div className="p2-vital"><div className="k">GAMMA FLIP</div><div className="v">${fake(132.5, 0)}</div></div>
          <div className="p2-vital"><div className="k">DARK POOL</div><div className="v">{fake(68.4, 2)}%</div></div>
          <div className="p2-vital"><div className="k">BLOCKS</div><div className="v">{Math.round(+fake(214, 4))}</div></div>
        </div>
        <div style={{ height: 60, marginTop: 14, font: "400 12.5px/1.55 'Inter'", color: 'var(--text-dim)' }}>
          Dealers are short gamma below the flip with heavy dark-pool accumulation suggesting institutional positioning ahead of expiry…
        </div>
      </div>
      <div className="vw2-veil">
        <div className="vw2-teaser">
          <div><div className="lab">GAMMA FLIP · 1 OF 6 SIGNALS FREE</div><div className="val" style={{ color: 'var(--amber)' }}>$132.50</div></div>
          <span className="free-chip">FREE PREVIEW</span>
        </div>
        <div className="vw2-lock">{I2.lock()}</div>
        <div className="vw2-title">Quant Intelligence</div>
        <div className="vw2-sub">5 more live signals behind the wall — updating <b>right now</b>. 30-second video unlocks everything for 1 hour.</div>
        <button className="vw2-cta" onClick={onUnlock}>{I2.play()} Watch &amp; Unlock · 1HR</button>
        <div className="vw2-meta"><span><b>12,400</b> unlocked today</span><span>·</span><span>or <b>$9.99/mo</b> ad-free</span></div>
      </div>
    </div>
  );
}

/* ───────── reward modal (reuses signum.css modal styles) ───────── */
function RewardModal2({ onClose, onReward }) {
  const [el, setEl] = useState(0); const [done, setDone] = useState(false);
  const st = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - st.current) / 4500);
      setEl(p * 30); if (p >= 1) { clearInterval(id); setDone(true); }
    }, 50);
    return () => clearInterval(id);
  }, []);
  const remain = Math.ceil(30 - el), pct = (el / 30) * 100, R = 20, C = 2 * Math.PI * R;
  return (
    <div className="modal-scrim">
      <div className="modal">
        {!done ? (
          <>
            <div className="modal-eyebrow">REWARDED · ADMOB</div>
            <div className="modal-title">Unlocking premium intel</div>
            <div className="ad-play">
              <div className="ad-time">Ad · 0:{String(Math.max(0, remain)).padStart(2, '0')}</div>
              <svg className="ring" width="52" height="52" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r={R} stroke="rgba(255,255,255,0.12)" strokeWidth="4" fill="none"/>
                <circle cx="26" cy="26" r={R} stroke="var(--cyan)" strokeWidth="4" fill="none" strokeDasharray={C}
                  strokeDashoffset={C - (pct / 100) * C} strokeLinecap="round" transform="rotate(-90 26 26)"/>
              </svg>
              <div className="ad-progress" style={{ width: pct + '%' }}></div>
            </div>
            <button className="modal-close" disabled>Please wait… {remain}s</button>
          </>
        ) : (
          <>
            <div className="unlocked-banner">{I2.check()} Unlocked for 1:00:00</div>
            <div className="modal-title">Premium intel is live</div>
            <button className="modal-close" style={{ marginTop: 14, color: 'var(--cyan)', borderColor: 'rgba(34,211,238,0.3)' }}
              onClick={() => { onReward(); onClose(); }}>Continue</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────── main screen ───────── */
function CmdV2Screen({ unlocked, openAd }) {
  const [price, setPrice] = useState(135.20);
  const [flash, setFlash] = useState(null);
  const [seg, setSeg] = useState(0);
  const base = 131.75;

  useEffect(() => {
    const id = setInterval(() => {
      setPrice(p => {
        const np = Math.max(130, p + (Math.random() - 0.485) * 0.35);
        setFlash(np >= p ? 'up' : 'down');
        setTimeout(() => setFlash(null), 450);
        return np;
      });
    }, 1600);
    return () => clearInterval(id);
  }, []);

  const chg = price - base, pct = (chg / base) * 100, up = chg >= 0;
  const SEGS = ['Overview', 'Quant', 'Holders', 'Verdict'];

  return (
    <div className="scroll" data-screen-label="Command v2">
      <header className="hdr glass cmd-bar">
        <button className="icon-btn">{I2.back()}</button>
        <div className="center"><div className="tkr">NVDA</div><div className="co">NVIDIA Corp</div></div>
        <button className="icon-btn">{I2.search()}</button>
      </header>

      <section className="p2-card">
        <div className="p2-topline">
          <span className="price-status"><span className="dot"></span>MARKET OPEN</span>
          <span className={'p2-tick' + (flash ? ` show-${flash}` : '')}>{flash === 'down' ? '▼ TICK' : '▲ TICK'}</span>
        </div>
        <div className="p2-price-row">
          <span className={'p2-price' + (flash ? ` flash-${flash}` : '')}>${price.toFixed(2)}</span>
          <span className={'p2-chg ' + (up ? 'pos' : 'neg')}>{up ? '▲' : '▼'} {up ? '+' : ''}{chg.toFixed(2)} ({up ? '+' : ''}{pct.toFixed(2)}%)</span>
        </div>
        <div className="p2-vitals">
          <div className="p2-vital"><div className="k">RSI 14</div><div className="v">64.2</div><div className="bar"><i style={{ width: '64%' }}></i></div></div>
          <div className="p2-vital"><div className="k">VWAP</div><div className="v">$133.80</div><div className="bar"><i style={{ width: '52%' }}></i></div></div>
          <div className="p2-vital"><div className="k">DAY RANGE</div><div className="v">131–137</div><div className="bar"><i style={{ width: `${((price - 131.2) / 6.3) * 100}%` }}></i></div></div>
        </div>
      </section>

      <div className="seg seg-4">
        <span className="seg-pill" style={{ left: `calc(${seg * 25}% + 3px)` }}></span>
        {SEGS.map((t, i) => <button key={t} className={i === seg ? 'on' : ''} onClick={() => setSeg(i)}>{t}</button>)}
      </div>

      {seg === 0 && <ChartV2 price={price} />}
      {seg === 1 && <ValueWallV2 unlocked={unlocked} onUnlock={openAd} />}
      {(seg === 2 || seg === 3) && (
        <section className="c2-card" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)', font: "600 12px/1.5 'Inter'" }}>
          {SEGS[seg]} — same v2 treatments apply (see REVIEW.md §4)
        </section>
      )}

      {seg === 0 && <ValueWallV2 unlocked={unlocked} onUnlock={openAd} />}

      <div className="ad-slot">
        <span className="ad-flag">AD</span>
        <div className="ad-body"><div className="t">Sponsored placement</div><div className="s">ADMOB · BANNER 320×50</div></div>
        <div className="ad-cta">Learn</div>
      </div>
    </div>
  );
}

/* standalone wrapper (single-screen preview) */
function CmdV2() {
  const [showAd, setShowAd] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  return (
    <div className="viewport">
      <CmdV2Screen unlocked={unlocked} openAd={() => setShowAd(true)} />
      <nav className="tabbar">
        {['Dashboard', 'Command', 'Flow', 'Intel'].map((t, i) => (
          <button key={t} className={'tab' + (i === 1 ? ' active' : '')}>
            <span className="tlabel" style={{ font: "700 11px/1 'Inter'", paddingTop: 8 }}>{t}</span>
            <span className="glow"></span>
          </button>
        ))}
      </nav>
      {showAd && <RewardModal2 onClose={() => setShowAd(false)} onReward={() => setUnlocked(true)} />}
    </div>
  );
}

/* share components with the full 5-tab app */
Object.assign(window, { CmdV2Screen, RewardModal2, ValueWallV2, ChartV2, GexV2, CmdIcons: I2 });

if (!window.__SIGNUM_V2_APP) {
  function Root() {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
        <IOSDevice dark width={390} height={844}>
          <CmdV2 />
        </IOSDevice>
      </div>
    );
  }
  ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
}
