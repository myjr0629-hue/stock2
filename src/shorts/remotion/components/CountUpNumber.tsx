import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import { TYPE } from '../brand/signumBrand';

interface CountUpNumberProps {
  target: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  delay?: number;
  fontSize: number;
  color: string;
  fontWeight?: number;
  textShadow?: string;
  formatFn?: (n: number) => string;
}

const defaultFormat = (n: number): string => n.toString();

const CountUpNumber: React.FC<CountUpNumberProps> = ({
  target,
  prefix = '',
  suffix = '',
  duration = 12,
  delay = 0,
  fontSize,
  color,
  fontWeight = 900,
  textShadow,
  formatFn = defaultFormat,
}) => {
  const frame = useCurrentFrame();

  const localFrame = frame - delay;

  const rawValue = interpolate(localFrame, [0, duration], [0, target], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const displayValue = localFrame >= duration ? target : Math.round(rawValue);

  const formatted = formatFn(displayValue);

  return (
    <span
      style={{
        fontFamily: TYPE.family,
        fontSize,
        fontWeight,
        color,
        textShadow,
        fontVariantNumeric: 'tabular-nums',
        display: 'inline-block',
        willChange: 'contents',
      }}
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
};

export default CountUpNumber;
