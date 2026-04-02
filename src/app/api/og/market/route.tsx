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
  // Text (minimum slate-300 for readability)
  white:     '#f8fafc',
  muted:     '#cbd5e1',
  dim:       '#94a3b8',
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
              {/* Logo — actual SIGNUM HQ SG symbol */}
              <div style={{
                width: '52px', height: '52px', borderRadius: '14px', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${C.purpleDim}, ${C.cyanDim})`,
                boxShadow: `0 0 30px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.2)`,
                padding: '6px',
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4NCjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2aWV3Qm94PSIyNDYgMjQ3IDUzMCA1MzAiIHdpZHRoPSI1MTIiIGhlaWdodD0iNTEyIj4NCiAgPCEtLSBTSUdOVU0gSFEgLSBTRyBJY29uIChWZWN0b3IsIFRyYW5zcGFyZW50IEJHIC8gRGFyayBCYWNrZ3JvdW5kIFVzZSkgLS0+DQoNCiAgPCEtLSBVcHBlciBTIHBvcnRpb24gd2l0aCBFQ0cgaGVhcnRiZWF0IC0tPg0KICA8cGF0aCBkPSJNIDI2Ni4wOTUsNDcwLjE0NCBDIDI2Ny43MTUsNDM0LjYwMyAyNzMuMDkxLDM4Mi4zNjQgMjc2LjUzNywzNjguNjg0IEMgMjgxLjE0OCwzNTAuMzgxIDI4OS40MTgsMzMxLjcxMSAyOTguNzY2LDMxOC41MDAgQyAzMTAuMjY2LDMwMi4yNDggMzI3LjA1OSwyODguMzQyIDM0Ni41MDAsMjc4Ljk3MyBDIDM3MC42MDEsMjY3LjM1OCAzODQuNDUxLDI2NC40MjcgNDM0LjUwMCwyNjAuMzUyIEMgNDYxLjEyOCwyNTguMTg0IDU1Mi43NDEsMjU3Ljg0NiA1ODAuNTAwLDI1OS44MTQgQyA2MTguODk1LDI2Mi41MzYgNjQzLjU5MiwyNjYuMDk5IDY1OSwyNzEuMTM4IEMgNjY4Ljk1OSwyNzQuMzk1IDY4NC43MzksMjgyLjA5NCA2OTMuNTU3LDI4Ny45OTcgQyA3MDMuNTc4LDI5NC43MDYgNzIwLjE1MiwzMTEuMjA2IDcyNi43MDUsMzIxIEMgNzMxLjY2MiwzMjguNDA4IDczOC4wNzksMzQwLjM4MSA3MzkuNDM2LDM0NC43NTAgQyA3MzkuNjY5LDM0NS41MDAgNzM5LjkwMiwzNDYuMjUwIDc0MC4xMzUsMzQ3IEMgNzA2LjgxNSwzNDcgNjczLjQ5MywzNDcgNjQwLjE3MywzNDcgQyA1ODAuMjU4LDM0NyA1MzYuMDYzLDM0Ny40MDYgNTI5Ljg1NiwzNDguMDEyIEMgNDkxLjEzNiwzNTEuNzk0IDQ2My4xMDgsMzY1Ljg1MiA0NTIuNTk3LDM4Ni43NjUgQyA0NDguMTE2LDM5NS42ODEgNDQ2LjY3Niw0MDMuMjI0IDQ0Ny4zMDMsNDE0LjUwMCBDIDQ0OC41MjAsNDM2LjM5MSA0NTYuMjUzLDQ1Mi42MjIgNDc0Ljk1Myw0NzIuNTM3IEMgNDc5LjEwNCw0NzYuOTU4IDQ4My4wMjIsNDgxLjQ1OCA0ODMuNjYwLDQ4Mi41MzcgQyA0ODQuNjc1LDQ4NC4yNTUgNDg2LjIwNCw0ODEuNjMxIDQ5NS45MTUsNDYxLjUwMCBDIDUwOS44NTYsNDMyLjYwMCA1MTAuMjI4LDQzMS45MjEgNTEzLjQ3MSw0MjkuNTAwIEMgNTE5LjEwOCw0MjUuMjkyIDUyOS4yOTEsNDI3Ljc5MyA1MzIuNjAzLDQzNC4xOTkgQyA1MzMuNDI4LDQzNS43OTUgNTQxLjc0NCw0NjAuMTQwIDU1MS4wODMsNDg4LjMwMCBDIDU2MC40MjIsNTE2LjQ2MCA1NjkuMDc0LDU0MS40MTkgNTcwLjMxMCw1NDMuNzY2IEMgNTcxLjA1OSw1NDUuMTg4IDU3MS44MDgsNTQ2LjYxMSA1NzIuNTU3LDU0OC4wMzMgQyA1NzMuNjIyLDU0Ni4yNzYgNTc0LjY4OCw1NDQuNTE4IDU3NS43NTMsNTQyLjc2MSBDIDU3Ny41MTAsNTM5Ljg2MSA1ODIuMjIyLDUzMS4yMjMgNTg2LjIyNCw1MjMuNTY1IEMgNTkwLjQwNyw1MTUuNTYwIDU5NC42MjEsNTA4LjgyMSA1OTYuMTM2LDUwNy43MTEgQyA2MDUuMjYzLDUwMS4wMjQgNjE4LjgzNyw1MDcuODI0IDYxNy42NzQsNTE4LjUwMCBDIDYxNy4yNjMsNTIyLjI3MCA2MTAuNjY2LDUzNy4wMDIgNTkxLjcwMyw1NzYuNTAwIEMgNTgwLjg3Myw1OTkuMDU3IDU4MC4wMTksNjAwLjM3NSA1NzQuOTA2LDYwMi40MjEgQyA1NjkuMTE5LDYwNC43MzcgNTYzLjgxNCw2MDMuNzUzIDU1OS42ODQsNTk5LjU5OSBDIDU1Ni45MzAsNTk2LjgyOSA1NTQuNzYxLDU5MS4xMzIgNTQzLjYzNiw1NTcuNDQ4IEMgNTI1LjA3Niw1MDEuMjU0IDUyNC45NTQsNTAxIDUxNi4xNzksNTAxIEMgNTA5LjkyNiw1MDEgNTA3Ljc0MSw1MDMuODAyIDQ5Ny4xNTUsNTI1LjQwMSBDIDQ4Ni42NDAsNTQ2Ljg1NSA0ODUuMTEwLDU0OC41MDAgNDc1LjY3Myw1NDguNTAwIEMgNDcwLjI4Myw1NDguNTAwIDQ2OS42MDMsNTQ4LjIzNiA0NjYuNjE1LDU0NC45NzUgQyA0NjQuODM4LDU0My4wMzYgNDYxLjE2MCw1MzYuMjg3IDQ1OC40NDIsNTI5Ljk3NyBDIDQ1MC4yNTEsNTEwLjk2MiA0NDguOTI0LDUwOC43MDcgNDQ0LjcwNyw1MDYuNjQ3IEMgNDQyLjA3NSw1MDUuMzYxIDQzOS44NjQsNTA0Ljk5MSA0MzcuNDg2LDUwNS40MzcgQyA0MzEuNDA3LDUwNi41NzcgNDI4LjgwMSw1MDkuODk1IDQyMi42MDAsNTI0LjM5NCBDIDQxNi4yNDQsNTM5LjI1NiA0MTIuNDg3LDU0My45MzggNDA1LjMyMSw1NDUuOTI4IEMgNDAyLjgwMiw1NDYuNjI4IDM3OC40NjUsNTQ2Ljk5MCAzMzMuODc1LDU0Ni45OTQgQyAzMTEuMzMzLDU0Ni45OTYgMjg4Ljc5Miw1NDYuOTk4IDI2Ni4yNTAsNTQ3IEMgMjY2LjA0Miw1NDUuOTU4IDI2NS44MzMsNTQ0LjkxNyAyNjUuNjI1LDU0My44NzUgQyAyNjQuNzk1LDUzOS43MjYgMjY1LjA5OSw0OTEuOTg5IDI2Ni4wOTUsNDcwLjE0NCBaIiBmaWxsPSJ3aGl0ZSIgc3Ryb2tlPSJub25lIi8+DQoNCiAgPCEtLSBMb3dlciBTIHBvcnRpb24gLS0+DQogIDxwYXRoIGQ9Ik0gNDM2LjEwOSw2MjguNzIyIEMgNTk4LjI1Miw2MjguMzgzIDU5OS41ODQsNjI4LjM2NCA2MTAuNTAwLDYyNi4yNDEgQyA2MjcuMzY5LDYyMi45NjAgNjM4LjUxMCw2MTkuNDY2IDY0OS44NzIsNjEzLjg5MCBDIDY3My44MzMsNjAyLjEzMiA2ODQuOTUwLDU4Mi45MjggNjgyLjIzOSw1NTcuOTgzIEMgNjgxLjAzMCw1NDYuODU5IDY3Ny4yOTYsNTM2LjMwNyA2NzEuNDMyLDUyNy40NDYgQyA2NjEuMzM5LDUxMi4xOTMgNjQ0LjEwMCw0OTcuODg5IDU5NSw0NjQuMDMwIEMgNTg3LjU3NSw0NTguOTEwIDU3Ny4zNDUsNDUxLjQwMCA1NzIuMjY2LDQ0Ny4zNDEgQyA1NTkuNTY2LDQzNy4xOTEgNTU3LjI2Myw0MzIuMTA5IDU2My4zMjMsNDI3LjYwMCBDIDU2Ni4xMzgsNDI1LjUwNiA1NjYuNDE4LDQyNS40OTkgNjYwLjQzNCw0MjUuMjI1IEMgNjkxLjg2Myw0MjUuMTM0IDcyMy4yOTMsNDI1LjA0MiA3NTQuNzIyLDQyNC45NTEgQyA3NTQuOTQzLDQyOC4wNDIgNzU1LjE2NSw0MzEuMTM0IDc1NS4zODYsNDM0LjIyNSBDIDc1Ny41MDgsNDYzLjg2NyA3NTcuOTYxLDQ3Ny4wMjkgNzU3Ljk3NSw1MDkuNTAwIEMgNzU3Ljk5NSw1NTQuMzUzIDc1NC44NjMsNjA1LjUxNyA3NDkuOTgwLDY0MC4xMTIgQyA3NDMuMDIwLDY4OS40MjEgNzE0LjkyMyw3MjcuNjAxIDY3MS45NjksNzQ2LjExOSBDIDY1MS45MDcsNzU0Ljc2OCA2MzkuMDg0LDc1Ny4zNTUgNTk4LjUwMCw3NjAuOTM2IEMgNTI4Ljg4OCw3NjcuMDc5IDQ1OS42NDQsNzY2LjA3MSAzOTUuOTU1LDc1Ny45ODcgQyAzNzUuOTY4LDc1NS40NTAgMzYxLjU2MSw3NTEuMjQwIDM0NS41MDAsNzQzLjI0MSBDIDMyNy4zODcsNzM0LjIyMSAzMDcuNTI1LDcxNy4yMjEgMjk3LjMwNCw3MDEuOTkyIEMgMjg0LjQ1MCw2ODIuODM4IDI3NS40MDEsNjU3LjkyNCAyNzMuMzczLDYzNi4xMDMgQyAyNzMuMTU1LDYzMy43NTYgMjcyLjkzNyw2MzEuNDEwIDI3Mi43MTksNjI5LjA2MyBDIDMyNy4xODMsNjI4Ljk0OSAzODEuNjQ1LDYyOC44MzYgNDM2LjEwOSw2MjguNzIyIFoiIGZpbGw9IndoaXRlIiBzdHJva2U9Im5vbmUiLz4NCjwvc3ZnPg0K"
                  width="40"
                  height="40"
                  alt=""
                  style={{ objectFit: 'contain' }}
                />
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
