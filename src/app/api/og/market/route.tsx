// ============================================================================
// /api/og/market — Dynamic OG Image Generation Engine
// Satori/ImageResponse 기반 실시간 인포그래픽
// ============================================================================

import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------
const COLORS = {
  bg:         '#0a0e17',
  bgCard:     '#111827',
  border:     '#1e293b',
  textPrimary:'#f1f5f9',
  textMuted:  '#94a3b8',
  green:      '#22c55e',
  red:        '#ef4444',
  blue:       '#3b82f6',
  purple:     '#a855f7',
  amber:      '#f59e0b',
  cyan:       '#06b6d4',
  gradient1:  '#6366f1',
  gradient2:  '#8b5cf6',
};

// ---------------------------------------------------------------------------
// i18n Labels
// ---------------------------------------------------------------------------
const LABELS: Record<string, Record<string, string>> = {
  en: {
    title: 'MARKET PULSE',
    titleEvent: 'EVENT ALERT',
    titleWeekly: 'WEEKLY RECAP',
    gexLabel: 'GEX Regime',
    subtitle: 'Real-time Options Intelligence',
    footer: 'signumhq.com',
    positive: 'POSITIVE',
    negative: 'NEGATIVE',
    neutral: 'NEUTRAL',
    transition: 'TRANSITION',
  },
  ko: {
    title: '마켓 펄스',
    titleEvent: '이벤트 알림',
    titleWeekly: '주간 리캡',
    gexLabel: 'GEX 레짐',
    subtitle: '실시간 옵션 인텔리전스',
    footer: 'signumhq.com',
    positive: '포지티브',
    negative: '네거티브',
    neutral: '뉴트럴',
    transition: '트랜지션',
  },
  ja: {
    title: 'マーケットパルス',
    titleEvent: 'イベントアラート',
    titleWeekly: 'ウィークリーレキャップ',
    gexLabel: 'GEXレジーム',
    subtitle: 'リアルタイムオプションインテリジェンス',
    footer: 'signumhq.com',
    positive: 'ポジティブ',
    negative: 'ネガティブ',
    neutral: 'ニュートラル',
    transition: 'トランジション',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function changeColor(val: number): string {
  if (val > 0) return COLORS.green;
  if (val < 0) return COLORS.red;
  return COLORS.textMuted;
}

function formatChange(val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

function gexColor(gex: string): string {
  const g = gex.toLowerCase();
  if (g === 'positive') return COLORS.green;
  if (g === 'negative') return COLORS.red;
  if (g === 'transition') return COLORS.amber;
  return COLORS.textMuted;
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
  const event  = searchParams.get('event') || '';
  const date   = searchParams.get('date') || new Date().toISOString().split('T')[0];

  const l = LABELS[lang] || LABELS.en;
  const title = type === 'event' ? l.titleEvent : type === 'weekly' ? l.titleWeekly : l.title;
  const gexLabel = l[gex.toLowerCase() as keyof typeof l] || gex.toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: `linear-gradient(135deg, ${COLORS.bg} 0%, #111827 50%, #0f172a 100%)`,
          padding: '40px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Logo placeholder - SIGNUM icon */}
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: `linear-gradient(135deg, ${COLORS.gradient1}, ${COLORS.gradient2})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              fontWeight: 800,
              color: 'white',
            }}>
              S
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '28px', fontWeight: 800, color: COLORS.textPrimary, letterSpacing: '2px' }}>
                {title}
              </span>
              <span style={{ fontSize: '14px', color: COLORS.textMuted }}>
                {l.subtitle} · {date}
              </span>
            </div>
          </div>

          {/* GEX Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 20px',
            borderRadius: '24px',
            background: `${gexColor(gex)}22`,
            border: `1px solid ${gexColor(gex)}66`,
          }}>
            <span style={{ fontSize: '14px', color: COLORS.textMuted }}>{l.gexLabel}</span>
            <span style={{ fontSize: '18px', fontWeight: 700, color: gexColor(gex) }}>
              {gexLabel}
            </span>
          </div>
        </div>

        {/* Main data cards */}
        <div style={{ display: 'flex', flex: 1, gap: '20px' }}>
          {/* SPY Card */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: COLORS.bgCard,
            borderRadius: '16px',
            border: `1px solid ${COLORS.border}`,
            padding: '24px',
          }}>
            <span style={{ fontSize: '16px', color: COLORS.textMuted, marginBottom: '8px' }}>SPY</span>
            <span style={{ fontSize: '48px', fontWeight: 800, color: changeColor(spy) }}>
              {formatChange(spy)}
            </span>
            <span style={{ fontSize: '14px', color: COLORS.textMuted, marginTop: '8px' }}>S&P 500 ETF</span>
          </div>

          {/* QQQ Card */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: COLORS.bgCard,
            borderRadius: '16px',
            border: `1px solid ${COLORS.border}`,
            padding: '24px',
          }}>
            <span style={{ fontSize: '16px', color: COLORS.textMuted, marginBottom: '8px' }}>QQQ</span>
            <span style={{ fontSize: '48px', fontWeight: 800, color: changeColor(qqq) }}>
              {formatChange(qqq)}
            </span>
            <span style={{ fontSize: '14px', color: COLORS.textMuted, marginTop: '8px' }}>NASDAQ 100 ETF</span>
          </div>

          {/* VIX Card */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: COLORS.bgCard,
            borderRadius: '16px',
            border: `1px solid ${COLORS.border}`,
            padding: '24px',
          }}>
            <span style={{ fontSize: '16px', color: COLORS.textMuted, marginBottom: '8px' }}>VIX</span>
            <span style={{ fontSize: '48px', fontWeight: 800, color: vix > 25 ? COLORS.red : vix > 18 ? COLORS.amber : COLORS.green }}>
              {vix.toFixed(1)}
            </span>
            <span style={{ fontSize: '14px', color: COLORS.textMuted, marginTop: '8px' }}>Volatility Index</span>
          </div>
        </div>

        {/* Event banner (for event type) */}
        {type === 'event' && (ticker || event) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: '16px',
            padding: '12px 24px',
            borderRadius: '12px',
            background: `linear-gradient(90deg, ${COLORS.purple}33, ${COLORS.cyan}33)`,
            border: `1px solid ${COLORS.purple}66`,
          }}>
            <span style={{ fontSize: '18px', fontWeight: 600, color: COLORS.textPrimary }}>
              {ticker ? `$${ticker}` : ''} {event}
            </span>
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: `1px solid ${COLORS.border}`,
        }}>
          <span style={{ fontSize: '16px', fontWeight: 700, color: COLORS.textMuted }}>
            SIGNUM HQ
          </span>
          <span style={{ fontSize: '14px', color: COLORS.textMuted }}>
            {l.footer}
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
