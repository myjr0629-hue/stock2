import { NextRequest, NextResponse } from 'next/server';

/**
 * /api/cron/ranking-build — 「평소 대비 이탈」 랭킹의 조각을 굽는다.
 *
 * 왜 필요한가:
 *   랭킹 유니버스가 25 → **2,001종목**이 되면서 한 요청에 다 훑으면
 *   약 370초가 걸린다(실측 종목당 186ms · 동시성 80). Vercel 상한은 60초다.
 *   그래서 `/api/ranking/deviation?build=<i>` 로 8조각을 나눠 굽고,
 *   일반 요청은 구워 둔 조각을 합쳐서 답한다.
 *
 * 왜 크론이 «하나»인가:
 *   크론이 이미 32개다. 조각마다 크론을 달면 한도에 걸린다.
 *   여기서 8개를 **병렬로 던진다.** 각 build 요청은 자기만의 60초 예산을
 *   가진 별도 실행이므로, 이쪽은 8개가 동시에 끝나기를 기다리기만 하면 된다
 *   (실측 조각당 32초 → 병렬 전체 약 35~45초).
 *
 * ⚠️ 자기 호출은 **공개 도메인**으로 나가야 한다. 요청 origin 을 쓰면
 *    크론이 도는 보호 경로에서 자기 자신을 못 부른다(이전에 겪은 함정).
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SHARDS = 8;
const ORIGIN = 'https://www.signumhq.com';

export async function GET(req: NextRequest) {
    // Vercel 크론은 헤더로 자기를 밝힌다. 수동 호출도 허용하되 기록은 남긴다.
    const byCron = req.headers.get('user-agent')?.includes('vercel-cron') ?? false;
    const days = Math.min(90, Math.max(10, Number(req.nextUrl.searchParams.get('days')) || 30));

    const started = Date.now();
    const results = await Promise.all(
        Array.from({ length: SHARDS }, async (_, i) => {
            const t0 = Date.now();
            try {
                const res = await fetch(`${ORIGIN}/api/ranking/deviation?build=${i}&days=${days}`, {
                    cache: 'no-store',
                    // 조각 하나가 늦어도 나머지 보고는 나가야 한다.
                    signal: AbortSignal.timeout(55000),
                });
                const j: any = await res.json().catch(() => null);
                return {
                    shard: i, ok: res.ok, ms: Date.now() - t0,
                    tickers: j?.tickers ?? null, candidates: j?.candidates ?? null,
                };
            } catch (e: any) {
                return { shard: i, ok: false, ms: Date.now() - t0, error: e?.message ?? 'failed' };
            }
        }),
    );

    const ok = results.filter((r) => r.ok).length;
    const candidates = results.reduce((a, r) => a + (r.candidates ?? 0), 0);

    // 조각이 다 구워졌으면 합본 캐시도 새로 만들어 둔다.
    // (안 하면 첫 사용자가 병합 비용을 물고, 그동안 옛 합본이 나간다.)
    let merged: any = null;
    if (ok === SHARDS) {
        try {
            const res = await fetch(`${ORIGIN}/api/ranking/deviation?refresh=1`, {
                cache: 'no-store', signal: AbortSignal.timeout(20000),
            });
            const j: any = await res.json().catch(() => null);
            merged = { ok: res.ok, session: j?.session ?? null, ranked: j?.ranking?.length ?? 0, partial: j?.partial ?? null };
        } catch (e: any) {
            merged = { ok: false, error: e?.message ?? 'failed' };
        }
    }

    return NextResponse.json({
        ok: ok === SHARDS,
        byCron, days, shards: SHARDS, built: ok,
        candidates, totalMs: Date.now() - started,
        merged, results,
    });
}
