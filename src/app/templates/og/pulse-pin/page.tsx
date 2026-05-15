'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function PulsePinContent() {
  const sp = useSearchParams();
  const spy = parseFloat(sp.get('spy') || '0');
  const vix = parseFloat(sp.get('vix') || '18');
  const gex = (sp.get('gex') || 'neutral').toLowerCase();
  const dp = parseFloat(sp.get('dp') || '0');
  const fgi = parseInt(sp.get('fgi') || '50', 10);
  const date = sp.get('date') || new Date().toISOString().split('T')[0];

  const spyFmt = `${spy >= 0 ? '+' : ''}${spy.toFixed(2)}%`;
  const spyColor = spy > 0 ? '#34d399' : spy < 0 ? '#f87171' : '#94a3b8';
  const vixColor = vix >= 30 ? '#f87171' : vix >= 25 ? '#f97316' : vix >= 18 ? '#fbbf24' : '#34d399';
  const vixLabel = vix >= 30 ? 'EXTREME' : vix >= 25 ? 'HIGH' : vix >= 18 ? 'ELEVATED' : 'CALM';
  const vixPct = Math.min(vix / 45, 1) * 100;

  const gc: Record<string, { color: string; label: string; desc: string; signal: string; pct: number }> = {
    positive:   { color: '#34d399', label: 'POSITIVE',   desc: 'Dealer positioning may dampen volatility', signal: 'STRONG', pct: 75.7 },
    negative:   { color: '#f87171', label: 'NEGATIVE',   desc: 'Volatility amplification in progress',     signal: 'WEAK',   pct: 18 },
    neutral:    { color: '#94a3b8', label: 'NEUTRAL',    desc: 'No directional conviction from dealers',   signal: 'MIXED',  pct: 50 },
    transition: { color: '#fbbf24', label: 'TRANSITION', desc: 'Regime shifting — elevated uncertainty',   signal: 'MIXED',  pct: 50 },
  };
  const g = gc[gex] || gc.neutral;
  const dashLen = (g.pct / 100) * 553;

  const dpColor = dp >= 40 ? '#fbbf24' : '#22d3ee';
  const fgiLabel = fgi >= 75 ? 'EXTREME GREED' : fgi >= 55 ? 'GREED' : fgi >= 45 ? 'NEUTRAL' : fgi >= 25 ? 'FEAR' : 'EXTREME FEAR';
  const fgiColor = fgi >= 55 ? '#34d399' : fgi >= 45 ? '#fbbf24' : '#f87171';
  const needleAngle = -90 + (fgi / 100) * 180;
  const nx = 175 + 70 * Math.cos((needleAngle - 90) * Math.PI / 180);
  const ny = 121 + 70 * Math.sin((needleAngle - 90) * Math.PI / 180);

  const insightText = gex === 'positive' ? 'Dealer support active — volatility compression expected'
    : gex === 'negative' ? 'Gamma amplification active — trend acceleration likely'
    : 'Neutral dealer positioning — watch for breakout signals';

  const dateFmt = (() => {
    try { return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return date; }
  })();

  const makeSpark = () => {
    const pts = [162,134,150,122,86,104,86,66,82,67,49,72,52,31,45,22,0,18,4];
    const xs = [0,18,34,54,80,105,130,158,184,210,242,267,296,327,349,380,413,435,480];
    return xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x} ${pts[i]}`).join(' ');
  };
  const sparkPath = makeSpark();

  const card: React.CSSProperties = {
    position: 'relative', borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(14px)',
    background: 'linear-gradient(135deg, rgba(255,255,255,0.070), rgba(255,255,255,0.018)), rgba(8,15,27,0.75)',
    border: '1px solid rgba(255,255,255,0.14)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 18px 42px rgba(0,0,0,0.28)',
  };

  return (
    <div className="ready" style={{
      position: 'relative', width: 1000, height: 1500, overflow: 'hidden', color: '#f1f5f9',
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif", isolation: 'isolate',
      background: `radial-gradient(circle at 88% 10%, rgba(124,58,237,0.22), transparent 34%),
        radial-gradient(circle at 95% 66%, rgba(34,211,238,0.14), transparent 35%),
        radial-gradient(circle at 8% 94%, rgba(124,58,237,0.18), transparent 34%),
        linear-gradient(180deg, #050813 0%, #06090f 45%, #050817 100%)`,
    }}>
      {/* Grain */}
      <div style={{ position:'absolute',inset:0,opacity:0.13,pointerEvents:'none',zIndex:2,
        backgroundImage:'radial-gradient(circle,rgba(255,255,255,0.18) 0 0.8px,transparent 1.2px)',backgroundSize:'5px 5px' }} />
      {/* Scanline */}
      <div style={{ position:'absolute',inset:0,pointerEvents:'none',zIndex:100,opacity:0.03,mixBlendMode:'overlay' as const,
        background:'repeating-linear-gradient(to bottom,rgba(255,255,255,0.90) 0,rgba(255,255,255,0.90) 1px,transparent 1px,transparent 5px)' }} />
      {/* Dot mesh */}
      <div style={{ position:'absolute',inset:0,zIndex:-6,opacity:0.28,
        backgroundImage:'radial-gradient(circle,rgba(34,211,238,0.28) 0 1px,transparent 1.55px),radial-gradient(circle,rgba(167,139,250,0.24) 0 1px,transparent 1.55px)',
        backgroundSize:'26px 26px,38px 38px',
        maskImage:'radial-gradient(circle at 84% 42%,black 0%,transparent 58%)',
        WebkitMaskImage:'radial-gradient(circle at 84% 42%,black 0%,transparent 58%)' }} />

      {/* ── Header ── */}
      <div style={{ position:'absolute',left:35,right:35,top:42,zIndex:20,display:'grid',gridTemplateColumns:'1fr 260px',alignItems:'start' }}>
        <div style={{ display:'flex',alignItems:'center',gap:22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192x192.png" alt="" style={{ width:84,height:84,borderRadius:14,border:'1.5px solid rgba(34,211,238,0.76)',boxShadow:'0 0 28px rgba(34,211,238,0.28)',background:'linear-gradient(135deg,#101827,#0f172a)' }} />
          <div style={{ width:1,height:86,background:'linear-gradient(to bottom,transparent,#22d3ee,transparent)',boxShadow:'0 0 18px rgba(34,211,238,0.52)' }} />
          <div>
            <div style={{ fontSize:45,fontWeight:900,letterSpacing:'-0.045em',textShadow:'0 0 18px rgba(255,255,255,0.11)' }}>SIGNUM <span style={{ color:'#22d3ee' }}>HQ</span></div>
            <div style={{ marginTop:23,color:'#22d3ee',fontSize:25,fontWeight:900,letterSpacing:'0.35em',textTransform:'uppercase' as const,textShadow:'0 0 18px rgba(34,211,238,0.24)' }}>Market Pulse</div>
          </div>
        </div>
        <div style={{ textAlign:'right',paddingTop:8 }}>
          <div style={{ color:'#94a3b8',fontSize:25,fontWeight:500,letterSpacing:'0.09em' }}>{dateFmt}</div>
          <div style={{ display:'inline-flex',alignItems:'center',gap:16,marginTop:22,height:48,padding:'0 28px',borderRadius:999,border:'1.6px solid rgba(248,113,113,0.70)',background:'rgba(248,113,113,0.08)',color:'#f1f5f9',fontSize:22,fontWeight:800,letterSpacing:'0.18em' }}>
            <span style={{ width:17,height:17,borderRadius:'50%',background:'#ef4444',boxShadow:'0 0 0 10px rgba(239,68,68,0.12),0 0 18px rgba(239,68,68,0.75)' }} />LIVE
          </div>
        </div>
      </div>

      {/* ── S&P 500 Hero ── */}
      <div style={{ ...card, position:'absolute',left:34,right:34,top:171,height:270,borderColor:`${spyColor}44`,padding:'30px 38px',boxShadow:`inset 0 1px 0 rgba(255,255,255,0.10),0 18px 42px rgba(0,0,0,0.28),0 0 24px ${spyColor}14` }}>
        <div style={{ display:'grid',gridTemplateColumns:'405px 1fr',height:'100%',gap:28,alignItems:'center' }}>
          <div>
            <div style={{ fontSize:38,fontWeight:900,letterSpacing:'0.09em' }}>S&amp;P 500</div>
            <div style={{ marginTop:22,color:spyColor,fontSize:85,lineHeight:0.88,fontWeight:900,letterSpacing:'-0.075em',textShadow:`0 0 36px ${spyColor}46` }}>{spyFmt}</div>
          </div>
          <div style={{ position:'relative',height:195 }}>
            <svg viewBox="0 0 480 190" style={{ width:'100%',height:'100%' }} fill="none">
              <path d={sparkPath} stroke={spyColor} strokeWidth="3" strokeLinecap="round" />
              <path d={`${sparkPath}V190H0Z`} fill={spyColor} opacity="0.16" />
              <path d="M0 138H480" stroke="rgba(241,245,249,0.28)" strokeDasharray="5 8" />
            </svg>
            <div style={{ position:'absolute',left:0,right:0,bottom:-5,display:'flex',justifyContent:'space-between',color:'#cbd5e1',fontSize:18,fontWeight:500 }}><span>9:30</span><span>12:30</span><span>4:00</span></div>
            <div style={{ position:'absolute',right:0,top:18,bottom:23,display:'flex',flexDirection:'column',justifyContent:'space-between',textAlign:'right',fontSize:19,fontWeight:600 }}>
              <span style={{ color:'#34d399' }}>+1.0%</span><span style={{ color:'#f1f5f9' }}>0.0%</span><span style={{ color:'#f87171' }}>-1.0%</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── GEX Hero ── */}
      <div style={{ ...card, position:'absolute',left:34,right:34,top:455,height:270,borderColor:'rgba(255,255,255,0.20)',padding:'24px 36px' }}>
        <div style={{ display:'grid',gridTemplateColumns:'225px 1fr 250px',gap:34,alignItems:'center',height:'100%' }}>
          {/* Orb */}
          <div style={{ display:'grid',placeItems:'center' }}>
            <div style={{ position:'relative',width:155,height:155,borderRadius:'50%',
              background:`radial-gradient(circle at 34% 28%,rgba(255,255,255,0.40),transparent 22%),radial-gradient(circle at 50% 50%,${g.color}d9,${g.color}3d 58%,${g.color}0f 72%)`,
              boxShadow:`0 0 0 18px ${g.color}0a,0 0 45px ${g.color}a6,inset -20px -25px 52px rgba(0,0,0,0.20)` }}>
              <div style={{ position:'absolute',left:'50%',bottom:-33,transform:'translateX(-50%)',width:160,height:28,border:`1px solid ${g.color}b3`,borderRadius:'50%',boxShadow:`0 0 16px ${g.color}42` }} />
              <div style={{ position:'absolute',left:'50%',bottom:-25,transform:'translateX(-50%)',width:105,height:18,border:`1px solid ${g.color}b3`,borderRadius:'50%' }} />
            </div>
          </div>
          {/* Labels */}
          <div>
            <div style={{ color:'#94a3b8',fontSize:24,fontWeight:900,letterSpacing:'0.26em',marginBottom:18 }}>GEX REGIME</div>
            <div style={{ color:g.color,fontSize:55,lineHeight:0.9,fontWeight:900,letterSpacing:'-0.055em',textShadow:`0 0 32px ${g.color}6b` }}>{g.label}</div>
            <div style={{ marginTop:16,color:'#cbd5e1',fontSize:25,lineHeight:1.28,fontWeight:500,letterSpacing:'-0.035em' }}>{g.desc}</div>
            <div style={{ display:'inline-flex',marginTop:14,height:40,padding:'0 24px',alignItems:'center',borderRadius:999,border:`1.5px solid ${g.color}b3`,background:`${g.color}14`,color:g.color,fontSize:20,fontWeight:900,letterSpacing:'0.10em' }}>SIGNAL: {g.signal}</div>
          </div>
          {/* Gauge */}
          <div style={{ position:'relative',width:200,height:200 }}>
            <svg viewBox="0 0 235 235" width={200} height={200} fill="none">
              <circle cx="117.5" cy="117.5" r="88" stroke="rgba(148,163,184,0.22)" strokeWidth="16" />
              <circle cx="117.5" cy="117.5" r="88" stroke="#22d3ee" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${dashLen} 553`} transform="rotate(-90 117.5 117.5)" filter="url(#gg)" />
              <circle cx="117.5" cy="117.5" r="108" stroke="rgba(34,211,238,0.12)" strokeDasharray="3 9" />
              <defs><filter id="gg" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
            </svg>
            <div style={{ position:'absolute',inset:0,display:'grid',placeItems:'center',textAlign:'center' }}>
              <div>
                <div style={{ fontSize:54,fontWeight:900,letterSpacing:'-0.06em' }}>{g.pct}%</div>
                <div style={{ marginTop:15,color:'#cbd5e1',fontSize:18,fontWeight:800,letterSpacing:'0.10em' }}>REGIME SCORE</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Metric Stack ── */}
      <div style={{ position:'absolute',left:34,right:34,top:738,display:'grid',gap:10,zIndex:20 }}>
        {/* VIX */}
        <div style={{ ...card, height:130,borderColor:'rgba(167,139,250,0.54)',display:'grid',gridTemplateColumns:'100px 1fr',alignItems:'center',padding:'18px 30px 18px 22px',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.10),0 0 22px rgba(167,139,250,0.10)' }}>
          <div style={{ width:74,height:74,borderRadius:'50%',border:'1.6px solid #a78bfa',display:'grid',placeItems:'center',boxShadow:'0 0 18px rgba(167,139,250,0.5)' }}>
            <svg width="40" height="40" viewBox="0 0 55 55" fill="none" stroke="#a78bfa" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 29h11l5-17 10 36 6-19h11"/></svg>
          </div>
          <div>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
              <div style={{ display:'flex',alignItems:'baseline',gap:18 }}>
                <span style={{ fontSize:23,fontWeight:900,letterSpacing:'0.18em' }}>VIX</span>
                <span style={{ fontSize:48,lineHeight:0.88,fontWeight:900,letterSpacing:'-0.075em',color:vixColor,textShadow:`0 0 26px ${vixColor}38` }}>{vix.toFixed(1)}</span>
              </div>
              <div style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',height:40,padding:'0 22px',borderRadius:999,border:`1.5px solid ${vixColor}b3`,color:vixColor,background:`${vixColor}12`,fontSize:20,fontWeight:900,letterSpacing:'0.12em' }}>{vixLabel}</div>
            </div>
            <div style={{ position:'relative',height:18,borderRadius:999,marginTop:16,background:'linear-gradient(90deg,#34d399,#a3e635,#fbbf24,#fb923c,#f87171)',boxShadow:'inset 0 1px 3px rgba(255,255,255,0.18)' }}>
              <span style={{ position:'absolute',left:`${vixPct}%`,top:-14,width:0,height:0,borderLeft:'9px solid transparent',borderRight:'9px solid transparent',borderTop:'16px solid #f1f5f9',filter:'drop-shadow(0 0 8px rgba(255,255,255,0.35))' }} />
            </div>
          </div>
        </div>

        {/* Dark Pool */}
        <div style={{ ...card, height:120,borderColor:'rgba(34,211,238,0.54)',display:'grid',gridTemplateColumns:'100px 1fr',alignItems:'center',padding:'16px 30px 16px 22px',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.10),0 0 22px rgba(34,211,238,0.12)' }}>
          <div style={{ width:74,height:74,borderRadius:'50%',border:'1.6px solid #22d3ee',display:'grid',placeItems:'center',boxShadow:'0 0 18px rgba(34,211,238,0.5)' }}>
            <svg width="40" height="40" viewBox="0 0 58 58" fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M29 6C18 21 12 30 12 39a17 17 0 0 0 34 0c0-9-6-18-17-33Z"/></svg>
          </div>
          <div>
            <div style={{ display:'flex',alignItems:'baseline',gap:18 }}>
              <span style={{ fontSize:23,fontWeight:900,letterSpacing:'0.18em' }}>DARK POOL</span>
              <span style={{ fontSize:46,lineHeight:0.88,fontWeight:900,letterSpacing:'-0.075em',color:dpColor,textShadow:`0 0 26px ${dpColor}38` }}>{dp > 0 ? `${dp.toFixed(1)}%` : '—'}</span>
            </div>
            <div style={{ marginTop:12 }}>
              <div style={{ height:18,borderRadius:999,background:'rgba(148,163,184,0.12)',border:'1px solid rgba(34,211,238,0.55)',overflow:'hidden' }}>
                <div style={{ width:`${Math.min(dp, 100)}%`,height:'100%',borderRadius:'inherit',background:'linear-gradient(90deg,#22d3ee,#67e8f9)',boxShadow:'0 0 23px rgba(34,211,238,0.50)' }} />
              </div>
              <div style={{ marginTop:8,display:'flex',justifyContent:'space-between',color:'#94a3b8',fontSize:17,fontWeight:500 }}><span>0%</span><span>100%</span></div>
            </div>
          </div>
        </div>

        {/* Fear & Greed */}
        <div style={{ ...card, height:155,borderColor:'rgba(167,139,250,0.54)',display:'grid',gridTemplateColumns:'100px 1fr',alignItems:'center',padding:'18px 30px 18px 22px',boxShadow:'inset 0 1px 0 rgba(255,255,255,0.10),0 0 22px rgba(167,139,250,0.10)' }}>
          <div style={{ width:74,height:74,borderRadius:'50%',border:'1.6px solid #a78bfa',display:'grid',placeItems:'center',boxShadow:'0 0 18px rgba(167,139,250,0.5)' }}>
            <svg width="40" height="40" viewBox="0 0 58 58" fill="none" stroke="#a78bfa" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 40a19 19 0 0 1 38 0"/><path d="M29 40l12-18"/></svg>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'160px 1fr',gap:12,alignItems:'center' }}>
            <div>
              <div style={{ fontSize:23,fontWeight:900,letterSpacing:'0.18em' }}>FEAR &amp; GREED</div>
              <div style={{ marginTop:10,fontSize:52,lineHeight:0.88,fontWeight:900,letterSpacing:'-0.075em' }}>{fgi}</div>
              <div style={{ marginTop:12,color:fgiColor,fontSize:24,fontWeight:900,letterSpacing:'0.16em' }}>{fgiLabel}</div>
            </div>
            <div style={{ position:'relative',width:'100%',height:120,overflow:'visible' }}>
              <svg viewBox="0 0 350 145" width="100%" height="100%" fill="none" style={{ overflow:'visible' }}>
                <defs><linearGradient id="fgG" x1="38" y1="118" x2="312" y2="118" gradientUnits="userSpaceOnUse"><stop stopColor="#f87171"/><stop offset="0.48" stopColor="#fbbf24"/><stop offset="1" stopColor="#34d399"/></linearGradient></defs>
                <path d="M45 121A130 130 0 0 1 305 121" stroke="url(#fgG)" strokeWidth="18" strokeLinecap="butt" />
                <line x1="175" y1="121" x2={nx} y2={ny} stroke="#f1f5f9" strokeWidth="5" strokeLinecap="round" />
                <circle cx="175" cy="121" r="15" fill="#0b1220" stroke="#94a3b8" strokeWidth="2" />
                <text x="38" y="144" fill="#f87171" fontSize="20" fontWeight="800">0</text>
                <text x="294" y="144" fill="#34d399" fontSize="20" fontWeight="800">100</text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ── Insight ── */}
      <div style={{ ...card, position:'absolute',left:34,right:34,bottom:56,height:105,borderColor:'rgba(34,211,238,0.46)',display:'grid',gridTemplateColumns:'36px 1fr',gap:28,alignItems:'center',padding:'0 36px',zIndex:20,boxShadow:'inset 0 1px 0 rgba(255,255,255,0.10),0 18px 42px rgba(0,0,0,0.28),0 0 23px rgba(34,211,238,0.10)' }}>
        <div style={{ width:5,height:65,borderRadius:999,background:'#22d3ee',boxShadow:'0 0 22px rgba(34,211,238,0.70)' }} />
        <div style={{ color:'#cbd5e1',fontSize:28,lineHeight:1.25,fontWeight:700,fontStyle:'italic',letterSpacing:'-0.06em' }}>{insightText}</div>
      </div>

      {/* ── Footer ── */}
      <div style={{ position:'absolute',left:0,right:0,bottom:18,textAlign:'center',zIndex:25 }}>
        <div style={{ position:'relative',display:'inline-block' }}>
          <span style={{ color:'#94a3b8',fontSize:23,fontWeight:500,letterSpacing:'0.44em' }}>signumhq.com</span>
        </div>
      </div>
    </div>
  );
}

export default function PulsePinPage() {
  return (
    <Suspense fallback={<div style={{ width: 1000, height: 1500, background: '#050813' }} />}>
      <PulsePinContent />
    </Suspense>
  );
}
