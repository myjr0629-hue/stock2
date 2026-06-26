/**
 * V8 COMPREHENSIVE FACTOR ANALYSIS & OPTIMIZATION
 * Phase 1: Individual factor predictiveness
 * Phase 2: Gate impact analysis  
 * Phase 3: Optimal weight grid search
 * Phase 4: V8 final simulation
 */
require('dotenv').config({ path: '.env.local' });
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true }
});

async function scanAll() {
  let items = [], lastKey, c = 0;
  console.log('Scanning...');
  do {
    const r = await client.send(new ScanCommand({ TableName: 'signum-alpha-history', ExclusiveStartKey: lastKey, Limit: 5000 }));
    items = items.concat(r.Items || []);
    lastKey = r.LastEvaluatedKey;
    c++;
    if (c % 5 === 0) console.log(`  ${items.length}...`);
  } while (lastKey);
  return items;
}

function pearsonR(xs, ys) {
  const n = xs.length; if (n < 20) return null;
  const mx = xs.reduce((a,b)=>a+b,0)/n, my = ys.reduce((a,b)=>a+b,0)/n;
  let cov=0,vx=0,vy=0;
  for(let i=0;i<n;i++){cov+=(xs[i]-mx)*(ys[i]-my);vx+=(xs[i]-mx)**2;vy+=(ys[i]-my)**2;}
  return (vx>0&&vy>0)?cov/Math.sqrt(vx*vy):0;
}

function binnedAnalysis(pairs, factorKey, returnKey, bins) {
  return bins.map(b => {
    const items = pairs.filter(p => p[factorKey] !== null && p[factorKey] !== undefined && p[factorKey] >= b.min && p[factorKey] < b.max && p[returnKey] != null);
    if (items.length < 10) return { ...b, n: items.length, avg: null, win: null };
    const rets = items.map(p => p[returnKey]);
    const avg = rets.reduce((a,b)=>a+b,0)/rets.length;
    const win = rets.filter(r=>r>0).length/rets.length*100;
    return { ...b, n: items.length, avg, win };
  });
}

async function main() {
  const allRecords = await scanAll();
  console.log(`Total: ${allRecords.length}`);

  // Build pairs
  const tickerMap = {};
  allRecords.forEach(r => {
    if (!r.ticker || !r.date) return;
    if (!tickerMap[r.ticker]) tickerMap[r.ticker] = {};
    const ex = tickerMap[r.ticker][r.date];
    if (!ex || (r.timestamp||0) > (ex.timestamp||0)) tickerMap[r.ticker][r.date] = r;
  });

  const allPairs = [];
  for (const ticker of Object.keys(tickerMap)) {
    const dateMap = tickerMap[ticker];
    const dates = Object.keys(dateMap).sort();
    for (let i = 0; i < dates.length; i++) {
      const rec = dateMap[dates[i]];
      const score = rec.alphaScore ?? rec.contextScore ?? null;
      const close = rec.close ?? rec.price ?? null;
      if (score == null || !close || close <= 0) continue;

      const p = {
        ticker, date: dates[i], score, close,
        grade: rec.alphaGrade || rec.grade || rec.qualityTier || 'N/A',
        changePct: rec.changePct ?? null,
        rsi14: rec.rsi14 ?? null,
        vwap: rec.vwap ?? null,
        vwapDist: (rec.vwap && rec.vwap > 0 && close > 0) ? ((close - rec.vwap) / rec.vwap) * 100 : null,
        volume: rec.volume ?? null,
        relVol: rec.relVol ?? null,
        darkPoolPct: rec.darkPoolPct ?? null,
        whaleIndex: rec.whaleIndex ?? null,
        squeezeScore: rec.squeezeScore ?? null,
        shortVolPct: rec.shortVolPct ?? null,
        momentum: rec.momentum ?? null,
        structure: rec.structure ?? null,
        flow: rec.flow ?? null,
        regime: rec.regime ?? null,
        catalyst: rec.catalyst ?? null,
        era: dates[i] < '2026-03-21' ? 'V4.6' : dates[i] < '2026-05-21' ? 'V5/V6' : 'V7',
      };

      // Calculate returns
      for (const h of [1, 3, 5, 10]) {
        let fc = null;
        for (let j = i + h; j <= Math.min(i + h + 2, dates.length - 1); j++) {
          const fr = dateMap[dates[j]];
          const fClose = fr ? (fr.close ?? fr.price ?? null) : null;
          if (fr && fClose > 0) { fc = fClose; break; }
        }
        p[`ret${h}d`] = fc !== null ? Math.round(((fc - close) / close) * 10000) / 100 : null;
      }
      if (p.ret3d !== null) allPairs.push(p);
    }
  }

  console.log(`Total pairs: ${allPairs.length}`);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: INDIVIDUAL FACTOR ANALYSIS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('PHASE 1: INDIVIDUAL FACTOR PREDICTIVENESS (T+3)');
  console.log('═'.repeat(70));

  const eras = ['V4.6', 'V5/V6', 'V7', 'ALL'];
  
  // Factor bins
  const factorDefs = [
    { key: 'changePct', name: 'Price Change%', bins: [
      {min:-99,max:-5,label:'<-5%'},{min:-5,max:-3,label:'-5~-3%'},{min:-3,max:-1,label:'-3~-1%'},
      {min:-1,max:1,label:'-1~+1%'},{min:1,max:3,label:'+1~+3%'},{min:3,max:5,label:'+3~+5%'},{min:5,max:99,label:'>+5%'}
    ]},
    { key: 'rsi14', name: 'RSI(14)', bins: [
      {min:0,max:25,label:'<25'},{min:25,max:35,label:'25-35'},{min:35,max:45,label:'35-45'},
      {min:45,max:55,label:'45-55'},{min:55,max:65,label:'55-65'},{min:65,max:75,label:'65-75'},{min:75,max:100,label:'>75'}
    ]},
    { key: 'vwapDist', name: 'VWAP Distance%', bins: [
      {min:-99,max:-3,label:'<-3%'},{min:-3,max:-1,label:'-3~-1%'},{min:-1,max:0,label:'-1~0%'},
      {min:0,max:1,label:'0~+1%'},{min:1,max:3,label:'+1~+3%'},{min:3,max:99,label:'>+3%'}
    ]},
    { key: 'score', name: 'Alpha Score', bins: [
      {min:0,max:20,label:'0-20'},{min:20,max:30,label:'20-30'},{min:30,max:40,label:'30-40'},
      {min:40,max:50,label:'40-50'},{min:50,max:60,label:'50-60'},{min:60,max:70,label:'60-70'},
      {min:70,max:80,label:'70-80'},{min:80,max:100,label:'80-100'}
    ]},
  ];

  for (const era of eras) {
    const ep = era === 'ALL' ? allPairs : allPairs.filter(p => p.era === era);
    if (ep.length < 100) continue;
    
    console.log(`\n--- ${era} (N=${ep.length}) ---`);
    
    for (const fd of factorDefs) {
      const valid = ep.filter(p => p[fd.key] != null && p.ret3d != null);
      if (valid.length < 50) continue;
      const r = pearsonR(valid.map(p => p[fd.key]), valid.map(p => p.ret3d));
      console.log(`  ${fd.name}: r=${r?.toFixed(4)} (N=${valid.length})`);
      const binResult = binnedAnalysis(ep, fd.key, 'ret3d', fd.bins);
      binResult.forEach(b => {
        if (b.n >= 10) console.log(`    ${b.label}: N=${b.n}, avg=${b.avg?.toFixed(3)}%, win=${b.win?.toFixed(1)}%`);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: GATE SIMULATION — Which V6 gates help vs hurt?
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('PHASE 2: V6 GATE IMPACT ANALYSIS');
  console.log('═'.repeat(70));

  for (const era of eras) {
    const ep = era === 'ALL' ? allPairs : allPairs.filter(p => p.era === era);
    if (ep.length < 100) continue;
    console.log(`\n--- ${era} (N=${ep.length}) ---`);

    // Gate: RSI_EXTREME_OVERSOLD (RSI < 25)
    const rsiOver = ep.filter(p => p.rsi14 != null && p.rsi14 < 25 && p.ret3d != null);
    if (rsiOver.length >= 5) {
      const avg = rsiOver.reduce((a,p) => a+p.ret3d,0)/rsiOver.length;
      const win = rsiOver.filter(p=>p.ret3d>0).length/rsiOver.length*100;
      console.log(`  RSI_OVERSOLD (<25): N=${rsiOver.length}, avg=${avg.toFixed(3)}%, win=${win.toFixed(1)}% — ${avg > 0.5 ? '✅ KEEP' : '⚠️ WEAK'}`);
    }

    // Gate: VWAP_RSI_OVERSOLD (VWAP < -2% + RSI < 35)
    const vwapRsi = ep.filter(p => p.vwapDist != null && p.vwapDist < -2 && p.rsi14 != null && p.rsi14 < 35 && p.ret3d != null);
    if (vwapRsi.length >= 5) {
      const avg = vwapRsi.reduce((a,p)=>a+p.ret3d,0)/vwapRsi.length;
      const win = vwapRsi.filter(p=>p.ret3d>0).length/vwapRsi.length*100;
      console.log(`  VWAP_RSI_OVERSOLD: N=${vwapRsi.length}, avg=${avg.toFixed(3)}%, win=${win.toFixed(1)}% — ${avg > 1 ? '✅ KEEP' : '⚠️ WEAK'}`);
    }

    // Gate: VWAP_RSI_OVERHEAT (VWAP > 2% + RSI > 65)
    const vwapHeat = ep.filter(p => p.vwapDist != null && p.vwapDist > 2 && p.rsi14 != null && p.rsi14 > 65 && p.ret3d != null);
    if (vwapHeat.length >= 5) {
      const avg = vwapHeat.reduce((a,p)=>a+p.ret3d,0)/vwapHeat.length;
      const win = vwapHeat.filter(p=>p.ret3d>0).length/vwapHeat.length*100;
      console.log(`  VWAP_RSI_OVERHEAT: N=${vwapHeat.length}, avg=${avg.toFixed(3)}%, win=${win.toFixed(1)}% — ${avg < 0 ? '✅ KEEP(-5)' : '❌ REMOVE'}`);
    }

    // Gate: SIDEWAYS (-1% < chg < 1%)
    const sideways = ep.filter(p => p.changePct != null && p.changePct > -1 && p.changePct < 1 && p.ret3d != null);
    const nonSideways = ep.filter(p => p.changePct != null && (p.changePct <= -1 || p.changePct >= 1) && p.ret3d != null);
    if (sideways.length >= 50 && nonSideways.length >= 50) {
      const sAvg = sideways.reduce((a,p)=>a+p.ret3d,0)/sideways.length;
      const nsAvg = nonSideways.reduce((a,p)=>a+p.ret3d,0)/nonSideways.length;
      console.log(`  SIDEWAYS_PENALTY: sideways avg=${sAvg.toFixed(3)}% vs non-sideways avg=${nsAvg.toFixed(3)}% — ${sAvg < nsAvg ? '✅ KEEP(-2)' : '❌ REMOVE'}`);
    }

    // changePct extreme analysis
    const bigDrop = ep.filter(p => p.changePct != null && p.changePct <= -3 && p.ret3d != null);
    const bigRise = ep.filter(p => p.changePct != null && p.changePct >= 3 && p.ret3d != null);
    if (bigDrop.length >= 10) {
      const avg = bigDrop.reduce((a,p)=>a+p.ret3d,0)/bigDrop.length;
      const win = bigDrop.filter(p=>p.ret3d>0).length/bigDrop.length*100;
      console.log(`  BIG_DROP (chg<=-3%): N=${bigDrop.length}, avg=${avg.toFixed(3)}%, win=${win.toFixed(1)}% — Mean Reversion signal`);
    }
    if (bigRise.length >= 10) {
      const avg = bigRise.reduce((a,p)=>a+p.ret3d,0)/bigRise.length;
      const win = bigRise.filter(p=>p.ret3d>0).length/bigRise.length*100;
      console.log(`  BIG_RISE (chg>=+3%): N=${bigRise.length}, avg=${avg.toFixed(3)}%, win=${win.toFixed(1)}% — Momentum carry`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: PILLAR-LEVEL ANALYSIS (N=8,789 with pillar data)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('PHASE 3: PILLAR-LEVEL OPTIMIZATION (records with pillar data)');
  console.log('═'.repeat(70));

  const pillarPairs = allPairs.filter(p => p.momentum != null && p.structure != null && p.flow != null && p.regime != null && p.catalyst != null);
  console.log(`Pillar pairs: ${pillarPairs.length}`);

  if (pillarPairs.length >= 100) {
    // Individual pillar correlations across horizons
    const pillars = ['momentum','structure','flow','regime','catalyst'];
    for (const h of [1,3,5,10]) {
      const rk = `ret${h}d`;
      const valid = pillarPairs.filter(p => p[rk] != null);
      if (valid.length < 50) continue;
      console.log(`\n  T+${h} (N=${valid.length}):`);
      for (const pl of pillars) {
        const r = pearsonR(valid.map(p => p[pl]), valid.map(p => p[rk]));
        // Also test inverted
        const rInv = pearsonR(valid.map(p => (pl === 'regime' ? 15 : 25) - p[pl]), valid.map(p => p[rk]));
        console.log(`    ${pl}: r=${r?.toFixed(4)} | inverted r=${rInv?.toFixed(4)} ${Math.abs(rInv) > Math.abs(r) ? '← BETTER' : ''}`);
      }
    }

    // Grid search for optimal weights (T+3)
    console.log('\n  GRID SEARCH — Optimal weight combination (T+3):');
    const validT3 = pillarPairs.filter(p => p.ret3d != null);
    let bestR = -1, bestConfig = null;
    const weightOptions = [0, 0.5, 1, 1.5, 2];
    const regimeOptions = [-1, -0.5, 0, 0.5, 1]; // negative = inverted
    
    for (const wm of weightOptions) {
      for (const ws of weightOptions) {
        for (const wf of weightOptions) {
          for (const wr of regimeOptions) {
            for (const wc of weightOptions) {
              if (wm === 0 && ws === 0 && wf === 0 && wr === 0 && wc === 0) continue;
              const scores = validT3.map(p => {
                const regVal = wr >= 0 ? p.regime * wr : (15 - p.regime) * Math.abs(wr);
                return p.momentum * wm + p.structure * ws + p.flow * wf + regVal + p.catalyst * wc;
              });
              const r = pearsonR(scores, validT3.map(p => p.ret3d));
              if (r !== null && r > bestR) {
                bestR = r;
                bestConfig = { wm, ws, wf, wr, wc };
              }
            }
          }
        }
      }
    }
    console.log(`    Best r=${bestR.toFixed(4)}: M×${bestConfig.wm} + S×${bestConfig.ws} + F×${bestConfig.wf} + R×${bestConfig.wr} + C×${bestConfig.wc}`);
    console.log(`    (R negative = regime inverted)`);

    // Also search T+10
    const validT10 = pillarPairs.filter(p => p.ret10d != null);
    if (validT10.length >= 50) {
      let bestR10 = -1, bestCfg10 = null;
      for (const wm of weightOptions) {
        for (const ws of weightOptions) {
          for (const wf of weightOptions) {
            for (const wr of regimeOptions) {
              for (const wc of weightOptions) {
                if (wm === 0 && ws === 0 && wf === 0 && wr === 0 && wc === 0) continue;
                const scores = validT10.map(p => {
                  const regVal = wr >= 0 ? p.regime * wr : (15 - p.regime) * Math.abs(wr);
                  return p.momentum * wm + p.structure * ws + p.flow * wf + regVal + p.catalyst * wc;
                });
                const r = pearsonR(scores, validT10.map(p => p.ret10d));
                if (r !== null && r > bestR10) { bestR10 = r; bestCfg10 = { wm, ws, wf, wr, wc }; }
              }
            }
          }
        }
      }
      console.log(`    T+10 Best r=${bestR10.toFixed(4)}: M×${bestCfg10.wm} + S×${bestCfg10.ws} + F×${bestCfg10.wf} + R×${bestCfg10.wr} + C×${bestCfg10.wc}`);
    }

    // Simulate best config
    console.log('\n  BEST CONFIG SIMULATION:');
    const bc = bestConfig;
    const simScores = validT3.map(p => {
      const regVal = bc.wr >= 0 ? p.regime * bc.wr : (15 - p.regime) * Math.abs(bc.wr);
      return p.momentum * bc.wm + p.structure * bc.ws + p.flow * bc.wf + regVal + p.catalyst * bc.wc;
    });
    // Quintile
    const indexed = validT3.map((p,i) => ({...p, simScore: simScores[i]})).sort((a,b)=>a.simScore-b.simScore);
    const qSize = Math.floor(indexed.length / 5);
    for (let qi = 0; qi < 5; qi++) {
      const qItems = qi < 4 ? indexed.slice(qSize*qi, qSize*(qi+1)) : indexed.slice(qSize*4);
      const rets = qItems.map(p => p.ret3d);
      const avg = rets.reduce((a,b)=>a+b,0)/rets.length;
      const win = rets.filter(r=>r>0).length/rets.length*100;
      const sMin = Math.min(...qItems.map(p=>p.simScore)).toFixed(1);
      const sMax = Math.max(...qItems.map(p=>p.simScore)).toFixed(1);
      console.log(`    Q${qi+1}: ${sMin}-${sMax} | avg=${avg.toFixed(3)}% | win=${win.toFixed(1)}%`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: CROSS-FACTOR INTERACTION (top combos)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('PHASE 4: CROSS-FACTOR INTERACTIONS (ALL data, T+3)');
  console.log('═'.repeat(70));

  // RSI × changePct interaction
  const rsiChgCombos = [
    { label: 'RSI<30 + chg<-2%', filter: p => p.rsi14 != null && p.rsi14 < 30 && p.changePct != null && p.changePct < -2 },
    { label: 'RSI<30 + chg>0%', filter: p => p.rsi14 != null && p.rsi14 < 30 && p.changePct != null && p.changePct > 0 },
    { label: 'RSI>70 + chg>2%', filter: p => p.rsi14 != null && p.rsi14 > 70 && p.changePct != null && p.changePct > 2 },
    { label: 'RSI>70 + chg<0%', filter: p => p.rsi14 != null && p.rsi14 > 70 && p.changePct != null && p.changePct < 0 },
    { label: 'RSI 40-60 + chg -1~+1%', filter: p => p.rsi14 != null && p.rsi14 >= 40 && p.rsi14 <= 60 && p.changePct != null && Math.abs(p.changePct) < 1 },
    { label: 'VWAP<-2% + RSI<35', filter: p => p.vwapDist != null && p.vwapDist < -2 && p.rsi14 != null && p.rsi14 < 35 },
    { label: 'VWAP>+2% + RSI>65', filter: p => p.vwapDist != null && p.vwapDist > 2 && p.rsi14 != null && p.rsi14 > 65 },
    { label: 'chg<-3% + VWAP<-1%', filter: p => p.changePct != null && p.changePct < -3 && p.vwapDist != null && p.vwapDist < -1 },
    { label: 'chg>+3% + VWAP>+1%', filter: p => p.changePct != null && p.changePct > 3 && p.vwapDist != null && p.vwapDist > 1 },
  ];

  for (const combo of rsiChgCombos) {
    const items = allPairs.filter(p => combo.filter(p) && p.ret3d != null);
    if (items.length < 10) continue;
    const avg = items.reduce((a,p)=>a+p.ret3d,0)/items.length;
    const win = items.filter(p=>p.ret3d>0).length/items.length*100;
    // Also check T+5 and T+10
    const t5Items = items.filter(p => p.ret5d != null);
    const t5Avg = t5Items.length > 0 ? t5Items.reduce((a,p)=>a+p.ret5d,0)/t5Items.length : null;
    const t10Items = items.filter(p => p.ret10d != null);
    const t10Avg = t10Items.length > 0 ? t10Items.reduce((a,p)=>a+p.ret10d,0)/t10Items.length : null;
    console.log(`  ${combo.label}: N=${items.length}, T+3 avg=${avg.toFixed(3)}% win=${win.toFixed(1)}% | T+5=${t5Avg?.toFixed(3)}% | T+10=${t10Avg?.toFixed(3)}%`);
  }

  // ═══════════════════════════════════════════════════════════════
  // PHASE 5: ERA-SPECIFIC SCORE FACTOR REGRESSION
  // What factors most predict T+3 returns in each era?
  // ═══════════════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(70));
  console.log('PHASE 5: FACTOR CORRELATION RANKING BY ERA');
  console.log('═'.repeat(70));

  const allFactors = ['changePct','rsi14','vwapDist','score'];
  
  for (const era of eras) {
    const ep = era === 'ALL' ? allPairs : allPairs.filter(p => p.era === era);
    if (ep.length < 100) continue;
    console.log(`\n  ${era} (N=${ep.length}):`);
    const results = [];
    for (const f of allFactors) {
      const valid = ep.filter(p => p[f] != null && p.ret3d != null);
      if (valid.length < 50) continue;
      const r = pearsonR(valid.map(p => p[f]), valid.map(p => p.ret3d));
      results.push({ factor: f, r, n: valid.length });
    }
    results.sort((a,b) => Math.abs(b.r) - Math.abs(a.r));
    results.forEach(r => console.log(`    ${r.factor}: r=${r.r?.toFixed(4)} (N=${r.n})`));
  }

  console.log('\n\nDONE');
}

main().catch(console.error);
