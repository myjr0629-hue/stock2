// [8-K DISCLOSURES] Per-ticker material corporate events (Massive 8-K, daily refresh)
// Consumers: Command badge, Intel key-stock strip. ETFs return empty (no 8-Ks).
import { NextRequest, NextResponse } from 'next/server';
import { getTickerDisclosures } from '@/services/disclosures';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
    const t = req.nextUrl.searchParams.get('t');
    if (!t || !/^[A-Z.]{1,6}$/i.test(t)) {
        return NextResponse.json({ error: 'Missing or invalid t param' }, { status: 400 });
    }
    try {
        const data = await getTickerDisclosures(t);
        return NextResponse.json(data, {
            headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' }
        });
    } catch (e: any) {
        return NextResponse.json({ ticker: t.toUpperCase(), events: [] }, { status: 200 });
    }
}
