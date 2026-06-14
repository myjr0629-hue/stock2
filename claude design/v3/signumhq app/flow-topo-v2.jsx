/* global React, TickerIcon */
/* ============================================================
   FLOW TOPOGRAPHY MAP v2 — Bubble Constellation
   실코드 1:1 기반: SmartMoneyMap.tsx calculateHubLayout(허브&스포크),
   SectorIcons.tsx의 실제 섹터 ID·컬러, MobileGuardianFlow.tsx의
   TARGET LOCKED·LIVE 배지·Sector Intel 연동 패턴.
   ① 겹침 제로 콘스텔레이션  ② 탭 포커스 → 서브티커 글로우 라인
   ③ 작은 버블 라벨 자동 숨김  ④ 리스트 뷰 토글
   ============================================================ */
const { useState: ftState } = React;

/* real sector ids + colors (SectorIcons.tsx) · density=change, w=height weight */
const FT_SECTORS = [
  { id: 'AI_PWR',     label: 'AI INFRA',  g: 'AI', color: '#00FFF2', chg: +3.2, w: 1.00, tickers: ['NVDA', 'VRT',  'SMCI'] },
  { id: 'SMH',        label: 'SEMIS',     g: 'SM', color: '#e2e8f0', chg: +2.4, w: 0.82, tickers: ['AVGO', 'AMD',  'TSM']  },
  { id: 'XLK',        label: 'TECH',      g: 'TK', color: '#3b82f6', chg: +1.2, w: 0.74, tickers: ['MSFT', 'AAPL', 'ORCL'] },
  { id: 'ICLN',       label: 'CLEAN NRG', g: 'CN', color: '#22c55e', chg: +1.8, w: 0.55, tickers: ['FSLR', 'ENPH', 'TSLA'] },
  { id: 'XLE',        label: 'ENERGY',    g: 'EN', color: '#f59e0b', chg: +0.9, w: 0.52, tickers: ['XOM',  'CVX',  'SLB']  },
  { id: 'XLF',        label: 'FINLS',     g: 'FN', color: '#10b981', chg: +0.3, w: 0.62, tickers: ['JPM',  'BAC',  'GS']   },
  { id: 'HACK',       label: 'CYBER',     g: 'CY', color: '#ef4444', chg: +0.6, w: 0.38, tickers: ['PANW', 'CRWD', 'ZS']   },
  { id: 'XLV',        label: 'HEALTH',    g: 'HC', color: '#ec4899', chg: -0.5, w: 0.45, tickers: ['LLY',  'UNH',  'JNJ']  },
  { id: 'SAFE_HAVEN', label: 'SAFE HVN',  g: 'SH', color: '#eab308', chg: -1.1, w: 0.50, tickers: ['GLD',  'TLT',  'BTC']  },
];
/* flow vectors (rank order) — money rotating INTO the hub */
const FT_VECTORS = [
  { s: 'SAFE_HAVEN', t: 'AI_PWR', strength: 1.0 },
  { s: 'XLV',        t: 'AI_PWR', strength: 0.7 },
  { s: 'XLF',        t: 'SMH',    strength: 0.5 },
];
const FT_TARGET = 'AI_PWR'; /* verdictTargetId — TARGET LOCKED */

/* hub & spoke layout (calculateHubLayout 미러) */
const FT_W = 360, FT_H = 332, FT_CX = 180, FT_CY = 158, FT_RING = 112;
function ftLayout() {
  const center = FT_SECTORS.find(s => s.id === FT_TARGET);
  const others = FT_SECTORS.filter(s => s.id !== FT_TARGET);
  const step = (2 * Math.PI) / others.length, off = -Math.PI / 2;
  return [
    { ...center, x: FT_CX, y: FT_CY, isCenter: true },
    ...others.map((s, i) => ({
      ...s,
      x: FT_CX + FT_RING * Math.cos(off + i * step),
      y: FT_CY + (FT_RING - 14) * Math.sin(off + i * step),
      isCenter: false,
    })),
  ];
}
const FT_NODES = ftLayout();
const ftR = n => n.isCenter ? 42 : 15 + n.w * 16;          /* sizing by weight */
const LABEL_MIN_R = 25;                                     /* rule ④: hide labels on small bubbles */

function FlowTopoV2() {
  const [view, setView] = ftState('map');     /* map | list */
  const [focus, setFocus] = ftState(null);    /* sector id  */
  const sel = FT_SECTORS.find(s => s.id === focus);

  const node = id => FT_NODES.find(n => n.id === id);

  return (
    <div>
      {/* ── MAP CARD ── */}
      <div className={'ft2-card' + (FT_TARGET ? ' locked-target' : '')}>
        <div className="ft2-head">
          <span className="ft2-title">Flow Topography Map</span>
          <span className="ft2-live">● LIVE</span>
          <div className="ft2-toggle">
            <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>MAP</button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>LIST</button>
          </div>
        </div>

        {view === 'map' ? (
          <>
            {!focus && <span className="ft2-hint">TAP BUBBLE TO FOCUS</span>}
            <svg className="ft2-svg" viewBox={`0 0 ${FT_W} ${FT_H}`} onClick={e => { if (e.target.tagName === 'svg') setFocus(null); }}>
              <defs>
                {FT_NODES.map(n => (
                  <radialGradient key={n.id} id={'ftg-' + n.id} cx="0.35" cy="0.3" r="1">
                    <stop offset="0%" stopColor={n.color} stopOpacity="0.34" />
                    <stop offset="70%" stopColor={n.color} stopOpacity="0.10" />
                    <stop offset="100%" stopColor={n.color} stopOpacity="0.04" />
                  </radialGradient>
                ))}
              </defs>

              {/* orbit guide */}
              <ellipse cx={FT_CX} cy={FT_CY} rx={FT_RING} ry={FT_RING - 14} fill="none"
                stroke="rgba(255,255,255,0.05)" strokeDasharray="2 6" />

              {/* flow vectors — animated, into hub */}
              {FT_VECTORS.map((v, i) => {
                const a = node(v.s), b = node(v.t);
                const mx = (a.x + b.x) / 2 + (a.y - b.y) * 0.18, my = (a.y + b.y) / 2 + (b.x - a.x) * 0.18;
                const dim = focus && focus !== v.s && focus !== v.t;
                return (
                  <path key={i} className="ft2-vec" d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                    fill="none" stroke={dim ? 'rgba(34,211,238,0.10)' : 'rgba(34,211,238,0.45)'}
                    strokeWidth={1 + v.strength * 1.4} style={{ transition: 'stroke .3s ease' }} />
                );
              })}

              {/* bubbles */}
              {FT_NODES.map(n => {
                const r = ftR(n);
                const isFocus = focus === n.id;
                const dim = focus && !isFocus;
                /* focused ring bubble drifts 35% toward center & scales — graceful expand */
                const k = isFocus && !n.isCenter ? 0.35 : 0;
                const tx = n.x + (FT_CX - n.x) * k, ty = n.y + (FT_CY - n.y) * k;
                const scale = isFocus ? (n.isCenter ? 1.12 : 1.65) : 1;
                const showLabel = isFocus || r >= LABEL_MIN_R;  /* rule ④ */
                return (
                  <g key={n.id} className={'ft2-node' + (dim ? ' dim' : '')}
                    style={{ transform: `translate(${tx}px,${ty}px) scale(${scale})` }}
                    onClick={() => setFocus(isFocus ? null : n.id)}>
                    {/* glow halo */}
                    <circle r={r + 7} fill="none" stroke={n.color} strokeOpacity={isFocus ? 0.55 : 0.22}
                      strokeWidth="1" strokeDasharray={n.isCenter ? '3 5' : 'none'}
                      className={n.isCenter ? 'ft2-glowring' : ''} />
                    {/* body */}
                    <circle className="body" r={r} fill={`url(#ftg-${n.id})`} stroke={n.color}
                      strokeOpacity={isFocus ? 0.9 : 0.5} strokeWidth={isFocus ? 1.6 : 1}
                      style={{ filter: isFocus ? `drop-shadow(0 0 14px ${n.color}66)` : `drop-shadow(0 0 7px ${n.color}33)` }} />
                    {showLabel ? (
                      <>
                        <text textAnchor="middle" y={-3} fill="#f1f5f9"
                          style={{ font: `800 ${n.isCenter ? 11.5 : 9.5}px Inter`, letterSpacing: '0.06em' }}>{n.label}</text>
                        <text textAnchor="middle" y={11} fill={n.chg >= 0 ? '#34d399' : '#f87171'}
                          style={{ font: '600 10px Inter', fontVariantNumeric: 'tabular-nums' }}>
                          {n.chg > 0 ? '+' : ''}{n.chg.toFixed(1)}%</text>
                      </>
                    ) : (
                      <text textAnchor="middle" y={3.5} fill={n.color} fillOpacity="0.9"
                        style={{ font: '800 9px Inter', letterSpacing: '0.04em' }}>{n.g}</text>
                    )}

                    {/* sub-ticker constellation on focus — fan opens toward map center (edge-safe) */}
                    {isFocus && n.tickers.map((tk, i) => {
                      const inward = n.isCenter ? -Math.PI / 2 + 0.42 : Math.atan2(FT_CY - ty, FT_CX - tx);
                      const ang = n.isCenter ? inward + i * (2 * Math.PI / 3) : inward + (i - 1) * 0.85;
                      const d = r + 34;
                      const sx = d * Math.cos(ang), sy = d * Math.sin(ang);
                      return (
                        <g key={tk}>
                          <line className="ft2-subline" x1={r * Math.cos(ang) * 0.95} y1={r * Math.sin(ang) * 0.95}
                            x2={sx} y2={sy} stroke={n.color} strokeOpacity="0.5" strokeWidth="0.8"
                            style={{ filter: `drop-shadow(0 0 4px ${n.color})` }} />
                          <g className="ft2-sub" style={{ transformOrigin: `${sx}px ${sy}px` }}>
                            <rect x={sx - 21} y={sy - 9} width="42" height="18" rx="9"
                              fill="rgba(5,10,20,0.92)" stroke={n.color} strokeOpacity="0.45" strokeWidth="0.8" />
                            <text x={sx} y={sy + 3} textAnchor="middle" fill="#f1f5f9"
                              style={{ font: '700 8.5px Inter', letterSpacing: '0.03em' }}>{tk}</text>
                          </g>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
            <div className="ft2-locked">TARGET LOCKED</div>
          </>
        ) : (
          /* ── LIST VIEW (rule ⑤) ── */
          <div className="ft2-list">
            {[...FT_SECTORS].sort((a, b) => b.chg - a.chg).map(s => (
              <div key={s.id} className={'ft2-lrow' + (focus === s.id ? ' sel' : '')}
                onClick={() => setFocus(focus === s.id ? null : s.id)}>
                <span className="ft2-ldot" style={{ background: s.color + '1f', border: `1px solid ${s.color}55`, color: s.color }}>{s.g}</span>
                <div className="ft2-lmid">
                  <div className="ft2-lname">{s.label}</div>
                  <div className="ft2-lbar"><i style={{ width: (s.w * 100) + '%', background: s.color, opacity: 0.6 }}></i></div>
                  <div className="ft2-ltick">{s.tickers.join(' · ')}</div>
                </div>
                <span className={'ft2-lchg ' + (s.chg >= 0 ? 'pos' : 'neg')}>{s.chg > 0 ? '+' : ''}{s.chg.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECTOR INTEL (실코드 연동 패턴: onSectorSelect → detail) ── */}
      <div className="ft2-intel">
        <div className="ft2-intel-title">SECTOR INTEL</div>
        {sel ? (
          <>
            <div className="ft2-ihead">
              <span className="n">{sel.label}</span>
              <span className={'c ' + (sel.chg >= 0 ? 'pos' : 'neg')}>{sel.chg > 0 ? '+' : ''}{sel.chg.toFixed(2)}%</span>
            </div>
            {/* 5D trend bars — 실코드 D-4..D-1 패턴 */}
            {[['D-4', 0.4], ['D-3', 0.9], ['D-2', -0.3], ['D-1', 1.4]].map(([dl, c]) => (
              <div className="ft2-dayrow" key={dl}>
                <span className="dl">{dl}</span>
                <div className="ft2-daytrack">
                  <span className="mid"></span>
                  <span className="bar" style={{
                    background: c >= 0 ? 'rgba(16,185,129,0.7)' : 'rgba(244,63,94,0.7)',
                    left: c >= 0 ? '50%' : (50 - Math.abs(c) / 1.5 * 45) + '%',
                    width: (Math.abs(c) / 1.5 * 45) + '%' }}></span>
                </div>
              </div>
            ))}
            <div className="ft2-chips">
              {sel.tickers.map(tk => (
                <span className="ft2-chip" key={tk}><TickerIcon sym={tk} size={13} /> {tk}</span>
              ))}
              <span className="ft2-chip" style={{ color: 'var(--cyan)', borderColor: 'rgba(34,211,238,0.3)' }}>RVOL 1.6× SURGING</span>
            </div>
          </>
        ) : (
          <div style={{ font: "400 11px/1.5 'Inter'", color: 'var(--text-dim)', padding: '4px 0 6px' }}>
            Tap a bubble or list row to inspect sector rotation, 5-day trend and top constituents.
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { FlowTopoV2 });
