'use client';

// ============================================================================
// Marketing Template: IG Story — Market Pulse (1080×1920)
// /marketing/templates/story?spy=1.2&vix=18.6&gex=positive&dp=42.1&type=pulse
//
// GPT-designed premium vertical story card
// EC2 Puppeteer captures this at 1080×1920 viewport
// ============================================================================

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// ── Theme config ──
const GEX_THEMES: Record<string, {
  color: string; borderColor: string; bgGrad: string;
  label: string; desc: string; pct: number;
}> = {
  positive:   { color: '#34d399', borderColor: 'rgba(52,211,153,0.35)', bgGrad: 'rgba(52,211,153,0.14)', label: 'POSITIVE',   desc: 'Dealer hedging absorbs volatility', pct: 78 },
  negative:   { color: '#f87171', borderColor: 'rgba(248,113,113,0.35)', bgGrad: 'rgba(248,113,113,0.14)', label: 'NEGATIVE',   desc: 'Dealer hedging amplifies moves', pct: 22 },
  neutral:    { color: '#94a3b8', borderColor: 'rgba(148,163,184,0.35)', bgGrad: 'rgba(148,163,184,0.14)', label: 'NEUTRAL',    desc: 'No directional dealer conviction', pct: 50 },
  transition: { color: '#fbbf24', borderColor: 'rgba(251,191,36,0.35)',  bgGrad: 'rgba(251,191,36,0.14)',  label: 'TRANSITION', desc: 'Regime shifting — trend acceleration likely', pct: 55 },
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

function StoryCard() {
  const searchParams = useSearchParams();
  const spy     = parseFloat(searchParams.get('spy') || '0');
  const vix     = parseFloat(searchParams.get('vix') || '18');
  const gex     = (searchParams.get('gex') || 'positive').toLowerCase();
  const dp      = parseFloat(searchParams.get('dp') || '0');
  const date    = searchParams.get('date') || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const insight = searchParams.get('insight') || 'Dealers expected to dampen volatility today.';

  const gexTheme = GEX_THEMES[gex] || GEX_THEMES.neutral;
  const vixLevel = getVixLevel(vix);
  const spyColor = spy > 0 ? '#34d399' : spy < 0 ? '#f87171' : '#94a3b8';
  const dpColor  = '#22d3ee';

  // Sparkline paths based on direction
  const spySparkUp = 'M2 78 28 62 51 66 76 46 98 54 122 30 149 38 174 23 200 30 226 16 252 21 281 10 313 5';
  const spySparkDn = 'M2 5 28 21 51 16 76 30 98 23 122 38 149 30 174 54 200 46 226 66 252 62 281 72 313 78';
  const spySparkPath = spy >= 0 ? spySparkUp : spySparkDn;

  return (
    <div style={{
      position: 'relative',
      width: '1080px', height: '1920px',
      overflow: 'hidden',
      color: '#f1f5f9',
      background: 'linear-gradient(180deg, #05080d 0%, #080c14 18%, #0d1117 45%, #080c14 73%, #05080d 100%)',
      fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif",
      isolation: 'isolate',
    }}>
      {/* Dot grid background */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        opacity: 0.03,
        backgroundImage: 'radial-gradient(circle, rgba(34,211,238,0.4) 1px, transparent 1.5px)',
        backgroundSize: '24px 24px',
      }} />

      {/* Scanline overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 80,
        pointerEvents: 'none', opacity: 0.035, mixBlendMode: 'overlay' as any,
        background: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.85) 0, rgba(255,255,255,0.85) 1px, transparent 1px, transparent 5px)',
      }} />

      {/* ═══════════════ HEADER ═══════════════ */}
      <div style={{
        position: 'absolute', left: '56px', right: '56px',
        top: '50px', height: '210px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '30px' }}>
            {/* Logo — same SVG used in site navbar */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/signum-sg-vectorized.svg"
              alt="SIGNUM HQ"
              width={104}
              height={104}
              style={{ display: 'block', flexShrink: 0 }}
            />
            <span style={{
              color: '#f1f5f9', fontSize: '46px', fontWeight: 800,
              letterSpacing: '-0.02em', textShadow: '0 0 18px rgba(255,255,255,0.10)',
            }}>SIGNUM HQ</span>
          </div>
          {/* Pulse badge */}
          <div style={{
            height: '70px', display: 'flex', alignItems: 'center', gap: '16px',
            padding: '0 30px', borderRadius: '999px',
            border: '2px solid rgba(34,211,238,0.75)',
            background: 'rgba(8,12,20,0.76)',
            color: '#22d3ee', fontSize: '30px', fontWeight: 800, letterSpacing: '0.02em',
            boxShadow: '0 0 22px rgba(34,211,238,0.11)',
          }}>
            <span style={{
              width: '17px', height: '17px', borderRadius: '50%',
              background: '#22d3ee',
              boxShadow: '0 0 18px rgba(34,211,238,0.75), 0 0 0 8px rgba(34,211,238,0.08)',
            }} />
            MARKET PULSE
          </div>
        </div>
        <div style={{ marginTop: '34px', color: '#64748b', fontSize: '34px', fontWeight: 500, letterSpacing: '-0.02em' }}>
          {date}
        </div>
      </div>

      {/* ═══════════════ GEX HERO ═══════════════ */}
      <div style={{
        position: 'absolute', left: '52px', right: '52px',
        top: '285px', height: '455px',
        borderRadius: '21px',
        border: `1px solid ${gexTheme.borderColor}`,
        background: `radial-gradient(circle at 36% 36%, ${gexTheme.bgGrad}, transparent 48%), linear-gradient(135deg, ${gexTheme.bgGrad}, rgba(255,255,255,0.018)), rgba(15,19,24,0.82)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 20px 65px rgba(0,0,0,0.28), 0 0 30px ${gexTheme.bgGrad}`,
        overflow: 'hidden', padding: '43px 58px',
        zIndex: 2,
      }}>
        {/* Left accent bar */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '7px',
          background: gexTheme.color,
          boxShadow: `0 0 26px ${gexTheme.color}99`,
        }} />

        <div style={{ color: '#94a3b8', fontSize: '30px', fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase' as any }}>
          GEX REGIME
        </div>
        <div style={{
          marginTop: '31px', color: gexTheme.color,
          fontSize: '122px', fontWeight: 900, letterSpacing: '-0.072em', lineHeight: 0.88,
          textShadow: `0 0 35px ${gexTheme.color}6b`,
        }}>
          {gexTheme.label}
        </div>
        <div style={{ marginTop: '35px', color: '#94a3b8', fontSize: '34px', fontWeight: 500, letterSpacing: '-0.03em' }}>
          {gexTheme.desc}
        </div>

        {/* Gauge bar */}
        <div style={{ position: 'absolute', left: '60px', right: '60px', bottom: '43px' }}>
          <div style={{
            position: 'relative', height: '35px', borderRadius: '999px',
            background: 'linear-gradient(90deg, #ef4444 0%, #fb923c 26%, #fbbf24 50%, #84cc16 70%, #34d399 100%)',
            boxShadow: '0 0 24px rgba(52,211,153,0.20), inset 0 2px 4px rgba(255,255,255,0.16)',
          }}>
            <span style={{
              position: 'absolute', left: `${gexTheme.pct}%`, top: '50%',
              width: '29px', height: '29px', background: '#f1f5f9',
              transform: 'translate(-50%, -50%) rotate(45deg)',
              borderRadius: '4px',
              boxShadow: '0 0 16px rgba(255,255,255,0.38), 0 4px 10px rgba(0,0,0,0.35)',
            }} />
          </div>
          <div style={{
            marginTop: '26px', display: 'flex', justifyContent: 'space-between',
            fontSize: '27px', fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' as any,
          }}>
            <span style={{ color: '#f87171' }}>NEGATIVE</span>
            <span style={{ color: '#34d399' }}>POSITIVE</span>
          </div>
        </div>
      </div>

      {/* ═══════════════ METRIC CARDS ═══════════════ */}
      <div style={{
        position: 'absolute', left: '52px', right: '52px',
        top: '773px',
        display: 'flex', flexDirection: 'column', gap: '21px',
        zIndex: 2,
      }}>
        {/* S&P 500 */}
        <MetricCard
          accentColor={spyColor}
          label="S&P 500"
          value={`${spy >= 0 ? '+' : ''}${spy.toFixed(2)}%`}
          icon={
            <svg width="74" height="74" viewBox="0 0 74 74" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
              <path d={spy >= 0 ? "M12 52 31 33 43 44 62 21" : "M12 21 31 44 43 33 62 52"} />
              <path d={spy >= 0 ? "M47 21h15v15" : "M47 52h15v-15"} />
            </svg>
          }
          sparkPath={spySparkPath}
        />

        {/* Dark Pool */}
        <MetricCard
          accentColor={dpColor}
          label="DARK POOL ACTIVITY"
          value={dp > 0 ? `${dp.toFixed(1)}%` : '—'}
          badge="INSTITUTIONAL"
          icon={
            <svg width="74" height="74" viewBox="0 0 74 74" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 48a23 23 0 1 1 46 0" />
              <path d="M21 48h-7M60 48h-7M22 31l-5-5M52 31l5-5M37 25v-8" />
              <path d="M37 48 48 33" />
              <circle cx="37" cy="48" r="5" fill="currentColor" stroke="none" />
            </svg>
          }
          sparkPath="M0 70 C26 68 30 55 48 58 C68 62 67 24 88 20 C112 15 111 54 132 50 C156 46 152 32 178 35 C204 38 201 61 226 59 C250 57 252 43 278 46 C297 48 303 54 315 51"
        />

        {/* VIX */}
        <MetricCard
          accentColor={vixLevel.color}
          label="VIX FEAR INDEX"
          value={vix.toFixed(1)}
          calmBadge={vixLevel.label}
          calmColor={vixLevel.color}
          icon={
            <svg width="74" height="74" viewBox="0 0 74 74" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 38h13l6-20 13 39 7-19h15" />
            </svg>
          }
          sparkPath="M0 60 C24 48 36 70 55 56 C77 40 82 24 105 31 C130 38 123 61 151 53 C179 46 184 28 210 31 C236 34 243 47 266 46 C286 45 300 56 315 50"
        />
      </div>

      {/* ═══════════════ INSIGHT ═══════════════ */}
      <div style={{
        position: 'absolute', left: '52px', right: '52px',
        top: '1419px', height: '227px',
        borderRadius: '18px',
        border: '1px solid rgba(167,139,250,0.38)',
        borderTop: '2px dashed rgba(167,139,250,0.80)',
        background: 'radial-gradient(circle at 2% 50%, rgba(167,139,250,0.14), transparent 40%), linear-gradient(135deg, rgba(167,139,250,0.07), rgba(255,255,255,0.016)), rgba(15,19,24,0.82)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 50px rgba(0,0,0,0.22), 0 0 28px rgba(167,139,250,0.06)',
        display: 'flex', alignItems: 'center',
        padding: '0 54px', gap: '32px',
        zIndex: 2,
      }}>
        {/* Lightbulb icon */}
        <svg width="112" height="112" viewBox="0 0 112 112" fill="none" stroke="#a78bfa" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, filter: 'drop-shadow(0 0 18px rgba(167,139,250,0.42))' }}>
          <path d="M56 20c-21 0-35 16-35 34 0 13 7 23 18 30v9h34v-9c11-7 18-17 18-30 0-18-14-34-35-34Z" />
          <path d="M43 103h26M47 93h18" />
          <path d="M56 5v8M22 17l7 7M90 17l-7 7M8 55h10M94 55h10" />
        </svg>
        <div>
          <div style={{ color: '#a78bfa', fontSize: '29px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as any }}>
            STRUCTURE INSIGHT
          </div>
          <div style={{
            marginTop: '24px', maxWidth: '710px',
            color: '#e2e8f0', fontSize: '40px', fontWeight: 500, lineHeight: 1.32, letterSpacing: '-0.045em',
          }}>
            {insight}
          </div>
        </div>
      </div>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '1712px',
        textAlign: 'center' as any, zIndex: 2,
      }}>
        <div style={{
          color: '#06b6d4', fontSize: '49px', fontWeight: 800,
          letterSpacing: '-0.035em', textShadow: '0 0 22px rgba(6,182,212,0.24)',
        }}>
          signumhq.com
        </div>
        <div style={{ marginTop: '34px', color: '#64748b', fontSize: '32px', fontWeight: 500, letterSpacing: '-0.03em' }}>
          See What Others Can&apos;t
        </div>
        <div style={{ marginTop: '36px', color: 'rgba(241,245,249,0.40)', fontSize: '33px', fontWeight: 300 }}>
          △
        </div>
      </div>
    </div>
  );
}

// ── Reusable Metric Card ──
function MetricCard({ accentColor, label, value, badge, calmBadge, calmColor, icon, sparkPath }: {
  accentColor: string;
  label: string;
  value: string;
  badge?: string;
  calmBadge?: string;
  calmColor?: string;
  icon: React.ReactNode;
  sparkPath: string;
}) {
  return (
    <div style={{
      position: 'relative', height: '193px', borderRadius: '16px',
      border: '1px solid rgba(255,255,255,0.11)',
      background: 'linear-gradient(135deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015)), rgba(15,19,24,0.84)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 15px 44px rgba(0,0,0,0.24)',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center',
      padding: '0 34px 0 42px',
      color: accentColor,
    }}>
      {/* Left accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: '6px',
        background: accentColor,
        boxShadow: `0 0 20px ${accentColor}`,
      }} />

      {/* Icon circle */}
      <div style={{
        width: '132px', height: '132px', borderRadius: '50%',
        border: `2px solid ${accentColor}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.015)',
        boxShadow: `0 0 18px ${accentColor}40`,
        flexShrink: 0,
      }}>
        {icon}
      </div>

      {/* Label + Value */}
      <div style={{ marginLeft: '26px', flex: 1 }}>
        <div style={{ color: '#94a3b8', fontSize: '30px', fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase' as any }}>
          {label}
        </div>
        <div style={{
          marginTop: '18px', color: accentColor,
          fontSize: '72px', fontWeight: 900, letterSpacing: '-0.065em', lineHeight: 0.92,
          textShadow: `0 0 24px ${accentColor}47`,
          display: 'flex', alignItems: 'center',
        }}>
          {value}
          {badge && (
            <span style={{
              marginLeft: '21px', padding: '14px 24px', borderRadius: '13px',
              border: `2px solid ${accentColor}`,
              fontSize: '21px', fontWeight: 800, letterSpacing: '0.06em',
              transform: 'translateY(-7px)',
            }}>{badge}</span>
          )}
          {calmBadge && (
            <span style={{
              marginLeft: '24px', padding: '15px 28px', borderRadius: '13px',
              border: `2px solid ${calmColor || accentColor}99`,
              background: `${calmColor || accentColor}14`,
              color: calmColor || accentColor,
              fontSize: '26px', fontWeight: 800, letterSpacing: '0.08em',
              transform: 'translateY(-8px)',
            }}>{calmBadge}</span>
          )}
        </div>
      </div>

      {/* Sparkline */}
      <svg width="315" height="92" viewBox="0 0 315 92" fill="none" style={{ opacity: 0.34, flexShrink: 0 }}>
        <path d={sparkPath} stroke={accentColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d={`${sparkPath}V92H2Z`} fill={accentColor} opacity="0.12" />
      </svg>
    </div>
  );
}

export default function StoryTemplatePage() {
  return (
    <>
      {/* Font loaded via Google Fonts link */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        body { margin: 0 !important; padding: 0 !important; background: #02040a !important; display: flex !important; align-items: center !important; justify-content: center !important; min-height: 100vh !important; }
      `}</style>
      <Suspense fallback={<div style={{color:'#fff'}}>Loading...</div>}>
        <StoryCard />
      </Suspense>
    </>
  );
}
