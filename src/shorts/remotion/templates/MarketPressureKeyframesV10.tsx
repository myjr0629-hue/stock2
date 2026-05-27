// ============================================================================
// MarketPressureKeyframes V10
// Frame-by-frame static render for storyboard review.
// ============================================================================

import React from 'react';
import { AbsoluteFill, useCurrentFrame, Img, staticFile } from 'remotion';
import { BRAND, TYPE, Z, SHADOW, SG_LOGO } from '../brand/signumBrand';

const SCALE = {
  hero: 120,
  insight: 90,
  number: 110,
  support: 48,
  mapLabel: 42,
  disclaimer: 22,
};

export const MarketPressureKeyframesV10: React.FC = () => {
  const frame = useCurrentFrame();

  const renderHook = () => (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Img src={staticFile('shorts/broll/hook_v10.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, ${BRAND.bg} 0%, transparent 40%, ${BRAND.bg} 100%)` }} />
      
      <div style={{ zIndex: Z.hookText, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ color: '#ffffff', fontSize: SCALE.hero, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, lineHeight: 1.1 }}>YOUR CHART</div>
        <div style={{ color: '#ffffff', fontSize: SCALE.hero, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero, lineHeight: 1.1 }}>IS MISSING</div>
        <div style={{ color: BRAND.cyan, fontSize: SCALE.hero, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.cyan, lineHeight: 1.1 }}>A LAYER.</div>
      </div>
    </AbsoluteFill>
  );

  const renderConcreteInsight = () => (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <Img src={staticFile('shorts/broll/pressure_v9a.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.2 }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, ${BRAND.bg} 0%, transparent 40%, ${BRAND.bg} 100%)` }} />

      {/* Top Text */}
      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center', zIndex: Z.hookText }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero }}>SPY IS <span style={{ color: BRAND.amber, fontSize: SCALE.number }}>1.3%</span></div>
        <div style={{ color: BRAND.textSecondary, fontSize: SCALE.support, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.04em', marginTop: 10 }}>BELOW A HIDDEN</div>
        <div style={{ color: BRAND.coral, fontSize: SCALE.insight + 10, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.02em', textShadow: SHADOW.coral, marginTop: -5 }}>CALL WALL</div>
      </div>

      {/* Data Visual */}
      <div style={{ position: 'absolute', top: 900, left: 0, right: 0, height: 400 }}>
        {/* Wall */}
        <div style={{ position: 'absolute', left: 60, right: 60, top: 0, height: 200, background: `linear-gradient(180deg, ${BRAND.coral}15 0%, ${BRAND.coral}35 100%)`, borderTop: `2px solid ${BRAND.coral}50`, borderLeft: `2px solid ${BRAND.coral}50`, borderRight: `2px solid ${BRAND.coral}50`, backdropFilter: 'blur(12px)' }} />
        <div style={{ position: 'absolute', left: 60, right: 60, top: 196, height: 8, background: BRAND.coral, boxShadow: `0 0 50px ${BRAND.coral}, 0 0 100px ${BRAND.coral}80` }} />
        
        {/* Price */}
        <div style={{ position: 'absolute', left: 60, top: 350, height: 8, width: 600, background: BRAND.cyan, boxShadow: `0 0 40px ${BRAND.cyan}` }} />
        <div style={{ position: 'absolute', left: 644, top: 338, width: 32, height: 32, borderRadius: '50%', background: BRAND.text, border: `6px solid ${BRAND.cyan}`, boxShadow: `0 0 35px ${BRAND.cyan}` }} />
        <div style={{ position: 'absolute', left: 700, top: 325 }}><div style={{ color: BRAND.text, fontSize: SCALE.mapLabel, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>SPY PRICE</div><div style={{ color: BRAND.cyan, fontSize: SCALE.mapLabel + 10, fontWeight: 900, fontFamily: TYPE.family, textShadow: SHADOW.cyan, marginTop: -5 }}>$592.31</div></div>
        
        {/* Bracket */}
        <div style={{ position: 'absolute', right: 330, top: 200, height: 150, width: 20, borderRight: `4px solid ${BRAND.amber}`, borderTop: `4px solid ${BRAND.amber}`, borderBottom: `4px solid ${BRAND.amber}`, boxShadow: `inset -10px 0 20px ${BRAND.amberGlow}` }} />
      </div>
    </AbsoluteFill>
  );

  const renderWhyCare = () => (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <Img src={staticFile('shorts/broll/pressure_v9a.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(to top, ${BRAND.bg} 0%, transparent 40%, ${BRAND.bg} 100%)` }} />

      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center', zIndex: Z.hookText }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero }}>NEAR WALLS,</div>
        <div style={{ color: BRAND.coral, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.coral, marginTop: 10 }}>PRESSURE MAY CLUSTER.</div>
      </div>

      {/* Visual Compression */}
      <div style={{ position: 'absolute', top: 900, left: 0, right: 0, height: 400 }}>
        <div style={{ position: 'absolute', left: 60, right: 60, top: 196, height: 8, background: BRAND.coral, boxShadow: `0 0 50px ${BRAND.coral}, 0 0 100px ${BRAND.coral}80` }} />
        <div style={{ position: 'absolute', left: 100, right: 350, top: 204, height: 146, background: `linear-gradient(180deg, ${BRAND.coral}45 0%, ${BRAND.cyan}25 50%, transparent 100%)`, borderLeft: `2px dashed ${BRAND.coral}50` }} />
        <div style={{ position: 'absolute', left: 60, top: 350, height: 8, width: 600, background: BRAND.cyan, boxShadow: `0 0 40px ${BRAND.cyan}` }} />
      </div>
    </AbsoluteFill>
  );

  const renderPressureCluster = () => (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <Img src={staticFile('shorts/broll/pressure_v9a.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }} />
      
      {/* Zoomed in perspective */}
      <div style={{ position: 'absolute', top: -200, left: -200, width: 1480, height: 1920, transform: 'scale(1.4)' }}>
        <div style={{ position: 'absolute', left: 60, right: 60, top: 900, height: 12, background: BRAND.coral, boxShadow: `0 0 80px ${BRAND.coral}, 0 0 150px ${BRAND.coral}` }} />
        <div style={{ position: 'absolute', left: 150, right: 400, top: 912, height: 288, background: `linear-gradient(180deg, ${BRAND.coral}60 0%, ${BRAND.cyan}40 100%)`, filter: 'blur(4px)' }} />
        <div style={{ position: 'absolute', left: 60, top: 1200, height: 12, width: 800, background: BRAND.cyan, boxShadow: `0 0 80px ${BRAND.cyan}` }} />
        <div style={{ position: 'absolute', right: 380, top: 900, height: 300, width: 30, borderRight: `8px solid ${BRAND.amber}`, borderTop: `8px solid ${BRAND.amber}`, borderBottom: `8px solid ${BRAND.amber}`, boxShadow: `inset -20px 0 40px ${BRAND.amberGlow}` }} />
      </div>

      {/* Text Overlay */}
      <div style={{ position: 'absolute', top: 300, left: 0, right: 0, textAlign: 'center', zIndex: Z.hookText }}>
        <div style={{ color: BRAND.text, fontSize: SCALE.insight - 10, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.hero }}>THE GAP</div>
        <div style={{ color: BRAND.amber, fontSize: SCALE.number, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.amber, marginTop: 10 }}>IS ONLY 1.3%</div>
      </div>
    </AbsoluteFill>
  );

  const renderPressureMap = () => (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      <div style={{ position: 'absolute', top: 200, left: 0, right: 0, textAlign: 'center', zIndex: Z.hookText }}>
        <div style={{ color: BRAND.textSecondary, fontSize: SCALE.insight - 20, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.caption }}>NOT A PREDICTION.</div>
        <div style={{ color: BRAND.purple, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', textShadow: SHADOW.purple, marginTop: 10 }}>A PRESSURE MAP.</div>
      </div>

      {/* Clean Map */}
      <div style={{ position: 'absolute', top: 600, left: 0, right: 0, height: 900 }}>
        {/* Call Wall */}
        <div style={{ position: 'absolute', left: 60, right: 60, top: 200, height: 6, background: BRAND.coral, boxShadow: `0 0 40px ${BRAND.coral}` }} />
        <div style={{ position: 'absolute', right: 80, top: 130, textAlign: 'right' }}>
          <div style={{ color: BRAND.coral, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>CALL WALL</div>
          <div style={{ color: BRAND.text, fontSize: SCALE.mapLabel + 10, fontWeight: 900, fontFamily: TYPE.family }}>$600</div>
        </div>

        {/* Flip */}
        <div style={{ position: 'absolute', left: 60, right: 300, top: 450, height: 6, background: `repeating-linear-gradient(90deg, ${BRAND.purple} 0px, ${BRAND.purple} 20px, transparent 20px, transparent 40px)` }} />
        <div style={{ position: 'absolute', left: 80, top: 380, textAlign: 'left' }}>
          <div style={{ color: BRAND.purple, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>GAMMA FLIP</div>
          <div style={{ color: BRAND.text, fontSize: SCALE.mapLabel + 10, fontWeight: 900, fontFamily: TYPE.family }}>$588</div>
        </div>

        {/* Put Floor */}
        <div style={{ position: 'absolute', left: 60, right: 60, top: 700, height: 6, background: BRAND.emerald, boxShadow: `0 0 40px ${BRAND.emerald}` }} />
        <div style={{ position: 'absolute', right: 80, top: 720, textAlign: 'right' }}>
          <div style={{ color: BRAND.emerald, fontSize: SCALE.mapLabel, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>PUT FLOOR</div>
          <div style={{ color: BRAND.text, fontSize: SCALE.mapLabel + 10, fontWeight: 900, fontFamily: TYPE.family }}>$580</div>
        </div>
      </div>
    </AbsoluteFill>
  );

  const renderProductDifference = () => (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg }}>
      {/* Top Half: Normal Chart */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: '#0a0d14', borderBottom: `2px dashed ${BRAND.mutedLight}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: BRAND.muted, fontSize: SCALE.support, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em' }}>NORMAL CHART</div>
        <div style={{ color: '#ffffff', fontSize: SCALE.insight - 10, fontWeight: 900, fontFamily: TYPE.family, letterSpacing: '-0.02em', marginTop: 10 }}>PRICE ONLY</div>
        
        <svg width="600" height="150" viewBox="0 0 600 150" style={{ marginTop: 60 }}>
          <path d="M 0,100 C 100,80 150,120 220,70 C 300,20 350,60 440,40 C 520,25 580,50 600,20" stroke={BRAND.mutedLight} strokeWidth={6} fill="none" strokeLinecap="round" />
        </svg>
      </div>

      {/* Bottom Half: SignumHQ Layer */}
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: '50%', background: `radial-gradient(circle at center, ${BRAND.cyan}15 0%, ${BRAND.bg} 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        
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
    </AbsoluteFill>
  );

  const renderCTA = () => (
    <AbsoluteFill style={{ backgroundColor: BRAND.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ marginBottom: 60 }}>
        <svg width="180" height="180" viewBox="246 247 530 530" fill="none">
          <path d={SG_LOGO.upper} fill={BRAND.text} />
          <path d={SG_LOGO.lower} fill={BRAND.text} />
        </svg>
      </div>
      <div style={{ display: 'flex', gap: 0, marginBottom: 60 }}>
        <span style={{ color: BRAND.text, fontSize: 100, fontWeight: 900, letterSpacing: '0.18em', fontFamily: TYPE.family }}>SIGNUM</span>
        <span style={{ color: BRAND.cyan, fontSize: 100, fontWeight: 900, letterSpacing: '0.18em', fontFamily: TYPE.family, textShadow: SHADOW.cyan }}>HQ</span>
      </div>
      <div style={{ width: 300, height: 6, marginBottom: 60, background: BRAND.gradientCyanPurple }} />
      <div style={{ color: BRAND.text, fontSize: SCALE.insight, fontWeight: 900, fontFamily: TYPE.family, textAlign: 'center', letterSpacing: '-0.01em', textShadow: SHADOW.hero }}>SEE WHAT OTHERS CANNOT.</div>
      <div style={{ marginTop: 50, color: BRAND.cyan, fontSize: SCALE.support + 10, fontWeight: 800, fontFamily: TYPE.family, letterSpacing: '0.1em', textShadow: SHADOW.cyan }}>SIGNUMHQ.COM</div>
    </AbsoluteFill>
  );

  const views = [
    renderHook,
    renderConcreteInsight,
    renderWhyCare,
    renderPressureCluster,
    renderPressureMap,
    renderProductDifference,
    renderCTA,
  ];

  return views[frame % views.length]() || null;
};
