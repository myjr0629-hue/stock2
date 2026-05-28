'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const COMPANY_MAP: Record<string, string> = {
  NVDA: 'NVIDIA Corp', TSLA: 'Tesla Inc', AAPL: 'Apple Inc',
  MSFT: 'Microsoft Corp', GOOGL: 'Alphabet Inc', META: 'Meta Platforms',
  AMZN: 'Amazon.com Inc', SPY: 'SPDR S&P 500 ETF', QQQ: 'Invesco QQQ Trust',
  AMD: 'Advanced Micro Devices', AVGO: 'Broadcom Inc', MRVL: 'Marvell Technology',
  MU: 'Micron Technology', ARM: 'Arm Holdings', TSM: 'Taiwan Semiconductor',
  LLY: 'Eli Lilly', CRWD: 'CrowdStrike', PANW: 'Palo Alto Networks',
  SNOW: 'Snowflake Inc', CRM: 'Salesforce Inc', SOFI: 'SoFi Technologies',
};

function SpotlightContent() {
  const sp = useSearchParams();
  const ticker = sp.get('t') || 'NVDA';
  const company = sp.get('company') || COMPANY_MAP[ticker] || ticker;
  const price = sp.get('price') || '0';
  const change = parseFloat(sp.get('change') || '0');
  const dp = parseFloat(sp.get('dp') || '0');
  const whale = parseInt(sp.get('whale') || '50', 10);
  const gex = (sp.get('gex') || 'neutral').toUpperCase();
  const premium = sp.get('premium') || '';
  const date = sp.get('date') || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const insightParam = sp.get('insight') || '';

  const changeFmt = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  const changeColor = change >= 0 ? '#34d399' : '#f87171';
  const changeArrow = change >= 0 ? '▲' : '▼';

  const gexColor = gex === 'POSITIVE' ? '#34d399' : gex === 'NEGATIVE' ? '#f87171' : gex === 'TRANSITION' ? '#fbbf24' : '#94a3b8';
  const gexSub = gex === 'POSITIVE' ? 'Dealer support active' : gex === 'NEGATIVE' ? 'Volatility amplified' : gex === 'TRANSITION' ? 'Regime shifting' : 'Neutral positioning';

  const flowLabel = whale >= 65 ? 'ACCUMULATION' : whale <= 35 ? 'DISTRIBUTION' : 'NEUTRAL';
  const flowColor = whale >= 65 ? '#34d399' : whale <= 35 ? '#f87171' : '#94a3b8';
  const flowNote = whale >= 65 ? 'Call-side concentrated' : whale <= 35 ? 'Put-side concentrated' : 'Balanced positioning';

  const dpLabel = dp >= 40 ? 'Above Average' : dp >= 25 ? 'Average' : 'Below Average';
  const dpLabelColor = dp >= 40 ? '#34d399' : '#94a3b8';

  const premiumFmt = premium || (whale >= 50 ? '+$' + ((whale * 0.37 + 2.1) % 20 + 5).toFixed(1) + 'M' : '-$' + ((whale * 0.29 + 1.7) % 15 + 3).toFixed(1) + 'M');
  const premiumColor = premiumFmt.startsWith('+') || premiumFmt.startsWith('$') ? '#34d399' : '#f87171';

  // Insight: URL param > data-driven fallback
  const insightText = insightParam || (
    whale >= 65
      ? `Sustained accumulation observed in $${ticker} across dark pool and options channels.`
      : whale <= 35
      ? `Distribution pattern detected in $${ticker} — institutional positioning shifting.`
      : `$${ticker} institutional flow at ${dp.toFixed(1)}% dark pool activity with ${gex.toLowerCase()} GEX positioning.`
  );

  // Ticker logo URL (FMP static logos)
  const logoUrl = `https://financialmodelingprep.com/image-stock/${ticker}.png`;

  const panel: React.CSSProperties = {
    background: 'radial-gradient(circle at 98% 12%,rgba(34,211,238,0.10),transparent 34%),linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.018)),rgba(8,15,27,0.74)',
    border: '1px solid rgba(255,255,255,0.30)',
    borderRadius: 16,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14),0 18px 54px rgba(0,0,0,0.32),0 0 28px rgba(34,211,238,0.08)',
    backdropFilter: 'blur(16px)',
  };

  const metricRow: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '92px 1fr 240px',
    alignItems: 'center',
    minHeight: 100,
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    gap: 20,
  };

  const iconCircle = (color: string): React.CSSProperties => ({
    width: 72, height: 72, borderRadius: '50%',
    border: `1.5px solid ${color}`,
    display: 'grid', placeItems: 'center',
    background: 'rgba(255,255,255,0.02)',
    boxShadow: `inset 0 0 24px rgba(255,255,255,0.03), 0 0 17px ${color}`,
  });

  // Sparkline polyline — simple ascending curve for visual
  const sparkPoints = '0,237 25,228 47,198 93,151 148,98 205,49 270,8';

  return (
    <div className="ready" style={{
      width: 1200, height: 675, position: 'relative', overflow: 'hidden',
      color: '#f1f5f9', fontFamily: "'Inter', system-ui, sans-serif",
      background: `radial-gradient(circle at 78% 8%,rgba(124,58,237,0.22),transparent 34%),radial-gradient(circle at 96% 42%,rgba(34,211,238,0.14),transparent 36%),radial-gradient(circle at 0% 96%,rgba(124,58,237,0.15),transparent 32%),linear-gradient(135deg,#06090f,#060d1a)`,
      isolation: 'isolate',
    }}>
      {/* Grid */}
      <div style={{ position:'absolute',inset:0,zIndex:0,opacity:0.34,
        backgroundImage:'linear-gradient(rgba(34,211,238,0.055) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.055) 1px,transparent 1px)',
        backgroundSize:'36px 36px',
        maskImage:'radial-gradient(circle at 78% 42%,black 0%,transparent 62%)',
        WebkitMaskImage:'radial-gradient(circle at 78% 42%,black 0%,transparent 62%)',
      }} />
      {/* Scanline */}
      <div style={{ position:'absolute',inset:0,zIndex:100,pointerEvents:'none',opacity:0.035,
        background:'repeating-linear-gradient(to bottom,rgba(255,255,255,0.90) 0,rgba(255,255,255,0.90) 1px,transparent 1px,transparent 5px)',
        mixBlendMode:'overlay',
      }} />
      {/* Nodes decoration */}
      <svg style={{ position:'absolute',left:340,top:42,width:380,height:165,zIndex:1,opacity:0.40 }} viewBox="0 0 380 165" fill="none">
        <g stroke="#22d3ee" strokeOpacity="0.26" strokeWidth="1">
          <path d="M8 128 82 78 154 101 230 37 320 62 372 27" />
          <path d="M82 78 121 20 154 101 220 122 320 62" />
          <path d="M154 101 230 37 274 104 372 27" />
        </g>
        <g fill="#a78bfa" opacity="0.65">
          <circle cx="8" cy="128" r="3"/><circle cx="82" cy="78" r="3"/><circle cx="121" cy="20" r="3"/>
          <circle cx="154" cy="101" r="3"/><circle cx="230" cy="37" r="3"/><circle cx="274" cy="104" r="3"/>
          <circle cx="320" cy="62" r="3"/><circle cx="372" cy="27" r="3"/>
        </g>
      </svg>

      {/* ── Header ── */}
      <div style={{ position:'absolute',left:37,right:61,top:35,zIndex:20,display:'grid',gridTemplateColumns:'470px 1fr' }}>
        <div style={{ display:'grid',gridTemplateColumns:'74px 1px 1fr',gap:24,alignItems:'center' }}>
          <div style={{ width:68,height:68,borderRadius:13,display:'grid',placeItems:'center',
            background:'radial-gradient(circle at 25% 18%,rgba(255,255,255,0.22),transparent 35%),linear-gradient(135deg,#101827,#111827 48%,#0f172a)',
            border:'1.5px solid rgba(34,211,238,0.74)',
            boxShadow:'0 0 28px rgba(34,211,238,0.28),inset 0 1px 0 rgba(255,255,255,0.20)',
          }}>
            <img src="/icons/icon-192x192.png" alt="" style={{ width:48,height:48,borderRadius:8 }} />
          </div>
          <div style={{ width:1,height:76,background:'linear-gradient(to bottom,transparent,#22d3ee,transparent)',boxShadow:'0 0 18px rgba(34,211,238,0.54)' }} />
          <div>
            <div style={{ fontSize:32,lineHeight:1,fontWeight:900,letterSpacing:'-0.04em',textShadow:'0 0 18px rgba(255,255,255,0.10)' }}>
              SIGNUM <span style={{ color:'#22d3ee' }}>HQ</span>
            </div>
            <div style={{ marginTop:11,color:'#d2d9e6',fontSize:17,fontWeight:500,letterSpacing:'-0.02em' }}>See What Others Cannot</div>
          </div>
        </div>
        <div style={{ justifySelf:'end',textAlign:'right',paddingTop:13 }}>
          <div style={{ color:'#22d3ee',fontSize:23,fontWeight:900,letterSpacing:'0.36em',textTransform:'uppercase' as const,textShadow:'0 0 18px rgba(34,211,238,0.26)' }}>
            SPOTLIGHT ANALYSIS
          </div>
          <div style={{ width:315,height:3,marginTop:16,marginLeft:'auto',borderRadius:999,background:'linear-gradient(90deg,transparent,#22d3ee,#a78bfa,transparent)',boxShadow:'0 0 18px rgba(34,211,238,0.50)' }} />
          <div style={{ marginTop:14,color:'#94a3b8',fontSize:20,fontWeight:500,letterSpacing:'0.08em' }}>{date}</div>
        </div>
      </div>

      {/* ── Left: Ticker Hero ── */}
      <div style={{ position:'absolute',left:48,top:162,width:492,zIndex:16 }}>
        {/* Ticker + Logo */}
        <div style={{ display:'flex',alignItems:'center',gap:20 }}>
          <img src={logoUrl} alt="" style={{
            width:72,height:72,borderRadius:16,objectFit:'contain',
            background:'rgba(255,255,255,0.06)',border:'1.5px solid rgba(255,255,255,0.18)',
            boxShadow:'0 6px 24px rgba(0,0,0,0.40),0 0 16px rgba(34,211,238,0.12)',
          }} />
          <h1 style={{
            margin:0,fontSize:108,lineHeight:0.86,fontWeight:900,letterSpacing:'-0.075em',
            background:'linear-gradient(105deg,#f1f5f9 0%,#ffffff 34%,#67e8f9 78%,#22d3ee 100%)',
            WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent',
          }}>${ticker}</h1>
        </div>
        <div style={{ marginTop:20,color:'#94a3b8',fontSize:29,fontWeight:700,letterSpacing:'0.08em' }}>{company}</div>
        <div style={{ marginTop:32,fontSize:60,lineHeight:0.86,fontWeight:900,letterSpacing:'-0.065em',textShadow:'0 8px 30px rgba(0,0,0,0.34)' }}>
          ${parseFloat(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ marginTop:24,color:changeColor,fontSize:54,lineHeight:0.9,fontWeight:900,letterSpacing:'-0.06em',textShadow:`0 0 26px ${changeColor}66` }}>
          {changeFmt} <span style={{ fontSize:34,marginLeft:10,filter:`drop-shadow(0 0 12px ${changeColor}99)` }}>{changeArrow}</span>
        </div>
        <div style={{ width:176,height:3,marginTop:28,borderRadius:999,background:'linear-gradient(90deg,#22d3ee,transparent)',boxShadow:'0 0 20px rgba(34,211,238,0.54)' }} />
      </div>

      {/* Sparkline bg */}
      <svg style={{ position:'absolute',left:245,top:215,width:270,height:260,zIndex:0,opacity:0.42 }} viewBox="0 0 270 260" fill="none">
        <polyline points={sparkPoints} stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.95" />
        <polygon points={`${sparkPoints} 270,260 0,260`} fill="#22d3ee" opacity="0.10" />
        <g stroke="rgba(34,211,238,.15)"><path d="M0 40H270M0 90H270M0 140H270M0 190H270"/><path d="M55 0V260M110 0V260M165 0V260M220 0V260"/></g>
      </svg>

      {/* ── Right: Metrics Panel ── */}
      <div style={{ position:'absolute',right:62,top:152,width:636,height:350,padding:'22px 27px',zIndex:18,...panel,overflow:'hidden' }}>
        {/* Smart Flow */}
        <div style={{ ...metricRow }}>
          <div style={iconCircle(flowColor)}>
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke={flowColor} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 31V18M18 31V10M29 31V20M37 31V7" /><path d="M7 18l11-8 11 10 8-13" />
            </svg>
          </div>
          <div>
            <div style={{ color:'#f1f5f9',fontSize:21,fontWeight:900,letterSpacing:'0.20em',textTransform:'uppercase' as const,marginBottom:17 }}>SMART FLOW</div>
            <div style={{ position:'relative',width:238,height:18,borderRadius:999,background:'rgba(148,163,184,0.16)',border:'1px solid rgba(255,255,255,0.18)',overflow:'hidden' }}>
              <div style={{ width:`${whale}%`,height:'100%',borderRadius:'inherit',background:`linear-gradient(90deg,${flowColor}88,${flowColor})`,boxShadow:`0 0 18px ${flowColor}88` }} />
            </div>
            <div style={{ marginTop:12,display:'flex',justifyContent:'space-between',color:'#94a3b8',fontSize:14,fontWeight:600,width:238 }}>
              <span>0</span><span>25</span><span>50</span><span>75</span><span>100</span>
            </div>
          </div>
          <div style={{ borderLeft:'1px dashed rgba(255,255,255,0.18)',paddingLeft:25,minHeight:72,display:'flex',flexDirection:'column',justifyContent:'center' }}>
            <div style={{ display:'flex',alignItems:'baseline',gap:24 }}>
              <span style={{ color:flowColor,fontSize:49,lineHeight:0.86,fontWeight:900,letterSpacing:'-0.06em',textShadow:`0 0 26px ${flowColor}66` }}>{whale}</span>
              <span style={{ color:flowColor,fontSize:18,fontWeight:900,letterSpacing:'0.12em',textTransform:'uppercase' as const }}>{flowLabel}</span>
            </div>
            <div style={{ marginTop:15,color:'#cbd5e1',fontSize:18,fontWeight:500,letterSpacing:'-0.02em' }}>{flowNote}</div>
          </div>
        </div>

        {/* Dark Pool */}
        <div style={{ ...metricRow }}>
          <div style={iconCircle('#22d3ee')}>
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="#22d3ee" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 5C14 16 10 23 10 30a12 12 0 0 0 24 0c0-7-4-14-12-25Z" />
            </svg>
          </div>
          <div>
            <div style={{ color:'#f1f5f9',fontSize:21,fontWeight:900,letterSpacing:'0.20em',textTransform:'uppercase' as const,marginBottom:17 }}>DARK POOL</div>
            <div style={{ position:'relative',width:238,height:18,borderRadius:999,background:'rgba(148,163,184,0.16)',border:'1px solid rgba(255,255,255,0.18)',overflow:'hidden' }}>
              <div style={{ width:`${Math.min(dp,100)}%`,height:'100%',borderRadius:'inherit',background:'linear-gradient(90deg,#22d3ee,#67e8f9)',boxShadow:'0 0 18px rgba(34,211,238,0.48)' }} />
            </div>
            <div style={{ marginTop:12,display:'flex',justifyContent:'space-between',color:'#94a3b8',fontSize:14,fontWeight:600,width:238 }}>
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>
          <div style={{ borderLeft:'1px dashed rgba(255,255,255,0.18)',paddingLeft:25,minHeight:72,display:'flex',flexDirection:'column',justifyContent:'center' }}>
            <div style={{ color:'#22d3ee',fontSize:48,lineHeight:0.88,fontWeight:900,letterSpacing:'-0.065em',textShadow:'0 0 24px rgba(34,211,238,0.36)' }}>{dp > 0 ? `${dp.toFixed(1)}%` : '—'}</div>
            <div style={{ marginTop:14,color:dpLabelColor,fontSize:18,fontWeight:600 }}>{dpLabel}</div>
          </div>
        </div>

        {/* GEX Regime */}
        <div style={{ ...metricRow, borderBottom:'none', gridTemplateColumns:'60px 1fr 200px', gap:16 }}>
          <div style={{ display:'grid',placeItems:'center' }}>
            <div style={{
              width:48,height:48,borderRadius:'50%',
              background:`radial-gradient(circle at 35% 28%,rgba(255,255,255,0.36),transparent 25%),${gexColor}ee`,
              boxShadow:`0 0 0 10px ${gexColor}0f,0 0 22px ${gexColor}bb,inset -8px -10px 18px rgba(0,0,0,0.20)`,
            }} />
          </div>
          <div>
            <div style={{ color:'#f1f5f9',fontSize:18,fontWeight:900,letterSpacing:'0.20em',textTransform:'uppercase' as const,marginBottom:12 }}>GEX REGIME</div>
            <div style={{ display:'flex',alignItems:'center',gap:14 }}>
              <span style={{ color:gexColor,fontSize:32,lineHeight:0.9,fontWeight:900,letterSpacing:'0.04em',textShadow:`0 0 24px ${gexColor}66`,textTransform:'uppercase' as const }}>{gex}</span>
            </div>
            <div style={{ marginTop:10,color:'#cbd5e1',fontSize:17,fontWeight:500 }}>{gexSub}</div>
          </div>
          <div style={{ display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'flex-end',borderLeft:'1px dashed rgba(255,255,255,0.18)',paddingLeft:20 }}>
            <div style={{
              display:'inline-flex',alignItems:'center',justifyContent:'center',
              height:38,padding:'0 16px',borderRadius:999,
              color:premiumColor,border:`1.5px solid ${premiumColor}9e`,background:`${premiumColor}14`,
              fontSize:14,fontWeight:900,letterSpacing:'0.08em',textTransform:'uppercase' as const,whiteSpace:'nowrap',
            }}>NET PREMIUM {premiumFmt}</div>
          </div>
        </div>
      </div>

      {/* ── Insight Bar ── */}
      <div style={{
        position:'absolute',left:39,right:61,bottom:93,height:91,borderRadius:13,
        border:'1px solid rgba(255,255,255,0.17)',
        background:'linear-gradient(135deg,rgba(255,255,255,0.065),rgba(255,255,255,0.016)),rgba(8,15,27,0.76)',
        boxShadow:'inset 0 1px 0 rgba(255,255,255,0.08),0 18px 42px rgba(0,0,0,0.24)',
        display:'grid',gridTemplateColumns:'50px 1fr',alignItems:'center',gap:25,
        padding:'0 54px 0 29px',zIndex:22,
      }}>
        <div style={{ width:5,height:58,borderRadius:999,background:'#22d3ee',boxShadow:'0 0 22px rgba(34,211,238,0.72)' }} />
        <div style={{ color:'#cbd5e1',fontSize:27,lineHeight:1.2,fontWeight:600,fontStyle:'italic',letterSpacing:'-0.045em' }}>
          {insightText}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ position:'absolute',left:50,right:50,bottom:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',zIndex:22 }}>
        <div style={{ position:'absolute',left:0,top:'50%',width:400,height:1,background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)' }} />
        <div style={{ position:'absolute',right:0,top:'50%',width:400,height:1,background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)' }} />
        <div style={{ color:'#94a3b8',fontSize:19,fontWeight:500,letterSpacing:'0.45em' }}>signumhq.com</div>
      </div>
    </div>
  );
}

export default function SpotlightOGPage() {
  return (
    <Suspense fallback={<div style={{ width: 1200, height: 675, background: '#06090f' }} />}>
      <SpotlightContent />
    </Suspense>
  );
}
