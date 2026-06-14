/* global React */
/* Screens B: Flow v2 + Intel v2 */
const { useState, useEffect, useMemo } = React;

/* ════════════════ FLOW v2 ════════════════ */
const FLOW_TABLE = [
  { cp: 'CALL', k: '$140 Jul 12', prem: '$2.4M', type: 'SWEEP', sent: 'BULL' },
  { cp: 'PUT',  k: '$125 Aug 15', prem: '$890K', type: 'BLOCK', sent: 'BEAR' },
  { cp: 'CALL', k: '$145 Jul 19', prem: '$1.7M', type: 'SWEEP', sent: 'BULL' },
  { cp: 'CALL', k: '$150 Sep 20', prem: '$3.1M', type: 'BLOCK', sent: 'BULL' },
  { cp: 'PUT',  k: '$130 Jul 12', prem: '$640K', type: 'SWEEP', sent: 'BEAR' },
  { cp: 'CALL', k: '$138 Jun 28', prem: '$1.2M', type: 'SWEEP', sent: 'BULL' },
];

function FlowV2({ unlocked, openAd }) {
  const [ticker, setTicker] = useState('NVDA');
  const [q, setQ] = useState('');
  const PRICES = { NVDA: [135.20, 2.62], TSLA: [178.40, -1.24], AAPL: [212.10, 0.84], SPY: [542.30, 0.82], QQQ: [470.15, 1.24] };
  const [px, chg] = PRICES[ticker] || [100, 0];
  const opi = { NVDA: 68, TSLA: 41, AAPL: 57, SPY: 61, QQQ: 64 }[ticker] || 50;
  const gcol = opi >= 60 ? 'var(--green)' : opi >= 40 ? 'var(--amber)' : 'var(--red)';
  const gstat = opi >= 60 ? 'BULLISH' : opi >= 40 ? 'NEUTRAL' : 'BEARISH';

  const submit = e => { e.preventDefault(); if (q.trim()) setTicker(q.trim().toUpperCase()); };

  return (
    <div className="scroll" data-screen-label="Flow v2">
      <header className="pg-hdr">
        <div><div className="pg-title">FLOW</div><div className="pg-sub">REAL-TIME OPTIONS FLOW</div></div>
        <span className="live-pill"><span className="d"></span>LIVE</span>
      </header>

      {/* SEARCH */}
      <form className="srch" onSubmit={submit}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ticker… (e.g. NVDA)"/>
        <button type="submit">GO</button>
      </form>

      {/* TICKER PILLS */}
      <div className="tkr-pills">
        {['NVDA', 'TSLA', 'AAPL', 'SPY', 'QQQ'].map(s => (
          <button key={s} className={'tkr-pill' + (ticker === s ? ' on' : '')} onClick={() => { setTicker(s); setQ(s); }}><TickerIcon sym={s} size={15}/>{s}</button>
        ))}
      </div>

      {/* UNDERLYING */}
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div><div className="dp-tag">UNDERLYING</div><div className="tk-row" style={{ marginTop: 5, gap: 8 }}><TickerIcon sym={ticker} size={24}/><span style={{ font: "800 18px/1 'Inter'" }}>{ticker}</span></div></div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ font: '800 18px/1 var(--f-mono)' }} className="tnum">${px.toFixed(2)}</div>
          <div className={'tnum ' + (chg >= 0 ? 'pos' : 'neg')} style={{ font: '700 11px/1 var(--f-mono)', marginTop: 4 }}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</div>
        </div>
      </div>

      {/* OPI GAUGE */}
      <div className="hud" style={{ paddingBottom: 14 }}>
        <span className="hud-corner tl"></span><span className="hud-corner tr"></span><span className="hud-corner bl"></span><span className="hud-corner br"></span>
        <div className="c2-head" style={{ marginBottom: 2 }}>
          <span className="c2-title">OPTIONS PRESSURE INDEX</span>
          <span style={{ font: "800 10px/1 'Inter'", letterSpacing: '0.1em', color: gcol }}>{gstat}</span>
        </div>
        <div className="gauge-wrap">
          <Gauge value={opi} color={gcol} key={ticker}/>
          <div className="gauge-val" style={{ color: gcol }}>{(opi / 47).toFixed(2)}</div>
          <div className="gauge-tag" style={{ color: gcol }}>{gstat} PRESSURE</div>
          <div className="gauge-scale"><span>BEARISH</span><span>NEUTRAL</span><span>BULLISH</span></div>
          <div className="gauge-read">{opi >= 60 ? 'Call dominance — bullish pressure building' : opi >= 40 ? 'Balanced positioning — wait for confirmation' : 'Put dominance — defensive flows'}</div>
        </div>
      </div>

      {/* PUT/CALL RATIO */}
      <div className="dp-card" style={{ marginBottom: 12 }}>
        <div className="c2-head"><span className="c2-title">PUT / CALL RATIO</span><span className="hero-tag" style={{ padding: '4px 8px', fontSize: 10 }}>▲ BULLISH</span></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ font: '800 26px/1 var(--f-mono)' }} className="tnum">0.68</div>
            <div className="pos" style={{ font: '600 10.5px/1 var(--f-mono)', marginTop: 6 }}>▼ from 0.82 yesterday</div>
          </div>
          <Spk data={[0.91, 0.85, 0.88, 0.82, 0.74, 0.68]} up={false} w={110} h={36}/>
        </div>
      </div>

      {/* FLOW SUMMARY */}
      <div className="dp-card" style={{ marginBottom: 12 }}>
        <div className="c2-title" style={{ marginBottom: 8 }}>FLOW SUMMARY · TODAY</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ font: '800 22px/1 var(--f-mono)' }} className="tnum">$2.4B</span>
          <span className="dp-tag">TOTAL PREMIUM</span>
        </div>
        <div className="cp-bar"><div className="c" style={{ width: '68%' }}></div><div className="p" style={{ width: '32%' }}></div></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span className="pos" style={{ font: "700 10px/1 'Inter'" }}>68% CALLS</span>
          <span className="neg" style={{ font: "700 10px/1 'Inter'" }}>32% PUTS</span>
        </div>
        <div className="fsum-grid">
          <div className="p2-vital"><div className="k">NET PREMIUM</div><div className="v pos">+$450M</div></div>
          <div className="p2-vital"><div className="k">UNUSUAL ALERTS</div><div className="v" style={{ color: 'var(--amber)' }}>23 ⚠</div></div>
        </div>
      </div>

      {/* LIVE OPTIONS FLOW — PREMIUM */}
      <div className="sec-hdr"><div className="sec-title"><span className="bar" style={{ background: 'var(--amber)', boxShadow: '0 0 8px var(--amber)' }}></span>Live Options Flow</div><span className="sec-link" style={{ color: 'var(--amber)' }}>{unlocked ? 'LIVE' : 'PREMIUM'}</span></div>
      <VaultMini
        unlocked={unlocked} onUnlock={openAd}
        teaserLabel="LATEST SWEEP · 1 OF 6 FREE" teaserValue="CALL $140 · $2.4M"
        title="Live Options Flow" sub={<>Tape-level sweeps &amp; blocks streaming <b>right now</b> — plus dark-pool %.</>}
        preview={
          <table className="ftab"><thead><tr><th>TYPE</th><th>CONTRACT</th><th>PREM</th><th>EXEC</th></tr></thead>
            <tbody>{FLOW_TABLE.slice(0, 4).map((r, i) => (
              <tr key={i}><td>{r.cp}</td><td>{r.k}</td><td>{r.prem}</td><td>{r.type}</td></tr>
            ))}</tbody>
          </table>
        }>
        <div className="dp-card" style={{ marginBottom: 12, borderColor: 'rgba(16,185,129,0.25)' }}>
          <table className="ftab">
            <thead><tr><th>TYPE</th><th>CONTRACT</th><th>PREM</th><th>EXEC</th><th>SENT</th></tr></thead>
            <tbody>
              {FLOW_TABLE.map((r, i) => (
                <tr key={i}>
                  <td style={{ color: r.cp === 'CALL' ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>{r.cp}</td>
                  <td>{r.k}</td><td>{r.prem}</td><td style={{ color: 'var(--text-dim)' }}>{r.type}</td>
                  <td style={{ color: r.sent === 'BULL' ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>{r.sent}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mrow" style={{ marginTop: 4 }}><span className="k">Dark Pool %</span><span className="v pos">68.4%</span></div>
          <div className="mrow"><span className="k">Block Trades</span><span className="v">214</span></div>
          <div className="mrow"><span className="k">Smart Money Bias</span><span className="chip" style={{ background: 'var(--green-dim)', color: 'var(--green)' }}>ACCUMULATING</span></div>
        </div>
      </VaultMini>

      <div className="ad-slot">
        <span className="ad-flag">AD</span>
        <div className="ad-body"><div className="t">Sponsored placement</div><div className="s">ADMOB · BANNER 320×50</div></div>
        <div className="ad-cta">Learn</div>
      </div>
    </div>
  );
}

/* ════════════════ INTEL v2 ════════════════ */
const SECTORS = [
  { e: '🔥', n: 'Magnificent 7',  i: 'NVDA leads with record GEX positioning', p: 2.1 },
  { e: '🤖', n: 'Physical AI',    i: 'Robotics momentum building on TSLA Optimus', p: 1.8 },
  { e: '⚡', n: 'Silicon Core',   i: 'Semiconductor cycle peak signals emerging', p: -0.3 },
  { e: '🔋', n: 'Power Matrix',   i: 'Nuclear renaissance driving utility rotation', p: 3.2 },
  { e: '🧬', n: 'Bio Pulse',      i: 'GLP-1 pipeline dominating pharma flows', p: 0.5 },
  { e: '🛡️', n: 'Cyber Shield',  i: 'Zero-trust spending acceleration confirmed', p: 1.1 },
  { e: '🚀', n: 'Orbit Defense',  i: 'Space defense contracts expanding rapidly', p: 0.8 },
  { e: '💎', n: 'Quantum Edge',   i: 'Quantum computing nearing commercial viability', p: -1.2 },
  { e: '💳', n: 'Fintech Pulse',  i: 'BNPL regulation creating new winners', p: 0.4 },
  { e: '☁️', n: 'Cloud Fortress', i: 'AI inference demand reshaping cloud margins', p: 1.5 },
];
const KEY_STOCKS = { 'Magnificent 7': [['NVDA', '+5.2%', 1], ['MSFT', '+1.1%', 1], ['META', '−0.9%', 0]], 'Power Matrix': [['CEG', '+4.8%', 1], ['VST', '+3.9%', 1], ['NEE', '+1.2%', 1]] };

function IntelV2() {
  const [sel, setSel] = useState(null);

  if (sel != null) {
    const s = SECTORS[sel];
    const up = s.p >= 0;
    const ks = KEY_STOCKS[s.n] || [['NVDA', '+5.2%', 1], ['AMD', '+3.4%', 1], ['AVGO', '−0.4%', 0]];
    return (
      <div className="scroll" data-screen-label="Intel detail v2">
        <button className="detail-back" onClick={() => setSel(null)}>← Back to Sectors</button>
        <div className="verdict-card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="sec-ico" style={{ width: 46, height: 46, fontSize: 22 }}>{s.e}</div>
          <div>
            <div style={{ font: "800 17px/1.2 'Inter'" }}>{s.n}</div>
            <div className="sec-insight" style={{ marginTop: 4 }}>{s.i}</div>
          </div>
          <span className={'sec-perf ' + (up ? 'pos' : 'neg')} style={{ background: up ? 'var(--green-dim)' : 'var(--red-dim)' }}>{up ? '+' : ''}{s.p}%</span>
        </div>

        <div className="verdict-card">
          <div className="c2-title" style={{ color: 'var(--cyan)', marginBottom: 7 }}>⌁ AI VERDICT</div>
          <div className="brief-txt" style={{ marginTop: 0 }}>
            Institutional flow confirms <b>{up ? 'accumulation' : 'distribution'}</b> across the complex. Options positioning skews {up ? 'bullish into next OPEX with call walls building overhead' : 'defensive with put hedges concentrated near-term'}. <b>{up ? 'Buy-the-dip regime intact.' : 'Patience until skew normalizes.'}</b>
          </div>
        </div>

        <div className="dp-card" style={{ marginBottom: 10 }}>
          <div className="c2-title" style={{ marginBottom: 4 }}>KEY CATALYSTS</div>
          <div className="cat-row"><span className="b">01</span><span className="t">Earnings cluster next week — implied moves above 3-month average</span></div>
          <div className="cat-row"><span className="b">02</span><span className="t">Dealer gamma flips positive 2% above spot — vol compression likely</span></div>
          <div className="cat-row"><span className="b">03</span><span className="t">Dark-pool prints running 1.6× 20-day average — institutions active</span></div>
        </div>

        <div className="dp-card" style={{ marginBottom: 12 }}>
          <div className="c2-title" style={{ marginBottom: 4 }}>KEY STOCKS</div>
          {ks.map(([t, p, u]) => (
            <div className="kstock" key={t}>
              <span style={{ font: "800 13px/1 'Inter'" }}>{t}</span>
              <span className={u ? 'pos' : 'neg'} style={{ font: '700 12px/1 var(--f-mono)' }}>{p}</span>
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

  return (
    <div className="scroll" data-screen-label="Intel v2">
      <header className="pg-hdr">
        <div><div className="pg-title">INTEL</div><div className="pg-sub">SECTOR INTELLIGENCE</div></div>
        <span className="live-pill"><span className="d" style={{ background: 'var(--green)', boxShadow: '0 0 6px var(--green)' }}></span>UPD 2H AGO</span>
      </header>
      <div style={{ font: "400 11.5px/1.4 'Inter'", color: 'var(--text-dim)', margin: '-6px 2px 13px' }}>
        AI-powered analysis · updated every 4 hours · <b style={{ color: 'var(--green)' }}>all free</b>
      </div>

      {SECTORS.map((s, i) => {
        const up = s.p >= 0;
        const sent = s.p >= 1.5 ? 'var(--green)' : s.p >= 0 ? 'rgba(16,185,129,0.5)' : 'var(--red)';
        return (
          <React.Fragment key={s.n}>
            <div className="sec-card" style={{ '--sent': sent }} onClick={() => setSel(i)}>
              <div className="sec-ico">{s.e}</div>
              <div style={{ minWidth: 0 }}>
                <div className="sec-name">{s.n}</div>
                <div className="sec-insight">{s.i}</div>
                <div className="sec-meta"><span className="gpulse"><i></i>GAMMA PULSE</span><span className="upd">· 2hr ago</span></div>
              </div>
              <span className={'sec-perf ' + (up ? 'pos' : 'neg')} style={{ background: up ? 'var(--green-dim)' : 'var(--red-dim)' }}>{up ? '+' : ''}{s.p}%</span>
            </div>
            {(i === 2 || i === 5) && <div className="ad-divider"><span>INTERSTITIAL AD BREAK</span></div>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

Object.assign(window, { FlowV2, IntelV2 });
