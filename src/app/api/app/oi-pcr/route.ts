// ============================================================================
// /api/app/oi-pcr — 앱 전용: 미결제약정 P/C 의 «한 정의»(35일 이내 전 만기 합계, 수집 Lambda DynamoDB gex 최신 행)를 한 종목씩 준다.
//
// 왜 (2026-10-07 정확성 2차): 화면의 «P/C(미결제약정)» 는 한 정의 — Intel 은 /api/intel/fast?app=1 이 같은 행에서 읽는다.
//   Flow 의 C/P 카드는 live/ticker 의 rawChain(주간 만기 1개)을 합산해 «OI» 라고 보였다 → 이 값을 받아 같은 정의로 그린다.
//   읽기 전용(쓰기 0) · 행이 없으면 null(앱은 «—») — 다른 만기 범위의 값으로 메우지 않는다. 웹은 이 경로를 쓰지 않는다.
// ============================================================================
import { NextResponse } from 'next/server';
import { oiPcrAllExpiries, isFreshOptionsRow } from '@/lib/app/intelOptionsBasis';

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
