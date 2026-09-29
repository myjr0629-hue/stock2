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
 *
 * 실패는 캐시하지 않는다(2026-09-29 «내 종목» 검토 A12·추가 3):
 *   예전엔 Redis 를 못 읽은 것(일시 오류)도 {available:false} 에 CDN 15분(s-maxage=900)이 붙어,
 *   한 번의 프록시 오류가 15분 동안 모든 사용자에게 «장외 비중 없음»으로 굳었다.
 *   이제 사유를 가른다 — reason:
 *     'error'           원천을 못 읽었다(프록시·네트워크·깨진 값)  → Cache-Control: no-store
 *     'not-loaded'      키가 없거나 비었다(적재 전)                → Cache-Control: no-store
 *     'not-in-universe' 원천은 읽었는데 그 종목이 FINRA 목록에 없다 → 사실이므로 정상 응답과 같은 캐시
 *   정상 응답(available:true)의 모양·캐시는 그대로다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDarkPoolBatchChecked, getDarkPoolChecked, getDarkPoolMarketChecked, ATTRIBUTION } from '@/services/darkPool';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHED = { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } as const;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(req: NextRequest) {
    const raw = (req.nextUrl.searchParams.get('t') || req.nextUrl.searchParams.get('ticker') || '').trim();

    try {
        if (!raw) {
            const m = await getDarkPoolMarketChecked();
            return m.ok
                ? NextResponse.json({ available: true, attribution: ATTRIBUTION, basis: 'EOD', market: m.market }, { headers: CACHED })
                : NextResponse.json({ available: false, reason: m.reason, attribution: ATTRIBUTION }, { headers: NO_STORE });
        }

        const list = raw.toUpperCase().split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);

        if (list.length > 1) {
            const b = await getDarkPoolBatchChecked(list);
            if (!b.ok) {
                return NextResponse.json(
                    { available: false, reason: b.reason, attribution: ATTRIBUTION, basis: 'EOD', tickers: {} },
                    { headers: NO_STORE },
                );
            }
            const any = Object.keys(b.map).length > 0;
            // 원천은 읽었는데 한 종목도 목록에 없다 — «없음»은 사실이라 캐시해도 된다(사유를 밝힌다)
            return NextResponse.json(
                any
                    ? { available: true, attribution: ATTRIBUTION, basis: 'EOD', tickers: b.map }
                    : { available: false, reason: 'not-in-universe', attribution: ATTRIBUTION, basis: 'EOD', tickers: {} },
                { headers: CACHED },
            );
        }

        const one = await getDarkPoolChecked(list[0]);
        if (!one.ok) {
            return NextResponse.json({ available: false, ticker: list[0], reason: one.reason, attribution: ATTRIBUTION }, { headers: NO_STORE });
        }
        // 없으면 «없다»고 말한다 — 0 을 만들면 「장외 거래가 없었다」는 거짓 주장이 된다
        return NextResponse.json(
            one.row
                ? { available: true, attribution: ATTRIBUTION, basis: 'EOD', ...one.row }
                : { available: false, ticker: list[0], reason: 'not-in-universe', attribution: ATTRIBUTION },
            { headers: CACHED },
        );
    } catch (e: any) {
        console.error('[dark-pool] 실패:', e?.message || e);
        return NextResponse.json({ available: false, reason: 'error', attribution: ATTRIBUTION }, { status: 200, headers: NO_STORE });
    }
}
