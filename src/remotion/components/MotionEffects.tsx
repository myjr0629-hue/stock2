// ============================================================================
// PulseRing — 원형 파동 이펙트 (핵심 수치 도달 시)
// ============================================================================
import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

export const PulseRing: React.FC<{
  color: string;
  delay?: number;
  size?: number;
  rings?: number;
}> = ({ color, delay = 0, size = 200, rings = 3 }) => {
  const frame = useCurrentFrame();
  const f = Math.max(0, frame - delay);

  return (
    <div style={{
      position: 'absolute',
      width: size, height: size,
      left: '50%', top: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
    }}>
      {Array.from({ length: rings }, (_, i) => {
        const ringDelay = i * 8;
        const rf = Math.max(0, f - ringDelay);
        const scale = interpolate(rf, [0, 30], [0.3, 1.5], { extrapolateRight: 'clamp' });
        const opacity = interpolate(rf, [0, 5, 30], [0, 0.6, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            border: `2px solid ${color}`,
            opacity,
            transform: `scale(${scale})`,
          }} />
        );
      })}
    </div>
  );
};

// ============================================================================
// DataCascade — 데이터가 위에서 아래로 쏟아지며 카드에 안착
// ============================================================================
export const DataCascade: React.FC<{
  items: { label: string; value: string; color: string }[];
  frame: number;
  delay?: number;
}> = ({ items, frame, delay = 0 }) => {
  const f = Math.max(0, frame - delay);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      gap: 12, width: '100%',
    }}>
      {items.map((item, i) => {
        const itemDelay = i * 6;
        const itemF = Math.max(0, f - itemDelay);
        const translateY = interpolate(itemF, [0, 12], [-40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const opacity = interpolate(itemF, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const scaleX = interpolate(itemF, [8, 15], [0.95, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

        return (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 24px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 12,
            borderLeft: `3px solid ${item.color}`,
            opacity,
            transform: `translateY(${translateY}px) scaleX(${scaleX})`,
          }}>
            <span style={{ fontSize: 20, color: '#94a3b8', fontWeight: 500 }}>{item.label}</span>
            <span style={{ fontSize: 24, color: item.color, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{item.value}</span>
          </div>
        );
      })}
    </div>
  );
};
