// ============================================================================
// GlassCard — Glassmorphism data card component
// Frosted-glass aesthetic with configurable accent color and glow
// ============================================================================
import React from 'react';
import { BRAND } from '../brand/signumBrand';

interface GlassCardProps {
  children: React.ReactNode;
  color?: string; // accent color, default BRAND.cyan
  glow?: boolean; // enable outer glow, default true
  padding?: string; // CSS padding, default '18px 36px'
  borderRadius?: number; // default 16
  opacity?: number; // 0-1, for animation, default 1
  bracket?: boolean; // default true, renders custom terminal braces
}

// ── Helpers ────────────────────────────────────────────────────────────────
/** Convert any CSS hex color (#rgb or #rrggbb) to an rgba string */
const hexToRgba = (hex: string, alpha: number): string => {
  let r = 0,
    g = 0,
    b = 0;
  const h = hex.replace('#', '');
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
};

// ── Component ──────────────────────────────────────────────────────────────
const GlassCard: React.FC<GlassCardProps> = ({
  children,
  color = BRAND.cyan,
  glow = true,
  padding = '18px 36px',
  borderRadius = 16,
  opacity = 1,
  bracket = true,
}) => {
  // Determine if we're working with hex or already rgba
  const isHex = color.startsWith('#');
  const bgColor = isHex ? hexToRgba(color, 0.07) : color.replace(/[\d.]+\)$/, '0.07)');
  const borderColor = isHex ? hexToRgba(color, 0.28) : color.replace(/[\d.]+\)$/, '0.28)');
  const glowColor = isHex ? hexToRgba(color, 0.35) : color.replace(/[\d.]+\)$/, '0.35)');

  const baseShadow = '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)';
  const glowShadow = glow ? `, 0 0 30px ${glowColor}` : '';

  const style: React.CSSProperties = {
    background: bgColor,
    border: `1px solid ${borderColor}`,
    borderRadius,
    boxShadow: baseShadow + glowShadow,
    padding,
    opacity,
    position: 'relative',
  };

  return (
    <div style={style}>
      {bracket && (
        <>
          {/* Top Left Corner */}
          <div style={{ position: 'absolute', top: 5, left: 5, width: 8, height: 8, borderTop: `2px solid ${borderColor}`, borderLeft: `2px solid ${borderColor}` }} />
          {/* Top Right Corner */}
          <div style={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderTop: `2px solid ${borderColor}`, borderRight: `2px solid ${borderColor}` }} />
          {/* Bottom Left Corner */}
          <div style={{ position: 'absolute', bottom: 5, left: 5, width: 8, height: 8, borderBottom: `2px solid ${borderColor}`, borderLeft: `2px solid ${borderColor}` }} />
          {/* Bottom Right Corner */}
          <div style={{ position: 'absolute', bottom: 5, right: 5, width: 8, height: 8, borderBottom: `2px solid ${borderColor}`, borderRight: `2px solid ${borderColor}` }} />
        </>
      )}
      {children}
    </div>
  );
};

export default GlassCard;
