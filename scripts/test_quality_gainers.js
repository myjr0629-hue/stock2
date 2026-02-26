/**
 * [V5.0] Quality Gainers 검증 스크립트
 * 
 * 비교: 기존 fetchTopGainers() vs 신규 getTopQualityGainers()
 * 실시간 Polygon API 데이터로 테스트
 */

require('dotenv').config({ path: '.env.local' });

const POLYGON_API_KEY = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || 'iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF';

if (!POLYGON_API_KEY) {
    console.error('❌ POLYGON_API_KEY not found in .env.local');
    process.exit(1);
}

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
}

async function main() {
    console.log('='.repeat(70));
    console.log(' Alpha Engine V5.0 — Quality Gainers 검증');
    console.log('='.repeat(70));

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. 기존 방식: Polygon Top Gainers API (Raw)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n📊 [기존] Polygon Top Gainers API (필터 없음)');
    console.log('-'.repeat(70));

    let oldGainers = [];
    try {
        const data = await fetchJSON(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/gainers?apiKey=${POLYGON_API_KEY}`);
        oldGainers = data.tickers || [];

        for (const g of oldGainers.slice(0, 15)) {
            const price = g.day?.c || g.prevDay?.c || 0;
            const vol = g.day?.v || g.prevDay?.v || 0;
            const changePct = g.todaysChangePerc || 0;

            // 신 필터 적용 시 통과 여부
            const passPrice = price >= 15 && price <= 1000;
            const passVol = vol >= 500000;
            const passChange = changePct >= 2 && changePct <= 10;
            const passAll = passPrice && passVol && passChange;

            const status = passAll ? '✅ PASS' : '❌ BLOCK';
            const reasons = [];
            if (!passPrice) reasons.push(`가격$${price.toFixed(1)}`);
            if (!passVol) reasons.push(`볼륨${(vol / 1000).toFixed(0)}K`);
            if (!passChange) reasons.push(`변동${changePct.toFixed(1)}%`);

            console.log(`  ${status} ${g.ticker.padEnd(6)} $${price.toFixed(2).padStart(8)} | +${changePct.toFixed(1)}% | Vol ${(vol / 1000000).toFixed(1)}M ${reasons.length > 0 ? '← ' + reasons.join(', ') : ''}`);
        }

        // 요약
        const passCount = oldGainers.filter(g => {
            const price = g.day?.c || g.prevDay?.c || 0;
            const vol = g.day?.v || g.prevDay?.v || 0;
            const changePct = g.todaysChangePerc || 0;
            return price >= 15 && price <= 1000 && vol >= 500000 && changePct >= 2 && changePct <= 10;
        }).length;

        console.log(`\n  📋 결과: ${oldGainers.length}개 중 ${passCount}개만 신 필터 통과 (${((passCount / oldGainers.length) * 100).toFixed(0)}%)`);
        console.log(`  ⚠️  ${oldGainers.length - passCount}개는 잡주/급등주로 차단됨`);
    } catch (e) {
        console.warn('  ⚠️ Top Gainers API 실패:', e.message);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. 신규 방식: Full Snapshot → 필터 → Top 20
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('\n📊 [신규] Full Snapshot → Quality Filter → Top 20');
    console.log('-'.repeat(70));

    try {
        // Get full snapshot (paginated)
        let allTickers = [];
        let nextUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?limit=500&apiKey=${POLYGON_API_KEY}`;
        let page = 0;

        while (nextUrl && page < 20) {
            const data = await fetchJSON(nextUrl);
            const results = data.tickers || data.results || [];
            allTickers = [...allTickers, ...results];
            nextUrl = data.next_url ? `${data.next_url}&apiKey=${POLYGON_API_KEY}` : null;
            page++;
            process.stdout.write(`  Loading page ${page}... (${allTickers.length} stocks)\r`);
        }
        console.log(`  ✅ Full Snapshot loaded: ${allTickers.length} stocks`);

        // Simple ETF check (basic heuristic since we can't import the full module)
        const knownETFs = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'TQQQ', 'SQQQ', 'UVXY', 'ARKK', 'XLK', 'XLF', 'XLE', 'XLV', 'XBI', 'SMH', 'SOXX', 'GLD', 'SLV', 'TLT', 'MSTU', 'NVDL', 'TSLL']);

        // Apply quality filters
        const qualityGainers = allTickers.filter(t => {
            if (!t.ticker || !t.day?.c || !t.day?.v) return false;
            const price = t.day.c;
            const volume = t.day.v;
            const changePct = t.todaysChangePerc || 0;

            if (price < 15 || price > 1000) return false;
            if (volume < 500000) return false;
            if (changePct < 2 || changePct > 10) return false;
            if (t.ticker.includes('.')) return false;
            if (t.ticker.length > 5) return false;
            if (knownETFs.has(t.ticker)) return false;

            return true;
        });

        // Sort by changePct descending
        qualityGainers.sort((a, b) => (b.todaysChangePerc || 0) - (a.todaysChangePerc || 0));

        const top20 = qualityGainers.slice(0, 20);

        for (const g of top20) {
            const price = g.day.c;
            const vol = g.day.v;
            const changePct = g.todaysChangePerc || 0;
            console.log(`  ✅ ${g.ticker.padEnd(6)} $${price.toFixed(2).padStart(8)} | +${changePct.toFixed(1)}% | Vol ${(vol / 1000000).toFixed(1)}M`);
        }

        console.log(`\n  📋 결과: ${allTickers.length}개 스캔 → ${qualityGainers.length}개 필터 통과 → Top 20 추출`);

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // 3. 비교 요약
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        console.log('\n' + '='.repeat(70));
        console.log(' 비교 요약');
        console.log('='.repeat(70));

        const oldAvgPrice = oldGainers.length > 0
            ? oldGainers.reduce((s, g) => s + (g.day?.c || g.prevDay?.c || 0), 0) / oldGainers.length
            : 0;
        const newAvgPrice = top20.length > 0
            ? top20.reduce((s, g) => s + g.day.c, 0) / top20.length
            : 0;

        console.log(`  기존 Top Gainers: ${oldGainers.length}개, 평균 가격 $${oldAvgPrice.toFixed(1)}`);
        console.log(`  신규 Quality:     ${top20.length}개, 평균 가격 $${newAvgPrice.toFixed(1)}`);
        console.log(`  가격 향상:        +$${(newAvgPrice - oldAvgPrice).toFixed(1)} (${oldAvgPrice > 0 ? ((newAvgPrice / oldAvgPrice) * 100 - 100).toFixed(0) : 'N/A'}% 증가)`);

        // Check if any old gainers overlap with new
        const oldTickers = new Set(oldGainers.map(g => g.ticker));
        const newTickers = new Set(top20.map(g => g.ticker));
        const overlap = [...oldTickers].filter(t => newTickers.has(t));
        console.log(`  공통 종목:        ${overlap.length}개 (${overlap.join(', ') || 'none'})`);

    } catch (e) {
        console.error('  ❌ Full Snapshot 실패:', e.message);
    }
}

main().catch(console.error);
