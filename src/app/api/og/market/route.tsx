// ============================================================================
// /api/og/market — Premium OG Image (Glassmorphism Design)
// Dynamic social sharing image with ticker symbols, 3-language support
// 1200×630 standard OG format
// ============================================================================

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// ---------------------------------------------------------------------------
// Design System
// ---------------------------------------------------------------------------
const C = {
  // Base
  bgDark:    '#050a14',
  bgDeep:    '#0a1628',
  // Glass
  glass:     'rgba(255,255,255,0.06)',
  glassBorder: 'rgba(255,255,255,0.12)',
  glassHigh: 'rgba(255,255,255,0.10)',
  // Accent gradients
  cyan:      '#22d3ee',
  cyanDim:   '#06b6d4',
  purple:    '#a78bfa',
  purpleDim: '#7c3aed',
  amber:     '#fbbf24',
  amberDim:  '#f59e0b',
  // Semantic
  green:     '#34d399',
  greenGlow: 'rgba(52,211,153,0.25)',
  red:       '#f87171',
  redGlow:   'rgba(248,113,113,0.25)',
  // Text
  white:     '#f8fafc',
  muted:     '#94a3b8',
  dim:       '#475569',
};

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const L: Record<string, Record<string, string>> = {
  en: {
    pulse: 'MARKET PULSE', event: 'STRUCTURAL ALERT', education: 'MARKET INSIGHT',
    morning: 'PRE-MARKET BRIEF', weekly: 'WEEKLY STRUCTURE',
    sub: 'Options • Dark Pool • Institutional Flow',
    gex: 'GEX REGIME', vixLabel: 'VOLATILITY',
    positive: 'POSITIVE', negative: 'NEGATIVE', neutral: 'NEUTRAL', transition: 'TRANSITION',
    spySub: 'S&P 500', qqqSub: 'NASDAQ 100', tagline: 'See What Others Can\'t',
  },
  ko: {
    pulse: '마켓 펄스', event: '구조적 알림', education: '마켓 인사이트',
    morning: '장전 브리핑', weekly: '주간 구조 분석',
    sub: '옵션 · 다크풀 · 기관 플로우 통합 분석',
    gex: 'GEX 레짐', vixLabel: '변동성',
    positive: '포지티브', negative: '네거티브', neutral: '뉴트럴', transition: '트랜지션',
    spySub: 'S&P 500', qqqSub: 'NASDAQ 100', tagline: '시장의 이면을 읽다',
  },
  ja: {
    pulse: 'マーケットパルス', event: '構造アラート', education: 'マーケットインサイト',
    morning: 'プレマーケットブリーフ', weekly: '週間構造分析',
    sub: 'オプション・ダークプール・機関フロー統合分析',
    gex: 'GEXレジーム', vixLabel: 'ボラティリティ',
    positive: 'ポジティブ', negative: 'ネガティブ', neutral: 'ニュートラル', transition: 'トランジション',
    spySub: 'S&P 500', qqqSub: 'NASDAQ 100', tagline: '市場の深層を読む',
  },
};

function changeColor(v: number) { return v > 0 ? C.green : v < 0 ? C.red : C.muted; }
function changeGlow(v: number) { return v > 0 ? C.greenGlow : v < 0 ? C.redGlow : 'transparent'; }
function fmt(v: number) { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }

function gexGradient(gex: string) {
  const g = gex.toLowerCase();
  if (g === 'positive') return { from: '#059669', to: '#34d399', glow: 'rgba(52,211,153,0.3)' };
  if (g === 'negative') return { from: '#dc2626', to: '#f87171', glow: 'rgba(248,113,113,0.3)' };
  if (g === 'transition') return { from: '#d97706', to: '#fbbf24', glow: 'rgba(251,191,36,0.3)' };
  return { from: '#4b5563', to: '#9ca3af', glow: 'rgba(156,163,175,0.2)' };
}

function vixLevel(v: number) {
  if (v >= 30) return { color: C.red, label: 'EXTREME' };
  if (v >= 25) return { color: '#f97316', label: 'HIGH' };
  if (v >= 18) return { color: C.amber, label: 'ELEVATED' };
  return { color: C.green, label: 'LOW' };
}

// ---------------------------------------------------------------------------
// GET Handler
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const type   = searchParams.get('type') || 'pulse';
  const lang   = (searchParams.get('lang') || 'en') as 'en' | 'ko' | 'ja';
  const spy    = parseFloat(searchParams.get('spy') || '0');
  const qqq    = parseFloat(searchParams.get('qqq') || '0');
  const vix    = parseFloat(searchParams.get('vix') || '0');
  const gex    = searchParams.get('gex') || 'neutral';
  const ticker = searchParams.get('ticker') || '';
  const event  = decodeURIComponent(searchParams.get('event') || '');
  const date   = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const l = L[lang] || L.en;
  const title = l[type] || l.pulse;
  const gexStyle = gexGradient(gex);
  const gexLabel = l[gex.toLowerCase() as keyof typeof l] || gex.toUpperCase();
  const vl = vixLevel(vix);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: C.bgDark,
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Background: gradient mesh */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
          background: `radial-gradient(ellipse 80% 50% at 20% 40%, rgba(99,102,241,0.15) 0%, transparent 60%),
                       radial-gradient(ellipse 60% 40% at 80% 60%, ${gexStyle.glow} 0%, transparent 50%),
                       radial-gradient(ellipse 40% 30% at 50% 90%, rgba(6,182,212,0.1) 0%, transparent 50%)`,
        }} />
        
        {/* Grid lines overlay */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
          backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '36px 44px', flex: 1, position: 'relative' }}>
          
          {/* Top bar: Logo + Title + GEX Badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {/* Logo mark */}
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${C.purpleDim}, ${C.cyanDim})`,
                boxShadow: `0 0 30px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.2)`,
              }}>
                <span style={{ fontSize: '28px', fontWeight: 900, color: 'white', letterSpacing: '-1px' }}>S</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '26px', fontWeight: 800, color: C.white, letterSpacing: '1px' }}>
                    {title}
                  </span>
                  {ticker && (
                    <span style={{
                      fontSize: '20px', fontWeight: 700, color: C.cyan,
                      padding: '2px 12px', borderRadius: '8px',
                      background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)',
                    }}>
                      ${ticker}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '13px', color: C.muted, letterSpacing: '0.5px' }}>
                  {l.sub} · {date}
                </span>
              </div>
            </div>

            {/* GEX Badge — glassmorphism */}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              padding: '10px 24px', borderRadius: '16px',
              background: `linear-gradient(135deg, ${gexStyle.from}22, ${gexStyle.to}11)`,
              border: `1px solid ${gexStyle.to}44`,
              boxShadow: `0 0 20px ${gexStyle.glow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
            }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: C.muted, letterSpacing: '2px' }}>
                {l.gex}
              </span>
              <span style={{
                fontSize: '22px', fontWeight: 800, letterSpacing: '1px',
                background: `linear-gradient(135deg, ${gexStyle.from}, ${gexStyle.to})`,
                backgroundClip: 'text',
                color: 'transparent',
              }}>
                {gexLabel}
              </span>
            </div>
          </div>

          {/* Main data row: SPY | QQQ | VIX */}
          <div style={{ display: 'flex', flex: 1, gap: '16px' }}>
            
            {/* SPY Card */}
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              borderRadius: '20px', padding: '24px',
              background: C.glass,
              border: `1px solid ${C.glassBorder}`,
              boxShadow: `0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 40px ${changeGlow(spy)}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: changeColor(spy),
                  boxShadow: `0 0 6px ${changeColor(spy)}`,
                }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: C.muted, letterSpacing: '3px' }}>SPY</span>
              </div>
              <span style={{
                fontSize: '56px', fontWeight: 900, color: changeColor(spy),
                textShadow: `0 0 30px ${changeGlow(spy)}`,
                lineHeight: 1,
              }}>
                {fmt(spy)}
              </span>
              <span style={{ fontSize: '12px', color: C.dim, marginTop: '10px', letterSpacing: '1px' }}>
                {l.spySub}
              </span>
            </div>

            {/* QQQ Card */}
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              borderRadius: '20px', padding: '24px',
              background: C.glass,
              border: `1px solid ${C.glassBorder}`,
              boxShadow: `0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 40px ${changeGlow(qqq)}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: changeColor(qqq),
                  boxShadow: `0 0 6px ${changeColor(qqq)}`,
                }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: C.muted, letterSpacing: '3px' }}>QQQ</span>
              </div>
              <span style={{
                fontSize: '56px', fontWeight: 900, color: changeColor(qqq),
                textShadow: `0 0 30px ${changeGlow(qqq)}`,
                lineHeight: 1,
              }}>
                {fmt(qqq)}
              </span>
              <span style={{ fontSize: '12px', color: C.dim, marginTop: '10px', letterSpacing: '1px' }}>
                {l.qqqSub}
              </span>
            </div>

            {/* VIX Card */}
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              borderRadius: '20px', padding: '24px',
              background: C.glass,
              border: `1px solid ${C.glassBorder}`,
              boxShadow: `0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: vl.color,
                  boxShadow: `0 0 6px ${vl.color}`,
                }} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: C.muted, letterSpacing: '3px' }}>VIX</span>
              </div>
              <span style={{
                fontSize: '56px', fontWeight: 900, color: vl.color,
                lineHeight: 1,
              }}>
                {vix.toFixed(1)}
              </span>
              <span style={{
                fontSize: '11px', fontWeight: 700, color: vl.color, marginTop: '10px',
                padding: '2px 10px', borderRadius: '6px',
                background: `${vl.color}18`, border: `1px solid ${vl.color}33`,
                letterSpacing: '2px',
              }}>
                {vl.label}
              </span>
            </div>
          </div>

          {/* Event banner */}
          {type === 'event' && event && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginTop: '14px', padding: '10px 24px', borderRadius: '12px',
              background: 'linear-gradient(90deg, rgba(168,85,247,0.12), rgba(34,211,238,0.12))',
              border: '1px solid rgba(168,85,247,0.25)',
            }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: C.white }}>
                {event}
              </span>
            </div>
          )}

          {/* Footer */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: '16px', paddingTop: '14px',
            borderTop: `1px solid ${C.glassBorder}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                fontSize: '16px', fontWeight: 800, letterSpacing: '2px',
                background: `linear-gradient(135deg, ${C.purple}, ${C.cyan})`,
                backgroundClip: 'text',
                color: 'transparent',
              }}>
                SIGNUM HQ
              </span>
              <span style={{ fontSize: '12px', color: C.dim }}>|</span>
              <span style={{ fontSize: '12px', color: C.dim, letterSpacing: '0.5px' }}>
                {l.tagline}
              </span>
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: C.dim, letterSpacing: '0.5px' }}>
              signumhq.com
            </span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
