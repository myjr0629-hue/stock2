// ============================================================================
// CaptionOverlay V3 — Visual copy, not subtitles
// ============================================================================

import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import type { CaptionSegment } from '../../types';
import { BRAND, TYPE, LAYOUT, Z, SHADOW } from '../brand/signumBrand';

interface CaptionOverlayProps { captions: CaptionSegment[]; }

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const active = captions.find(c => frame >= c.startFrame && frame < c.endFrame);
  if (!active) return null;

  const lf = frame - active.startFrame;
  const dur = active.endFrame - active.startFrame;
  const enter = spring({ frame: lf, fps, config: { damping: 16, stiffness: 220, mass: 0.35 } });
  const exit = interpolate(lf, [dur - 4, dur], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const op = Math.min(enter, exit);

  const isE = active.emphasis;
  const color = active.color || BRAND.text;
  const shadow = active.color === BRAND.cyan ? SHADOW.cyan
    : active.color === BRAND.purple ? SHADOW.purple
    : active.color === BRAND.coral ? SHADOW.coral
    : active.color === BRAND.amber ? SHADOW.amber
    : SHADOW.caption;

  return (
    <div style={{
      position: 'absolute', bottom: LAYOUT.captionBot,
      left: LAYOUT.safeL, right: LAYOUT.safeR,
      display: 'flex', justifyContent: 'center',
      opacity: op, transform: `translateY(${(1 - enter) * 14}px)`,
      zIndex: Z.caption,
    }}>
      <div style={{
        color, fontSize: isE ? TYPE.captionEmphSize : TYPE.captionSize,
        fontWeight: isE ? TYPE.captionEmphWeight : TYPE.captionWeight,
        fontFamily: TYPE.family, textAlign: 'center',
        lineHeight: 1.2, textShadow: isE ? shadow : SHADOW.caption,
        maxWidth: LAYOUT.captionMaxW,
      }}>
        {active.text}
      </div>
    </div>
  );
};
