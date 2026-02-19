/**
 * 옵션 체인 기간 필터링 전후 비교 검증 스크립트
 * Usage: npx tsx scripts/verify-options-filter.ts
 */

import { getOptionsData } from '../src/services/stockApi';
import { computeIVSkew, computeImpliedMovePct } from '../src/services/alphaEngine';

const TICKERS = ['NVDA', 'AAPL', 'TSLA', 'PONY'];

// rawContracts → rawChain 형식 변환 (computeIVSkew/computeImpliedMovePct는 Polygon snapshot 형식 기대)
function toRawChain(contracts: any[]): any[] {
    return contracts.map(c => ({
        details: {
            strike_price: c.strike_price,
            contract_type: c.contract_type,
            expiration_date: c.expiry,
        },
        implied_volatility: c.implied_volatility,
        open_interest: c.open_interest,
        greeks: c.greeks,
        day: c.day,
        last_trade: c.last_trade,
    }));
}

async function analyzeChain(ticker: string) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${ticker}`);
    console.log('='.repeat(60));

    const opts = await getOptionsData(ticker) as any;
    const rawContracts: any[] = opts?.rawContracts || [];
    const price = opts?.currentPrice || 0;

    if (rawContracts.length === 0) {
        console.log('  ❌ No rawContracts data');
        return;
    }

    // 1. Expiration distribution
    const expMap: Record<string, number> = {};
    rawContracts.forEach(c => {
        const exp = c.expiry || 'unknown';
        expMap[exp] = (expMap[exp] || 0) + 1;
    });
    const sortedExps = Object.entries(expMap).sort(([a], [b]) => a.localeCompare(b));

    const now = new Date();
    const limit14 = new Date(now.getTime() + 14 * 86400000);

    console.log(`  Price: $${price} | Total: ${rawContracts.length} contracts | ${sortedExps.length} dates`);
    sortedExps.forEach(([exp, cnt]) => {
        const daysOut = Math.ceil((new Date(exp).getTime() - now.getTime()) / 86400000);
        const tag = new Date(exp) <= limit14 ? '✅' : '  ';
        console.log(`    ${tag} ${exp} (D+${daysOut}): ${cnt}`);
    });

    // 2. Filter 14 days
    const nearContracts = rawContracts.filter(c => c.expiry && new Date(c.expiry) <= limit14);
    console.log(`  14일 이내: ${nearContracts.length}/${rawContracts.length} (${Math.round(nearContracts.length / rawContracts.length * 100)}%)`);

    // 3. Convert and compare
    const allChain = toRawChain(rawContracts);
    const nearChain = toRawChain(nearContracts);

    const allIVSkew = computeIVSkew(allChain, price);
    const nearIVSkew = computeIVSkew(nearChain, price);
    const allIM = computeImpliedMovePct(allChain, price);
    const nearIM = computeImpliedMovePct(nearChain, price);

    console.log(`\n  ┌──────────────────┬──────────────┬──────────────┬──────────┐`);
    console.log(`  │                  │ ALL chains   │ 14-day only  │ 차이     │`);
    console.log(`  ├──────────────────┼──────────────┼──────────────┼──────────┤`);
    const skewDiff = (allIVSkew != null && nearIVSkew != null) ? (nearIVSkew - allIVSkew).toFixed(3) : 'N/A';
    const imDiff = (allIM != null && nearIM != null) ? (nearIM - allIM).toFixed(1) + '%p' : 'N/A';
    console.log(`  │ IV Skew          │ ${String(allIVSkew ?? 'null').padEnd(12)} │ ${String(nearIVSkew ?? 'null').padEnd(12)} │ ${String(skewDiff).padEnd(8)} │`);
    console.log(`  │ Implied Move %   │ ${String(allIM != null ? allIM + '%' : 'null').padEnd(12)} │ ${String(nearIM != null ? nearIM + '%' : 'null').padEnd(12)} │ ${String(imDiff).padEnd(8)} │`);
    console.log(`  └──────────────────┴──────────────┴──────────────┴──────────┘`);
}

async function main() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║  옵션 체인 기간 필터링 전후 비교 검증      ║');
    console.log('╚════════════════════════════════════════════╝');

    for (const ticker of TICKERS) {
        try { await analyzeChain(ticker); } catch (e: any) { console.log(`  ${ticker}: ERROR — ${e.message}`); }
    }
    console.log('\n✅ Done');
}
main();
