'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// Sunrise SVG — dawn horizon with data nodes
const SUNRISE_SVG = `<svg viewBox="0 0 1000 450" fill="none">
<defs>
<radialGradient id="sunGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(500 312) rotate(90) scale(180 360)"><stop stop-color="#fbbf24" stop-opacity="0.58"/><stop offset="0.45" stop-color="#22d3ee" stop-opacity="0.16"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
<linearGradient id="sunGrad" x1="360" y1="230" x2="640" y2="340" gradientUnits="userSpaceOnUse"><stop stop-color="#fbbf24"/><stop offset="1" stop-color="#f97316"/></linearGradient>
<linearGradient id="horizonGrad" x1="0" y1="315" x2="1000" y2="315" gradientUnits="userSpaceOnUse"><stop stop-color="#22d3ee" stop-opacity="0"/><stop offset="0.16" stop-color="#22d3ee"/><stop offset="0.42" stop-color="#fbbf24"/><stop offset="0.51" stop-color="#ffffff"/><stop offset="0.66" stop-color="#fbbf24"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></linearGradient>
<linearGradient id="nodeGrad" x1="70" y1="300" x2="940" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#22d3ee"/><stop offset="0.36" stop-color="#a78bfa"/><stop offset="0.58" stop-color="#fbbf24"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>
<filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect width="1000" height="450" fill="url(#sunGlow)" opacity="0.95"/>
<g stroke-width="1.2" opacity="0.62"><path d="M150 315C240 120 760 118 850 315" stroke="#fbbf24" stroke-opacity="0.42"/><path d="M72 315C190 70 808 64 940 315" stroke="#22d3ee" stroke-opacity="0.24" stroke-dasharray="5 9"/><path d="M235 315C315 185 690 178 766 315" stroke="#fbbf24" stroke-opacity="0.28"/><path d="M315 315C370 230 625 225 680 315" stroke="#fbbf24" stroke-opacity="0.22"/></g>
<g opacity="0.90" stroke="url(#nodeGrad)" stroke-width="1.4"><path d="M34 294 105 242 164 265 228 208 304 238 370 176 450 205 515 145 592 180 654 120 738 146 826 88 916 132 980 66"/><path d="M105 242V164M228 208V130M370 176V95M515 145V70M654 120V58M826 88V36" opacity="0.56"/></g>
<g filter="url(#nodeGlow)"><circle cx="34" cy="294" r="4" fill="#22d3ee"/><circle cx="105" cy="242" r="5" fill="#22d3ee"/><circle cx="164" cy="265" r="4" fill="#a78bfa"/><circle cx="228" cy="208" r="5" fill="#a78bfa"/><circle cx="304" cy="238" r="4" fill="#fbbf24"/><circle cx="370" cy="176" r="5" fill="#fbbf24"/><circle cx="450" cy="205" r="4" fill="#fff7ed"/><circle cx="515" cy="145" r="5" fill="#fbbf24"/><circle cx="592" cy="180" r="4" fill="#fbbf24"/><circle cx="654" cy="120" r="5" fill="#fbbf24"/><circle cx="738" cy="146" r="4" fill="#22d3ee"/><circle cx="826" cy="88" r="5" fill="#22d3ee"/><circle cx="916" cy="132" r="5" fill="#a78bfa"/><circle cx="980" cy="66" r="4" fill="#22d3ee"/></g>
<path d="M362 315A138 138 0 0 1 638 315Z" fill="url(#sunGrad)" opacity="0.98"/><path d="M362 315A138 138 0 0 1 638 315" stroke="#fff7ed" stroke-opacity="0.76" stroke-width="2"/>
<line x1="0" y1="315" x2="1000" y2="315" stroke="url(#horizonGrad)" stroke-width="3"/>
<circle cx="642" cy="315" r="10" fill="#fff7ed" opacity="0.95" filter="url(#nodeGlow)"/>
<g opacity="0.42" stroke="#22d3ee"><path d="M0 340H1000M0 360H1000M0 380H1000M0 400H1000M0 420H1000" stroke-opacity="0.20"/><path d="M70 315C40 355 22 400 0 450M195 315C160 360 132 407 105 450M500 315V450M806 315C844 363 875 408 912 450M930 315C963 360 985 410 1000 450" stroke-opacity="0.15"/></g>
</svg>`;

function MorningPinContent() {
  const sp = useSearchParams();
  const spy = sp.get('spy') || '+0.84';
  const vix = sp.get('vix') || '18.2';
  const gex = sp.get('gex') || 'positive';
  const dp = sp.get('dp') || '39.2';
  const insight = sp.get('insight') || 'Dealers expected to dampen volatility today. Key level: SPY $542';
  const now = new Date();
  const dateStr = sp.get('date') || now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const spyVal = parseFloat(spy);
  const spyPositive = spyVal >= 0;
  const spyDisplay = spyPositive ? `+${Math.abs(spyVal).toFixed(2)}%` : `${spyVal.toFixed(2)}%`;
  const spyColor = spyPositive ? '#34d399' : '#f87171';

  const vixNum = parseFloat(vix);
  const vixStatus = vixNum < 16 ? 'LOW' : vixNum < 20 ? 'CALM' : vixNum < 25 ? 'ELEVATED' : vixNum < 30 ? 'HIGH' : 'EXTREME';
  const vixBadgeColor = vixNum < 20 ? '#34d399' : vixNum < 25 ? '#fbbf24' : '#f87171';

  const gexPositive = gex.toLowerCase() === 'positive';
  const gexColor = gexPositive ? '#34d399' : gex.toLowerCase() === 'negative' ? '#f87171' : '#fbbf24';

  const dpVal = parseFloat(dp);

  const card: React.CSSProperties = {
    position: 'relative', borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'linear-gradient(135deg,rgba(255,255,255,0.070),rgba(255,255,255,0.018)),rgba(8,15,27,0.75)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10),0 18px 42px rgba(0,0,0,0.28)',
    backdropFilter: 'blur(14px)', overflow: 'hidden', padding: '26px 34px',
  };

  return (
    <div style={{
      width: 1000, height: 1500, position: 'relative', overflow: 'hidden',
      color: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif",
      background: `radial-gradient(ellipse at 50% 0%,rgba(251,191,36,0.13),transparent 45%),radial-gradient(circle at 86% 42%,rgba(34,211,238,0.12),transparent 38%),radial-gradient(circle at 20% 98%,rgba(167,139,250,0.12),transparent 34%),linear-gradient(180deg,#06090f,#080c14 52%,#050813)`,
      isolation: 'isolate',
    }}>
      {/* Grid */}
      <div style={{ position:'absolute',inset:0,zIndex:0,opacity:0.34,
        backgroundImage:'linear-gradient(rgba(34,211,238,0.055) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.055) 1px,transparent 1px)',
        backgroundSize:'36px 36px',
        maskImage:'radial-gradient(circle at 72% 24%,black 0%,transparent 58%)',
        WebkitMaskImage:'radial-gradient(circle at 72% 24%,black 0%,transparent 58%)',
      }} />
      {/* Scanline */}
      <div style={{ position:'absolute',inset:0,zIndex:90,pointerEvents:'none',opacity:0.035,
        background:'repeating-linear-gradient(to bottom,rgba(255,255,255,0.92) 0,rgba(255,255,255,0.92) 1px,transparent 1px,transparent 6px)',
        mixBlendMode:'overlay',
      }} />

      {/* ── Header ── */}
      <div style={{ position:'absolute',left:30,right:30,top:36,zIndex:30,display:'grid',gridTemplateColumns:'1fr 220px',alignItems:'start' }}>
        <div style={{ display:'flex',alignItems:'center',gap:24 }}>
          <div style={{
            width:92,height:92,borderRadius:14,display:'grid',placeItems:'center',flexShrink:0,
            background:'radial-gradient(circle at 26% 18%,rgba(255,255,255,0.22),transparent 35%),linear-gradient(135deg,#101827,#111827 48%,#0f172a)',
            border:'1.5px solid rgba(34,211,238,0.74)',
            boxShadow:'0 0 28px rgba(34,211,238,0.28),inset 0 1px 0 rgba(255,255,255,0.20)',
          }}>
            <img src="/icons/icon-192x192.png" alt="" style={{ width:62,height:62,borderRadius:10 }} />
          </div>
          <div>
            <div style={{ fontSize:45,lineHeight:0.95,fontWeight:900,letterSpacing:'-0.045em',textShadow:'0 0 18px rgba(255,255,255,0.11)' }}>
              SIGNUM <span style={{ color:'#22d3ee' }}>HQ</span>
            </div>
            <div style={{ marginTop:18,color:'#fbbf24',fontSize:22,fontWeight:900,letterSpacing:'0.35em',textTransform:'uppercase' as const,textShadow:'0 0 18px rgba(251,191,36,0.20)' }}>
              Morning Brief
            </div>
          </div>
        </div>
        <div style={{ textAlign:'right',paddingTop:10 }}>
          <div style={{ color:'#cbd5e1',fontSize:24,fontWeight:500,letterSpacing:'-0.02em' }}>{dateStr}</div>
          <div style={{
            marginTop:20,display:'inline-flex',alignItems:'center',gap:11,
            height:46,padding:'0 20px',borderRadius:12,
            border:'1.4px solid rgba(251,191,36,0.72)',background:'rgba(251,191,36,0.07)',
            fontSize:22,fontWeight:800,letterSpacing:'0.08em',textTransform:'uppercase' as const,
            boxShadow:'inset 0 1px 0 rgba(255,255,255,0.08),0 0 22px rgba(251,191,36,0.12)',
          }}>
            <span style={{ color:'#fbbf24' }}>☀</span>
            <span style={{ width:14,height:14,borderRadius:'50%',background:'#fbbf24',boxShadow:'0 0 0 7px rgba(251,191,36,0.10),0 0 18px rgba(251,191,36,0.75)' }} />
            LIVE
          </div>
        </div>
      </div>

      {/* ── Sunrise SVG ── */}
      <div style={{ position:'absolute',left:0,right:0,top:130,height:450,zIndex:8 }}
        dangerouslySetInnerHTML={{ __html: SUNRISE_SVG }}
      />

      {/* ── Title ── */}
      <div style={{ position:'absolute',left:60,right:60,top:525,zIndex:20,textAlign:'center' }}>
        <h1 style={{
          margin:0,fontSize:84,lineHeight:0.92,fontWeight:900,letterSpacing:'-0.06em',
          background:'linear-gradient(105deg,#c084fc 0%,#a78bfa 34%,#67e8f9 68%,#22d3ee 100%)',
          WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent',
          textShadow:'0 10px 36px rgba(0,0,0,0.35)',
        }}>Pre-Market<br/>Structure</h1>
        <div style={{ width:390,height:4,margin:'30px auto 0',borderRadius:999,background:'linear-gradient(90deg,#a78bfa,#22d3ee)',boxShadow:'0 0 22px rgba(34,211,238,0.58)' }} />
      </div>

      {/* ── 4 Metric Cards (2×2) ── */}
      <div style={{ position:'absolute',left:50,right:50,top:840,display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:16,zIndex:30 }}>
        {/* SPY */}
        <div style={{ ...card, borderColor:'rgba(52,211,153,0.46)',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.10),0 0 26px rgba(52,211,153,0.08),0 18px 42px rgba(0,0,0,0.28)' }}>
          <div style={{ color:'#94a3b8',fontSize:22,fontWeight:900,letterSpacing:'0.26em',textTransform:'uppercase' as const }}>SPY OVERNIGHT</div>
          <div style={{ marginTop:27,fontSize:72,lineHeight:0.88,fontWeight:900,letterSpacing:'-0.075em',color:spyColor,textShadow:`0 0 26px ${spyColor}66` }}>
            {spyDisplay} <span style={{ fontSize:42,marginLeft:15,filter:`drop-shadow(0 0 12px ${spyColor}88)` }}>{spyPositive ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* VIX */}
        <div style={{ ...card, borderColor:'rgba(52,211,153,0.46)',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.10),0 0 26px rgba(52,211,153,0.08),0 18px 42px rgba(0,0,0,0.28)' }}>
          <div style={{ color:'#94a3b8',fontSize:22,fontWeight:900,letterSpacing:'0.26em',textTransform:'uppercase' as const }}>VIX LEVEL</div>
          <div style={{ marginTop:27,display:'flex',alignItems:'center',gap:20 }}>
            <span style={{ fontSize:72,lineHeight:0.88,fontWeight:900,letterSpacing:'-0.075em',textShadow:'0 8px 26px rgba(0,0,0,0.30)' }}>{vix}</span>
            <span style={{
              display:'inline-flex',alignItems:'center',justifyContent:'center',
              height:48,padding:'0 28px',borderRadius:999,
              border:`1.5px solid ${vixBadgeColor}a5`,background:`${vixBadgeColor}14`,
              color:vixBadgeColor,fontSize:22,fontWeight:900,letterSpacing:'0.12em',
              transform:'translateY(-10px)',
            }}>{vixStatus}</span>
          </div>
        </div>

        {/* GEX */}
        <div style={{ ...card, borderColor:'rgba(34,211,238,0.46)',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.10),0 0 26px rgba(34,211,238,0.08),0 18px 42px rgba(0,0,0,0.28)' }}>
          <div style={{ color:'#94a3b8',fontSize:22,fontWeight:900,letterSpacing:'0.26em',textTransform:'uppercase' as const }}>GEX REGIME</div>
          <div style={{ marginTop:34,display:'flex',alignItems:'center',gap:32 }}>
            <div style={{
              position:'relative',width:68,height:68,borderRadius:'50%',
              background:`radial-gradient(circle at 38% 35%,rgba(255,255,255,0.55),transparent 28%),${gexColor}`,
              boxShadow:`0 0 0 14px ${gexColor}14,0 0 30px ${gexColor}bb,inset -8px -10px 22px rgba(0,0,0,0.18)`,
            }}>
              <div style={{ position:'absolute',inset:-18,border:`1px solid ${gexColor}4d`,borderRadius:'50%',boxShadow:`0 0 18px ${gexColor}33` }} />
            </div>
            <span style={{ color:gexColor,fontSize:48,lineHeight:0.9,fontWeight:900,letterSpacing:'-0.035em',textShadow:`0 0 24px ${gexColor}66` }}>{gex.toUpperCase()}</span>
          </div>
        </div>

        {/* Dark Pool */}
        <div style={{ ...card, paddingBottom:34, borderColor:'rgba(167,139,250,0.46)',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.10),0 0 26px rgba(167,139,250,0.08),0 18px 42px rgba(0,0,0,0.28)' }}>
          <div style={{ color:'#94a3b8',fontSize:22,fontWeight:900,letterSpacing:'0.26em',textTransform:'uppercase' as const }}>DARK POOL</div>
          <div style={{ marginTop:22,fontSize:72,lineHeight:0.88,fontWeight:900,letterSpacing:'-0.075em',color:'#a855f7',textShadow:'0 0 26px rgba(168,85,247,0.34)' }}>{dp}%</div>
          <div style={{ marginTop:24,height:18,borderRadius:999,background:'rgba(148,163,184,0.14)',border:'1px solid rgba(167,139,250,0.48)',overflow:'hidden' }}>
            <div style={{ width:`${dpVal}%`,height:'100%',borderRadius:'inherit',background:'linear-gradient(90deg,#a78bfa,#e879f9)',boxShadow:'0 0 24px rgba(167,139,250,0.58)' }} />
          </div>
        </div>
      </div>

      {/* ── Insight Bar ── */}
      <div style={{
        position:'absolute',left:50,right:50,top:1270,height:108,borderRadius:14,
        border:'1px solid rgba(34,211,238,0.42)',
        background:'linear-gradient(135deg,rgba(255,255,255,0.065),rgba(255,255,255,0.016)),rgba(8,15,27,0.78)',
        boxShadow:'inset 0 1px 0 rgba(255,255,255,0.10),0 18px 42px rgba(0,0,0,0.28),0 0 23px rgba(34,211,238,0.10)',
        display:'grid',gridTemplateColumns:'42px 1fr',gap:33,alignItems:'center',padding:'0 42px',zIndex:30,
      }}>
        <div style={{ width:6,height:58,borderRadius:999,background:'#22d3ee',boxShadow:'0 0 22px rgba(34,211,238,0.70)' }} />
        <div style={{ color:'#cbd5e1',fontSize:26,lineHeight:1.22,fontWeight:500,fontStyle:'italic',letterSpacing:'-0.05em' }}>
          {insight}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ position:'absolute',left:35,right:35,bottom:38,height:34,display:'flex',alignItems:'center',justifyContent:'center',zIndex:35 }}>
        <div style={{ position:'absolute',left:0,top:'50%',width:315,height:1,background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)' }} />
        <div style={{ position:'absolute',right:0,top:'50%',width:315,height:1,background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)' }} />
        <div style={{ color:'#94a3b8',fontSize:22,fontWeight:500,letterSpacing:'0.40em' }}>signumhq.com</div>
      </div>
    </div>
  );
}

export default function MorningPinPage() {
  return (
    <Suspense fallback={<div style={{ width: 1000, height: 1500, background: '#06090f' }} />}>
      <MorningPinContent />
    </Suspense>
  );
}
