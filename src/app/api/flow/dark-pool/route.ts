/**
 * GET /api/flow/dark-pool            시장 전체 요약
 * GET /api/flow/dark-pool?t=TSLA     종목별
 * GET /api/flow/dark-pool?t=A,B,C    여러 종목 (목록 화면용)
 *
 * 출처: FINRA Query API `otcMarket/regShoDaily` (규제 보고 원본).
 * 적재: EC2 `finra-offexchange.js` 하루 2회 → Redis `finra:offexchange`.
 *
 * ⚠️ 라이선스 (FINRA Specific Terms for Equity Data §2.3)
 *    응답에 `attribution` 을 항상 실어 보낸다. **소비하는 화면은 이 문구를
 *    반드시 노출해야 한다** — 출처 명시가 재배포의 조건이다.
 *    또한 이 데이터에 «별도 요금»을 매길 수 없다(유료 상품에 끼워 주는
 *    것은 허용, 추가 과금은 금지). 따라서 광고·유료 게이트 뒤에 이
 *    데이터만 가두는 배치는 하지 말 것.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDarkPool, getDarkPoolBatch, getDarkPoolMarket, ATTRIBUTION } from '@/services/darkPool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const raw = (req.nextUrl.searchParams.get('t') || req.nextUrl.searchParams.get('ticker') || '').trim();

    try {
        if (!raw) {
            const market = await getDarkPoolMarket();
            return NextResponse.json(
                market
                    ? { available: true, attribution: ATTRIBUTION, basis: 'EOD', market }
                    : { available: false, reason: 'finra-not-loaded', attribution: ATTRIBUTION },
                { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } },
            );
        }

        const list = raw.toUpperCase().split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);

        if (list.length > 1) {
            const map = await getDarkPoolBatch(list);
            return NextResponse.json(
                { available: Object.keys(map).length > 0, attribution: ATTRIBUTION, basis: 'EOD', tickers: map },
                { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } },
            );
        }

        const one = await getDarkPool(list[0]);
        // 없으면 «없다»고 말한다 — 0 을 만들면 「장외 거래가 없었다」는 거짓 주장이 된다
        return NextResponse.json(
            one
                ? { available: true, attribution: ATTRIBUTION, basis: 'EOD', ...one }
                : { available: false, ticker: list[0], reason: 'ticker-not-in-finra-universe', attribution: ATTRIBUTION },
            { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } },
        );
    } catch (e: any) {
        console.error('[dark-pool] 실패:', e?.message || e);
        return NextResponse.json({ available: false, reason: 'error', attribution: ATTRIBUTION }, { status: 200 });
    }
}
