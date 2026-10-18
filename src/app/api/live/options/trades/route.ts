import { NextRequest, NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { readSessionArchive, saveSessionArchive } from '@/lib/sessionArchive';

// ── Redis cache key pattern: whale:{TICKER} ──
const REDIS_TTL = 300; // 5 minutes

/**
 * [2026-10-19 묶음 3] 고래 «마감 집계»(sessionAggregate, basis eod-volume) 완료 세션 보관본 — session:whale:{T}:{EOD 날짜}(8일).
 * whale:{T} 는 5분 TTL 이라 체인이 비거나 오류가 나면 직전 마감 집계가 «고래 0»으로 떨어졌다.
 * 같은 체인으로 이미 만든 집계를 저장만 하고(공급사 호출 0), 집계가 없을 때 달력의 마지막 완료 세션(→ 한 세션 전) 보관본으로 잇는다.
 * 화면 판정(lib/app/flowWhaleSession.eodSessionAggregate)이 날짜·세션을 다시 검사한다 — 끝나지 않은 세션 값은 그쪽에서도 버린다.
 */
type WhaleAggregate = { basis: 'eod-volume'; sessionDate: string; count: number; items: any[]; criteria?: string };
async function archivedWhaleAggregate(ticker: string): Promise<WhaleAggregate | null> {
    const a = await readSessionArchive<WhaleAggregate>('whale', ticker, { lookback: 1 }).catch(() => null);
    const v = a?.value;
    if (!v || v.basis !== 'eod-volume' || !Array.isArray(v.items) || !v.items.length || v.sessionDate !== a!.stamp.sourceSessionDate) return null;
    return v;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('t')?.toUpperCase();

    if (!ticker) {
        return NextResponse.json({ error: 'Ticker symbol is required' }, { status: 400 });
    }

    const cacheKey = `whale:${ticker}`;

    try {
        const { getOptionSnapshot, fetchMarketStatus } = await import('@/services/massiveClient');

        const rawChain = await getOptionSnapshot(ticker);

        if (!rawChain || rawChain.length === 0) {
            // ── Polygon returned empty → serve Redis cached data ──
            const cached = await getFromCache<any>(cacheKey);
            if (cached && (cached.sessionAggregate || (Array.isArray(cached.items) && cached.items.length))) {
                return NextResponse.json({ ...cached, _cached: true });
            }
            // 짧은 캐시도 비었으면 완료 세션 보관본(직전 마감 집계) — 없으면 예전처럼 빈 응답(결측)
            const sessionAggregate = await archivedWhaleAggregate(ticker);
            if (sessionAggregate) {
                return NextResponse.json({
                    ticker, count: 0, items: [], sessionAggregate, _archived: true,
                    debug: { note: 'No snapshot data — completed-session archive', eodSessionDate: sessionAggregate.sessionDate, eodContracts: sessionAggregate.count },
                });
            }
            if (cached) return NextResponse.json({ ...cached, _cached: true });
            return NextResponse.json({
                ticker, count: 0, items: [],
                debug: { note: "No snapshot data found, no cache available" }
            });
        }

        const now = new Date();

        let hoursBack = 20;
        let marketStatus = 'unknown';

        try {
            const status = await fetchMarketStatus();
            if (status) {
                const nyseStatus = (status as any).exchanges?.nyse || 'unknown';
                const nasdaqStatus = (status as any).exchanges?.nasdaq || 'unknown';
                marketStatus = nyseStatus;
                if (nyseStatus === 'closed' || nasdaqStatus === 'closed') {
                    hoursBack = 72;
                }
            }
        } catch {
            const dayOfWeek = now.getUTCDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                hoursBack = 72;
                marketStatus = 'closed (fallback)';
            }
        }

        const cutoffTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
        const fourteenDaysFromNow = new Date();
        fourteenDaysFromNow.setDate(now.getDate() + 14);

        const whaleTrades: any[] = [];
        // 체인 조회 성공 ≠ 체결 관측 성공. 실제 last_trade(체결 시각·가격·수량)가 붙은 계약 수를 따로 센다.
        // 화면은 이 값이 양수일 때만 «정규장 고래 0건 = $0»으로 읽는다(없으면 원천 결측 «—»).
        let tradesObserved = 0;

        for (const contract of rawChain) {
            const trade = contract.last_trade?.last_trade_sip || contract.last_trade;
            if (!trade || !trade.price || !trade.size) continue;

            const timestampNs = trade.sip_timestamp || trade.t || 0;
            if (Number(trade.price) > 0 && Number(trade.size) > 0
                && Number.isFinite(Number(timestampNs)) && Number(timestampNs) > 0) tradesObserved++;
            const timestampMs = timestampNs / 1000000;
            const tradeDate = new Date(timestampMs);

            if (tradeDate < cutoffTime) continue;

            const details = contract.details;
            if (!details || !details.expiration_date) continue;

            const expiryStr = details.expiration_date;
            const expiry = new Date(expiryStr);

            if (expiry > fourteenDaysFromNow || expiry < cutoffTime) continue;

            const price = trade.price;
            const size = trade.size;
            const premium = price * size * 100;

            if (premium < 50000) continue;

            whaleTrades.push({
                id: `${details.ticker}-${timestampNs}`,
                ticker: details.ticker,
                underlying: ticker,
                strike: details.strike_price,
                expiry: expiryStr,
                type: details.contract_type?.toUpperCase() || 'UNKNOWN',
                price, size, premium,
                iv: contract.implied_volatility,
                greeks: contract.greeks,
                timestamp: timestampNs,
                tradeDate,
                timeET: tradeDate.toLocaleTimeString('en-US', {
                    timeZone: 'America/New_York',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                }),
                isWhale: true
            });
        }

        whaleTrades.sort((a, b) => b.timestamp - a.timestamp);

        // ── 체결 원천이 없을 때: 직전 마감 세션의 «계약별 일일 거래대금» (2026-10-19) ──
        // 연결된 Intrinio 체인(options/chain/{t}/{exp}/eod → getOptionChainSnapshotIntrinio)은 last_trade 를 만들지 않는다.
        // 그래서 장중에도 tradesObserved=0 이다(운영 10/19 실측: NVDA 768·SPY 1,828·AAPL 704 계약 중 0).
        // 이때 체인이 실제로 주는 것 = 계약마다 «그 EOD 날짜(_intrinio.date)»의 거래량(day.volume)·종가(day.close).
        // 둘 다 같은 세션의 OPRA 값이라 곱(거래대금)은 실측이다. 체결 시각·매수/매도 방향은 원천에 없으므로 만들지 않는다(null).
        // items(개별 체결 자리)에는 섞지 않는다 — 웹 FlowRadar 등 기존 소비처는 예전과 똑같이 본다.
        let sessionAggregate: any = null;
        if (tradesObserved === 0) {
            const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
            const todayET = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
            let eodDate: string | null = null;
            for (const c of rawChain) {
                const d = c?._intrinio?.date;
                if (typeof d === 'string' && ISO_DAY.test(d) && d <= todayET && (!eodDate || d > eodDate)) eodDate = d;
            }
            const rows: any[] = [];
            if (eodDate) {
                for (const c of rawChain) {
                    if (c?._intrinio?.date !== eodDate) continue;
                    const details = c.details;
                    if (!details || !details.expiration_date) continue;
                    const expiry = new Date(details.expiration_date);
                    if (expiry > fourteenDaysFromNow || expiry < cutoffTime) continue;
                    const type = details.contract_type === 'call' ? 'CALL' : details.contract_type === 'put' ? 'PUT' : null;
                    if (!type) continue;
                    const volume = Number(c.day?.volume);
                    const close = Number(c.day?.close);
                    if (!Number.isFinite(volume) || volume <= 0 || !Number.isFinite(close) || close <= 0) continue;
                    const premium = volume * close * 100;
                    if (premium < 50000) continue;
                    const strike = Number(details.strike_price);
                    // 행은 얇게(응답·Redis 크기) — 시각·방향 칸은 아예 싣지 않는다. 기준(basis)은 묶음 수준에 한 번.
                    rows.push({
                        ticker: details.ticker,
                        strike: Number.isFinite(strike) && strike > 0 ? strike : null,
                        expiry: details.expiration_date,
                        type,
                        price: close, size: volume, premium: Math.round(premium),
                        sessionDate: eodDate,
                    });
                }
            }
            rows.sort((a, b) => b.premium - a.premium);
            if (eodDate && rows.length > 0) {
                sessionAggregate = {
                    basis: 'eod-volume',
                    sessionDate: eodDate,
                    count: rows.length,
                    items: rows,
                    criteria: 'Contract day volume x day close x 100 >= $50k, Expiry <= 14d, one EOD session',
                };
                // 완료 세션 보관(같은 EOD 날짜 키 — 늦게 끝난 옛 체인 요청이 새 날짜를 덮지 못한다)
                const agg = sessionAggregate;
                after(async () => { await saveSessionArchive('whale', ticker, eodDate as string, agg).catch(() => 'error'); });
            } else {
                // 이번 체인으로 집계를 못 만들었다 → 직전 마감 보관본. 단 체인이 EOD 날짜를 갖고 있고 보관본이 그보다 새롭지 않으면
                // 그 세션의 «조건 맞는 계약 0»이 실측이다 — 옛 세션 값으로 덮지 않는다.
                const arch = await archivedWhaleAggregate(ticker);
                if (arch && (!eodDate || arch.sessionDate > eodDate)) sessionAggregate = arch;
            }
        }

        const response = {
            ticker,
            count: whaleTrades.length,
            items: whaleTrades,
            sessionAggregate,
            debug: {
                totalContractsScanned: rawChain.length,
                tradesObserved,
                eodSessionDate: sessionAggregate?.sessionDate ?? null,
                eodContracts: sessionAggregate?.count ?? 0,
                filteredCount: whaleTrades.length,
                marketStatus, hoursBack,
                criteria: `Premium >= $50k, Expiry <= 14d, Last ${hoursBack}h`
            }
        };

        // ── Always save to Redis (even 0 results to prevent perpetual cold starts) ──
        // [FIX] Before: 0 whale trades → no cache → every call = 5s cold start
        // After: 0 results cached → 2nd call returns instantly from Redis
        setInCache(cacheKey, response, REDIS_TTL).catch(() => { });

        return NextResponse.json(response);

    } catch (error: any) {
        console.error(`[API] Whale feed error for ${ticker}:`, error);

        // ── On error → serve Redis cached data ──
        const cached = await getFromCache<any>(cacheKey);
        if (cached) {
            return NextResponse.json({ ...cached, _cached: true, _error: error.message });
        }
        const sessionAggregate = await archivedWhaleAggregate(ticker).catch(() => null);
        if (sessionAggregate) {
            return NextResponse.json({ ticker, count: 0, items: [], sessionAggregate, _archived: true, _error: error.message,
                debug: { note: 'Error — completed-session archive', eodSessionDate: sessionAggregate.sessionDate, eodContracts: sessionAggregate.count } });
        }

        return NextResponse.json({
            error: error.message || 'Internal Server Error',
            items: [], details: error
        }, { status: 500 });
    }
}
