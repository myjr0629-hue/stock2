import { NextResponse } from 'next/server';
import {
  requireMktAdmin, getAllVolumes, readAudit, X_CHANNELS, DAILY_CAP, etDate,
} from '@/lib/marketing-console/mkt';
import { getConnection } from '@/lib/marketing-console/xOAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// Today tab — real monitoring: volume caps, audit log, connection, ET date.
export async function GET() {
  const gate = await requireMktAdmin();
  if ('error' in gate) return gate.error;

  const [vols, audit, en, jp] = await Promise.all([
    getAllVolumes(),
    readAudit(),
    getConnection('en'),
    getConnection('jp'),
  ]);

  return NextResponse.json({
    ok: true,
    etDate: etDate(),
    cap: DAILY_CAP,
    volumes: {
      xUS: vols[X_CHANNELS.en] || 0,
      xJP: vols[X_CHANNELS.ja] || 0,
      bluesky: vols[X_CHANNELS.bsky] || 0,
    },
    connections: { en, jp },
    audit: audit.slice(0, 20),
  });
}
