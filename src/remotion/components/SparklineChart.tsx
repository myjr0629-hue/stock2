// ============================================================================
// SparklineChart — SVG 차트 실시간 드로잉 애니메이션
// evolvePath 기반 — 차트가 "그려지는" 효과
// ============================================================================
import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { evolvePath } from '@remotion/paths';
import { C, glow } from '../design';

export const SparklineChart: React.FC<{
  /** 0-1 normalized data points */
  data?: number[];
  color?: string;
  width?: number;
  height?: number;
  delay?: number;
  /** Show a glowing dot at the last point */
  showEndDot?: boolean;
  /** Show area fill below the line */
  showFill?: boolean;
}> = ({
  data: inputData,
  color = C.cyan,
  width = 900,
  height = 200,
  delay = 0,
  showEndDot = true,
  showFill = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - delay);

  // Generate sample data if none provided
  const data = inputData || generateSampleData(20);

  // Build SVG path from data points
  const padding = 10;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * plotW,
    y: padding + (1 - v) * plotH,
  }));

  // Smooth curve using cardinal spline
  const pathD = pointsToSmoothPath(points);

  // Drawing progress
  const drawProgress = interpolate(f, [0, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  let strokeProps: React.SVGProps<SVGPathElement> = {};
  try {
    const evolved = evolvePath(drawProgress, pathD);
    strokeProps = {
      strokeDasharray: evolved.strokeDasharray,
      strokeDashoffset: evolved.strokeDashoffset,
    };
  } catch {
    // Fallback if path is invalid
    strokeProps = {};
  }

  // End dot position
  const lastIdx = Math.min(Math.floor(drawProgress * (data.length - 1)), data.length - 1);
  const endPt = points[lastIdx] || points[points.length - 1];

  // End dot pulse
  const dotScale = showEndDot && drawProgress >= 0.95
    ? spring({ frame: f - 55, fps, config: { damping: 10 } })
    : 0;

  // Area fill path
  const areaPath = showFill
    ? `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`
    : '';

  // Container opacity
  const opacity = interpolate(f, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <svg width={width} height={height} style={{ opacity }} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25 * drawProgress} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
        <filter id="sparkGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Area fill */}
      {showFill && areaPath && (
        <path d={areaPath} fill="url(#sparkFill)" opacity={drawProgress} />
      )}

      {/* Glow line (behind) */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.3}
        filter="url(#sparkGlow)"
        {...strokeProps}
      />

      {/* Main line */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...strokeProps}
      />

      {/* End dot */}
      {showEndDot && dotScale > 0 && (
        <>
          {/* Pulse ring */}
          <circle
            cx={endPt.x} cy={endPt.y}
            r={12 * dotScale}
            fill="none"
            stroke={color}
            strokeWidth={2}
            opacity={0.4 * (1 - dotScale * 0.5)}
          />
          {/* Dot */}
          <circle
            cx={endPt.x} cy={endPt.y}
            r={5 * Math.min(dotScale, 1)}
            fill={color}
            filter="url(#sparkGlow)"
          />
        </>
      )}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pointsToSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` Q ${prev.x + (cpx - prev.x) * 0.5} ${prev.y}, ${cpx} ${(prev.y + curr.y) / 2}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function generateSampleData(n: number): number[] {
  const data: number[] = [];
  let v = 0.5;
  for (let i = 0; i < n; i++) {
    v += (Math.sin(i * 0.8) * 0.15 + Math.cos(i * 1.3) * 0.1);
    v = Math.max(0.05, Math.min(0.95, v));
    data.push(v);
  }
  return data;
}
