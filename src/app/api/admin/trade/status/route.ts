import { NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { executorHealth, executorConfigured, getTradeKill, readTradeJournal } from '@/lib/trade/executor';
import { getFromCache } from '@/services/redisClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Trade console home: executor/toss connectivity, kill switch, paper track,
// XS engine + gate status, recent journal — one call for the whole header.
export async function GET() {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;

  const [health, kill, journal, paper, xsReport] = await Promise.all([
    executorHealth(),
    getTradeKill(),
    readTradeJournal(),
    getFromCache<Record<string, unknown>>('cache:xs:paper'),
    getFromCache<{ date?: string; dayIC?: number; labeled?: number; calibration?: Record<string, { adjF3: number; hit: number; days: number }>; variants?: Record<string, { rolling: number | null; days: number }> }>('cache:xs:report'),
  ]);

  // §42.3-5 real-money gates (0/3 → C-stage locked)
  const calib = xsReport?.calibration || {};
  const topDecile = calib['0'];
  const gates = {
    ic: { pass: false, note: '롤링 IC ≥ +0.03 (라벨 15일+) — 3파전 판정 대기' },
    duel: { pass: false, note: '라벨 20일+ V8 맞대결 우위 대기' },
    calib: { pass: Boolean(topDecile && topDecile.adjF3 > 0), note: `상위데실 adjF3 ${topDecile ? topDecile.adjF3 + '%' : 'n/a'}` },
  };

  return NextResponse.json({
    ok: true,
    executor: { up: health.up, configured: executorConfigured() && health.configured },
    kill,
    paper: paper || null,
    xs: xsReport ? { date: xsReport.date, labeled: xsReport.labeled, variants: xsReport.variants || null } : null,
    gates,
    journal: journal.slice(0, 30),
  });
}
