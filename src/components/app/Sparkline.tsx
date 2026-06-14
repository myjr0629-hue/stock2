'use client';

interface SparklineProps {
  data: number[];
  up: boolean;
  height?: number;
  fill?: boolean;
}

export function Sparkline({ data, up, height = 22, fill = false }: SparklineProps) {
  const w = 60;
  const h = height;
  if (!data || data.length < 2) return <div style={{ width: 60, height: h }} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const coords = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d - min) / range) * (h - 4) - 2;
    return [x, y] as [number, number];
  });
  const pts = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${h} ` + pts + ` ${w},${h}`;
  const c = up ? 'var(--green)' : 'var(--red)';
  const gid = 'sg' + Math.random().toString(36).slice(2, 8);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      style={{ width: '100%', maxWidth: 60, height: h, display: 'block' }}>
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity="0.3" />
              <stop offset="100%" stopColor={c} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#${gid})`} />
        </>
      )}
      <polyline points={pts} fill="none" stroke={c} strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
