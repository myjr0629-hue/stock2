// ============================================================================
// Scene 5: INSIGHT (20~25s) — "What institutions track — now visible"
// GPT 3-bullet 구조 + Claude 컴플라이언스 세이프 카피
// ============================================================================
import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import { C } from '../design';

interface Scene5Props {
  insight1: string;
  insight2: string;
  insight3: string;
  lang: 'en' | 'ko' | 'ja';
}

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

const L = {
  en: { tag: '— INSIGHT —', main: 'What institutions track', sub: '— now visible —' },
  ko: { tag: '— 인사이트 —', main: '기관이 추적하는 데이터', sub: '— 이제 보입니다 —' },
  ja: { tag: '— インサイト —', main: '機関が追跡するデータ', sub: '— 今、見える —' },
};

export const Scene5_Insight: React.FC<Scene5Props> = ({ insight1, insight2, insight3, lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const l = L[lang] || L.en;

  const opacity = interpolate(frame, [0, fps * 0.8], [0, 1], clamp);
  const scale = spring({ frame, fps, config: { damping: 10, stiffness: 80 } });

  const insights = [insight1, insight2, insight3];

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {/* Dual glow */}
      <div style={{ position: 'absolute', top: '20%', left: '20%', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 60%)` }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '20%', width: 500, height: 500, borderRadius: '50%', background: `radial-gradient(circle, rgba(34,211,238,0.20) 0%, transparent 60%)` }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.16, backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
        {/* Tag */}
        <div style={{
          fontSize: 28, fontWeight: 800, color: C.cyan, letterSpacing: '0.3em',
          marginBottom: 40, opacity, fontFamily: 'Inter',
        }}>{l.tag}</div>

        {/* Main insight */}
        <div style={{
          fontSize: 80, fontWeight: 900, color: C.text, letterSpacing: '-0.04em',
          lineHeight: 1, textAlign: 'center', opacity,
          transform: `scale(${scale})`, marginBottom: 16, fontFamily: 'Inter',
        }}>
          {l.main}
        </div>

        {/* Sub */}
        <div style={{
          fontSize: 48, fontWeight: 700, color: C.cyan, letterSpacing: '-0.02em',
          textAlign: 'center', marginBottom: 60,
          opacity: interpolate(frame, [fps * 1, fps * 1.5], [0, 1], clamp),
          textShadow: `0 0 30px rgba(34,211,238,0.4)`,
          fontFamily: 'Inter',
        }}>{l.sub}</div>

        {/* 3 Insight bullets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%', maxWidth: 860 }}>
          {insights.map((text, i) => {
            const delay = fps * 1.5 + i * fps * 0.6;
            const iop = interpolate(frame, [delay, delay + fps * 0.4], [0, 1], clamp);
            const ix = interpolate(frame, [delay, delay + fps * 0.4], [-60, 0], clamp);
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 20,
                padding: '24px 32px', borderRadius: 16,
                background: 'rgba(255,255,255,0.04)',
                borderLeft: `4px solid ${C.cyan}`,
                opacity: iop, transform: `translateX(${ix}px)`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${C.purple}, ${C.cyan})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 900, color: C.text, flexShrink: 0,
                }}>{i + 1}</div>
                <span style={{
                  color: C.text, fontSize: 26, fontWeight: 600, lineHeight: 1.35,
                  fontFamily: 'Inter',
                }}>{text}</span>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
