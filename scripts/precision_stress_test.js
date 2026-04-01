// ══════════════════════════════════════════════════════════════════════
// SIGNUM HQ — 8-Phase Precision Stress Test (Phase 1-6)
// 목적: AWS + Redis + Vercel 전방위 데이터 정합성 + 성능 + 파이프라인 검증
// ══════════════════════════════════════════════════════════════════════

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const BASE = 'https://www.signumhq.com';
const UNIVERSE = JSON.parse(fs.readFileSync('data/universe_500.json', 'utf-8')).symbols;
const CORE = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'AMD', 'CEG', 'PLTR'];
const SECONDARY = ['COP', 'UPS', 'MU', 'AVGO', 'INTC'];
const CORE_FIELDS = ['structure', 'analyst', 'fundamentals', 'earnings', 'sma', 'volatility', 'squeeze', 'institutional', 'related'];

// DynamoDB client
const dc = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
}), { marshallOptions: { removeUndefinedValues: true } });

const TABLES = {
  UNIFIED_CACHE: 'signum-unified-cache',
  GEX_HISTORY: 'signum-gex-history',
  RLSI_HISTORY: 'signum-rlsi-history',
  SECTOR_DAILY: 'signum-sector-daily',
  ALPHA_HISTORY: 'signum-alpha-history',
  FLOW_HISTORY: 'signum-flow-history',
  IV_SURFACE: 'signum-iv-surface',
  ECONOMIC_CALENDAR: 'signum-economic-calendar',
  PATTERN_DB: 'signum-pattern-db',
  BACKTEST: 'signum-backtest',
};

const report = {
  timestamp: new Date().toISOString(),
  phase1: { dynamo: {} },
  phase2: { redis: {} },
  phase3: { api: [], cron: [] },
  phase4: { integrity: [], sanity: [] },
  phase5: { pages: [], concurrent: [] },
  phase6: { e2e: null, unused: [] },
  errors: [],
  warnings: [],
  optimizations: [],
};

async function fetchJSON(url, label, timeout = 15000) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const elapsed = Date.now() - t0;
    if (!res.ok) return { data: null, elapsed, ok: false, error: `HTTP ${res.status}`, label, status: res.status };
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) return { data: null, elapsed, ok: true, error: 'NOT_JSON', label, status: res.status };
    const data = await res.json();
    return { data, elapsed, ok: true, label, status: res.status };
  } catch (e) {
    return { data: null, elapsed: Date.now() - t0, ok: false, error: e.name === 'AbortError' ? 'TIMEOUT' : e.message, label };
  }
}

async function fetchHTML(url, label, timeout = 15000) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const elapsed = Date.now() - t0;
    const html = await res.text();
    return { elapsed, ok: res.ok, size: html.length, status: res.status, label };
  } catch (e) {
    return { elapsed: Date.now() - t0, ok: false, error: e.name === 'AbortError' ? 'TIMEOUT' : e.message, label };
  }
}

function log(emoji, msg) { console.log(`  ${emoji} ${msg}`); }
function header(phase, title) {
  console.log('\n' + '═'.repeat(65));
  console.log(`  PHASE ${phase}: ${title}`);
  console.log('═'.repeat(65));
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 1: AWS DynamoDB 전수 감사
// ══════════════════════════════════════════════════════════════════════
async function phase1() {
  header(1, 'AWS DynamoDB 전수 감사');

  // 1-1: unified-cache 500종목 전수 확인
  console.log('\n  [1-1] unified-cache 500종목 전수 확인...');
  let found = 0, missing = [], fieldStats = { 9: 0, 8: 0, 7: 0, 6: 0, lt6: 0 };
  let stale = [], fresh = 0, totalAge = 0, priceCheck = [];
  const now = Date.now();

  for (let i = 0; i < UNIVERSE.length; i += 25) {
    const batch = UNIVERSE.slice(i, i + 25);
    const results = await Promise.all(batch.map(async (ticker) => {
      try {
        const r = await dc.send(new GetCommand({ TableName: TABLES.UNIFIED_CACHE, Key: { pk: ticker } }));
        return { ticker, item: r.Item || null };
      } catch { return { ticker, item: null }; }
    }));

    for (const { ticker, item } of results) {
      if (!item || !item.data) { missing.push(ticker); continue; }
      found++;
      const d = item.data;
      const fc = CORE_FIELDS.filter(f => !!d[f]).length;
      if (fc >= 9) fieldStats[9]++;
      else if (fc >= 8) fieldStats[8]++;
      else if (fc >= 7) fieldStats[7]++;
      else if (fc >= 6) fieldStats[6]++;
      else fieldStats.lt6++;

      // Freshness check
      const ts = item.timestamp || 0;
      const ageH = (now - ts) / 3600000;
      totalAge += ageH;
      if (ageH > 24) stale.push({ ticker, ageH: ageH.toFixed(1) });
      else fresh++;

      // Price sanity (from structure)
      const price = d.structure?.underlyingPrice || d.structure?.price;
      if (price) priceCheck.push({ ticker, price });
    }

    if ((i + 25) % 100 === 0 || i + 25 >= UNIVERSE.length)
      process.stdout.write(`    ...${Math.min(i + 25, UNIVERSE.length)}/${UNIVERSE.length}\r`);
  }
  console.log('');

  log('📊', `Found: ${found}/${UNIVERSE.length} | Missing: ${missing.length}`);
  log('📊', `9/9: ${fieldStats[9]} | 8/9: ${fieldStats[8]} | 7/9: ${fieldStats[7]} | 6/9: ${fieldStats[6]} | <6: ${fieldStats.lt6}`);
  log('📊', `Fresh(<24h): ${fresh} | Stale(>24h): ${stale.length} | Avg Age: ${(totalAge / found).toFixed(1)}h`);

  if (missing.length > 0 && missing.length <= 20) log('⚠️', `Missing: ${missing.join(', ')}`);
  if (missing.length > 20) log('⚠️', `Missing ${missing.length} tickers (first 20): ${missing.slice(0, 20).join(', ')}...`);
  if (stale.length > 0 && stale.length <= 10) log('⚠️', `Stale: ${stale.map(s => `${s.ticker}(${s.ageH}h)`).join(', ')}`);

  report.phase1.dynamo.unifiedCache = { found, total: UNIVERSE.length, missing: missing.length, missingList: missing.slice(0, 30), fieldStats, fresh, stale: stale.length, avgAgeH: +(totalAge / Math.max(found, 1)).toFixed(1) };
  if (missing.length > 10) report.errors.push(`DYNAMO: ${missing.length} tickers missing from unified-cache`);
  if (stale.length > 50) report.warnings.push(`DYNAMO: ${stale.length} tickers have stale data (>24h)`);

  // 1-2: Other tables existence check
  console.log('\n  [1-2] DynamoDB 보조 테이블 존재 확인...');
  const auxTables = [
    { name: TABLES.GEX_HISTORY, label: 'GEX History', ticker: 'NVDA' },
    { name: TABLES.RLSI_HISTORY, label: 'RLSI History', ticker: null },
    { name: TABLES.SECTOR_DAILY, label: 'Sector Daily', ticker: null },
    { name: TABLES.ALPHA_HISTORY, label: 'Alpha History', ticker: 'NVDA' },
    { name: TABLES.FLOW_HISTORY, label: 'Flow History', ticker: 'NVDA' },
  ];

  for (const t of auxTables) {
    try {
      const r = await dc.send(new ScanCommand({ TableName: t.name, Limit: 5 }));
      const count = r.Items?.length || 0;
      const icon = count > 0 ? '✅' : '❌';
      log(icon, `${t.label.padEnd(20)} ${count > 0 ? `${count}+ items` : 'EMPTY'}`);
      report.phase1.dynamo[t.label] = { exists: count > 0, sampleCount: count };
      if (count === 0) report.warnings.push(`DYNAMO_EMPTY: ${t.label} has no data`);
    } catch (e) {
      log('❌', `${t.label.padEnd(20)} ERROR: ${e.message}`);
      report.errors.push(`DYNAMO_FAIL: ${t.label} — ${e.message}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 2: Redis/Cache 심층 검증
// ══════════════════════════════════════════════════════════════════════
async function phase2() {
  header(2, 'Redis 캐시 심층 검증 (API 프록시)');

  // Redis cache health is tested through API response patterns
  // Test: cold vs warm, freshness metadata, cache hit patterns
  console.log('\n  [2-1] Cache Hit 패턴 검증 (5종목 × 2회)...');
  for (const ticker of ['NVDA', 'TSLA', 'AAPL', 'AMD', 'CEG']) {
    const r1 = await fetchJSON(`${BASE}/api/command/unified?t=${ticker}`, `cold-${ticker}`);
    const r2 = await fetchJSON(`${BASE}/api/command/unified?t=${ticker}`, `warm-${ticker}`);
    const src1 = r1.data?._source || 'unknown';
    const src2 = r2.data?._source || 'unknown';
    const fc1 = r1.data ? CORE_FIELDS.filter(f => !!r1.data[f]).length : 0;
    const age = r1.data?._ageMs ? (r1.data._ageMs / 60000).toFixed(1) : '?';
    const icon = fc1 >= 7 ? '✅' : fc1 >= 5 ? '⚠️' : '❌';
    log(icon, `${ticker.padEnd(6)} ${r1.elapsed}ms→${r2.elapsed}ms | ${src1}→${src2} | ${fc1}/9 fields | age:${age}min`);

    report.phase2.redis[ticker] = { cold: r1.elapsed, warm: r2.elapsed, source1: src1, source2: src2, fields: fc1, ageMin: age };
    if (fc1 < 5) report.errors.push(`REDIS_INCOMPLETE: ${ticker} only ${fc1}/9 fields`);
    if (fc1 >= 5 && fc1 < 7) report.warnings.push(`REDIS_PARTIAL: ${ticker} ${fc1}/9 fields`);
  }

  // 2-2: DynamoDB vs API data drift check
  console.log('\n  [2-2] DynamoDB↔API 데이터 드리프트 검사...');
  for (const ticker of ['NVDA', 'TSLA', 'AAPL']) {
    try {
      const dynR = await dc.send(new GetCommand({ TableName: TABLES.UNIFIED_CACHE, Key: { pk: ticker } }));
      const apiR = await fetchJSON(`${BASE}/api/command/unified?t=${ticker}`, `drift-${ticker}`);

      const dynPrice = dynR.Item?.data?.structure?.underlyingPrice;
      const apiPrice = apiR.data?.structure?.underlyingPrice;
      const dynGex = dynR.Item?.data?.structure?.netGex;
      const apiGex = apiR.data?.structure?.netGex;

      let driftIssue = false;
      if (dynPrice && apiPrice) {
        const priceDiff = Math.abs(dynPrice - apiPrice) / dynPrice * 100;
        if (priceDiff > 1) { driftIssue = true; report.warnings.push(`DRIFT: ${ticker} price DynamoDB=$${dynPrice} vs API=$${apiPrice} (${priceDiff.toFixed(2)}%)`); }
      }
      if (dynGex && apiGex && dynGex !== apiGex) {
        const gexDiff = Math.abs(dynGex - apiGex) / Math.abs(dynGex) * 100;
        if (gexDiff > 5) { driftIssue = true; report.warnings.push(`DRIFT: ${ticker} GEX DynamoDB=${dynGex} vs API=${apiGex}`); }
      }

      log(driftIssue ? '⚠️' : '✅', `${ticker.padEnd(6)} Price: DDB=$${dynPrice || 'N/A'} API=$${apiPrice || 'N/A'} | GEX: DDB=${dynGex || 'N/A'} API=${apiGex || 'N/A'}`);
    } catch (e) {
      log('❌', `${ticker} drift check failed: ${e.message}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 3: Vercel API 전수 테스트
// ══════════════════════════════════════════════════════════════════════
async function phase3() {
  header(3, 'Vercel API 전수 테스트 (33 엔드포인트)');

  const endpoints = [
    // Command
    { url: `${BASE}/api/command/unified?t=NVDA`, name: 'command/unified' },
    { url: `${BASE}/api/command/deep-analysis?t=NVDA`, name: 'command/deep-analysis', method: 'POST_ONLY' },
    // Dashboard
    { url: `${BASE}/api/dashboard/unified?tickers=NVDA,AAPL,TSLA`, name: 'dashboard/unified' },
    { url: `${BASE}/api/dashboard/signals`, name: 'dashboard/signals' },
    { url: `${BASE}/api/dashboard/daily-history`, name: 'dashboard/daily-history' },
    { url: `${BASE}/api/dashboard/alerts`, name: 'dashboard/alerts' },
    { url: `${BASE}/api/dashboard/preferences`, name: 'dashboard/preferences' },
    // Flow
    { url: `${BASE}/api/flow/unified?ticker=NVDA`, name: 'flow/unified' },
    { url: `${BASE}/api/flow/realtime-metrics?ticker=NVDA`, name: 'flow/realtime-metrics' },
    { url: `${BASE}/api/flow/enhanced-metrics?ticker=NVDA`, name: 'flow/enhanced-metrics' },
    { url: `${BASE}/api/flow/iv-percentile?ticker=NVDA`, name: 'flow/iv-percentile' },
    { url: `${BASE}/api/flow/dark-pool-trades?ticker=NVDA`, name: 'flow/dark-pool-trades' },
    // Guardian
    { url: `${BASE}/api/guardian/briefing?locale=ko`, name: 'guardian/briefing' },
    { url: `${BASE}/api/guardian/history`, name: 'guardian/history' },
    { url: `${BASE}/api/guardian/fedwatch`, name: 'guardian/fedwatch' },
    { url: `${BASE}/api/guardian/economic-calendar`, name: 'guardian/economic-calendar' },
    { url: `${BASE}/api/guardian/news-digest`, name: 'guardian/news-digest' },
    // Intel
    { url: `${BASE}/api/intel/m7`, name: 'intel/m7' },
    { url: `${BASE}/api/intel/quantumedge`, name: 'intel/quantumedge' },
    { url: `${BASE}/api/intel/physicalai`, name: 'intel/physicalai' },
    { url: `${BASE}/api/intel/powermatrix`, name: 'intel/powermatrix' },
    { url: `${BASE}/api/intel/snapshot?sector=m7`, name: 'intel/snapshot' },
    { url: `${BASE}/api/intel/fast`, name: 'intel/fast' },
    { url: `${BASE}/api/intel/cross-sector-brief`, name: 'intel/cross-sector-brief' },
    // Market
    { url: `${BASE}/api/market/macro`, name: 'market/macro' },
    { url: `${BASE}/api/market/status`, name: 'market/status' },
    { url: `${BASE}/api/market/index-close`, name: 'market/index-close' },
    // Watchlist / Portfolio
    { url: `${BASE}/api/watchlist/batch?tickers=NVDA,AAPL,TSLA`, name: 'watchlist/batch' },
    { url: `${BASE}/api/portfolio/batch?tickers=NVDA`, name: 'portfolio/batch' },
    // Other
    { url: `${BASE}/api/sparkline?ticker=NVDA`, name: 'sparkline' },
    { url: `${BASE}/api/exchange-rates`, name: 'exchange-rates' },
    { url: `${BASE}/api/tickers/search?q=NVD`, name: 'tickers/search' },
  ];

  let pass = 0, fail = 0;
  for (const ep of endpoints) {
    if (ep.method === 'POST_ONLY') {
      log('⏭️', `${ep.name.padEnd(30)} POST-only endpoint (skip GET)`);
      continue;
    }
    const r = await fetchJSON(ep.url, ep.name);
    const icon = !r.ok ? '❌' : r.elapsed < 500 ? '🟢' : r.elapsed < 2000 ? '🟡' : '🔴';
    const hasData = r.data && (typeof r.data === 'object') && Object.keys(r.data).length > 0;
    log(icon, `${ep.name.padEnd(30)} ${String(r.elapsed).padStart(6)}ms ${r.ok ? 'OK' : 'FAIL'} ${hasData ? `(${Object.keys(r.data).length} keys)` : `(${r.error || 'empty'})`}`);

    report.phase3.api.push({ name: ep.name, elapsed: r.elapsed, ok: r.ok, error: r.error, keys: hasData ? Object.keys(r.data).length : 0 });
    if (r.ok) pass++; else fail++;
    if (!r.ok) report.errors.push(`API_FAIL: ${ep.name} — ${r.error}`);
    if (r.ok && r.elapsed > 3000) report.warnings.push(`API_SLOW: ${ep.name} took ${r.elapsed}ms`);
  }

  log('📊', `API Pass: ${pass}/${pass + fail} | Fail: ${fail}`);

  // 3-2: Language consistency (ko vs en vs ja)
  console.log('\n  [3-2] 다국어 데이터 일치성 검사 (NVDA)...');
  const langs = ['ko', 'en', 'ja'];
  const langResults = {};
  for (const lang of langs) {
    const r = await fetchJSON(`${BASE}/api/command/unified?t=NVDA&lang=${lang}`, `lang-${lang}`);
    langResults[lang] = {
      price: r.data?.structure?.underlyingPrice,
      gex: r.data?.structure?.netGex,
      maxPain: r.data?.structure?.maxPain,
      score: r.data?.fundamentals?.score,
    };
  }
  const refPrice = langResults.ko?.price;
  let langMatch = true;
  for (const lang of langs) {
    const d = langResults[lang];
    const match = d.price === refPrice;
    if (!match) langMatch = false;
    log(match ? '✅' : '❌', `${lang}: price=$${d.price} gex=${d.gex} maxPain=${d.maxPain} score=${d.score}`);
  }
  if (!langMatch) report.errors.push('LANG_MISMATCH: Price differs across ko/en/ja');
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 4: 데이터 정합성 Deep Dive
// ══════════════════════════════════════════════════════════════════════
async function phase4() {
  header(4, '데이터 정합성 Deep Dive (15종목 × 20필드)');

  const tickers = [...CORE, ...SECONDARY];
  let totalPoints = 0, validPoints = 0, nullPoints = 0, anomalies = [];

  for (const ticker of tickers) {
    const r = await fetchJSON(`${BASE}/api/command/unified?t=${ticker}`, ticker);
    if (!r.ok || !r.data) {
      log('❌', `${ticker} — API failed`);
      report.phase4.integrity.push({ ticker, ok: false });
      continue;
    }

    const d = r.data;
    const s = d.structure || {};
    const f = d.fundamentals || {};
    const v = d.volatility || {};
    const sq = d.squeeze || {};
    const inst = d.institutional || {};
    const smaD = d.sma || {};
    const price = s.underlyingPrice || s.price || 0;

    const checks = [
      { name: 'price', val: price, min: 1, max: 5000 },
      { name: 'netGex', val: s.netGex, type: 'number' },
      { name: 'maxPain', val: s.maxPain, min: price * 0.7, max: price * 1.3, skip: !price },
      { name: 'callWall', val: s.levels?.callWall, min: price * 0.9, max: price * 1.5, skip: !price },
      { name: 'putFloor', val: s.levels?.putFloor, min: price * 0.5, max: price * 1.1, skip: !price },
      { name: 'pcRatio', val: s.pcRatio, min: 0.1, max: 5.0 },
      { name: 'gammaFlip', val: s.gammaFlipLevel, min: price * 0.7, max: price * 1.3, skip: !price },
      { name: 'fund.score', val: f.score, min: 0, max: 100 },
      { name: 'fund.PE', val: f.pe || f.PE, min: 0, max: 500 },
      { name: 'fund.name', val: f.name, type: 'string' },
      { name: 'vol.regime', val: v.regime, type: 'string' },
      { name: 'vol.iv', val: v.iv, min: 0, max: 300 },
      { name: 'sma50', val: smaD.sma50, min: price * 0.5, max: price * 1.5, skip: !price },
      { name: 'sma200', val: smaD.sma200, min: price * 0.3, max: price * 1.7, skip: !price },
      { name: 'squeeze.si%', val: sq.siPercent, min: 0, max: 100 },
      { name: 'squeeze.shortVol%', val: sq.shortVolPercent, min: 0, max: 100 },
      { name: 'inst.darkPool%', val: inst.darkPool?.percent, min: 5, max: 90 },
      { name: 'analyst.total', val: d.analyst?.totalAnalysts, min: 0, max: 100 },
      { name: 'earnings.next', val: d.earnings?.nextEarningsDate, type: 'string' },
      { name: 'related.count', val: d.related?.count || d.related?.relatedTickers?.length, min: 0, max: 50 },
    ];

    let ok = 0, nullC = 0, anomC = 0;
    for (const c of checks) {
      totalPoints++;
      if (c.val === undefined || c.val === null) { nullC++; nullPoints++; continue; }
      if (c.type === 'string') { if (typeof c.val === 'string' && c.val.length > 0) { ok++; validPoints++; } else { nullC++; nullPoints++; } continue; }
      if (c.type === 'number') { if (typeof c.val === 'number' && !isNaN(c.val)) { ok++; validPoints++; } else { anomC++; anomalies.push(`${ticker}.${c.name}=${c.val}`); } continue; }
      if (c.skip) { ok++; validPoints++; continue; }
      if (typeof c.val === 'number' && c.val >= c.min && c.val <= c.max) { ok++; validPoints++; }
      else { anomC++; anomalies.push(`${ticker}.${c.name}=${c.val} (expected ${c.min?.toFixed?.(0) || '?'}~${c.max?.toFixed?.(0) || '?'})`); }
    }

    const icon = anomC === 0 && nullC <= 5 ? '✅' : anomC > 0 ? '⚠️' : '🟡';
    log(icon, `${ticker.padEnd(6)} ${ok}✅ ${nullC}⬜ ${anomC}🔴 price=$${price || 'N/A'} [${r.elapsed}ms]`);
    report.phase4.integrity.push({ ticker, ok: ok, null: nullC, anomaly: anomC, price, elapsed: r.elapsed });
  }

  const nullPct = (nullPoints / totalPoints * 100).toFixed(1);
  log('📊', `Total: ${totalPoints} points | Valid: ${validPoints} | Null: ${nullPoints} (${nullPct}%) | Anomalies: ${anomalies.length}`);
  if (anomalies.length > 0) {
    log('⚠️', 'Anomalies:');
    anomalies.slice(0, 15).forEach(a => log('  ', a));
    anomalies.forEach(a => report.warnings.push(`ANOMALY: ${a}`));
  }
  report.phase4.sanity = { totalPoints, validPoints, nullPoints, nullPct, anomalyCount: anomalies.length, anomalies: anomalies.slice(0, 30) };
  if (parseFloat(nullPct) > 20) report.errors.push(`HIGH_NULL: ${nullPct}% of data points are null`);
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 5: 성능 스트레스
// ══════════════════════════════════════════════════════════════════════
async function phase5() {
  header(5, '성능 스트레스 (12페이지 × 3회 + 동시부하)');

  const pages = [
    { url: `${BASE}/ko`, name: 'Home' },
    { url: `${BASE}/ko/dashboard`, name: 'Dashboard' },
    { url: `${BASE}/ko/ticker?ticker=NVDA`, name: 'Command' },
    { url: `${BASE}/ko/ticker?ticker=TSLA`, name: 'Cmd(TSLA)' },
    { url: `${BASE}/ko/intel-guardian`, name: 'Guardian' },
    { url: `${BASE}/ko/flow?ticker=NVDA`, name: 'Flow' },
    { url: `${BASE}/ko/intel`, name: 'Intel' },
    { url: `${BASE}/ko/portfolio`, name: 'Portfolio' },
    { url: `${BASE}/ko/watchlist`, name: 'Watchlist' },
    { url: `${BASE}/ko/pricing`, name: 'Pricing' },
    { url: `${BASE}/en/ticker?ticker=NVDA`, name: 'Cmd(EN)' },
    { url: `${BASE}/ja/ticker?ticker=NVDA`, name: 'Cmd(JA)' },
  ];

  // 5-1: 3회 반복 측정
  console.log('\n  [5-1] 12 페이지 × 3회 반복 (p50/p95)...');
  const timings = {};
  for (const p of pages) timings[p.name] = [];

  for (let round = 0; round < 3; round++) {
    for (const p of pages) {
      const r = await fetchHTML(p.url, p.name);
      timings[p.name].push(r.elapsed);
    }
  }

  for (const p of pages) {
    const sorted = timings[p.name].sort((a, b) => a - b);
    const p50 = sorted[1]; // median of 3
    const p95 = sorted[2]; // max of 3
    const avg = (sorted.reduce((s, v) => s + v, 0) / 3).toFixed(0);
    const icon = p95 < 800 ? '🟢' : p95 < 2000 ? '🟡' : '🔴';
    log(icon, `${p.name.padEnd(12)} p50:${String(p50).padStart(5)}ms | p95:${String(p95).padStart(5)}ms | avg:${String(avg).padStart(5)}ms`);
    report.phase5.pages.push({ name: p.name, p50, p95, avg: +avg, times: sorted });
  }

  const allP50 = report.phase5.pages.map(p => p.p50);
  const allP95 = report.phase5.pages.map(p => p.p95);
  log('📊', `Global p50: ${Math.round(allP50.reduce((s, v) => s + v, 0) / allP50.length)}ms | p95: ${Math.max(...allP95)}ms`);
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 6: 파이프라인 E2E + 크로스엔드포인트
// ══════════════════════════════════════════════════════════════════════
async function phase6() {
  header(6, '파이프라인 E2E 추적 + 크로스 정합성');

  // 6-1: NVDA E2E trace
  console.log('\n  [6-1] NVDA 전체 파이프라인 추적...');

  // DynamoDB
  const dynR = await dc.send(new GetCommand({ TableName: TABLES.UNIFIED_CACHE, Key: { pk: 'NVDA' } }));
  const dynData = dynR.Item?.data;
  const dynPrice = dynData?.structure?.underlyingPrice;
  const dynGex = dynData?.structure?.netGex;
  const dynTs = dynR.Item?.timestamp;
  log('📦', `DynamoDB: price=$${dynPrice} gex=${dynGex} ts=${dynTs ? new Date(dynTs).toISOString() : 'N/A'}`);

  // API (Command)
  const cmdR = await fetchJSON(`${BASE}/api/command/unified?t=NVDA`, 'e2e-cmd');
  const cmdPrice = cmdR.data?.structure?.underlyingPrice;
  const cmdGex = cmdR.data?.structure?.netGex;
  const cmdSrc = cmdR.data?._source;
  log('🌐', `API(Cmd): price=$${cmdPrice} gex=${cmdGex} source=${cmdSrc} [${cmdR.elapsed}ms]`);

  // API (Dashboard)
  const dashR = await fetchJSON(`${BASE}/api/dashboard/unified?tickers=NVDA`, 'e2e-dash');
  const dashData = dashR.data?.NVDA || dashR.data?.data?.NVDA || {};
  const dashPrice = dashData.price || dashData.underlyingPrice;
  log('📊', `API(Dash): price=$${dashPrice} [${dashR.elapsed}ms]`);

  // API (Flow)
  const flowR = await fetchJSON(`${BASE}/api/flow/unified?ticker=NVDA`, 'e2e-flow');
  const flowPrice = flowR.data?.underlyingPrice || flowR.data?.data?.underlyingPrice;
  log('🌊', `API(Flow): price=$${flowPrice} [${flowR.elapsed}ms]`);

  // Cross-check
  const prices = [dynPrice, cmdPrice, dashPrice, flowPrice].filter(p => p != null);
  if (prices.length >= 2) {
    const max = Math.max(...prices), min = Math.min(...prices);
    const drift = max > 0 ? ((max - min) / max * 100) : 0;
    const icon = drift < 0.5 ? '✅' : drift < 2 ? '⚠️' : '❌';
    log(icon, `Cross-check: 4-layer drift = ${drift.toFixed(3)}%`);
    if (drift > 2) report.errors.push(`E2E_DRIFT: NVDA 4-layer price drift ${drift.toFixed(3)}%`);
    report.phase6.e2e = { dynPrice, cmdPrice, dashPrice, flowPrice, drift: +drift.toFixed(3) };
  }

  // 6-2: Cross-endpoint consistency for 5 tickers
  console.log('\n  [6-2] 크로스 엔드포인트 정합성 (5종목)...');
  for (const ticker of ['NVDA', 'TSLA', 'AAPL', 'META', 'AMD']) {
    const cmd = await fetchJSON(`${BASE}/api/command/unified?t=${ticker}`, `cross-cmd-${ticker}`);
    const dash = await fetchJSON(`${BASE}/api/dashboard/unified?tickers=${ticker}`, `cross-dash-${ticker}`);

    const cmdP = cmd.data?.structure?.underlyingPrice;
    const dashD = dash.data?.[ticker] || dash.data?.data?.[ticker] || {};
    const dashP = dashD.price || dashD.underlyingPrice;

    if (cmdP && dashP) {
      const diff = Math.abs(cmdP - dashP) / cmdP * 100;
      const icon = diff < 0.5 ? '✅' : '⚠️';
      log(icon, `${ticker.padEnd(6)} Cmd=$${cmdP} Dash=$${dashP} diff=${diff.toFixed(3)}%`);
    } else {
      log('⬜', `${ticker.padEnd(6)} Cmd=$${cmdP || 'N/A'} Dash=$${dashP || 'N/A'}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// PHASE 8: 다중 사용자 동시접속 시뮬레이션
// ══════════════════════════════════════════════════════════════════════
async function phase8() {
  header(8, '다중 사용자 동시접속 시뮬레이션');

  const TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'META', 'AMD', 'GOOGL', 'CEG', 'PLTR', 'MU', 'AVGO', 'INTC', 'CRM', 'NFLX'];
  const PAGE_TEMPLATES = [
    t => `${BASE}/ko/ticker?ticker=${t}`,
    t => `${BASE}/ko/flow?ticker=${t}`,
    t => `${BASE}/ko/dashboard`,
    t => `${BASE}/ko/intel-guardian`,
    t => `${BASE}/ko/intel`,
    t => `${BASE}/ko`,
  ];

  async function runScenario(name, concurrency) {
    console.log(`\n  [8] ${name} — ${concurrency}명 동시 접속...`);
    const requests = Array(concurrency).fill(null).map((_, i) => {
      const ticker = TICKERS[i % TICKERS.length];
      const pageFn = PAGE_TEMPLATES[i % PAGE_TEMPLATES.length];
      const url = pageFn(ticker);
      return fetchHTML(url, `user-${i}`);
    });

    const t0 = Date.now();
    const results = await Promise.all(requests);
    const totalTime = Date.now() - t0;

    const times = results.map(r => r.elapsed).sort((a, b) => a - b);
    const errors = results.filter(r => !r.ok);
    const timeouts = results.filter(r => r.elapsed > 10000);

    const p50 = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const p99 = times[Math.floor(times.length * 0.99)];
    const avg = Math.round(times.reduce((s, v) => s + v, 0) / times.length);

    const icon = errors.length > 0 ? '❌' : p95 < 2000 ? '🟢' : p95 < 5000 ? '🟡' : '🔴';
    log(icon, `${name}: p50=${p50}ms p95=${p95}ms p99=${p99}ms avg=${avg}ms | total=${totalTime}ms`);
    log('  ', `Errors: ${errors.length}/${concurrency} | Timeouts(>10s): ${timeouts.length}`);

    report.phase5.concurrent.push({ name, concurrency, p50, p95, p99, avg, totalTime, errors: errors.length, timeouts: timeouts.length });
    if (errors.length > 0) report.errors.push(`CONCURRENT_FAIL: ${name} — ${errors.length}/${concurrency} errors`);
    if (p95 > 5000) report.warnings.push(`CONCURRENT_SLOW: ${name} p95=${p95}ms`);
    return { p50, p95, p99, avg, errors: errors.length };
  }

  const s1 = await runScenario('Normal (10명)', 10);
  await new Promise(r => setTimeout(r, 5000)); // 5s cooldown
  const s2 = await runScenario('Peak (30명)', 30);
  await new Promise(r => setTimeout(r, 5000)); // 5s cooldown
  const s3 = await runScenario('Spike (50명)', 50);

  // Degradation analysis
  console.log('\n  [8-4] 부하 증가에 따른 성능 저하 분석...');
  if (s1.p50 > 0) {
    const deg30 = ((s2.p50 - s1.p50) / s1.p50 * 100).toFixed(1);
    const deg50 = ((s3.p50 - s1.p50) / s1.p50 * 100).toFixed(1);
    log('📊', `10→30명: p50 ${deg30}% 변화 | 10→50명: p50 ${deg50}% 변화`);
    if (parseFloat(deg50) > 100) report.warnings.push(`PERF_DEGRADE: 50-user p50 is ${deg50}% slower than 10-user`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ══════════════════════════════════════════════════════════════════════
function generateFinalReport() {
  console.log('\n' + '█'.repeat(65));
  console.log('█  SIGNUM HQ — 8-PHASE PRECISION STRESS TEST REPORT');
  console.log('█  ' + new Date().toISOString());
  console.log('█'.repeat(65));

  // Phase 1 Summary
  const dyn = report.phase1.dynamo.unifiedCache || {};
  console.log('\n📦 PHASE 1 — AWS DynamoDB:');
  console.log(`   Unified Cache: ${dyn.found || 0}/${dyn.total || 0} tickers | ${dyn.fieldStats?.[9] || 0} perfect(9/9) | Missing: ${dyn.missing || 0}`);
  console.log(`   Freshness: ${dyn.fresh || 0} fresh | ${dyn.stale || 0} stale | Avg: ${dyn.avgAgeH || '?'}h`);

  // Phase 2 Summary
  console.log('\n💾 PHASE 2 — Redis Cache:');
  const rKeys = Object.keys(report.phase2.redis);
  const rAvgCold = rKeys.length > 0 ? Math.round(rKeys.reduce((s, k) => s + report.phase2.redis[k].cold, 0) / rKeys.length) : 0;
  const rAvgWarm = rKeys.length > 0 ? Math.round(rKeys.reduce((s, k) => s + report.phase2.redis[k].warm, 0) / rKeys.length) : 0;
  console.log(`   Avg Cold: ${rAvgCold}ms → Warm: ${rAvgWarm}ms | Cache speedup: ${rAvgCold > 0 ? ((rAvgCold - rAvgWarm) / rAvgCold * 100).toFixed(0) : 0}%`);

  // Phase 3 Summary
  const apiPass = report.phase3.api.filter(a => a.ok).length;
  const apiTotal = report.phase3.api.length;
  console.log('\n🌐 PHASE 3 — Vercel API:');
  console.log(`   Pass: ${apiPass}/${apiTotal} | Avg: ${Math.round(report.phase3.api.filter(a => a.ok).reduce((s, a) => s + a.elapsed, 0) / Math.max(apiPass, 1))}ms`);

  // Phase 4 Summary
  const san = report.phase4.sanity || {};
  console.log('\n🔍 PHASE 4 — Data Integrity:');
  console.log(`   Points: ${san.totalPoints || 0} | Valid: ${san.validPoints || 0} | Null: ${san.nullPoints || 0} (${san.nullPct || 0}%) | Anomalies: ${san.anomalyCount || 0}`);

  // Phase 5 Summary
  const p5 = report.phase5.pages;
  const globalAvg = p5.length > 0 ? Math.round(p5.reduce((s, p) => s + p.avg, 0) / p5.length) : 0;
  console.log('\n⚡ PHASE 5 — Page Speed:');
  console.log(`   12 pages × 3 runs | Global avg: ${globalAvg}ms | Max p95: ${p5.length > 0 ? Math.max(...p5.map(p => p.p95)) : 0}ms`);

  // Phase 8 Summary
  console.log('\n👥 PHASE 8 — Multi-User:');
  for (const c of report.phase5.concurrent) {
    console.log(`   ${c.name}: p50=${c.p50}ms p95=${c.p95}ms p99=${c.p99}ms errors=${c.errors}/${c.concurrency}`);
  }

  // All Errors
  if (report.errors.length > 0) {
    console.log(`\n🚨 ERRORS (${report.errors.length}):`);
    report.errors.forEach(e => console.log(`   • ${e}`));
  }
  if (report.warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${report.warnings.length}):`);
    report.warnings.forEach(w => console.log(`   • ${w}`));
  }
  if (report.optimizations.length > 0) {
    console.log(`\n💡 OPTIMIZATIONS (${report.optimizations.length}):`);
    report.optimizations.forEach(o => console.log(`   • ${o}`));
  }

  // Grade
  const totalTests = (dyn.total || 0) + apiTotal + (san.totalPoints || 0) + p5.length * 3;
  const totalPass = (dyn.found || 0) + apiPass + (san.validPoints || 0) + p5.filter(p => p.p95 < 2000).length * 3;
  const grade = totalTests > 0 ? (totalPass / totalTests * 100) : 0;
  const label = grade >= 95 ? 'A+' : grade >= 90 ? 'A' : grade >= 85 ? 'A-' : grade >= 80 ? 'B+' : grade >= 75 ? 'B' : grade >= 70 ? 'C' : 'D';

  console.log('\n' + '═'.repeat(65));
  console.log(`  OVERALL: ${label} (${grade.toFixed(1)}%) — ${totalPass}/${totalTests}`);
  console.log(`  ERRORS: ${report.errors.length} | WARNINGS: ${report.warnings.length}`);
  console.log('═'.repeat(65));
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  SIGNUM HQ — 8-PHASE PRECISION STRESS TEST                 ║');
  console.log('║  AWS DynamoDB + Redis + Vercel + Data Integrity + Perf      ║');
  console.log('║  Time: ' + new Date().toISOString().padEnd(53) + '║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  await phase1();
  await phase2();
  await phase3();
  await phase4();
  await phase5();
  await phase6();
  await phase8();

  generateFinalReport();

  fs.writeFileSync('scripts/precision_stress_result.json', JSON.stringify(report, null, 2));
  console.log('\n📁 Full report: scripts/precision_stress_result.json');
}

main().catch(e => console.error('FATAL:', e));
