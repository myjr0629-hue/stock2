// ============================================================================
// DataCard V3 — Minimal floating metric (not boxed dashboard cards)
// Used only if needed. V3 prefers integrated labels.
// ============================================================================

import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { DataCardInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW } from '../brand/signumBrand';

interface DataCardProps { card: DataCardInput; index: number; enterFrame: number; }

export const DataCard: React.FC<DataCardProps> = ({ card, index, enterFrame }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lf = Math.max(0, frame - enterFrame - index * 5);
  const r = spring({ frame: lf, fps, config: { damping: 22, stiffness: 140, mass: 0.5 } });

  return (
    <div style={{
      background: BRAND.glass, border: `1px solid ${BRAND.border}`,
      borderRadius: 12, padding: '14px 20px',
      backdropFilter: 'blur(16px)',
      opacity: r, transform: `translateY(${(1 - r) * 20}px)`,
      minWidth: 160, zIndex: Z.data,
    }}>
      <div style={{
        color: BRAND.mutedLight, fontSize: TYPE.labelSize, fontWeight: TYPE.labelWeight,
        fontFamily: TYPE.family, letterSpacing: TYPE.labelTracking,
        textTransform: 'uppercase' as const, marginBottom: 5,
      }}>{card.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{
          color: card.color || BRAND.text, fontSize: TYPE.metricSize,
          fontWeight: TYPE.metricWeight, fontFamily: TYPE.family,
          letterSpacing: '-0.02em',
          textShadow: card.color ? `0 0 12px ${card.color}40` : 'none',
        }}>{card.value}</div>
        {card.unit && (
          <div style={{ color: card.color || BRAND.mutedLight, fontSize: 14, fontWeight: 600, fontFamily: TYPE.family, opacity: 0.7 }}>
            {card.unit}
          </div>
        )}
      </div>
    </div>
  );
};

export const DataCardRow: React.FC<{ cards: DataCardInput[]; enterFrame: number }> = ({ cards, enterFrame }) => (
  <div style={{ position: 'absolute', top: 1340, left: 60, right: 60, display: 'flex', gap: 14, justifyContent: 'center' }}>
    {cards.map((c, i) => <DataCard key={c.label} card={c} index={i} enterFrame={enterFrame} />)}
  </div>
);
