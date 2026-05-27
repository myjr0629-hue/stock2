// ============================================================================
// ComplianceFooter V3
// ============================================================================

import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { BRAND, TYPE, LAYOUT, Z } from '../brand/signumBrand';

export const ComplianceFooter: React.FC<{ text?: string }> = ({
  text = 'Market structure brief. Not financial advice.',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const op = interpolate(frame, [fps * 2, fps * 4], [0, 0.7], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute', bottom: LAYOUT.safeBot - 50,
      left: 0, right: 0, display: 'flex', justifyContent: 'center',
      opacity: op, zIndex: Z.compliance,
    }}>
      <div style={{
        color: BRAND.muted, fontSize: 12, fontWeight: 400,
        fontFamily: TYPE.family, letterSpacing: '0.04em',
        padding: '4px 16px', background: 'rgba(4,7,16,0.5)', borderRadius: 5,
      }}>
        {text}
      </div>
    </div>
  );
};
