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

  // FX + US market session via Toss (only when the executor is wired up).
  // Session computed EXACTLY from the spec'd calendar windows (KST times).
  let fxRate: number | null = null;
  let usSession: string | null = null;
  let usSessions: { key: string; start: number; end: number }[] = [];
  if (health.up && health.configured) {
    const { callToss } = await import('@/lib/trade/executor');
    const [fxR, calR] = await Promise.all([
      callToss({ path: '/api/v1/exchange-rate', query: { baseCurrency: 'USD', quoteCurrency: 'KRW' } }),
      callToss({ path: '/api/v1/market-calendar/US' }),
    ]);
    const rate = Number((fxR.data as { result?: { rate?: string } })?.result?.rate);
    if (Number.isFinite(rate)) fxRate = rate;
    interface Session { startTime?: string; endTime?: string }
    interface UsDay { dayMarket?: Session | null; preMarket?: Session | null; regularMarket?: Session | null; afterMarket?: Session | null }
    const cal = (calR.data as { result?: { today?: UsDay; previousBusinessDay?: UsDay } })?.result;
    const now = Date.now();
    const inWin = (s?: Session | null) => Boolean(s?.startTime && s?.endTime && now >= Date.parse(s.startTime) && now < Date.parse(s.endTime));
    const labelOf = (d?: UsDay): string | null => {
      if (!d) return null;
      if (inWin(d.regularMarket)) return '정규장';
      if (inWin(d.preMarket)) return '프리마켓';
      if (inWin(d.afterMarket)) return '애프터마켓';
      if (inWin(d.dayMarket)) return '데이마켓';
      return null;
    };
    if (cal) {
      // regular/after sessions of "today" can spill past midnight KST — check
      // the previous business day's windows too before declaring closed.
      usSession = labelOf(cal.today) ?? labelOf(cal.previousBusinessDay)
        ?? (cal.today && !cal.today.regularMarket ? '휴장' : '장외');
      // session timeline for the console strip (day/pre/regular/after ×2 days,
      // filtered to a live window; times are epoch ms from the KST ISO strings)
      const push = (d?: UsDay | null) => {
        if (!d) return;
        const m: [string, Session | null | undefined][] = [['day', d.dayMarket], ['pre', d.preMarket], ['regular', d.regularMarket], ['after', d.afterMarket]];
        for (const [k, s] of m) {
          if (s?.startTime && s?.endTime) usSessions.push({ key: k, start: Date.parse(s.startTime), end: Date.parse(s.endTime) });
        }
      };
      push(cal.previousBusinessDay); push(cal.today);
      usSessions = usSessions.filter((s) => s.end > now - 3600_000 && s.start < now + 26 * 3600_000).sort((a, b) => a.start - b.start);
    }
  }

  // §42.3-5 real-money gates (0/3 → C-stage locked).
  // NOTE: the engine's calibration deciles are sorted ASCENDING by score, so
  // key '9' is the TOP decile (key '0' is the bottom — an earlier version
  // mislabeled this and showed the wrong gate state).
  const calib = xsReport?.calibration || {};
  const topDecile = calib['9'];
  const gates = {
    ic: { pass: false, note: '롤링 IC ≥ +0.03 (라벨 15일+) — 3파전 판정 대기' },
    duel: { pass: false, note: '라벨 20일+ V8 맞대결 우위 대기' },
    calib: { pass: Boolean(topDecile && topDecile.adjF3 > 0), note: `상위데실 adjF3 ${topDecile ? topDecile.adjF3 + '%' : 'n/a'}` },
  };

  return NextResponse.json({
    ok: true,
    executor: { up: health.up, configured: executorConfigured() && health.configured },
    kill,
    fxRate, usSession, usSessions,
    paper: paper || null,
    xs: xsReport ? { date: xsReport.date, labeled: xsReport.labeled, variants: xsReport.variants || null } : null,
    gates,
    journal: journal.slice(0, 30),
  });
}
