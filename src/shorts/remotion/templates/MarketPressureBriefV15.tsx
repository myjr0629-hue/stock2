// ============================================================================
// MarketPressureBrief V15 — Creative Rebuild (Hidden Layer Reveal)
// ============================================================================

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Img, Audio } from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';

export type MarketPressureBriefProps = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const SCALE = {
  hero: 110,
  insight: 90,
  number: 130,
  support: 48,
  mapLabel: 42,
  disclaimer: 22,
};

// ----------------------------------------------------------------------------
// Replicate / Flux Background Layer (Atmosphere Only)
// ----------------------------------------------------------------------------
const HiddenLayerAtmosphere: React.FC = () => {
  const frame = useCurrentFrame();
  
  // 0.0-1.2s: Pure black (Normal chart)
  // 1.2s: Hidden Wall Slam
  const revealOpacity = interpolate(frame, [S(1.1), S(1.2), S(10.5)], [0, 1, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  
  // Flash at 1.2s for impact
  const flash = interpolate(frame, [S(1.2), S(1.3), S(1.5)], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <AbsoluteFill style={{ opacity: revealOpacity }}>
        <Img src={staticFile('assets/v15_hidden_wall.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: BRAND.text, opacity: flash, zIndex: Z.surface - 1 }} />
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------------------
// 0.0-1.2s: Pattern Interrupt (SPY LOOKS NORMAL)
// ----------------------------------------------------------------------------
const PatternInterrupt: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [S(1.1), S(1.2)], [1, 0], { extrapolateRight: 'clamp' });
  
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity, zIndex: Z.surface }}>
      {/* Deceptively calm price line */}
      <div style={{ width: 800, height: 4, backgroundColor: BRAND.text, opacity: 0.8, borderRadius: 2 }} />
      <div style={{
        position: 'absolute', top: 300,
        color: BRAND.text, fontSize: SCALE.hero, fontWeight: 900, fontFamily: TYPE.family,
        textAlign: 'center', lineHeight: 1.1, textShadow: SHADOW.text
      }}>
        SPY LOOKS<br/>NORMAL.
      </div>
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------------------
// 1.2-2.8s: Hidden Event Reveal (THE WALL IS 1.3% AWAY)
// ----------------------------------------------------------------------------
const HiddenEventReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const pop = spring({ frame: frame - S(1.2), fps, config: { damping: 12, stiffness: 300 } });
  const opacity = interpolate(frame, [S(2.7), S(2.8)], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const active = frame >= S(1.2) && frame < S(2.8);

  if (!active) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity, zIndex: Z.surface + 10 }}>
      {/* Hidden Structure Graphic */}
      <div style={{ 
        position: 'absolute', top: 800, width: 800, height: 40, 
        backgroundColor: BRAND.red, opacity: 0.9,
        transform: `scaleX(${pop})`, boxShadow: '0px 0px 40px rgba(239, 68, 68, 0.5)'
      }} />
      <div style={{
        position: 'absolute', top: 300,
        color: BRAND.text, fontSize: SCALE.hero, fontWeight: 900, fontFamily: TYPE.family,
        textAlign: 'center', lineHeight: 1.1, textShadow: SHADOW.text,
        transform: `scale(${interpolate(pop, [0,1], [0.9,1])})`
      }}>
        THE WALL IS<br/>
        <span style={{ color: BRAND.red }}>1.3% AWAY.</span>
      </div>
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------------------
// 2.8-4.8s: Missing Layer Hook (MOST CHARTS MISS THIS)
// ----------------------------------------------------------------------------
const MissingLayerHook: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [S(2.8), S(3.0), S(4.7), S(4.8)], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const active = frame >= S(2.8) && frame < S(4.8);

  if (!active) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity, zIndex: Z.surface + 10 }}>
      <div style={{
        color: BRAND.text, fontSize: SCALE.insight, fontWeight: 700, fontFamily: TYPE.family,
        textAlign: 'center', lineHeight: 1.2, textShadow: SHADOW.text
      }}>
        MOST CHARTS<br/>MISS THIS.
      </div>
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------------------
// 4.8-7.2s: Why Care (PRESSURE CAN BUILD HERE)
// ----------------------------------------------------------------------------
const PressureBuild: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Spatial squeeze effect
  const squeeze = interpolate(frame, [S(4.8), S(6.0)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pulse = Math.sin((frame - S(4.8)) * 0.5) * 0.1 + 1; // Pulse 1.0 to 1.1

  const opacity = interpolate(frame, [S(4.8), S(5.0), S(7.1), S(7.2)], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const active = frame >= S(4.8) && frame < S(7.2);

  if (!active) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity, zIndex: Z.surface + 10 }}>
      {/* Squeezing gap */}
      <div style={{ position: 'absolute', top: 750, height: 100 - (squeeze * 40), width: 400, borderLeft: `8px solid ${BRAND.red}`, borderRight: `8px solid ${BRAND.red}`, opacity: 0.8 }} />
      
      <div style={{
        position: 'absolute', top: 350,
        color: BRAND.text, fontSize: SCALE.insight, fontWeight: 700, fontFamily: TYPE.family,
        textAlign: 'center', lineHeight: 1.2, textShadow: SHADOW.text,
        transform: `scale(${pulse})`
      }}>
        PRESSURE CAN<br/>
        <span style={{ color: BRAND.red }}>BUILD HERE.</span>
      </div>
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------------------
// 7.2-10.5s: Map Definition (NOT A PREDICTION. A PRESSURE MAP.)
// ----------------------------------------------------------------------------
const MapDefinition: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [S(7.2), S(7.4), S(10.4), S(10.5)], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const active = frame >= S(7.2) && frame < S(10.5);

  if (!active) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity, zIndex: Z.surface + 10 }}>
      <div style={{
        color: BRAND.textSecondary, fontSize: SCALE.insight, fontWeight: 700, fontFamily: TYPE.family,
        textAlign: 'center', lineHeight: 1.2, textShadow: SHADOW.text
      }}>
        NOT A PREDICTION.<br/>
        <span style={{ color: BRAND.text }}>A PRESSURE MAP.</span>
      </div>
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------------------
// 10.5-15.5s: Product Reveal (NORMAL vs SIGNUMHQ)
// ----------------------------------------------------------------------------
const ProductReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [S(10.5), S(10.7), S(15.4), S(15.5)], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const active = frame >= S(10.5) && frame < S(15.5);

  if (!active) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity, zIndex: Z.surface + 10, backgroundColor: BRAND.bg }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
        {/* Top Half: Normal */}
        <div style={{ flex: 1, borderBottom: `2px solid #333`, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 50, left: 50, color: BRAND.textSecondary, fontSize: 36, fontFamily: TYPE.family, fontWeight: 700 }}>NORMAL CHART</div>
          <div style={{ width: 800, height: 4, backgroundColor: '#444' }} />
        </div>
        
        {/* Bottom Half: SignumHQ */}
        <div style={{ flex: 1, backgroundColor: '#111', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 50, left: 50, color: BRAND.cyan, fontSize: 36, fontFamily: TYPE.family, fontWeight: 900 }}>SIGNUMHQ LAYER</div>
          
          <div style={{ position: 'absolute', top: 150, width: 800, height: 20, backgroundColor: BRAND.red }} />
          <div style={{ position: 'absolute', top: 250, width: 800, height: 4, backgroundColor: BRAND.text }} />
          <div style={{ position: 'absolute', top: 350, width: 800, height: 20, backgroundColor: BRAND.green }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------------------
// 15.5-18.5s: Product Promise
// ----------------------------------------------------------------------------
const ProductPromise: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [S(15.5), S(15.7), S(18.4), S(18.5)], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const active = frame >= S(15.5) && frame < S(18.5);

  if (!active) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity, zIndex: Z.surface + 10, backgroundColor: BRAND.bg }}>
       <div style={{
        color: BRAND.text, fontSize: SCALE.hero, fontWeight: 900, fontFamily: TYPE.family,
        textAlign: 'center', lineHeight: 1.1, textShadow: SHADOW.text
      }}>
        SEE THE<br/>
        <span style={{ color: BRAND.cyan }}>STRUCTURE</span><br/>
        BEHIND PRICE.
      </div>
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------------------
// 18.5-20.5s: CTA
// ----------------------------------------------------------------------------
const OutroCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - S(18.5), fps, config: { damping: 14 } });
  
  const opacity = interpolate(frame, [S(18.5), S(18.7)], [0, 1], { extrapolateRight: 'clamp' });
  const active = frame >= S(18.5);

  if (!active) return null;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity, backgroundColor: BRAND.bg, zIndex: Z.surface + 20 }}>
      <div style={{ transform: `scale(${pop})` }}>
        <svg width="120" height="120" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.cyan} />
        </svg>
      </div>
      <div style={{
        color: BRAND.text, fontSize: 80, fontWeight: 900, fontFamily: TYPE.family,
        marginTop: 40, letterSpacing: '0.05em'
      }}>
        SIGNUMHQ.COM
      </div>
    </AbsoluteFill>
  );
};

// ----------------------------------------------------------------------------
// Audio Layer (Fallback to v14 segments + SFX)
// ----------------------------------------------------------------------------
const AudioLayerV15: React.FC = () => {
  return (
    <Sequence>
      {/* SFX Tracks matching V15 timeline */}
      <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
      <Sequence from={S(1.2)}><Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.8} /></Sequence>
      <Sequence from={S(2.8)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.6} /></Sequence>
      <Sequence from={S(4.8)}><Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.7} /></Sequence>
      <Sequence from={S(7.2)}><Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.5} /></Sequence>
      <Sequence from={S(10.5)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.8} /></Sequence>
      <Sequence from={S(15.5)}><Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.5} /></Sequence>
      <Sequence from={S(18.5)}><Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.7} /></Sequence>

      {/* Tension Bed */}
      <Sequence from={S(0)}>
        <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.15} />
      </Sequence>
      
      {/* Voiceover (Using v14 files as timing placeholders until Lambda automates real TTS) */}
      <Sequence from={S(0.0)}><Audio src={staticFile('shorts/audio/v14_01.mp3')} volume={0.9} /></Sequence>
      <Sequence from={S(2.8)}><Audio src={staticFile('shorts/audio/v14_02.mp3')} volume={0.9} /></Sequence>
      <Sequence from={S(4.8)}><Audio src={staticFile('shorts/audio/v14_03.mp3')} volume={0.9} /></Sequence>
      <Sequence from={S(7.2)}><Audio src={staticFile('shorts/audio/v14_04.mp3')} volume={0.9} /></Sequence>
      <Sequence from={S(10.5)}><Audio src={staticFile('shorts/audio/v14_05.mp3')} volume={0.9} /></Sequence>
      <Sequence from={S(15.5)}><Audio src={staticFile('shorts/audio/v14_06.mp3')} volume={0.9} /></Sequence>
    </Sequence>
  );
};

export const MarketPressureBriefV15: React.FC<MarketPressureBriefProps> = (props) => {
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <HiddenLayerAtmosphere />
      
      <PatternInterrupt />
      <HiddenEventReveal />
      <MissingLayerHook />
      <PressureBuild />
      <MapDefinition />
      <ProductReveal />
      <ProductPromise />
      <OutroCTA />

      <ComplianceFooter />
      <AudioLayerV15 />
    </AbsoluteFill>
  );
};
