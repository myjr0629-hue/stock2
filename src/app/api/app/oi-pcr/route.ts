// ============================================================================
// /api/app/oi-pcr — 앱 전용: 미결제약정 P/C 의 «한 정의»(35일 이내 전 만기 합계, 수집 Lambda DynamoDB gex 최신 행)를 한 종목씩 준다.
//
// 왜 (2026-10-07 정확성 2차): 화면의 «P/C(미결제약정)» 는 한 정의 — Intel 은 /api/intel/fast?app=1 이 같은 행에서 읽는다.
//   Flow 의 C/P 카드는 live/ticker 의 rawChain(주간 만기 1개)을 합산해 «OI» 라고 보였다 → 이 값을 받아 같은 정의로 그린다.
//   행이 없으면 아래 35일 대체(같은 범위만), 그것도 없으면 null(앱은 «—») — 다른 만기 범위의 값으로 메우지 않는다. 웹은 이 경로를 쓰지 않는다.
//   쓰기는 체인 35일 합산 저장본(oi35:chain:v1:*) 하나뿐(2026-10-20 NB1).
// ============================================================================
import { NextResponse, after } from 'next/server';
import { oiPcrAllExpiries, isFreshOptionsRow, oiRowHasQuantities } from '@/lib/app/intelOptionsBasis';
import { readOi35Fallback, buildChainOi35, type Oi35Fallback } from '@/services/oiNear35Fallback';

/**
 * [2026-10-19 D16] 수집 Lambda 행이 멈춘 종목(WTFC·FITB 8/28)의 대체 — 옵션 EOD 묶음(intrinio:options:eod)의 «가까운 만기 35일» 합계.
 * [2026-10-20 NB1] 그것도 없으면(SPY·QQQ — EC2 수집기 callOI35 미배포·묶음 밖 종목) 공급사 EOD 체인의 «오늘~+35일 안 만기 전부» 합계(저장본).
 * 둘 다 같은 범위(35일 안 만기)만 쓴다 — 전 만기 합계(pcrOI)·일부 만기 합계로 메우지 않는다. 순서·검사는 services/oiNear35Fallback 한 곳.
 * 체인 저장본이 없으면 여기서 계산을 시작한다(종목당 잠금·실패 쉼) — 2.5초 안에 끝나면 이번 응답에, 아니면 응답 뒤 마저 해서 다음 갱신(30초)에 나간다.
 */
const BUILD_WAIT_MS = 2500;
/** 앱은 이 경로를 4.5초에 끊는다 — 행 읽기·묶음 읽기에 쓴 시간을 빼고 남은 만큼만 기다린다 */
const RESPONSE_BUDGET_MS = 3800;
async function chainFallbackNow(t: string, waitMs: number): Promise<Oi35Fallback | null> {
    let build: Promise<{ value: Oi35Fallback | null; reason: string }>;
    try { build = buildChainOi35(t); } catch { return null; }
    const timeout = new Promise<null>((resolve) => { const h = setTimeout(() => resolve(null), Math.max(0, Math.min(BUILD_WAIT_MS, waitMs))); (h as any)?.unref?.(); });
    const first = await Promise.race([build.then((r) => r.value), timeout]);
    if (first) return first;
    try { after(() => build.then(() => undefined)); } catch { /* 요청 범위 밖(시험) — 계산은 그대로 진행 */ }
    return null;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
    const started = Date.now();
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
    // ★2026-10-20: 수집 행은 신선한데 OI 합계가 비어(SPY 등) P/C 를 못 내면 null 을 주지 않고
    //   직전 EOD 35일 범위로 넘어간다(대표 «지표에 빈 값이 나오는 것은 말도 안 된다» · 장중 OPI 0.0 의 뿌리).
    // OI 수량 자체가 결측일 때만 대체한다 — 콜 0·풋 100 처럼 P/C 만 계산 불가인 유효 수량은 그대로 쓴다(관문 10200048).
    //   «결측» = 콜·풋 중 하나라도 측정값이 아님(2026-10-20 NB1: 콜 100·풋 null 이 P/C 0 이 되던 경로) — live/ticker 와 같은 규칙(oiRowHasQuantities).
    const use = fresh && oiRowHasQuantities(row) ? row : null;
    const near = use ? null : ((await readOi35Fallback(t)) ?? (await chainFallbackNow(t, RESPONSE_BUDGET_MS - (Date.now() - started))));
    if (near) {
        return NextResponse.json(
            {
                success: true, ticker: t, pcr: near.pcr, callOI: near.callOI, putOI: near.putOI, contracts: null,
                // asOf = 그 EOD 세션의 정규장 마감 시각(대체값의 시각 — 멈춘 수집 행 시각을 싣지 않는다)
                asOf: near.asOf, stale: false, staleRow: !!row,
                // eodDate = 공급사 EOD 레코드 날짜(D) · oiDate = 그 OI 의 기준일(D−1 마감 — 레코드 D 의 OI 는 D 아침 OCC 공표분)
                basis: near.basis, eodDate: near.recordDate, oiDate: near.oiDate,
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
