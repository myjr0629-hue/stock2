// ============================================================================
// Scene 4: DATA CASCADE (14~20s) — SPY/QQQ/VIX 순차 캐스케이드
// 기존 SceneIndices 리팩터 + Claude 순차 슬라이드
// ============================================================================
import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import { C, changeColor } from '../design';
import { KineticNumber } from '../components/KineticNumber';
import { SparklineChart } from '../components/SparklineChart';

interface Scene4Props {
  spy: number;
  qqq: number;
  vix: number;
  lang: 'en' | 'ko' | 'ja';
}

const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

const L = {
  en: { header: 'WHAT INSTITUTIONS SEE', vol: 'VOLATILITY' },
  ko: { header: '기관이 보는 데이터', vol: '변동성' },
  ja: { header: '機関が見るデータ', vol: 'ボラティリティ' },
};

const DataCard: React.FC<{
  label: string; sublabel: string; children: React.ReactNode;
  color: string; frame: number; fps: number; delay: number;
}> = ({ label, sublabel, children, color, frame, fps, delay }) => {
  const lf = frame - delay;
  const opacity = interpolate(lf, [0, fps * 0.5], [0, 1], clamp);
  const slideX = interpolate(lf, [0, fps * 0.5], [-100, 0], clamp);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 32,
      padding: '32px 40px',
      background: 'rgba(255,255,255,0.04)',
      border: `2px solid ${color}40`,
      borderLeft: `8px solid ${color}`,
      borderRadius: 16,
      opacity, transform: `translateX(${slideX}px)`,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.muted, letterSpacing: '0.15em', marginBottom: 8, fontFamily: 'Inter' }}>{label}</div>
        <div style={{ fontSize: 20, color: C.muted, fontFamily: 'Inter' }}>{sublabel}</div>
      </div>
      <div>{children}</div>
    </div>
  );
};

export const Scene4_DataCascade: React.FC<Scene4Props> = ({ spy, qqq, vix, lang }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const l = L[lang] || L.en;

  const vixColor = vix > 25 ? C.red : vix > 18 ? C.amber : C.emerald;

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      {/* Background */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 50% 40%, rgba(168,85,247,0.12) 0%, transparent 50%), ${C.bg}`,
      }} />
      <div style={{ position: 'absolute', inset: 0, opacity: 0.16, backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 60px' }}>
        {/* Header */}
        <div style={{
          fontSize: 36, fontWeight: 700, color: C.muted, letterSpacing: '0.2em', marginBottom: 60,
          opacity: interpolate(frame, [0, fps * 0.5], [0, 1], clamp), fontFamily: 'Inter',
        }}>{l.header}</div>

        {/* Data cards cascade */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28, width: '100%', maxWidth: 900 }}>
          {/* SPY */}
          <DataCard label="S&P 500" sublabel="SPY" color={changeColor(spy)} frame={frame} fps={fps} delay={0}>
            <KineticNumber value={spy} suffix="%" color={changeColor(spy)} frame={frame} delay={5} fontSize={64} />
          </DataCard>

          {/* QQQ */}
          <DataCard label="NASDAQ 100" sublabel="QQQ" color={changeColor(qqq)} frame={frame} fps={fps} delay={Math.round(fps * 1.5)}>
            <KineticNumber value={qqq} suffix="%" color={changeColor(qqq)} frame={frame} delay={Math.round(fps * 1.5 + 5)} fontSize={64} />
          </DataCard>

          {/* VIX */}
          <DataCard label={l.vol} sublabel="VIX" color={vixColor} frame={frame} fps={fps} delay={fps * 3}>
            <KineticNumber value={vix} suffix="" prefix="" color={vixColor} frame={frame} delay={fps * 3 + 5} fontSize={64} decimals={1} />
          </DataCard>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
