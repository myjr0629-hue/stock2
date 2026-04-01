// ══════════════════════════════════════════════════════════════
// SIGNUM HQ — Full-Stack Stress Test V2 (AWS + Redis + Vercel)
// 목적: 모든 레이어 데이터 정합성 + 응답속도 + 파이프라인 무결성
// ══════════════════════════════════════════════════════════════

const BASE = 'https://www.signumhq.com';

// Core tickers to test across all layers
const CORE_TICKERS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AMD', 'CEG', 'PLTR'];
const SECONDARY_TICKERS = ['COP', 'UPS', 'MU', 'AVGO', 'INTC'];

const results = {
  timestamp: new Date().toISOString(),
  layer1_api_speed: [],
  layer2_data_integrity: [],
  layer3_cross_page_consistency: [],
  layer4_page_speed: [],
  layer5_redis_cache: [],
  errors: [],
  warnings: [],
  optimizations: []
};

async function fetchJSON(url, label) {
  const t0 = Date.now();
  try {
    const res = await fetch(url);
    const elapsed = Date.now() - t0;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { data, elapsed, ok: true, label };
  } catch (e) {
    return { data: null, elapsed: Date.now() - t0, ok: false, error: e.message, label };
  }
}

async function fetchHTML(url, label) {
  const t0 = Date.now();
  try {
    const res = await fetch(url);
    const elapsed = Date.now() - t0;
    const size = parseInt(res.headers.get('content-length') || '0');
    const html = await res.text();
    return { elapsed, ok: res.ok, size: html.length, status: res.status, label };
  } catch (e) {
    return { elapsed: Date.now() - t0, ok: false, error: e.message, label };
  }
}

// ══════════════════════════════════════════════════════════════
// LAYER 1: API Endpoint Speed + Availability
// ══════════════════════════════════════════════════════════════
async function testLayer1_ApiSpeed() {
  console.log('\n' + '═'.repeat(60));
  console.log('LAYER 1: API ENDPOINT SPEED & AVAILABILITY');
  console.log('═'.repeat(60));

  const endpoints = [
    { url: `${BASE}/api/command/unified?t=NVDA`, name: 'Command Unified (NVDA)' },
    { url: `${BASE}/api/command/unified?t=TSLA`, name: 'Command Unified (TSLA)' },
    { url: `${BASE}/api/dashboard/unified?tickers=NVDA,AAPL,TSLA,MSFT,AMZN`, name: 'Dashboard Unified (5-batch)' },
    { url: `${BASE}/api/flow/unified?ticker=NVDA`, name: 'Flow Unified (NVDA)' },
    { url: `${BASE}/api/flow/unified?ticker=TSLA`, name: 'Flow Unified (TSLA)' },
    { url: `${BASE}/api/flow/ai-analysis?ticker=NVDA`, name: 'Flow AI Analysis (NVDA)' },
    { url: `${BASE}/api/guardian/briefing?locale=ko`, name: 'Guardian Briefing (KO)' },
    { url: `${BASE}/api/guardian/history`, name: 'Guardian History' },
    { url: `${BASE}/api/intel/m7`, name: 'Intel M7 Report' },
    { url: `${BASE}/api/intel/quantumedge`, name: 'Intel QuantumEdge' },
    { url: `${BASE}/api/market/macro`, name: 'Market Macro Data' },
    { url: `${BASE}/api/stock?ticker=NVDA`, name: 'Stock Data (NVDA)' },
    { url: `${BASE}/api/watchlist/batch?tickers=NVDA,AAPL,TSLA`, name: 'Watchlist Batch (3)' },
    { url: `${BASE}/api/live/quotes?tickers=NVDA`, name: 'Live Quotes (NVDA)' },
    { url: `${BASE}/api/market/status`, name: 'Market Status' },
    { url: `${BASE}/api/health`, name: 'Health Check' },
  ];

  for (const ep of endpoints) {
    const r = await fetchJSON(ep.url, ep.name);
    const icon = !r.ok ? '❌' : r.elapsed < 500 ? '🟢' : r.elapsed < 1500 ? '🟡' : '🔴';
    console.log(`  ${icon} ${ep.name.padEnd(35)} ${r.elapsed}ms ${r.ok ? 'OK' : 'FAIL: ' + r.error}`);
    results.layer1_api_speed.push({
      endpoint: ep.name,
      elapsed: r.elapsed,
      ok: r.ok,
      error: r.error || null
    });
    if (!r.ok) results.errors.push(`API_FAIL: ${ep.name} — ${r.error}`);
    if (r.ok && r.elapsed > 2000) results.warnings.push(`SLOW_API: ${ep.name} took ${r.elapsed}ms`);
    if (r.ok && r.elapsed > 3000) results.optimizations.push(`CRITICAL_SLOW: ${ep.name} (${r.elapsed}ms) — Redis SWR 또는 Edge 캐싱 필요`);
  }

  const avg = results.layer1_api_speed.filter(r => r.ok).reduce((s, r) => s + r.elapsed, 0) / results.layer1_api_speed.filter(r => r.ok).length;
  console.log(`\n  📊 Average Response: ${avg.toFixed(0)}ms | Failed: ${results.layer1_api_speed.filter(r => !r.ok).length}/${endpoints.length}`);
}

// ══════════════════════════════════════════════════════════════
// LAYER 2: Data Integrity — Field Completeness Per Ticker
// ══════════════════════════════════════════════════════════════
async function testLayer2_DataIntegrity() {
  console.log('\n' + '═'.repeat(60));
  console.log('LAYER 2: DATA INTEGRITY — FIELD COMPLETENESS');
  console.log('═'.repeat(60));

  const REQUIRED_FIELDS = [
    'underlyingPrice', 'changePercent', 'netGex', 'gammaFlip', 'squeeze',
    'maxPain', 'callWall', 'putFloor', 'darkPoolPct', 'shortVolPct',
    'atmIv', 'pcRatio', 'session', 'impliedMove', 'vwap'
  ];

  for (const ticker of [...CORE_TICKERS, ...SECONDARY_TICKERS]) {
    const r = await fetchJSON(`${BASE}/api/command/unified?t=${ticker}`, ticker);
    if (!r.ok) {
      console.log(`  ❌ ${ticker.padEnd(6)} API FAIL: ${r.error}`);
      results.layer2_data_integrity.push({ ticker, ok: false, error: r.error });
      results.errors.push(`DATA_MISS: ${ticker} — API fail`);
      continue;
    }

    const data = r.data?.[ticker] || r.data?.data?.[ticker] || {};
    const present = REQUIRED_FIELDS.filter(f => data[f] !== undefined && data[f] !== null);
    const missing = REQUIRED_FIELDS.filter(f => data[f] === undefined || data[f] === null);
    const pct = (present.length / REQUIRED_FIELDS.length * 100).toFixed(0);
    const icon = missing.length === 0 ? '✅' : missing.length <= 2 ? '⚠️' : '❌';

    console.log(`  ${icon} ${ticker.padEnd(6)} ${present.length}/${REQUIRED_FIELDS.length} (${pct}%) [${r.elapsed}ms] ${missing.length > 0 ? 'MISS: ' + missing.join(', ') : ''}`);

    results.layer2_data_integrity.push({
      ticker, ok: missing.length <= 2, fields: present.length,
      total: REQUIRED_FIELDS.length, missing, elapsed: r.elapsed,
      price: data.underlyingPrice || data.price || null,
      changePct: data.changePercent || null
    });

    // Check for suspicious data values
    if (data.underlyingPrice && (data.underlyingPrice < 0.01 || data.underlyingPrice > 50000)) {
      results.warnings.push(`SUSPICIOUS_PRICE: ${ticker} = $${data.underlyingPrice}`);
    }
    if (data.changePercent && Math.abs(data.changePercent) > 50) {
      results.warnings.push(`SUSPICIOUS_CHANGE: ${ticker} = ${data.changePercent}%`);
    }
    if (data.squeeze !== undefined && data.squeeze > 100) {
      results.warnings.push(`SUSPICIOUS_SQUEEZE: ${ticker} = ${data.squeeze}%`);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// LAYER 3: Cross-Page Data Consistency
// ══════════════════════════════════════════════════════════════
async function testLayer3_CrossPageConsistency() {
  console.log('\n' + '═'.repeat(60));
  console.log('LAYER 3: CROSS-PAGE DATA CONSISTENCY');
  console.log('═'.repeat(60));

  // Test: Same ticker price should be consistent across endpoints
  for (const ticker of ['NVDA', 'TSLA', 'AAPL']) {
    const unified = await fetchJSON(`${BASE}/api/command/unified?t=${ticker}`, `command-${ticker}`);
    const dashboard = await fetchJSON(`${BASE}/api/dashboard/unified?tickers=${ticker}`, `dashboard-${ticker}`);
    const flow = await fetchJSON(`${BASE}/api/flow/unified?ticker=${ticker}`, `flow-${ticker}`);

    // Extract prices from various response shapes
    const uData = unified.data?.data || unified.data || {};
    const dData = dashboard.data?.[ticker] || dashboard.data?.data?.[ticker] || {};
    const fData = flow.data?.data || flow.data || {};
    const uPrice = uData.underlyingPrice || uData.price || null;
    const dPrice = dData.underlyingPrice || dData.price || null;
    const fPrice = fData.underlyingPrice || fData.currentPrice || null;

    const prices = [uPrice, dPrice, fPrice].filter(p => p != null);
    let consistent = true;
    let maxDiff = 0;

    if (prices.length >= 2) {
      const max = Math.max(...prices);
      const min = Math.min(...prices);
      maxDiff = max > 0 ? ((max - min) / max * 100) : 0;
      consistent = maxDiff < 1; // < 1% difference is acceptable (closed market)
    }

    const icon = consistent ? '✅' : maxDiff < 5 ? '⚠️' : '❌';
    console.log(`  ${icon} ${ticker.padEnd(6)} Unified:$${uPrice || 'N/A'} | Dashboard:$${dPrice || 'N/A'} | Flow:$${fPrice || 'N/A'} | Diff: ${maxDiff.toFixed(2)}%`);

    results.layer3_cross_page_consistency.push({
      ticker, consistent, maxDiff: maxDiff.toFixed(2),
      unified: uPrice, dashboard: dPrice, flow: fPrice
    });

    if (!consistent) results.warnings.push(`PRICE_MISMATCH: ${ticker} — ${maxDiff.toFixed(2)}% diff across APIs`);
  }

  // Guardian data consistency check
  const guardian = await fetchJSON(`${BASE}/api/guardian/history`, 'guardian-history');
  if (guardian.ok && guardian.data) {
    const gd = guardian.data?.data || guardian.data;
    const score = gd?.score || gd?.rlsi || gd?.latest?.score;
    console.log(`  📊 Guardian Score: ${score || 'N/A'} | Keys: ${Object.keys(gd || {}).length}`);
    if (score === undefined || score === null) results.warnings.push('GUARDIAN_MISS: score missing from history');
  }
}

// ══════════════════════════════════════════════════════════════
// LAYER 4: Page Load Speed (All 9 Pages)
// ══════════════════════════════════════════════════════════════
async function testLayer4_PageSpeed() {
  console.log('\n' + '═'.repeat(60));
  console.log('LAYER 4: PAGE LOAD SPEED (TTFB + Transfer)');
  console.log('═'.repeat(60));

  const pages = [
    { url: `${BASE}/ko`, name: 'Home' },
    { url: `${BASE}/ko/dashboard`, name: 'Dashboard' },
    { url: `${BASE}/ko/ticker?ticker=NVDA`, name: 'Command (NVDA)' },
    { url: `${BASE}/ko/ticker?ticker=TSLA`, name: 'Command (TSLA)' },
    { url: `${BASE}/ko/intel-guardian`, name: 'Guardian' },
    { url: `${BASE}/ko/flow?ticker=NVDA`, name: 'Flow' },
    { url: `${BASE}/ko/intel`, name: 'Intel' },
    { url: `${BASE}/ko/portfolio`, name: 'Portfolio' },
    { url: `${BASE}/ko/watchlist`, name: 'Watchlist' },
    { url: `${BASE}/ko/pricing`, name: 'Pricing' },
    { url: `${BASE}/en/ticker?ticker=NVDA`, name: 'Command EN' },
    { url: `${BASE}/ja/ticker?ticker=NVDA`, name: 'Command JA' },
  ];

  for (const page of pages) {
    const r = await fetchHTML(page.url, page.name);
    const icon = !r.ok ? '❌' : r.elapsed < 800 ? '🟢' : r.elapsed < 2000 ? '🟡' : '🔴';
    const sizeKB = (r.size / 1024).toFixed(0);
    console.log(`  ${icon} ${page.name.padEnd(20)} ${r.elapsed}ms | ${sizeKB}KB | HTTP ${r.status || 'ERR'}`);

    results.layer4_page_speed.push({
      page: page.name, elapsed: r.elapsed, ok: r.ok, sizeKB: parseInt(sizeKB), status: r.status
    });

    if (!r.ok) results.errors.push(`PAGE_FAIL: ${page.name} — ${r.error || `HTTP ${r.status}`}`);
    if (r.ok && r.elapsed > 3000) results.optimizations.push(`SLOW_PAGE: ${page.name} (${r.elapsed}ms) — SSG 또는 ISR 적용 고려`);
  }

  const avgPage = results.layer4_page_speed.filter(r => r.ok).reduce((s, r) => s + r.elapsed, 0) / results.layer4_page_speed.filter(r => r.ok).length;
  console.log(`\n  📊 Average Page Load: ${avgPage.toFixed(0)}ms`);
}

// ══════════════════════════════════════════════════════════════
// LAYER 5: Redis Cache Verification (via API proxy)
// ══════════════════════════════════════════════════════════════
async function testLayer5_CacheVerification() {
  console.log('\n' + '═'.repeat(60));
  console.log('LAYER 5: CACHE & DATA FRESHNESS');
  console.log('═'.repeat(60));

  // Test cache by hitting the same endpoint twice — second should be faster
  for (const ticker of ['NVDA', 'AAPL']) {
    const r1 = await fetchJSON(`${BASE}/api/command/unified?t=${ticker}`, `${ticker}-cold`);
    await new Promise(r => setTimeout(r, 500));
    const r2 = await fetchJSON(`${BASE}/api/command/unified?t=${ticker}`, `${ticker}-warm`);

    const speedup = r1.elapsed > 0 ? ((r1.elapsed - r2.elapsed) / r1.elapsed * 100).toFixed(0) : 0;
    const icon = r2.elapsed < r1.elapsed ? '✅' : '⚠️';
    console.log(`  ${icon} ${ticker.padEnd(6)} Cold: ${r1.elapsed}ms → Warm: ${r2.elapsed}ms (${speedup}% faster)`);

    results.layer5_redis_cache.push({
      ticker, cold: r1.elapsed, warm: r2.elapsed, speedup: parseInt(speedup)
    });

    // Check data freshness — updatedAt field
    const data = r2.data?.[ticker] || r2.data?.data?.[ticker] || {};
    const updatedAt = data.updatedAt || data.lastUpdate || data.timestamp;
    if (updatedAt) {
      const age = (Date.now() - new Date(updatedAt).getTime()) / 1000 / 60;
      const freshIcon = age < 30 ? '🟢' : age < 120 ? '🟡' : '🔴';
      console.log(`    ${freshIcon} Data Age: ${age.toFixed(0)} min (updated: ${updatedAt})`);
      if (age > 120) results.warnings.push(`STALE_DATA: ${ticker} — ${age.toFixed(0)} min old`);
    }
  }

  // Batch endpoint speed test
  const batchTickers = CORE_TICKERS.join(',');
  const batchR = await fetchJSON(`${BASE}/api/dashboard/unified?tickers=${batchTickers}`, 'batch-10');
  console.log(`  📦 10-Ticker Batch: ${batchR.elapsed}ms ${batchR.ok ? 'OK' : 'FAIL'}`);
  if (batchR.ok && batchR.elapsed > 5000) {
    results.optimizations.push(`BATCH_SLOW: 10-ticker unified took ${batchR.elapsed}ms — pipeline 병렬화 필요`);
  }
}

// ══════════════════════════════════════════════════════════════
// FINAL REPORT
// ══════════════════════════════════════════════════════════════
function generateReport() {
  console.log('\n' + '█'.repeat(60));
  console.log('█  SIGNUM HQ — FULL STRESS TEST REPORT');
  console.log('█  ' + new Date().toISOString());
  console.log('█'.repeat(60));

  // API Speed Summary
  const apiOk = results.layer1_api_speed.filter(r => r.ok);
  const apiAvg = apiOk.length > 0 ? apiOk.reduce((s, r) => s + r.elapsed, 0) / apiOk.length : 0;
  const apiSlow = apiOk.filter(r => r.elapsed > 2000);
  console.log('\n📡 API SPEED:');
  console.log(`   Pass: ${apiOk.length}/${results.layer1_api_speed.length} | Avg: ${apiAvg.toFixed(0)}ms | Slow(>2s): ${apiSlow.length}`);

  // Data Integrity Summary
  const dataOk = results.layer2_data_integrity.filter(r => r.ok);
  const data100 = results.layer2_data_integrity.filter(r => r.missing?.length === 0);
  console.log('\n🔍 DATA INTEGRITY:');
  console.log(`   Complete: ${data100.length}/${results.layer2_data_integrity.length} | Acceptable: ${dataOk.length}/${results.layer2_data_integrity.length}`);

  // Cross-page Consistency
  const consistent = results.layer3_cross_page_consistency.filter(r => r.consistent);
  console.log('\n🔗 CROSS-PAGE CONSISTENCY:');
  console.log(`   Consistent: ${consistent.length}/${results.layer3_cross_page_consistency.length}`);

  // Page Speed Summary
  const pageOk = results.layer4_page_speed.filter(r => r.ok);
  const pageAvg = pageOk.length > 0 ? pageOk.reduce((s, r) => s + r.elapsed, 0) / pageOk.length : 0;
  const pageFast = pageOk.filter(r => r.elapsed < 1000);
  console.log('\n⚡ PAGE SPEED:');
  console.log(`   Pass: ${pageOk.length}/${results.layer4_page_speed.length} | Avg: ${pageAvg.toFixed(0)}ms | Fast(<1s): ${pageFast.length}`);

  // Errors
  if (results.errors.length > 0) {
    console.log('\n🚨 ERRORS (' + results.errors.length + '):');
    results.errors.forEach(e => console.log('   • ' + e));
  }

  // Warnings
  if (results.warnings.length > 0) {
    console.log('\n⚠️  WARNINGS (' + results.warnings.length + '):');
    results.warnings.forEach(w => console.log('   • ' + w));
  }

  // Optimization Recommendations
  if (results.optimizations.length > 0) {
    console.log('\n💡 OPTIMIZATIONS (' + results.optimizations.length + '):');
    results.optimizations.forEach(o => console.log('   • ' + o));
  }

  // Overall Grade
  const totalTests = results.layer1_api_speed.length + results.layer2_data_integrity.length +
    results.layer3_cross_page_consistency.length + results.layer4_page_speed.length;
  const totalPass = apiOk.length + dataOk.length + consistent.length + pageOk.length;
  const grade = totalPass / totalTests * 100;
  const gradeLabel = grade >= 95 ? 'A+' : grade >= 90 ? 'A' : grade >= 80 ? 'B' : grade >= 70 ? 'C' : 'D';

  console.log('\n' + '═'.repeat(60));
  console.log(`  OVERALL: ${gradeLabel} (${grade.toFixed(1)}%) — ${totalPass}/${totalTests} tests passed`);
  console.log(`  ERRORS: ${results.errors.length} | WARNINGS: ${results.warnings.length}`);
  console.log('═'.repeat(60));

  return results;
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  SIGNUM HQ — FULL-STACK STRESS TEST V2                 ║');
  console.log('║  AWS + Redis + Vercel + Data Integrity                 ║');
  console.log('║  Market Status: CLOSED (Pre-Market)                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  await testLayer1_ApiSpeed();
  await testLayer2_DataIntegrity();
  await testLayer3_CrossPageConsistency();
  await testLayer4_PageSpeed();
  await testLayer5_CacheVerification();

  const report = generateReport();

  // Save result to file
  const fs = require('fs');
  fs.writeFileSync('scripts/stress_test_v2_result.json', JSON.stringify(report, null, 2));
  console.log('\n📁 Full results saved to scripts/stress_test_v2_result.json');
}

main().catch(e => console.error('FATAL:', e));
