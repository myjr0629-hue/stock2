/**
 * [검증] 순환매(Sector Rotation) 데이터 품질 테스트
 * 
 * 목적: Polygon API에서 실제 섹터 ETF 데이터를 가져와서
 *       현재 calculateRotationIntensity 로직의 정확도를 검증
 * 
 * 실행: npx ts-node --project tsconfig.json scripts/test-rotation.ts
 */

const POLYGON_KEY = process.env.MASSIVE_API_KEY || "iKNEA6cQ6kqWWuHwURT_AyUqMprDpwGF";
const BASE_URL = "https://api.polygon.io";

// === 12 섹터 ETF (SECTOR_MAP 기준) ===
const SECTOR_ETFS: Record<string, string> = {
    XLK: "기술주",
    XLC: "커뮤니케이션",
    XLY: "임의소비재",
    XLE: "에너지",
    XLF: "금융",
    XLV: "헬스케어",
    XLI: "산업재",
    XLB: "소재",
    XLP: "필수소비재",
    XLRE: "부동산",
    XLU: "유틸리티",
};
// AI_PWR은 합성 섹터(ETF 없음)이므로 제외

// === NQ 선물 대용 (나스닥100 ETF) ===
const MARKET_BENCHMARKS = ["QQQ", "SPY", "IWM"];

// === HELPER: Polygon API Fetch ===
async function fetchPolygon(endpoint: string): Promise<any> {
    const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apiKey=${POLYGON_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Polygon ${res.status}: ${endpoint}`);
    return res.json();
}

// === TEST 1: 현재 Snapshot (주말 = 금요일 데이터) ===
async function testSnapshot() {
    console.log("\n" + "=".repeat(70));
    console.log("  TEST 1: Polygon Snapshot — 섹터 ETF 현재 상태");
    console.log("=".repeat(70));

    const tickers = [...Object.keys(SECTOR_ETFS), ...MARKET_BENCHMARKS].join(",");
    const data = await fetchPolygon(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers}`);

    if (!data.tickers || data.tickers.length === 0) {
        console.log("❌ 스냅샷 데이터 없음 (주말이라 비어있을 수 있음)");
        return null;
    }

    console.log(`\n✅ ${data.tickers.length}개 티커 수신\n`);

    // 섹터 ETF 데이터 분석
    const sectorData: { ticker: string; name: string; change: number; volume: number; lastTradePrice: number; prevClose: number; dayClose: number }[] = [];

    for (const t of data.tickers) {
        const ticker = t.ticker;
        const name = SECTOR_ETFS[ticker] || ticker;
        const dayC = t.day?.c || 0;
        const dayV = t.day?.v || 0;
        const prevC = t.prevDay?.c || 0;
        const lastP = t.lastTrade?.p || 0;
        const todaysChangePct = t.todaysChangePerc || 0;

        if (Object.keys(SECTOR_ETFS).includes(ticker)) {
            sectorData.push({
                ticker,
                name,
                change: todaysChangePct,
                volume: dayV,
                lastTradePrice: lastP,
                prevClose: prevC,
                dayClose: dayC,
            });
        }

        console.log(`  ${ticker.padEnd(5)} | ${name.padEnd(8)} | change: ${todaysChangePct >= 0 ? '+' : ''}${todaysChangePct.toFixed(2)}% | vol: ${(dayV / 1e6).toFixed(1)}M | day.c: ${dayC.toFixed(2)} | prevDay.c: ${prevC.toFixed(2)} | lastTrade: ${lastP.toFixed(2)}`);
    }

    // 현재 로직 재현
    console.log("\n--- 현재 calculateRotationIntensity 로직 재현 ---");
    const sorted = [...sectorData].sort((a, b) => b.change - a.change);
    const inflows = sorted.filter(s => s.change > 0);
    const outflows = sorted.filter(s => s.change < 0).sort((a, b) => a.change - b.change);

    const topInflowSum = inflows.slice(0, 3).reduce((sum, s) => sum + Math.abs(s.change), 0);
    const topOutflowSum = outflows.slice(0, 3).reduce((sum, s) => sum + Math.abs(s.change), 0);
    const score = Math.min(100, (topInflowSum + topOutflowSum) * 10);

    console.log(`\n  유입 섹터 (${inflows.length}개):`);
    inflows.forEach((s, i) => console.log(`    ${i + 1}. ${s.ticker} (${s.name}): +${s.change.toFixed(2)}%`));
    console.log(`  유출 섹터 (${outflows.length}개):`);
    outflows.forEach((s, i) => console.log(`    ${i + 1}. ${s.ticker} (${s.name}): ${s.change.toFixed(2)}%`));

    console.log(`\n  상위3 유입 합계: ${topInflowSum.toFixed(2)}%`);
    console.log(`  상위3 유출 합계: ${topOutflowSum.toFixed(2)}%`);
    console.log(`  ⚡ Rotation Score: ${score.toFixed(1)}/100`);
    console.log(`  📊 Breadth: ${((inflows.length / sectorData.length) * 100).toFixed(0)}% 상승`);

    // Risk-On vs Risk-Off
    const RISK_ON = ['XLK', 'XLY', 'XLC'];
    const RISK_OFF = ['XLU', 'XLP', 'XLRE'];
    const riskOnFlow = sectorData.filter(s => RISK_ON.includes(s.ticker)).reduce((sum, s) => sum + s.change, 0);
    const riskOffFlow = sectorData.filter(s => RISK_OFF.includes(s.ticker)).reduce((sum, s) => sum + s.change, 0);
    let direction = 'NEUTRAL';
    if (riskOnFlow > riskOffFlow + 0.5) direction = 'RISK_ON';
    else if (riskOffFlow > riskOnFlow + 0.5) direction = 'RISK_OFF';
    console.log(`  🎯 Direction: ${direction} (RiskOn=${riskOnFlow.toFixed(2)}% vs RiskOff=${riskOffFlow.toFixed(2)}%)`);

    return sectorData;
}

// === TEST 2: 5일 시계열 — 추세 검증 ===
async function test5DayTimeSeries() {
    console.log("\n" + "=".repeat(70));
    console.log("  TEST 2: 5일 시계열 — 섹터별 추세 비교");
    console.log("=".repeat(70));

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 10); // 10일 전부터 (주말 제외 5거래일 확보)

    const from = startDate.toISOString().split('T')[0];
    const to = endDate.toISOString().split('T')[0];

    const results: Record<string, { closes: number[]; volumes: number[]; dates: string[]; changes: number[] }> = {};

    for (const [ticker, name] of Object.entries(SECTOR_ETFS)) {
        await new Promise(r => setTimeout(r, 250)); // Rate limit 보호

        try {
            const data = await fetchPolygon(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=10`);
            const bars = data.results || [];

            if (bars.length < 2) {
                console.log(`  ⚠️ ${ticker}: 데이터 부족 (${bars.length}바)`);
                continue;
            }

            // 최근 5거래일만 추출
            const recent = bars.slice(-5);
            const closes = recent.map((b: any) => b.c);
            const volumes = recent.map((b: any) => b.v);
            const dates = recent.map((b: any) => new Date(b.t).toISOString().split('T')[0]);
            const changes: number[] = [];
            for (let i = 1; i < closes.length; i++) {
                changes.push(((closes[i] - closes[i - 1]) / closes[i - 1]) * 100);
            }

            results[ticker] = { closes, volumes, dates, changes };
        } catch (e: any) {
            console.log(`  ❌ ${ticker}: ${e.message}`);
        }
    }

    // 비교 테이블 출력
    console.log("\n  [5일 수익률 & 거래량 비교]");
    console.log("  " + "-".repeat(95));
    console.log(`  ${"Sector".padEnd(6)} | ${"이름".padEnd(8)} | ${"D-4".padEnd(7)} | ${"D-3".padEnd(7)} | ${"D-2".padEnd(7)} | ${"D-1".padEnd(7)} | ${"5일합계".padEnd(8)} | ${"방향".padEnd(6)} | ${"거래량추세".padEnd(10)}`);
    console.log("  " + "-".repeat(95));

    const fiveDayScores: { ticker: string; name: string; cumReturn: number; avgVolGrowth: number; direction: string; consistency: number }[] = [];

    for (const [ticker, data] of Object.entries(results)) {
        const name = SECTOR_ETFS[ticker];
        const changes = data.changes;
        if (changes.length < 2) continue;

        const cumReturn = changes.reduce((a, b) => a + b, 0);

        // 거래량 추세: 최근 vs 초반
        const vols = data.volumes;
        const recentVol = vols.slice(-2).reduce((a, b) => a + b, 0) / 2;
        const earlyVol = vols.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
        const avgVolGrowth = earlyVol > 0 ? ((recentVol - earlyVol) / earlyVol) * 100 : 0;

        // 방향 일관성 (같은 방향인 날 수 / 전체)
        const positives = changes.filter(c => c > 0).length;
        const negatives = changes.filter(c => c < 0).length;
        const consistency = Math.max(positives, negatives) / changes.length;
        const direction = cumReturn > 0.3 ? "🟩 UP" : cumReturn < -0.3 ? "🟥 DN" : "⬜ FLAT";

        fiveDayScores.push({ ticker, name, cumReturn, avgVolGrowth, direction, consistency });

        const changeStrs = changes.map(c => `${c >= 0 ? '+' : ''}${c.toFixed(2)}%`);
        while (changeStrs.length < 4) changeStrs.unshift("  N/A ");

        console.log(`  ${ticker.padEnd(6)} | ${name.padEnd(8)} | ${changeStrs.map(s => s.padEnd(7)).join(" | ")} | ${cumReturn >= 0 ? '+' : ''}${cumReturn.toFixed(2)}%`.padEnd(75) + ` | ${direction.padEnd(6)} | vol ${avgVolGrowth >= 0 ? '+' : ''}${avgVolGrowth.toFixed(0)}%`);
    }

    // 진짜 순환매 vs 일시적 변동 분석
    console.log("\n  [순환매 판별 분석]");
    const realInflows = fiveDayScores.filter(s => s.cumReturn > 0.3 && s.consistency >= 0.6);
    const realOutflows = fiveDayScores.filter(s => s.cumReturn < -0.3 && s.consistency >= 0.6);
    const noiseFlows = fiveDayScores.filter(s => s.consistency < 0.6);

    console.log(`\n  ✅ 진짜 유입 (5일 누적 +0.3% 이상 & 방향 일관성 60%+):`);
    realInflows.sort((a, b) => b.cumReturn - a.cumReturn).forEach(s =>
        console.log(`     ${s.ticker} (${s.name}): 5일 ${s.cumReturn >= 0 ? '+' : ''}${s.cumReturn.toFixed(2)}%, 일관성 ${(s.consistency * 100).toFixed(0)}%, 거래량 ${s.avgVolGrowth >= 0 ? '+' : ''}${s.avgVolGrowth.toFixed(0)}%`));

    console.log(`\n  ❌ 진짜 유출 (5일 누적 -0.3% 이상 & 방향 일관성 60%+):`);
    realOutflows.sort((a, b) => a.cumReturn - b.cumReturn).forEach(s =>
        console.log(`     ${s.ticker} (${s.name}): 5일 ${s.cumReturn.toFixed(2)}%, 일관성 ${(s.consistency * 100).toFixed(0)}%, 거래량 ${s.avgVolGrowth >= 0 ? '+' : ''}${s.avgVolGrowth.toFixed(0)}%`));

    console.log(`\n  ⚠️ 노이즈 (방향 일관성 60% 미만 — 일시적 변동):`);
    noiseFlows.forEach(s =>
        console.log(`     ${s.ticker} (${s.name}): 5일 ${s.cumReturn >= 0 ? '+' : ''}${s.cumReturn.toFixed(2)}%, 일관성 ${(s.consistency * 100).toFixed(0)}% ← 현재 로직은 이것도 순환매로 판정`));

    return { realInflows, realOutflows, noiseFlows };
}

// === TEST 3: Pre-market 데이터 검증 ===
async function testPremarketData() {
    console.log("\n" + "=".repeat(70));
    console.log("  TEST 3: Pre-Market 데이터 (Snapshot 필드 분석)");
    console.log("=".repeat(70));

    // 주말에는 pre-market 데이터가 없으므로 snapshot 필드 구조만 확인
    const tickers = "QQQ,SPY,XLK,XLE,XLU";
    const data = await fetchPolygon(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers}`);

    if (!data.tickers || data.tickers.length === 0) {
        console.log("  ⚠️ 주말: 스냅샷 데이터 없음 (정상)");
        console.log("  → 월요일 Pre-market (ET 4:00-9:30) 에 재테스트 필요\n");

        console.log("  [Polygon Snapshot 필드 구조 — Pre-market 시 관찰 대상]");
        console.log("  ├── day.c       : 당일 마감가 (pre-market = 0 또는 미존재)");
        console.log("  ├── day.v       : 당일 거래량 (pre-market = 0 또는 장외 포함?)");
        console.log("  ├── day.o       : 당일 시가   (pre-market = 0)");
        console.log("  ├── lastTrade.p : 마지막 거래가 (pre-market = 장외 거래가 ✅)");
        console.log("  ├── lastTrade.t : 마지막 거래 타임스탬프 ✅");
        console.log("  ├── prevDay.c   : 전일 정규장 종가 ✅");
        console.log("  ├── prevDay.v   : 전일 거래량 ✅");
        console.log("  ├── todaysChangePerc : 오늘 변동률 (pre-market 반영 여부 핵심!)");
        console.log("  └── min         : 1분봉 (pre-market 분봉 포함 가능?)");
        return;
    }

    console.log(`\n  ${data.tickers.length}개 티커 수신 (주말 잔여 데이터)\n`);
    for (const t of data.tickers) {
        console.log(`  ${t.ticker}:`);
        console.log(`    day:       ${JSON.stringify(t.day || {})}`);
        console.log(`    prevDay:   ${JSON.stringify(t.prevDay || {})}`);
        console.log(`    lastTrade: ${JSON.stringify(t.lastTrade || {})}`);
        console.log(`    todaysChangePerc: ${t.todaysChangePerc}`);
        console.log(`    min:       ${JSON.stringify(t.min || 'N/A')}`);
        console.log();
    }
}

// === TEST 4: 현재 로직 vs 개선된 로직 비교 ===
async function testCurrentVsImproved() {
    console.log("\n" + "=".repeat(70));
    console.log("  TEST 4: 현재 로직 vs 개선안 비교");
    console.log("=".repeat(70));

    // 최근 5일 데이터로 비교
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 10);
    const from = startDate.toISOString().split('T')[0];
    const to = endDate.toISOString().split('T')[0];

    const sectorData: Record<string, { closes: number[]; volumes: number[]; changes: number[] }> = {};

    for (const ticker of Object.keys(SECTOR_ETFS)) {
        await new Promise(r => setTimeout(r, 250));
        try {
            const data = await fetchPolygon(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=10`);
            const bars = (data.results || []).slice(-5);
            if (bars.length < 2) continue;

            const closes = bars.map((b: any) => b.c);
            const volumes = bars.map((b: any) => b.v);
            const changes: number[] = [];
            for (let i = 1; i < closes.length; i++) {
                changes.push(((closes[i] - closes[i - 1]) / closes[i - 1]) * 100);
            }
            sectorData[ticker] = { closes, volumes, changes };
        } catch (e) { /* skip */ }
    }

    // A) 현재 로직: 마지막 날 변동률만 사용
    console.log("\n  [A] 현재 로직 (당일 변동률만)");
    const lastDayChanges: { ticker: string; change: number }[] = [];
    for (const [ticker, data] of Object.entries(sectorData)) {
        const lastChange = data.changes[data.changes.length - 1] || 0;
        lastDayChanges.push({ ticker, change: lastChange });
    }
    lastDayChanges.sort((a, b) => b.change - a.change);

    const currentInflows = lastDayChanges.filter(s => s.change > 0);
    const currentOutflows = lastDayChanges.filter(s => s.change < 0);
    const currentInflowSum = currentInflows.slice(0, 3).reduce((sum, s) => sum + Math.abs(s.change), 0);
    const currentOutflowSum = currentOutflows.slice(0, 3).reduce((sum, s) => sum + Math.abs(s.change), 0);
    const currentScore = Math.min(100, (currentInflowSum + currentOutflowSum) * 10);

    console.log(`  Score: ${currentScore.toFixed(1)} | 유입 top3: ${currentInflowSum.toFixed(2)}% | 유출 top3: ${currentOutflowSum.toFixed(2)}%`);
    console.log(`  유입: ${currentInflows.map(s => `${s.ticker}(${s.change >= 0 ? '+' : ''}${s.change.toFixed(2)}%)`).join(', ')}`);
    console.log(`  유출: ${currentOutflows.map(s => `${s.ticker}(${s.change.toFixed(2)}%)`).join(', ')}`);

    // B) 개선안: 5일 누적 + 거래량 가중 + 일관성
    console.log("\n  [B] 개선안 (5일 누적 + RVOL 가중 + 일관성)");
    const improvedScores: { ticker: string; flowScore: number; consistency: number; volTrend: number; finalScore: number }[] = [];

    for (const [ticker, data] of Object.entries(sectorData)) {
        const changes = data.changes;
        const vols = data.volumes;
        if (changes.length < 2) continue;

        // 5일 누적 수익률
        const cumReturn = changes.reduce((a, b) => a + b, 0);

        // RVOL: 최근 2일 평균 / 전체 평균
        const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
        const recentAvgVol = vols.slice(-2).reduce((a, b) => a + b, 0) / 2;
        const rvol = avgVol > 0 ? recentAvgVol / avgVol : 1;

        // Flow Score: 수익률 × RVOL (거래량이 높을수록 강한 신호)
        const flowScore = cumReturn * Math.min(rvol, 3); // RVOL 3배 캡

        // 방향 일관성
        const positives = changes.filter(c => c > 0).length;
        const negatives = changes.filter(c => c < 0).length;
        const consistency = Math.max(positives, negatives) / changes.length;

        // 최종 점수 = Flow × Consistency (일관성 낮으면 할인)
        const finalScore = flowScore * consistency;

        improvedScores.push({ ticker, flowScore, consistency, volTrend: (rvol - 1) * 100, finalScore });
    }

    improvedScores.sort((a, b) => b.finalScore - a.finalScore);

    const improvedInflows = improvedScores.filter(s => s.finalScore > 0);
    const improvedOutflows = improvedScores.filter(s => s.finalScore < 0).sort((a, b) => a.finalScore - b.finalScore);

    console.log(`  유입 (확신도 가중):`);
    improvedInflows.forEach(s => console.log(`    ${s.ticker}: flowScore=${s.flowScore >= 0 ? '+' : ''}${s.flowScore.toFixed(2)} | 일관성=${(s.consistency * 100).toFixed(0)}% | RVOL=${s.volTrend >= 0 ? '+' : ''}${s.volTrend.toFixed(0)}% | 최종=${s.finalScore >= 0 ? '+' : ''}${s.finalScore.toFixed(2)}`));
    console.log(`  유출 (확신도 가중):`);
    improvedOutflows.forEach(s => console.log(`    ${s.ticker}: flowScore=${s.flowScore.toFixed(2)} | 일관성=${(s.consistency * 100).toFixed(0)}% | RVOL=${s.volTrend >= 0 ? '+' : ''}${s.volTrend.toFixed(0)}% | 최종=${s.finalScore.toFixed(2)}`));

    // 차이점 분석
    console.log("\n  [비교 분석]");
    const currentTop = lastDayChanges[0];
    const improvedTop = improvedScores[0];
    const currentBottom = lastDayChanges[lastDayChanges.length - 1];
    const improvedBottom = improvedScores[improvedScores.length - 1];

    console.log(`  현재 로직 — 최대 유입: ${currentTop?.ticker}(+${currentTop?.change.toFixed(2)}%), 최대 유출: ${currentBottom?.ticker}(${currentBottom?.change.toFixed(2)}%)`);
    console.log(`  개선 로직 — 최대 유입: ${improvedTop?.ticker}(score ${improvedTop?.finalScore.toFixed(2)}), 최대 유출: ${improvedBottom?.ticker}(score ${improvedBottom?.finalScore.toFixed(2)})`);

    if (currentTop?.ticker !== improvedTop?.ticker) {
        console.log(`\n  ⚠️ 유입 1위 불일치! 현재=${currentTop?.ticker} vs 개선=${improvedTop?.ticker}`);
        console.log(`     → 현재 로직은 당일 변동만 봐서 노이즈에 취약할 수 있음`);
    } else {
        console.log(`\n  ✅ 유입 1위 일치: ${currentTop?.ticker}`);
    }
}

// === MAIN ===
async function main() {
    console.log("╔══════════════════════════════════════════════════════════════════════╗");
    console.log("║       순환매(Sector Rotation) 데이터 검증 테스트                    ║");
    console.log("║       현재 시각: " + new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }).padEnd(51) + "║");
    console.log("║       ET 시각:   " + new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }).padEnd(51) + "║");
    console.log("╚══════════════════════════════════════════════════════════════════════╝");

    try {
        // Test 1: 현재 스냅샷
        await testSnapshot();

        // Test 2: 5일 시계열
        await test5DayTimeSeries();

        // Test 3: Pre-market 필드 분석
        await testPremarketData();

        // Test 4: 현재 vs 개선안
        await testCurrentVsImproved();

        console.log("\n" + "=".repeat(70));
        console.log("  검증 완료");
        console.log("=".repeat(70));

    } catch (e: any) {
        console.error("Fatal Error:", e.message);
    }
}

main();
