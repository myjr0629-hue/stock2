import { NextResponse } from 'next/server';
import { loadBackdrop, simInputsFrom } from '@/services/marketBackdropLoader';
import { buildBackdrop } from '@/lib/marketBackdrop';

/**
 * GET /api/market/now — «지금 시장» 배경 한 벌: 현물 지수·지수 선물·10년물, 값마다 세션 날짜와 live 여부.
 * 10년물은 SIGNUM 대시보드와 같은 통일본이다(WIM 칩이 FRED 전일값 5.17%를 «지금»처럼 쓰던 자리).
 * 판정 규칙은 src/lib/marketBackdrop.ts. 프리뷰에서만 `?sim=` 로 시각·시세를 넣어 볼 수 있다.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const sim = simInputsFrom(new URL(request.url));
    try {
        const backdrop = sim ? buildBackdrop(sim) : await loadBackdrop();
        return NextResponse.json({ success: true, backdrop, ...(sim ? { _sim: true } : {}) }, {
            headers: { 'Cache-Control': sim ? 'no-store' : 'public, s-maxage=30, stale-while-revalidate=60' },
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'failed' }, { status: 500 });
    }
}
