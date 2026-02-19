/**
 * 주간만기 필터링 A/B 테스트
 * 전체 체인 vs 주간만기만으로 GEX/Walls/PCR/Squeeze 비교
 * Usage: npx tsx scripts/verify-weekly-filter.ts
 */

// Use internal functions directly
import { getOptionsData } from '../src/services/stockApi';
import { computeIVSkew, computeImpliedMovePct } from '../src/services/alphaEngine';

const TICKERS = ['NVDA', 'AAPL', 'TSLA', 'PONY'];

function findWeeklyExpiry(contracts: any[]): string | null {
    const now = new Date();
    const exps = [...new Set(contracts.map((c: any) => c.expiry).filter(Boolean))].sort();

    // Skip 0DTE (today/tomorrow), find first weekly (D+2 ~ D+7)
    for (const exp of exps) {
        const daysOut = Math.ceil((new Date(exp).getTime() - now.getTime()) / 86400000);
        if (daysOut >= 2 && daysOut <= 7) return exp; // weekly
    }
    // Fallback: nearest monthly or any expiry > 1 day
    for (const exp of exps) {
        const daysOut = Math.ceil((new Date(exp).getTime() - now.getTime()) / 86400000);
        if (daysOut >= 2) return exp;
    }
    return exps[0] || null;
}

// Recompute key metrics from filtered contracts
function computeMetrics(contracts: any[], spot: number) {
    let totalCallOI = 0, totalPutOI = 0, totalGex = 0;
    let maxCallOI = 0, maxPutOI = 0;
    let callWall = 0, putFloor = 0;

    for (const c of contracts) {
        const oi = c.open_interest || 0;
        const gamma = c.greeks?.gamma || 0;
        const strike = c.strike_price || 0;

        if (c.contract_type === 'call') {
            totalCallOI += oi;
            const contribution = oi * gamma * spot * spot * 0.01;
            totalGex += contribution;
            if (oi > maxCallOI) { maxCallOI = oi; callWall = strike; }
        } else if (c.contract_type === 'put') {
            totalPutOI += oi;
            const contribution = -(oi * gamma * spot * spot * 0.01);
            totalGex += contribution;
            if (oi > maxPutOI) { maxPutOI = oi; putFloor = strike; }
        }
    }

    const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 1;
    return { totalGex: Math.round(totalGex), callWall, putFloor, pcr: Math.round(pcr * 100) / 100, totalCallOI, totalPutOI, contracts: contracts.length };
}

// GEX scoring (mirrors alphaEngine logic)
function gexScore(gex: number): { score: number; label: string } {
    if (gex > 500000) return { score: 2, label: 'Strong+' };
    if (gex > 0) return { score: 1, label: 'Mild+' };
    if (gex < -50000) return { score: 2, label: 'Amplify!' };
    if (gex < -10000) return { score: 1, label: 'ModAmp' };
    return { score: 0, label: 'Neutral' };
}

async function testTicker(ticker: string) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  ${ticker}`);
    console.log('─'.repeat(70));

    const opts = await getOptionsData(ticker) as any;
    const allContracts: any[] = opts?.rawContracts || [];
    const spot = opts?.currentPrice || 0;

    if (allContracts.length === 0) {
        console.log('  ❌ No contracts');
        return;
    }

    // Find weekly expiry
    const weeklyExp = findWeeklyExpiry(allContracts);
    const weeklyContracts = weeklyExp
        ? allContracts.filter(c => c.expiry === weeklyExp)
        : allContracts;

    // Expiration summary
    const now = new Date();
    const exps = [...new Set(allContracts.map((c: any) => c.expiry))].sort();
    console.log(`  Spot: $${spot} | Expirations: ${exps.length}`);
    exps.forEach(exp => {
        const d = Math.ceil((new Date(exp).getTime() - now.getTime()) / 86400000);
        const cnt = allContracts.filter(c => c.expiry === exp).length;
        const sel = exp === weeklyExp ? ' ◀ SELECTED' : '';
        console.log(`    ${exp} (D+${d}): ${cnt} contracts${sel}`);
    });

    // Compute both
    const metAll = computeMetrics(allContracts, spot);
    const metWeekly = computeMetrics(weeklyContracts, spot);
    const gAll = gexScore(metAll.totalGex);
    const gWeekly = gexScore(metWeekly.totalGex);

    // IV Skew comparison
    const chainAll = allContracts.map(c => ({
        details: { strike_price: c.strike_price, contract_type: c.contract_type, expiration_date: c.expiry },
        implied_volatility: c.implied_volatility,
    }));
    const chainWeekly = weeklyContracts.map(c => ({
        details: { strike_price: c.strike_price, contract_type: c.contract_type, expiration_date: c.expiry },
        implied_volatility: c.implied_volatility,
    }));
    const skewAll = computeIVSkew(chainAll, spot);
    const skewWeekly = computeIVSkew(chainWeekly, spot);

    console.log(`\n  ${'Metric'.padEnd(18)} ${'ALL('.padEnd(0)}${metAll.contracts}${')'} `.padEnd(35) + `${'WEEKLY('.padEnd(0)}${metWeekly.contracts}${')'} `.padEnd(20) + 'DELTA');
    console.log('  ' + '─'.repeat(65));
    console.log(`  ${'GEX'.padEnd(18)} ${String(metAll.totalGex).padEnd(15)} ${String(metWeekly.totalGex).padEnd(18)} ${metWeekly.totalGex - metAll.totalGex}`);
    console.log(`  ${'GEX Score'.padEnd(18)} ${(gAll.score + ' (' + gAll.label + ')').padEnd(15)} ${(gWeekly.score + ' (' + gWeekly.label + ')').padEnd(18)} ${gWeekly.score - gAll.score}`);
    console.log(`  ${'Call Wall'.padEnd(18)} ${'$' + metAll.callWall}`.padEnd(35) + `${'$' + metWeekly.callWall}`.padEnd(20) + `${metWeekly.callWall - metAll.callWall}`);
    console.log(`  ${'Put Floor'.padEnd(18)} ${'$' + metAll.putFloor}`.padEnd(35) + `${'$' + metWeekly.putFloor}`.padEnd(20) + `${metWeekly.putFloor - metAll.putFloor}`);
    console.log(`  ${'PCR'.padEnd(18)} ${String(metAll.pcr).padEnd(15)} ${String(metWeekly.pcr).padEnd(18)} ${(metWeekly.pcr - metAll.pcr).toFixed(2)}`);
    console.log(`  ${'IV Skew'.padEnd(18)} ${String(skewAll ?? 'null').padEnd(15)} ${String(skewWeekly ?? 'null').padEnd(18)} ${skewAll && skewWeekly ? (skewWeekly - skewAll).toFixed(3) : 'N/A'}`);
    console.log(`  ${'Call OI'.padEnd(18)} ${String(metAll.totalCallOI).padEnd(15)} ${String(metWeekly.totalCallOI).padEnd(18)} ${((metWeekly.totalCallOI / metAll.totalCallOI) * 100).toFixed(0)}%`);
    console.log(`  ${'Put OI'.padEnd(18)} ${String(metAll.totalPutOI).padEnd(15)} ${String(metWeekly.totalPutOI).padEnd(18)} ${((metWeekly.totalPutOI / metAll.totalPutOI) * 100).toFixed(0)}%`);

    // Flag issues
    if (gAll.score !== gWeekly.score) {
        console.log(`\n  ⚠️  GEX SCORE CHANGED: ${gAll.score} → ${gWeekly.score} — 임계값 재조정 필요`);
    }
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  주간만기 A/B 테스트 — ALL chains vs Weekly only     ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    for (const t of TICKERS) {
        try { await testTicker(t); } catch (e: any) { console.log(`  ${t}: ERROR — ${e.message}`); }
    }
    console.log('\n✅ Done');
}
main();
