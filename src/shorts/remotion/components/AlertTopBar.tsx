// ============================================================================
// AlertTopBar — Bloomberg-style top alert bar
// Terminal-aesthetic ticker bar with pulsing LIVE indicator
// ============================================================================
import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { BRAND, Z, LAYOUT } from '../brand/signumBrand';

interface AlertTopBarProps {
  ticker: string; // e.g. 'SPY'
  price: number; // e.g. 592.31
  alertText?: string; // e.g. 'OFF-EXCHANGE ALERT'
  isV33?: boolean;
}

const MONO_FAMILY = "'JetBrains Mono', 'SF Mono', monospace";
const BAR_HEIGHT = 70;

const AlertTopBar: React.FC<AlertTopBarProps> = ({
  ticker,
  price,
  alertText = 'MARKET ALERT',
  isV33 = false,
}) => {
  const frame = useCurrentFrame();

  // Pulsing dot: oscillates opacity 0.5 → 1.0 via sine wave (~1s period at 30fps)
  const pulseOpacity = 0.5 + 0.5 * Math.sin((frame / 30) * Math.PI * 2);

  return (
    <AbsoluteFill
      style={{
        zIndex: Z.hookText + 5,
        height: BAR_HEIGHT,
        top: 0,
        left: 0,
        width: '100%',
        bottom: 'auto',
      }}
    >
      {/* Bar background */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: BAR_HEIGHT,
          background: 'rgba(0,0,0,0.6)',
          borderBottom: `1px solid rgba(34,211,238,0.2)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: LAYOUT.safeL,
          paddingRight: LAYOUT.safeR,
        }}
      >
        {/* Left: Pulsing dot + LIVE */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {/* Pulsing red dot */}
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: BRAND.coral,
              opacity: pulseOpacity,
              boxShadow: `0 0 8px ${BRAND.coral}`,
            }}
          />
          <span
            style={{
              fontFamily: MONO_FAMILY,
              fontSize: 22,
              fontWeight: 700,
              color: BRAND.coral,
              letterSpacing: '0.05em',
              lineHeight: 1,
            }}
          >
            LIVE
          </span>
        </div>

        {/* Center: Ticker + Price + Percent Change */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 10,
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          <span
            style={{
              fontFamily: MONO_FAMILY,
              fontSize: 26,
              fontWeight: 800,
              color: BRAND.text,
              letterSpacing: '0.04em',
              lineHeight: 1,
            }}
          >
            {ticker}
          </span>
          <span
            style={{
              fontFamily: MONO_FAMILY,
              fontSize: 26,
              fontWeight: 600,
              color: BRAND.textSecondary,
              letterSpacing: '0.02em',
              lineHeight: 1,
            }}
          >
            {price.toFixed(2)}
          </span>
          {!isV33 && (
            <span
              style={{
                fontFamily: MONO_FAMILY,
                fontSize: 20,
                fontWeight: 800,
                color: BRAND.emerald,
                letterSpacing: '0.02em',
                lineHeight: 1,
              }}
            >
              ▲ +1.34%
            </span>
          )}
        </div>

        {/* Right: Alert text */}
        <div style={{ flexShrink: 0 }}>
          <span
            style={{
              fontFamily: MONO_FAMILY,
              fontSize: 20,
              fontWeight: 600,
              color: BRAND.cyan,
              letterSpacing: '0.1em',
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            {alertText}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export default AlertTopBar;
