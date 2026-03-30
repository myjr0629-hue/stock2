// ============================================================================
// NewsDigestVideo — 뉴스 + 시장 반응 Shorts (30초)
// 기존 뉴스 API 데이터 활용 → SIGNUM HQ 데이터와 결합
// ============================================================================

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
} from 'remotion';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface NewsHeadline {
  title: string;
  sentiment: 'positive' | 'negative' | 'neutral';
}

export interface NewsDigestProps {
  headlines: NewsHeadline[];
  spy: number;
  vix: number;
  lang: 'en' | 'ko' | 'ja';
  bgmUrl?: string;
  narrationUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const COLORS = {
  bg: '#0a0e17',
  card: '#111827',
  border: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  green: '#22c55e',
  red: '#ef4444',
  amber: '#f59e0b',
  purple: '#8b5cf6',
  gradient1: '#6366f1',
  gradient2: '#a855f7',
};

const LABELS = {
  en: { title: 'NEWS DIGEST', breaking: 'TOP STORIES', market: 'Market Reaction', cta: 'Full analysis on signumhq.com' },
  ko: { title: '뉴스 다이제스트', breaking: '주요 뉴스', market: '시장 반응', cta: '전체 분석 signumhq.com' },
  ja: { title: 'ニュースダイジェスト', breaking: 'トップニュース', market: 'マーケット反応', cta: '全分析 signumhq.com' },
};

const sentimentIcon = (s: string) => s === 'positive' ? '📈' : s === 'negative' ? '📉' : '➡️';
const sentimentColor = (s: string) => s === 'positive' ? COLORS.green : s === 'negative' ? COLORS.red : COLORS.amber;

// ---------------------------------------------------------------------------
// Main Composition
// ---------------------------------------------------------------------------
export const NewsDigestVideo: React.FC<NewsDigestProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const l = LABELS[props.lang] || LABELS.en;

  const opacity = interpolate(frame, [0, 15, 870, 900], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, opacity }}>

      {/* === Section 1: Logo + Title (0-3s) === */}
      <Sequence from={0} durationInFrames={90}>
        <AbsoluteFill style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{
            width: 100,
            height: 100,
            borderRadius: 24,
            background: `linear-gradient(135deg, ${COLORS.gradient1}, ${COLORS.gradient2})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 52,
            fontWeight: 900,
            color: 'white',
            opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' }),
          }}>
            S
          </div>
          <div style={{
            marginTop: 20,
            fontSize: 32,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: 4,
            opacity: interpolate(frame, [15, 35], [0, 1], { extrapolateRight: 'clamp' }),
          }}>
            {l.title}
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* === Section 2: Headlines (3-20s) === */}
      <Sequence from={90} durationInFrames={510}>
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', padding: 50, gap: 4 }}>
          <div style={{ fontSize: 22, color: COLORS.muted, letterSpacing: 3, marginBottom: 20 }}>
            {l.breaking}
          </div>

          {props.headlines.map((headline, i) => {
            const baseDelay = i * 50;
            const slideIn = interpolate(frame - 90, [baseDelay, baseDelay + 20], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 16,
                  padding: '24px 20px',
                  marginBottom: 16,
                  background: COLORS.card,
                  borderRadius: 20,
                  borderLeft: `4px solid ${sentimentColor(headline.sentiment)}`,
                  opacity: slideIn,
                  transform: `translateX(${interpolate(slideIn, [0, 1], [-50, 0])}px)`,
                }}
              >
                <span style={{ fontSize: 36, lineHeight: 1 }}>
                  {sentimentIcon(headline.sentiment)}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 26, fontWeight: 600, color: COLORS.text, lineHeight: 1.4 }}>
                    {headline.title}
                  </span>
                </div>
              </div>
            );
          })}
        </AbsoluteFill>
      </Sequence>

      {/* === Section 3: Market Reaction (20-25s) === */}
      <Sequence from={600} durationInFrames={150}>
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 30 }}>
          <div style={{ fontSize: 22, color: COLORS.muted, letterSpacing: 3 }}>{l.market}</div>

          <div style={{
            display: 'flex',
            gap: 20,
            width: '100%',
          }}>
            <div style={{
              flex: 1,
              background: COLORS.card,
              borderRadius: 24,
              padding: 30,
              textAlign: 'center',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 20, color: COLORS.muted }}>SPY</div>
              <div style={{
                fontSize: 52,
                fontWeight: 800,
                color: props.spy >= 0 ? COLORS.green : COLORS.red,
              }}>
                {props.spy >= 0 ? '+' : ''}{props.spy.toFixed(2)}%
              </div>
            </div>

            <div style={{
              flex: 1,
              background: COLORS.card,
              borderRadius: 24,
              padding: 30,
              textAlign: 'center',
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 20, color: COLORS.muted }}>VIX</div>
              <div style={{
                fontSize: 52,
                fontWeight: 800,
                color: props.vix > 25 ? COLORS.red : props.vix > 18 ? COLORS.amber : COLORS.green,
              }}>
                {props.vix.toFixed(1)}
              </div>
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* === Section 4: CTA (25-30s) === */}
      <Sequence from={750} durationInFrames={150}>
        <AbsoluteFill style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <div style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: `linear-gradient(135deg, ${COLORS.gradient1}, ${COLORS.gradient2})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 40,
            fontWeight: 900,
            color: 'white',
          }}>
            S
          </div>
          <div style={{ fontSize: 26, fontWeight: 600, color: COLORS.text }}>{l.cta}</div>
          <div style={{
            padding: '14px 36px',
            borderRadius: 50,
            background: `linear-gradient(90deg, ${COLORS.gradient1}, ${COLORS.gradient2})`,
            fontSize: 20,
            fontWeight: 700,
            color: 'white',
          }}>
            signumhq.com
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Audio */}
      {props.narrationUrl && <audio src={props.narrationUrl} />}
      {props.bgmUrl && <audio src={props.bgmUrl} />}
    </AbsoluteFill>
  );
};
