// ============================================================================
// 크론 — 앱 실적 캘린더 «옵션 반영 변동폭» 묶음 갱신 (2026-10-12)
// ----------------------------------------------------------------------------
// 평일 장중(13~21시 UTC) 10분마다. 캘린더 행(이미 캐시된 FMP 캘린더 + 회사 공지 덮기)을 읽어
// 웹 /earnings-week 와 같은 문(readImpliedMoveRows)으로 행마다 숫자 다섯 개를 묶어 둔다(services/earningsImpliedService).
// 읽는 쪽(/api/market/earnings-calendar)도 낡은 묶음이면 응답 뒤에 다시 만든다 — 이 크론은 «첫 사람»이 낡은 값을 보지 않게 한다.
// AI 0. 결측 근거리 행만 기존 어댑터로 월간 체인을 확인(종목·만기별 1시간 재사용). 캘린더는 기존 6시간 캐시를 읽는다.
// 점검(인증된 호출만): ?force=1 (휴장일에도 갱신 시도, 동시 실행 잠금은 유지)
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getMarketEarningsCalendar } from '@/services/earningsCalendarService';
import { refreshImpliedPack } from '@/services/earningsImpliedService';
import { etDateOf, isNonTradingDay } from '@/lib/marketCalendar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const deadlineMs = Date.now() + 50_000;
    const force = new URL(req.url).searchParams.get('force') === '1';
    const today = etDateOf(Date.now());
    if (!force && isNonTradingDay(today)) return NextResponse.json({ success: true, skipped: 'non-trading-day', today });
    // 화면과 같은 행(회사 공지 덮기 뒤) — 캘린더 서비스가 캐시(6시간)·메모·실패 캐시를 지킨다(벤더는 캐시가 빌 때만)
    const cal = await getMarketEarningsCalendar().catch(() => null);
    const rows = cal && cal.ok ? (cal.payload.rows || []) : [];
    if (!rows.length) return NextResponse.json({ success: true, skipped: 'no-calendar' });
    const r = await refreshImpliedPack(rows, { force, deadlineMs });
    console.log(`[Cron/EarningsImplied] ${JSON.stringify(r)}`);
    return NextResponse.json({ success: r.ok || r.skipped === 'locked', ...r });
}
