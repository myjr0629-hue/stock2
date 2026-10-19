// ============================================================================
// /api/app/oi-pcr — 앱 전용: 미결제약정 P/C 의 «한 정의»(35일 이내 전 만기 합계, 수집 Lambda DynamoDB gex 최신 행)를 한 종목씩 준다.
//
// 왜 (2026-10-07 정확성 2차): 화면의 «P/C(미결제약정)» 는 한 정의 — Intel 은 /api/intel/fast?app=1 이 같은 행에서 읽는다.
//   Flow 의 C/P 카드는 live/ticker 의 rawChain(주간 만기 1개)을 합산해 «OI» 라고 보였다 → 이 값을 받아 같은 정의로 그린다.
//   읽기 전용(쓰기 0) · 행이 없으면 null(앱은 «—») — 다른 만기 범위의 값으로 메우지 않는다. 웹은 이 경로를 쓰지 않는다.
// ============================================================================
import { NextResponse } from 'next/server';
import { oiPcrAllExpiries, isFreshOptionsRow } from '@/lib/app/intelOptionsBasis';
import { getFromCache } from '@/services/redisClient';
import { prevTradingDate } from '@/lib/marketCalendar';
import { etWallTimeToMs } from '@/lib/marketSession';
import { lastCompletedSessionDate } from '@/lib/sessionArchive';

/**
 * [2026-10-19 D16] 수집 Lambda 행이 멈춘 종목(WTFC·FITB 8/28)의 대체 — 옵션 EOD 묶음(intrinio:options:eod)의 «가까운 만기 35일» 합계.
 * 같은 범위(파일 날짜 이후 35일 안 만기)만 쓴다 — 전 만기 합계(pcrOI)로 메우지 않는다. 필드는 EC2 수집기(scripts/intrinio-options-eod.js)
 * 배포 뒤부터 생긴다(그 전엔 이 대체가 null — 예전과 같은 결측). 묶음은 인스턴스당 5분 기억(크다).
 */
let eodMemo: { at: number; data: any } | null = null;
async function eodNear35(t: string): Promise<{ pcr: number; callOI: number; putOI: number; date: string } | null> {
    try {
        if (!eodMemo || Date.now() - eodMemo.at > 5 * 60 * 1000) eodMemo = { at: Date.now(), data: await getFromCache<any>('intrinio:options:eod') };
        const d = eodMemo.data;
        const v = d?.tickers?.[t] ?? (d?.stale?.[t] && typeof d.stale[t].date === 'string' ? d.stale[t] : null);
        const date = d?.tickers?.[t] ? d?.date : v?.date;
        const c = Number(v?.callOI35), p = Number(v?.putOI35);
        if (!v || typeof date !== 'string' || !(c > 0) || !(p >= 0)) return null;
        // 신선도: 마지막 완료 세션이거나 그 한 세션 전(공급사 EOD 는 마감 뒤 저녁에 온다)까지만 — 더 옛 판은 «지금 값»처럼 주지 않는다(관문 2차)
        const last = lastCompletedSessionDate();
        if (date < prevTradingDate(last)) return null;
        return { pcr: Math.round((p / c) * 100) / 100, callOI: c, putOI: p, date };
    } catch { return null; }
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const t = (new URL(request.url).searchParams.get('t') || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(t)) return NextResponse.json({ success: false, error: 'invalid ticker' }, { status: 400 });
    let row: any = null;
    try {
        const { getLatestGex } = await import('@/lib/aws/dynamoDataProvider');
        row = await Promise.race([
            getLatestGex(t).catch(() => null),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
        ]);
    } catch { row = null; }
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    const ts = Number(row?.timestamp);
    // 수집이 멈춘 종목의 옛 «최신 행»(5일 넘음 — 예: RGTI 8/28)은 지금 값처럼 주지 않는다 → 값은 null(앱 «—»), 행 시각만 알린다
    const fresh = isFreshOptionsRow(ts);
    const use = fresh ? row : null;
    const near = use ? null : await eodNear35(t);
    if (near) {
        return NextResponse.json(
            {
                success: true, ticker: t, pcr: near.pcr, callOI: near.callOI, putOI: near.putOI, contracts: null,
                // asOf = 그 EOD 세션의 정규장 마감 시각(대체값의 시각 — 멈춘 수집 행 시각을 싣지 않는다)
                asOf: etWallTimeToMs(near.date, 16 * 60), stale: false, staleRow: !!row,
                basis: 'oi_near_expiries_35d_eod', eodDate: near.date,
            },
            { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
        );
    }
    return NextResponse.json(
        {
            success: true,
            ticker: t,
            pcr: oiPcrAllExpiries(use),
            callOI: num(use?.totalCallOI),
            putOI: num(use?.totalPutOI),
            contracts: num(use?.totalContracts),
            asOf: Number.isFinite(ts) && ts > 0 ? ts : null,
            stale: !!row && !fresh,
            basis: 'oi_all_expiries_35d',
        },
        { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
}
