/**
 * ONE-PIPE 실데이터 전체 시나리오 테스트
 * 
 * 실행: npx tsx src/tests/onepipe-real-test.ts
 * 
 * 테스트 항목:
 * 1. REG 세션 — WS 가격 있을 때
 * 2. REG 세션 — WS 없이 폴링만
 * 3. PRE 세션 — 메인가격=전일종가, 뱃지=PRE실시간
 * 4. PRE→REG 전환 — 메인가격이 실시간으로 전환
 * 5. POST 세션 — 메인가격=오늘종가, 뱃지=POST실시간
 * 6. REG→POST 전환 — 메인가격 고정
 * 7. CLOSED — 모든 가격 정적
 * 8. CLOSED 주말/공휴일 — 직전장 가격 유지
 * 9. WS→폴링 전환 (WS 끊김)
 * 10. 폴링→WS 전환 (WS 재연결)
 */

// ── calcUnifiedPrice 실제 파일에서 로직 가져옴 ──
type MarketSession = 'PRE' | 'REG' | 'POST' | 'CLOSED';

interface OnePipeInput {
    session: MarketSession;
    lastTradePrice: number;
    dayClose: number;
    prevDayClose: number;
    regularCloseToday?: number | null;
    wsPrice?: number | null;
    preMarketPrice?: number | null;
    afterHoursPrice?: number | null;
}

interface OnePipeResult {
    price: number;            // 메인 표시 가격
    changePct: number;        // 메인 등락률
    extPrice: number | null;  // PRE/POST 뱃지 가격
    extChangePct: number | null;
    extLabel: string;         // 'PRE'|'POST'|'PRE CLOSE'|''
    chartPrice: number;       // StockChart currentPrice
    chartPrevClose: number;   // StockChart prevClose (기준선)
    prevClose: number;
    session: MarketSession;
    source: 'WS' | 'POLL' | 'SSR';
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

/**
 * useOnePipe의 핵심 로직 — 순수 함수로 테스트 가능
 * 이 함수가 검증되면 훅은 이것을 감싸기만 하면 됨
 */
function computeOnePipe(params: {
    session: MarketSession;
    pollPrice: number;        // /api/live/quotes → price
    pollPrevClose: number;    // /api/live/quotes → prevClose
    pollExtPrice: number;     // /api/live/quotes → extendedPrice
    pollExtLabel: string;     // /api/live/quotes → extendedLabel
    wsPrice: number | null;   // WebSocket price (null = 미연결)
    regularCloseToday: number | null;  // 잠긴 정규 종가
}): OnePipeResult {
    const { session, pollPrice, pollPrevClose, pollExtPrice, pollExtLabel, wsPrice, regularCloseToday } = params;
    const prevClose = pollPrevClose;
    
    let price = 0;
    let changePct = 0;
    let extPrice: number | null = null;
    let extChangePct: number | null = null;
    let extLabel = '';
    let chartPrice = 0;
    let chartPrevClose = 0;
    let source: 'WS' | 'POLL' | 'SSR' = 'POLL';

    switch (session) {
        case 'REG': {
            // 메인 가격: WS > 폴링
            price = (wsPrice && wsPrice > 0) ? wsPrice : pollPrice;
            source = (wsPrice && wsPrice > 0) ? 'WS' : 'POLL';
            // 등락률: 항상 직접 계산 (외부 changePct 사용 금지)
            changePct = prevClose > 0 ? round2(((price - prevClose) / prevClose) * 100) : 0;
            // PRE CLOSE 뱃지 (본장 중 프리마켓 종가 표시)
            if (pollExtPrice > 0 && pollExtLabel === 'PRE') {
                extPrice = pollExtPrice;
                extChangePct = prevClose > 0 ? round2(((pollExtPrice - prevClose) / prevClose) * 100) : 0;
                extLabel = 'PRE CLOSE';
            }
            // 차트: 실시간 가격, 기준선 = 전일종가
            chartPrice = price;
            chartPrevClose = prevClose;
            break;
        }
        case 'PRE': {
            // 메인 가격: 전일 종가 (고정)
            price = prevClose;
            // 메인 등락률: 전일 본장 등락률 (pollPrice가 prevClose와 같으면 0)
            // PRE에서 /api/live/quotes의 price = prevClose로 나옴
            changePct = 0; // PRE에서는 본장 changePct는 별도로 SSR/batch에서 가져와야 함
            source = 'POLL';
            // PRE 뱃지: 프리마켓 실시간
            const preRealtime = (wsPrice && wsPrice > 0) ? wsPrice : (pollExtPrice > 0 ? pollExtPrice : 0);
            if (preRealtime > 0) {
                extPrice = preRealtime;
                extChangePct = prevClose > 0 ? round2(((preRealtime - prevClose) / prevClose) * 100) : 0;
                extLabel = 'PRE';
                source = (wsPrice && wsPrice > 0) ? 'WS' : 'POLL';
            }
            // 차트: PRE 실시간, 기준선 = 전일종가
            chartPrice = preRealtime > 0 ? preRealtime : prevClose;
            chartPrevClose = prevClose;
            break;
        }
        case 'POST': {
            // 메인 가격: 오늘 정규 종가 (고정)
            const regClose = regularCloseToday || pollPrice;
            price = regClose;
            changePct = prevClose > 0 ? round2(((regClose - prevClose) / prevClose) * 100) : 0;
            source = 'POLL';
            // POST 뱃지: 포스트마켓 실시간
            const postRealtime = (wsPrice && wsPrice > 0) ? wsPrice : (pollExtPrice > 0 ? pollExtPrice : 0);
            if (postRealtime > 0) {
                extPrice = postRealtime;
                extChangePct = regClose > 0 ? round2(((postRealtime - regClose) / regClose) * 100) : 0;
                extLabel = 'POST';
                source = (wsPrice && wsPrice > 0) ? 'WS' : 'POLL';
            }
            // 차트: POST 실시간, 기준선 = 오늘 정규 종가
            chartPrice = postRealtime > 0 ? postRealtime : regClose;
            chartPrevClose = regClose;
            break;
        }
        case 'CLOSED': {
            // 메인 가격: 마지막 정규 종가 (고정)
            const regClose = regularCloseToday || pollPrice;
            price = regClose;
            changePct = prevClose > 0 && Math.abs(regClose - prevClose) > 0.001
                ? round2(((regClose - prevClose) / prevClose) * 100) : 0;
            source = 'POLL';
            // POST 뱃지 (있으면)
            if (pollExtPrice > 0 && (pollExtLabel === 'POST' || pollExtLabel === '')) {
                extPrice = pollExtPrice;
                extChangePct = regClose > 0 ? round2(((pollExtPrice - regClose) / regClose) * 100) : 0;
                extLabel = 'POST';
            }
            // 차트: 정적
            chartPrice = regClose;
            chartPrevClose = prevClose;
            break;
        }
    }

    return { price, changePct, extPrice, extChangePct, extLabel, chartPrice, chartPrevClose, prevClose, session, source };
}

// ════════════════════════════════════════════════════════════
// TEST FRAMEWORK
// ════════════════════════════════════════════════════════════
let passed = 0, failed = 0;
function assert(name: string, condition: boolean, detail?: string) {
    if (condition) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ════════════════════════════════════════════════════════════
// 실데이터 기반 가격 (NVDA 기준)
// ════════════════════════════════════════════════════════════
const NVDA = {
    prevClose: 118.27,        // 전일 종가
    regPrice: 119.45,         // 현재 정규장 가격
    prePrice: 118.90,         // 프리마켓 가격
    postPrice: 119.60,        // 포스트마켓 가격
    todayClose: 119.45,       // 오늘 정규 종가
};

console.log('\n═══ TEST 1: REG — WS 가격 있음 ═══');
{
    const r = computeOnePipe({
        session: 'REG', pollPrice: NVDA.regPrice, pollPrevClose: NVDA.prevClose,
        pollExtPrice: NVDA.prePrice, pollExtLabel: 'PRE',
        wsPrice: 119.50, regularCloseToday: null,
    });
    assert('메인 가격 = WS 가격', r.price === 119.50);
    assert('등락률 = (119.50-118.27)/118.27', r.changePct === round2(((119.50 - NVDA.prevClose) / NVDA.prevClose) * 100));
    assert('소스 = WS', r.source === 'WS');
    assert('PRE CLOSE 뱃지 표시', r.extLabel === 'PRE CLOSE');
    assert('PRE CLOSE 가격', r.extPrice === NVDA.prePrice);
    assert('차트 가격 = WS', r.chartPrice === 119.50);
    assert('차트 기준선 = 전일종가', r.chartPrevClose === NVDA.prevClose);
}

console.log('\n═══ TEST 2: REG — WS 없음 (폴링만) ═══');
{
    const r = computeOnePipe({
        session: 'REG', pollPrice: NVDA.regPrice, pollPrevClose: NVDA.prevClose,
        pollExtPrice: NVDA.prePrice, pollExtLabel: 'PRE',
        wsPrice: null, regularCloseToday: null,
    });
    assert('메인 가격 = 폴링 가격', r.price === NVDA.regPrice);
    assert('소스 = POLL', r.source === 'POLL');
    assert('등락률 정확', r.changePct === round2(((NVDA.regPrice - NVDA.prevClose) / NVDA.prevClose) * 100));
    assert('차트 가격 = 폴링', r.chartPrice === NVDA.regPrice);
}

console.log('\n═══ TEST 3: PRE — 프리마켓 ═══');
{
    const r = computeOnePipe({
        session: 'PRE', pollPrice: NVDA.prevClose, pollPrevClose: NVDA.prevClose,
        pollExtPrice: NVDA.prePrice, pollExtLabel: 'PRE',
        wsPrice: null, regularCloseToday: null,
    });
    assert('메인 가격 = 전일종가', r.price === NVDA.prevClose);
    assert('PRE 뱃지 가격 = 폴링 PRE', r.extPrice === NVDA.prePrice);
    assert('PRE 뱃지 라벨', r.extLabel === 'PRE');
    assert('PRE 등락률 정확', r.extChangePct === round2(((NVDA.prePrice - NVDA.prevClose) / NVDA.prevClose) * 100));
    assert('차트 = PRE 실시간', r.chartPrice === NVDA.prePrice);
    assert('차트 기준선 = 전일종가', r.chartPrevClose === NVDA.prevClose);
}

console.log('\n═══ TEST 4: PRE — WS 프리마켓 가격 ═══');
{
    const r = computeOnePipe({
        session: 'PRE', pollPrice: NVDA.prevClose, pollPrevClose: NVDA.prevClose,
        pollExtPrice: NVDA.prePrice, pollExtLabel: 'PRE',
        wsPrice: 118.95, regularCloseToday: null,
    });
    assert('메인 가격 = 전일종가 (WS 영향 없음)', r.price === NVDA.prevClose);
    assert('PRE 뱃지 = WS 가격 (최우선)', r.extPrice === 118.95);
    assert('차트 = WS PRE 가격', r.chartPrice === 118.95);
}

console.log('\n═══ TEST 5: PRE→REG 전환 ═══');
{
    // PRE 상태
    const pre = computeOnePipe({
        session: 'PRE', pollPrice: NVDA.prevClose, pollPrevClose: NVDA.prevClose,
        pollExtPrice: NVDA.prePrice, pollExtLabel: 'PRE',
        wsPrice: null, regularCloseToday: null,
    });
    assert('[PRE] 메인 = 전일종가', pre.price === NVDA.prevClose);
    
    // REG로 전환 (API session 변경)
    const reg = computeOnePipe({
        session: 'REG', pollPrice: NVDA.regPrice, pollPrevClose: NVDA.prevClose,
        pollExtPrice: NVDA.prePrice, pollExtLabel: 'PRE',
        wsPrice: null, regularCloseToday: null,
    });
    assert('[REG] 메인 = 실시간으로 전환', reg.price === NVDA.regPrice);
    assert('[REG] PRE CLOSE 뱃지', reg.extLabel === 'PRE CLOSE');
    assert('[REG] 등락률 변경', reg.changePct !== 0);
}

console.log('\n═══ TEST 6: POST — 포스트마켓 ═══');
{
    const r = computeOnePipe({
        session: 'POST', pollPrice: NVDA.todayClose, pollPrevClose: NVDA.prevClose,
        pollExtPrice: NVDA.postPrice, pollExtLabel: 'POST',
        wsPrice: null, regularCloseToday: NVDA.todayClose,
    });
    assert('메인 가격 = 오늘 정규종가 (고정)', r.price === NVDA.todayClose);
    assert('메인 등락률 = (종가-전일)/전일', r.changePct === round2(((NVDA.todayClose - NVDA.prevClose) / NVDA.prevClose) * 100));
    assert('POST 뱃지 가격', r.extPrice === NVDA.postPrice);
    assert('POST 등락률 = (post-종가)/종가', r.extChangePct === round2(((NVDA.postPrice - NVDA.todayClose) / NVDA.todayClose) * 100));
    assert('차트 = POST 실시간', r.chartPrice === NVDA.postPrice);
    assert('차트 기준선 = 오늘 종가', r.chartPrevClose === NVDA.todayClose);
}

console.log('\n═══ TEST 7: POST — WS 포스트마켓 ═══');
{
    const r = computeOnePipe({
        session: 'POST', pollPrice: NVDA.todayClose, pollPrevClose: NVDA.prevClose,
        pollExtPrice: NVDA.postPrice, pollExtLabel: 'POST',
        wsPrice: 119.80, regularCloseToday: NVDA.todayClose,
    });
    assert('메인 가격 = 종가 (WS 영향 없음)', r.price === NVDA.todayClose);
    assert('POST 뱃지 = WS (최우선)', r.extPrice === 119.80);
    assert('차트 = WS POST', r.chartPrice === 119.80);
}

console.log('\n═══ TEST 8: REG→POST 전환 ═══');
{
    // REG 마지막
    const reg = computeOnePipe({
        session: 'REG', pollPrice: NVDA.regPrice, pollPrevClose: NVDA.prevClose,
        pollExtPrice: 0, pollExtLabel: '',
        wsPrice: NVDA.todayClose, regularCloseToday: null,
    });
    assert('[REG] 메인 = 실시간', reg.price === NVDA.todayClose);
    
    // POST로 전환 (regularCloseToday 잠금)
    const post = computeOnePipe({
        session: 'POST', pollPrice: NVDA.todayClose, pollPrevClose: NVDA.prevClose,
        pollExtPrice: NVDA.postPrice, pollExtLabel: 'POST',
        wsPrice: NVDA.postPrice, regularCloseToday: NVDA.todayClose,
    });
    assert('[POST] 메인 = 종가 고정', post.price === NVDA.todayClose);
    assert('[POST] POST 뱃지 = WS', post.extPrice === NVDA.postPrice);
}

console.log('\n═══ TEST 9: CLOSED — 장 마감 ═══');
{
    const r = computeOnePipe({
        session: 'CLOSED', pollPrice: NVDA.todayClose, pollPrevClose: NVDA.prevClose,
        pollExtPrice: NVDA.postPrice, pollExtLabel: 'POST',
        wsPrice: null, regularCloseToday: NVDA.todayClose,
    });
    assert('메인 가격 = 종가 (고정)', r.price === NVDA.todayClose);
    assert('POST 뱃지 표시', r.extPrice === NVDA.postPrice);
    assert('차트 = 정적', r.chartPrice === NVDA.todayClose);
    assert('차트 기준선 = 전일종가', r.chartPrevClose === NVDA.prevClose);
}

console.log('\n═══ TEST 10: CLOSED 주말 — POST 데이터 없음 ═══');
{
    const r = computeOnePipe({
        session: 'CLOSED', pollPrice: NVDA.todayClose, pollPrevClose: NVDA.prevClose,
        pollExtPrice: 0, pollExtLabel: '',
        wsPrice: null, regularCloseToday: NVDA.todayClose,
    });
    assert('메인 가격 = 금요일 종가', r.price === NVDA.todayClose);
    assert('뱃지 없음', r.extPrice === null);
    assert('차트 정적', r.chartPrice === NVDA.todayClose);
}

console.log('\n═══ TEST 11: WS 끊김 → 폴링 전환 ═══');
{
    // WS 있을 때
    const withWs = computeOnePipe({
        session: 'REG', pollPrice: NVDA.regPrice, pollPrevClose: NVDA.prevClose,
        pollExtPrice: 0, pollExtLabel: '',
        wsPrice: 119.50, regularCloseToday: null,
    });
    assert('[WS] 소스=WS', withWs.source === 'WS');
    assert('[WS] 가격=WS', withWs.price === 119.50);

    // WS 끊김
    const noWs = computeOnePipe({
        session: 'REG', pollPrice: NVDA.regPrice, pollPrevClose: NVDA.prevClose,
        pollExtPrice: 0, pollExtLabel: '',
        wsPrice: null, regularCloseToday: null,
    });
    assert('[폴링] 소스=POLL', noWs.source === 'POLL');
    assert('[폴링] 가격=폴링', noWs.price === NVDA.regPrice);
    assert('가격 점프 최소', Math.abs(withWs.price - noWs.price) < 1);
}

console.log('\n═══ TEST 12: 공휴일 — prevClose = dayClose ═══');
{
    // 공휴일에는 prevClose와 price가 동일할 수 있음
    const r = computeOnePipe({
        session: 'CLOSED', pollPrice: NVDA.prevClose, pollPrevClose: NVDA.prevClose,
        pollExtPrice: 0, pollExtLabel: '',
        wsPrice: null, regularCloseToday: NVDA.prevClose,
    });
    assert('메인 가격 = 마지막 종가', r.price === NVDA.prevClose);
    assert('등락률 = 0 (같은 가격)', r.changePct === 0);
    assert('뱃지 없음', r.extPrice === null);
}

console.log('\n═══ TEST 13: 저유동성 종목 (MCD) — 가격 점프 검증 ═══');
{
    const MCD_PREV = 297.80;
    const prices = [298.50, 298.65, 298.40, 298.70, 298.55];
    let lastPrice = 0;
    let maxJump = 0;

    for (const p of prices) {
        const r = computeOnePipe({
            session: 'REG', pollPrice: p, pollPrevClose: MCD_PREV,
            pollExtPrice: 0, pollExtLabel: '',
            wsPrice: null, regularCloseToday: null,
        });
        if (lastPrice > 0) {
            const jump = Math.abs(r.price - lastPrice);
            maxJump = Math.max(maxJump, jump);
        }
        lastPrice = r.price;
    }
    assert('최대 가격 점프 < $1', maxJump < 1, `maxJump=${maxJump}`);
}

console.log('\n═══ TEST 14: PRE 뱃지 ≠ 메인 가격 검증 ═══');
{
    // REG에서 PRE CLOSE가 메인 가격과 다른지
    const r = computeOnePipe({
        session: 'REG', pollPrice: 119.45, pollPrevClose: 118.27,
        pollExtPrice: 118.90, pollExtLabel: 'PRE',
        wsPrice: null, regularCloseToday: null,
    });
    assert('메인 ≠ PRE CLOSE', r.price !== r.extPrice, `price=${r.price}, ext=${r.extPrice}`);
    assert('메인 등락률 ≠ PRE 등락률', r.changePct !== r.extChangePct);
}

// ════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`결과: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
