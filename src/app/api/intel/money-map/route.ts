import { NextResponse } from 'next/server';
import { mgetFromCache } from '@/services/redisClient';
import { SECTOR_MAP } from '@/services/universePolicy';
import { withConfirmedDates, EARNINGS_CALENDAR_CACHE_KEY, type EarningsCalendarPayload } from '@/services/earningsCalendarService';
import { impliedForRow, EARNINGS_IMPLIED_KEY } from '@/lib/earnings/earningsImplied';
import { aggregateMapPremium, type MapSources } from '@/lib/app/moneyMap';
import { etDateOf } from '@/lib/marketCalendar';

export const dynamic = 'force-dynamic';
const withFirst = <T extends { expiry: string }>(v: T | null) => (v ? { ...v, first: v.expiry } : null);
// Read stored results only. In particular, do not call GuardianDataHub or an earnings refresh (both can generate AI).
const HEADLINES: Record<string, string> = { SMH: 'silicon_core', HACK: 'cyber_shield', AI_PWR: 'power_matrix' };
const SYNTHETIC = new Set(['AI_PWR', 'SAFE_HAVEN']);
export async function GET() {
  try {
    const tickers = [...new Set(Object.values(SECTOR_MAP).flatMap(s => s.tickers))];
    const keys = ['gcore:v1', 'guardian:snapshot:lastgood:ko', 'intel:ai_headlines:v1', EARNINGS_CALENDAR_CACHE_KEY,
      EARNINGS_IMPLIED_KEY, 'fmp:econ-calendar', ...tickers.map(t => `cache:analysis:${t}`), ...tickers.map(t => `structure:v2:${t}`)];
    const rows = await mgetFromCache<any>(keys);
    const [core, last, ai, calendar, implied, economic] = rows;
    const snapshot = core?.sectors?.length ? core : last;
    const analyses: Record<string, any> = {};
    tickers.forEach((t, i) => {
      const a = rows[6 + i], structure = rows[6 + tickers.length + i]?.data;
      if (!a) return;
      // Reuse chain provenance only when it is the same measured premium; otherwise retain the known cache capture date.
      const chainDate = structure?.chainDate;
      const samePremium = structure?.netPremium === a.netPremium;
      analyses[t] = { ...a, sourceDate: samePremium && typeof chainDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(chainDate) ? chainDate : undefined,
        premiumContracts: samePremium ? structure?.premiumContracts : a.premiumContracts };
    });
    const snapshotMs = Date.parse(snapshot?.timestamp || '');
    const sectors = Object.entries(SECTOR_MAP).map(([id, info]) => {
      const flow = snapshot?.sectors?.find((s: any) => s.id === id);
      const latestTrend = snapshot?.rotationIntensity?.fiveDayData?.[id];
      const trend = latestTrend || last?.rotationIntensity?.fiveDayData?.[id];
      const trendMs = latestTrend ? snapshotMs : Date.parse(last?.timestamp || '');
      const premium = aggregateMapPremium(info.tickers, analyses);
      const inst = flow?.instFlow;
      const instDate = typeof inst?.asOf === 'string' ? inst.asOf : null;
      const previousInst = last?.sectors?.find((s: any) => s.id === id)?.instFlow;
      const previousMs = Date.parse(last?.timestamp || '');
      const capturedInst = inst && Number.isFinite(inst.totalNetPremium) && inst.totalNetPremium !== 0 && snapshotMs > 0 ? { inst, at: snapshotMs }
        : previousInst && Number.isFinite(previousInst.totalNetPremium) && previousInst.totalNetPremium !== 0 && previousMs > 0 ? { inst: previousInst, at: previousMs } : null;
      const headline = ai?.sectors?.[id] || ai?.sectors?.[HEADLINES[id]];
      return { id, tickers: info.tickers, synthetic: SYNTHETIC.has(id),
        fiveDay: Number.isFinite(trend?.cumReturn) && (trend.asOf || trendMs > 0)
          ? { value: trend.cumReturn, date: trend.asOf || etDateOf(trendMs), basis: trend.basis || (id.startsWith('XL') ? 'ETF' : 'equalWeight'), ...(!trend.asOf ? { captured: true as const } : {}) } : null,
        bounce: !!trend?.isBounce || !!snapshot?.rotationIntensity?.bounceWarnings?.some((w: string) => w.startsWith(id + ':')),
        // An undated aggregate cannot be advertised as today's premium. Recover a dated analysis sum first.
        premium: Number.isFinite(inst?.totalNetPremium) && instDate
          ? { value: inst.totalNetPremium, date: instDate, count: inst.tickerCount, source: 'instFlow' as const } : premium
            || (capturedInst ? { value: capturedInst.inst.totalNetPremium, date: etDateOf(capturedInst.at), count: capturedInst.inst.tickerCount, source: 'instFlow' as const, captured: true as const } : null),
        ...(headline ? { why: { ko: headline.headline, en: headline.headlineEN, ja: headline.headlineJP }, whyAt: ai.generatedAt, whyBasis: ai.sectors[id] ? id : HEADLINES[id] } : {}),
      };
    });
    const confirmed = calendar?.ok && !calendar.reason && !calendar.error && Array.isArray(calendar.rows)
      ? withConfirmedDates(calendar as EarningsCalendarPayload) : null;
    const earningsComplete = !!confirmed && confirmed.windows > 0 && !!confirmed.probe
      && Object.keys(confirmed.probe).length >= confirmed.windows
      && Object.values(confirmed.probe).every(v => /^ok-\d+$/.test(v))
      && Array.isArray(confirmed.truncated) && confirmed.truncated.length === 0;
    const economicValid = Array.isArray(economic?.events) && !economic.error && economic.source !== 'ERROR' && economic.source !== 'EMPTY';
    const sources: MapSources = { sectors,
      // [10/31] 묶음을 못 읽었으면 implied 키를 빼서(«모름») 앱이 직전 확인값을 잇게 한다 — null 은 서버가 «첫 만기 값 없음»으로 정한 것.
      earnings: (confirmed?.rows || []).map(r => ({ ticker: r.ticker, date: r.date, hour: r.hour, dateStatus: r.dateStatus,
        // first = 그 값이 «발표 직후 첫 만기»로 정해진 묶음 칸의 값이라는 표식(impliedForRow 는 표식 있는 칸만 낸다) — 앱 복원 검사용
        ...(implied && implied.v === 1 && implied.cells ? { implied: withFirst(impliedForRow(r, implied)) } : {}) })),
      earningsAt: confirmed?.generatedAt || null,
      earningsRange: confirmed?.from && confirmed.to ? { from: confirmed.from, to: confirmed.to } : null,
      earningsStatus: confirmed ? earningsComplete ? 'ok' : 'partial' : 'unavailable',
      events: economicValid ? economic.events.filter((e: any) => e?.impact === 'HIGH').map((e: any) => ({ date: e.date, time: e.time, event: e.event, impact: e.impact })) : [],
      eventsAt: economicValid ? economic.updatedAt || economic.ts || null : null,
      eventsRange: economicValid && economic.from && economic.to ? { from: economic.from, to: economic.to } : null,
    };
    return NextResponse.json({ success: true, sources }, { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } });
  } catch {
    return NextResponse.json({ success: false }, { status: 503 });
  }
}
