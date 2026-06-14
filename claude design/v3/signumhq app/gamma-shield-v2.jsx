/* global React, Gauge, Spk */
/* ============================================================
   GAMMA SHIELD v2 — Guardian › Shield 서브탭
   실데이터 구조(GammaShield.tsx) 1:1 기반 모바일 재설계:
   ① 3컬럼 → 세로 스택  ② Squeeze = 스피도미터 게이지
   ③ Historical Context 6카드 = 가로 스와이프 캐러셀
   ④ 모든 라벨 전용 수직 마진 · 숫자 semibold / 라벨 regular
   ============================================================ */
const { useState: gsUseState, useEffect: gsUseEffect } = React;

/* demo values mirroring real GammaShieldData */
const GS = {
  gexIndex: 32, gexLevel: 'LONG GAMMA', gexChange: 4, pctl: 68,
  squeezeRisk: 38, squeezeLevel: 'MEDIUM',
  support: 5880, current: 5942, resistance: 6120, flip: 5905,
  spark: [-12, -4, 8, 14, 9, 22, 32],
  hist: [
    { t: 'GEX 30D PCTL',  v: '68', sm: 'th', col: 'var(--green)',  d: 'Where gamma sits vs 30-day history' },
    { t: 'REGIME STREAK', v: 'NEUTRAL', sm: ' 10D', col: 'var(--text)', d: 'How long this regime has lasted', small: true },
    { t: 'REGIME SHIFTS', v: '2', col: 'var(--text)', d: 'Market stability / instability' },
    { t: 'CW HIT RATE',   v: '92', sm: '%', col: 'var(--green)',  d: '(11/12) Resistance reliability' },
    { t: 'PF HIT RATE',   v: '100', sm: '%', col: 'var(--green)', d: '(12/12) Support reliability' },
    { t: 'CW TREND',      v: '↑ +85', sm: 'pt', col: 'var(--cyan)', d: 'Dealer positioning direction' },
  ],
};

function GammaShieldV2() {
  const pos = Math.max(8, Math.min(92, ((GS.current - GS.support) / (GS.resistance - GS.support)) * 100));
  const sqColor = GS.squeezeRisk >= 70 ? 'var(--red)' : GS.squeezeRisk >= 45 ? 'var(--amber)' : GS.squeezeRisk >= 25 ? '#fde047' : 'var(--green)';
  const flipDist = (((GS.current - GS.flip) / GS.flip) * 100).toFixed(1);

  return (
    <div>
      {/* header */}
      <div className="gs2-hdr">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z" stroke="var(--cyan)" strokeWidth="1.8" strokeLinejoin="round"/></svg>
        <span className="gs2-title">GAMMA SHIELD</span>
        <span className="gs2-conf">HIGH</span>
        <span className="live-pill gs2-live"><span className="d"></span>LIVE</span>
      </div>

      {/* summary strip */}
      <div className="gs2-summary">
        <p>⚡ Gamma defense (+{GS.gexIndex}) — dealer positioning absorbs volatility within 5,880–6,120 range. <b>Squeeze {GS.squeezeRisk}% building.</b></p>
      </div>

      {/* ① GAMMA PRESSURE — vertical stack #1 */}
      <section className="gs2-card">
        <div className="gs2-label"><span className="t">Gamma Pressure Index</span><span className="r">7D GEX TREND</span></div>
        <Spk data={GS.spark} up={true} w={300} h={48}/>
        <div className="gs2-gex-val">
          <span className="gs2-gex-num pos">+{GS.gexIndex}</span>
          <span className="gs2-chip" style={{ color: 'var(--green)', background: 'var(--green-dim)', border: '1px solid rgba(16,185,129,0.3)' }}>{GS.gexLevel}</span>
        </div>
        <div className="gs2-sub-row">
          <span className="pos">▲{GS.gexChange} vs prev</span>
          <span>·</span>
          <span>{GS.pctl}th pctl (30D)</span>
        </div>
      </section>

      {/* ② SQUEEZE RISK — speedometer dial */}
      <section className="gs2-card hud" style={{ marginBottom: 10 }}>
        <span className="hud-corner tl"></span><span className="hud-corner tr"></span><span className="hud-corner bl"></span><span className="hud-corner br"></span>
        <div className="gs2-label" style={{ marginBottom: 4 }}><span className="t">Squeeze Risk</span><span className="r" style={{ color: sqColor }}>{GS.squeezeLevel}</span></div>
        <div className="gauge-wrap">
          <Gauge value={GS.squeezeRisk} color={sqColor} size={210}/>
          <div className="gauge-val" style={{ color: sqColor }}>{GS.squeezeRisk}<span style={{ font: "600 13px/1 'Inter'", color: 'var(--text-dim)' }}>%</span></div>
          <div className="gauge-tag" style={{ color: sqColor }}>{GS.squeezeLevel}</div>
          <div className="gauge-scale"><span>LOW</span><span>HIGH 45</span><span>EXTREME 70</span></div>
          <div className="gauge-read">→ HIGH if +{45 - GS.squeezeRisk}pt · volatility compression building</div>
        </div>
      </section>

      {/* ③ TRIGGER BAND — vertical stack #3 */}
      <section className="gs2-card">
        <div className="gs2-label"><span className="t">Trigger Band · S&amp;P 500</span><span className="r" style={{ color: 'rgba(16,185,129,0.7)' }}>Realtime ●</span></div>
        <div className="gs2-tb-row"><span className="k">RESISTANCE</span><span className="v neg">6,120</span></div>
        <div className="gs2-track-zone">
          <span className="gs2-price-badge" style={{ left: pos + '%' }}>5,942</span>
          <div className="gs2-track"><span className="gs2-needle-line" style={{ left: pos + '%' }}></span></div>
        </div>
        <div className="gs2-tb-row"><span className="k">SUPPORT</span><span className="v pos">5,880</span></div>
        <div className="gs2-flip">
          <span className="k">⚡ FLIP</span>
          <span className="v">5,905</span>
          <span className="d">(+{flipDist}%)</span>
        </div>
      </section>

      {/* ④ HISTORICAL CONTEXT — swipe carousel */}
      <div className="gs2-hist-head">
        <span className="dot"></span>
        <span className="t">Historical Context (30D)</span>
        <span className="hint">← SWIPE →</span>
      </div>
      <div className="gs2-carousel">
        {GS.hist.map(h => (
          <div className="gs2-hcard" key={h.t}>
            <span className="ht">{h.t}</span>
            <span className="hv" style={{ color: h.col, fontSize: h.small ? 15 : undefined }}>{h.v}{h.sm && <small>{h.sm}</small>}</span>
            <span className="hd">{h.d}</span>
          </div>
        ))}
      </div>
      <div style={{ font: "400 9.5px/1.4 'Inter'", color: 'var(--text-muted)', textAlign: 'right', fontStyle: 'italic', margin: '0 2px 12px' }}>
        Live structure + 30D historical context. Informational only.
      </div>
    </div>
  );
}

Object.assign(window, { GammaShieldV2 });
