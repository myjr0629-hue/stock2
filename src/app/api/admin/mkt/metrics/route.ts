import { NextRequest, NextResponse } from 'next/server';
import { requireMktAdmin, appendAudit, etDate } from '@/lib/marketing-console/mkt';
import { getFromCache, setInCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Cold-start metrics. `?from=` hits are auto (once /app patch lands); the rest
// are manual entry for the first weeks (X analytics / store reconciliation).
const KEY_MANUAL = 'mkt:metrics:manual';
const KEY_HITS = (from: string) => `mkt:attr:hit:${from}:${etDate()}`;

interface ManualStats {
  weekOf: string;
  impressions?: number;
  profileClicks?: number;
  followerDelta?: number;
  installs?: number;
  repliesPosted?: number;
  updatedAt: number;
}

const CHANNELS = ['x_bio', 'x_reply', 'toss', 'stocktwits', 'reddit'];

export async function GET() {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  const manual = (await getFromCache<ManualStats>(KEY_MANUAL)) || null;
  const hitEntries = await Promise.all(
    CHANNELS.map(async (c) => [c, (await getFromCache<number>(KEY_HITS(c))) || 0] as const)
  );
  const hits = Object.fromEntries(hitEntries);
  return NextResponse.json({ ok: true, manual, hits, etDate: etDate() });
}

export async function POST(req: NextRequest) {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  let body: Partial<ManualStats>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  const stats: ManualStats = {
    weekOf: etDate(),
    impressions: Number(body.impressions) || 0,
    profileClicks: Number(body.profileClicks) || 0,
    followerDelta: Number(body.followerDelta) || 0,
    installs: Number(body.installs) || 0,
    repliesPosted: Number(body.repliesPosted) || 0,
    updatedAt: Date.now(),
  };
  await setInCache(KEY_MANUAL, stats);
  await appendAudit(gate.admin.email, 'metrics-manual', `week ${stats.weekOf}`);
  return NextResponse.json({ ok: true, manual: stats });
}
