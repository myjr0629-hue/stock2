// ============================================================================
// /api/app/options-latest — 앱 전용: 종목별 옵션 지표(GEX·P/C 35일 이내 전 만기)를 수집 Lambda DynamoDB 최신 행에서 읽어 준다.
//
// 왜 (2026-10-07 정확성 3차): 앱 Intel 의 설정 목록 종목 중 «어느 엔진 목록에도 없는» RGTI·QBTS 는 시세를 배치로 따로 받는데 배치의 GEX·P/C 는 만기 범위가 달라 못 쓴다.
//   /api/intel/fast?app=1 이 엔진 목록 종목에 쓰는 것과 «같은 규칙»(5일 안의 행 · gexFromRow · oiPcrAllExpiries)으로 읽어 같은 정의를 맞춘다.
//   읽기 전용(쓰기 0) · 행이 없거나 낡으면 null(앱은 «—») · 웹은 이 경로를 쓰지 않는다. 최대 8종목.
// ============================================================================
import { NextResponse } from 'next/server';
import { optionsFromRow } from '@/lib/app/intelExtraOptions';

export const dynamic = 'force-dynamic';

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export async function GET(request: Request) {
    const raw = (new URL(request.url).searchParams.get('tickers') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const tickers = Array.from(new Set(raw)).slice(0, 8);
    if (tickers.length === 0 || !tickers.every((t) => TICKER_RE.test(t))) {
        return NextResponse.json({ success: false, error: 'invalid tickers' }, { status: 400 });
    }
    const rows: Record<string, ReturnType<typeof optionsFromRow>> = {};
    try {
        const { getLatestGex } = await import('@/lib/aws/dynamoDataProvider');
        const got = await Promise.all(tickers.map((t) => Promise.race([
            getLatestGex(t).catch(() => null),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
        ])));
        const now = Date.now();
        tickers.forEach((t, i) => { rows[t] = optionsFromRow(got[i], now); });
    } catch {
        tickers.forEach((t) => { rows[t] = optionsFromRow(null); });
    }
    return NextResponse.json(
        { success: true, rows, basis: 'oi_all_expiries_35d · dynamo_latest_row' },
        { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
}
