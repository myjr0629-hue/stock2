'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const BG = '#06090f';
const panel:React.CSSProperties = {borderRadius:15,border:'1px solid rgba(255,255,255,.16)',background:'linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.015)),rgba(10,17,30,.74)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.10),0 18px 48px rgba(0,0,0,.26)',backdropFilter:'blur(14px)',overflow:'hidden'};

function MCContent() {
  const sp = useSearchParams();
  const spy = parseFloat(sp.get('spy')||'0');
  const qqq = parseFloat(sp.get('qqq')||'0');
  const dia = parseFloat(sp.get('dia')||'0');
  const vix = parseFloat(sp.get('vix')||'18');
  const dp = parseFloat(sp.get('dp')||'0');
  const gex = (sp.get('gex')||'neutral').toLowerCase();
  const fgi = parseInt(sp.get('fgi')||'50',10);
  const date = sp.get('date')||new Date().toISOString().split('T')[0];

  const fmt = (v:number)=>`${v>=0?'+':''}${v.toFixed(2)}%`;
  const clr = (v:number)=>v>0?'#34d399':v<0?'#f87171':'#94a3b8';
  const vixC = vix>=30?'#f87171':vix>=25?'#f97316':vix>=18?'#fbbf24':'#34d399';
  const vixL = vix>=30?'EXTREME':vix>=25?'HIGH':vix>=18?'ELEVATED':'CALM';
  const gCfg:Record<string,{c:string;l:string;p:number}> = {positive:{c:'#34d399',l:'POSITIVE',p:78},negative:{c:'#f87171',l:'NEGATIVE',p:18},neutral:{c:'#94a3b8',l:'NEUTRAL',p:50},transition:{c:'#fbbf24',l:'TRANSITION',p:50}};
  const g = gCfg[gex]||gCfg.neutral;
  const fgiL = fgi>=75?'EXTREME GREED':fgi>=55?'GREED':fgi>=45?'NEUTRAL':fgi>=25?'FEAR':'EXTREME FEAR';
  const fgiC = fgi>=55?'#34d399':fgi>=45?'#fbbf24':'#f87171';
  const needleA = -90+(fgi/100)*180;
  const nx = 155+85*Math.cos((needleA-90)*Math.PI/180);
  const ny = 154+85*Math.sin((needleA-90)*Math.PI/180);
  const dateFmt = (()=>{try{return new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}catch{return date;}})();

  // Sparkline generator
  const spark = (v:number,seed:number) => {
    const pts:string[]=[];let y=100;
    for(let i=0;i<=16;i++){
      const t=i/16;
      y=100-(v*40+20)*t+Math.sin(i*1.7+seed)*14+Math.cos(i*0.9+seed*2)*10;
      y=Math.max(4,Math.min(116,y));
      pts.push(`${i===0?'M':'C'}${(i*(300/16)).toFixed(0)} ${y.toFixed(0)}`);
    }
    // simplified polyline
    const points:Array<{x:number;y:number}>=[];
    let cy=100;
    for(let i=0;i<=14;i++){
      const t=i/14;
      cy=100-(v*40+20)*t+Math.sin(i*1.7+seed)*14+Math.cos(i*0.9+seed*2)*10;
      cy=Math.max(4,Math.min(116,cy));
      points.push({x:i*(300/14),y:cy});
    }
    const line=points.map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join(' ');
    const area=`${line}V120H0Z`;
    const last=points[points.length-1];
    return {line,area,last};
  };

  const indices = [
    {name:'S&P 500',v:spy,s:spark(spy,1)},
    {name:'NASDAQ',v:qqq,s:spark(qqq,2)},
    {name:'DOW',v:dia,s:spark(dia,3)},
  ];

  return <div style={{position:'relative',width:1080,height:1080,overflow:'hidden',color:'#f1f5f9',fontFamily:"'Inter',system-ui,sans-serif",background:`radial-gradient(circle at 83% 92%,rgba(167,139,250,.20),transparent 28%),radial-gradient(circle at 5% 96%,rgba(34,211,238,.24),transparent 28%),radial-gradient(circle at 50% 5%,rgba(34,211,238,.08),transparent 34%),linear-gradient(135deg,${BG},#060d1a)`,isolation:'isolate'}}>
    {/* Grid overlay */}
    <div style={{position:'absolute',inset:0,zIndex:0,opacity:.35,backgroundImage:'linear-gradient(rgba(34,211,238,.065) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.065) 1px,transparent 1px)',backgroundSize:'34px 34px',maskImage:'radial-gradient(circle at 50% 45%,black,transparent 83%)'}}/>
    {/* Scanline */}
    <div style={{position:'absolute',inset:0,zIndex:100,pointerEvents:'none',opacity:.04,background:'repeating-linear-gradient(to bottom,rgba(255,255,255,.9) 0,rgba(255,255,255,.9) 1px,transparent 1px,transparent 5px)',mixBlendMode:'overlay' as const}}/>
    {/* Floor dots */}
    <div style={{position:'absolute',left:-60,right:-60,bottom:-80,height:210,opacity:.55,backgroundImage:'radial-gradient(circle,rgba(34,211,238,.62) 0 1.5px,transparent 2px)',backgroundSize:'14px 14px',transform:'perspective(560px) rotateX(62deg)',transformOrigin:'bottom center',maskImage:'linear-gradient(to top,black,transparent 84%)'}}/>

    {/* Header */}
    <div style={{position:'absolute',left:27,right:27,top:13,height:90,display:'grid',gridTemplateColumns:'260px 1fr 200px',alignItems:'center',zIndex:20}}>
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192x192.png" alt="" width={60} height={60} style={{borderRadius:13,filter:'drop-shadow(0 0 14px rgba(34,211,238,.25))'}}/>
        <span style={{fontSize:28,fontWeight:800,letterSpacing:'-.03em',textShadow:'0 0 18px rgba(255,255,255,.12)'}}>SIGNUM HQ</span>
      </div>
      <div style={{justifySelf:'center',color:'#22d3ee',fontSize:25,fontWeight:900,letterSpacing:'.36em',textShadow:'0 0 18px rgba(34,211,238,.25)'}}>MARKET CLOSE</div>
      <div style={{justifySelf:'end',color:'#c8d3e1',fontSize:20,fontWeight:700}}>{dateFmt}</div>
    </div>
    {/* Divider */}
    <div style={{position:'absolute',left:0,right:0,top:89,height:2,background:'linear-gradient(90deg,#22d3ee,rgba(255,255,255,.50),#a78bfa)',boxShadow:'0 0 18px rgba(34,211,238,.50),0 0 18px rgba(167,139,250,.30)',zIndex:25}}/>

    {/* 3 Index cards */}
    <div style={{position:'absolute',left:28,right:28,top:110,height:290,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,zIndex:15}}>
      {indices.map((idx,i)=>(
        <div key={i} style={{...panel,padding:'22px 24px 18px',borderColor:`${clr(idx.v)}55`,boxShadow:`inset 0 1px 0 rgba(255,255,255,.10),0 0 27px ${clr(idx.v)}14`}}>
          <div style={{fontSize:24,fontWeight:900,letterSpacing:'.05em'}}>{idx.name}</div>
          <div style={{marginTop:14,fontSize:64,lineHeight:.9,fontWeight:900,letterSpacing:'-.07em',color:clr(idx.v),textShadow:`0 0 30px ${clr(idx.v)}44`}}>{fmt(idx.v)}</div>
          <div style={{marginTop:12,color:'#94a3b8',fontSize:15,fontWeight:800,letterSpacing:'.08em'}}>TODAY&apos;S CHANGE</div>
          <svg style={{position:'absolute',left:16,right:16,bottom:14,height:90,width:'calc(100% - 32px)'}} viewBox="0 0 300 120" fill="none">
            <path d={idx.s.line} stroke={`${clr(idx.v)}cc`} strokeWidth="3" strokeLinecap="round" fill="none"/>
            <path d={idx.s.area} fill={clr(idx.v)} opacity=".16"/>
            <circle cx={idx.s.last.x} cy={idx.s.last.y} r="5" fill={clr(idx.v)} filter={`drop-shadow(0 0 6px ${clr(idx.v)})`}/>
          </svg>
        </div>
      ))}
    </div>

    {/* 4 Metric cards 2×2 */}
    <div style={{position:'absolute',left:27,right:27,top:418,height:540,display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:15,zIndex:15}}>
      {/* VIX */}
      <div style={{...panel,padding:'24px 28px',borderColor:'rgba(251,191,36,.46)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.10),0 0 27px rgba(251,191,36,.10)'}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:56,height:56,flexShrink:0,borderRadius:'50%',border:'1.5px solid #fbbf24',display:'grid',placeItems:'center',color:'#fbbf24',background:'rgba(255,255,255,.02)',boxShadow:'0 0 17px rgba(251,191,36,.3)'}}>
            <svg width="32" height="32" viewBox="0 0 47 47" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 24h10l5-17 10 36 5-19h9"/></svg>
          </div>
          <span style={{fontSize:22,fontWeight:900,letterSpacing:'.06em'}}>VIX</span>
        </div>
        <div style={{display:'flex',alignItems:'baseline',gap:20,marginTop:18}}>
          <span style={{fontSize:72,lineHeight:.88,fontWeight:900,textShadow:'0 8px 30px rgba(0,0,0,.32)'}}>{vix.toFixed(1)}</span>
          <span style={{display:'inline-flex',height:38,padding:'0 20px',borderRadius:10,alignItems:'center',border:`1.5px solid ${vixC}bb`,color:vixC,background:`${vixC}14`,fontSize:19,fontWeight:900,letterSpacing:'.06em'}}>{vixL}</span>
        </div>
      </div>

      {/* Dark Pool */}
      <div style={{...panel,padding:'24px 28px',borderColor:'rgba(34,211,238,.46)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.10),0 0 27px rgba(34,211,238,.10)'}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:56,height:56,flexShrink:0,borderRadius:'50%',border:'1.5px solid #22d3ee',display:'grid',placeItems:'center',color:'#22d3ee',background:'rgba(255,255,255,.02)',boxShadow:'0 0 17px rgba(34,211,238,.3)'}}>
            <svg width="34" height="34" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M28 4C18 18 12 27 12 36a16 16 0 0032 0c0-9-6-18-16-32Z"/></svg>
          </div>
          <span style={{fontSize:22,fontWeight:900,letterSpacing:'.06em'}}>DARK POOL</span>
        </div>
        <div style={{marginTop:18,fontSize:72,lineHeight:.88,fontWeight:900}}>{dp>0?dp.toFixed(1):'—'}<span style={{fontSize:36,letterSpacing:'-.05em'}}>%</span></div>
        <div style={{marginTop:16,height:16,borderRadius:999,border:'1px solid rgba(34,211,238,.45)',background:'rgba(148,163,184,.12)',overflow:'hidden'}}>
          <div style={{width:`${Math.min(dp*2,100)}%`,height:'100%',borderRadius:'inherit',background:'linear-gradient(90deg,#22d3ee,#67e8f9)',boxShadow:'0 0 22px rgba(34,211,238,.55)'}}/>
        </div>
        <div style={{marginTop:6,textAlign:'right',color:'#22d3ee',fontSize:16,fontWeight:800}}>{dp.toFixed(1)}%</div>
      </div>

      {/* GEX */}
      <div style={{...panel,padding:'24px 28px 80px',borderColor:`${g.c}55`,boxShadow:`inset 0 1px 0 rgba(255,255,255,.10),0 0 27px ${g.c}14`}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:56,height:56,flexShrink:0,borderRadius:'50%',border:`1.5px solid ${g.c}`,display:'grid',placeItems:'center',color:g.c,background:'rgba(255,255,255,.02)',boxShadow:`0 0 17px ${g.c}55`}}>
            <svg width="32" height="32" viewBox="0 0 50 50" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><path d="M3 28c8-14 15-14 23 0s14 14 21 0"/></svg>
          </div>
          <span style={{fontSize:22,fontWeight:900,letterSpacing:'.05em'}}>GEX REGIME</span>
        </div>
        <div style={{marginTop:18,fontSize:52,lineHeight:.88,fontWeight:900,color:g.c,textShadow:`0 0 26px ${g.c}44`}}>{g.l}</div>
        <div style={{position:'absolute',left:28,right:28,bottom:48,height:12,borderRadius:999,background:'linear-gradient(90deg,#f87171,#667085 48%,#34d399)',boxShadow:'inset 0 1px 3px rgba(255,255,255,.14)'}}>
          <span style={{position:'absolute',left:`${g.p}%`,top:-14,width:0,height:0,borderLeft:'9px solid transparent',borderRight:'9px solid transparent',borderTop:'16px solid #f1f5f9',filter:'drop-shadow(0 0 9px rgba(255,255,255,.38))',transform:'translateX(-50%)'}}/>
        </div>
        <div style={{position:'absolute',left:28,right:28,bottom:20,display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:800,letterSpacing:'.07em'}}>
          <span style={{color:'#f87171'}}>Negative</span><span style={{color:'#94a3b8'}}>Neutral</span><span style={{color:'#34d399'}}>Positive</span>
        </div>
      </div>

      {/* Fear & Greed */}
      <div style={{...panel,padding:'24px 28px',borderColor:`${fgiC}55`,boxShadow:`inset 0 1px 0 rgba(255,255,255,.10),0 0 27px ${fgiC}14`}}>
        <div style={{fontSize:22,fontWeight:900,letterSpacing:'.04em',marginBottom:8}}>FEAR &amp; GREED</div>
        <div style={{display:'grid',gridTemplateColumns:'130px 1fr',gap:10,alignItems:'end'}}>
          <div>
            <div style={{fontSize:72,lineHeight:.82,fontWeight:900,color:fgiC,textShadow:`0 0 26px ${fgiC}44`}}>{fgi}</div>
            <div style={{marginTop:12,fontSize:20,fontWeight:900,letterSpacing:'.04em',color:fgiC}}>{fgiL}</div>
          </div>
          <svg viewBox="0 0 310 190" fill="none" style={{width:'100%',height:'auto'}}>
            <defs><linearGradient id="fgG" x1="25" y1="152" x2="285" y2="152" gradientUnits="userSpaceOnUse"><stop stopColor="#f87171"/><stop offset=".48" stopColor="#fbbf24"/><stop offset="1" stopColor="#34d399"/></linearGradient></defs>
            <path d="M36 154A120 120 0 01274 154" stroke="url(#fgG)" strokeWidth="22" strokeLinecap="butt"/>
            <line x1="155" y1="154" x2={nx} y2={ny} stroke="#f1f5f9" strokeWidth="7" strokeLinecap="round"/>
            <circle cx="155" cy="154" r="15" fill="#0b1220" stroke="#94a3b8" strokeWidth="3"/>
            <text x="36" y="185" fill="#f87171" fontSize="20" fontWeight="800">0</text>
            <text x="145" y="36" fill="#f1f5f9" fontSize="18" fontWeight="700">50</text>
            <text x="262" y="185" fill="#34d399" fontSize="20" fontWeight="800">100</text>
          </svg>
        </div>
      </div>
    </div>

    {/* Footer */}
    <div style={{position:'absolute',left:0,right:0,bottom:28,textAlign:'center',zIndex:20}}>
      <div style={{color:'#c8d3e1',fontSize:16,fontWeight:600,letterSpacing:'.22em'}}>SIGNUM HQ · signumhq.com</div>
      <div style={{marginTop:12,color:'#94a3b8',fontSize:15,fontWeight:500,letterSpacing:'.08em'}}>Observation only — not financial advice</div>
    </div>
  </div>;
}

export default function MarketCloseIGTemplate() {
  return <Suspense fallback={<div style={{width:1080,height:1080,background:BG}}/>}><MCContent/></Suspense>;
}
