'use client';

// ============================================================================
// Marketing Template: IG Story — Event Alert (1080×1920)
// /marketing/templates/story/event?type=gex_shift&ticker=NVDA&event=GEX+FLIPPED+NEGATIVE
//   &detail=triggered+dealer+hedging+reversal&spy=-0.45&vix=22.4&dp=52.1
//   &price=925.40&change=-2.8&support=890&resistance=950
//
// GPT-designed premium event alert story card
// EC2 Puppeteer captures this at 1080×1920 viewport
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// ── Event type themes ──
const EVENT_THEMES: Record<string, {
  color: string; borderColor: string; bgGrad: string;
  label: string; icon: string; severity: number;
}> = {
  gex_shift:      { color: '#f87171', borderColor: 'rgba(248,113,113,0.78)', bgGrad: 'rgba(248,113,113,0.14)', label: 'GEX REGIME SHIFT', icon: '⚡', severity: 4 },
  unusual_volume: { color: '#fbbf24', borderColor: 'rgba(251,191,36,0.78)',  bgGrad: 'rgba(251,191,36,0.14)',  label: 'UNUSUAL ACTIVITY', icon: '🔥', severity: 3 },
  whale:          { color: '#a78bfa', borderColor: 'rgba(167,139,250,0.78)', bgGrad: 'rgba(167,139,250,0.14)', label: 'WHALE ACTIVITY',   icon: '🐋', severity: 4 },
  sec_8k:         { color: '#22d3ee', borderColor: 'rgba(34,211,238,0.78)',  bgGrad: 'rgba(34,211,238,0.14)',  label: 'SEC FILING',       icon: '📋', severity: 3 },
  insider_trade:  { color: '#fb923c', borderColor: 'rgba(251,146,60,0.78)',  bgGrad: 'rgba(251,146,60,0.14)',  label: 'INSIDER ACTIVITY', icon: '🏛️', severity: 3 },
  fear_resolution:{ color: '#34d399', borderColor: 'rgba(52,211,153,0.78)',  bgGrad: 'rgba(52,211,153,0.14)',  label: 'STRUCTURE SHIFT',  icon: '🔄', severity: 5 },
};

const VIX_LEVELS = [
  { min: 30, color: '#ef4444', label: 'EXTREME' },
  { min: 25, color: '#f97316', label: 'HIGH' },
  { min: 18, color: '#fbbf24', label: 'ELEVATED' },
  { min: 0,  color: '#34d399', label: 'CALM' },
];

function getVixLevel(vix: number) {
  return VIX_LEVELS.find(l => vix >= l.min) || VIX_LEVELS[3];
}

function EventStoryCard() {
  const searchParams = useSearchParams();
  const eventType  = (searchParams.get('type') || 'gex_shift').toLowerCase();
  const ticker     = searchParams.get('ticker') || 'SPY';
  const eventTitle = searchParams.get('event') || 'GEX FLIPPED NEGATIVE';
  const detail     = searchParams.get('detail') || 'Dealer hedging reversal triggered';
  const spy        = parseFloat(searchParams.get('spy') || '0');
  const vix        = parseFloat(searchParams.get('vix') || '18');
  const dp         = parseFloat(searchParams.get('dp') || '0');
  const price      = searchParams.get('price') || '';
  const change     = parseFloat(searchParams.get('change') || '0');
  const support    = searchParams.get('support') || '';
  const resistance = searchParams.get('resistance') || '';
  const implication = searchParams.get('implication') || 'When structural regime shifts occur, dealer hedging dynamics change. Historical data shows increased realized volatility in subsequent sessions.';

  const theme = EVENT_THEMES[eventType] || EVENT_THEMES.gex_shift;
  const vixLevel = getVixLevel(vix);
  const spyColor = spy > 0 ? '#34d399' : spy < 0 ? '#f87171' : '#94a3b8';
  const changeColor = change >= 0 ? '#34d399' : '#f87171';
  const changeStr = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;

  const etNow = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });

  return (
    <div style={{
      position: 'relative',
      width: '1080px', height: '1920px',
      overflow: 'hidden',
      color: '#f1f5f9',
      fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      isolation: 'isolate',
    }}>
      {/* Background gradient — red-tinted for alert feel */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: -5,
        background: `radial-gradient(circle at 76% 5%, ${theme.bgGrad}, transparent 34%), radial-gradient(circle at 0% 42%, ${theme.bgGrad.replace('0.14', '0.06')}, transparent 36%), linear-gradient(180deg, #05080d 0%, #080c14 20%, #0d1117 48%, #080c14 76%, #05080d 100%)`,
      }} />

      {/* Dot grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: -3, opacity: 0.03,
        backgroundImage: 'radial-gradient(circle, rgba(34,211,238,0.4) 1px, transparent 1.5px)',
        backgroundSize: '24px 24px',
      }} />

      {/* Scanlines */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 80,
        pointerEvents: 'none', opacity: 0.035, mixBlendMode: 'overlay' as any,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.85) 0, rgba(255,255,255,0.85) 1px, transparent 1px, transparent 5px)',
      }} />

      {/* ═══════════════ HEADER ═══════════════ */}
      <div style={{
        position: 'absolute', left: '52px', right: '52px',
        top: '52px', height: '170px', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '25px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/signum-sg-vectorized.svg"
              alt="SIGNUM HQ"
              width={92}
              height={92}
              style={{ display: 'block', flexShrink: 0 }}
            />
            <span style={{
              color: '#f1f5f9', fontSize: '43px', fontWeight: 800,
              letterSpacing: '-0.02em', textShadow: '0 0 18px rgba(255,255,255,0.10)',
            }}>SIGNUM HQ</span>
          </div>

          {/* Alert pill */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '16px',
            height: '86px', padding: '0 30px', borderRadius: '16px',
            border: `2px solid ${theme.borderColor}`,
            background: `radial-gradient(circle at 20% 45%, ${theme.bgGrad}, transparent 36%), rgba(8,12,20,0.78)`,
            color: theme.color, fontSize: '31px', fontWeight: 900,
            letterSpacing: '0.01em', textTransform: 'uppercase' as any,
            boxShadow: `0 0 25px ${theme.color}3d, inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}>
            <span style={{
              width: '30px', height: '30px', borderRadius: '50%',
              background: theme.color,
              boxShadow: `0 0 18px ${theme.color}cc, 0 0 0 10px ${theme.color}1f`,
            }} />
            {theme.icon} STRUCTURE ALERT
          </div>
        </div>
        <div style={{ marginTop: '33px', color: '#64748b', fontSize: '33px', fontWeight: 600, letterSpacing: '-0.03em' }}>
          {etNow} ET
        </div>
      </div>

      {/* ═══════════════ ALERT HERO ═══════════════ */}
      <div style={{
        position: 'absolute', left: '45px', right: '45px',
        top: '228px', height: '405px',
        borderRadius: '16px',
        border: `1px solid rgba(255,255,255,0.18)`,
        background: `linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)), rgba(15,19,24,0.86)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.24), -12px 0 45px ${theme.color}3d`,
        overflow: 'hidden', padding: '47px 66px 42px 66px',
        zIndex: 2,
      }}>
        {/* Left accent bar */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '9px',
          background: theme.color, boxShadow: `0 0 28px ${theme.color}b8`,
        }} />

        <div style={{
          color: theme.color, fontSize: '34px', fontWeight: 900,
          letterSpacing: '0.22em', textTransform: 'uppercase' as any,
          textShadow: `0 0 15px ${theme.color}38`,
        }}>
          {theme.label}
        </div>
        <div style={{
          marginTop: '36px', color: '#f1f5f9',
          fontSize: '72px', lineHeight: 0.92, fontWeight: 900,
          letterSpacing: '-0.065em',
          textShadow: '0 6px 24px rgba(0,0,0,0.35)',
        }}>
          {eventTitle}
        </div>
        <div style={{
          marginTop: '34px', color: '#94a3b8',
          fontSize: '37px', fontWeight: 600, letterSpacing: '-0.04em',
        }}>
          ${ticker} — {detail}
        </div>

        {/* Divider */}
        <div style={{
          position: 'absolute', left: '66px', right: '66px', bottom: '104px',
          height: '1px', background: 'rgba(255,255,255,0.12)',
        }} />

        {/* Severity */}
        <div style={{
          position: 'absolute', left: '66px', right: '66px', bottom: '34px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', gap: '23px' }}>
            {[1, 2, 3, 4, 5].map(i => (
              <span key={i} style={{
                width: '35px', height: '35px', borderRadius: '50%',
                background: i <= theme.severity ? theme.color : 'rgba(100,116,139,0.32)',
                boxShadow: i <= theme.severity ? `0 0 22px ${theme.color}a6` : 'none',
              }} />
            ))}
          </div>
          <div style={{
            color: theme.color, fontSize: '45px', fontWeight: 900,
            letterSpacing: '-0.03em',
          }}>
            {theme.severity >= 4 ? 'HIGH' : theme.severity >= 3 ? 'MEDIUM' : 'LOW'}
          </div>
        </div>
      </div>

      {/* ═══════════════ TICKER CARD ═══════════════ */}
      <div style={{
        position: 'absolute', left: '45px', right: '45px',
        top: '655px', height: '338px',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)), rgba(15,19,24,0.86)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.22)',
        overflow: 'hidden',
        padding: '43px 68px 34px 68px',
        display: 'grid', gridTemplateColumns: '1fr 390px', alignItems: 'center',
        zIndex: 2,
      }}>
        <div>
          <div style={{
            color: '#f1f5f9', fontSize: '92px', lineHeight: 0.86,
            fontWeight: 900, letterSpacing: '-0.065em',
            textShadow: '0 6px 22px rgba(0,0,0,0.35)',
          }}>
            ${ticker}
          </div>
          <div style={{ marginTop: '34px', display: 'flex', alignItems: 'baseline', gap: '45px' }}>
            {price && (
              <span style={{
                color: '#f1f5f9', fontSize: '52px', fontWeight: 700, letterSpacing: '-0.045em',
              }}>${price}</span>
            )}
            <span style={{
              color: changeColor, fontSize: '54px', fontWeight: 900,
              letterSpacing: '-0.055em',
              textShadow: `0 0 20px ${changeColor}38`,
            }}>{changeStr}</span>
          </div>
        </div>

        {/* Candle chart SVG */}
        <div style={{
          height: '200px', borderLeft: '1px solid rgba(255,255,255,0.10)',
          display: 'grid', placeItems: 'center',
        }}>
          <svg viewBox="0 0 320 190" fill="none" width="320" height="190" aria-hidden="true">
            <g strokeWidth="4" strokeLinecap="round">
              {change >= 0 ? (
                <>
                  <line x1="60" y1="110" x2="60" y2="30" stroke="#f87171" />
                  <rect x="43" y="46" width="34" height="50" rx="2" fill="#f87171" />
                  <line x1="126" y1="120" x2="126" y2="40" stroke="#f87171" />
                  <rect x="109" y="52" width="34" height="55" rx="2" fill="#f87171" />
                  <line x1="196" y1="100" x2="196" y2="20" stroke="#34d399" />
                  <rect x="179" y="34" width="34" height="50" rx="2" fill="#34d399" />
                  <line x1="260" y1="90" x2="260" y2="10" stroke="#34d399" />
                  <rect x="243" y="20" width="34" height="56" rx="2" fill="#34d399" />
                </>
              ) : (
                <>
                  <line x1="60" y1="30" x2="60" y2="150" stroke="#34d399" />
                  <rect x="43" y="66" width="34" height="66" rx="2" fill="#34d399" />
                  <line x1="126" y1="16" x2="126" y2="110" stroke="#34d399" />
                  <rect x="109" y="42" width="34" height="60" rx="2" fill="#34d399" />
                  <line x1="196" y1="32" x2="196" y2="151" stroke="#f87171" />
                  <rect x="179" y="64" width="34" height="70" rx="2" fill="#f87171" />
                  <line x1="260" y1="75" x2="260" y2="168" stroke="#f87171" />
                  <rect x="243" y="98" width="34" height="58" rx="2" fill="#f87171" />
                </>
              )}
            </g>
          </svg>
        </div>

        {/* Levels footer */}
        {(support || resistance) && (
          <div style={{
            position: 'absolute', left: '68px', right: '68px', bottom: '38px',
            paddingTop: '27px', borderTop: '1px solid rgba(255,255,255,0.12)',
            color: '#64748b', fontSize: '39px', fontWeight: 700, letterSpacing: '-0.05em',
          }}>
            {resistance && `Call Wall: $${resistance}`}
            {support && resistance && ' \u00a0\u00a0 | \u00a0\u00a0 '}
            {support && `Put Floor: $${support}`}
          </div>
        )}
      </div>

      {/* ═══════════════ MARKET CONTEXT PILLS ═══════════════ */}
      <div style={{
        position: 'absolute', left: '45px', right: '45px',
        top: '1015px', display: 'grid', gap: '16px', zIndex: 2,
      }}>
        {/* SPY */}
        <div style={{
          position: 'relative', height: '92px', borderRadius: '13px',
          border: `2px solid ${spyColor}`,
          display: 'grid', gridTemplateColumns: '125px 1fr', alignItems: 'center',
          padding: '0 48px', overflow: 'hidden',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
        }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.14, background: spyColor, pointerEvents: 'none' }} />
          <div style={{
            width: '76px', height: '76px', borderRadius: '10px',
            border: `2px solid ${spyColor}`, display: 'grid', placeItems: 'center', zIndex: 2,
          }}>
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none"><path d="M9 39h5V28H9v11Zm9 0h5V21h-5v18Zm9 0h5V15h-5v24Zm9 0h5V8h-5v31Z" fill={spyColor} /></svg>
          </div>
          <div style={{ position: 'relative', zIndex: 2, color: '#f1f5f9', fontSize: '43px', fontWeight: 900, letterSpacing: '-0.04em' }}>
            SPY: <span style={{ color: spyColor, marginLeft: '28px' }}>{spy >= 0 ? '+' : ''}{spy.toFixed(2)}%</span>
          </div>
        </div>

        {/* VIX */}
        <div style={{
          position: 'relative', height: '92px', borderRadius: '13px',
          border: `2px solid ${vixLevel.color}`,
          display: 'grid', gridTemplateColumns: '125px 1fr', alignItems: 'center',
          padding: '0 48px', overflow: 'hidden',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
        }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.14, background: vixLevel.color, pointerEvents: 'none' }} />
          <div style={{
            width: '76px', height: '76px', borderRadius: '10px',
            border: `2px solid ${vixLevel.color}`, display: 'grid', placeItems: 'center', zIndex: 2,
          }}>
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke={vixLevel.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 27h10l5-16 10 31 5-15h10" /></svg>
          </div>
          <div style={{ position: 'relative', zIndex: 2, color: '#f1f5f9', fontSize: '43px', fontWeight: 900, letterSpacing: '-0.04em' }}>
            VIX: <span style={{ color: vixLevel.color, marginLeft: '28px' }}>{vix.toFixed(1)} {vixLevel.label}</span>
          </div>
        </div>

        {/* Dark Pool */}
        {dp > 0 && (
          <div style={{
            position: 'relative', height: '92px', borderRadius: '13px',
            border: '2px solid #22d3ee',
            display: 'grid', gridTemplateColumns: '125px 1fr', alignItems: 'center',
            padding: '0 48px', overflow: 'hidden',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
          }}>
            <div style={{ position: 'absolute', inset: 0, opacity: 0.14, background: '#22d3ee', pointerEvents: 'none' }} />
            <div style={{
              width: '76px', height: '76px', borderRadius: '10px',
              border: '2px solid #22d3ee', display: 'grid', placeItems: 'center', zIndex: 2,
            }}>
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none"><path d="M26 6a20 20 0 1 0 20 20H26V6Z" fill="#22d3ee" opacity="0.92" /><path d="M32 6v14h14C44 12 40 8 32 6Z" stroke="#22d3ee" strokeWidth="3" /></svg>
            </div>
            <div style={{ position: 'relative', zIndex: 2, color: '#f1f5f9', fontSize: '43px', fontWeight: 900, letterSpacing: '-0.04em' }}>
              Dark Pool: <span style={{ color: '#22d3ee', marginLeft: '28px' }}>{dp.toFixed(1)}% {dp >= 45 ? 'HIGH' : 'NORMAL'}</span>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════ IMPLICATION ═══════════════ */}
      <div style={{
        position: 'absolute', left: '45px', right: '45px',
        top: dp > 0 ? '1341px' : '1260px', height: '238px',
        borderRadius: '16px',
        border: '2px solid rgba(251,191,36,0.70)',
        background: 'radial-gradient(circle at 0% 40%, rgba(251,191,36,0.11), transparent 28%), linear-gradient(135deg, rgba(251,191,36,0.065), rgba(255,255,255,0.015)), rgba(15,19,24,0.86)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.20), 0 0 25px rgba(251,191,36,0.06)',
        padding: '41px 52px 36px 52px',
        zIndex: 2,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '24px',
          color: '#fbbf24', fontSize: '34px', fontWeight: 900,
          letterSpacing: '0.04em', textTransform: 'uppercase' as any,
        }}>
          <svg width="54" height="54" viewBox="0 0 54 54" fill="none">
            <path d="M27 5 50 46H4L27 5Z" fill="#fbbf24" />
            <path d="M27 18v14" stroke="#080c14" strokeWidth="5" strokeLinecap="round" />
            <circle cx="27" cy="39" r="3" fill="#080c14" />
          </svg>
          STRUCTURAL IMPLICATION
        </div>
        <div style={{
          marginTop: '27px', paddingLeft: '78px',
          color: '#f1f5f9', fontSize: '31px', lineHeight: 1.34,
          fontWeight: 500, letterSpacing: '-0.04em',
        }}>
          {implication}
        </div>
      </div>

      {/* ═══════════════ ACTION ZONE ═══════════════ */}
      {(support || resistance) && (
        <div style={{
          position: 'absolute', left: '45px', right: '45px',
          top: dp > 0 ? '1598px' : '1517px', height: '198px',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)), rgba(15,19,24,0.86)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 54px rgba(0,0,0,0.22)',
          padding: '31px 62px', textAlign: 'center' as any,
          zIndex: 2,
        }}>
          <div style={{ color: '#f1f5f9', fontSize: '43px', fontWeight: 800, letterSpacing: '-0.04em' }}>
            Monitor key levels
          </div>
          <div style={{ height: '1px', margin: '24px 0 28px', background: 'rgba(255,255,255,0.12)' }} />
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1px 1fr',
            alignItems: 'start', gap: '40px',
          }}>
            {support && (
              <div>
                <div style={{ color: '#f87171', fontSize: '34px', fontWeight: 900, letterSpacing: '-0.035em' }}>
                  Support: ${support}
                </div>
                <div style={{ marginTop: '10px', color: '#94a3b8', fontSize: '28px', fontWeight: 700 }}>(Put Floor)</div>
              </div>
            )}
            <div style={{ width: '1px', height: '62px', background: 'rgba(255,255,255,0.18)' }} />
            {resistance && (
              <div>
                <div style={{ color: '#34d399', fontSize: '34px', fontWeight: 900, letterSpacing: '-0.035em' }}>
                  Resistance: ${resistance}
                </div>
                <div style={{ marginTop: '10px', color: '#94a3b8', fontSize: '28px', fontWeight: 700 }}>(Call Wall)</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ FOOTER ═══════════════ */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '1831px',
        textAlign: 'center' as any, zIndex: 2,
      }}>
        <div style={{
          color: '#06b6d4', fontSize: '35px', fontWeight: 800,
          letterSpacing: '-0.03em',
          textShadow: '0 0 18px rgba(6,182,212,0.22)',
        }}>signumhq.com</div>
        <div style={{
          marginTop: '18px', color: '#94a3b8',
          fontSize: '27px', fontWeight: 500, letterSpacing: '-0.03em',
        }}>
          Real-time structure alerts · Not financial advice
        </div>
      </div>
    </div>
  );
}

export default function EventStoryPage() {
  return (
    <Suspense fallback={<div style={{ width: '1080px', height: '1920px', background: '#080c14' }} />}>
      <EventStoryCard />
    </Suspense>
  );
}
