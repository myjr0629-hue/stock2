import { etDateOf, etMinutesOf, isNonTradingDay, sessionCloseMinutes, shownRegularSessionDate } from '@/lib/marketCalendar';
import { validateRowImplied } from '@/lib/earnings/earningsImplied';
import { fmpCalendarToET } from '@/lib/fmpCalendarTime';

export type MapSession = 'PRE' | 'REG' | 'POST' | 'CLOSED';
export type MapValue = { value: number; date: string; session: 'PRE' | 'REG'; at: number; kind?: 'live' | 'close' | 'unknown' };
export type MapPremium = { value: number; date: string; count: number; source: 'instFlow' | 'analysis'; captured?: true };
export interface MapSectorSource {
  id: string; tickers: string[]; synthetic: boolean;
  fiveDay: { value: number; date: string; captured?: true; basis?: 'ETF' | 'equalWeight' } | null;
  bounce: boolean; premium: MapPremium | null;
  why?: Partial<Record<'ko' | 'en' | 'ja', string>>; whyAt?: string; whyBasis?: string;
}
export interface MapSources {
  sectors: MapSectorSource[];
  earnings: Array<{ ticker: string; date: string; hour?: string | null; dateStatus?: string; implied: { pct: number; session: string | null; expiry: string; first?: string } | null }>;
  earningsAt: string | null;
  earningsRange?: { from: string; to: string } | null;
  earningsStatus?: 'ok' | 'partial' | 'unavailable';
  events: Array<{ date: string; time: string; event: string; impact: string }>;
  eventsAt: string | null;
  eventsRange?: { from: string; to: string } | null;
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
  const calendar = [next, prev].filter((s): s is MapSources => !!s && validMapCalendar(s, now))
    .sort((a, b) => Date.parse(b.eventsAt!) - Date.parse(a.eventsAt!))[0];
  // A newer partial query can confirm events that an older complete query did not know about.
  // Keep its status/range together with the rows; partial data cannot confirm absence.
  const earnings = [next, prev].filter((s): s is MapSources => !!s && validMapEarnings(s, now))
    .sort((a, b) => Date.parse(b.earningsAt!) - Date.parse(a.earningsAt!)
      || Number(b.earningsStatus === 'ok') - Number(a.earningsStatus === 'ok'))[0];
  return { ...next, sectors: next.sectors.map(s => {
    const old = prev?.sectors.find(p => p.id === s.id);
    return { ...s, fiveDay: s.fiveDay || old?.fiveDay || null, premium: s.premium || old?.premium || null };
  }), earnings: (earnings?.earnings || []).map(r => {
    const old = prev?.earnings.find(p => p.ticker === r.ticker && p.date === r.date && p.hour === r.hour);
    // [10/31] 이전 값은 «발표 직후 첫 만기»로 확인된 값(first = expiry)만 잇는다 — 표식 전 값(뒤 월물일 수 있다)은 잇지 않는다.
    const fallback = old?.implied && old.implied.first && old.implied.first === old.implied.expiry ? validateRowImplied(r, { ...old.implied, basis: null }, now) : null;
    return { ...r, implied: validateRowImplied(r, r.implied ? { ...r.implied, basis: null } : fallback, now) };
  }), earningsAt: earnings?.earningsAt || null, earningsRange: earnings?.earningsRange || null,
  earningsStatus: earnings?.earningsStatus || (earnings ? 'partial' : 'unavailable'),
  events: calendar?.events || [], eventsAt: calendar?.eventsAt || null, eventsRange: calendar?.eventsRange || null };
}
const validEarningsDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))
  && new Date(v).toISOString().slice(0, 10) === v;
function validMapEarnings(s: MapSources, now: number): boolean {
  const at = Date.parse(s.earningsAt || ''), range = s.earningsRange;
  if (!Number.isFinite(at) || at > now + 60_000 || !Array.isArray(s.earnings) || s.earningsStatus === 'unavailable') return false;
  if (range && (!validEarningsDate(range.from) || !validEarningsDate(range.to) || range.from > range.to)) return false;
  // Legacy rows remain observations; only an explicitly complete query can prove zero events.
  return (s.earnings.length > 0 || (!!range && s.earningsStatus === 'ok'))
    && s.earnings.every(r => r && typeof r.ticker === 'string' && r.ticker.trim().length > 0 && validEarningsDate(r.date));
}
export function moneyMapEarnings(s: MapSources, tickers: string[], now: number) {
  const week = mapWeekRange(now);
  if (!validMapEarnings(s, now)) return { earnings: [], current: false, asOf: null, range: week };
  const range = s.earningsRange;
  const current = s.earningsStatus === 'ok' && now - Date.parse(s.earningsAt!) <= 6 * 60 * 60_000
    && !!range && range.from <= week.from && range.to >= week.to;
  const rows = s.earnings.filter(r => tickers.includes(r.ticker))
    .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
  const thisWeek = rows.filter(r => r.date >= week.from && r.date <= week.to);
  const earnings = current || thisWeek.length ? thisWeek : rows;
  return { earnings, current, asOf: s.earningsAt,
    range: !current && !thisWeek.length && earnings.length
      ? { from: earnings[0].date, to: earnings[earnings.length - 1].date } : week };
}
function validMapCalendar(s: MapSources, now: number): boolean {
  const at = Date.parse(s.eventsAt || '');
  if (!Number.isFinite(at) || at > now + 60_000 || !Array.isArray(s.events)) return false;
  const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))
    && new Date(v).toISOString().slice(0, 10) === v;
  const range = s.eventsRange;
  if (range && (!validDate(range.from) || !validDate(range.to) || range.from > range.to)) return false;
  // Legacy rows are real observations, but a timestamp alone cannot prove an empty calendar.
  return (!!range || s.events.length > 0) && s.events.every(e => e && e.impact === 'HIGH'
    && typeof e.event === 'string' && e.event.trim().length > 0 && validDate(e.date) && !!fmpCalendarToET(e.date, e.time)
    && (!range || (e.date >= range.from && e.date <= range.to)));
}
/** Only a complete, unexpired query can confirm absence. Otherwise show dated saved observations. */
export function moneyMapCalendar(s: MapSources, now: number) {
  const date = etDateOf(now);
  if (!validMapCalendar(s, now)) return { events: [], current: false, asOf: null, date };
  const range = s.eventsRange;
  // The source query uses UTC days; today's complete ET day extends into tomorrow UTC.
  const current = now - Date.parse(s.eventsAt!) <= 6 * 60 * 60_000 && !!range && range.from <= date && range.to > date;
  const rows = s.events.map(e => ({ ...e, et: fmpCalendarToET(e.date, e.time)! }))
    .sort((a, b) => a.et.date.localeCompare(b.et.date) || a.et.time.localeCompare(b.et.time));
  const today = rows.filter(e => e.et.date === date);
  const events = (current || today.length ? today : rows).slice(0, 2);
  return { events, current, asOf: s.eventsAt,
    date: current ? date : events[0]?.et.date || etDateOf(Date.parse(s.eventsAt!)) };
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
    const regularAt = Number(q.regularTime ?? q.priceTime) || 0;
    const regularDate = typeof q.regularDate === 'string' ? q.regularDate
      : regularAt > 0 ? etDateOf(regularAt) : null;
    if (q.price > 0 && q.previousClose > 0 && finiteMapNumber(q.changePercent) && regularDate
      && regularAt <= at + 60_000) {
      result[`${ticker}:REG`] = { value: q.changePercent, date: regularDate, session: 'REG', at: regularAt,
        kind: q.regularKind === 'close' ? 'close' : regularAt > 0 ? 'live' : 'unknown' };
    }
    const preAt = Date.parse(q.extendedTime || '');
    if (q.session === 'pre' && q.extendedLabel === 'PRE' && q.extendedMissing === false
      && q.extendedPrice > 0 && q.extendedDate === etDateOf(at) && finiteMapNumber(q.extendedChangePercent)
      && preAt > 0 && preAt <= at + 60_000 && etDateOf(preAt) === q.extendedDate && moneyMapSession(preAt) === 'PRE') {
      result[`${ticker}:PRE`] = { value: q.extendedChangePercent, date: q.extendedDate, session: 'PRE', at: preAt, kind: 'live' };
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
  return { ...first, kind: matching.every(p => p.kind === 'close') ? 'close' : matching.every(p => p.kind === 'live') ? 'live' : 'unknown', at: Math.min(...matching.map(p => p.at)), value: matching.reduce((s, p) => s + p.value, 0) / matching.length };
}
const MAX_AGE = 20 * 60_000;
function comparable(a: MapValue, b: MapValue): boolean {
  if (a.date !== b.date || a.session !== b.session || !a.kind || !b.kind || a.kind === 'unknown' || b.kind === 'unknown') return false;
  if (a.kind === 'close' && b.kind === 'close') return true;
  // A late intraday print is not a confirmed close, even within one minute of the bell.
  if (a.kind === 'close' || b.kind === 'close') return false;
  return a.at > 0 && b.at > 0 && Math.abs(a.at - b.at) <= MAX_AGE;
}
function currentValue(v: MapValue, session: MapSession, date: string, now: number): boolean {
  if (v.date !== date || v.session !== (session === 'PRE' ? 'PRE' : 'REG')) return false;
  if (session === 'POST' || session === 'CLOSED') {
    return v.kind === 'close';
  }
  return v.kind === 'live' && v.at > 0 && now - v.at >= -60_000 && now - v.at <= MAX_AGE
    && moneyMapSession(v.at) === session;
}
/** /api/market/now 배경 → PRE 기준 NQ 관측값. NQ «자기» 측정 시각(futures.nqAsOf)이 있을 때만 — NQ·ES 중 최신 시각(futures.asOf)을
 *  NQ 시각으로 쓰면 오래된 NQ 가 새 값처럼 남아 PRE 순위에 쓰인다(관문 10200401). 없으면 null(이전 관측은 자기 시각으로 늙는다). */
export function nqObservationOf(backdrop: any, dateOf: (ms: number) => string): MapValue | null {
  const f = backdrop?.futures;
  const at = Date.parse(typeof f?.nqAsOf === 'string' ? f.nqAsOf : '');
  const v = f?.nq?.changePct;
  if (!f?.live || !finiteMapNumber(v) || !(at > 0)) return null;
  return { value: v, date: dateOf(at), session: 'PRE', at, kind: 'live' };
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
    const relative = today && benchmark && comparable(today, benchmark) ? today.value - benchmark.value : null;
    const bounce = !!today && !!s.fiveDay && ((today.value > 0.3 && s.fiveDay.value < -1) || (today.value < -0.3 && s.fiveDay.value > 1));
    return { ...s, today, relative, bounce, stocks: stockValues.map(s => ({ ...s, relative: today && s.move && comparable(today, s.move) ? s.move.value - today.value : null })) };
  });
  const isCurrent = (s: MapSector) => {
    const benchmark = session === 'PRE' ? nq : spy, targetDate = session === 'PRE' ? date : regularDate;
    return !!s.today && !!benchmark && s.relative !== null
      && currentValue(s.today, session, targetDate, now) && currentValue(benchmark, session, targetDate, now);
  };
  const ranked = sectors.filter(isCurrent).sort((a, b) => b.relative! - a.relative! || a.id.localeCompare(b.id));
  const leaders = ranked.slice(0, 3), used = new Set(leaders.map(s => s.id));
  const laggards = ranked.filter(s => !used.has(s.id)).slice(-3).reverse();
  return { session, date, sectors, leaders, laggards, prior: sectors.filter(s => !isCurrent(s)), sources: mergeMoneyMapSources(sources, undefined, now) };
}
export function mapWeekRange(now: number): { from: string; to: string } {
  const date = etDateOf(now), day = new Date(`${date}T12:00:00Z`), dow = day.getUTCDay();
  // Weekend prepares the coming week; weekdays retain this week's complete schedule.
  day.setUTCDate(day.getUTCDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));
  const from = day.toISOString().slice(0, 10); day.setUTCDate(day.getUTCDate() + 4);
  return { from, to: day.toISOString().slice(0, 10) };
}
