// ============================================================================
// HiddenWallShort V7 — INSIGHT MESSAGE REBUILD
// 21.5s total duration. Clear, concrete messaging.
// ============================================================================

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, Audio, staticFile } from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO } from '../brand/signumBrand';

import { CinematicBackground } from '../components/CinematicBackground';
import { BrandBug } from '../components/BrandBug';
import { ComplianceFooter } from '../components/ComplianceFooter';
import { WallLevelViz } from '../components/WallLevelViz';
import { CaptionOverlay } from '../components/CaptionOverlay';

export type HiddenWallShortProps = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

// ---------------------------------------------------------------------------
// 0.0-1.5s: Hook
// ---------------------------------------------------------------------------
const HookTextV7: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exit = interpolate(frame, [S(1.1), S(1.5)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const flash = interpolate(frame, [0, S(0.3)], [1, 0], { extrapolateRight: 'clamp' });
  const scanX = interpolate(frame, [0, S(1.5)], [-200, 1200]);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: exit, zIndex: Z.hookText }}>
      <div style={{ position: 'absolute', inset: 0, background: BRAND.cyan, opacity: flash * 0.15, mixBlendMode: 'screen' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: scanX, width: 60, background: `linear-gradient(90deg, transparent, ${BRAND.cyan}20, transparent)`, transform: 'skewX(-20deg)' }} />

      {['THE WALL', 'IS NOT ON', 'YOUR CHART'].map((line, i) => {
        const r = spring({ frame: Math.max(0, frame - i * 1.5), fps, config: { damping: 14, stiffness: 250, mass: 0.4 } });
        const isCyan = line === 'THE WALL';
        const isFocus = line === 'YOUR CHART';
        return (
          <div key={i} style={{
            color: isCyan ? BRAND.cyan : (isFocus ? '#ffffff' : '#f1f5f9'),
            fontSize: isFocus ? TYPE.hookSize + 15 : TYPE.hookSize,
            fontWeight: isFocus ? 900 : TYPE.hookWeight,
            fontFamily: TYPE.family, letterSpacing: TYPE.hookTracking,
            lineHeight: TYPE.hookLine, textAlign: 'center',
            opacity: isFocus ? r : r * 0.95,
            transform: `scale(${interpolate(r, [0, 1], [0.92, 1])})`,
            textShadow: isCyan ? SHADOW.cyan : SHADOW.hero,
          }}>
            {line}
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 1.5-4.0s: Concrete Payoff
// ---------------------------------------------------------------------------
const ConcretePayoffV7: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame: Math.max(0, frame - S(0.2)), fps, config: { damping: 16, stiffness: 180, mass: 0.4 } });
  const pulse = interpolate(frame % S(1), [0, S(0.2), S(1.0)], [0, 1, 0]);
  const exit = interpolate(frame, [S(2.1), S(2.5)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }); 

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: Math.min(r, exit), zIndex: Z.hookText }}>
      <div style={{
        position: 'absolute', width: 700, height: 260,
        borderTop: `4px solid ${BRAND.cyan}`, borderBottom: `4px solid ${BRAND.cyan}`,
        opacity: pulse * 0.4, transform: `scale(${interpolate(r, [0, 1], [1.2, 1])})`,
        clipPath: 'polygon(0 0, 10% 0, 10% 100%, 0 100%, 0 0, 100% 0, 100% 100%, 90% 100%, 90% 0, 100% 0)'
      }} />
      <div style={{ color: BRAND.text, fontSize: TYPE.titleSize - 15, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.04em', textShadow: SHADOW.hero, transform: `translateY(${(1 - r) * 15}px)` }}>SPY IS <span style={{color: BRAND.amber}}>1.3%</span></div>
      <div style={{ color: BRAND.textSecondary, fontSize: TYPE.titleSize - 20, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.04em', textShadow: SHADOW.caption, transform: `translateY(${(1 - r) * 18}px)` }}>FROM A HIDDEN</div>
      <div style={{ color: BRAND.coral, fontSize: TYPE.titleSize, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.08em', textShadow: SHADOW.coral, marginTop: -5, transform: `translateY(${(1 - r) * 22}px) scale(${1 + pulse * 0.05})`, filter: `brightness(${1 + pulse * 0.5})` }}>CALL WALL</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 4.0-7.0s: Contrast Text
// ---------------------------------------------------------------------------
const ContrastTextV7: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r1 = spring({ frame: Math.max(0, frame - S(0.2)), fps, config: { damping: 20, stiffness: 120, mass: 0.6 } });
  const r2 = spring({ frame: Math.max(0, frame - S(1.2)), fps, config: { damping: 20, stiffness: 120, mass: 0.6 } });
  const exit = interpolate(frame, [S(2.6), S(3.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: exit, zIndex: Z.hookText, marginTop: 200 }}>
      <div style={{ color: BRAND.text, fontSize: TYPE.captionEmphSize, fontWeight: TYPE.captionWeight, fontFamily: TYPE.family, opacity: r1, textShadow: SHADOW.caption, transform: `translateY(${(1 - r1) * 15}px)` }}>PRICE IS VISIBLE.</div>
      <div style={{ color: BRAND.cyan, fontSize: TYPE.captionEmphSize, fontWeight: TYPE.captionEmphWeight, fontFamily: TYPE.family, letterSpacing: '-0.02em', opacity: r2, textShadow: SHADOW.cyan, transform: `translateY(${(1 - r2) * 15}px)` }}>PRESSURE IS NOT.</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 7.0-10.5s: Meaning Text
// ---------------------------------------------------------------------------
const MeaningTextV7: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r1 = spring({ frame: Math.max(0, frame - S(0.5)), fps, config: { damping: 20, stiffness: 120, mass: 0.6 } });
  const r2 = spring({ frame: Math.max(0, frame - S(1.5)), fps, config: { damping: 20, stiffness: 120, mass: 0.6 } });
  const exit = interpolate(frame, [S(3.1), S(3.5)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: exit, zIndex: Z.hookText, marginTop: 200 }}>
      <div style={{ color: BRAND.textSecondary, fontSize: TYPE.captionSize - 10, fontWeight: TYPE.captionWeight, fontFamily: TYPE.family, opacity: r1, textShadow: SHADOW.caption, transform: `translateY(${(1 - r1) * 15}px)` }}>NOT A PREDICTION.</div>
      <div style={{ color: BRAND.purple, fontSize: TYPE.captionEmphSize - 6, fontWeight: TYPE.captionEmphWeight, fontFamily: TYPE.family, letterSpacing: '-0.02em', opacity: r2, textShadow: SHADOW.purple, transform: `translateY(${(1 - r2) * 15}px)` }}>A PRESSURE MAP.</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 10.5-15.5s: Product Need Toggle (Explicit Contrast)
// ---------------------------------------------------------------------------
const ProductNeedV7: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 22, stiffness: 100, mass: 0.7 } });
  
  // The toggle switches AT 2 SECONDS (frame 60)
  const toggleProgress = spring({ frame: Math.max(0, frame - S(2.0)), fps, config: { damping: 14, stiffness: 180 } });
  const exit = interpolate(frame, [S(4.6), S(5.0)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const isHiddenLayerOn = toggleProgress > 0.5;

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: Math.min(enter, exit), zIndex: Z.wallViz }}>
      
      {/* Central Visual Area */}
      <div style={{ position: 'absolute', top: 250, left: 100, right: 100, height: 500 }}>
        
        {/* Environment Shift */}
        <div style={{ position: 'absolute', inset: -150, background: BRAND.cyan, opacity: toggleProgress * 0.05, mixBlendMode: 'screen', filter: 'blur(50px)' }} />

        {/* Normal Chart (Visible before toggle, fades out completely) */}
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - toggleProgress }}>
          <svg width="880" height="300" viewBox="0 0 880 300" style={{ position: 'absolute', top: 50 }}>
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND.muted} stopOpacity={0.5} />
                <stop offset="100%" stopColor={BRAND.muted} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d="M 0,200 C 100,180 150,220 220,170 C 300,120 350,160 440,140 C 520,125 580,150 660,120 C 720,100 780,130 880,90"
              stroke={BRAND.mutedLight} strokeWidth={4} fill="none" strokeLinecap="round" />
            <path d="M 0,200 C 100,180 150,220 220,170 C 300,120 350,160 440,140 C 520,125 580,150 660,120 C 720,100 780,130 880,90 L 880,300 L 0,300 Z"
              fill="url(#chartGradient)" />
          </svg>
          <div style={{ position: 'absolute', top: 380, left: 0, right: 0, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ color: BRAND.muted, fontSize: TYPE.labelSize, fontFamily: TYPE.family, fontWeight: 700, letterSpacing: '0.1em' }}>NORMAL CHART</span>
            <span style={{ color: BRAND.text, fontSize: TYPE.labelSize + 4, fontFamily: TYPE.family, fontWeight: 900, opacity: 0.8 }}>PRICE ONLY</span>
          </div>
        </div>

        {/* Hidden Layer (Visible after toggle) with staggered reveal */}
        <div style={{ position: 'absolute', inset: 0 }}>
          <div style={{ opacity: interpolate(toggleProgress, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }) }}>
            <div style={{ position: 'absolute', top: 110, left: 0, right: 0, height: 6, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
            <div style={{ position: 'absolute', top: 60, right: 0, color: BRAND.coral, fontSize: TYPE.labelSize + 4, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL $600</div>
          </div>
          <div style={{ opacity: interpolate(toggleProgress, [0.4, 0.8], [0, 1], { extrapolateRight: 'clamp' }) }}>
            <div style={{ position: 'absolute', top: 280, left: 0, right: 0, height: 3, background: BRAND.emerald }} />
            <div style={{ position: 'absolute', top: 295, right: 0, color: BRAND.emerald, fontSize: TYPE.labelSize, fontWeight: 800, fontFamily: TYPE.family }}>PUT FLOOR $580</div>
          </div>
          <div style={{ opacity: interpolate(toggleProgress, [0.7, 1.0], [0, 1], { extrapolateRight: 'clamp' }) }}>
            <div style={{ position: 'absolute', top: 200, left: 0, right: 0, height: 3, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 12px, transparent 12px, transparent 24px)` }} />
            <div style={{ position: 'absolute', top: 165, left: 0, color: BRAND.purple, fontSize: TYPE.labelSize, fontWeight: 800, fontFamily: TYPE.family }}>GAMMA FLIP $588</div>
          </div>
          <div style={{ position: 'absolute', top: 380, left: 0, right: 0, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 5, opacity: toggleProgress }}>
            <span style={{ color: BRAND.cyan, fontSize: TYPE.labelSize, fontFamily: TYPE.family, fontWeight: 900, letterSpacing: '0.1em' }}>SIGNUMHQ LAYER</span>
            <span style={{ color: BRAND.text, fontSize: TYPE.labelSize + 4, fontFamily: TYPE.family, fontWeight: 900 }}>WALL / FLOOR / FLIP</span>
          </div>
        </div>

        {/* Toggle Switch */}
        <div style={{ position: 'absolute', top: 480, left: '50%', transform: 'translateX(-50%) scale(1.4)', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 60, height: 32, borderRadius: 16, background: isHiddenLayerOn ? BRAND.cyan : BRAND.muted, border: `2px solid ${isHiddenLayerOn ? BRAND.cyan : BRAND.mutedLight}`, transition: 'all 0.2s', position: 'relative', boxShadow: isHiddenLayerOn ? `0 0 20px ${BRAND.cyanGlow}` : 'none' }}>
            <div style={{ position: 'absolute', top: 2, left: isHiddenLayerOn ? 30 : 2, width: 24, height: 24, borderRadius: '50%', background: BRAND.text, transition: 'all 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 15.5-18.8s: Product Sentence Text
// ---------------------------------------------------------------------------
const ProductSentenceV7: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r1 = spring({ frame: Math.max(0, frame - S(0.2)), fps, config: { damping: 20, stiffness: 120, mass: 0.6 } });
  const r2 = spring({ frame: Math.max(0, frame - S(0.8)), fps, config: { damping: 20, stiffness: 120, mass: 0.6 } });
  const exit = interpolate(frame, [S(2.9), S(3.3)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: exit, zIndex: Z.hookText, marginTop: 100 }}>
      <div style={{ color: BRAND.text, fontSize: TYPE.titleSize - 10, fontWeight: 800, fontFamily: TYPE.family, opacity: r1, textShadow: SHADOW.caption, transform: `translateY(${(1 - r1) * 15}px)` }}>SIGNUMHQ TRACKS</div>
      <div style={{ color: BRAND.cyan, fontSize: TYPE.titleSize, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', opacity: r2, textShadow: SHADOW.cyan, transform: `translateY(${(1 - r2) * 15}px)` }}>THE HIDDEN LAYER.</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 18.8-21.5s: Brand CTA (2.7s strict)
// ---------------------------------------------------------------------------
const BrandCTAV7: React.FC<{ cta: string }> = ({ cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 18, stiffness: 140, mass: 0.6 } });
  const pulsePos = interpolate(frame % S(2), [0, S(2)], [-150, 500]); // Faster pulse
  const exit = interpolate(frame, [S(2.4), S(2.7)], [1, 0], { extrapolateRight: 'clamp' }); // Fade out

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: Math.min(r, exit), zIndex: Z.hookText }}>
      <div style={{ marginBottom: 40, transform: `scale(${interpolate(r, [0, 1], [0.8, 1])})` }}>
        <svg width="90" height="90" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.text} />
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 40, transform: `translateY(${(1 - r) * 15}px)` }}>
        <span style={{ color: BRAND.text, fontSize: 52, fontWeight: 900, letterSpacing: '0.18em', fontFamily: TYPE.family }}>SIGNUM</span>
        <span style={{ color: BRAND.cyan, fontSize: 52, fontWeight: 900, letterSpacing: '0.18em', fontFamily: TYPE.family, textShadow: SHADOW.cyan }}>HQ</span>
      </div>
      <div style={{ width: 180, height: 3, marginBottom: 40, background: BRAND.gradientCyanPurple, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: pulsePos, width: 80, background: 'linear-gradient(90deg, transparent, #fff, transparent)', boxShadow: '0 0 20px #fff' }} />
      </div>
      <div style={{ color: BRAND.text, fontSize: TYPE.titleSize - 5, fontWeight: 900, fontFamily: TYPE.family, textAlign: 'center', letterSpacing: '-0.01em', textShadow: SHADOW.hero, transform: `translateY(${(1 - r) * 20}px)` }}>{cta}</div>
      <div style={{ marginTop: 30, color: BRAND.cyan, fontSize: TYPE.brandSize + 6, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em', transform: `translateY(${(1 - r) * 25}px)`, textShadow: SHADOW.cyan }}>SIGNUMHQ.COM</div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// MAIN COMPOSITION (21.5s total)
// ---------------------------------------------------------------------------
export const HiddenWallShort: React.FC<HiddenWallShortProps> = (props) => {
  const { structureVisual, disclaimer, cta = 'SEE WHAT OTHERS CANNOT.', broll } = props;
  const brollSrc = broll && !broll.isMock ? broll.url : 'shorts/wall_broll_v4.png';

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <CinematicBackground brollSrc={brollSrc} />

      {/* 0.0 - 10.5s: Main Wall Viz (covers hook, payoff, contrast, meaning) */}
      {structureVisual && (
        <Sequence from={0} durationInFrames={S(10.5)}>
          <div style={{ position: 'absolute', top: 300, left: 0, right: 0 }}>
            <WallLevelViz data={structureVisual} enterFrame={0} />
          </div>
        </Sequence>
      )}

      {/* 0.0 - 1.5s: Hook */}
      <Sequence from={0} durationInFrames={S(1.5)}>
        <HookTextV7 />
      </Sequence>

      {/* 1.5 - 4.0s: Concrete Payoff */}
      <Sequence from={S(1.5)} durationInFrames={S(2.5)}>
        <ConcretePayoffV7 />
      </Sequence>

      {/* 4.0 - 7.0s: Contrast Text */}
      <Sequence from={S(4.0)} durationInFrames={S(3.0)}>
        <ContrastTextV7 />
      </Sequence>

      {/* 7.0 - 10.5s: Map Meaning */}
      <Sequence from={S(7.0)} durationInFrames={S(3.5)}>
        <MeaningTextV7 />
      </Sequence>

      {/* 10.5 - 15.5s: Product Need Toggle */}
      <Sequence from={S(10.5)} durationInFrames={S(5.0)}>
        <ProductNeedV7 />
      </Sequence>

      {/* 15.5 - 18.8s: Product Sentence Text */}
      <Sequence from={S(15.5)} durationInFrames={S(3.3)}>
        <ProductSentenceV7 />
      </Sequence>

      {/* 18.8 - 21.5s: CTA */}
      <Sequence from={S(18.8)} durationInFrames={S(2.7)}>
        <BrandCTAV7 cta={cta} />
      </Sequence>

      {/* Persistent UI */}
      <Sequence from={0} durationInFrames={S(18.8)}>
        <BrandBug />
      </Sequence>
      <ComplianceFooter text={disclaimer} />
      
      {/* Captions */}
      {props.captions && props.captions.length > 0 && (
        <CaptionOverlay captions={props.captions} />
      )}

      {/* AUDIO LAYER (Requires real MP3 assets to pass FFprobe) */}
      {/* 
      <Audio src={staticFile('shorts/audio/bed.mp3')} volume={0.15} />
      <Audio src={staticFile('shorts/audio/v6_voice.mp3')} volume={0.8} />
      */}

      {/* SFX Timing (Commented out for mock render) */}
      {/* 
      <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/impact.mp3')} volume={0.3} /></Sequence>
      <Sequence from={S(1.5)}><Audio src={staticFile('shorts/audio/scan.mp3')} volume={0.2} /></Sequence>
      <Sequence from={S(2.2)}><Audio src={staticFile('shorts/audio/lock.mp3')} volume={0.4} /></Sequence>
      <Sequence from={S(4.0)}><Audio src={staticFile('shorts/audio/hum.mp3')} volume={0.15} /></Sequence>
      <Sequence from={S(5.5)}><Audio src={staticFile('shorts/audio/tick.mp3')} volume={0.3} /></Sequence>
      <Sequence from={S(7.0)}><Audio src={staticFile('shorts/audio/layer.mp3')} volume={0.3} /></Sequence>
      <Sequence from={S(10.5)}><Audio src={staticFile('shorts/audio/lowpass.mp3')} volume={0.25} /></Sequence>
      <Sequence from={S(12.5)}><Audio src={staticFile('shorts/audio/click.mp3')} volume={0.4} /></Sequence>
      <Sequence from={S(13.2)}><Audio src={staticFile('shorts/audio/reveal.mp3')} volume={0.3} /></Sequence>
      <Sequence from={S(18.8)}><Audio src={staticFile('shorts/audio/brand.mp3')} volume={0.4} /></Sequence>
      <Sequence from={S(21.0)}><Audio src={staticFile('shorts/audio/pulse.mp3')} volume={0.4} /></Sequence>
      */}

      {/* ProgressBar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: 'rgba(255,255,255,0.05)', zIndex: Z.progress }}>
        <div style={{ height: '100%', width: `${(useCurrentFrame() / useVideoConfig().durationInFrames) * 100}%`, background: BRAND.gradientCyanPurple }} />
      </div>
    </AbsoluteFill>
  );
};
