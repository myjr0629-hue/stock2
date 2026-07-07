// [8-K DISCLOSURES] Per-ticker material corporate events (Massive 8-K, daily refresh)
// Consumers: Command badge, Intel key-stock strip, Undercurrent ticker detail.
// ETFs return empty (no 8-Ks). `&insider=1` also returns a Form-4 insider
// summary ("회사·내부자의 행동" — the second layer of the three-way contrast).
import { NextRequest, NextResponse } from 'next/server';
import { getTickerDisclosures, isEtfTicker } from '@/services/disclosures';
import { getInsiderSummary } from '@/services/insiderService';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
    const t = req.nextUrl.searchParams.get('t');
    if (!t || !/^[A-Z.]{1,6}$/i.test(t)) {
        return NextResponse.json({ error: 'Missing or invalid t param' }, { status: 400 });
    }
    const wantInsider = req.nextUrl.searchParams.get('insider') === '1';
    try {
        const T = t.toUpperCase();
        const [data, insiderRaw] = await Promise.all([
            getTickerDisclosures(T),
            wantInsider && !isEtfTicker(T)
                ? getInsiderSummary(T).catch(() => null)
                : Promise.resolve(null),
        ]);
        const insider = insiderRaw
            ? {
                net30d: insiderRaw.net30d,
                buyCount: insiderRaw.buyCount,
                sellCount: insiderRaw.sellCount,
                sentiment: insiderRaw.sentiment,
                latest: insiderRaw.latest
                    ? { name: insiderRaw.latest.name, title: insiderRaw.latest.title, code: insiderRaw.latest.code, value: insiderRaw.latest.value, date: insiderRaw.latest.date }
                    : null,
            }
            : null;
        return NextResponse.json({ ...data, ...(wantInsider ? { insider } : {}) }, {
            headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' }
        });
    } catch (e: any) {
        return NextResponse.json({ ticker: t.toUpperCase(), events: [] }, { status: 200 });
    }
}
