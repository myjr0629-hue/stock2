// ============================================================================
// MarketPressureBrief V10B — Final Motion Lock-in
// ============================================================================

import React from 'react';
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring, staticFile, Img } from 'remotion';
import type { ShortsVideoInput } from '../../types';
import { BRAND, TYPE, Z, SHADOW, FPS, SG_LOGO } from '../brand/signumBrand';
import { BrandBug } from '../components/BrandBug';
import { ComplianceFooter } from '../components/ComplianceFooter';

export type MarketPressureBriefProps = ShortsVideoInput;
const S = (s: number) => Math.round(s * FPS);

const SCALE = {
  hero: 120,
  insight: 90,
  number: 110,
  support: 48,
  mapLabel: 42,
  disclaimer: 22,
};

// ---------------------------------------------------------------------------
// 0.0-2.5s: Hook - "YOUR CHART IS MISSING A LAYER."
// ---------------------------------------------------------------------------
const HookTextV10: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Aggressive slam-in
  const slam = spring({ frame, fps, config: { damping: 14, stiffness: 300, mass: 0.5 } });
  const flash = interpolate(frame, [0, 5], [1, 0], { extrapolateRight: 'clamp' });
  const exit = interpolate(frame, [S(2.1), S(2.5)], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: exit, zIndex: Z.hookText }}>
      <div style={{ position: 'absolute', inset: 0, background: BRAND.cyan, opacity: flash * 0.15, mixBlendMode: 'screen' }} />
      
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10, transform: `scale(${interpolate(slam, [0, 1], [1.3, 1])})` }}>
        <div style={{ color: '#ffffff', fontSize: SCALE.hero, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, lineHeight: 1.1, opacity: slam }}>YOUR CHART</div>
        <div style={{ color: '#ffffff', fontSize: SCALE.hero, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, lineHeight: 1.1, opacity: slam }}>IS MISSING</div>
        <div style={{ color: BRAND.cyan, fontSize: SCALE.hero, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.cyan, lineHeight: 1.1, opacity: slam }}>A LAYER.</div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2.5-6.0s: Concrete Payoff - "SPY IS 1.3% BELOW A HIDDEN CALL WALL."
// ---------------------------------------------------------------------------
const ConcretePayoffV10: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Sharp drop-in
  const drop = spring({ frame, fps, config: { damping: 16, stiffness: 220, mass: 0.6 } });
  const exit = interpolate(frame, [S(3.1), S(3.5)], [1, 0], { extrapolateRight: 'clamp' }); 

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: Math.min(drop, exit), zIndex: Z.hookText }}>
      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, transform: `translateY(${(1 - drop) * -30}px)` }}>
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

// ---------------------------------------------------------------------------
// 6.0-9.0s: Why Care - "NEAR WALLS, PRESSURE CAN BUILD."
// ---------------------------------------------------------------------------
const WhyCareTextV10: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const pop = spring({ frame, fps, config: { damping: 18, stiffness: 200 } });
  const exit = interpolate(frame, [S(2.6), S(3.0)], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: Math.min(pop, exit), zIndex: Z.hookText }}>
      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, transform: `scale(${interpolate(pop, [0, 1], [0.9, 1])})` }}>
          NEAR WALLS,
        </div>
        <div style={{ color: BRAND.coral, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.coral, marginTop: 10, transform: `scale(${interpolate(pop, [0, 1], [0.95, 1])})` }}>
          PRESSURE CAN BUILD.
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 9.0-13.0s: Product Difference - Split Screen
// ---------------------------------------------------------------------------
const ProductDifferenceV10: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  // Brutal slide-in
  const split = spring({ frame, fps, config: { damping: 14, stiffness: 250, mass: 0.8 } });
  const exit = interpolate(frame, [S(3.6), S(4.0)], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: exit, zIndex: Z.wallViz + 10, background: BRAND.bg }}>
      
      {/* Top Half: Normal Chart */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: '#0a0d14', borderBottom: `2px dashed ${BRAND.mutedLight}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `translateY(${interpolate(split, [0, 1], [-960, 0])}px)` }}>
        <div style={{ color: BRAND.muted, fontSize: SCALE.support, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>NORMAL CHART</div>
        <div style={{ color: '#ffffff', fontSize: SCALE.insight - 10, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', marginTop: 10 }}>PRICE ONLY</div>
        <svg width="600" height="150" viewBox="0 0 600 150" style={{ marginTop: 60 }}>
          <path d="M 0,100 C 100,80 150,120 220,70 C 300,20 350,60 440,40 C 520,25 580,50 600,20" stroke={BRAND.mutedLight} strokeWidth={6} fill="none" strokeLinecap="round" />
        </svg>
      </div>

      {/* Bottom Half: SignumHQ Layer */}
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '50%', background: `radial-gradient(circle at center, ${BRAND.cyan}15 0%, ${BRAND.bg} 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `translateY(${interpolate(split, [0, 1], [960, 0])}px)` }}>
        <div style={{ position: 'absolute', top: 150, left: 100, right: 100, height: 6, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
        <div style={{ position: 'absolute', top: 100, right: 100, color: BRAND.coral, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family }}>CALL WALL $600</div>
        
        <div style={{ position: 'absolute', top: 250, left: 100, right: 200, height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
        <div style={{ position: 'absolute', top: 200, left: 100, color: BRAND.purple, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family }}>GAMMA FLIP $588</div>

        <div style={{ position: 'absolute', top: 350, left: 100, right: 100, height: 6, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
        <div style={{ position: 'absolute', top: 370, right: 100, color: BRAND.emerald, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family }}>PUT FLOOR $580</div>

        <div style={{ zIndex: 10, textAlign: 'center', marginTop: 150, background: 'rgba(5,10,20,0.8)', padding: '20px 60px', borderRadius: 20, border: `1px solid ${BRAND.cyan}40` }}>
          <div style={{ color: BRAND.cyan, fontSize: SCALE.support, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>SIGNUMHQ LAYER</div>
          <div style={{ color: '#ffffff', fontSize: SCALE.insight - 10, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', marginTop: 10 }}>WALL / FLOOR / FLIP</div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 13.0-16.5s: Definition Beat - "NOT A PREDICTION. A PRESSURE MAP."
// ---------------------------------------------------------------------------
const MeaningTextV10: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 200 } });
  const exit = interpolate(frame, [S(3.1), S(3.5)], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: Math.min(pop, exit), zIndex: Z.hookText }}>
      <div style={{ position: 'absolute', top: 200, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ color: BRAND.textSecondary, fontSize: SCALE.insight - 20, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.caption, transform: `translateY(${(1 - pop) * 20}px)` }}>
          NOT A PREDICTION.
        </div>
        <div style={{ color: BRAND.purple, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.purple, marginTop: 10, transform: `translateY(${(1 - pop) * 30}px)` }}>
          A PRESSURE MAP.
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 16.5-19.5s: Tension Return - "THE GAP IS ONLY 1.3%"
// ---------------------------------------------------------------------------
const TensionTextV10: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 18, stiffness: 220 } });
  const exit = interpolate(frame, [S(2.6), S(3.0)], [1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{ position: 'absolute', inset: 0, opacity: Math.min(r, exit), zIndex: Z.hookText }}>
      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center' }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight - 10, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero }}>
          THE GAP
        </div>
        <div style={{ color: BRAND.amber, fontSize: SCALE.number, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.amber, marginTop: 10 }}>
          IS ONLY 1.3%
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 19.5-22.0s: CTA (2.5s)
// ---------------------------------------------------------------------------
const BrandCTAV10: React.FC<{ cta: string }> = ({ cta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = spring({ frame, fps, config: { damping: 16, stiffness: 200 } });
  const scan = interpolate(frame % S(1.5), [0, S(1.5)], [-150, 400]);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: r, zIndex: Z.hookText }}>
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
      <div style={{ color: BRAND.text, fontSize: SCALE.insight - 10, fontWeight: 900, fontFamily: TYPE.family, textAlign: 'center', letterSpacing: '-0.01em', textShadow: SHADOW.hero, transform: `translateY(${(1 - r) * 30}px)` }}>
        {cta}
      </div>
      <div style={{ marginTop: 50, color: BRAND.cyan, fontSize: SCALE.support, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em', textShadow: SHADOW.cyan, transform: `translateY(${(1 - r) * 40}px)` }}>
        SIGNUMHQ.COM
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DYNAMIC PROCEDURAL DATA VIZ (Continuous Background logic)
// Lives from 2.5s to 9.0s, and then 13.0s to 19.5s
// ---------------------------------------------------------------------------
const ProceduralDataLayer: React.FC<{ data: ShortsVideoInput['structureVisual'] }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: 2.5 - 6.0s (Drop in data)
  const isPhase1 = frame >= S(2.5) && frame < S(6.0);
  // Phase 2: 6.0 - 9.0s (Pressure build)
  const isPhase2 = frame >= S(6.0) && frame < S(9.0);
  // Phase 3: 13.0 - 16.5s (Map Assembly)
  const isPhase3 = frame >= S(13.0) && frame < S(16.5);
  // Phase 4: 16.5 - 19.5s (Extreme Zoom)
  const isPhase4 = frame >= S(16.5) && frame < S(19.5);

  if (!isPhase1 && !isPhase2 && !isPhase3 && !isPhase4) return null;

  const { price, callWall, putFloor, gammaFlipLevel } = data;
  if (!callWall || !putFloor) return null;

  const range = callWall - putFloor;
  const pad = range * 0.25;
  const vMin = putFloor - pad;
  const vMax = callWall + pad;
  const toY = (v: number) => 100 + (1 - (v - vMin) / (vMax - vMin)) * 700;

  const wallY = toY(callWall);
  let priceY = toY(price);
  
  // Pressure buildup in Phase 2
  if (isPhase2) {
    const approach = interpolate(frame, [S(6.0), S(9.0)], [0, 0.8], { extrapolateRight: 'clamp' });
    priceY = toY(price) + (toY(callWall) - toY(price)) * approach * 0.35;
  }

  // Bracket
  const bracketGrow = isPhase1 
    ? spring({ frame: Math.max(0, frame - S(3.5)), fps, config: { damping: 14, stiffness: 200 } })
    : 1;
  const bracketH = Math.max(0, priceY - wallY);

  // Map Reveal in Phase 3
  const mapFrame = isPhase3 ? Math.max(0, frame - S(13.5)) : 0;
  
  // Camera transformations
  let scale = 1;
  let translateY = 150; // Push down default
  
  if (isPhase3) {
    translateY = 50; // Pull up slightly for map
  } else if (isPhase4) {
    // Extreme tension zoom
    scale = interpolate(frame, [S(16.5), S(19.5)], [1.4, 1.55]);
    translateY = 0;
  }

  const cameraStyle: React.CSSProperties = {
    position: 'absolute', top: 300, left: 0, width: 1080, height: 900,
    zIndex: Z.wallViz,
    transform: `scale(${scale}) translateY(${translateY}px)`,
    transformOrigin: 'center center',
    transition: 'transform 0.1s' // smooth sudden jumps if any
  };

  return (
    <div style={cameraStyle}>
      {/* ── GLASS WALL BARRIER ── */}
      <div style={{ position: 'absolute', left: 60, right: 60, top: wallY - 200, height: 200, background: `linear-gradient(180deg, ${BRAND.coral}05 0%, ${BRAND.coral}25 100%)`, borderTop: `2px solid ${BRAND.coral}50`, borderLeft: `2px solid ${BRAND.coral}50`, borderRight: `2px solid ${BRAND.coral}50`, backdropFilter: 'blur(12px)' }} />
      <div style={{ position: 'absolute', left: 60, right: 60, top: wallY - 4, height: 8, background: BRAND.coral, boxShadow: `0 0 50px ${BRAND.coral}, 0 0 100px ${BRAND.coral}80` }} />

      {/* ── PRESSURE ZONE (Active in Phase 2 & 4) ── */}
      {(isPhase2 || isPhase4) && (
        <div style={{ position: 'absolute', left: 100, right: 350, top: wallY + 4, height: Math.max(0, priceY - wallY - 4), background: `linear-gradient(180deg, ${BRAND.coral}55 0%, ${BRAND.cyan}25 50%, transparent 100%)`, borderLeft: `2px dashed ${BRAND.coral}50`, opacity: interpolate(frame, [S(6.0), S(7.0)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }} />
      )}

      {/* ── BRACKET ── */}
      {bracketGrow > 0 && (
        <div style={{ position: 'absolute', right: 330, top: wallY, height: bracketH, width: 20, borderRight: `4px solid ${BRAND.amber}`, borderTop: `4px solid ${BRAND.amber}`, borderBottom: `4px solid ${BRAND.amber}`, boxShadow: `inset -10px 0 20px ${BRAND.amberGlow}`, transformOrigin: 'top right', transform: `scaleY(${bracketGrow})` }} />
      )}

      {/* ── CURRENT PRICE ── */}
      <div style={{ position: 'absolute', left: 60, top: priceY - 2, height: 8, width: 600, background: BRAND.cyan, boxShadow: `0 0 40px ${BRAND.cyan}, 0 0 80px ${BRAND.cyanGlow}`, borderRadius: 4 }} />
      <div style={{ position: 'absolute', left: 644, top: priceY - 16, width: 32, height: 32, borderRadius: '50%', background: BRAND.text, border: `6px solid ${BRAND.cyan}`, boxShadow: `0 0 35px ${BRAND.cyan}, 0 0 90px ${BRAND.cyanGlow}` }} />

      {/* Price Label (Hidden during tension phase to focus on bracket) */}
      {!isPhase4 && (
        <div style={{ position: 'absolute', left: 700, top: priceY - 10 }}>
          <div style={{ color: BRAND.text, fontSize: SCALE.mapLabel, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>SPY PRICE</div>
          <div style={{ color: BRAND.cyan, fontSize: SCALE.mapLabel + 12, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, letterSpacing: '-0.02em', marginTop: -4 }}>${price.toFixed(2)}</div>
        </div>
      )}

      {/* ── MAP ASSEMBLY (Phase 3) ── */}
      {isPhase3 && mapFrame > 0 && (
        <div style={{ opacity: interpolate(mapFrame, [0, S(0.5)], [0, 1], { extrapolateRight: 'clamp' }) }}>
          {/* Put Floor */}
          <div style={{ position: 'absolute', left: 60, right: 300, top: toY(putFloor) - 2, height: 6, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
          <div style={{ position: 'absolute', right: 80, top: toY(putFloor) + 10, textAlign: 'right' }}>
            <div style={{ color: BRAND.emerald, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>PUT FLOOR</div>
            <div style={{ color: BRAND.text, fontSize: SCALE.mapLabel + 10, fontWeight: 900, fontFamily: TYPE.family }}>${putFloor}</div>
          </div>
          {/* Gamma Flip */}
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


// ---------------------------------------------------------------------------
// GLOBAL ATMOSPHERE
// ---------------------------------------------------------------------------
const AtmosphereV10: React.FC = () => {
  const frame = useCurrentFrame();

  // Show Hook monolith only during 0-2.5s
  const hookImg = interpolate(frame, [S(2.1), S(2.5)], [0.6, 0], { extrapolateRight: 'clamp' });
  // Show pressure field from 2.5 to 9.0s, and 13.0s to 19.5s
  const isPressureVisible = (frame >= S(2.5) && frame < S(9.0)) || (frame >= S(13.0) && frame < S(19.5));
  
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 0, backgroundColor: BRAND.bg }}>
      <Img src={staticFile('shorts/broll/hook_v10.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: hookImg }} />
      {isPressureVisible && (
        <Img src={staticFile('shorts/broll/pressure_v9a.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.3 }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, ${BRAND.bg} 0%, transparent 40%, ${BRAND.bg} 100%)` }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// MAIN COMPOSITION
// ---------------------------------------------------------------------------
export const MarketPressureBriefV10B: React.FC<MarketPressureBriefProps> = (props) => {
  const { structureVisual, disclaimer, cta = 'SEE THE HIDDEN LAYER.' } = props;

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <AtmosphereV10 />

      {structureVisual && <ProceduralDataLayer data={structureVisual} />}

      <Sequence from={0} durationInFrames={S(2.5)}><HookTextV10 /></Sequence>
      <Sequence from={S(2.5)} durationInFrames={S(3.5)}><ConcretePayoffV10 /></Sequence>
      <Sequence from={S(6.0)} durationInFrames={S(3.0)}><WhyCareTextV10 /></Sequence>
      <Sequence from={S(9.0)} durationInFrames={S(4.0)}><ProductDifferenceV10 /></Sequence>
      <Sequence from={S(13.0)} durationInFrames={S(3.5)}><MeaningTextV10 /></Sequence>
      <Sequence from={S(16.5)} durationInFrames={S(3.0)}><TensionTextV10 /></Sequence>
      <Sequence from={S(19.5)} durationInFrames={S(2.5)}><BrandCTAV10 cta={cta} /></Sequence>

      <Sequence from={0} durationInFrames={S(19.5)}><BrandBug /></Sequence>
      <ComplianceFooter text={disclaimer} />
      
      {/* ProgressBar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: 'rgba(255,255,255,0.05)', zIndex: Z.progress }}>
        <div style={{ height: '100%', width: `${(useCurrentFrame() / useVideoConfig().durationInFrames) * 100}%`, background: BRAND.gradientCyanPurple }} />
      </div>
    </AbsoluteFill>
  );
};
