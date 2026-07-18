import { NextRequest, NextResponse } from 'next/server';
import { requireTradeAdmin } from '@/lib/trade/auth';
import { getFromCache, setInCache } from '@/services/redisClient';
import { tradeJournal } from '@/lib/trade/executor';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

// AUTO ENGINE domain — read-only window into the resident real-time engine
// (REALTIME-1, paper mode) running on the EC2 executor box. The engine owns
// selection, sizing, entries, exits; the only human control is the kill switch.
// Keys written by the engine via the EC2 Redis proxy:
//   trade:auto:state       { mode, ver, capital, nav, cash, positions[], universeDate, updatedAt }
//   trade:auto:log         [{ at, type, t, px, qty, reason }] newest-first, capped
//   trade:auto:report      { date, nav, dayRet, trades, note } latest daily report

export interface AutoPosition { t: string; qty: number; entryPx: number; entryAt: number; stopPx?: number | null }
export interface AutoState {
  mode: 'PAPER' | 'OFF' | 'LIVE';
  ver: string; capital: number; nav: number; cash: number;
  positions: AutoPosition[];
  universeDate: string | null;
  updatedAt: number;
}
export interface AutoLogRow { at: number; type: string; t?: string; px?: number; qty?: number; reason?: string }
export interface AutoReport { date: string; nav: number; dayRet: number | null; trades: number; note?: string }

export async function GET() {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;

  const [state, log, report, navHist, config] = await Promise.all([
    getFromCache<AutoState>('trade:auto:state'),
    getFromCache<AutoLogRow[]>('trade:auto:log'),
    getFromCache<AutoReport>('trade:auto:report'),
    getFromCache<{ d: string; nav: number }[]>('trade:auto:navhist'),
    getFromCache<{ capital: number; at: number }>('trade:auto:config'),
  ]);

  const heartbeatAgeSec = state?.updatedAt ? Math.round((Date.now() - state.updatedAt) / 1000) : null;
  return NextResponse.json({
    ok: true,
    deployed: state != null,
    state: state ?? null,
    heartbeatAgeSec,
    stale: heartbeatAgeSec != null && heartbeatAgeSec > 180, // loop ticks every <=60s when alive
    log: Array.isArray(log) ? log.slice(0, 40) : [],
    report: report ?? null,
    navHist: Array.isArray(navHist) ? navHist : [],
    config: config ?? null,
  });
}

// POST { capital } — the single operator-settable engine parameter (paper).
// The engine applies it on its next tick, shifting kill baselines by the same
// delta so a deposit/withdrawal can never trip the -2%/-3% stops.
export async function POST(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  let b: { capital?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }
  const capital = Number(b.capital);
  if (!Number.isFinite(capital) || capital < 100 || capital > 1_000_000) {
    return NextResponse.json({ ok: false, error: '투입 자본은 $100–$1,000,000 범위' }, { status: 400 });
  }
  const stored = await setInCache('trade:auto:config', { capital: Math.round(capital * 100) / 100, at: Date.now() });
  if (!stored) return NextResponse.json({ ok: false, error: '설정 저장 실패 — 잠시 후 재시도' }, { status: 502 });
  await tradeJournal({ at: Date.now(), who: gate.admin.email, action: 'auto-capital', detail: `$${capital}` });
  return NextResponse.json({ ok: true, capital });
}
