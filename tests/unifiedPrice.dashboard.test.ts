// Dashboard-specific test: dashboardStore TickerData → UnifiedPriceService
// 대시보드가 사용하는 정확한 데이터 형태로 테스트

import {
    calcUnifiedPrice,
    getFullPriceDisplay,
    getWatchlistPrice,
    MarketSession,
    UnifiedPriceInput,
} from '../src/services/unifiedPriceService';

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

const KEY = 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';
const TICKERS = ['NVDA', 'AAPL', 'TSLA', 'GOOGL', 'META', 'AMD', 'MSFT'];

async function main() {
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('  Dashboard 호환성 테스트');
    console.log('  dashboardStore.fetchPriceOnly() 시뮬레이션');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log();

    // Polygon snapshot (quotes API가 실제로 이걸 호출)
    const snapRes = await fetchH(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${TICKERS.join(',')}&apiKey=${KEY}`);

    // Daily aggs for each
    const today = new Date();
    const from = new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0];
    const to = today.toISOString().split('T')[0];

    let total = 0;
    let pass = 0;

    for (const ticker of TICKERS) {
        const snap = (snapRes.tickers || []).find((s: any) => s.ticker === ticker);
        if (!snap) continue;

        let dailyCloses: number[] = [];
        try {
            const aggs = await fetchH(`https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=5&apiKey=${KEY}`);
            dailyCloses = (aggs.results || []).map((r: any) => r.c);
        } catch {}

        // Simulate what dashboardStore receives from /api/live/quotes
        const isPreMarket = !snap.day?.o && !snap.day?.v;
        const isPostMarket = snap.day?.c > 0 && snap.day?.o > 0;
        
        let storeSession: MarketSession;
        if (isPreMarket) storeSession = 'PRE';
        else if (isPostMarket) storeSession = 'POST';
        else storeSession = 'REG';

        // What dashboardStore.fetchPriceOnly() puts into the store:
        const lastP = snap.lastTrade?.p || 0;
        const dayC = snap.day?.c || 0;
        const prevC = snap.prevDay?.c || 0;

        // ── Compare: Dashboard (calcPriceDisplay) vs UnifiedPriceService ──
        
        // UnifiedPriceService
        const uniInput: UnifiedPriceInput = {
            session: storeSession,
            lastTradePrice: lastP,
            dayClose: dayC,
            prevDayClose: prevC,
            dailyCloses,
            vwap: snap.day?.vw || null,
            volume: snap.day?.v || 0,
            preMarketPrice: snap.preMarket?.p || null,
            afterHoursPrice: snap.afterHours?.p || null,
        };
        const uni = getFullPriceDisplay(uniInput);
        const uniWl = getWatchlistPrice(uniInput);

        // Dashboard WatchlistItem uses calcPriceDisplay with these inputs:
        // The store sets: underlyingPrice, changePercent, prevClose, display, extended, session
        // Then WatchlistItem feeds that to calcPriceDisplay
        
        // For PRE session in dashboard:
        //   underlyingPrice = regularCloseToday || prevCl || livePrice
        //   changePct = prevChangePct ?? intradayChangePct ?? 0
        // For REG:
        //   underlyingPrice = livePrice
        //   changePct = (livePrice - prevCl) / prevCl * 100
        // For POST:
        //   underlyingPrice = regClose  
        //   changePct = (regClose - prevCl) / prevCl * 100

        // Validate key properties
        const checks: string[] = [];
        
        // 1. regularPrice should always be > 0
        if (uni.regularPrice <= 0) checks.push('regularPrice <= 0');
        
        // 2. During PRE, regularChangePct should be yesterday's session change
        if (storeSession === 'PRE') {
            if (dailyCloses.length >= 2) {
                const expected = ((dailyCloses[0] - dailyCloses[1]) / dailyCloses[1]) * 100;
                if (Math.abs(uni.regularChangePct - Math.round(expected * 100) / 100) > 0.15) {
                    checks.push(`PRE regularChangePct mismatch: ${uni.regularChangePct} vs ${expected.toFixed(2)}`);
                }
            }
            // PRE price (extended) should exist
            if (!uni.prePrice || uni.prePrice <= 0) checks.push('PRE: no prePrice');
            if (uni.preChangePct === null) checks.push('PRE: no preChangePct');
        }

        // 3. Watchlist mode should have correct displayPrice
        if (uniWl.displayPrice <= 0) checks.push('WL displayPrice <= 0');

        // 4. Active price should match expectations
        if (uni.activePrice <= 0) checks.push('activePrice <= 0');

        // 5. PRE: activePrice should = prePrice (live PRE price)
        if (storeSession === 'PRE' && uni.prePrice && Math.abs(uni.activePrice - uni.prePrice) > 0.01) {
            checks.push(`PRE: activePrice != prePrice (${uni.activePrice} vs ${uni.prePrice})`);
        }

        const ok = checks.length === 0;
        total++;
        if (ok) pass++;

        console.log(`${ticker} [${storeSession}] ${ok ? '✅' : '❌'}`);
        console.log(`  regular: $${uni.regularPrice.toFixed(2)} ${uni.regularChangePct > 0 ? '+' : ''}${uni.regularChangePct.toFixed(2)}%`);
        console.log(`  active:  $${uni.activePrice.toFixed(2)} ${uni.activeChangePct > 0 ? '+' : ''}${uni.activeChangePct.toFixed(2)}%`);
        console.log(`  ext:     ${uni.extLabel || 'none'} ${uni.prePrice ? '$' + uni.prePrice.toFixed(2) : '-'} ${uni.postPrice ? '$' + uni.postPrice.toFixed(2) : '-'}`);
        console.log(`  WL:      $${uniWl.displayPrice.toFixed(2)} ${uniWl.changePct > 0 ? '+' : ''}${uniWl.changePct.toFixed(2)}% ext=${uniWl.extLabel || 'none'} ${uniWl.extChangePct !== null ? uniWl.extChangePct.toFixed(2) + '%' : '-'}`);
        if (!ok) checks.forEach(c => console.log(`  ❌ ${c}`));
        console.log();
    }

    // ── WebSocket 시뮬레이션 ──
    console.log('━━━ WebSocket Override Test ━━━');
    const nvdaSnap = (snapRes.tickers || []).find((s: any) => s.ticker === 'NVDA');
    if (nvdaSnap) {
        const wsPrice = 201.50; // 시뮬레이션 WS 가격
        const nvdaInput: UnifiedPriceInput = {
            session: 'REG',
            lastTradePrice: nvdaSnap.lastTrade?.p || 0,
            dayClose: nvdaSnap.day?.c || 0,
            prevDayClose: nvdaSnap.prevDay?.c || 0,
            wsPrice, // WebSocket override
        };
        const wsResult = getFullPriceDisplay(nvdaInput);
        const wsMatch = Math.abs(wsResult.regularPrice - wsPrice) < 0.01;
        total++;
        if (wsMatch) pass++;
        console.log(`NVDA WS override: ${wsMatch ? '✅' : '❌'} regularPrice=$${wsResult.regularPrice.toFixed(2)} (ws=$${wsPrice})`);
        console.log(`  changePct: ${wsResult.regularChangePct > 0 ? '+' : ''}${wsResult.regularChangePct.toFixed(2)}%`);

        // WS in PRE session — should update activePrice but not regularPrice
        const nvdaPreWs: UnifiedPriceInput = {
            session: 'PRE',
            lastTradePrice: nvdaSnap.lastTrade?.p || 0,
            dayClose: nvdaSnap.day?.c || 0,
            prevDayClose: nvdaSnap.prevDay?.c || 0,
            wsPrice: 203.00,
        };
        const preWs = getFullPriceDisplay(nvdaPreWs);
        const preWsOk = Math.abs(preWs.activePrice - 203.00) < 0.01 && preWs.regularPrice !== 203.00;
        total++;
        if (preWsOk) pass++;
        console.log(`NVDA PRE+WS: ${preWsOk ? '✅' : '❌'} activePrice=$${preWs.activePrice.toFixed(2)} regularPrice=$${preWs.regularPrice.toFixed(2)}`);
    }

    console.log();
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`  Dashboard 테스트: ${pass}/${total} ${pass === total ? '✅ ALL PASS' : '❌ FAILURES'}`);
    console.log('═══════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
