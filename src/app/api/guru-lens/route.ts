import { NextRequest, NextResponse } from 'next/server';
import { isLensId } from '@/lib/guruLens/rules';
import { HEAD_KEY, readSnapshot, selectSnapshot, type Head } from '@/lib/guruLens/pipeline';
import { readonlyCache, currentBadges } from '@/lib/guruLens/service';
import { holdingBadge } from '@/lib/guruLens/badges';
import { GURU_UNIVERSE } from '@/lib/guruLens/sources';
import type { Evaluation, Snapshot } from '@/lib/guruLens/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A published generation is immutable (same date key = same content). Keep the parsed
// snapshot per warm instance and re-read only the small head pointer on each request,
// so the ticker chip does not pull all 10 lens lists (≈7MB) from the store per page view.
let memo: { head: string; snapshot: Snapshot } | null = null;
async function publishedSnapshot() {
    const head = await readonlyCache.read<Head>(HEAD_KEY);
    const key = JSON.stringify(head ?? null);
    if (memo && memo.head === key) return memo.snapshot;
    const snapshot = await readSnapshot(readonlyCache, head);
    memo = snapshot ? { head: key, snapshot } : null;
    return snapshot;
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
        return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
    try {
        const snapshot = await publishedSnapshot();
        if (!snapshot)
            return NextResponse.json(
                { available: false, reason: 'no_published_snapshot' },
                { status: 503, headers: { 'Cache-Control': 'no-store' } },
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
                  : l.rows.slice(0, 5),
            mode: l.passCount ? 'passed' : 'closest',
        }));
        const tickers = [...new Set(lists.flatMap((l) => l.rows.map((r) => r.ticker)))];
        const badges = withBadges ? await currentBadges(tickers) : {};
        const lenses = lists.map((l) => ({
            ...l,
            rows: l.rows.map((r) => {
                const b = badges[r.ticker];
                return {
                    ...r,
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
            {
                headers: {
                    // Verdicts change weekly; badges move with the daily feeds.
                    'Cache-Control': withBadges
                        ? 'public, s-maxage=60'
                        : 'public, s-maxage=600, stale-while-revalidate=3600',
                },
            },
        );
    } catch {
        return NextResponse.json(
            { available: false, reason: 'read_failed' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
