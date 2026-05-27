import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Sequence,
  staticFile
} from 'remotion';

export type FacelessShortsProps = {
  bgImage: string;
  captions: { text: string; startFrame: number; endFrame: number; highlight?: boolean }[];
  ticker: string;
};

export const FacelessShortsV4: React.FC<FacelessShortsProps> = ({ bgImage, captions, ticker }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // Ken Burns Effect: Slow zoom in
  const scale = interpolate(frame, [0, fps * 15], [1, 1.15], {
    extrapolateRight: 'clamp',
  });
  
  const yOffset = interpolate(frame, [0, fps * 15], [0, -50], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Background Image with Ken Burns */}
      <AbsoluteFill>
        <Img
          src={bgImage.startsWith('http') ? bgImage : staticFile(bgImage)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale}) translateY(${yOffset}px)`,
            filter: 'brightness(0.5) contrast(1.2)', // Darken for text readability
          }}
        />
      </AbsoluteFill>

      {/* Persistent Overlay: Branding */}
      <AbsoluteFill style={{ padding: 60, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{
            background: 'rgba(0,0,0,0.6)',
            padding: '15px 40px',
            borderRadius: 50,
            border: '2px solid rgba(255,255,255,0.2)',
            backdropFilter: 'blur(10px)',
            color: 'white',
            fontFamily: 'Inter, sans-serif',
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: 2
          }}>
            SIGNUM HQ | {ticker}
          </div>
        </div>
      </AbsoluteFill>

      {/* Dynamic TikTok-style Captions */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 80 }}>
        {captions.map((cap, i) => {
          return (
            <Sequence key={i} from={cap.startFrame} durationInFrames={cap.endFrame - cap.startFrame}>
              <CaptionWord text={cap.text} highlight={cap.highlight} />
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Component for popping words
const CaptionWord: React.FC<{ text: string, highlight?: boolean }> = ({ text, highlight }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const popScale = spring({
    fps,
    frame,
    config: { damping: 12, mass: 0.5, stiffness: 200 },
  });

  return (
    <div style={{
      color: highlight ? '#FF2A2A' : '#FFFFFF',
      fontFamily: 'Montserrat, sans-serif',
      fontWeight: 900,
      fontSize: highlight ? 130 : 110,
      textTransform: 'uppercase',
      textAlign: 'center',
      textShadow: '0px 10px 30px rgba(0,0,0,0.8), 0px 4px 10px rgba(0,0,0,0.9)',
      transform: `scale(${popScale})`,
      lineHeight: 1.1,
      WebkitTextStroke: highlight ? '3px #8B0000' : '2px rgba(0,0,0,0.5)',
    }}>
      {text}
    </div>
  );
};
