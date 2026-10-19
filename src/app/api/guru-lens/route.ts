import { NextRequest, NextResponse } from 'next/server';
import { isLensId } from '@/lib/guruLens/rules';
import { readSnapshot, selectSnapshot } from '@/lib/guruLens/pipeline';
import { readonlyCache, currentBadges } from '@/lib/guruLens/service';
import { holdingBadge } from '@/lib/guruLens/badges';
import { GURU_UNIVERSE } from '@/lib/guruLens/sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
    const p = req.nextUrl.searchParams,
        lens = p.get('lens') ?? undefined,
        ticker = p.get('ticker')?.trim().toUpperCase();
    const rawLimit = p.get('limit'),
        limit = rawLimit === null ? 10 : Number(rawLimit);
    if (
        (lens !== undefined && !isLensId(lens)) ||
        (p.has('ticker') && (!ticker || !GURU_UNIVERSE.some((r) => r.t === ticker))) ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50
    )
        return NextResponse.json({ error: 'invalid_query' }, { status: 400 });
    try {
        const snapshot = await readSnapshot(readonlyCache);
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
            rows: ticker
                ? l.rows
                : l.passCount
                  ? l.rows.filter((r) => r.passed).slice(0, limit)
                  : l.rows.slice(0, 5),
            mode: l.passCount ? 'passed' : 'closest',
        }));
        const tickers = [...new Set(lists.flatMap((l) => l.rows.map((r) => r.ticker)))];
        const badges = await currentBadges(tickers);
        const lenses = lists.map((l) => ({
            ...l,
            rows: l.rows.map((r) => {
                const b = badges[r.ticker];
                return {
                    ...r,
                    badges: {
                        own13f: holdingBadge(l.definition.id, b?.holdingIndex ?? null),
                        money: b?.money ?? null,
                        earnings: b?.earnings ?? null,
                    },
                };
            }),
        }));
        return NextResponse.json(
            { ...selected, available: true, lenses, badgesAsOf: new Date().toISOString() },
            { headers: { 'Cache-Control': 'public, s-maxage=60' } },
        );
    } catch {
        return NextResponse.json(
            { available: false, reason: 'read_failed' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
