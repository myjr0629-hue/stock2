import React from 'react';
import { useCurrentFrame, random } from 'remotion';
import { Z, LAYOUT } from '../brand/signumBrand';

interface AmbientCandlestickBgProps {
  opacity?: number;
  candleCount?: number;
  panSpeed?: number;
  baseY?: number;
  height?: number;
}

interface Candle {
  open: number;
  close: number;
  high: number;
  low: number;
  bullish: boolean;
}

const BODY_WIDTH = 20;
const GAP = 16;
const CANDLE_STEP = BODY_WIDTH + GAP;

const generateCandles = (count: number, baseY: number, height: number): Candle[] => {
  const candles: Candle[] = [];
  const halfH = height / 2;

  for (let i = 0; i < count; i++) {
    const seed = `candle-${i}`;
    const r1 = random(seed + '-open');
    const r2 = random(seed + '-close');
    const r3 = random(seed + '-wickUp');
    const r4 = random(seed + '-wickDown');

    const open = baseY - halfH + r1 * height;
    const close = baseY - halfH + r2 * height;

    const top = Math.min(open, close);
    const bottom = Math.max(open, close);

    const high = top - r3 * (halfH * 0.5);
    const low = bottom + r4 * (halfH * 0.5);

    candles.push({
      open,
      close,
      high,
      low,
      bullish: close > open,
    });
  }

  return candles;
};

const AmbientCandlestickBg: React.FC<AmbientCandlestickBgProps> = ({
  opacity = 0.08,
  candleCount = 24,
  panSpeed = 0.3,
  baseY = 960,
  height = 400,
}) => {
  const frame = useCurrentFrame();
  const candles = generateCandles(candleCount, baseY, height);

  const totalWidth = candleCount * CANDLE_STEP;
  const panOffset = (frame * panSpeed) % totalWidth;

  const screenW = LAYOUT.w;
  const screenH = LAYOUT.h;

  // We render two copies side-by-side for seamless wrapping
  const renderCandles = (offsetX: number) =>
    candles.map((c, i) => {
      const x = offsetX + i * CANDLE_STEP - panOffset;

      // Skip candles fully off-screen for perf
      if (x + BODY_WIDTH < -CANDLE_STEP || x > screenW + CANDLE_STEP) {
        return null;
      }

      const bodyTop = Math.min(c.open, c.close);
      const bodyBottom = Math.max(c.open, c.close);
      const bodyHeight = Math.max(bodyBottom - bodyTop, 2);

      const fillColor = c.bullish
        ? 'rgba(34,211,238,0.15)'
        : 'rgba(248,113,113,0.12)';

      const wickColor = c.bullish
        ? 'rgba(34,211,238,0.12)'
        : 'rgba(248,113,113,0.10)';

      const cx = x + BODY_WIDTH / 2;

      // Real volume bar calculation
      const rVol = random(`candle-${i}-vol`);
      const volMaxH = height * 0.15; // Max volume bar is 15% of chart height
      const volHeight = 5 + rVol * volMaxH;
      const volY = baseY + height / 2 - volHeight;
      const volOpacity = opacity * 0.4;
      const volColor = c.bullish
        ? `rgba(34,211,238,${volOpacity})`
        : `rgba(248,113,113,${volOpacity})`;

      return (
        <g key={`${offsetX}-${i}`}>
          {/* Wick */}
          <line
            x1={cx}
            y1={c.high}
            x2={cx}
            y2={c.low}
            stroke={wickColor}
            strokeWidth={1}
          />
          {/* Body */}
          <rect
            x={x}
            y={bodyTop}
            width={BODY_WIDTH}
            height={bodyHeight}
            fill={fillColor}
            rx={2}
          />
          {/* Volume Profile Bar at bottom of chart */}
          <rect
            x={x + 2}
            y={volY}
            width={BODY_WIDTH - 4}
            height={volHeight}
            fill={volColor}
            rx={1}
          />
        </g>
      );
    });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        zIndex: Z.grid - 1,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <svg
        width={screenW}
        height={screenH}
        viewBox={`0 0 ${screenW} ${screenH}`}
        style={{ display: 'block' }}
      >
        {renderCandles(0)}
        {renderCandles(totalWidth)}
      </svg>
    </div>
  );
};

export default AmbientCandlestickBg;
