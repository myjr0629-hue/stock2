'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

// ── Topic × Lang data ──
const T: Record<string, Record<string, any>> = {
  gex: {
    en: { title:'What is GEX?', sub:'Gamma Exposure Explained', posLabel:'POSITIVE', negLabel:'NEGATIVE', posCopy:'Dealers buy dips,\nsell rips →\nMarket stabilizes', negCopy:'Dealers sell into drops,\nbuy rallies →\nVolatility amplifies', why:'Most traders watch price.\nInstitutional desks watch GEX.', c1t:'Positive GEX + Low VIX', c1s:'Low risk, mean-reversion likely', c2t:'Neutral GEX + Rising VIX', c2s:'Watch for breakout', c3t:'Negative GEX + High VIX', c3s:'Trend acceleration, elevated risk' },
    ko: { title:'GEX란?', sub:'감마 익스포저 해설', posLabel:'포지티브', negLabel:'네거티브', posCopy:'딜러가 저가 매수,\n고가 매도 →\n시장 안정화', negCopy:'딜러가 하락시 매도,\n반등시 매수 →\n변동성 증폭', why:'대부분 가격만 봅니다.\n기관은 GEX를 봅니다.', c1t:'Positive GEX + Low VIX', c1s:'저위험, 평균회귀 가능', c2t:'Neutral GEX + Rising VIX', c2s:'브레이크아웃 주의', c3t:'Negative GEX + High VIX', c3s:'추세 가속, 위험 상승' },
    ja: { title:'GEXとは?', sub:'ガンマ・エクスポージャー解説', posLabel:'ポジティブ', negLabel:'ネガティブ', posCopy:'ディーラーが押し目買い、\n吹き値売り →\n市場安定化', negCopy:'ディーラーが下落時に売り、\n反発時に買い →\nボラティリティ増幅', why:'多くのトレーダーは価格を見ます。\n機関はGEXを見ます。', c1t:'Positive GEX + Low VIX', c1s:'低リスク、平均回帰の可能性', c2t:'Neutral GEX + Rising VIX', c2s:'ブレイクアウトに注意', c3t:'Negative GEX + High VIX', c3s:'トレンド加速、リスク上昇' },
  },
  dark_pool: {
    en: { title:'Dark Pools', sub:'Institutional Hidden Orders', posLabel:'HIGH DP%', negLabel:'LOW DP%', posCopy:'Institutions active\nbeneath the surface →\nDirectional moves follow', negCopy:'Retail-driven market\n→ Direction uncertain', why:'Retail sees price.\nInstitutions use dark pools to hide size.', c1t:'DP% > 40% + Rising', c1s:'Heavy institutional accumulation', c2t:'DP% 25-40%', c2s:'Normal institutional flow', c3t:'DP% < 25% + Falling', c3s:'Institutions stepping back' },
    ko: { title:'다크풀이란?', sub:'기관의 숨겨진 주문', posLabel:'높은 DP%', negLabel:'낮은 DP%', posCopy:'기관이 수면 아래에서\n활발히 활동 →\n방향성 움직임 예고', negCopy:'개인 주도 시장\n→ 방향 불확실', why:'개인은 가격을 봅니다.\n기관은 다크풀로 물량을 숨깁니다.', c1t:'DP% > 40% + 상승', c1s:'기관 대량 매집 진행', c2t:'DP% 25-40%', c2s:'정상적 기관 흐름', c3t:'DP% < 25% + 하락', c3s:'기관 이탈 중' },
    ja: { title:'ダークプール', sub:'機関の隠れた注文', posLabel:'高DP%', negLabel:'低DP%', posCopy:'機関が水面下で\n活発に活動 →\n方向性の動きが続く', negCopy:'個人主導の市場\n→ 方向不透明', why:'個人は価格を見ます。\n機関はダークプールでサイズを隠します。', c1t:'DP% > 40% + 上昇', c1s:'機関の大量蓄積', c2t:'DP% 25-40%', c2s:'通常の機関フロー', c3t:'DP% < 25% + 下落', c3s:'機関の撤退' },
  },
  iv_percentile: {
    en: { title:'IV Percentile', sub:'Volatility Context Decoded', posLabel:'90TH PCTL', negLabel:'10TH PCTL', posCopy:'Options more expensive\nthan 90% of history →\nSelling favored', negCopy:'Options cheaper\nthan 90% of history →\nBuying opportunities', why:'Without IV context,\nyou\'re guessing if premiums are high or low.', c1t:'IV > 80th Pctl', c1s:'Premiums elevated, selling favored', c2t:'IV 30-70th Pctl', c2s:'Normal range, direction-dependent', c3t:'IV < 20th Pctl', c3s:'Premiums cheap, buying opportunities' },
    ko: { title:'IV 백분위', sub:'변동성 컨텍스트 해독', posLabel:'90번째 백분위', negLabel:'10번째 백분위', posCopy:'옵션이 역사적으로\n90% 이상 비쌈 →\n매도 유리', negCopy:'옵션이 역사적으로\n90% 이상 저렴 →\n매수 기회', why:'IV 컨텍스트 없이는\n프리미엄이 높은지 낮은지 추측일 뿐입니다.', c1t:'IV > 80th Pctl', c1s:'프리미엄 상승, 매도 유리', c2t:'IV 30-70th Pctl', c2s:'정상 범위, 방향 의존', c3t:'IV < 20th Pctl', c3s:'프리미엄 저렴, 매수 기회' },
    ja: { title:'IVパーセンタイル', sub:'ボラティリティ解読', posLabel:'90パーセンタイル', negLabel:'10パーセンタイル', posCopy:'オプションが歴史的に\n90%以上高い →\n売り有利', negCopy:'オプションが歴史的に\n90%以上安い →\n買い機会', why:'IVコンテキストなしでは\nプレミアムの高低は推測に過ぎません。', c1t:'IV > 80th Pctl', c1s:'プレミアム上昇、売り有利', c2t:'IV 30-70th Pctl', c2s:'通常範囲、方向次第', c3t:'IV < 20th Pctl', c3s:'プレミアム安、買い機会' },
  },
  pcr: {
    en: { title:'Put/Call Ratio', sub:'Market Sentiment Gauge', posLabel:'PCR > 1.0', negLabel:'PCR < 0.7', posCopy:'More puts purchased\n→ Fear is elevated', negCopy:'More calls purchased\n→ Greed may be stretched', why:'Extreme readings have historically\ncoincided with market turning points.', c1t:'PCR > 1.2', c1s:'Extreme fear, contrarian bounce zone', c2t:'PCR 0.7 - 1.0', c2s:'Balanced sentiment, trend-following', c3t:'PCR < 0.6', c3s:'Excessive greed, correction risk' },
    ko: { title:'풋/콜 비율', sub:'시장 심리 게이지', posLabel:'PCR > 1.0', negLabel:'PCR < 0.7', posCopy:'풋 옵션 매수 증가\n→ 공포 상승', negCopy:'콜 옵션 매수 증가\n→ 탐욕 과열 가능', why:'극단적 수치는 역사적으로\n시장 전환점과 일치했습니다.', c1t:'PCR > 1.2', c1s:'극단적 공포, 반등 구간', c2t:'PCR 0.7 - 1.0', c2s:'균형 심리, 추세 추종', c3t:'PCR < 0.6', c3s:'과도한 탐욕, 조정 위험' },
    ja: { title:'プット/コール比率', sub:'市場センチメント', posLabel:'PCR > 1.0', negLabel:'PCR < 0.7', posCopy:'プット購入増加\n→ 恐怖上昇', negCopy:'コール購入増加\n→ 貪欲過熱の可能性', why:'極端な数値は歴史的に\n市場の転換点と一致しています。', c1t:'PCR > 1.2', c1s:'極端な恐怖、反発ゾーン', c2t:'PCR 0.7 - 1.0', c2s:'均衡心理、トレンド追従', c3t:'PCR < 0.6', c3s:'過度な貪欲、調整リスク' },
  },
  max_pain: {
    en: { title:'Max Pain', sub:'Options Expiration Gravity', posLabel:'CALL WALL', negLabel:'PUT FLOOR', posCopy:'Highest call OI\n→ Acts as ceiling\nresistance', negCopy:'Highest put OI\n→ Acts as floor\nsupport', why:'Price doesn\'t move randomly.\nIt orbits around options structure.', c1t:'Price near Max Pain', c1s:'Gravitational pull, range-bound', c2t:'Price above Call Wall', c2s:'Breakout, gamma squeeze possible', c3t:'Price below Put Floor', c3s:'Breakdown, dealer hedging amplifies' },
    ko: { title:'맥스 페인', sub:'옵션 만기일의 인력', posLabel:'콜 월', negLabel:'풋 플로어', posCopy:'최대 콜 미결제약정\n→ 저항 천장 역할', negCopy:'최대 풋 미결제약정\n→ 지지 바닥 역할', why:'가격은 무작위로 움직이지 않습니다.\n옵션 구조를 중심으로 궤도합니다.', c1t:'가격 ≈ Max Pain', c1s:'인력, 박스권 예상', c2t:'가격 > Call Wall', c2s:'돌파, 감마 스퀴즈 가능', c3t:'가격 < Put Floor', c3s:'붕괴, 딜러 헷지 증폭' },
    ja: { title:'マックスペイン', sub:'オプション満期の引力', posLabel:'コールウォール', negLabel:'プットフロア', posCopy:'最大コールOI\n→ 天井抵抗として機能', negCopy:'最大プットOI\n→ 床サポートとして機能', why:'価格はランダムに動きません。\nオプション構造を中心に軌道します。', c1t:'価格 ≈ Max Pain', c1s:'引力、レンジ相場', c2t:'価格 > Call Wall', c2s:'ブレイクアウト、ガンマスクイーズ', c3t:'価格 < Put Floor', c3s:'ブレイクダウン、ヘッジ増幅' },
  },
};

// ── Shared styles ──
const BG = '#06090f';
const S: React.CSSProperties = {
  position:'relative', width:1080, height:1080, overflow:'hidden', color:'#f1f5f9',
  fontFamily:"'Inter',system-ui,sans-serif",
  background:`radial-gradient(circle at 68% 38%,rgba(34,211,238,.11),transparent 34%),radial-gradient(circle at 36% 50%,rgba(167,139,250,.10),transparent 38%),linear-gradient(135deg,${BG},#040710)`,
  isolation:'isolate',
};
const grid: React.CSSProperties = { position:'absolute',inset:0,zIndex:0,opacity:.3,backgroundImage:'linear-gradient(rgba(34,211,238,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.055) 1px,transparent 1px)',backgroundSize:'46px 46px',maskImage:'radial-gradient(circle,black,transparent 86%)' };
const scan: React.CSSProperties = { position:'absolute',inset:0,zIndex:80,pointerEvents:'none',opacity:.035,background:'repeating-linear-gradient(to bottom,rgba(255,255,255,.85) 0,rgba(255,255,255,.85) 1px,transparent 1px,transparent 5px)',mixBlendMode:'overlay' as const };
const panel: React.CSSProperties = { border:'1px solid rgba(255,255,255,.10)',background:'linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.016)),rgba(10,17,30,.72)',boxShadow:'inset 0 1px 0 rgba(255,255,255,.08),0 18px 54px rgba(0,0,0,.24)',backdropFilter:'blur(14px)',overflow:'hidden' };

function Brand() {
  return <div style={{position:'absolute',top:38,left:44,display:'flex',alignItems:'center',gap:18,zIndex:10}}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/icons/icon-192x192.png" alt="" width={64} height={64} style={{borderRadius:13,filter:'drop-shadow(0 0 16px rgba(34,211,238,.25))'}} />
    <span style={{fontSize:34,fontWeight:800,letterSpacing:'.10em'}}>SIGNUM HQ</span>
  </div>;
}
function Badge() {
  return <div style={{position:'absolute',top:48,right:47,height:52,display:'inline-flex',alignItems:'center',gap:12,padding:'0 24px',borderRadius:999,border:'1.6px solid rgba(34,211,238,.72)',color:'#22d3ee',background:'rgba(4,7,16,.74)',fontSize:20,fontWeight:800,letterSpacing:'.15em'}}>MARKET INSIGHT</div>;
}
function Dots({n}:{n:number}) {
  return <div style={{position:'absolute',left:62,bottom:58,display:'flex',gap:20,zIndex:20}}>
    {[1,2,3,4,5].map(i=><span key={i} style={{width:22,height:22,borderRadius:'50%',border:'2px solid #22d3ee',background:i===n?'#22d3ee':'transparent',boxShadow:i===n?'0 0 16px rgba(34,211,238,.55)':'none'}} />)}
  </div>;
}
function Swipe() { return <div style={{position:'absolute',right:62,bottom:58,color:'#22d3ee',fontSize:28,fontWeight:500,zIndex:20}}>Swipe →</div>; }
function Wrap({children,n,noSwipe}:{children:React.ReactNode;n:number;noSwipe?:boolean}) {
  return <div style={S}><div style={grid}/><div style={scan}/><Brand/><Badge/>{children}<Dots n={n}/>{!noSwipe&&<Swipe/>}</div>;
}

// ── Slide 1: Hook ──
function S1({d}:{d:any}) {
  return <Wrap n={1}>
    <div style={{position:'absolute',left:60,top:420,zIndex:15}}>
      <h1 style={{margin:0,fontSize:92,lineHeight:.92,fontWeight:900,letterSpacing:'-.07em',textShadow:'0 10px 40px rgba(0,0,0,.42)'}}>{d.title}</h1>
      <div style={{width:76,height:3,margin:'44px 0 48px',borderRadius:999,background:'#22d3ee',boxShadow:'0 0 18px rgba(34,211,238,.45)'}} />
      <div style={{color:'#22d3ee',fontSize:42,fontWeight:500,letterSpacing:'-.04em',textShadow:'0 0 18px rgba(34,211,238,.22)'}}>{d.sub}</div>
    </div>
    <svg style={{position:'absolute',right:-70,top:132,width:670,height:670,opacity:.85}} viewBox="0 0 670 670" fill="none">
      <g opacity=".38" stroke="#22d3ee" strokeDasharray="5 12"><circle cx="335" cy="335" r="106"/><circle cx="335" cy="335" r="166"/><circle cx="335" cy="335" r="226"/><circle cx="335" cy="335" r="286"/></g>
      <path d="M335 110v450" stroke="#22d3ee" strokeWidth="2"/><path d="M113 335h454" stroke="#f1f5f9" strokeOpacity=".75" strokeWidth="2"/>
      <text x="335" y="91" fill="#22d3ee" fontSize="22" fontWeight="800" textAnchor="middle">CALLS</text>
      <text x="335" y="603" fill="#a78bfa" fontSize="22" fontWeight="800" textAnchor="middle">PUTS</text>
      <g fill="#22d3ee" opacity=".78">{[188,203,218,233,248,263,278,293].map((y,i)=><rect key={y} x="342" y={y} width={[38,56,72,86,100,84,64,48][i]} height="7"/>)}</g>
      <g fill="#a78bfa" opacity=".78">{[350,365,380,395,410].map((y,i)=><rect key={y} x={[250,224,242,265,284][i]} y={y} width={[85,111,93,70,51][i]} height="7"/>)}</g>
      <circle cx="335" cy="335" r="6" fill="#22d3ee" filter="drop-shadow(0 0 12px #22d3ee)"/>
      <circle cx="562" cy="335" r="5" fill="#34d399"/><text x="582" y="341" fill="#34d399" fontSize="18" fontWeight="700">SPOT</text>
    </svg>
  </Wrap>;
}

// ── Slide 2: The Concept ──
function S2({d}:{d:any}) {
  const card = (color:string,label:string,copy:string,icon:string):React.ReactNode => (
    <div style={{...panel,flex:1,borderRadius:21,padding:'60px 40px 48px',textAlign:'center',color,borderColor:`${color}99`,boxShadow:`0 0 34px ${color}14,inset 0 1px 0 rgba(255,255,255,.08)`}}>
      <svg style={{width:140,height:140,margin:'0 auto 60px',filter:`drop-shadow(0 0 20px ${color})`}} viewBox="0 0 174 174" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"><path d={icon}/></svg>
      <div style={{fontSize:44,fontWeight:900,letterSpacing:'.12em'}}>{label}</div>
      <div style={{marginTop:40,color:'#f1f5f9',fontSize:32,lineHeight:1.42,fontWeight:500,whiteSpace:'pre-line'}}>{copy}</div>
    </div>
  );
  return <Wrap n={2}>
    <div style={{position:'absolute',left:70,right:70,top:220}}>
      <div style={{color:'#22d3ee',fontSize:32,fontWeight:900,letterSpacing:'.36em'}}>01 · THE CONCEPT</div>
      <div style={{display:'flex',gap:28,marginTop:48}}>
        {card('#34d399',d.posLabel,d.posCopy,'M87 23 130 41v36c0 37-23 59-43 68-20-9-43-31-43-68V41l43-18ZM64 88l18 18 33-40')}
        {card('#f87171',d.negLabel,d.negCopy,'M101 16 47 94h43l-7 64 56-95H96l5-47Z')}
      </div>
    </div>
  </Wrap>;
}

// ── Slide 3: Why It Matters ──
function S3({d}:{d:any}) {
  return <Wrap n={3}>
    <div style={{position:'absolute',left:72,right:72,top:250}}>
      <div style={{color:'#22d3ee',fontSize:32,fontWeight:900,letterSpacing:'.36em'}}>02 · WHY IT MATTERS</div>
    </div>
    <div style={{position:'absolute',left:72,right:72,top:440,height:200}}>
      <div style={{position:'absolute',left:0,right:0,top:74,height:27,borderRadius:999,background:'linear-gradient(90deg,#a78bfa,#6b7280 50%,#34d399)',boxShadow:'inset 0 2px 4px rgba(255,255,255,.18),0 0 28px rgba(34,211,238,.18)'}} />
      <div style={{position:'absolute',left:'72%',top:47,width:68,height:68,borderRadius:'50%',border:'5px solid #dfffee',background:'rgba(52,211,153,.20)',boxShadow:'0 0 36px rgba(52,211,153,.74)',transform:'translateX(-50%)'}} />
      <div style={{position:'absolute',left:0,right:0,top:150,display:'flex',justifyContent:'space-between',fontSize:26,fontWeight:800,letterSpacing:'.14em'}}>
        <span style={{color:'#a78bfa'}}>NEGATIVE</span><span style={{color:'#94a3b8'}}>NEUTRAL</span><span style={{color:'#34d399'}}>POSITIVE</span>
      </div>
    </div>
    <div style={{position:'absolute',left:120,right:120,top:700,color:'#f1f5f9',fontSize:42,lineHeight:1.45,fontWeight:500,fontStyle:'italic',textAlign:'center',whiteSpace:'pre-line'}}>{d.why}</div>
  </Wrap>;
}

// ── Slide 4: How To Read It ──
function S4({d}:{d:any}) {
  const items = [{t:d.c1t,s:d.c1s,c:'#34d399',icon:'M31 6 54 15v18c0 17-10 27-23 32C18 60 8 50 8 33V15L31 6ZM20 32l8 8 16-21'},{t:d.c2t,s:d.c2s,c:'#fbbf24',icon:'M31 8v46M8 31h46M31 51a20 20 0 100-40 20 20 0 000 40Z'},{t:d.c3t,s:d.c3s,c:'#f87171',icon:'M12 19 27 38 38 30 52 48M52 48h-14M52 48V34'}];
  return <Wrap n={4}>
    <div style={{position:'absolute',left:72,right:72,top:200}}>
      <div style={{color:'#22d3ee',fontSize:32,fontWeight:900,letterSpacing:'.36em'}}>03 · HOW TO READ IT</div>
      <div style={{display:'grid',gap:28,marginTop:56}}>
        {items.map((it,i)=>(
          <div key={i} style={{...panel,height:180,borderRadius:18,display:'grid',gridTemplateColumns:'160px 1fr',alignItems:'center',padding:'0 48px',borderColor:`${it.c}88`,boxShadow:`0 0 26px ${it.c}14`}}>
            <div style={{width:96,height:96,borderRadius:'50%',border:`2px solid ${it.c}`,display:'grid',placeItems:'center',color:it.c,filter:`drop-shadow(0 0 14px ${it.c})`}}>
              <svg width="52" height="52" viewBox="0 0 62 62" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d={it.icon}/></svg>
            </div>
            <div><div style={{fontSize:36,fontWeight:900,letterSpacing:'-.04em'}}>{it.t}</div><div style={{marginTop:16,color:'#c8d3e1',fontSize:28,fontWeight:500}}>{it.s}</div></div>
          </div>
        ))}
      </div>
    </div>
  </Wrap>;
}

// ── Slide 5: CTA ──
function S5() {
  return <Wrap n={5} noSwipe>
    <div style={{position:'absolute',left:'50%',top:128,width:720,height:720,borderRadius:'50%',transform:'translateX(-50%)',background:'radial-gradient(circle,rgba(34,211,238,.14),transparent 54%),radial-gradient(circle,rgba(167,139,250,.16),transparent 42%)',zIndex:0}} />
    <div style={{position:'absolute',top:280,left:0,right:0,textAlign:'center',zIndex:10}}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-512x512.png" alt="" width={220} height={220} style={{borderRadius:34,filter:'drop-shadow(0 0 42px rgba(34,211,238,.25))',margin:'0 auto',display:'block'}} />
      <div style={{marginTop:64,fontSize:58,fontWeight:700,letterSpacing:'.34em'}}>SIGNUM HQ</div>
      <div style={{marginTop:40,fontSize:52,fontWeight:900,letterSpacing:'-.06em',background:'linear-gradient(105deg,#a78bfa,#22d3ee)',WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent'}}>See the Full Picture</div>
      <div style={{marginTop:48,color:'#22d3ee',fontSize:38,fontWeight:700}}>signumhq.com</div>
      <div style={{marginTop:24,fontSize:28,fontWeight:500}}>Link in bio ↑</div>
    </div>
  </Wrap>;
}

// ── Main ──
function Content() {
  const sp = useSearchParams();
  const slide = parseInt(sp.get('slide')||'0');
  const topic = sp.get('topic')||'gex';
  const lang = sp.get('lang')||'en';
  const d = T[topic]?.[lang] || T.gex.en;

  if(slide>=1&&slide<=5) {
    switch(slide) {
      case 1: return <S1 d={d}/>;
      case 2: return <S2 d={d}/>;
      case 3: return <S3 d={d}/>;
      case 4: return <S4 d={d}/>;
      case 5: return <S5/>;
    }
  }
  // Preview: show all 5 in a grid
  return <div style={{display:'grid',gridTemplateColumns:'repeat(5,1080px)',gap:4,background:'rgba(255,255,255,.2)'}}>
    <S1 d={d}/><S2 d={d}/><S3 d={d}/><S4 d={d}/><S5/>
  </div>;
}

export default function EducationCarouselPage() {
  return <Suspense fallback={<div style={{width:1080,height:1080,background:BG}}/>}><Content/></Suspense>;
}
