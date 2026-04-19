/**
 * Alpha Engine V6.0 Deep Analysis
 * 11,543건 DynamoDB 실측 데이터 완벽 분석
 * 모든 필드, 모든 조합, 모든 상관관계
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({
  region: 'us-east-1',
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
});

// ====== Utility Functions ======
function avg(arr) { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0; }
function median(arr) { if (!arr.length) return 0; const s = [...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }
function hitRate(arr) { return arr.length ? arr.filter(v=>v>0).length/arr.length*100 : 0; }
function std(arr) { if (arr.length<2) return 0; const m=avg(arr); return Math.sqrt(arr.reduce((s,v)=>s+(v-m)**2,0)/(arr.length-1)); }
function sharpe(arr) { const s=std(arr); return s>0 ? avg(arr)/s*Math.sqrt(252/3) : 0; } // Annualized 3-day Sharpe
function correlation(x, y) {
  if (x.length !== y.length || x.length < 3) return 0;
  const mx=avg(x), my=avg(y);
  let num=0, dx=0, dy=0;
  for(let i=0;i<x.length;i++) { num+=(x[i]-mx)*(y[i]-my); dx+=(x[i]-mx)**2; dy+=(y[i]-my)**2; }
  return dx>0 && dy>0 ? num/Math.sqrt(dx*dy) : 0;
}

function printBand(name, rets, pad=20) {
  if (!rets.length) return;
  const a = avg(rets), h = hitRate(rets), m = median(rets), sh = sharpe(rets);
  console.log(
    name.padEnd(pad),
    'n='+String(rets.length).padStart(5),
    ' avg:'+(a>=0?'+':'')+a.toFixed(2)+'%',
    ' hit:'+h.toFixed(1)+'%',
    ' med:'+(m>=0?'+':'')+m.toFixed(2)+'%',
    ' sharpe:'+sh.toFixed(2)
  );
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ALPHA ENGINE DEEP ANALYSIS — 11,543건 완벽 분석            ║');
  console.log('║  모든 필드 × 모든 조합 × 모든 상관관계                      ║');  
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // ====== 1. DATA LOAD ======
  let items = [], lastKey;
  do {
    const res = await client.send(new ScanCommand({ TableName: 'signum-alpha-history', ExclusiveStartKey: lastKey, Limit: 5000 }));
    items.push(...(res.Items || [])); lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  const valid = items.filter(i => i.date?.S && !i.date.S.includes(':') && i.close?.N && Number(i.close.N) > 0 && i.alphaScore?.N)
    .map(i => ({
      ticker: i.ticker.S, date: i.date.S,
      alpha: Number(i.alphaScore.N), close: Number(i.close.N),
      gex: Number(i.gex?.N || 0), pcr: Number(i.pcr?.N || 0),
      chg: Number(i.changePct?.N || 0), price: Number(i.price?.N || i.close?.N || 0),
      grade: i.grade?.S || '', 
      momentum: Number(i.momentum?.N || -1), structure: Number(i.structure?.N || -1),
      flow: Number(i.flow?.N || -1), regime: Number(i.regime?.N || -1),
      catalyst: Number(i.catalyst?.N || -1), engineVersion: i.engineVersion?.S || '',
    }));

  const closeLookup = {}; valid.forEach(r => { if (!closeLookup[r.ticker]) closeLookup[r.ticker] = {}; closeLookup[r.ticker][r.date] = r.close; });
  const allDates = [...new Set(valid.map(r => r.date))].sort();

  // Compute forward returns
  const data = [];
  valid.forEach(r => {
    const idx = allDates.indexOf(r.date);
    if (idx < 0 || idx + 3 >= allDates.length) return;
    const fc = closeLookup[r.ticker]?.[allDates[idx+3]];
    if (!fc || fc <= 0) return;
    const ret = ((fc - r.close) / r.close) * 100;
    if (Math.abs(ret) > 50) return;
    data.push({ ...r, ret });
  });

  console.log('\n총 유효 레코드:', valid.length, '→ 3D forward return 계산:', data.length+'건');
  console.log('기간:', allDates[0], '~', allDates[allDates.length-1], '('+allDates.length+'일)');
  console.log('전체 평균 3D return:', avg(data.map(r=>r.ret)).toFixed(3)+'%');
  console.log('전체 적중률:', hitRate(data.map(r=>r.ret)).toFixed(1)+'%');

  // ═══════════════════════════════════════════════════
  // PART 1: 개별 인자 분석 (Single Factor)
  // ═══════════════════════════════════════════════════
  console.log('\n\n' + '═'.repeat(60));
  console.log('PART 1: 개별 인자 분석 — 각 인자 vs 3-Day Forward Return');
  console.log('═'.repeat(60));

  // 1-A: alphaScore (5점 단위)
  console.log('\n── 1-A. Alpha Score (5점 단위) ──');
  for (let lo = 0; lo <= 95; lo += 5) {
    const g = data.filter(r => r.alpha >= lo && r.alpha < lo + 5);
    printBand(`[${lo}-${lo+4}]`, g.map(r=>r.ret), 12);
  }

  // 1-B: changePct (1% 단위)
  console.log('\n── 1-B. changePct — 당일 가격 변동 (1% 단위) ──');
  for (let lo = -10; lo <= 9; lo++) {
    const g = data.filter(r => r.chg >= lo && r.chg < lo + 1);
    printBand(`[${lo>=0?'+':''}${lo}% ~ ${lo+1>=0?'+':''}${lo+1}%]`, g.map(r=>r.ret), 18);
  }
  printBand('[< -10%]', data.filter(r=>r.chg<-10).map(r=>r.ret), 18);
  printBand('[> +10%]', data.filter(r=>r.chg>=10).map(r=>r.ret), 18);

  // 1-C: GEX
  console.log('\n── 1-C. GEX (감마 노출) ──');
  const gexBands = [ [-Infinity,-1e9], [-1e9,-5e8], [-5e8,-1e8], [-1e8,-1e7], [-1e7,0], [0,1e7], [1e7,1e8], [1e8,5e8], [5e8,Infinity] ];
  gexBands.forEach(([lo,hi]) => {
    const g = data.filter(r => r.gex !== 0 && r.gex >= lo && r.gex < hi);
    const label = lo===-Infinity ? '<-1B' : hi===Infinity ? '>500M' : `${(lo/1e6).toFixed(0)}M~${(hi/1e6).toFixed(0)}M`;
    printBand(label, g.map(r=>r.ret), 18);
  });
  printBand('GEX=0 (없음)', data.filter(r=>r.gex===0).map(r=>r.ret), 18);

  // 1-D: PCR
  console.log('\n── 1-D. PCR (풋/콜 비율) ──');
  const pcrBands = [ [0.01,0.3], [0.3,0.5], [0.5,0.7], [0.7,0.9], [0.9,1.1], [1.1,1.3], [1.3,1.6], [1.6,2.0], [2.0,100] ];
  pcrBands.forEach(([lo,hi]) => {
    const g = data.filter(r => r.pcr >= lo && r.pcr < hi);
    printBand(`PCR ${lo.toFixed(1)}~${hi>=100?'∞':hi.toFixed(1)}`, g.map(r=>r.ret), 18);
  });
  printBand('PCR=0 (없음)', data.filter(r=>r.pcr===0).map(r=>r.ret), 18);

  // 1-E: Price Level (시가총액 프록시)
  console.log('\n── 1-E. Price Level (가격대별) ──');
  const priceBands = [ [0,10], [10,25], [25,50], [50,100], [100,200], [200,500], [500,1000], [1000,100000] ];
  priceBands.forEach(([lo,hi]) => {
    const g = data.filter(r => r.price >= lo && r.price < hi);
    printBand(`$${lo}~$${hi>=100000?'∞':hi}`, g.map(r=>r.ret), 18);
  });

  // 1-F: Grade
  console.log('\n── 1-F. Grade별 ──');
  ['S','A','B','C','D','F'].forEach(g => {
    const recs = data.filter(r => r.grade === g);
    printBand(`Grade ${g}`, recs.map(r=>r.ret), 18);
  });
  printBand('Grade 없음', data.filter(r=>!r.grade).map(r=>r.ret), 18);

  // 1-G: Pillar Scores (개별)
  console.log('\n── 1-G. Pillar별 (V4.6 Pillar Breakdown) ──');
  const pillars = ['momentum', 'structure', 'flow', 'regime', 'catalyst'];
  const pillarMax = [25, 25, 25, 15, 10];
  
  pillars.forEach((p, pi) => {
    const hasData = data.filter(r => r[p] >= 0);
    if (hasData.length < 100) { console.log(`\n  ${p}: 데이터 부족 (${hasData.length}건)`); return; }
    console.log(`\n  ── ${p.toUpperCase()} Pillar (0~${pillarMax[pi]}) — ${hasData.length}건 ──`);
    const step = pillarMax[pi] <= 15 ? 3 : 5;
    for (let lo = 0; lo <= pillarMax[pi]; lo += step) {
      const g = hasData.filter(r => r[p] >= lo && r[p] < lo + step);
      printBand(`  [${lo}-${lo+step-1}]`, g.map(r=>r.ret), 14);
    }
    // Correlation with forward return
    const corr = correlation(hasData.map(r=>r[p]), hasData.map(r=>r.ret));
    console.log(`  상관계수(${p} vs 3D return): ${corr.toFixed(4)}`);
  });

  // 1-H: 요일 효과
  console.log('\n── 1-H. 요일 효과 ──');
  const dayNames = ['일','월','화','수','목','금','토'];
  for (let d = 1; d <= 5; d++) {
    const g = data.filter(r => new Date(r.date+'T12:00:00').getDay() === d);
    printBand(dayNames[d]+'요일', g.map(r=>r.ret), 18);
  }

  // 1-I: 시장 국면별 (월별)
  console.log('\n── 1-I. 월별 시장 국면 ──');
  const months = [...new Set(data.map(r => r.date.slice(0,7)))].sort();
  months.forEach(m => {
    const g = data.filter(r => r.date.startsWith(m));
    printBand(m, g.map(r=>r.ret), 18);
  });

  // ═══════════════════════════════════════════════════
  // PART 2: 상관관계 매트릭스
  // ═══════════════════════════════════════════════════
  console.log('\n\n' + '═'.repeat(60));
  console.log('PART 2: 상관관계 매트릭스 — 모든 인자 vs 3D Forward Return');
  console.log('═'.repeat(60));

  const factors = [
    { name: 'alphaScore', fn: r => r.alpha },
    { name: 'changePct', fn: r => r.chg },
    { name: 'gex', fn: r => r.gex },
    { name: 'pcr', fn: r => r.pcr },
    { name: 'price', fn: r => r.price },
    { name: 'momentum', fn: r => r.momentum, filter: r => r.momentum >= 0 },
    { name: 'structure', fn: r => r.structure, filter: r => r.structure >= 0 },
    { name: 'flow', fn: r => r.flow, filter: r => r.flow >= 0 },
    { name: 'regime', fn: r => r.regime, filter: r => r.regime >= 0 },
    { name: 'catalyst', fn: r => r.catalyst, filter: r => r.catalyst >= 0 },
  ];

  console.log('\n인자 vs 3D Forward Return 상관계수:');
  console.log('-'.repeat(50));
  factors.forEach(f => {
    const subset = f.filter ? data.filter(f.filter) : data;
    const corr = correlation(subset.map(f.fn), subset.map(r=>r.ret));
    const bar = Math.abs(corr) > 0.1 ? '█'.repeat(Math.round(Math.abs(corr)*50)) : '';
    const sign = corr > 0 ? '+' : '-';
    console.log(`  ${f.name.padEnd(14)} r = ${corr>=0?'+':''}${corr.toFixed(4)}  ${bar} ${Math.abs(corr)>0.05?'⚠️':''}${Math.abs(corr)>0.1?'🔥':''}`);
  });

  // Cross-factor correlations
  console.log('\n인자 간 상관계수 (Cross-correlation):');
  console.log('-'.repeat(50));
  for (let i = 0; i < Math.min(factors.length, 5); i++) {
    for (let j = i+1; j < Math.min(factors.length, 5); j++) {
      const corr = correlation(data.map(factors[i].fn), data.map(factors[j].fn));
      if (Math.abs(corr) > 0.1) {
        console.log(`  ${factors[i].name} × ${factors[j].name}: r = ${corr>=0?'+':''}${corr.toFixed(4)}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // PART 3: 교차 분석 (2-Factor Cross Analysis)
  // ═══════════════════════════════════════════════════
  console.log('\n\n' + '═'.repeat(60));
  console.log('PART 3: 교차 분석 — 2인자 조합 최적화');
  console.log('═'.repeat(60));

  // 3-A: alphaScore × changePct
  console.log('\n── 3-A. Alpha Score × changePct 교차 ──');
  const alphaRanges = [[0,29],[30,44],[45,54],[55,64],[65,74],[75,100]];
  const chgRanges = [[-Infinity,-3],[-3,-1],[-1,0],[0,1],[1,3],[3,Infinity]];
  
  console.log('Alpha\\chg'.padEnd(12) + chgRanges.map(([lo,hi]) => `${lo===-Infinity?'<-3':lo>=0?'+'+lo:lo}~${hi===Infinity?'>+3':hi>=0?'+'+hi:hi}`.padEnd(12)).join(''));
  alphaRanges.forEach(([alo,ahi]) => {
    let row = `[${alo}-${ahi}]`.padEnd(12);
    chgRanges.forEach(([clo,chi]) => {
      const g = data.filter(r => r.alpha>=alo && r.alpha<=ahi && r.chg>=clo && r.chg<chi);
      if (g.length < 10) { row += '(n<10)'.padEnd(12); return; }
      const h = hitRate(g.map(r=>r.ret));
      const a = avg(g.map(r=>r.ret));
      row += `${h.toFixed(0)}%/${(a>=0?'+':'')+a.toFixed(1)}%`.padEnd(12);
    });
    console.log(row);
  });

  // 3-B: Momentum × Structure (Pillar 교차)
  const pillarData = data.filter(r => r.momentum >= 0 && r.structure >= 0 && r.flow >= 0);
  if (pillarData.length > 100) {
    console.log(`\n── 3-B. Momentum × Structure Pillar 교차 (${pillarData.length}건) ──`);
    const mRanges = [[0,7],[8,14],[15,19],[20,25]];
    const sRanges = [[0,7],[8,14],[15,19],[20,25]];
    console.log('Mom\\Str'.padEnd(10) + sRanges.map(([lo,hi]) => `S[${lo}-${hi}]`.padEnd(14)).join(''));
    mRanges.forEach(([mlo,mhi]) => {
      let row = `M[${mlo}-${mhi}]`.padEnd(10);
      sRanges.forEach(([slo,shi]) => {
        const g = pillarData.filter(r => r.momentum>=mlo && r.momentum<=mhi && r.structure>=slo && r.structure<=shi);
        if (g.length < 10) { row += '(n<10)'.padEnd(14); return; }
        const h = hitRate(g.map(r=>r.ret));
        const a = avg(g.map(r=>r.ret));
        row += `${h.toFixed(0)}% n=${g.length}`.padEnd(14);
      });
      console.log(row);
    });
  }

  // ═══════════════════════════════════════════════════
  // PART 4: 최강 시그널 전수 탐색
  // ═══════════════════════════════════════════════════
  console.log('\n\n' + '═'.repeat(60));
  console.log('PART 4: 최강 시그널 전수 탐색 — hit 55%+, n≥50, sharpe>0');
  console.log('═'.repeat(60));

  const signals = [];
  
  // Alpha × changePct × GEX 3차원 탐색
  const alphaThresholds = [0, 20, 30, 40, 50, 55, 60, 65, 70];
  const chgThresholds = [-5, -3, -2, -1, 0];
  const gexModes = ['any', 'neg', 'pos', 'zero'];
  const pcrModes = ['any', 'low(<0.8)', 'high(>1.2)'];

  alphaThresholds.forEach(amin => {
    [100, 39, 49, 59, 69, 79].forEach(amax => {
      if (amax < amin) return;
      chgThresholds.forEach(cmax => {
        gexModes.forEach(gm => {
          let g = data.filter(r => r.alpha >= amin && r.alpha <= amax && r.chg <= cmax);
          if (gm === 'neg') g = g.filter(r => r.gex < 0);
          else if (gm === 'pos') g = g.filter(r => r.gex > 0);
          else if (gm === 'zero') g = g.filter(r => r.gex === 0);
          
          if (g.length < 50) return;
          const rets = g.map(r=>r.ret);
          const h = hitRate(rets);
          const a = avg(rets);
          const sh = sharpe(rets);
          if (h >= 58 && a > 0.5 && sh > 0.3) {
            signals.push({
              name: `alpha[${amin}-${amax}] chg≤${cmax}% gex:${gm}`,
              n: g.length, hit: h, avg: a, sharpe: sh, median: median(rets)
            });
          }
        });
      });
    });
  });

  // 역발상 시그널: 고점수 + 하락
  chgThresholds.forEach(cmax => {
    [60, 65, 70].forEach(amin => {
      const g = data.filter(r => r.alpha >= amin && r.chg <= cmax);
      if (g.length < 20) return;
      const rets = g.map(r=>r.ret);
      const h = hitRate(rets), a = avg(rets), sh = sharpe(rets);
      if (h >= 55 && a > 0) {
        signals.push({ name: `CONTRARIAN alpha≥${amin} chg≤${cmax}%`, n: g.length, hit: h, avg: a, sharpe: sh, median: median(rets) });
      }
    });
  });

  // Sort by Sharpe ratio
  signals.sort((a,b) => b.sharpe - a.sharpe);
  const unique = [];
  signals.forEach(s => { if (!unique.find(u => Math.abs(u.hit-s.hit)<1 && Math.abs(u.avg-s.avg)<0.1)) unique.push(s); });
  
  console.log('\nTop 20 시그널 (Sharpe순):');
  console.log('Rank  Signal'.padEnd(52) + 'N'.padEnd(7) + 'Hit%'.padEnd(8) + 'Avg'.padEnd(10) + 'Med'.padEnd(10) + 'Sharpe');
  console.log('-'.repeat(100));
  unique.slice(0, 20).forEach((s, i) => {
    console.log(
      `#${i+1}`.padEnd(6) +
      s.name.padEnd(46) +
      String(s.n).padEnd(7) +
      s.hit.toFixed(1).padEnd(8) + '%' +
      ((s.avg>=0?'+':'')+s.avg.toFixed(2)+'%').padEnd(10) +
      ((s.median>=0?'+':'')+s.median.toFixed(2)+'%').padEnd(10) +
      s.sharpe.toFixed(3)
    );
  });

  // ═══════════════════════════════════════════════════
  // PART 5: V5.0 시뮬레이션 (기존 데이터에 V5.0 조정 적용)
  // ═══════════════════════════════════════════════════
  console.log('\n\n' + '═'.repeat(60));
  console.log('PART 5: V5.0 보정 시뮬레이션');
  console.log('═'.repeat(60));

  // V5.0 핵심 변경: changePct 기반 역전 보정 시뮬레이션
  // V4.6 score에서 changePct 기반 조정을 적용하면?
  const simVersions = [
    { name: 'V4.6 원본', fn: r => r.alpha },
    { name: 'V6-sim-A: alpha - chg*3', fn: r => Math.max(0, Math.min(100, r.alpha - r.chg * 3)) },
    { name: 'V6-sim-B: alpha - chg*5', fn: r => Math.max(0, Math.min(100, r.alpha - r.chg * 5)) },
    { name: 'V6-sim-C: (100-alpha)', fn: r => 100 - r.alpha },  // 완전 역전
    { name: 'V6-sim-D: alpha*(chg<0?1.3:0.7)', fn: r => Math.min(100, r.alpha * (r.chg < 0 ? 1.3 : 0.7)) },
    { name: 'V6-sim-E: abs(chg)>2 ? 80 : alpha', fn: r => Math.abs(r.chg) > 2 ? (r.chg < 0 ? 80 : 20) : r.alpha },
  ];

  simVersions.forEach(sim => {
    const scored = data.map(r => ({ ...r, simScore: sim.fn(r) }));
    console.log(`\n  ${sim.name}:`);
    const bands = [[70,100,'70+'],[60,69,'60-69'],[50,59,'50-59'],[40,49,'40-49'],[30,39,'30-39'],[0,29,'0-29']];
    bands.forEach(([lo,hi,name]) => {
      const g = scored.filter(r => r.simScore >= lo && r.simScore <= hi);
      if (!g.length) return;
      const h = hitRate(g.map(r=>r.ret)), a = avg(g.map(r=>r.ret));
      const marker = (name==='70+' && h>60) ? ' ✅✅' : (name==='70+' && h>55) ? ' ✅' : (name==='0-29' && h<45) ? ' ✅' : '';
      console.log(`    [${name}] n=${String(g.length).padEnd(5)} hit:${h.toFixed(1)}% avg:${(a>=0?'+':'')+a.toFixed(2)}%${marker}`);
    });
    // 단조증가 검증
    const bandAvgs = bands.map(([lo,hi]) => {
      const g = scored.filter(r => r.simScore >= lo && r.simScore <= hi);
      return g.length > 0 ? avg(g.map(r=>r.ret)) : null;
    }).filter(v=>v!==null);
    let monotonic = true;
    for (let i = 1; i < bandAvgs.length; i++) { if (bandAvgs[i] > bandAvgs[i-1]) { monotonic = false; break; } }
    console.log(`    단조증가: ${monotonic ? '✅ YES' : '❌ NO'}`);
  });

  // ═══════════════════════════════════════════════════
  // PART 6: 최적 엔진 구조 도출
  // ═══════════════════════════════════════════════════
  console.log('\n\n' + '═'.repeat(60));
  console.log('PART 6: 최적 엔진 구조 도출');
  console.log('═'.repeat(60));

  // 6-A: 단일 인자 예측력 순위
  console.log('\n── 6-A. 단일 인자 예측력 순위 ──');
  const factorPower = factors.map(f => {
    const subset = f.filter ? data.filter(f.filter) : data;
    const corr = correlation(subset.map(f.fn), subset.map(r=>r.ret));
    // Top/Bottom quintile spread
    const sorted = [...subset].sort((a,b) => f.fn(a) - f.fn(b));
    const q = Math.floor(sorted.length/5);
    const bottom = avg(sorted.slice(0, q).map(r=>r.ret));
    const top = avg(sorted.slice(-q).map(r=>r.ret));
    return { name: f.name, corr, spread: top - bottom, topHit: hitRate(sorted.slice(-q).map(r=>r.ret)), botHit: hitRate(sorted.slice(0,q).map(r=>r.ret)) };
  });
  
  factorPower.sort((a,b) => Math.abs(b.corr) - Math.abs(a.corr));
  console.log('인자'.padEnd(16) + 'Corr'.padEnd(10) + 'Top Q Hit'.padEnd(12) + 'Bot Q Hit'.padEnd(12) + 'Spread');
  factorPower.forEach(f => {
    console.log(
      f.name.padEnd(16) +
      ((f.corr>=0?'+':'')+f.corr.toFixed(4)).padEnd(10) +
      (f.topHit.toFixed(1)+'%').padEnd(12) +
      (f.botHit.toFixed(1)+'%').padEnd(12) +
      (f.spread>=0?'+':'')+f.spread.toFixed(2)+'%'
    );
  });

  // 6-B: 최적 가중치 탐색 (changePct 반영)
  console.log('\n── 6-B. 최적 스코어 공식 탐색 ──');
  console.log('V6 Score = w1*alpha + w2*(-changePct) + w3*factor 형태로 탐색\n');

  const bestFormulas = [];
  // w1: alpha 가중치, w2: -changePct 가중치
  for (let w1 = 0; w1 <= 1.0; w1 += 0.2) {
    for (let w2 = 0; w2 <= 2.0; w2 += 0.2) {
      const scored = data.map(r => {
        const raw = w1 * r.alpha + w2 * (-r.chg) * 10; // -chg를 스케일링
        return { ...r, v6: Math.max(0, Math.min(100, raw)) };
      });
      const top = scored.filter(r => r.v6 >= 70);
      if (top.length < 50) continue;
      const h = hitRate(top.map(r=>r.ret));
      const a = avg(top.map(r=>r.ret));
      const sh = sharpe(top.map(r=>r.ret));
      if (h >= 55) {
        bestFormulas.push({ w1, w2, n: top.length, hit: h, avg: a, sharpe: sh });
      }
    }
  }
  bestFormulas.sort((a,b) => b.sharpe - a.sharpe);
  console.log('Top 10 공식 (Sharpe순):');
  console.log('w1(alpha)  w2(-chg)  N(70+)  Hit%    Avg      Sharpe');
  bestFormulas.slice(0, 10).forEach(f => {
    console.log(
      `  ${f.w1.toFixed(1)}`.padEnd(11) +
      `  ${f.w2.toFixed(1)}`.padEnd(10) +
      String(f.n).padEnd(8) +
      f.hit.toFixed(1).padEnd(8) + '%' +
      ((f.avg>=0?'+':'')+f.avg.toFixed(2)+'%').padEnd(10) +
      f.sharpe.toFixed(3)
    );
  });

  // ═══════════════════════════════════════════════════
  // PART 7: 최종 결론
  // ═══════════════════════════════════════════════════
  console.log('\n\n' + '═'.repeat(60));
  console.log('PART 7: 최종 결론 및 V6.0 권고안');
  console.log('═'.repeat(60));
  
  console.log('\n분석 완료. 위 결과를 기반으로 V6.0 설계를 수행합니다.');
}

main().catch(e => console.error(e));
