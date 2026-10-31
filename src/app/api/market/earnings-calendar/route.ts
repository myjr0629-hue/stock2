// ============================================================================
// /api/market/earnings-calendar — 시장 전체 실적 캘린더
//
// 만들기·캐시·벤더 근거는 services/earningsCalendarService.ts 로 옮겼다(2026-09-30) —
// Command·Intel·웹 티커·랭킹도 같은 캘린더로 실적일을 고르게 되었다(lib/earningsDate.ts 의 pickNextEarnings).
// 이 라우트는 캘린더에 회사 이름·관전 포인트(브리프)를 얹어 돌려주기만 한다. 응답 모양은 예전과 같다.
// ============================================================================

import { NextResponse, after } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getMarketEarningsCalendar, type EarningsCalendarResult } from '@/services/earningsCalendarService';
import { attachBriefs, briefEntryKey, briefNeedsFill, EARNINGS_BRIEF_KEY, type BriefPack } from '@/lib/earnings/earningsBrief';
import { attachImplied, impliedPackStale } from '@/lib/earnings/earningsImplied';
import { readImpliedPack, refreshImpliedPack } from '@/services/earningsImpliedService';
import { attachCalendarOnlyImplied, calendarOnlyAddition } from '@/services/earningsCalendarOnlyService';
import { publicBase } from '@/lib/net/publicBase';

export type { EarningsRow } from '@/services/earningsCalendarService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
// 응답 뒤(after) 변동폭 묶음 갱신·관전 포인트 채우기 신호까지 — 사용자 응답 시간과는 무관하다
export const maxDuration = 60;

/**
 * ★ [2026-09-10] 실적 캘린더에 «회사 이름»과 «관전 포인트»를 얹는다.
 *
 *   이 화면은 티커·날짜·EPS·매출 숫자만 보여 줬다. 162개 회사가 전부 그랬다.
 *   ORCL 을 봐도 무슨 회사인지, 이번 분기에 뭘 봐야 하는지 알 수 없었다.
 *   /api/cron/earnings-brief 가 만들어 Redis 에 두고, 여기서 행에 붙인다.
 *   없으면 붙이지 않는다 — 기존 화면 그대로라 절대 비지 않는다.
 *
 * ★ [2026-10-04] 문구의 숫자가 표와 어긋났다(10/13 C 표 $2.66·문구 $2.68 · GS $14.44·$16.14 …).
 *   글은 «티커|보고일» 로 찾고(다음 분기 행에 옛 글이 붙지 않는다), {EPS}·{REV} 자리표를
 *   «이 행»의 값·표와 같은 포맷으로 채운 뒤, 남은 숫자가 표와 다르면 그 언어 문구를 빼고 보낸다.
 *   캐시 적중·미스 모두 이 출구를 지난다 — lib/earnings/earningsBrief.ts attachBriefs.
 */
async function attachEarningsBrief(rows: any[], fillRows: any[] = rows): Promise<{ rows: any[]; aiCount: number; aiAt: string | null; aiBlocked: number; needFill: number }> {
    try {
        const pack = await getFromCache<BriefPack>(EARNINGS_BRIEF_KEY);
        // ★ [2026-10-12] 글이 없거나 언어가 빠진 행 — 크론(earnings-brief)과 같은 규칙(briefNeedsFill)으로 센다. 응답 «뒤»에 채우기를 부른다.
        //   [T30] 정식명 표에 있는 종목은 회사가 다른 글도 «채울 행»으로 센다(크론이 버리고 새로 만든다).
        //   [T40] 캘린더 전용 행은 세지 않는다(fillRows = 공통 행) — 크론은 공통 캘린더만 만들므로 세면 채우지도 못하는 호출만 반복된다.
        const needFill = fillRows.filter((r) => r?.ticker && r?.date && briefNeedsFill(pack?.entries?.[briefEntryKey(r.ticker, r.date)], r.ticker)).length;
        if (!pack?.entries) return { rows, aiCount: 0, aiAt: null, aiBlocked: 0, needFill };
        const m = attachBriefs(rows, pack);
        if (m.blocked) console.warn(`[earnings-calendar] brief blocked ${m.blocked}: ${m.blockedSample.join(' · ')}`);
        return { rows: m.rows, aiCount: m.aiCount, aiAt: pack.generatedAt || null, aiBlocked: m.blocked, needFill };
    } catch {
        return { rows, aiCount: 0, aiAt: null, aiBlocked: 0, needFill: 0 };
    }
}

/**
 * ★ [2026-10-12] 빠진 «관전 포인트»를 응답 뒤에 채운다 — 사용자는 기다리지 않는다(이번 응답은 있는 글만, 다음 열기부터 새 글).
 *   만드는 일은 크론(/api/cron/earnings-brief)이 한다: «티커|보고일» 단위 글 · 사다리 EarningsBrief(① 크레딧 Haiku 5.5) · 같은 가드.
 *   20분 잠금으로 요청이 몰려도 한 번만 부른다. 크론 비밀이 없는 환경(로컬)에서는 부르지 않는다.
 */
const BRIEF_FILL_LOCK = 'earnings:brief:fill-lock';
/** 응답 뒤 일 — 요청 범위 밖(시험·스크립트)에서는 after 가 던지므로 그때는 하지 않는다(사용자 응답에는 영향 없음) */
function afterSafe(fn: () => Promise<unknown>): void {
    try { after(fn); } catch { /* 요청 범위 밖 */ }
}
async function triggerBriefFill(reqUrl: string): Promise<void> {
    const secret = process.env.CRON_SECRET;
    if (!secret) return;
    if (await getFromCache<any>(BRIEF_FILL_LOCK).catch(() => null)) return;
    await setInCache(BRIEF_FILL_LOCK, { at: Date.now() }, 20 * 60).catch(() => false);
    const base = publicBase(reqUrl.split('/api/')[0]);
    const headers: Record<string, string> = { Authorization: `Bearer ${secret}` };
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    try {
        const r = await fetch(`${base}/api/cron/earnings-brief`, { headers, cache: 'no-store', signal: AbortSignal.timeout(58_000) });
        const j: any = await r.json().catch(() => null);
        console.log(`[earnings-calendar] 관전 포인트 채우기 ${r.status} made=${j?.made ?? '-'} todo=${j?.todo ?? '-'} skipped=${j?.skipped ?? '-'}`);
    } catch (e) {
        console.warn('[earnings-calendar] 관전 포인트 채우기 실패:', (e as Error)?.message);
    }
}

/**
 * ★ [2026-10-12] 앱 실적 화면의 «옵션 반영 변동폭» — 웹 /earnings-week 와 같은 문(readImpliedMoveRows)으로 묶어 둔 작은 묶음을 붙인다.
 *   묶음이 낡았으면(장중 5분·그 밖 60분·날짜 바뀜) 응답 «뒤»에 다시 만든다. 사용자 경로는 묶음 GET 한 번.
 */
async function attachEarningsImplied(rows: any[]): Promise<{ rows: any[]; count: number; at: number | null; stale: boolean }> {
    try {
        const pack = await readImpliedPack();
        const m = attachImplied(rows, pack);
        return { rows: m.rows, count: m.count, at: pack?.at ?? null, stale: impliedPackStale(pack) };
    } catch {
        return { rows: rows.map((r) => ({ ...r, implied: null })), count: 0, at: null, stale: true };
    }
}

export async function GET(req: Request) {
  const deadlineMs = Date.now() + 50_000;
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  const calendarScope = new URL(req.url).searchParams.get('scope') === 'calendar';
  let r: EarningsCalendarResult;
  try {
    r = await getMarketEarningsCalendar({ fresh });
  } catch {
    return NextResponse.json({ ok: false, reason: 'unavailable' }, {
      status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '90' },
    });
  }
  if (r.ok) {
    // 캘린더 캐시와 브리프는 수명이 다르다 — 응답 직전에 합친다(캐시에는 «브리프 없는» 원본).
    const raw = r.payload.rows || [];
    const add = calendarScope ? calendarOnlyAddition(raw) : { rows: raw, extra: [] as any[] };
    const [m, im, ex] = await Promise.all([attachEarningsBrief(add.rows, raw), attachEarningsImplied(raw), attachCalendarOnlyImplied(add.extra)]);
    const impliedByKey = new Map([...im.rows, ...ex.rows].map((x: any) => [`${x.ticker}|${x.date}`, x.implied ?? null]));
    const rows = m.rows.map((x: any) => ({ ...x, implied: impliedByKey.get(`${x.ticker}|${x.date}`) ?? null }));
    if (im.stale && raw.length) {
      afterSafe(async () => {
        try {
          const res = await refreshImpliedPack(raw.map((x: any) => ({ ticker: x.ticker, date: x.date, hour: x.hour })), { deadlineMs });
          if (!res.skipped) console.log(`[earnings-calendar] 변동폭 묶음 ${res.ok ? '갱신' : '보류'} ${res.withValue ?? 0}/${res.total ?? 0} ${res.ms}ms`);
        } catch (e) { console.warn('[earnings-calendar] 변동폭 묶음 실패:', (e as Error)?.message); }
      });
    }
    if (m.needFill > 0) afterSafe(() => triggerBriefFill(req.url));
    return NextResponse.json({
      ...r.payload, rows, aiCount: m.aiCount, aiAt: m.aiAt, aiBlocked: m.aiBlocked,
      impliedCount: im.count + ex.count, impliedAt: im.at,
      _cache: r.cache === 'miss' ? 'miss' : 'hit',
    });
  }
  // 실패는 0건이 아니다. 90초 실패 캐시는 서비스가 그대로 관리하고, HTTP·본문 모두 실패로 알린다.
  return NextResponse.json({
    ok: false, reason: r.reason, probe: r.probe, failedAt: r.failedAt,
    ...(r.cache === 'fail-hit' ? { _cache: 'fail-hit' } : {}),
  }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '90' } });
}
