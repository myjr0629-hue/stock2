import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin } from '@/lib/marketing-console/mkt';
import { draftReply, type ScanTweet } from '@/lib/marketing-console/xApi';

export const dynamic = 'force-dynamic';

// Generate a grounded reply draft for one scanned tweet (Bedrock + our real levels).
export async function POST(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  let body: { tweet?: ScanTweet; lang?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  if (!body.tweet?.id || !body.tweet.text) {
    return NextResponse.json({ ok: false, error: 'tweet required' }, { status: 400 });
  }

  const lang = body.lang === 'ja' ? 'ja' : 'en';
  const result = await draftReply(body.tweet, lang);
  return NextResponse.json({ ok: true, ...result });
}
