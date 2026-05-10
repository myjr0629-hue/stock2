// ============================================================================
// SIGNUM HQ — Remotion Design System V2
// Premium dark theme with neon accents, glassmorphism, and glow effects
// ============================================================================

// ---------------------------------------------------------------------------
// Color Palette
// ---------------------------------------------------------------------------
export const C = {
  // Backgrounds
  bg:       '#080c14',
  bgDeep:   '#040810',
  card:     'rgba(255,255,255,0.04)',
  cardHover:'rgba(255,255,255,0.07)',
  glass:    'rgba(255,255,255,0.03)',
  border:   'rgba(255,255,255,0.08)',

  // Text
  text:     '#f0f4f8',
  muted:    '#64748b',
  dim:      '#475569',

  // Accents
  cyan:     '#22d3ee',
  emerald:  '#10b981',
  amber:    '#f59e0b',
  red:      '#ef4444',
  purple:   '#a855f7',
  blue:     '#3b82f6',
  pink:     '#ec4899',

  // Gradients
  grad1:    '#6366f1',
  grad2:    '#a855f7',
  gradCyan: '#06b6d4',
  gradEmerald: '#10b981',
} as const;

// ---------------------------------------------------------------------------
// Glow Presets
// ---------------------------------------------------------------------------
export const glow = (color: string, intensity = 1) =>
  `0 0 ${20 * intensity}px ${color}40, 0 0 ${40 * intensity}px ${color}20, 0 0 ${60 * intensity}px ${color}10`;

export const borderGlow = (color: string) =>
  `inset 0 0 30px ${color}08, 0 0 15px ${color}15`;

// ---------------------------------------------------------------------------
// Common Styles
// ---------------------------------------------------------------------------
export const GLASS_CARD: React.CSSProperties = {
  background: C.card,
  borderRadius: 20,
  border: `1px solid ${C.border}`,
  backdropFilter: 'blur(20px)',
  padding: '28px 32px',
};

export const PREMIUM_CARD = (accentColor: string): React.CSSProperties => ({
  ...GLASS_CARD,
  borderColor: `${accentColor}30`,
  boxShadow: borderGlow(accentColor),
});

// ---------------------------------------------------------------------------
// Layout constants (9:16 @ 1080×1920)
// ---------------------------------------------------------------------------
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const SAFE_X = 60;    // side padding
export const SAFE_Y = 120;   // top/bottom safe zone

// ---------------------------------------------------------------------------
// Timing helpers (frames at 30fps)
// ---------------------------------------------------------------------------
export const sec = (s: number) => Math.round(s * 30);

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------
export const changeColor = (v: number) =>
  v > 0 ? C.emerald : v < 0 ? C.red : C.muted;

export const gexColor = (regime: string) => {
  const r = regime.toLowerCase();
  if (r === 'positive') return C.emerald;
  if (r === 'negative') return C.red;
  if (r === 'transition') return C.amber;
  return C.muted;
};

export const gradeColor = (grade: string) => {
  if (grade === 'A') return C.emerald;
  if (grade === 'B') return C.cyan;
  if (grade === 'C') return C.amber;
  return C.red;
};
