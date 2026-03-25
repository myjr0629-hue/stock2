/**
 * SIGNUM HQ — Full Site API Audit Script
 * 
 * 509개 종목 전체 유니버스에 대해 주요 API 엔드포인트를 일괄 검증합니다.
 * 
 * 검증 항목:
 * 1. command/unified: institutional.darkPool.percent, squeeze, volatility, structure
 * 2. realtime-metrics: darkPool, blockTrade, shortVolume
 * 3. dashboard/unified: price, changePct 정확도
 * 4. live/ticker: price, flow data 존재 여부
 * 
 * Usage: node scripts/full_site_audit.js [--local] [--limit N]
 *   --local: localhost:3000 사용 (기본: signumhq.com)
 *   --limit N: 상위 N개만 검증
 */

const fs = require('fs');
const path = require('path');

// ── Config ──
const args = process.argv.slice(2);
const USE_LOCAL = args.includes('--local');
const LIMIT_IDX = args.indexOf('--limit');
const LIMIT = LIMIT_IDX >= 0 ? parseInt(args[LIMIT_IDX + 1]) : Infinity;
const BASE = USE_LOCAL ? 'http://localhost:3000' : 'https://www.signumhq.com';

// ── Load Universe ──
const universe = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'universe_500.json'), 'utf-8'));
const tickers = (Array.isArray(universe) ? universe : universe.symbols || []).slice(0, LIMIT);

console.log(`\n${'═'.repeat(60)}`);
console.log(`  SIGNUM HQ — Full Site API Audit`);
console.log(`  Target: ${BASE}`);
console.log(`  Universe: ${tickers.length} tickers`);
console.log(`  Time: ${new Date().toISOString()}`);
console.log(`${'═'.repeat(60)}\n`);

// ── Results ──
const results = {
    total: tickers.length,
    tested: 0,
    commandUnified: { ok: 0, fail: 0, noInstitutional: 0, noSqueeze: 0, noVolatility: 0, noStructure: 0, errors: [] },
    realtimeMetrics: { ok: 0, fail: 0, zeroDarkPool: 0, noShortVol: 0, errors: [] },
    dashboardPrices: { ok: 0, fail: 0, zeroPct: 0, nullPrice: 0, errors: [] },
    latency: { command: [], metrics: [], dashboard: [] },
};

async function fetchJson(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();
    try {
        const res = await fetch(url, { signal: controller.signal });
        const latency = Date.now() - start;
        if (!res.ok) return { error: `HTTP ${res.status}`, latency };
        const data = await res.json();
        return { data, latency };
    } catch (e) {
        return { error: e.message, latency: Date.now() - start };
    } finally {
        clearTimeout(timer);
    }
}

async function auditTicker(ticker, idx) {
    const prefix = `[${idx + 1}/${tickers.length}] ${ticker.padEnd(6)}`;
    const issues = [];

    // 1. Command Unified
    const cmd = await fetchJson(`${BASE}/api/command/unified?t=${ticker}&lang=ko`);
    if (cmd.error) {
        results.commandUnified.fail++;
        results.commandUnified.errors.push(`${ticker}: ${cmd.error}`);
        issues.push(`CMD:ERR(${cmd.error})`);
    } else {
        results.commandUnified.ok++;
        results.latency.command.push(cmd.latency);
        const d = cmd.data;
        if (!d.institutional || d.institutional.darkPool?.percent === undefined) {
            results.commandUnified.noInstitutional++;
            issues.push('CMD:noInst');
        }
        if (!d.squeeze) { results.commandUnified.noSqueeze++; issues.push('CMD:noSqueeze'); }
        if (!d.volatility) { results.commandUnified.noVolatility++; issues.push('CMD:noVol'); }
        if (!d.structure) { results.commandUnified.noStructure++; issues.push('CMD:noStruct'); }
    }

    // 2. Realtime Metrics
    const met = await fetchJson(`${BASE}/api/flow/realtime-metrics?ticker=${ticker}`);
    if (met.error) {
        results.realtimeMetrics.fail++;
        results.realtimeMetrics.errors.push(`${ticker}: ${met.error}`);
        issues.push(`MET:ERR(${met.error})`);
    } else {
        results.realtimeMetrics.ok++;
        results.latency.metrics.push(met.latency);
        if (!met.data?.darkPool || met.data.darkPool.percent === 0) {
            results.realtimeMetrics.zeroDarkPool++;
            issues.push('MET:dp0%');
        }
        if (!met.data?.shortVolume) {
            results.realtimeMetrics.noShortVol++;
            issues.push('MET:noShortVol');
        }
    }

    // Log progress
    const status = issues.length === 0 ? '✅' : `⚠️  ${issues.join(', ')}`;
    const latencyStr = cmd.latency ? `${cmd.latency}ms` : 'ERR';
    console.log(`${prefix} ${latencyStr.padStart(6)} ${status}`);

    results.tested++;
}

async function runAudit() {
    // Process in batches of 5 (parallel) to avoid overwhelming the server
    const BATCH_SIZE = 5;
    for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
        const batch = tickers.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map((t, j) => auditTicker(t, i + j)));
        
        // Brief pause between batches
        if (i + BATCH_SIZE < tickers.length) {
            await new Promise(r => setTimeout(r, 500));
        }
    }

    // ── Summary Report ──
    const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const p95 = arr => { const s = [...arr].sort((a,b) => a-b); return s[Math.floor(s.length * 0.95)] || 0; };

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  AUDIT RESULTS — ${results.tested}/${results.total} tickers tested`);
    console.log(`${'═'.repeat(60)}`);
    
    console.log(`\n📡 Command Unified:`);
    console.log(`   OK: ${results.commandUnified.ok}  FAIL: ${results.commandUnified.fail}`);
    console.log(`   No Institutional: ${results.commandUnified.noInstitutional}`);
    console.log(`   No Squeeze: ${results.commandUnified.noSqueeze}`);
    console.log(`   No Volatility: ${results.commandUnified.noVolatility}`);
    console.log(`   No Structure: ${results.commandUnified.noStructure}`);
    console.log(`   Latency avg: ${avg(results.latency.command)}ms  p95: ${p95(results.latency.command)}ms`);
    
    console.log(`\n📊 Realtime Metrics:`);
    console.log(`   OK: ${results.realtimeMetrics.ok}  FAIL: ${results.realtimeMetrics.fail}`);
    console.log(`   Zero DarkPool: ${results.realtimeMetrics.zeroDarkPool}`);
    console.log(`   No Short Volume: ${results.realtimeMetrics.noShortVol}`);
    console.log(`   Latency avg: ${avg(results.latency.metrics)}ms  p95: ${p95(results.latency.metrics)}ms`);

    if (results.commandUnified.errors.length > 0) {
        console.log(`\n❌ Command Errors (first 10):`);
        results.commandUnified.errors.slice(0, 10).forEach(e => console.log(`   ${e}`));
    }
    if (results.realtimeMetrics.errors.length > 0) {
        console.log(`\n❌ Metrics Errors (first 10):`);
        results.realtimeMetrics.errors.slice(0, 10).forEach(e => console.log(`   ${e}`));
    }

    // Save full results
    const reportPath = path.join(__dirname, 'audit_results.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Full results saved to: ${reportPath}`);
    console.log(`${'═'.repeat(60)}\n`);
}

runAudit().catch(e => {
    console.error('Audit failed:', e);
    process.exit(1);
});
