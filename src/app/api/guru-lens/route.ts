import { NextRequest, NextResponse } from 'next/server';
import { isLensId } from '@/lib/guruLens/rules';
import { HEAD_KEY, readSnapshot, selectSnapshot, type Head } from '@/lib/guruLens/pipeline';
import { readonlyCache, currentBadges } from '@/lib/guruLens/service';
import { holdingBadge } from '@/lib/guruLens/badges';
import { GURU_UNIVERSE } from '@/lib/guruLens/sources';
import type { Evaluation, Snapshot } from '@/lib/guruLens/types';
import { FREE_ROWS } from '@/lib/guruLens/access';
import { clientIpFrom, guruProAccess } from '@/lib/guruLens/proAccess';

export const runtime = 'nodejs';
// 무료 역조회의 reason 은 화면이 읽는 부분(financial_strength «F점수 n/9;» 접두, lib/app/guruLens whyLine)만 남긴다.
// roc_ey 의 «순위합» 같은 순위 정보는 화면에 쓰이지 않으므로 무료 응답에 싣지 않는다.
const freeReason = (reason: string) => reason.match(/^F점수 \d\/9;/)?.[0] ?? '';
export const dynamic = 'force-dynamic';

// A published generation is immutable (same date key = same content). Keep the parsed
// snapshot per warm instance and re-read only the small head pointer on each request,
// so the ticker chip does not pull all 10 lens lists (≈7MB) from the store per page view.
let memo: { head: string; snapshot: Snapshot } | null = null;
let unavailable: { until: number; failed: boolean } | null = null;
let pending: Promise<Snapshot | null> | null = null;
async function publishedSnapshot() {
    if (unavailable && Date.now() < unavailable.until) {
        if (unavailable.failed) throw new Error('snapshot_read_failed');
        return null;
    }
    // Share a cold read across simultaneous ticker/list requests in this warm instance.
    if (pending) return pending;
    pending = (async () => {
        try {
            const head = await readonlyCache.read<Head>(HEAD_KEY);
            const key = JSON.stringify(head ?? null);
            if (memo && memo.head === key) return memo.snapshot;
            const snapshot = await readSnapshot(readonlyCache, head);
            memo = snapshot ? { head: key, snapshot } : null;
            unavailable = snapshot ? null : { until: Date.now() + 60_000, failed: false };
            return snapshot;
        } catch (error) {
            unavailable = { until: Date.now() + 60_000, failed: true };
            throw error;
        }
    })();
    try { return await pending; }
    finally { pending = null; }
}
/** Rows whose verdict is known: a pass, or a fail computed from complete raw inputs.
 * Legacy generations without the provenance flag return null (no denominator is claimed). */
function determinedCount(rows: Evaluation[]): number | null {
    if (!rows.some((r) => typeof r.inputsComplete === 'boolean')) return null;
    return rows.filter((r) => r.passed || r.inputsComplete === true).length;
}
const names = new Map(GURU_UNIVERSE.map((r) => [r.t, r.name]));

export async function GET(req: NextRequest) {
    const p = req.nextUrl.searchParams,
        lens = p.get('lens') ?? undefined,
        ticker = p.get('ticker')?.trim().toUpperCase(),
        // badges=0: the ticker chip needs only the rule verdicts (no badge reads).
        withBadges = p.get('badges') !== '0';
    // 권한 응답은 공개 URL에서 절대로 만들지 않는다(CDN의 익명 캐시 적중 방지).
    const uid = req.headers.get('x-rc-app-user-id');
    const privateRequest = p.has('access') || uid !== null;
    const headers = {
        'Cache-Control': privateRequest ? 'private, no-store' : withBadges
            ? 'public, s-maxage=60' : 'public, s-maxage=600, stale-while-revalidate=3600',
        Vary: 'x-rc-app-user-id',
    };
    const unavailableHeaders = { ...headers, 'Cache-Control': privateRequest ? 'private, no-store' : 'public, s-maxage=60' };
    const rawLimit = p.get('limit'),
        limit = rawLimit === null ? 10 : Number(rawLimit);
    if (
        (lens !== undefined && !isLensId(lens)) ||
        (p.has('ticker') && (!ticker || !GURU_UNIVERSE.some((r) => r.t === ticker))) ||
        (p.has('badges') && !['0', '1'].includes(p.get('badges')!)) ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50
    )
        return NextResponse.json({ error: 'invalid_query' }, { status: 400, headers: { ...headers, 'Cache-Control': 'private, no-store' } });
    try {
        let isPro = false;
        // 서버 PRO 판정(lib/guruLens/proAccess): Redis 공유 판정 → 처음 보는 ID 만 예산 안에서 RevenueCat.
        if (p.get('access') === 'pro' && uid) {
            try { isPro = (await guruProAccess(uid, { ip: clientIpFrom(req.headers) })).pro; }
            catch { /* 판정 모듈 자체 오류는 무료 범위만 반환한다. */ }
        }
        const snapshot = await publishedSnapshot();
        if (!snapshot)
            return NextResponse.json(
                { available: false, reason: 'no_published_snapshot' },
                { status: 503, headers: unavailableHeaders },
            );
        const selected = selectSnapshot(snapshot, lens && isLensId(lens) ? lens : undefined, ticker);
        // Reverse lookup is computed over ALL evaluated rows before applying list pagination.
        const lists = selected.lenses.map((l) => ({
            ...l,
            evaluatedCount: l.rows.length,
            determinedCount: determinedCount(l.rows),
            rows: ticker
                ? l.rows
                : l.passCount
                  ? l.rows.filter((r) => r.passed).slice(0, limit)
                  : // «가장 가까운 종목»은 원입력이 다 있는 미통과 행만 — 결측으로 낮게 나온 값(0 등)을 «근접»으로 내보내지 않는다.
                    l.rows.filter((r) => r.inputsComplete === true).slice(0, 5),
            mode: l.passCount ? 'passed' : 'closest',
        }));
        const tickers = [...new Set(lists.flatMap((l) =>
            (ticker || isPro ? l.rows : l.rows.slice(0, FREE_ROWS)).map((r) => r.ticker)))];
        const badges = withBadges ? await currentBadges(tickers) : {};
        const lenses = lists.map((l) => ({
            ...l,
            rows: l.rows.map((r, index) => {
                if (!ticker && !isPro && index >= FREE_ROWS)
                    return { rank: index + 1, locked: true };
                const b = badges[r.ticker];
                return {
                    // 종목 칩·이유는 무료 기능이다. 역조회로 순위 점수를 모으는 경로는 닫는다.
                    ...(ticker && !isPro ? {
                        ticker: r.ticker, passed: r.passed, checks: r.checks, reason: freeReason(r.reason),
                        ...(r.inputsComplete === undefined ? {} : { inputsComplete: r.inputsComplete }),
                    } : r),
                    name: names.get(r.ticker) ?? null,
                    badges: withBadges
                        ? {
                              own13f: holdingBadge(l.definition.id, b?.holdingIndex ?? null),
                              money: b?.money ?? null,
                              earnings: b?.earnings ?? null,
                          }
                        : null,
                };
            }),
        }));
        return NextResponse.json(
            { ...selected, available: true, lenses, badgesAsOf: withBadges ? new Date().toISOString() : null },
            { headers },
        );
    } catch {
        return NextResponse.json(
            { available: false, reason: 'read_failed' },
            { status: 503, headers: unavailableHeaders },
        );
    }
}
