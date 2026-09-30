// ============================================================================
// /api/market/earnings-calendar — 시장 전체 실적 캘린더
//
// 만들기·캐시·벤더 근거는 services/earningsCalendarService.ts 로 옮겼다(2026-09-30) —
// Command·Intel·웹 티커·랭킹도 같은 캘린더로 실적일을 고르게 되었다(lib/earningsDate.ts 의 pickNextEarnings).
// 이 라우트는 캘린더에 회사 이름·관전 포인트(브리프)를 얹어 돌려주기만 한다. 응답 모양은 예전과 같다.
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache } from '@/services/redisClient';
import { getMarketEarningsCalendar } from '@/services/earningsCalendarService';

export type { EarningsRow } from '@/services/earningsCalendarService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * ★ [2026-09-10] 실적 캘린더에 «회사 이름»과 «관전 포인트»를 얹는다.
 *
 *   이 화면은 티커·날짜·EPS·매출 숫자만 보여 줬다. 162개 회사가 전부 그랬다.
 *   ORCL 을 봐도 무슨 회사인지, 이번 분기에 뭘 봐야 하는지 알 수 없었다.
 *   /api/cron/earnings-brief 가 만들어 Redis 에 두고, 여기서 행에 붙인다.
 *   없으면 붙이지 않는다 — 기존 화면 그대로라 절대 비지 않는다.
 */
async function attachEarningsBrief(rows: any[]): Promise<{ rows: any[]; aiCount: number; aiAt: string | null }> {
    try {
        const pack = await getFromCache<any>('earnings:brief:v2');
        if (!pack?.tickers) return { rows, aiCount: 0, aiAt: null };
        let n = 0;
        const merged = rows.map((r) => {
            const b = pack.tickers[r.ticker];
            if (!b) return r;
            n++;
            return { ...r, brief: b };   // { ko:{name,watch}, en:{...}, ja:{...} }
        });
        return { rows: merged, aiCount: n, aiAt: pack.generatedAt || null };
    } catch {
        return { rows, aiCount: 0, aiAt: null };
    }
}

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  const r = await getMarketEarningsCalendar({ fresh });
  if (r.ok) {
    // 캘린더 캐시와 브리프는 수명이 다르다 — 응답 직전에 합친다(캐시에는 «브리프 없는» 원본).
    const m = await attachEarningsBrief(r.payload.rows || []);
    return NextResponse.json({ ...r.payload, rows: m.rows, aiCount: m.aiCount, aiAt: m.aiAt, _cache: r.cache === 'miss' ? 'miss' : 'hit' });
  }
  // 방금(90초 안) 실패했다 — FMP 를 다시 부르지 않고 같은 실패를 돌려준다(E1)
  if (r.cache === 'fail-hit') {
    return NextResponse.json({ ok: true, rows: [], reason: r.reason, probe: r.probe, failedAt: r.failedAt, _cache: 'fail-hit' });
  }
  // 키가 없으면 «빈 채로» 돌려준다 — 화면이 섹션을 안 그린다
  if (r.reason === 'no-key') return NextResponse.json({ ok: true, rows: [], universe: 0, reason: 'no-key' });
  return NextResponse.json({ ok: true, rows: [], reason: r.reason, ...(r.probe ? { probe: r.probe } : {}) });
}
