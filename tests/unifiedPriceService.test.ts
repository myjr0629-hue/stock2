// UnifiedPriceService 종합 테스트
// 실제 Polygon 데이터 + 세션별 시뮬레이션

const https = require('https');

function fetchH(url: string): Promise<any> {
    return new Promise((ok, no) => {
        https.get(url, (r: any) => {
            let d = '';
            r.on('data', (c: string) => d += c);
            r.on('end', () => { try { ok(JSON.parse(d)) } catch (e) { no(e) } });
        }).on('error', no);
    });
}

// Import the service (compile & run with tsx)
import {
    calcUnifiedPrice,
    getSessionChange,
    getWatchlistPrice,
    getFullPriceDisplay,
    fromPolygonSnapshot,
    MarketSession
} from '../src/services/unifiedPriceService';

const KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const TICKERS = ['NVDA', 'AAPL', 'TSLA', 'GOOGL', 'META', 'AMD', 'MSFT'];

async function main() {
    // 1. Polygon Snapshot
    const snapRes = await fetchH(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${TICKERS.join(',')}&apiKey=${KEY}`);
    
    // 2. Daily Aggs (2일치)
    const today = new Date();
    const from = new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0];
    const to = today.toISOString().split('T')[0];

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  UnifiedPriceService 종합 테스트');
    console.log('  실제 Polygon 데이터 × 4 세션 시뮬레이션');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log();

    let totalTests = 0;
    let passedTests = 0;

    for (const ticker of TICKERS) {
        const snap = (snapRes.tickers || []).find((s: any) => s.ticker === ticker);
        if (!snap) { console.log(`${ticker}: snapshot not found`); continue; }

        // Get daily aggs for this ticker
        let dailyCloses: number[] = [];
        try {
            const aggs = await fetchH(`https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=5&apiKey=${KEY}`);
            dailyCloses = (aggs.results || []).map((r: any) => r.c);
        } catch {}

        const lastP = snap.lastTrade?.p || 0;
        const dayC = snap.day?.c || 0;
        const prevC = snap.prevDay?.c || 0;

        console.log(`━━━━━ ${ticker} ━━━━━`);
        console.log(`  Raw: lastTrade=$${lastP.toFixed(2)} day.c=${dayC} prevDay.c=$${prevC.toFixed(2)}`);
        console.log(`  dailyCloses: [${dailyCloses.slice(0, 3).map(c => '$' + c.toFixed(2)).join(', ')}]`);
        console.log();

        // ── 테스트: 4 세션 전부 시뮬레이션 ──
        const sessions: MarketSession[] = ['PRE', 'REG', 'POST', 'CLOSED'];

        for (const session of sessions) {
            const input = fromPolygonSnapshot(snap, session, dailyCloses);
            
            // Mode A: Full
            const full = getFullPriceDisplay(input);
            // Mode B: Session
            const sess = getSessionChange(input);
            // Mode C: Watchlist
            const wl = getWatchlistPrice(input);

            // Validation
            const checks: { name: string; pass: boolean; detail: string }[] = [];

            // Check 1: regularPrice > 0
            checks.push({
                name: 'regularPrice > 0',
                pass: full.regularPrice > 0,
                detail: `$${full.regularPrice.toFixed(2)}`
            });

            // Check 2: activePrice > 0
            checks.push({
                name: 'activePrice > 0',
                pass: full.activePrice > 0,
                detail: `$${full.activePrice.toFixed(2)}`
            });

            // Check 3: changePct 범위 (-50, +50)
            checks.push({
                name: 'changePct in range',
                pass: Math.abs(full.regularChangePct) < 50,
                detail: `${full.regularChangePct > 0 ? '+' : ''}${full.regularChangePct.toFixed(2)}%`
            });

            // Check 4: PRE 세션에서 extLabel === 'PRE'
            if (session === 'PRE') {
                checks.push({
                    name: 'PRE extLabel',
                    pass: full.extLabel === 'PRE',
                    detail: `${full.extLabel}`
                });
            }

            // Check 5: POST 세션에서 extLabel === 'POST' (afterHours가 있을 때)
            if (session === 'POST' && snap.afterHours?.p) {
                checks.push({
                    name: 'POST extLabel',
                    pass: full.extLabel === 'POST',
                    detail: `${full.extLabel}`
                });
            }

            // Check 6: Mode B consistency — session change matches
            checks.push({
                name: 'ModeB == full.active',
                pass: Math.abs(sess.changePct - full.activeChangePct) < 0.01,
                detail: `${sess.changePct.toFixed(2)}% vs ${full.activeChangePct.toFixed(2)}%`
            });

            // Check 7: Mode C consistency — watchlist changePct == regularChangePct
            checks.push({
                name: 'ModeC == full.regular',
                pass: Math.abs(wl.changePct - full.regularChangePct) < 0.01,
                detail: `${wl.changePct.toFixed(2)}% vs ${full.regularChangePct.toFixed(2)}%`
            });

            // Check 8: Yahoo 기준 검증 (PRE 세션에서)
            if (session === 'PRE' && prevC > 0 && lastP > 0) {
                const yahooPrePct = ((lastP - prevC) / prevC) * 100;
                checks.push({
                    name: 'Yahoo PRE parity',
                    pass: Math.abs(full.activeChangePct - yahooPrePct) < 0.15,
                    detail: `ours=${full.activeChangePct.toFixed(2)}% yahoo=${yahooPrePct.toFixed(2)}%`
                });
            }

            // Check 9: REG 세션에서 regularPrice == activePrice
            if (session === 'REG') {
                checks.push({
                    name: 'REG: regular==active',
                    pass: Math.abs(full.regularPrice - full.activePrice) < 0.01,
                    detail: `$${full.regularPrice.toFixed(2)} vs $${full.activePrice.toFixed(2)}`
                });
            }

            const allPass = checks.every(c => c.pass);
            const icon = allPass ? '✅' : '❌';
            
            console.log(`  [${session.padEnd(6)}] ${icon} reg=$${full.regularPrice.toFixed(2)} ${full.regularChangePct > 0 ? '+' : ''}${full.regularChangePct.toFixed(2)}% | active=$${full.activePrice.toFixed(2)} ${full.activeChangePct > 0 ? '+' : ''}${full.activeChangePct.toFixed(2)}% | ext=${full.extLabel || 'none'}`);

            const failures = checks.filter(c => !c.pass);
            if (failures.length > 0) {
                failures.forEach(f => {
                    console.log(`           ❌ ${f.name}: ${f.detail}`);
                });
            }

            totalTests += checks.length;
            passedTests += checks.filter(c => c.pass).length;
        }
        console.log();
    }

    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`  결과: ${passedTests}/${totalTests} PASSED ${passedTests === totalTests ? '✅ ALL PASS' : '❌ FAILURES'}`);
    console.log('═══════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
