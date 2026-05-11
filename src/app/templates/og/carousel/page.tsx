'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// ── SVG Assets ──
const BALANCE_SVG = `<svg viewBox="0 0 500 260" fill="none"><defs><filter id="gg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5" result="b"/><feColorMatrix in="b" type="matrix" values="0 0 0 0 .2 0 0 0 0 .83 0 0 0 0 .6 0 0 0 .72 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g opacity=".45"><circle cx="250" cy="130" r="120" stroke="#22d3ee" stroke-opacity=".18" stroke-dasharray="2 8"/><circle cx="250" cy="130" r="85" stroke="#34d399" stroke-opacity=".18"/></g><g filter="url(#gg)"><path d="M112 100h276" stroke="#67e8f9" stroke-width="4" stroke-linecap="round"/><path d="M250 55v155" stroke="#34d399" stroke-width="4" stroke-linecap="round"/><path d="M213 210h74M228 230h44" stroke="#34d399" stroke-width="4" stroke-linecap="round"/><path d="M136 100 88 185h96L136 100Z" stroke="#67e8f9" stroke-width="2.5"/><path d="M364 100 316 185h96L364 100Z" stroke="#67e8f9" stroke-width="2.5"/><path d="M88 185h96M316 185h96" stroke="#67e8f9" stroke-width="4" stroke-linecap="round"/><path d="M202 118 250 86 298 118v60c-18 23-37 34-48 39-11-5-30-16-48-39v-60Z" fill="rgba(52,211,153,.1)" stroke="#34d399" stroke-width="3"/><path d="M225 168v-20M245 168v-37M265 168v-56M285 168v-72" stroke="#84f871" stroke-width="7" stroke-linecap="round"/></g></svg>`;

const RING_SVG = (dp: number) => `<svg viewBox="0 0 400 400" fill="none"><defs><filter id="pg" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feColorMatrix in="b" type="matrix" values="0 0 0 0 .65 0 0 0 0 .48 0 0 0 0 .98 0 0 0 .8 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="200" cy="200" r="150" stroke="#1e293b" stroke-width="24"/><circle cx="200" cy="200" r="150" stroke="#a78bfa" stroke-width="24" stroke-linecap="round" stroke-dasharray="${(dp/100)*942} 942" transform="rotate(-90 200 200)" filter="url(#pg)"/><circle cx="200" cy="200" r="185" stroke="#a78bfa" stroke-opacity=".12" stroke-dasharray="3 10"/><circle cx="200" cy="200" r="196" stroke="#22d3ee" stroke-opacity=".08" stroke-dasharray="2 12"/></svg>`;

const MINI_LINE = `<svg viewBox="0 0 180 55" fill="none"><path d="M2 46 22 38 38 40 52 27 68 32 86 18 104 23 124 12 144 15 164 4 178 7" stroke="#84f871" stroke-width="2.5" stroke-linecap="round"/><path d="M2 46 22 38 38 40 52 27 68 32 86 18 104 23 124 12 144 15 164 4 178 7" stroke="#84f871" stroke-opacity=".2" stroke-width="8" stroke-linecap="round"/></svg>`;

// ── Shared ──
const S: React.CSSProperties = {
  position: 'relative', width: 1080, height: 1080, overflow: 'hidden', color: '#f1f5f9',
  fontFamily: "'Inter', system-ui, sans-serif",
  background: 'radial-gradient(circle at 50% 40%, rgba(34,211,238,0.06), transparent 42%), radial-gradient(circle at 48% 36%, rgba(167,139,250,0.08), transparent 40%), #06090f',
  isolation: 'isolate',
};

function Bg() {
  return <>
    <div style={{ position:'absolute',inset:0,zIndex:0,opacity:.28,backgroundImage:'linear-gradient(rgba(34,211,238,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.035) 1px,transparent 1px)',backgroundSize:'42px 42px' }}/>
    <div style={{ position:'absolute',inset:0,zIndex:100,pointerEvents:'none',opacity:.025,background:'repeating-linear-gradient(to bottom,rgba(255,255,255,.9) 0,rgba(255,255,255,.9) 1px,transparent 1px,transparent 5px)',mixBlendMode:'overlay' as const }}/>
    <div style={{ position:'absolute',inset:0,zIndex:0,opacity:.35,background:'radial-gradient(circle,rgba(34,211,238,.3) 0 1.2px,transparent 1.7px),radial-gradient(circle,rgba(167,139,250,.22) 0 1.2px,transparent 1.7px)',backgroundSize:'26px 26px,38px 38px',maskImage:'radial-gradient(circle at 72% 42%,black 0%,transparent 46%)',WebkitMaskImage:'radial-gradient(circle at 72% 42%,black 0%,transparent 46%)' }}/>
  </>;
}

function Brand() {
  return (
    <div style={{ position:'absolute',top:48,left:48,display:'flex',alignItems:'center',gap:12,zIndex:30 }}>
      <img src="/icons/icon-192x192.png" alt="" style={{ width:32,height:32,borderRadius:7 }}/>
      <span style={{ fontSize:19,fontWeight:800,letterSpacing:'.12em' }}>SIGNUM HQ</span>
    </div>
  );
}

function Dots({ n }: { n: number }) {
  return (
    <div style={{ position:'absolute',bottom:58,left:48,display:'flex',gap:14,zIndex:50 }}>
      {[1,2,3,4,5,6].map(i=><span key={i} style={{ width:12,height:12,borderRadius:'50%',border:'1.5px solid rgba(241,245,249,.7)',background:i===n?'#f1f5f9':'transparent',boxShadow:i===n?'0 0 10px rgba(255,255,255,.35)':'none' }}/>)}
    </div>
  );
}

function Swipe() {
  return <div style={{ position:'absolute',right:48,bottom:52,zIndex:50,color:'rgba(148,163,184,.45)',fontSize:17,fontWeight:500,fontStyle:'italic' }}>Swipe →</div>;
}

function Wrap({ children,n,bg,noSwipe }:{ children:React.ReactNode;n:number;bg?:React.CSSProperties;noSwipe?:boolean }) {
  return <div style={{...S,...bg}}><Bg/><Brand/>{children}<Dots n={n}/>{!noSwipe&&<Swipe/>}</div>;
}

const card: React.CSSProperties = {
  position:'relative',height:130,borderRadius:14,border:'1px solid rgba(255,255,255,.18)',
  background:'linear-gradient(135deg,rgba(255,255,255,.055),rgba(255,255,255,.015))',
  boxShadow:'inset 0 1px 0 rgba(255,255,255,.09),0 14px 36px rgba(0,0,0,.24)',
  padding:'26px 40px',overflow:'hidden',backdropFilter:'blur(12px)',
};

// ── Slides ──

function S1({ spy }:{ spy:string }) {
  const v = parseFloat(spy); const d = v>=0?`+${Math.abs(v).toFixed(2)}%`:`${v.toFixed(2)}%`;
  return (
    <Wrap n={1} bg={{ background:'radial-gradient(circle at 46% 45%,rgba(167,139,250,.25),transparent 34%),radial-gradient(circle at 60% 55%,rgba(34,211,238,.18),transparent 36%),#06090f' }}>
      <div style={{ position:'absolute',left:80,top:80,width:920,height:920,borderRadius:'50%',border:'1px solid rgba(167,139,250,.08)',zIndex:0 }}/>
      <div style={{ position:'absolute',left:80,top:160,width:920,zIndex:20,textAlign:'center' }}>
        <p style={{ margin:0,fontSize:90,lineHeight:1,fontWeight:900,letterSpacing:'-.06em' }}>What SPY</p>
        <p style={{ margin:'14px 0',color:'#34d399',fontSize:120,lineHeight:.92,fontWeight:900,letterSpacing:'-.07em',textShadow:'0 0 36px rgba(52,211,153,.5)' }}>{d}</p>
        <p style={{ margin:0,fontSize:90,lineHeight:1,fontWeight:900,letterSpacing:'-.06em' }}>Is Really</p>
        <p style={{ margin:'10px 0 0',fontSize:100,lineHeight:.92,fontWeight:900,letterSpacing:'-.065em',background:'linear-gradient(105deg,#c084fc 0%,#a78bfa 30%,#67e8f9 70%,#22d3ee 100%)',WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent',filter:'brightness(1.1)' }}>Hiding</p>
      </div>
      <div style={{ position:'absolute',left:'50%',bottom:140,transform:'translateX(-50%)',color:'#22d3ee',fontSize:48,lineHeight:.45,opacity:.8,textAlign:'center',filter:'drop-shadow(0 0 10px rgba(34,211,238,.4))' }}>⌄<br/>⌄<br/>⌄</div>
    </Wrap>
  );
}

function S2({ spy,qqq,vix }:{ spy:string;qqq:string;vix:string }) {
  const vn = parseFloat(vix);
  const vl = vn<16?'LOW':vn<20?'CALM':vn<25?'ELEVATED':'HIGH';
  const vc = vn<20?'#34d399':vn<25?'#fbbf24':'#f87171';
  return (
    <Wrap n={2}>
      <div style={{ position:'absolute',top:140,left:0,right:0,textAlign:'center',color:'#94a3b8',fontSize:25,fontWeight:900,letterSpacing:'.48em',textTransform:'uppercase' as const }}>The Numbers</div>
      <div style={{ position:'absolute',left:100,top:210,width:880,display:'grid',gap:20,zIndex:20 }}>
        <div style={card}>
          <div style={{ color:'#c5cfdf',fontSize:18,fontWeight:800,letterSpacing:'.16em' }}>S&P 500</div>
          <div style={{ marginTop:14,color:'#34d399',fontSize:62,lineHeight:.82,fontWeight:900,letterSpacing:'-.065em',textShadow:'0 0 22px rgba(52,211,153,.28)' }}>{parseFloat(spy)>=0?'+':''}{spy}%</div>
          <div style={{ position:'absolute',right:36,top:34,width:180,height:55,opacity:.85 }} dangerouslySetInnerHTML={{__html:MINI_LINE}}/>
        </div>
        <div style={card}>
          <div style={{ color:'#c5cfdf',fontSize:18,fontWeight:800,letterSpacing:'.16em' }}>NASDAQ</div>
          <div style={{ marginTop:14,color:'#34d399',fontSize:62,lineHeight:.82,fontWeight:900,letterSpacing:'-.065em',textShadow:'0 0 22px rgba(52,211,153,.28)' }}>{parseFloat(qqq)>=0?'+':''}{qqq}%</div>
          <div style={{ position:'absolute',right:36,top:34,width:180,height:55,opacity:.85 }} dangerouslySetInnerHTML={{__html:MINI_LINE}}/>
        </div>
        <div style={card}>
          <div style={{ color:'#c5cfdf',fontSize:18,fontWeight:800,letterSpacing:'.16em' }}>VIX</div>
          <div style={{ marginTop:14,color:'#f1f5f9',fontSize:62,lineHeight:.82,fontWeight:900,letterSpacing:'-.065em' }}>{vix}</div>
          <div style={{ position:'absolute',right:50,top:40,padding:'13px 30px',borderRadius:999,color:vc,border:`1px solid ${vc}70`,background:`${vc}14`,fontSize:22,fontWeight:900,letterSpacing:'.18em' }}>{vl}</div>
        </div>
      </div>
    </Wrap>
  );
}

function S3({ gex }:{ gex:string }) {
  const pos = gex.toLowerCase()==='positive';
  const c = pos?'#34d399':'#f87171';
  const msg = pos?'Dealers are buying dips and selling rips.\nVolatility is suppressed.':'Dealers sell into drops and buy rallies.\nVolatility expands.';
  return (
    <Wrap n={3}>
      <div style={{ position:'absolute',top:138,left:0,right:0,color:'#94a3b8',fontSize:26,fontWeight:900,letterSpacing:'.3em',textAlign:'center',textTransform:'uppercase' as const }}>GEX Regime</div>
      <div style={{ position:'absolute',top:210,left:0,right:0,textAlign:'center',color:c,fontSize:88,fontWeight:900,letterSpacing:'-.05em',textShadow:`0 0 34px ${c}60` }}>{gex.toUpperCase()}</div>
      <div style={{ position:'absolute',left:290,top:360,width:500,height:260 }} dangerouslySetInnerHTML={{__html:BALANCE_SVG}}/>
      <div style={{ position:'absolute',left:90,right:90,top:700,textAlign:'center',color:'#c6cedb',fontSize:26,lineHeight:1.45,fontWeight:500,whiteSpace:'pre-line' }}>{msg}</div>
    </Wrap>
  );
}

function S4({ dp }:{ dp:string }) {
  const dn = parseFloat(dp);
  const dl = dn>40?'HIGH':dn>30?'ELEVATED':'NORMAL';
  const dc = dn>40?'#f87171':dn>30?'#fbbf24':'#34d399';
  return (
    <Wrap n={4}>
      <div style={{ position:'absolute',top:130,left:0,right:0,textAlign:'center',color:'#94a3b8',fontSize:24,fontWeight:900,letterSpacing:'.35em',textTransform:'uppercase' as const }}>Dark Pool Activity</div>
      <div style={{ position:'absolute',left:240,top:220,width:600,height:600 }}>
        <div style={{ width:400,height:400,margin:'0 auto' }} dangerouslySetInnerHTML={{__html:RING_SVG(dn)}}/>
        <div style={{ position:'absolute',left:0,right:0,top:155,textAlign:'center',color:'#a78bfa',fontSize:72,fontWeight:900,letterSpacing:'-.055em',textShadow:'0 0 28px rgba(167,139,250,.3)' }}>{dp}%</div>
        <div style={{ position:'absolute',left:'50%',top:240,transform:'translateX(-50%)',padding:'10px 28px',borderRadius:999,border:`1px solid ${dc}bb`,color:dc,background:`${dc}12`,fontSize:20,fontWeight:900,letterSpacing:'.12em',boxShadow:`0 0 16px ${dc}25` }}>{dl}</div>
      </div>
      <div style={{ position:'absolute',left:100,right:100,bottom:140,textAlign:'center',color:'#c6cedb',fontSize:25,lineHeight:1.35,fontWeight:500 }}>Institutional activity above normal.<br/>Positioning detected.</div>
    </Wrap>
  );
}

function S5({ gex,dp,cw }:{ gex:string;dp:string;cw:string }) {
  const bs = [
    { c:'#22d3ee', t:`${gex==='positive'?'Positive':'Negative'} GEX ${gex==='positive'?'dampens':'amplifies'} volatility — ${gex==='positive'?'small moves stay small':'trends accelerate'}` },
    { c:'#a78bfa', t:`${parseFloat(dp)>30?'Elevated':'Normal'} dark pool suggests institutional ${parseFloat(dp)>30?'accumulation':'positioning'}` },
    { c:'#fbbf24', t:`Key level to watch:\nCall Wall at <strong style="color:#fbbf24;font-weight:800">$${cw}</strong>` },
  ];
  return (
    <Wrap n={5}>
      <div style={{ position:'absolute',top:138,left:0,right:0,textAlign:'center',fontSize:48,fontWeight:900,letterSpacing:'-.03em',textTransform:'uppercase' as const,background:'linear-gradient(105deg,#c084fc 0%,#a78bfa 30%,#67e8f9 70%,#22d3ee 100%)',WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent' }}>What This Means</div>
      <div style={{ position:'absolute',top:208,left:'50%',transform:'translateX(-50%)',width:200,height:3,background:'linear-gradient(90deg,#a78bfa,#22d3ee)',boxShadow:'0 0 16px rgba(34,211,238,.35)',borderRadius:999 }}/>
      <div style={{ position:'absolute',left:90,right:70,top:280,display:'grid',gap:22 }}>
        {bs.map((b,i)=>(
          <div key={i} style={{ minHeight:120,display:'grid',gridTemplateColumns:'70px 1fr',gap:24,alignItems:'start',paddingBottom:20,borderBottom:i<2?'1px solid rgba(255,255,255,.08)':'none' }}>
            <div style={{ width:58,height:58,borderRadius:'50%',display:'grid',placeItems:'center',fontSize:32,fontWeight:900,border:`2.5px solid ${b.c}`,color:b.c,background:'rgba(255,255,255,.02)',filter:`drop-shadow(0 0 10px ${b.c})` }}>{i+1}</div>
            <p style={{ margin:'2px 0 0',color:'#c6cedb',fontSize:25,lineHeight:1.3,fontWeight:500,letterSpacing:'-.025em',whiteSpace:'pre-line' }} dangerouslySetInnerHTML={{__html:b.t}}/>
          </div>
        ))}
      </div>
    </Wrap>
  );
}

function S6() {
  return (
    <Wrap n={6} noSwipe>
      <div style={{ position:'absolute',left:175,top:105,width:730,height:730,borderRadius:'50%',background:'radial-gradient(circle,rgba(34,211,238,.12),transparent 56%),radial-gradient(circle,rgba(167,139,250,.14),transparent 44%)',zIndex:0 }}/>
      <div style={{ position:'absolute',left:175,top:95,width:730,height:730,borderRadius:'50%',border:'1px solid rgba(167,139,250,.08)',zIndex:0 }}/>
      <div style={{ position:'absolute',top:180,left:0,right:0,display:'grid',justifyItems:'center',gap:32,zIndex:18 }}>
        <img src="/icons/icon-512x512.png" alt="" style={{ width:200,height:200,borderRadius:30,filter:'drop-shadow(0 0 32px rgba(34,211,238,.25))' }}/>
        <div style={{ fontSize:48,fontWeight:900,letterSpacing:'.2em',textAlign:'center',textShadow:'0 0 20px rgba(255,255,255,.1)' }}>SIGNUM HQ</div>
      </div>
      <div style={{ position:'absolute',left:0,right:0,top:620,textAlign:'center',fontSize:46,fontWeight:900,letterSpacing:'-.05em',background:'linear-gradient(105deg,#c084fc 0%,#a78bfa 30%,#67e8f9 70%,#22d3ee 100%)',WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent' }}>See the Full Picture</div>
      <div style={{ position:'absolute',top:720,left:0,right:0,textAlign:'center',color:'#c6cedb',fontSize:25,fontWeight:500,letterSpacing:'.38em' }}>signumhq.com</div>
      <div style={{ position:'absolute',top:790,left:0,right:0,textAlign:'center',color:'#22d3ee',fontSize:27,fontWeight:500,textShadow:'0 0 16px rgba(34,211,238,.22)' }}>Link in bio ↑</div>
    </Wrap>
  );
}

// ── Main ──
function Content() {
  const sp = useSearchParams();
  const slide = parseInt(sp.get('slide')||'0');
  const spy=sp.get('spy')||'0.84', qqq=sp.get('qqq')||'1.71', vix=sp.get('vix')||'18.2';
  const gex=sp.get('gex')||'positive', dp=sp.get('dp')||'39.2', cw=sp.get('cw')||'545';

  if (slide>=1&&slide<=6) {
    switch(slide) {
      case 1: return <S1 spy={spy}/>;
      case 2: return <S2 spy={spy} qqq={qqq} vix={vix}/>;
      case 3: return <S3 gex={gex}/>;
      case 4: return <S4 dp={dp}/>;
      case 5: return <S5 gex={gex} dp={dp} cw={cw}/>;
      case 6: return <S6/>;
    }
  }
  return (
    <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1080px)',gridTemplateRows:'repeat(2,1080px)',gap:4,background:'rgba(255,255,255,.2)' }}>
      <S1 spy={spy}/><S2 spy={spy} qqq={qqq} vix={vix}/><S3 gex={gex}/>
      <S4 dp={dp}/><S5 gex={gex} dp={dp} cw={cw}/><S6/>
    </div>
  );
}

export default function CarouselOGPage() {
  return <Suspense fallback={<div style={{width:1080,height:1080,background:'#04070d'}}/>}><Content/></Suspense>;
}
