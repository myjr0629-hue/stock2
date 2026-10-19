import { etDateOf, etMinutesOf, isNonTradingDay, sessionCloseMinutes, shownRegularSessionDate } from '@/lib/marketCalendar';
import { validateRowImplied } from '@/lib/earnings/earningsImplied';

export type MapSession = 'PRE' | 'REG' | 'POST' | 'CLOSED';
export type MapValue = { value: number; date: string; session: 'PRE' | 'REG'; at: number };
export type MapPremium = { value: number; date: string; count: number; source: 'instFlow' | 'analysis'; captured?: true };
export interface MapSectorSource {
  id: string; tickers: string[]; synthetic: boolean;
  fiveDay: { value: number; date: string; captured?: true; basis?: 'ETF' | 'equalWeight' } | null;
  bounce: boolean; premium: MapPremium | null;
  why?: Partial<Record<'ko' | 'en' | 'ja', string>>; whyAt?: string; whyBasis?: string;
}
export interface MapSources {
  sectors: MapSectorSource[];
  earnings: Array<{ ticker: string; date: string; hour?: string | null; dateStatus?: string; implied: { pct: number; session: string | null; expiry: string } | null }>;
  earningsAt: string | null;
  events: Array<{ date: string; time: string; event: string; impact: string }>;
  eventsAt: string | null;
}
export interface MapSector extends MapSectorSource {
  today: MapValue | null; relative: number | null;
  stocks: Array<{ ticker: string; move: MapValue | null; relative: number | null }>;
}
export interface MoneyMapData {
  session: MapSession; date: string; sectors: MapSector[];
  leaders: MapSector[]; laggards: MapSector[]; prior: MapSector[];
  sources: MapSources;
}
export function mergeMoneyMapSources(next: MapSources, prev?: MapSources, now = Date.now()): MapSources {
  return { ...next, sectors: next.sectors.map(s => {
    const old = prev?.sectors.find(p => p.id === s.id);
    return { ...s, fiveDay: s.fiveDay || old?.fiveDay || null, premium: s.premium || old?.premium || null };
  }), earnings: next.earningsAt ? next.earnings.map(r => {
    const old = prev?.earnings.find(p => p.ticker === r.ticker && p.date === r.date && p.hour === r.hour);
    const fallback = old?.implied ? validateRowImplied(r, { ...old.implied, basis: null }, now) : null;
    return { ...r, implied: r.implied || fallback };
  }) : prev?.earnings || [], earningsAt: next.earningsAt || prev?.earningsAt || null,
  events: next.eventsAt ? next.events : prev?.events || [], eventsAt: next.eventsAt || prev?.eventsAt || null };
}
export const finiteMapNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function moneyMapSession(now: number): MapSession {
  const date = etDateOf(now), m = etMinutesOf(now);
  if (isNonTradingDay(date)) return 'CLOSED';
  return m >= 240 && m < 570 ? 'PRE' : m >= 570 && m < sessionCloseMinutes(date) ? 'REG'
    : m >= sessionCloseMinutes(date) && m < 1200 ? 'POST' : 'CLOSED';
}

/** Analysis fallback keeps only measured premiums on one source date. Never sum different days or null as zero. */
export function aggregateMapPremium(
  tickers: string[], entries: Record<string, { netPremium?: number | null; timestamp?: number; premiumContracts?: number; sourceDate?: string }>,
): MapPremium | null {
  const groups = new Map<string, { value: number; count: number; captured?: true }>();
  for (const t of tickers) {
    const a = entries[t];
    if (!a || !finiteMapNumber(a.netPremium) || (a.netPremium === 0 && !(Number(a.premiumContracts) > 0))) continue;
    // Without a trade date the only known fact is the capture date. Label that explicitly; never infer the option session.
    const date = a.sourceDate || (Number(a.timestamp) > 0 ? etDateOf(Number(a.timestamp)) : null);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const key = `${date}:${a.sourceDate ? 'source' : 'capture'}`;
    const group = groups.get(key) || { value: 0, count: 0, ...(!a.sourceDate ? { captured: true as const } : {}) };
    group.value += a.netPremium; group.count++; groups.set(key, group);
  }
  const date = [...groups.keys()].sort().at(-1);
  return date ? { ...groups.get(date)!, date: date.slice(0, 10), source: 'analysis' } : null;
}

/** live/quotes is the same session-aware quote boundary used by Intel. Store dated values, never re-date a fallback. */
export function mapQuoteValues(envelope: { data?: Record<string, any>; timestamp?: number }, previous: Record<string, MapValue> = {}): Record<string, MapValue> {
  const result = { ...previous };
  const at = Number(envelope.timestamp);
  if (!(at > 0)) return result;
  for (const [ticker, q] of Object.entries(envelope.data || {})) {
    if (!q || q.error) continue;
    const date = shownRegularSessionDate(at);
    if (q.price > 0 && q.previousClose > 0 && finiteMapNumber(q.changePercent)) {
      const sourceDate = typeof q.regularDate === 'string' ? q.regularDate : date;
      result[`${ticker}:REG`] = { value: q.changePercent, date: sourceDate, session: 'REG', at };
    }
    if (q.session === 'pre' && q.extendedLabel === 'PRE' && q.extendedMissing === false
      && q.extendedPrice > 0 && q.extendedDate === etDateOf(at) && finiteMapNumber(q.extendedChangePercent)) {
      result[`${ticker}:PRE`] = { value: q.extendedChangePercent, date: q.extendedDate, session: 'PRE', at };
    }
  }
  return result;
}
function chooseValue(ticker: string, values: Record<string, MapValue>, session: MapSession, date: string): MapValue | null {
  const pre = values[`${ticker}:PRE`], reg = values[`${ticker}:REG`];
  if (session === 'PRE' && pre?.date === date) return pre;
  return reg || pre || null;
}
function averageGroup(points: MapValue[]): MapValue | null {
  if (!points.length) return null;
  const key = (p: MapValue) => `${p.date}:${p.session}`;
  const first = points[0];
  const matching = points.filter(p => key(p) === key(first));
  return { ...first, at: Math.min(...matching.map(p => p.at)), value: matching.reduce((s, p) => s + p.value, 0) / matching.length };
}
export function buildMoneyMap(sources: MapSources, values: Record<string, MapValue>, nq: MapValue | null, now: number): MoneyMapData {
  const session = moneyMapSession(now), date = etDateOf(now);
  const regularDate = shownRegularSessionDate(now);
  const spy = values['SPY:REG'];
  const sectors = sources.sectors.map(s => {
    const stockValues = s.tickers.map(ticker => ({ ticker, move: chooseValue(ticker, values, session, date) }));
    const candidates = stockValues.flatMap(s => s.move ? [s.move] : []).sort((a, b) => b.date.localeCompare(a.date) || (a.session === 'PRE' ? -1 : 1));
    const today = s.synthetic ? averageGroup(candidates) : chooseValue(s.id, values, session, date);
    const benchmark = today?.session === 'PRE' ? nq : spy;
    const relative = today && benchmark && today.date === benchmark.date && today.session === benchmark.session
      && Math.abs(today.at - benchmark.at) <= 20 * 60_000 ? today.value - benchmark.value : null;
    return { ...s, today, relative, stocks: stockValues.map(s => ({ ...s, relative: today && s.move && today.date === s.move.date && today.session === s.move.session ? s.move.value - today.value : null })) };
  });
  const isCurrent = (s: MapSector) => s.today?.date === (session === 'PRE' ? date : regularDate) && s.today?.session === (session === 'PRE' ? 'PRE' : 'REG') && s.relative !== null
    && (session === 'CLOSED' || session === 'POST' || now - s.today.at <= 20 * 60_000);
  const ranked = sectors.filter(isCurrent).sort((a, b) => b.relative! - a.relative! || a.id.localeCompare(b.id));
  const leaders = ranked.slice(0, 3), used = new Set(leaders.map(s => s.id));
  const laggards = ranked.filter(s => !used.has(s.id)).slice(-3).reverse();
  return { session, date, sectors, leaders, laggards, prior: sectors.filter(s => !isCurrent(s)), sources };
}
export function mapWeekRange(now: number): { from: string; to: string } {
  const date = etDateOf(now), day = new Date(`${date}T12:00:00Z`), dow = day.getUTCDay();
  // Weekend prepares the coming week; weekdays retain this week's complete schedule.
  day.setUTCDate(day.getUTCDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));
  const from = day.toISOString().slice(0, 10); day.setUTCDate(day.getUTCDate() + 4);
  return { from, to: day.toISOString().slice(0, 10) };
}
