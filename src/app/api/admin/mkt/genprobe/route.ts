import { NextRequest, NextResponse } from 'next/server';
import { generateDrafts } from '@/lib/marketing-console/generate';

// TEMPORARY probe — verifies 4-channel grounded generation + lint. Delete after.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-gen-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  const ticker = (req.nextUrl.searchParams.get('t') || 'NVDA').toUpperCase();
  try {
    const r = await generateDrafts(ticker, 'event');
    return NextResponse.json({
      ok: true,
      ticker: r.ticker,
      grounded: r.grounded,
      levels: r.levels,
      drafts: r.drafts.map((d) => ({ channel: d.channel, text: d.text, lintPass: d.lint.pass })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
