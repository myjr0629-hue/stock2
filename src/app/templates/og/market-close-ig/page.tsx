'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

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
  const gCfg:Record<string,{c:string;l:string;p:number}> = {positive:{c:'#34d399',l:'POSITIVE',p:73},negative:{c:'#f87171',l:'NEGATIVE',p:18},neutral:{c:'#94a3b8',l:'NEUTRAL',p:50},transition:{c:'#fbbf24',l:'TRANSITION',p:50}};
  const g = gCfg[gex]||gCfg.neutral;
  const fgiL = fgi>=75?'EXTREME GREED':fgi>=55?'GREED':fgi>=45?'NEUTRAL':fgi>=25?'FEAR':'EXTREME FEAR';
  const fgiC = fgi>=55?'#34d399':fgi>=45?'#fbbf24':'#f87171';
  const dpC = dp>=40?'#fbbf24':'#22d3ee';
  const dateFmt = (()=>{try{return new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}catch{return date;}})();
  const needleA = -90+(fgi/100)*180;
  const spark = (v:number,s:number)=>{const pts:number[]=[];let y=40;for(let i=0;i<=12;i++){y=44-(v*30)+Math.sin(i*1.7+s)*12+Math.cos(i*0.9+s*2)*8+(i/12)*(v*-20);pts.push(Math.max(4,Math.min(84,y)));}return pts.map((p,i)=>`${i===0?'M':'L'}${(i*(260/12)).toFixed(0)} ${p.toFixed(0)}`).join(' ');};

  const panel:React.CSSProperties = {borderRadius:14,border:'1px solid rgba(255,255,255,.14)',background:'linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.016)),rgba(10,17,30,.72)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.08),0 14px 36px rgba(0,0,0,.24)',backdropFilter:'blur(14px)',overflow:'hidden',padding:'18px 20px'};

  return <div style={{position:'relative',width:1080,height:1080,overflow:'hidden',color:'#f1f5f9',fontFamily:"'Inter',system-ui,sans-serif",background:'radial-gradient(circle at 88% 14%,rgba(167,139,250,.24),transparent 34%),radial-gradient(circle at 5% 92%,rgba(34,211,238,.23),transparent 34%),linear-gradient(135deg,#040710,#060d1a)',isolation:'isolate'}}>
    {/* Grid + scanline */}
    <div style={{position:'absolute',inset:0,opacity:.3,backgroundImage:'linear-gradient(rgba(34,211,238,.075) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.075) 1px,transparent 1px)',backgroundSize:'36px 36px',maskImage:'radial-gradient(circle,black,transparent 84%)'}} />
    <div style={{position:'absolute',inset:0,zIndex:80,pointerEvents:'none',opacity:.04,background:'repeating-linear-gradient(to bottom,rgba(255,255,255,.95) 0,rgba(255,255,255,.95) 1px,transparent 1px,transparent 5px)',mixBlendMode:'overlay' as const}} />
    {/* Floor grid */}
    <div style={{position:'absolute',left:-80,right:-80,bottom:-82,height:200,opacity:.22,transform:'perspective(500px) rotateX(62deg)',transformOrigin:'bottom center',backgroundImage:'linear-gradient(rgba(34,211,238,.20) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.20) 1px,transparent 1px)',backgroundSize:'32px 32px'}} />

    {/* Header */}
    <div style={{position:'absolute',left:28,right:28,top:20,display:'grid',gridTemplateColumns:'260px 1fr 180px',alignItems:'start',zIndex:20}}>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192x192.png" alt="" width={48} height={48} style={{filter:'drop-shadow(0 0 12px rgba(34,211,238,.25))'}} />
        <div><div style={{fontSize:24,fontWeight:800,letterSpacing:'.09em'}}>SIGNUM <span style={{color:'#22d3ee'}}>HQ</span></div><div style={{marginTop:4,color:'#94a3b8',fontSize:12,fontWeight:500}}>See What Others Cannot</div></div>
      </div>
      <div style={{justifySelf:'center',marginTop:12,textAlign:'center'}}>
        <div style={{fontSize:24,fontWeight:900,letterSpacing:'.46em'}}>MARKET CLOSE</div>
        <div style={{width:180,height:3,margin:'10px auto 0',borderRadius:999,background:'linear-gradient(90deg,transparent,#22d3ee,#a78bfa,transparent)',boxShadow:'0 0 20px rgba(34,211,238,.50)'}} />
      </div>
      <div style={{justifySelf:'end',marginTop:14,color:'#94a3b8',fontSize:16,fontWeight:600}}>{dateFmt}</div>
    </div>

    {/* 3 Index cards */}
    <div style={{position:'absolute',left:28,right:28,top:92,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0,zIndex:12}}>
      {[{t:'S&P 500',v:spy,s:spark(spy,1)},{t:'NASDAQ',v:qqq,s:spark(qqq,2)},{t:'DOW',v:dia,s:spark(dia,3)}].map((idx,i)=>(
        <div key={i} style={{position:'relative',border:`1px solid ${clr(idx.v)}33`,background:'linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.014)),rgba(10,17,30,.60)',padding:'16px 20px 12px',overflow:'hidden',...(i===0?{borderRadius:'16px 0 0 16px'}:i===2?{borderRadius:'0 16px 16px 0'}:{})}}>
          <div style={{fontSize:17,fontWeight:900,letterSpacing:'.10em',textAlign:'center'}}>{idx.t}</div>
          <div style={{marginTop:12,fontSize:52,lineHeight:.85,fontWeight:900,letterSpacing:'-.07em',textAlign:'center',color:clr(idx.v),textShadow:`0 0 25px ${clr(idx.v)}44`}}>{fmt(idx.v)}</div>
          <svg style={{position:'absolute',left:16,right:16,bottom:8,height:60,width:'calc(100% - 32px)'}} viewBox="0 0 260 88" fill="none">
            <path d={idx.s} stroke={clr(idx.v)} strokeWidth="2" strokeLinecap="round" fill="none"/>
            <path d={`${idx.s}V88H0Z`} fill={clr(idx.v)} opacity=".12"/>
            <path d="M0 44H260" stroke="rgba(255,255,255,.13)" strokeDasharray="3 6"/>
          </svg>
        </div>
      ))}
    </div>

    {/* 4 Metric cards — 2×2 grid */}
    <div style={{position:'absolute',left:28,right:28,top:390,display:'grid',gridTemplateColumns:'1fr 1fr',gridTemplateRows:'1fr 1fr',gap:14,zIndex:18}}>
      {/* VIX */}
      <div style={{...panel,borderColor:'rgba(167,139,250,.42)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.10),0 0 28px rgba(167,139,250,.10)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,fontSize:16,fontWeight:900,letterSpacing:'.16em'}}>
          <span style={{width:36,height:36,borderRadius:'50%',border:'1.5px solid #a78bfa',display:'grid',placeItems:'center',color:'#a78bfa'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h4l3-9 6 20 4-11h5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>VIX
        </div>
        <div style={{marginTop:16,fontSize:56,lineHeight:.85,fontWeight:900,color:vixC,textShadow:`0 0 30px ${vixC}44`}}>{vix.toFixed(1)}</div>
        <div style={{marginTop:14,display:'inline-flex',height:34,padding:'0 18px',borderRadius:10,alignItems:'center',color:vixC,border:`1.5px solid ${vixC}bb`,background:`${vixC}14`,fontSize:18,fontWeight:900,letterSpacing:'.08em'}}>{vixL}</div>
      </div>

      {/* Dark Pool */}
      <div style={{...panel,borderColor:'rgba(34,211,238,.42)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.10),0 0 28px rgba(34,211,238,.10)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,fontSize:16,fontWeight:900,letterSpacing:'.16em'}}>
          <span style={{width:36,height:36,borderRadius:'50%',border:'1.5px solid #22d3ee',display:'grid',placeItems:'center',color:'#22d3ee'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8 8 5 12 5 16a7 7 0 0014 0c0-4-3-8-7-14Z"/></svg>
          </span>DARK POOL
        </div>
        <div style={{marginTop:16,fontSize:52,lineHeight:.85,fontWeight:900,color:dpC,textShadow:`0 0 30px ${dpC}44`}}>{dp>0?`${dp.toFixed(1)}%`:'—'}</div>
        <div style={{marginTop:14,height:16,borderRadius:999,border:'1px solid rgba(34,211,238,.55)',background:'rgba(148,163,184,.12)',overflow:'hidden'}}>
          <div style={{height:'100%',width:`${Math.min(dp*2,100)}%`,borderRadius:'inherit',background:`linear-gradient(90deg,#22d3ee,${dpC})`,boxShadow:`0 0 23px ${dpC}55`}} />
        </div>
        <div style={{marginTop:8,display:'flex',justifyContent:'space-between',color:'#94a3b8',fontSize:12,fontWeight:600}}><span>0%</span><span>100%</span></div>
      </div>

      {/* GEX */}
      <div style={{...panel,borderColor:`${g.c}66`,boxShadow:`inset 0 1px 0 rgba(255,255,255,.10),0 0 28px ${g.c}14`}}>
        <div style={{display:'flex',alignItems:'center',gap:12,fontSize:16,fontWeight:900,letterSpacing:'.16em'}}>
          <span style={{width:36,height:36,borderRadius:'50%',border:`1.5px solid ${g.c}`,display:'grid',placeItems:'center',color:g.c}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 16c4-7 7-7 11 0s6 6 9 0" strokeLinecap="round"/></svg>
          </span>GEX REGIME
        </div>
        <div style={{marginTop:22,fontSize:42,lineHeight:.9,fontWeight:900,textAlign:'center',color:g.c,textShadow:`0 0 26px ${g.c}36`}}>{g.l}</div>
        <div style={{position:'relative',marginTop:22,height:3,background:'linear-gradient(90deg,#f87171,#94a3b8,#34d399)'}}>
          <span style={{position:'absolute',left:`${g.p}%`,top:-9,width:0,height:0,borderLeft:'7px solid transparent',borderRight:'7px solid transparent',borderTop:`10px solid ${g.c}`,filter:`drop-shadow(0 0 7px ${g.c}88)`,transform:'translateX(-50%)'}} />
        </div>
        <div style={{marginTop:12,display:'flex',justifyContent:'space-between',fontSize:12,fontWeight:800}}>
          <span style={{color:'#f87171'}}>Negative</span><span style={{color:'#94a3b8'}}>Neutral</span><span style={{color:'#34d399'}}>Positive</span>
        </div>
      </div>

      {/* Fear & Greed */}
      <div style={{...panel,borderColor:'rgba(167,139,250,.42)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,fontSize:16,fontWeight:900,letterSpacing:'.16em'}}>
          <span style={{width:36,height:36,borderRadius:'50%',border:'1.5px solid #e9d5ff',display:'grid',placeItems:'center',color:'#e9d5ff'}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 18a9 9 0 0118 0"/><path d="M12 18l6-9" strokeLinecap="round"/></svg>
          </span>FEAR &amp; GREED
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',marginTop:12}}>
          <div>
            <div style={{fontSize:48,lineHeight:.9,fontWeight:900}}>{fgi}</div>
            <div style={{marginTop:10,fontSize:18,fontWeight:800,color:fgiC}}>{fgiL}</div>
          </div>
          <svg viewBox="0 0 205 130" fill="none" style={{width:'100%',height:110}}>
            <defs><linearGradient id="fgG" x1="18" y1="105" x2="187" y2="105" gradientUnits="userSpaceOnUse"><stop stopColor="#f87171"/><stop offset=".48" stopColor="#fbbf24"/><stop offset="1" stopColor="#34d399"/></linearGradient></defs>
            <path d="M24 108A78 78 0 01181 108" stroke="url(#fgG)" strokeWidth="14" strokeLinecap="butt"/>
            <line x1="103" y1="108" x2={103+55*Math.cos((needleA-90)*Math.PI/180)} y2={108+55*Math.sin((needleA-90)*Math.PI/180)} stroke="#f1f5f9" strokeWidth="5" strokeLinecap="round"/>
            <circle cx="103" cy="108" r="10" fill="#0a111e" stroke="#94a3b8" strokeWidth="2"/>
            <text x="20" y="129" fill="#f87171" fontSize="16" fontWeight="800">0</text>
            <text x="174" y="129" fill="#34d399" fontSize="16" fontWeight="800">100</text>
          </svg>
        </div>
      </div>
    </div>

    {/* Footer */}
    <div style={{position:'absolute',left:0,right:0,bottom:16,zIndex:20,textAlign:'center',color:'#94a3b8',fontSize:14,fontWeight:700,letterSpacing:'.22em'}}>
      SIGNUM HQ&nbsp;&nbsp;·&nbsp;&nbsp;See What Others Cannot&nbsp;&nbsp;·&nbsp;&nbsp;signumhq.com
    </div>
  </div>;
}

export default function MarketCloseIGTemplate() {
  return <Suspense fallback={<div style={{width:1080,height:1080,background:'#040710'}}/>}><MCContent/></Suspense>;
}
