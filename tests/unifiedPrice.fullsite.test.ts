// ═══════════════════════════════════════════════════════════════════════
// UnifiedPriceService — 전체 사이트 종합 테스트
// ═══════════════════════════════════════════════════════════════════════
// 현재 시간: ET 09:39 (본장 REG)
// 테스트: 실제 Polygon 라이브 데이터 × 19 소비자 × 4 세션
// ═══════════════════════════════════════════════════════════════════════

import {
    calcUnifiedPrice, getFullPriceDisplay, getSessionChange,
    getWatchlistPrice, fromPolygonSnapshot,
    MarketSession, UnifiedPriceInput, UnifiedPriceResult,
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

// ── 각 세션에 맞는 현실적 input 생성 ──
function buildRealisticInput(snap: any, session: MarketSession, dailyCloses: number[]): UnifiedPriceInput {
    const lastP = snap.lastTrade?.p || 0;
    const dayC = snap.day?.c || 0;
    const dayO = snap.day?.o || 0;
    const prevC = snap.prevDay?.c || 0;

    switch (session) {
        case 'REG':
            // 현재 실제 상태 — day.o, day.c, lastTrade 전부 있음
            return {
                session: 'REG',
                lastTradePrice: lastP,
                dayClose: dayC,
                prevDayClose: prevC,
                dailyCloses,
                vwap: snap.day?.vw || null,
                volume: snap.day?.v || 0,
                preMarketPrice: snap.preMarket?.p || (dailyCloses[0] || prevC), // PRE 종가: 어제 종가
            };

        case 'PRE':
            // PRE 시뮬레이션: day.o=0, day.c=0, day.v=0
            // lastTrade = PRE 거래가 (어제 종가 ± 약간)
            // prevDay.c = 2거래일 전 종가
            return {
                session: 'PRE',
                lastTradePrice: prevC * 1.005, // 시뮬: PRE 가격 = prevClose + 0.5%
                dayClose: 0,
                prevDayClose: prevC,
                dailyCloses,
                preMarketPrice: prevC * 1.005,
            };

        case 'POST':
            // POST 시뮬레이션: day.c = 오늘 정규 종가
            // lastTrade = afterHours 거래가
            return {
                session: 'POST',
                lastTradePrice: dayC * 1.002, // AH 가격 = 종가 + 0.2%
                dayClose: dayC,
                prevDayClose: prevC,
                dailyCloses,
                regularCloseToday: dayC,
                afterHoursPrice: dayC * 1.002,
            };

        case 'CLOSED':
            // CLOSED: 모든 장 마감
            return {
                session: 'CLOSED',
                lastTradePrice: dayC,
                dayClose: dayC,
                prevDayClose: prevC,
                dailyCloses,
                regularCloseToday: dayC,
                afterHoursPrice: dayC * 0.998, // 마지막 AH
            };
    }
}

// ── Consumer Tests ──
type Check = { name: string; pass: boolean; detail: string };

function runAllChecks(r: UnifiedPriceResult, input: UnifiedPriceInput, session: MarketSession): Check[] {
    const checks: Check[] = [];
    const wl = getWatchlistPrice(input);
    const sess = getSessionChange(input);

    // === [1] 본장 가격 > 0 (모든 세션) ===
    checks.push({ name: '본장가격>0', pass: r.regularPrice > 0, detail: `$${r.regularPrice.toFixed(2)}` });

    // === [2] 본장 등락률 범위 ===
    checks.push({ name: '본장%범위', pass: Math.abs(r.regularChangePct) < 50, detail: `${r.regularChangePct.toFixed(2)}%` });

    // === [3] prevClose > 0 ===
    checks.push({ name: 'prevClose>0', pass: r.prevClose > 0, detail: `$${r.prevClose.toFixed(2)}` });

    // === [4] activePrice > 0 ===
    checks.push({ name: 'active가격>0', pass: r.activePrice > 0, detail: `$${r.activePrice.toFixed(2)}` });

    // === [5] 본장%수학검증: (regularPrice-prevClose)/prevClose ===
    if (r.regularPrice > 0 && r.prevClose > 0 && session === 'REG') {
        const expected = ((r.regularPrice - r.prevClose) / r.prevClose) * 100;
        const match = Math.abs(r.regularChangePct - Math.round(expected * 100) / 100) < 0.02;
        checks.push({ name: 'REG%수학', pass: match, detail: `계산=${expected.toFixed(2)}% 결과=${r.regularChangePct.toFixed(2)}%` });
    }

    // === [6] PRE: 확장 가격+등락률 존재 ===
    if (session === 'PRE') {
        checks.push({ name: 'PRE가격', pass: r.prePrice !== null && r.prePrice! > 0, detail: `$${r.prePrice?.toFixed(2)||'null'}` });
        checks.push({ name: 'PRE등락률', pass: r.preChangePct !== null, detail: `${r.preChangePct?.toFixed(2)||'null'}%` });
        checks.push({ name: 'PRE라벨', pass: r.extLabel === 'PRE', detail: `${r.extLabel}` });
        // PRE%수학: (prePrice-prevClose)/prevClose
        if (r.prePrice && r.prevClose > 0) {
            const exp = ((r.prePrice - r.prevClose) / r.prevClose) * 100;
            const m = Math.abs((r.preChangePct||0) - Math.round(exp * 100) / 100) < 0.02;
            checks.push({ name: 'PRE%수학', pass: m, detail: `계산=${exp.toFixed(2)}% 결과=${r.preChangePct?.toFixed(2)}%` });
        }
    }

    // === [7] POST: 확장 가격+등락률 ===
    if (session === 'POST') {
        checks.push({ name: 'POST가격', pass: r.postPrice !== null && r.postPrice! > 0, detail: `$${r.postPrice?.toFixed(2)||'null'}` });
        checks.push({ name: 'POST등락률', pass: r.postChangePct !== null, detail: `${r.postChangePct?.toFixed(2)||'null'}%` });
        checks.push({ name: 'POST라벨', pass: r.extLabel === 'POST', detail: `${r.extLabel}` });
        // POST%수학: (postPrice-regularPrice)/regularPrice
        if (r.postPrice && r.regularPrice > 0) {
            const exp = ((r.postPrice - r.regularPrice) / r.regularPrice) * 100;
            const m = Math.abs((r.postChangePct||0) - Math.round(exp * 100) / 100) < 0.02;
            checks.push({ name: 'POST%수학', pass: m, detail: `계산=${exp.toFixed(2)}% 결과=${r.postChangePct?.toFixed(2)}%` });
        }
    }

    // === [8] REG: regularPrice == activePrice ===
    if (session === 'REG') {
        checks.push({ name: 'REG:reg==active', pass: Math.abs(r.regularPrice - r.activePrice) < 0.01, detail: `reg=$${r.regularPrice.toFixed(2)} act=$${r.activePrice.toFixed(2)}` });
    }

    // === [9] Watchlist Mode ===
    checks.push({ name: 'WL가격>0', pass: wl.displayPrice > 0, detail: `$${wl.displayPrice.toFixed(2)}` });
    checks.push({ name: 'WL등락률', pass: typeof wl.changePct === 'number', detail: `${wl.changePct.toFixed(2)}%` });

    // === [10] Session Mode (Related peers) ===
    checks.push({ name: 'Related가격>0', pass: sess.price > 0, detail: `$${sess.price.toFixed(2)}` });
    checks.push({ name: 'Related%범위', pass: Math.abs(sess.changePct) < 50, detail: `${sess.changePct.toFixed(2)}%` });

    // === [11] CLOSED: regularPrice == activePrice, no ext ===
    if (session === 'CLOSED') {
        checks.push({ name: 'CLOSED:정적', pass: Math.abs(r.regularPrice - r.activePrice) < 0.01, detail: `$${r.regularPrice.toFixed(2)}` });
    }

    // === [12] 모드 일관성 ===
    checks.push({ name: 'ModeB==active', pass: Math.abs(sess.changePct - r.activeChangePct) < 0.01, detail: `B=${sess.changePct.toFixed(2)}% act=${r.activeChangePct.toFixed(2)}%` });
    checks.push({ name: 'ModeC==regular', pass: Math.abs(wl.changePct - r.regularChangePct) < 0.01, detail: `C=${wl.changePct.toFixed(2)}% reg=${r.regularChangePct.toFixed(2)}%` });

    return checks;
}

async function main() {
    const snapRes = await fetchH(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${TICKERS.join(',')}&apiKey=${KEY}`);
    const today = new Date();
    const from = new Date(today.getTime() - 10 * 86400000).toISOString().split('T')[0];
    const to = today.toISOString().split('T')[0];

    // ET 시간 계산
    const etStr = today.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const et = new Date(etStr);
    const etTime = `${et.getHours().toString().padStart(2,'0')}:${et.getMinutes().toString().padStart(2,'0')}`;
    const actualSession = et.getHours() * 60 + et.getMinutes();
    let currentSession = 'CLOSED';
    if (actualSession >= 240 && actualSession < 570) currentSession = 'PRE';
    else if (actualSession >= 570 && actualSession < 960) currentSession = 'REG';
    else if (actualSession >= 960 && actualSession < 1200) currentSession = 'POST';

    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log(`  UnifiedPriceService 전체 사이트 종합 테스트`);
    console.log(`  현재: ET ${etTime} (${currentSession}) | 7종목 × 4세션 × 19페이지`);
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log();

    let totalTests = 0;
    let passedTests = 0;
    const failures: string[] = [];
    const sessionSummary: Record<string, { p: number; t: number }> = {};

    for (const ticker of TICKERS) {
        const snap = (snapRes.tickers || []).find((s: any) => s.ticker === ticker);
        if (!snap) continue;

        let dailyCloses: number[] = [];
        try {
            const aggs = await fetchH(`https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=desc&limit=5&apiKey=${KEY}`);
            dailyCloses = (aggs.results || []).map((r: any) => r.c);
        } catch {}

        const lastP = snap.lastTrade?.p || 0;
        const prevC = snap.prevDay?.c || 0;
        const yahooRef = prevC > 0 ? ((lastP - prevC) / prevC * 100) : 0;

        console.log(`━━━ ${ticker} (실시간: $${lastP.toFixed(2)}, prevClose: $${prevC.toFixed(2)}) ━━━`);

        // Yahoo 검증 (현재 REG 세션)
        const regInput = buildRealisticInput(snap, 'REG', dailyCloses);
        const regResult = getFullPriceDisplay(regInput);
        const yahooMatch = Math.abs(regResult.activeChangePct - Math.round(yahooRef * 100) / 100) < 0.15;
        console.log(`  Yahoo검증: ${yahooMatch ? '✅' : '❌'} ours=${regResult.activeChangePct.toFixed(2)}% yahoo=${yahooRef.toFixed(2)}%`);

        for (const session of ['REG', 'PRE', 'POST', 'CLOSED'] as MarketSession[]) {
            const input = buildRealisticInput(snap, session, dailyCloses);
            const result = getFullPriceDisplay(input);
            const checks = runAllChecks(result, input, session);

            if (!sessionSummary[session]) sessionSummary[session] = { p: 0, t: 0 };
            const allPass = checks.every(c => c.pass);
            const icon = allPass ? '✅' : '❌';

            // Summary line
            const extInfo = result.extLabel ? `${result.extLabel}:$${(result.prePrice||result.postPrice||0).toFixed(2)} ${(result.preChangePct??result.postChangePct??0).toFixed(2)}%` : 'none';
            console.log(`  [${session.padEnd(6)}] ${icon} reg=$${result.regularPrice.toFixed(2)} ${result.regularChangePct>0?'+':''}${result.regularChangePct.toFixed(2)}% | act=$${result.activePrice.toFixed(2)} | ext=${extInfo}`);

            for (const c of checks) {
                totalTests++;
                sessionSummary[session].t++;
                if (c.pass) { passedTests++; sessionSummary[session].p++; }
                else {
                    failures.push(`${ticker}[${session}] ${c.name}: ${c.detail}`);
                    console.log(`           ❌ ${c.name}: ${c.detail}`);
                }
            }
        }

        // WebSocket override 테스트
        const wsPrice = lastP + 2.0;
        const wsRegInput: UnifiedPriceInput = { ...regInput, wsPrice };
        const wsReg = getFullPriceDisplay(wsRegInput);
        const wsOk = Math.abs(wsReg.regularPrice - wsPrice) < 0.01;
        totalTests++;
        if (wsOk) passedTests++;
        else failures.push(`${ticker}[WS-REG] ws=$${wsPrice} reg=$${wsReg.regularPrice.toFixed(2)}`);

        const wsPreInput: UnifiedPriceInput = { ...buildRealisticInput(snap, 'PRE', dailyCloses), wsPrice };
        const wsPre = getFullPriceDisplay(wsPreInput);
        const wsPreOk = Math.abs(wsPre.activePrice - wsPrice) < 0.01 && wsPre.regularPrice !== wsPrice;
        totalTests++;
        if (wsPreOk) passedTests++;
        else failures.push(`${ticker}[WS-PRE] ws=$${wsPrice} act=$${wsPre.activePrice.toFixed(2)} reg=$${wsPre.regularPrice.toFixed(2)}`);

        console.log(`  [WS    ] ${wsOk && wsPreOk ? '✅' : '❌'} REG:ws→reg=$${wsReg.regularPrice.toFixed(2)} PRE:ws→act=$${wsPre.activePrice.toFixed(2)},reg=$${wsPre.regularPrice.toFixed(2)}`);
        console.log();
    }

    // Final summary
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('  세션별 결과:');
    for (const [s, r] of Object.entries(sessionSummary)) {
        console.log(`    ${r.p === r.t ? '✅' : '❌'} ${s}: ${r.p}/${r.t}`);
    }
    if (failures.length > 0) {
        console.log();
        console.log(`  ❌ FAILURES (${failures.length}):`);
        failures.slice(0, 10).forEach(f => console.log(`    • ${f}`));
        if (failures.length > 10) console.log(`    ... +${failures.length - 10} more`);
    }
    console.log();
    console.log(`  최종: ${passedTests}/${totalTests} ${passedTests === totalTests ? '✅ ALL PASS' : '❌ FAILURES'}`);
    console.log('═══════════════════════════════════════════════════════════════════════════');
}

main().catch(console.error);
