// ============================================================================
// MarketPressureBrief V13 — Hybrid Winner Cut
// ============================================================================

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Img, Audio } from 'remotion';
import type { ShortsVideoInput, CaptionSegment } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO } from '../brand/signumBrand';
import { ComplianceFooter } from '../components/ComplianceFooter';

export type MarketPressureBriefProps = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const SCALE = {
  hero: 100,
  insight: 90,
  number: 110,
  support: 48,
  mapLabel: 42,
  disclaimer: 22,
};

const DynamicBrandBug: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [S(2.2), S(2.5), S(17.8), S(18.2)],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  );

  return (
    <div style={{ position: 'absolute', top: 50, left: 50, zIndex: Z.brand, opacity }}>
      <svg width="40" height="40" viewBox="246 247 530 530" fill="none">
        <path d={SG_LOGO.upper} fill={BRAND.text} />
        <path d={SG_LOGO.lower} fill={BRAND.cyan} />
      </svg>
      <div style={{ color: BRAND.textSecondary, fontSize: 18, fontWeight: 700, fontFamily: TYPE.family, marginTop: 4, letterSpacing: '0.1em' }}>
        SIGNUMHQ
      </div>
    </div>
  );
};

const SparseCaptions: React.FC<{ captions: CaptionSegment[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ position: 'absolute', bottom: 120, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: Z.caption }}>
      {captions.map((cap) => {
        const start = cap.startFrame;
        const end = cap.endFrame;
        if (frame >= start && frame < end) {
          const pop = spring({ frame: frame - start, fps, config: { damping: 14, stiffness: 200 } });
          const exit = interpolate(frame, [end - 10, end], [1, 0], { extrapolateRight: 'clamp' });
          return (
            <div key={cap.id} style={{
              background: cap.emphasis ? BRAND.cyan : 'rgba(5, 10, 20, 0.9)',
              color: cap.emphasis ? '#000' : '#fff',
              padding: '12px 24px',
              borderRadius: '8px',
              fontSize: 32,
              fontWeight: 800,
              fontFamily: TYPE.family,
              letterSpacing: '0.05em',
              transform: `scale(${interpolate(pop, [0, 1], [0.8, 1])}) translateY(${(1 - pop) * 20}px)`,
              opacity: Math.min(pop, exit),
              boxShadow: cap.emphasis ? `0 0 20px ${BRAND.cyan}` : 'none'
            }}>
              {cap.text}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
};

// 0.0 - 2.2s
const SPYShockHookV13: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slam = spring({ frame, fps, config: { damping: 12, stiffness: 400, mass: 0.4 } });
  const exit = interpolate(frame, [S(2.0), S(2.2)], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: exit, zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v13_01.mp3')} volume={0.8} />
      <Audio src={staticFile('shorts/audio/v11_sfx_impact.mp3')} volume={0.3} />
      
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, transform: `scale(${interpolate(slam, [0, 1], [1.4, 1])})` }}>
        <div style={{ color: '#ffffff', fontSize: SCALE.hero, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, lineHeight: 1.1, opacity: slam }}>
          SPY <span style={{ color: BRAND.amber }}>1.3%</span>
        </div>
        <div style={{ color: '#ffffff', fontSize: SCALE.hero, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, lineHeight: 1.1, opacity: slam }}>
          FROM A WALL
        </div>
        <div style={{ color: BRAND.cyan, fontSize: SCALE.hero - 20, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.cyan, lineHeight: 1.1, opacity: slam }}>
          MOST CHARTS
        </div>
        <div style={{ color: BRAND.cyan, fontSize: SCALE.hero - 20, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.cyan, lineHeight: 1.1, opacity: slam }}>
          DO NOT SHOW
        </div>
      </div>
    </div>
  );
};

// 2.2 - 4.8s
const ConcretePayoffV13: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drop = spring({ frame, fps, config: { damping: 14, stiffness: 250, mass: 0.5 } });
  const exit = interpolate(frame, [S(2.4), S(2.6)], [1, 0], { extrapolateRight: 'clamp' }); 

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: Math.min(drop, exit), zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.2} />

      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, transform: `translateY(${(1 - drop) * -40}px)` }}>
          SPY IS <span style={{ color: BRAND.amber, fontSize: SCALE.number, textShadow: SHADOW.amber }}>1.3%</span>
        </div>
        <div style={{ color: BRAND.textSecondary, fontSize: SCALE.support, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.04em', marginTop: 10, transform: `translateY(${(1 - drop) * -20}px)` }}>
          BELOW A HIDDEN
        </div>
        <div style={{ color: BRAND.coral, fontSize: SCALE.insight + 10, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.02em', textShadow: SHADOW.coral, marginTop: -5, transform: `translateY(${(1 - drop) * -10}px)` }}>
          CALL WALL
        </div>
      </div>
    </div>
  );
};

// 4.8 - 7.5s
const WhyCareTextV13: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 220 } });
  const exit = interpolate(frame, [S(2.5), S(2.7)], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: Math.min(pop, exit), zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v13_02.mp3')} volume={0.8} />
      <Audio src={staticFile('shorts/audio/v11_sfx_pressure.mp3')} volume={0.25} />
      
      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, transform: `scale(${interpolate(pop, [0, 1], [0.9, 1])})` }}>
          THIS IS WHERE
        </div>
        <div style={{ color: BRAND.coral, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.coral, marginTop: 10, transform: `scale(${interpolate(pop, [0, 1], [0.95, 1])})` }}>
          PRESSURE CAN BUILD
        </div>
      </div>
    </div>
  );
};

// 7.5 - 10.5s
const FOMOMissingLayerV13: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });
  const exit = interpolate(frame, [S(2.8), S(3.0)], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: Math.min(pop, exit), zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v13_03.mp3')} volume={0.8} />
      <Audio src={staticFile('shorts/audio/v11_sfx_scan.mp3')} volume={0.2} />

      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, transform: `translateY(${(1 - pop) * 20}px)` }}>
          YOUR CHART
        </div>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, marginTop: 10, transform: `translateY(${(1 - pop) * 30}px)` }}>
          IS MISSING
        </div>
        <div style={{ color: BRAND.cyan, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.cyan, marginTop: 10, transform: `translateY(${(1 - pop) * 40}px)` }}>
          THIS LAYER
        </div>
      </div>
    </div>
  );
};

// 10.5 - 14.5s
const PressureMapV13: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 220 } });
  const exit = interpolate(frame, [S(3.7), S(4.0)], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: Math.min(pop, exit), zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v13_04.mp3')} volume={0.8} />
      {frame >= S(1.5) && <Audio src={staticFile('shorts/audio/v13_05.mp3')} volume={0.8} />}
      <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.2} />

      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ color: BRAND.textSecondary, fontSize: SCALE.insight - 10, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.caption, transform: `translateY(${(1 - pop) * 20}px)` }}>
          NOT A PREDICTION.
        </div>
        <div style={{ color: BRAND.purple, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.purple, marginTop: 10, transform: `translateY(${(1 - pop) * 30}px)` }}>
          A PRESSURE MAP.
        </div>
      </div>
    </div>
  );
};

// 14.5 - 18.2s
const ProductDifferenceV13: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const split = spring({ frame, fps, config: { damping: 12, stiffness: 280, mass: 0.6 } });
  const exit = interpolate(frame, [S(3.5), S(3.7)], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: exit, zIndex: Z.wallViz + 10, background: BRAND.bg }}>
      <Audio src={staticFile('shorts/audio/v13_06.mp3')} volume={0.8} />
      <Audio src={staticFile('shorts/audio/v11_sfx_lock.mp3')} volume={0.2} />
      
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: '#0a0d14', borderBottom: `2px dashed ${BRAND.mutedLight}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `translateY(${interpolate(split, [0, 1], [-960, 0])}px)` }}>
        <div style={{ color: BRAND.muted, fontSize: SCALE.support, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>NORMAL CHART</div>
        <div style={{ color: '#ffffff', fontSize: SCALE.insight - 10, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', marginTop: 10 }}>PRICE ONLY</div>
        <svg width="600" height="150" viewBox="0 0 600 150" style={{ marginTop: 60 }}>
          <path d="M 0,100 C 100,80 150,120 220,70 C 300,20 350,60 440,40 C 520,25 580,50 600,20" stroke={BRAND.mutedLight} strokeWidth={6} fill="none" strokeLinecap="round" />
        </svg>
      </div>

      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '50%', background: `radial-gradient(circle at center, ${BRAND.cyan}15 0%, ${BRAND.bg} 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `translateY(${interpolate(split, [0, 1], [960, 0])}px)` }}>
        <div style={{ position: 'absolute', top: 150, left: 100, right: 100, height: 6, background: BRAND.coral, boxShadow: `0 0 30px ${BRAND.coral}` }} />
        <div style={{ position: 'absolute', top: 100, right: 100, color: BRAND.coral, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL $600</div>
        
        <div style={{ position: 'absolute', top: 250, left: 100, right: 200, height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
        <div style={{ position: 'absolute', top: 200, left: 100, color: BRAND.purple, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family }}>GAMMA FLIP $588</div>

        <div style={{ position: 'absolute', top: 350, left: 100, right: 100, height: 6, background: BRAND.emerald, boxShadow: `0 0 30px ${BRAND.emerald}` }} />
        <div style={{ position: 'absolute', top: 370, right: 100, color: BRAND.emerald, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family }}>PUT FLOOR $580</div>

        <div style={{ zIndex: 10, textAlign: 'center', marginTop: 150, background: 'rgba(5,10,20,0.85)', padding: '20px 60px', borderRadius: 20, border: `2px solid ${BRAND.cyan}` }}>
          <div style={{ color: BRAND.cyan, fontSize: SCALE.support, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>SIGNUMHQ LAYER</div>
          <div style={{ color: '#ffffff', fontSize: SCALE.insight - 10, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', marginTop: 10 }}>WALL / FLOOR / FLIP</div>
        </div>
      </div>
    </div>
  );
};

// 18.2 - 21.5s
const BrandCTAV13: React.FC<{ cta: string }> = ({ cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 14, stiffness: 240 } });
  const scan = interpolate(frame % S(1.5), [0, S(1.5)], [-150, 400]);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: r, zIndex: Z.hookText }}>
      <Audio src={staticFile('shorts/audio/v11_sfx_pulse.mp3')} volume={0.2} />

      <div style={{ marginBottom: 60, transform: `scale(${interpolate(r, [0, 1], [0.8, 1])})` }}>
        <svg width="180" height="180" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.text} />
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 60, transform: `translateY(${(1 - r) * 20}px)` }}>
        <span style={{ color: BRAND.text, fontSize: 100, fontWeight: 900, letterSpacing: '0.18em', fontFamily: TYPE.family }}>SIGNUM</span>
        <span style={{ color: BRAND.cyan, fontSize: 100, fontWeight: 900, letterSpacing: '0.18em', fontFamily: TYPE.family, textShadow: SHADOW.cyan }}>HQ</span>
      </div>
      <div style={{ width: 300, height: 6, marginBottom: 60, background: BRAND.gradientCyanPurple, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: scan, width: 60, background: 'linear-gradient(90deg, transparent, #fff, transparent)' }} />
      </div>
      <div style={{ color: BRAND.text, fontSize: SCALE.insight - 30, fontWeight: 900, fontFamily: TYPE.family, textAlign: 'center', letterSpacing: '-0.01em', textShadow: SHADOW.hero, transform: `translateY(${(1 - r) * 30}px)` }}>
        {cta}
      </div>
      <div style={{ marginTop: 50, color: BRAND.cyan, fontSize: SCALE.support + 10, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em', textShadow: SHADOW.cyan, transform: `translateY(${(1 - r) * 40}px)` }}>
        SIGNUMHQ.COM
      </div>
    </div>
  );
};

const ProceduralDataLayerV13: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase logic
  // 0.0-2.2s: Immediate impact, line and wall visible, bracket starts
  // 2.2-4.8s: Bracket locked
  // 4.8-7.5s: Pulse/Pressure
  // 7.5-10.5s: Map revealing (fading normal out)
  // 10.5-14.5s: Fully assembled map
  const isPhase1 = frame < S(4.8); 
  const isPhase2 = frame >= S(4.8) && frame < S(7.5);
  const isPhase3 = frame >= S(7.5) && frame < S(14.5);
  
  if (!isPhase1 && !isPhase2 && !isPhase3) return null;

  const { price, callWall, putFloor, gammaFlipLevel } = data;
  if (!callWall || !putFloor) return null;

  const range = callWall - putFloor;
  const pad = range * 0.25;
  const vMin = putFloor - pad;
  const vMax = callWall + pad;
  const toY = (v: number) => 100 + (1 - (v - vMin) / (vMax - vMin)) * 700;

  const wallY = toY(callWall);
  let priceY = toY(price);
  
  if (isPhase2) {
    const approach = interpolate(frame, [S(4.8), S(7.5)], [0, 0.8], { extrapolateRight: 'clamp' });
    priceY = toY(price) + (toY(callWall) - toY(price)) * approach * 0.35;
  }

  const bracketGrow = spring({ frame, fps, config: { damping: 12, stiffness: 240 } });
  const bracketH = Math.max(0, priceY - wallY);
  
  const mapFrame = isPhase3 ? Math.max(0, frame - S(8.0)) : 0;
  const scale = 1;
  const translateY = isPhase3 ? 50 : 150;

  const cameraStyle: React.CSSProperties = {
    position: 'absolute', top: 300, left: 0, width: 1080, height: 900,
    zIndex: Z.wallViz,
    transform: `scale(${scale}) translateY(${translateY}px)`,
    transformOrigin: 'center center',
  };

  const wallBrightness = isPhase2 ? interpolate(frame, [S(4.8), S(6.0)], [0.4, 0.8], { extrapolateRight: 'clamp' }) : 0.4;
  const pulseScale = isPhase2 ? interpolate(Math.sin((frame - S(4.8)) * 0.3), [-1, 1], [1, 1.5]) : 1;

  return (
    <div style={cameraStyle}>
      <div style={{ position: 'absolute', left: 60, right: 60, top: wallY - 200, height: 200, background: `linear-gradient(180deg, ${BRAND.coral}05 0%, ${BRAND.coral}15 100%)`, borderTop: `2px solid rgba(255,100,100,${wallBrightness})`, borderLeft: `2px solid rgba(255,100,100,${wallBrightness})`, borderRight: `2px solid rgba(255,100,100,${wallBrightness})`, backdropFilter: 'blur(8px)' }} />
      <div style={{ position: 'absolute', left: 60, right: 60, top: wallY - 4, height: 8, background: BRAND.coral, boxShadow: `0 0 20px ${BRAND.coral}` }} />

      {isPhase2 && (
        <div style={{ position: 'absolute', left: 100, right: 350, top: wallY + 4, height: Math.max(0, priceY - wallY - 4), background: `linear-gradient(180deg, ${BRAND.coral}40 0%, ${BRAND.cyan}15 50%, transparent 100%)`, borderLeft: `2px dashed ${BRAND.coral}40`, opacity: interpolate(frame, [S(4.8), S(5.5)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }} />
      )}

      {bracketGrow > 0 && (
        <div style={{ position: 'absolute', right: 330, top: wallY, height: bracketH, width: 20, borderRight: `6px solid ${BRAND.amber}`, borderTop: `6px solid ${BRAND.amber}`, borderBottom: `6px solid ${BRAND.amber}`, boxShadow: `inset -10px 0 20px ${BRAND.amberGlow}`, transformOrigin: 'top right', transform: `scaleY(${bracketGrow})` }} />
      )}

      {/* 1.3% is the hero */}
      {bracketGrow > 0 && (
        <div style={{ position: 'absolute', right: 120, top: wallY + bracketH / 2 - 40, opacity: bracketGrow }}>
          <div style={{ color: BRAND.amber, fontSize: SCALE.number, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.amber }}>1.3%</div>
        </div>
      )}

      <div style={{ position: 'absolute', left: 60, top: priceY - 2, height: 8, width: 600, background: BRAND.cyan, boxShadow: `0 0 20px ${BRAND.cyan}`, borderRadius: 4 }} />
      <div style={{ position: 'absolute', left: 644, top: priceY - 16, width: 32, height: 32, borderRadius: '50%', background: BRAND.text, border: `6px solid ${BRAND.cyan}`, boxShadow: `0 0 20px ${BRAND.cyan}`, transform: `scale(${pulseScale})` }} />

      {/* SPY Price is hidden / small / reduced opacity */}
      <div style={{ position: 'absolute', left: 700, top: priceY - 10, opacity: 0.4 }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.mapLabel - 15, fontWeight: 700, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>SPY PRICE</div>
        <div style={{ color: BRAND.cyan, fontSize: SCALE.mapLabel - 5, fontWeight: 800, fontFamily: TYPE.family, textShadow: 'none', letterSpacing: '0em', marginTop: -2 }}>${price.toFixed(2)}</div>
      </div>

      {isPhase3 && mapFrame > 0 && (
        <div style={{ opacity: interpolate(mapFrame, [0, S(0.5)], [0, 1], { extrapolateRight: 'clamp' }) }}>
          <div style={{ position: 'absolute', left: 60, right: 300, top: toY(putFloor) - 2, height: 6, background: BRAND.emerald, boxShadow: `0 0 20px ${BRAND.emerald}` }} />
          <div style={{ position: 'absolute', right: 80, top: toY(putFloor) + 10, textAlign: 'right' }}>
            <div style={{ color: BRAND.emerald, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>PUT FLOOR</div>
            <div style={{ color: BRAND.text, fontSize: SCALE.mapLabel + 10, fontWeight: 900, fontFamily: TYPE.family }}>${putFloor}</div>
          </div>
          {gammaFlipLevel && (
            <>
              <div style={{ position: 'absolute', left: 60, top: toY(gammaFlipLevel), width: 450, height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
              <div style={{ position: 'absolute', left: 80, top: toY(gammaFlipLevel) - 70, textAlign: 'left' }}>
                <div style={{ color: BRAND.purple, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>GAMMA FLIP</div>
                <div style={{ color: BRAND.text, fontSize: SCALE.mapLabel + 10, fontWeight: 900, fontFamily: TYPE.family }}>${gammaFlipLevel}</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const AtmosphereV13: React.FC = () => {
  const frame = useCurrentFrame();
  const isPressureVisible = (frame >= S(2.2) && frame < S(14.5));
  
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundColor: BRAND.bg }}>
      <Audio src={staticFile('shorts/audio/v11_bed.mp3')} volume={0.15} />
      <Img src={staticFile('shorts/broll/hook_v10.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }} />
      {isPressureVisible && (
        <Img src={staticFile('shorts/broll/pressure_v9a.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: interpolate(frame, [S(2.2), S(4.8), S(14.0), S(14.5)], [0, 0.4, 0.4, 0], { extrapolateRight: 'clamp' }) }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, ${BRAND.bg} 0%, transparent 40%, ${BRAND.bg} 100%)` }} />
    </div>
  );
};

export const MarketPressureBriefV13: React.FC<MarketPressureBriefProps> = (props) => {
  const { structureVisual, disclaimer, cta = 'SEE THE STRUCTURE BEHIND PRICE.', captions = [] } = props;

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <AtmosphereV13 />

      {structureVisual && <ProceduralDataLayerV13 data={structureVisual} />}

      <Sequence from={0} durationInFrames={S(2.2)}><SPYShockHookV13 /></Sequence>
      <Sequence from={S(2.2)} durationInFrames={S(2.6)}><ConcretePayoffV13 /></Sequence>
      <Sequence from={S(4.8)} durationInFrames={S(2.7)}><WhyCareTextV13 /></Sequence>
      <Sequence from={S(7.5)} durationInFrames={S(3.0)}><FOMOMissingLayerV13 /></Sequence>
      <Sequence from={S(10.5)} durationInFrames={S(4.0)}><PressureMapV13 /></Sequence>
      <Sequence from={S(14.5)} durationInFrames={S(3.7)}><ProductDifferenceV13 /></Sequence>
      <Sequence from={S(18.2)} durationInFrames={S(3.3)}><BrandCTAV13 cta={cta} /></Sequence>

      <SparseCaptions captions={captions} />
      <DynamicBrandBug />
      <ComplianceFooter text={disclaimer} />
      
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: 'rgba(255,255,255,0.05)', zIndex: Z.progress }}>
        <div style={{ height: '100%', width: `${(useCurrentFrame() / useVideoConfig().durationInFrames) * 100}%`, background: BRAND.gradientCyanPurple }} />
      </div>
    </AbsoluteFill>
  );
};
