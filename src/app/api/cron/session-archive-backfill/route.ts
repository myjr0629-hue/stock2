// ============================================================================
// 완료 세션 보관본 채우기 (2026-10-19 묶음 3) — 배포 직후 1회 수동 호출(예약 없음).
// 새 공급사 호출 0(기본): Redis 에 이미 있는 판본·분봉·고래 캐시·옛 breadth 키에서 session:* 보관본으로 옮긴다(lib/sessionArchiveBackfill).
//   ?dry=1          — 쓰지 않고 셈만
//   ?t=A,B          — 종목 지정(기본: 앱 고정 종목 + 미국 300 유니버스)
//   ?snapshot=1     — breadth 보관본도 옛 키도 없을 때만 전수 스냅샷 1회(캐시 사용, 장외에서만)
//   ?now=<ms>       — 시각 가정(점검용)
// 인증: 다른 크론과 같은 Bearer CRON_SECRET.
// ============================================================================
import { NextRequest, NextResponse } from 'next/server';
import { backfillSessionArchives } from '@/lib/sessionArchiveBackfill';
import { backfillBreadthArchive } from '@/services/guardian/breadthEngine';
import { APP_WARM_FIXED } from '@/lib/appWarmTickers';
import CORE_FILE from '@/../data/stock_universe_us300.json';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const CORE: string[] = ((CORE_FILE as any)?.symbols ?? []) as string[];

export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const q = new URL(req.url).searchParams;
    const nowParam = Number(q.get('now'));
    const nowMs = Number.isFinite(nowParam) && nowParam > 0 ? nowParam : Date.now();
    const dry = q.get('dry') === '1';
    const tq = (q.get('t') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const tickers = tq.length ? tq : Array.from(new Set([...APP_WARM_FIXED, ...CORE]));
    const t0 = Date.now();
    const rep = await backfillSessionArchives(tickers, { nowMs, dry });
    const breadth = dry ? { result: 'dry' } : await backfillBreadthArchive({ nowMs, allowSnapshot: q.get('snapshot') === '1' }).catch((e) => ({ result: `error:${String(e?.message || e).slice(0, 60)}` }));
    return NextResponse.json({ ok: true, ms: Date.now() - t0, breadth, ...rep });
}
