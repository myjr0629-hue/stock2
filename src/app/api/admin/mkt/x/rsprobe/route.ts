import { NextRequest, NextResponse } from 'next/server';
import { X_TARGETS } from '@/lib/marketing-console/mkt';
import { scanTargets } from '@/lib/marketing-console/xScan';

// TEMPORARY probe — shows each scanned tweet's replySettings/canReply so we can
// tell whether the search API reliably reports reply restrictions. Delete after.
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('probe') !== 'signum-rs-2026') {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    const tweets = await scanTargets(X_TARGETS.map((t) => t.handle), 12);
    return NextResponse.json({
      ok: true,
      count: tweets.length,
      tweets: tweets.map((t) => ({ author: t.author, replySettings: t.replySettings, canReply: t.canReply, text: t.text.slice(0, 40) })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
