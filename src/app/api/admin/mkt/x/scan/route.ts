import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin } from '@/lib/marketing-console/mkt';
import { scanTargets } from '@/lib/marketing-console/xApi';
import { X_TARGETS, X_TARGETS_JP } from '@/lib/marketing-console/mkt';

export const dynamic = 'force-dynamic';

// Real scan of target accounts' recent posts (X app-only Bearer read).
export async function GET(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  const lang = req.nextUrl.searchParams.get('lang') === 'ja' ? 'ja' : 'en';
  const targets = (lang === 'ja' ? X_TARGETS_JP : X_TARGETS).map((t) => t.handle);

  try {
    const tweets = await scanTargets(targets, 10);
    return NextResponse.json({ ok: true, lang, count: tweets.length, tweets });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
}
