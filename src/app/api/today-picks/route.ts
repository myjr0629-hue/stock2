// ============================================================================
// GET /api/today-picks?loc=ko — «✦ AI 오늘 볼 것» 읽기 (2026-10-13)
// ----------------------------------------------------------------------------
//   · 사용자 경로에서 생성을 기다리지 않는다: 저장된 문서를 읽고 FINRA 수치는 같은 저장 원천에서 대조한다(2.2초 예산, 실패 시 날짜가 붙은 저장본 유지). AI·공급사 호출 0.
//   · 2.5초 안에 못 읽으면 빈 응답(카드는 그리지 않는다). 저장소가 멈춰도 응답을 붙잡지 않는다.
//   · 끄기: 레디스 todaypicks:off (재배포 없이) 또는 TODAY_PICKS_OFF=1 → { off: true, items: [] }.
//   · 응답은 그 언어 한 벌(label·asOf·what·why)과 선별 시각뿐 — 내부 사실(facts)은 싣지 않는다.
// ============================================================================
import { NextResponse } from 'next/server';
import { readPicks } from '@/services/todayPicksService';
import { buildView } from '@/lib/todayPicks/view';
import type { Loc } from '@/lib/todayPicks/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

const READ_BUDGET_MS = 2_500;
const HEADERS = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
    const q = new URL(request.url).searchParams;
    const locRaw = q.get('loc');
    const loc: Loc = locRaw === 'ko' || locRaw === 'ja' ? locRaw : 'en';
    const read = await Promise.race([
        readPicks(),
        new Promise<null>((r) => setTimeout(() => r(null), READ_BUDGET_MS)),
    ]);
    if (!read) return NextResponse.json({ off: false, items: [], hasFinra: false, slow: true }, { headers: HEADERS });
    return NextResponse.json(buildView(read.doc, loc, read.off), { headers: HEADERS });
}
