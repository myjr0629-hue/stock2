'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// ── Spotlight Content ──
function SpotlightContent() {
  const sp = useSearchParams();
  const ticker = sp.get('t') || sp.get('ticker') || 'NVDA';
  const company = sp.get('company') || COMPANY_MAP[ticker.toUpperCase()] || '';
  const dp = parseFloat(sp.get('dp') || '0');
  const logoUrl = `https://assets.parqet.com/logos/symbol/${ticker.toUpperCase()}?format=png`;
  const flow = sp.get('flow') || (parseFloat(sp.get('buy') || '0') > parseFloat(sp.get('sell') || '0') ? 'buy' : 'sell');
  const buy = parseFloat(sp.get('buy') || '34');
  const sell = parseFloat(sp.get('sell') || '65');
  const blocks = parseInt(sp.get('blocks') || '0', 10);
  const position = parseFloat(sp.get('position') || '0');
  const date = sp.get('date') || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const sector = sp.get('sector') || SECTOR_MAP[ticker.toUpperCase()] || '';
  const exchange = sp.get('exchange') || 'NASDAQ';

  const dpLevel = dp >= 40 ? 'HIGH' : dp >= 30 ? 'ELEVATED' : 'NORMAL';
  const dpColor = dp >= 40 ? '#22d3ee' : dp >= 30 ? '#fbbf24' : '#34d399';
  const flowLabel = flow === 'buy' ? 'Buy-side dominant' : 'Sell-side dominant';

  return (
    <div style={{
      position: 'relative',
      width: 1200,
      height: 630,
      overflow: 'hidden',
      color: '#f1f5f9',
      fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif",
      background: `
        radial-gradient(circle at 35% 30%, rgba(34,211,238,0.20), transparent 40%),
        radial-gradient(circle at 80% 55%, rgba(167,139,250,0.14), transparent 35%),
        linear-gradient(135deg, #04070d 0%, #060e1a 50%, #04060c 100%)
      `,
    }}>
      {/* ── Grid overlay ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0, opacity: 0.35,
        backgroundImage: `
          linear-gradient(rgba(34,211,238,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(34,211,238,0.05) 1px, transparent 1px)
        `,
        backgroundSize: '40px 40px',
        maskImage: 'radial-gradient(circle at 40% 35%, black 0%, transparent 70%)',
        WebkitMaskImage: 'radial-gradient(circle at 40% 35%, black 0%, transparent 70%)',
      }} />

      {/* ── Scanline overlay ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none', opacity: 0.045,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.8) 0, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 5px)',
        mixBlendMode: 'overlay',
      }} />


      {/* ── Header ── */}
      <div style={{
        position: 'absolute', top: 28, left: 38, right: 38, display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', zIndex: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img
            src="/icons/icon-192x192.png" alt="SIGNUM HQ"
            style={{ width: 42, height: 42, borderRadius: 10, boxShadow: '0 0 16px rgba(34,211,238,0.3)' }}
          />
          <div>
            <div style={{
              fontSize: 22, fontWeight: 900, letterSpacing: '0.08em',
              textShadow: '0 0 14px rgba(241,245,249,0.15)',
            }}>
              <span style={{ color: '#f1f5f9' }}>SIGNUM</span>{' '}
              <span style={{ color: '#22d3ee' }}>HQ</span>
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.35em', color: '#64748b', marginTop: 1 }}>
              SEE WHAT OTHERS CANNOT
            </div>
          </div>
        </div>
        <div style={{
          padding: '7px 18px', borderRadius: 6,
          border: '1px solid rgba(34,211,238,0.45)',
          background: 'rgba(34,211,238,0.06)',
          color: '#22d3ee', fontSize: 13, fontWeight: 800, letterSpacing: '0.35em',
          textShadow: '0 0 12px rgba(34,211,238,0.4)',
        }}>
          TICKER SPOTLIGHT
        </div>
      </div>

      {/* ── Hero: Logo + Ticker (centered) ── */}
      <div style={{
        position: 'absolute', top: 78, left: 0, right: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3,
      }}>
        {/* Logo + Ticker Row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 24,
        }}>
          <div style={{
            position: 'relative', width: 100, height: 100, borderRadius: 22, overflow: 'hidden',
            boxShadow: `
              0 0 0 3px rgba(34,211,238,0.25),
              0 0 40px rgba(34,211,238,0.2),
              0 0 80px rgba(34,211,238,0.08),
              0 10px 40px rgba(0,0,0,0.6)
            `,
          }}>
            <img
              src={logoUrl} alt={ticker}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover',
                filter: 'brightness(0.85) saturate(0.9)',
              }}
            />
            {/* Dark vignette overlay */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 22,
              boxShadow: 'inset 0 0 20px rgba(0,0,0,0.4), inset 0 0 6px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
            }} />
          </div>
          <div style={{
            fontSize: 110, fontWeight: 900, lineHeight: 0.85, letterSpacing: '-0.04em',
            color: '#d4fbff',
            textShadow: `
              0 0 6px rgba(206,249,255,0.6),
              0 0 22px rgba(34,211,238,0.55),
              0 0 60px rgba(34,211,238,0.3)
            `,
          }}>
            ${ticker.toUpperCase()}
          </div>
        </div>
        <div style={{
          fontSize: 18, fontWeight: 700, letterSpacing: '0.3em', color: 'rgba(241,245,249,0.85)',
          marginTop: 12,
        }}>
          {company.toUpperCase()}
        </div>
        {/* Meta row */}
        <div style={{
          display: 'flex', gap: 16, alignItems: 'center', marginTop: 10,
          color: '#64748b', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
        }}>
          <span>{exchange}: {ticker.toUpperCase()}</span>
          <span style={{ width: 1, height: 12, background: 'rgba(148,163,184,0.3)' }} />
          {sector && <><span>Sector: {sector}</span><span style={{ width: 1, height: 12, background: 'rgba(148,163,184,0.3)' }} /></>}
          <span>Updated: {date}</span>
        </div>
      </div>

      {/* ── 3 Metric Cards (bottom section, evenly spaced) ── */}
      <div style={{
        position: 'absolute', bottom: 150, left: 32, right: 32,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, zIndex: 4,
      }}>
        {/* Dark Pool Card */}
        <div style={{
          position: 'relative', padding: '16px 20px', borderRadius: 14, height: 140,
          display: 'flex', flexDirection: 'column',
          border: '1.5px solid rgba(34,211,238,0.22)',
          background: `
            radial-gradient(circle at 80% 30%, rgba(34,211,238,0.08), transparent 40%),
            linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015)),
            rgba(7,14,24,0.8)
          `,
          backdropFilter: 'blur(16px)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 12px 32px rgba(0,0,0,0.3), 0 0 1px rgba(34,211,238,0.15)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', color: '#22d3ee' }}>
              DARK POOL
            </div>
            <div style={{
              padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
              border: `1px solid ${dpColor}40`, background: `${dpColor}10`, color: dpColor,
            }}>
              {dpLevel}
            </div>
          </div>
          <div style={{
            fontSize: 48, fontWeight: 900, letterSpacing: '-0.04em', marginTop: 4,
            color: '#d9fbff',
            textShadow: '0 0 8px rgba(255,255,255,0.2), 0 0 28px rgba(34,211,238,0.3)',
          }}>
            {dp.toFixed(1)}%
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#8191a5', marginTop: 2 }}>
            INSTITUTIONAL CONCENTRATION
          </div>
          {/* Progress bar — in normal flow, not absolute */}
          <div style={{
            marginTop: 'auto', height: 7, borderRadius: 999,
            background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(34,211,238,0.08)',
          }}>
            <div style={{
              width: `${Math.min(dp, 100)}%`, height: '100%', borderRadius: 999,
              background: 'linear-gradient(90deg, #48f1ff, #22d3ee, #0e7490)',
              boxShadow: '0 0 20px rgba(34,211,238,0.6)',
            }} />
          </div>
        </div>

        {/* Flow Card */}
        <div style={{
          position: 'relative', padding: '16px 20px', borderRadius: 14, height: 140,
          border: '1.5px solid rgba(167,139,250,0.22)',
          background: `
            radial-gradient(circle at 80% 30%, rgba(167,139,250,0.08), transparent 40%),
            linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015)),
            rgba(7,14,24,0.8)
          `,
          backdropFilter: 'blur(16px)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 12px 32px rgba(0,0,0,0.3), 0 0 1px rgba(167,139,250,0.15)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', color: '#a78bfa' }}>
            FLOW
          </div>
          <div style={{
            fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', marginTop: 14, color: '#f1f5f9',
          }}>
            {flowLabel}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#8191a5', marginTop: 8 }}>
            BUY / SELL RATIO
          </div>
          <div style={{
            fontSize: 36, fontWeight: 900, letterSpacing: '-0.04em', marginTop: 4,
            color: '#a78bfa',
            textShadow: '0 0 18px rgba(167,139,250,0.3)',
          }}>
            {buy.toFixed(0)}% / {sell.toFixed(0)}%
          </div>
        </div>

        {/* Block Trades Card */}
        <div style={{
          position: 'relative', padding: '16px 20px', borderRadius: 14, height: 140,
          border: '1.5px solid rgba(167,139,250,0.22)',
          background: `
            radial-gradient(circle at 80% 30%, rgba(167,139,250,0.08), transparent 40%),
            linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015)),
            rgba(7,14,24,0.8)
          `,
          backdropFilter: 'blur(16px)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 12px 32px rgba(0,0,0,0.3), 0 0 1px rgba(167,139,250,0.15)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', color: '#a78bfa' }}>
            BLOCK TRADES
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 16 }}>
            <span style={{
              fontSize: 56, fontWeight: 900, letterSpacing: '-0.06em',
              color: '#a78bfa',
              textShadow: '0 0 22px rgba(167,139,250,0.3)',
            }}>
              {blocks}
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>
              detected
            </span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#8191a5', marginTop: 8 }}>
            ≥ $500K NOTIONAL
          </div>
        </div>
      </div>

      {/* ── Distribution / Accumulation Bar ── */}
      <div style={{
        position: 'absolute', bottom: 72, left: 32, right: 32, zIndex: 4,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#f87171', whiteSpace: 'nowrap' }}>
          DISTRIBUTION
        </span>
        <div style={{
          flex: 1, height: 6, borderRadius: 999, position: 'relative',
          background: 'linear-gradient(90deg, #a78bfa, #22d3ee)',
          boxShadow: '0 0 16px rgba(34,211,238,0.2)',
        }}>
          {position > 0 && (
            <div style={{
              position: 'absolute', left: `${Math.min(position, 100)}%`, top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 12, height: 12, borderRadius: '50%',
              background: '#22d3ee', border: '2px solid rgba(255,255,255,0.8)',
              boxShadow: '0 0 14px rgba(34,211,238,0.7)',
            }} />
          )}
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#34d399', whiteSpace: 'nowrap' }}>
          ACCUMULATION
        </span>
      </div>

      {/* ── Footer ── */}
      <div style={{
        position: 'absolute', bottom: 30, left: 38, right: 38, zIndex: 6,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        color: '#475569', fontSize: 11, fontWeight: 600,
      }}>
        <span>Not financial advice. Data-driven context only.</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ color: '#22d3ee', fontWeight: 800, letterSpacing: '0.1em' }}>SIGNUM HQ</span>
          <span style={{ width: 1, height: 14, background: 'rgba(148,163,184,0.2)' }} />
          <span>See What Others Cannot</span>
          <span style={{ width: 1, height: 14, background: 'rgba(148,163,184,0.2)' }} />
          <span style={{ fontWeight: 700 }}>signumhq.com</span>
        </div>
      </div>
    </div>
  );
}

// ── Company & Sector Maps ──
const COMPANY_MAP: Record<string, string> = {
  AAPL: 'Apple Inc.', MSFT: 'Microsoft Corporation', NVDA: 'NVIDIA Corporation',
  GOOGL: 'Alphabet Inc.', AMZN: 'Amazon.com Inc.', META: 'Meta Platforms Inc.',
  TSLA: 'Tesla Inc.', AMD: 'Advanced Micro Devices', NFLX: 'Netflix Inc.',
  CRM: 'Salesforce Inc.', AVGO: 'Broadcom Inc.', ORCL: 'Oracle Corporation',
};

const SECTOR_MAP: Record<string, string> = {
  AAPL: 'Technology', MSFT: 'Technology', NVDA: 'Semiconductors',
  GOOGL: 'Communication', AMZN: 'Consumer Cyclical', META: 'Communication',
  TSLA: 'Consumer Cyclical', AMD: 'Semiconductors', NFLX: 'Communication',
  CRM: 'Technology', AVGO: 'Semiconductors', ORCL: 'Technology',
};

// ── Page Export ──
export default function SpotlightOGPage() {
  return (
    <Suspense fallback={<div style={{ width: 1200, height: 630, background: '#04070d' }} />}>
      <SpotlightContent />
    </Suspense>
  );
}
