import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { TYPE } from '../brand/signumBrand';

interface KineticTextProps {
  text: string;
  fontSize: number;
  color: string;
  fontWeight?: number;
  delay?: number;
  stagger?: number;
  textShadow?: string;
  textAlign?: 'left' | 'center' | 'right';
  lineHeight?: number;
}

const KineticText: React.FC<KineticTextProps> = ({
  text,
  fontSize,
  color,
  fontWeight = 900,
  delay = 0,
  stagger = 2,
  textShadow,
  textAlign = 'center',
  lineHeight = 1.1,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(' ');

  const justifyMap: Record<string, string> = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: justifyMap[textAlign],
        lineHeight,
      }}
    >
      {words.map((word, i) => {
        const wordDelay = delay + i * stagger;
        const localFrame = frame - wordDelay;

        const springVal = spring({
          frame: Math.max(0, localFrame),
          fps,
          config: { damping: 14, stiffness: 280 },
        });

        const appeared = localFrame >= 0;

        const opacity = appeared ? springVal : 0;
        const scale = appeared
          ? interpolate(springVal, [0, 1], [1.2, 1.0])
          : 1.2;
        const translateY = appeared
          ? interpolate(springVal, [0, 1], [15, 0])
          : 15;

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              fontFamily: TYPE.family,
              fontSize,
              fontWeight,
              color,
              textShadow,
              opacity,
              transform: `scale(${scale}) translateY(${translateY}px)`,
              marginRight: fontSize * 0.25,
              willChange: 'transform, opacity',
            }}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

export default KineticText;
