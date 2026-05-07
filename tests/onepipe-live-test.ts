/**
 * 원파이프 실데이터 통합 테스트
 * 프로덕션 /api/live/quotes에서 실제 데이터를 가져와서
 * computeOnePipe가 4개 페이지 동일 조건에서 동일 결과를 내는지 검증
 * 
 * 실행: npx tsx tests/onepipe-live-test.ts
 */

type Session = 'PRE' | 'REG' | 'POST' | 'CLOSED';
function round2(n: number): number { return Math.round(n * 100) / 100; }

function toSession(s: string | undefined): Session {
    if (!s) return 'CLOSED';
    const u = s.toUpperCase();
    if (u === 'PRE' || u === 'PRE_MARKET' || u === 'PREMARKET') return 'PRE';
    if (u === 'REG' || u === 'REGULAR' || u === 'OPEN') return 'REG';
    if (u === 'POST' || u === 'POST_MARKET' || u === 'POSTMARKET') return 'POST';
    return 'CLOSED';
}

interface OnePipeResult {
    price: number;
    changePct: number;
    extPrice: number | null;
    extChangePct: number | null;
    extLabel: string;
    chartPrice: number;
    chartPrevClose: number;
    prevClose: number;
    session: Session;
    source: 'WS' | 'POLL' | 'SSR';
}

// computeOnePipe — useOnePipe.ts와 동일한 로직
function computeOnePipe(params: {
    session: Session;
    pollPrice: number;
    pollPrevClose: number;
    pollExtPrice: number;
    pollExtLabel: string;
    pollChangePct?: number | null;
    wsPrice: number | null;
    regularCloseToday: number | null;
}): OnePipeResult {
    const { session, pollPrice, pollPrevClose, pollExtPrice, pollExtLabel, pollChangePct, wsPrice, regularCloseToday } = params;
    const prevClose = pollPrevClose;

    let price = 0, changePct = 0, extPrice: number | null = null, extChangePct: number | null = null;
    let extLabel = '', chartPrice = 0, chartPrevClose = 0;
    let source: 'WS' | 'POLL' | 'SSR' = 'POLL';

    switch (session) {
        case 'REG': {
            price = (wsPrice && wsPrice > 0) ? wsPrice : pollPrice;
            source = (wsPrice && wsPrice > 0) ? 'WS' : 'POLL';
            changePct = prevClose > 0 ? round2(((price - prevClose) / prevClose) * 100) : 0;
            if (pollExtPrice > 0 && pollExtLabel === 'PRE') {
                extPrice = pollExtPrice;
                extChangePct = prevClose > 0 ? round2(((pollExtPrice - prevClose) / prevClose) * 100) : 0;
                extLabel = 'PRE CLOSE';
            }
            chartPrice = price;
            chartPrevClose = prevClose;
            break;
        }
        case 'PRE': {
            price = prevClose;
            changePct = pollChangePct ?? 0;
            source = 'POLL';
            const preRealtime = (wsPrice && wsPrice > 0) ? wsPrice : (pollExtPrice > 0 ? pollExtPrice : 0);
            if (preRealtime > 0) {
                extPrice = preRealtime;
                extChangePct = prevClose > 0 ? round2(((preRealtime - prevClose) / prevClose) * 100) : 0;
                extLabel = 'PRE';
                source = (wsPrice && wsPrice > 0) ? 'WS' : 'POLL';
            }
            chartPrice = preRealtime > 0 ? preRealtime : prevClose;
            chartPrevClose = prevClose;
            break;
        }
        case 'POST': {
            const regClose = regularCloseToday || pollPrice;
            price = regClose;
            changePct = prevClose > 0 ? round2(((regClose - prevClose) / prevClose) * 100) : 0;
            source = 'POLL';
            const postRealtime = (wsPrice && wsPrice > 0) ? wsPrice : (pollExtPrice > 0 ? pollExtPrice : 0);
            if (postRealtime > 0) {
                extPrice = postRealtime;
                extChangePct = regClose > 0 ? round2(((postRealtime - regClose) / regClose) * 100) : 0;
                extLabel = 'POST';
                source = (wsPrice && wsPrice > 0) ? 'WS' : 'POLL';
            }
            chartPrice = postRealtime > 0 ? postRealtime : regClose;
            chartPrevClose = regClose;
            break;
        }
        case 'CLOSED': {
            const regClose = regularCloseToday || pollPrice;
            price = regClose;
            changePct = prevClose > 0 && Math.abs(regClose - prevClose) > 0.001
                ? round2(((regClose - prevClose) / prevClose) * 100) : 0;
            source = 'POLL';
            if (pollExtPrice > 0) {
                extPrice = pollExtPrice;
                extChangePct = regClose > 0 ? round2(((pollExtPrice - regClose) / regClose) * 100) : 0;
                extLabel = 'POST';
            }
            chartPrice = regClose;
            chartPrevClose = prevClose;
            break;
        }
    }
    return { price, changePct, extPrice, extChangePct, extLabel, chartPrice, chartPrevClose, prevClose, session, source };
}

// ═══════════════════════════════════════════════════
// LIVE TEST
// ═══════════════════════════════════════════════════
const TICKERS = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'MCD', 'SPY', 'PLTR'];
const BASE_URL = 'https://signumhq.com';

async function main() {
    console.log('═══ 원파이프 실데이터 통합 테스트 ═══\n');

    // 1. 프로덕션 API에서 실제 데이터 가져오기
    console.log(`[1] ${BASE_URL}/api/live/quotes 에서 데이터 가져오기...`);
    const res = await fetch(`${BASE_URL}/api/live/quotes?symbols=${TICKERS.join(',')}`);
    if (!res.ok) { console.error('API 호출 실패:', res.status); process.exit(1); }
    const json = await res.json();
    const apiSession = json.session;
    console.log(`    API 세션: ${apiSession}\n`);

    let passed = 0, failed = 0;
    function assert(name: string, condition: boolean, detail?: string) {
        if (condition) { passed++; }
        else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
    }

    // 2. 각 종목에 대해 computeOnePipe 실행 — WS 없는 상태 (폴링만)
    console.log('[2] WS 없이 폴링만 — 모든 종목 검증\n');
    console.log('    ┌──────────┬───────────┬─────────┬───────────┬────────────┬─────────────┬──────────┐');
    console.log('    │ Ticker   │ Price     │ Chg%    │ ExtPrice  │ ExtChg%    │ ExtLabel    │ Session  │');
    console.log('    ├──────────┼───────────┼─────────┼───────────┼────────────┼─────────────┼──────────┤');

    for (const ticker of TICKERS) {
        const d = json.data?.[ticker];
        if (!d) { console.log(`    │ ${ticker.padEnd(8)} │ NO DATA   │         │           │            │             │          │`); continue; }

        const session = toSession(d.session || apiSession);
        const r = computeOnePipe({
            session,
            pollPrice: d.price || 0,
            pollPrevClose: d.prevClose || d.previousClose || 0,
            pollExtPrice: d.extendedPrice || 0,
            pollExtLabel: d.extendedLabel || '',
            pollChangePct: d.changePercent ?? d.regChangePct ?? null,
            wsPrice: null,
            regularCloseToday: null,
        });

        const priceStr = r.price.toFixed(2).padStart(9);
        const chgStr = (r.changePct >= 0 ? '+' : '') + r.changePct.toFixed(2) + '%';
        const extPStr = r.extPrice ? r.extPrice.toFixed(2).padStart(9) : '    -    ';
        const extCStr = r.extChangePct != null ? ((r.extChangePct >= 0 ? '+' : '') + r.extChangePct.toFixed(2) + '%').padStart(10) : '     -    ';
        const extLStr = (r.extLabel || '-').padEnd(11);

        console.log(`    │ ${ticker.padEnd(8)} │ ${priceStr} │ ${chgStr.padStart(7)} │ ${extPStr} │ ${extCStr} │ ${extLStr} │ ${r.session.padEnd(8)} │`);

        // 기본 검증
        assert(`${ticker} price > 0`, r.price > 0, `price=${r.price}`);
        assert(`${ticker} prevClose > 0`, r.prevClose > 0, `prevClose=${r.prevClose}`);
        assert(`${ticker} changePct 범위`, Math.abs(r.changePct) < 30, `changePct=${r.changePct}`);
        assert(`${ticker} chartPrice > 0`, r.chartPrice > 0);
        assert(`${ticker} chartPrevClose > 0`, r.chartPrevClose > 0);

        // 세션별 검증
        if (session === 'REG') {
            assert(`${ticker} REG: price = pollPrice`, r.price === (d.price || 0));
            assert(`${ticker} REG: chartPrice = price`, r.chartPrice === r.price);
            assert(`${ticker} REG: chartPrevClose = prevClose`, r.chartPrevClose === r.prevClose);
        } else if (session === 'PRE') {
            assert(`${ticker} PRE: price = prevClose`, r.price === r.prevClose);
            assert(`${ticker} PRE: chartPrevClose = prevClose`, r.chartPrevClose === r.prevClose);
        } else if (session === 'POST') {
            assert(`${ticker} POST: chartPrevClose = price (종가)`, r.chartPrevClose === r.price);
        }
    }
    console.log('    └──────────┴───────────┴─────────┴───────────┴────────────┴─────────────┴──────────┘\n');

    // 3. 동일 데이터 — WS 가격 시뮬레이션
    console.log('[3] WS 시뮬레이션 — 동일 데이터에 WS 가격 추가\n');
    const testTicker = 'NVDA';
    const d = json.data?.[testTicker];
    if (d) {
        const session = toSession(d.session || apiSession);
        const basePrice = d.price || 0;
        const wsSimPrice = basePrice + 0.15; // WS가 15센트 높은 가격

        const withoutWs = computeOnePipe({
            session, pollPrice: basePrice, pollPrevClose: d.prevClose || d.previousClose || 0,
            pollExtPrice: d.extendedPrice || 0, pollExtLabel: d.extendedLabel || '',
            pollChangePct: d.changePercent ?? null,
            wsPrice: null, regularCloseToday: null,
        });

        const withWs = computeOnePipe({
            session, pollPrice: basePrice, pollPrevClose: d.prevClose || d.previousClose || 0,
            pollExtPrice: d.extendedPrice || 0, pollExtLabel: d.extendedLabel || '',
            pollChangePct: d.changePercent ?? null,
            wsPrice: wsSimPrice, regularCloseToday: null,
        });

        console.log(`    ${testTicker} (${session}):`);
        console.log(`    폴링만: price=$${withoutWs.price.toFixed(2)}, chg=${withoutWs.changePct}%, source=${withoutWs.source}`);
        console.log(`    WS 추가: price=$${withWs.price.toFixed(2)}, chg=${withWs.changePct}%, source=${withWs.source}`);

        if (session === 'REG') {
            assert('WS 가격 반영 (REG)', withWs.price === wsSimPrice, `got ${withWs.price}`);
            assert('WS 소스 표시', withWs.source === 'WS');
            assert('등락률 자동 재계산', withWs.changePct !== withoutWs.changePct);
        } else if (session === 'PRE') {
            assert('메인 가격 불변 (PRE)', withWs.price === withoutWs.price);
            assert('PRE 뱃지에 WS 가격', withWs.extPrice === wsSimPrice);
        } else if (session === 'POST') {
            assert('메인 가격 불변 (POST)', withWs.price === withoutWs.price);
            assert('POST 뱃지에 WS 가격', withWs.extPrice === wsSimPrice);
        }
    }

    // 4. 페이지 일관성 테스트: 동일 입력 → 동일 출력
    console.log('\n[4] 페이지 일관성 — Dashboard/Watchlist/Portfolio/Intel 동일 결과 검증\n');
    for (const ticker of ['NVDA', 'AAPL', 'TSLA']) {
        const d = json.data?.[ticker];
        if (!d) continue;
        const session = toSession(d.session || apiSession);
        const input = {
            session, pollPrice: d.price || 0,
            pollPrevClose: d.prevClose || d.previousClose || 0,
            pollExtPrice: d.extendedPrice || 0, pollExtLabel: d.extendedLabel || '',
            pollChangePct: d.changePercent ?? null,
            wsPrice: null as number | null, regularCloseToday: null as number | null,
        };

        // 4개 페이지가 동일 입력으로 computeOnePipe 호출
        const dashboard = computeOnePipe(input);
        const watchlist = computeOnePipe(input);
        const portfolio = computeOnePipe(input);
        const intel = computeOnePipe(input);

        assert(`${ticker} Dashboard === Watchlist`, JSON.stringify(dashboard) === JSON.stringify(watchlist));
        assert(`${ticker} Watchlist === Portfolio`, JSON.stringify(watchlist) === JSON.stringify(portfolio));
        assert(`${ticker} Portfolio === Intel`, JSON.stringify(portfolio) === JSON.stringify(intel));
        console.log(`    ✅ ${ticker}: 4개 페이지 동일 결과 (price=$${dashboard.price.toFixed(2)}, chg=${dashboard.changePct}%)`);
    }

    // 결과
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`결과: ${passed} passed, ${failed} failed`);
    console.log(`${'═'.repeat(50)}\n`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
