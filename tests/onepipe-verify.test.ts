/**
 * ONE-PIPE 검증 테스트
 * updateRealtimePrice가 calcUnifiedPrice를 경유할 때 모든 세션에서 정확한지 검증
 * 
 * 실행: npx tsx src/tests/onepipe-verify.ts
 */

// calcUnifiedPrice를 직접 import하지 않고 로직을 복사해서 standalone 테스트
type MarketSession = 'PRE' | 'REG' | 'POST' | 'CLOSED';

interface UnifiedPriceInput {
    session: MarketSession;
    lastTradePrice: number;
    dayClose: number;
    prevDayClose: number;
    regularCloseToday?: number | null;
    wsPrice?: number | null;
    preMarketPrice?: number | null;
    afterHoursPrice?: number | null;
}

interface UnifiedPriceResult {
    regularPrice: number;
    regularChangePct: number;
    prevClose: number;
    prePrice: number | null;
    preChangePct: number | null;
    postPrice: number | null;
    postChangePct: number | null;
    session: MarketSession;
    extLabel: 'PRE' | 'POST' | null;
}

// ── calcUnifiedPrice 로직 그대로 복사 (standalone 테스트용) ──
function calcUnifiedPrice(input: UnifiedPriceInput): UnifiedPriceResult {
    const { session, lastTradePrice, dayClose, prevDayClose, regularCloseToday = null, wsPrice = null, preMarketPrice = null, afterHoursPrice = null } = input;
    const prevClose = prevDayClose > 0 ? prevDayClose : 0;
    let regularPrice: number;
    switch (session) {
        case 'REG': regularPrice = (wsPrice && wsPrice > 0 ? wsPrice : 0) || lastTradePrice || dayClose || prevClose; break;
        case 'PRE': regularPrice = dayClose > 0 ? dayClose : prevClose; break;
        case 'POST': case 'CLOSED': regularPrice = (regularCloseToday && regularCloseToday > 0 ? regularCloseToday : 0) || (dayClose > 0 ? dayClose : 0) || prevClose; break;
    }
    let regularChangePct = 0;
    switch (session) {
        case 'REG': if (regularPrice > 0 && prevClose > 0) regularChangePct = ((regularPrice - prevClose) / prevClose) * 100; break;
        case 'PRE': if (dayClose > 0 && prevDayClose > 0) regularChangePct = ((dayClose - prevDayClose) / prevDayClose) * 100; break;
        case 'POST': case 'CLOSED': if (regularPrice > 0 && prevClose > 0 && Math.abs(regularPrice - prevClose) > 0.001) regularChangePct = ((regularPrice - prevClose) / prevClose) * 100; break;
    }
    let prePrice: number | null = null, preChangePct: number | null = null;
    let postPrice: number | null = null, postChangePct: number | null = null;
    let extLabel: 'PRE' | 'POST' | null = null;
    if (session === 'PRE') {
        const currentPrePrice = (wsPrice && wsPrice > 0 ? wsPrice : 0) || preMarketPrice || lastTradePrice;
        if (currentPrePrice > 0) { prePrice = currentPrePrice; preChangePct = prevClose > 0 ? ((currentPrePrice - prevClose) / prevClose) * 100 : 0; extLabel = 'PRE'; }
    } else if (session === 'POST') {
        const currentPostPrice = (wsPrice && wsPrice > 0 ? wsPrice : 0) || afterHoursPrice || lastTradePrice;
        if (currentPostPrice > 0 && regularPrice > 0) { postPrice = currentPostPrice; postChangePct = ((currentPostPrice - regularPrice) / regularPrice) * 100; extLabel = 'POST'; }
    } else if (session === 'CLOSED') {
        if (afterHoursPrice && afterHoursPrice > 0 && regularPrice > 0) { postPrice = afterHoursPrice; postChangePct = ((afterHoursPrice - regularPrice) / regularPrice) * 100; extLabel = 'POST'; }
    }
    const round2 = (n: number) => Math.round(n * 100) / 100;
    return { regularPrice, regularChangePct: round2(regularChangePct), prevClose, prePrice, preChangePct: preChangePct !== null ? round2(preChangePct) : null, postPrice, postChangePct: postChangePct !== null ? round2(postChangePct) : null, session, extLabel };
}

// ── 테스트 시뮬레이션: WS 가격이 calcUnifiedPrice를 경유할 때 ──
interface StoreTickerData {
    underlyingPrice: number;
    prevClose: number;
    prevRegularClose: number;
    regularCloseToday: number | null;
    session: MarketSession;
    extended: { prePrice?: number; preChangePct?: number; postPrice?: number; postChangePct?: number };
    changePercent: number;
    prevChangePct: number | null;
    intradayChangePct: number | null;
}

function simulateWsUpdate(existing: StoreTickerData, wsPrice: number) {
    const session = existing.session;
    
    // Skip unchanged
    if (session === 'REG' && existing.underlyingPrice === wsPrice) return { skipped: true, reason: 'REG price unchanged' };
    if (session === 'PRE' && existing.extended?.prePrice === wsPrice) return { skipped: true, reason: 'PRE price unchanged' };
    if ((session === 'POST' || session === 'CLOSED') && existing.extended?.postPrice === wsPrice) return { skipped: true, reason: 'POST/CLOSED price unchanged' };

    // ── [ONE-PIPE] calcUnifiedPrice 경유 ──
    const unified = calcUnifiedPrice({
        session,
        lastTradePrice: wsPrice,
        dayClose: existing.regularCloseToday || existing.underlyingPrice || 0,
        prevDayClose: existing.prevClose || existing.prevRegularClose || 0,
        regularCloseToday: existing.regularCloseToday,
        wsPrice: wsPrice,
        afterHoursPrice: (session === 'POST' || session === 'CLOSED') ? wsPrice : undefined,
    });

    const changePct = session === 'PRE'
        ? (existing.prevChangePct ?? existing.intradayChangePct ?? unified.regularChangePct)
        : unified.regularChangePct;

    return {
        skipped: false,
        underlyingPrice: unified.regularPrice,
        changePercent: changePct,
        display: { price: unified.regularPrice, changePctPct: changePct ?? 0 },
        extended: {
            ...existing.extended,
            postPrice: unified.postPrice ?? existing.extended?.postPrice,
            postChangePct: unified.postChangePct ?? existing.extended?.postChangePct,
            prePrice: unified.prePrice ?? existing.extended?.prePrice,
            preChangePct: unified.preChangePct ?? existing.extended?.preChangePct,
        },
        // StockChart에 전달될 값
        chartCurrentPrice: (session !== 'REG') && (unified.postPrice || unified.prePrice)
            ? (unified.postPrice || unified.prePrice)
            : unified.regularPrice,
        chartPrevClose: (session === 'POST' || (session === 'CLOSED' && (unified.postPrice ?? 0) > 0))
            ? (existing.regularCloseToday || unified.regularPrice)
            : unified.prevClose,
    };
}

// ════════════════════════════════════════════════════════════
// TEST CASES
// ════════════════════════════════════════════════════════════
let passed = 0, failed = 0;
function assert(name: string, condition: boolean, detail?: string) {
    if (condition) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\n═══ TEST 1: REG 세션 — WS 실시간 가격 ═══');
{
    const store: StoreTickerData = {
        underlyingPrice: 135.20, prevClose: 134.00, prevRegularClose: 134.00,
        regularCloseToday: null, session: 'REG',
        extended: {}, changePercent: 0.90, prevChangePct: null, intradayChangePct: null,
    };
    const r = simulateWsUpdate(store, 135.50);
    assert('가격 = WS 가격', !r.skipped && r.underlyingPrice === 135.50);
    assert('등락률 = (135.50-134)/134*100 = 1.12%', !r.skipped && r.changePercent === 1.12, `got ${r.skipped ? 'skip' : (r as any).changePercent}`);
    assert('차트 가격 = WS 가격', !r.skipped && r.chartCurrentPrice === 135.50);
    assert('차트 기준선 = 전일종가', !r.skipped && r.chartPrevClose === 134.00);
}

console.log('\n═══ TEST 2: REG 세션 — 동일 가격 스킵 ═══');
{
    const store: StoreTickerData = {
        underlyingPrice: 135.50, prevClose: 134.00, prevRegularClose: 134.00,
        regularCloseToday: null, session: 'REG',
        extended: {}, changePercent: 1.12, prevChangePct: null, intradayChangePct: null,
    };
    const r = simulateWsUpdate(store, 135.50);
    assert('동일 가격 → 스킵', r.skipped === true);
}

console.log('\n═══ TEST 3: PRE 세션 — WS PRE 가격 ═══');
{
    const store: StoreTickerData = {
        underlyingPrice: 134.00, // PRE에서 underlyingPrice = 전일종가
        prevClose: 134.00, prevRegularClose: 134.00,
        regularCloseToday: null, session: 'PRE',
        extended: { prePrice: 134.30 }, changePercent: 0.75,
        prevChangePct: 0.75, intradayChangePct: 0.75,
    };
    const r = simulateWsUpdate(store, 134.80);
    assert('메인 가격 = 전일종가 (변동 없음)', !r.skipped && r.underlyingPrice === 134.00);
    assert('메인 등락률 = 기존 prevChangePct', !r.skipped && r.changePercent === 0.75);
    assert('PRE 뱃지 = WS 가격', !r.skipped && r.extended?.prePrice === 134.80);
    assert('PRE 등락률 = (134.80-134)/134*100 = 0.60%', !r.skipped && r.extended?.preChangePct === 0.60, `got ${(r as any).extended?.preChangePct}`);
    assert('차트 가격 = PRE 실시간', !r.skipped && r.chartCurrentPrice === 134.80);
    assert('차트 기준선 = 전일종가', !r.skipped && r.chartPrevClose === 134.00);
}

console.log('\n═══ TEST 4: POST 세션 — WS POST 가격 ═══');
{
    const store: StoreTickerData = {
        underlyingPrice: 135.20, // POST에서 underlyingPrice = 오늘 정규종가
        prevClose: 134.00, prevRegularClose: 134.00,
        regularCloseToday: 135.20, session: 'POST',
        extended: { postPrice: 135.50 }, changePercent: 0.90,
        prevChangePct: null, intradayChangePct: null,
    };
    const r = simulateWsUpdate(store, 135.90);
    assert('메인 가격 = 오늘 정규종가 (변동 없음)', !r.skipped && r.underlyingPrice === 135.20);
    assert('메인 등락률 = (135.20-134)/134 = 0.90%', !r.skipped && r.changePercent === 0.90, `got ${(r as any).changePercent}`);
    assert('POST 뱃지 = WS 가격', !r.skipped && r.extended?.postPrice === 135.90);
    assert('POST 등락률 = (135.90-135.20)/135.20 = 0.52%', !r.skipped && r.extended?.postChangePct === 0.52, `got ${(r as any).extended?.postChangePct}`);
    assert('차트 가격 = POST 실시간', !r.skipped && r.chartCurrentPrice === 135.90);
    assert('차트 기준선 = 오늘 정규종가', !r.skipped && r.chartPrevClose === 135.20);
}

console.log('\n═══ TEST 5: CLOSED 세션 — WS 가격 (afterHours) ═══');
{
    const store: StoreTickerData = {
        underlyingPrice: 135.20, prevClose: 134.00, prevRegularClose: 134.00,
        regularCloseToday: 135.20, session: 'CLOSED',
        extended: { postPrice: 135.50 }, changePercent: 0.90,
        prevChangePct: null, intradayChangePct: null,
    };
    const r = simulateWsUpdate(store, 136.00);
    assert('메인 가격 = 정규종가 (변동 없음)', !r.skipped && r.underlyingPrice === 135.20);
    assert('POST 뱃지 = WS 가격', !r.skipped && r.extended?.postPrice === 136.00);
    assert('차트 가격 = POST 실시간', !r.skipped && r.chartCurrentPrice === 136.00);
}

console.log('\n═══ TEST 6: CLOSED 주말 — 가격 변동 없음 (WS 안 옴) ═══');
{
    const store: StoreTickerData = {
        underlyingPrice: 135.20, prevClose: 134.00, prevRegularClose: 134.00,
        regularCloseToday: 135.20, session: 'CLOSED',
        extended: { postPrice: 135.50 }, changePercent: 0.90,
        prevChangePct: null, intradayChangePct: null,
    };
    // WS sends same postPrice → should skip
    const r = simulateWsUpdate(store, 135.50);
    assert('동일 POST 가격 → 스킵', r.skipped === true);
}

console.log('\n═══ TEST 7: REG→POST 전환 시나리오 ═══');
{
    // fetchPriceOnly가 session을 POST로 전환한 후 WS 가격이 옴
    const store: StoreTickerData = {
        underlyingPrice: 135.20, // fetchPriceOnly가 regularCloseToday로 설정
        prevClose: 134.00, prevRegularClose: 134.00,
        regularCloseToday: 135.20, session: 'POST', // 세션 전환됨
        extended: {}, changePercent: 0.90,
        prevChangePct: null, intradayChangePct: null,
    };
    const r = simulateWsUpdate(store, 135.60);
    assert('전환 후 메인 가격 = 정규종가 고정', !r.skipped && r.underlyingPrice === 135.20);
    assert('전환 후 POST 뱃지 가격 = WS', !r.skipped && r.extended?.postPrice === 135.60);
    assert('전환 후 등락률 = 본장 등락률 유지', !r.skipped && r.changePercent === 0.90);
}

console.log('\n═══ TEST 8: MCD 같은 저유동성 종목 — 가격 점프 없음 ═══');
{
    const store: StoreTickerData = {
        underlyingPrice: 298.50, prevClose: 297.80, prevRegularClose: 297.80,
        regularCloseToday: null, session: 'REG',
        extended: {}, changePercent: 0.24,
        prevChangePct: null, intradayChangePct: null,
    };
    // WS 가격 1: 298.70
    const r1 = simulateWsUpdate(store, 298.70);
    assert('MCD 가격1 정상', !r1.skipped && r1.underlyingPrice === 298.70);
    
    // WS 가격 2: 298.65 (소폭 하락)
    const store2 = { ...store, underlyingPrice: 298.70, changePercent: 0.30 };
    const r2 = simulateWsUpdate(store2, 298.65);
    assert('MCD 가격2 정상 (소폭 하락)', !r2.skipped && r2.underlyingPrice === 298.65);
    assert('MCD 등락률 연속 계산', !r2.skipped && r2.changePercent === 0.29, `got ${(r2 as any).changePercent}`);
}

// ════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`결과: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(50)}\n`);
process.exit(failed > 0 ? 1 : 0);
