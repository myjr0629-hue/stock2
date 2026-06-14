/* global React, ReactDOM, TickerIcon, TICKER_REGISTRY */
const { useState } = React;

const Sw = ({ c, name, val, border }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ height: 64, borderRadius: 10, background: c, border: border || '1px solid rgba(255,255,255,0.08)', boxShadow: 'var(--depth-1)' }}></div>
    <div>
      <div style={{ font: "700 12px/1 'Inter'", color: 'var(--text)' }}>{name}</div>
      <div style={{ font: '500 10.5px/1 var(--f-mono)', color: 'var(--text-muted)', marginTop: 4 }}>{val}</div>
    </div>
  </div>
);

const SecTitle = ({ n, t, sub }) => (
  <div style={{ margin: '52px 0 20px', display: 'flex', alignItems: 'baseline', gap: 14 }}>
    <span style={{ font: '800 13px/1 var(--f-mono)', color: 'var(--cyan)' }}>{n}</span>
    <div>
      <div style={{ font: "800 22px/1.1 'Inter'", letterSpacing: '-0.01em' }}>{t}</div>
      {sub && <div style={{ font: "400 12.5px/1.5 'Inter'", color: 'var(--text-dim)', marginTop: 6, maxWidth: 640 }}>{sub}</div>}
    </div>
  </div>
);

const Card = ({ children, style }) => (
  <div className="card" style={{ padding: 20, boxShadow: 'var(--depth-2)', ...style }}>{children}</div>
);

function DSSheet() {
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 32px 80px' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="brand-mark" style={{ width: 42, height: 42, borderRadius: 11 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M17 5H8a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6" stroke="#04181d" strokeWidth="2.6" strokeLinecap="round"/></svg>
        </div>
        <div>
          <div style={{ font: "800 28px/1 'Inter'", letterSpacing: '0.03em' }}>SIGNUM<span style={{ color: 'var(--cyan)' }}> HQ</span> — Design System</div>
          <div style={{ font: "600 12px/1 'Inter'", color: 'var(--text-dim)', marginTop: 8, letterSpacing: '0.06em' }}>
            BLOOMBERG TERMINAL × SCI-FI COCKPIT HUD · MOBILE 390×844 · v2.1
          </div>
        </div>
      </div>

      {/* ── 01 Color ── */}
      <SecTitle n="01" t="Color Tokens" sub="딥 코스믹 다크 캔버스 위 글래스 서피스. 시안=시그널/글로우, 앰버=프리미엄/언락, 그린·레드=방향성 전용. 액센트를 장식으로 쓰지 않는다." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14 }}>
        <Sw c="#050a14" name="bg / canvas" val="#050a14" />
        <Sw c="rgba(255,255,255,0.03)" name="surface-1" val="α 0.03" />
        <Sw c="rgba(255,255,255,0.06)" name="surface-3" val="α 0.06" />
        <Sw c="#22d3ee" name="cyan · primary" val="#22d3ee" />
        <Sw c="#f59e0b" name="amber · premium" val="#f59e0b" />
        <Sw c="linear-gradient(135deg,#10b981 50%,#ef4444 50%)" name="green / red" val="#10b981 · #ef4444" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 14 }}>
        <Sw c="#f1f5f9" name="text · primary" val="#f1f5f9" />
        <Sw c="#94a3b8" name="text · secondary" val="#94a3b8" />
        <Sw c="#475569" name="text · muted" val="#475569" />
      </div>

      <Card style={{ marginTop: 18, borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.04)' }}>
        <div style={{ font: "800 12px/1 'Inter'", color: 'var(--amber)', letterSpacing: '0.08em' }}>⚠ 현재 stock2 코드와의 드리프트 2건</div>
        <div style={{ font: "400 12.5px/1.6 'Inter'", color: 'var(--text-dim)', marginTop: 10 }}>
          ① <b style={{ color: 'var(--text)' }}>캔버스가 밝아짐</b> — <code className="tnum">--bg: #0b111e</code> (스펙: <code className="tnum">#050a14</code>). 코스믹 깊이가 줄고 글로우 대비가 약해집니다.<br/>
          ② <b style={{ color: 'var(--text)' }}>텍스트 위계 붕괴</b> — <code className="tnum">--text-dim: #e2e8f0</code>는 <code className="tnum">--text: #f8fafc</code>와 거의 동일. 3단계 위계(#f1f5f9 / #94a3b8 / #475569)로 복원 권장.
        </div>
      </Card>

      {/* ── 02 Typography ── */}
      <SecTitle n="02" t="Typography" sub="Inter(UI) + JetBrains Mono(숫자·데이터). 모든 수치는 tabular-nums 고정폭 — 터미널의 핵심 질감." />
      <Card>
        {[['display', '800 32px', 'Dark Pool Intelligence'],
          ['h1', '800 24px', 'Unusual Options Flow'],
          ['h2', '700 18px', 'Institutional Pulse'],
          ['body', '400 14px', 'Dealers short gamma below the flip — break lower accelerates volatility.'],
          ['micro', '600 10px · ls 0.12em', 'OPTIONS PRESSURE INDEX']].map(([k, s, t]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '110px 130px 1fr', alignItems: 'baseline', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ font: '600 11px/1 var(--f-mono)', color: 'var(--cyan)' }}>--f-{k}</span>
            <span style={{ font: "500 11px/1 'Inter'", color: 'var(--text-muted)' }}>{s}</span>
            <span style={{ font: `var(--f-${k})`, letterSpacing: k === 'micro' ? '0.12em' : undefined }}>{t}</span>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '110px 130px 1fr', alignItems: 'baseline', gap: 16, padding: '12px 0 2px' }}>
          <span style={{ font: '600 11px/1 var(--f-mono)', color: 'var(--cyan)' }}>--f-mono</span>
          <span style={{ font: "500 11px/1 'Inter'", color: 'var(--text-muted)' }}>JetBrains Mono</span>
          <span className="tnum" style={{ font: '700 20px/1 var(--f-mono)' }}>$135.20 <span className="pos">+2.62%</span> · 0.68 · $2.4B</span>
        </div>
      </Card>

      {/* ── 03 Depth ── */}
      <SecTitle n="03" t="Depth & Glow" sub="3단계 깊이: 리스트 셀 → 카드 → 히어로. 위로 갈수록 그림자가 길어지고 inset 하이라이트·이너 글로우가 강해진다. 글로우 토큰은 의미색과 1:1." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {[['depth-1', 'list cells · tiles', 'var(--depth-1)'], ['depth-2', 'primary cards', 'var(--depth-2)'], ['depth-3 + inner glow', 'hero surfaces', 'var(--depth-3), var(--inner-glow-cyan)']].map(([n, d, s]) => (
          <div key={n} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 14, padding: 18, boxShadow: s, minHeight: 96 }}>
            <div style={{ font: '700 12px/1 var(--f-mono)', color: 'var(--cyan)' }}>{n}</div>
            <div style={{ font: "400 11.5px/1.4 'Inter'", color: 'var(--text-dim)', marginTop: 8 }}>{d}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
        {[['--glow-cyan', '#22d3ee'], ['--glow-green', '#10b981'], ['--glow-red', '#ef4444'], ['--glow-amber', '#f59e0b']].map(([n, c]) => (
          <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 999, padding: '9px 15px' }}>
            <i style={{ width: 9, height: 9, borderRadius: '50%', background: c, boxShadow: `0 0 12px ${c}` }}></i>
            <span style={{ font: '600 11px/1 var(--f-mono)', color: 'var(--text-dim)' }}>{n}</span>
          </span>
        ))}
      </div>

      {/* ── 04 Ticker icons ── */}
      <SecTitle n="04" t="Ticker Symbol Icons" sub="룰 1: 모든 주요 티커 옆에는 텍스트가 아닌 심볼 배지. 브랜드 고유 휴(hue) 그라데이션 + 모노그램 — 상표 로고를 복제하지 않는 오리지널 아트." />
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9,1fr)', gap: 16 }}>
          {Object.keys(TICKER_REGISTRY).map(s => (
            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <TickerIcon sym={s} size={36} />
              <span style={{ font: '600 10px/1 var(--f-mono)', color: 'var(--text-dim)' }}>{s}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <span style={{ font: "600 11px/1 'Inter'", color: 'var(--text-muted)' }}>IN CONTEXT →</span>
          <span className="tk-row" style={{ gap: 7 }}><TickerIcon sym="SPY" size={17}/><span style={{ font: "800 13px/1 'Inter'" }}>SPY</span><span className="tnum pos" style={{ font: '700 12px/1 var(--f-mono)' }}>$542.30 ▲+0.82%</span></span>
          <span className="tk-row" style={{ gap: 7 }}><TickerIcon sym="VIX" size={17}/><span style={{ font: "800 13px/1 'Inter'" }}>VIX</span><span className="tnum neg" style={{ font: '700 12px/1 var(--f-mono)' }}>21.50 ▼−3.10%</span></span>
        </div>
      </Card>

      {/* ── 05 Components ── */}
      <SecTitle n="05" t="Core Components" sub="상태 필 · CALL/PUT 배지 · 세그먼트 컨트롤 · 프리미엄 언락 CTA. 모든 터치 타깃 ≥44px." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="status-pill"><span className="dot"></span><span>MARKETS OPEN</span></span>
            <span className="cp-badge cp-call">CALL</span>
            <span className="cp-badge cp-put">PUT</span>
            <span className="live-pill"><span className="d"></span>LIVE</span>
            <span className="hero-tag">▲ BULLISH</span>
          </div>
          <div className="seg" style={{ marginTop: 18, marginBottom: 0, maxWidth: 360 }}>
            <span className="seg-pill" style={{ left: 'calc(0% + 3px)' }}></span>
            <button className="on">Overview</button><button>Quant</button><button>Holders</button><button>Verdict</button>
          </div>
        </Card>
        <Card>
          <button className="vw2-cta" style={{ maxWidth: 360 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#1a1206"><path d="M7 5v14l11-7L7 5Z"/></svg>
            Watch &amp; Unlock · 1HR
          </button>
          <div style={{ font: "400 11.5px/1.5 'Inter'", color: 'var(--text-dim)', marginTop: 14 }}>
            앰버 = 프리미엄 전용. 쉬머 스윕 + 골드 글로우는 Value Wall과 언락 CTA에만 허용 — 다른 곳에 쓰면 화폐 가치가 희석된다.
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 56, paddingTop: 18, borderTop: '1px solid var(--border)', font: '500 11px/1.6 var(--f-mono)', color: 'var(--text-muted)' }}>
        SIGNUM HQ DS v2.1 · tokens.css + command-v2.css + screens-v2.css + ds-v21.css + ticker-icons.jsx · 라이브 시안: SIGNUM HQ — App v2.html
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<DSSheet />);
