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

  const [state, log, report, navHist, config, real] = await Promise.all([
    getFromCache<AutoState>('trade:auto:state'),
    getFromCache<AutoLogRow[]>('trade:auto:log'),
    getFromCache<AutoReport>('trade:auto:report'),
    getFromCache<{ d: string; nav: number }[]>('trade:auto:navhist'),
    getFromCache<{ capital: number; at: number }>('trade:auto:config'),
    getFromCache<{ mode: string; capital?: number; at?: number; by?: string }>('trade:auto:real'),
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
    real: real ?? { mode: 'off' },
  });
}

// POST { capital } — the single operator-settable engine parameter (paper).
// The engine applies it on its next tick, shifting kill baselines by the same
// delta so a deposit/withdrawal can never trip the -2%/-3% stops.
export async function POST(req: NextRequest) {
  const gate = await requireTradeAdmin();
  if ('error' in gate) return gate.error;
  let b: { capital?: unknown; realMode?: unknown; realCapital?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  // ── C-stage arm/disarm (prereg §2.7): arming REQUIRES 3/3 gates, verified
  // server-side here — the engine trusts trade:auto:real only because this is
  // the sole writer. ic/duel gates come from the adjudication verdict key
  // (written at the 15d/20d judgments); calib is checked live from the report.
  if (b.realMode === 'off' || b.realMode === 'armed') {
    if (b.realMode === 'armed') {
      const [rep, verdict] = await Promise.all([
        getFromCache<{ calibration?: Record<string, { adjF3: number; days: number }> }>('cache:xs:report'),
        getFromCache<{ ic?: boolean; duel?: boolean }>('trade:gates:verdict'),
      ]);
      const c9 = rep?.calibration?.['9'];
      const calibPass = Boolean(c9 && c9.adjF3 > 0);
      if (!verdict?.ic || !verdict?.duel || !calibPass) {
        return NextResponse.json({
          ok: false,
          error: `실전 무장 불가 — 게이트 미충족 (IC ${verdict?.ic ? '✓' : '✕'} · V8우위 ${verdict?.duel ? '✓' : '✕'} · 데실α ${calibPass ? '✓' : '✕'}). IC/V8 판정은 라벨 15/20일 축적 후 기록됩니다.`,
        }, { status: 409 });
      }
      const cap = Number(b.realCapital);
      if (!Number.isFinite(cap) || cap < 100 || cap > 60_000) {
        return NextResponse.json({ ok: false, error: '실전 자본은 $100–$60,000 (슬롯당 실행기 $2,000 캡 정렬)' }, { status: 400 });
      }
      await setInCache('trade:auto:real', { mode: 'armed', capital: Math.round(cap * 100) / 100, at: Date.now(), by: gate.admin.email });
      await tradeJournal({ at: Date.now(), who: gate.admin.email, action: 'real-arm', detail: `$${cap}` });
      return NextResponse.json({ ok: true, real: { mode: 'armed', capital: cap } });
    }
    await setInCache('trade:auto:real', { mode: 'off', at: Date.now(), by: gate.admin.email });
    await tradeJournal({ at: Date.now(), who: gate.admin.email, action: 'real-disarm', detail: '' });
    return NextResponse.json({ ok: true, real: { mode: 'off' } });
  }

  const capital = Number(b.capital);
  if (!Number.isFinite(capital) || capital < 100 || capital > 1_000_000) {
    return NextResponse.json({ ok: false, error: '투입 자본은 $100–$1,000,000 범위' }, { status: 400 });
  }
  const stored = await setInCache('trade:auto:config', { capital: Math.round(capital * 100) / 100, at: Date.now() });
  if (!stored) return NextResponse.json({ ok: false, error: '설정 저장 실패 — 잠시 후 재시도' }, { status: 502 });
  await tradeJournal({ at: Date.now(), who: gate.admin.email, action: 'auto-capital', detail: `$${capital}` });
  return NextResponse.json({ ok: true, capital });
}
