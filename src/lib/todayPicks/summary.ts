import { fmpCalendarToET } from '@/lib/fmpCalendarTime';
import { etDateOf, isNonTradingDay } from '@/lib/marketCalendar';
import type { Loc, PickKind } from './types';

export interface TodayEconomicEvent { date: string; time: string; event: string }

// Rank only supplier-provided event names. The displayed name is never translated or invented.
const PRIORITY = [
  /\bcpi\b|consumer price index/i,
  /\bnfp\b|non[ -]?farm.*payroll/i,
  /\bfomc\b|fed interest rate decision|federal funds.*rate/i,
  /\bgdp\b|gross domestic product/i,
  /\bpce\b|personal consumption expenditures/i,
  /retail sales/i,
  /\bppi\b|producer price index/i,
  /\bism\b/i,
];

/** Today ET through the next trading day, inclusive (weekends/NYSE holidays included). */
export function summaryDateWindow(now: number): { from: string; to: string } {
  const from = etDateOf(now);
  const next = new Date(`${from}T12:00:00Z`);
  let to: string;
  do { next.setUTCDate(next.getUTCDate() + 1); to = next.toISOString().slice(0, 10); } while (isNonTradingDay(to));
  return { from, to };
}

/** Input is the US-only fmp:econ-calendar cache, whose date/time remain UTC. */
export function selectTodayEconomicEvent(events: unknown, now: number): TodayEconomicEvent | null {
  if (!Array.isArray(events)) return null;
  const { from, to } = summaryDateWindow(now);
  const candidates: Array<TodayEconomicEvent & { rank: number }> = [];
  for (const e of events) {
    if (!e || e.impact !== 'HIGH' || (e.country != null && e.country !== 'US') ||
        typeof e.event !== 'string' || !e.event.trim()) continue;
    // Reject missing/invalid times rather than inventing a release time.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '') || !/^\d{2}:\d{2}$/.test(e.time ?? '')) continue;
    const ms = Date.parse(`${e.date}T${e.time}:00Z`);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 16) !== `${e.date}T${e.time}`) continue;
    const et = fmpCalendarToET(e.date, e.time);
    if (!et || et.date < from || et.date > to) continue;
    const rank = PRIORITY.findIndex((pattern) => pattern.test(e.event));
    candidates.push({ ...et, event: e.event, rank: rank < 0 ? PRIORITY.length : rank });
  }
  // Across the whole window choose the most important release, then the earliest occurrence.
  candidates.sort((a, b) => a.rank - b.rank || a.date.localeCompare(b.date) ||
    a.time.localeCompare(b.time) || a.event.localeCompare(b.event));
  const first = candidates[0];
  return first ? { date: first.date, time: first.time, event: first.event } : null;
}

export const SUMMARY_COPY = {
  ko: { title: '오늘 요약', total: (n: number) => `오늘 볼 것 ${n}개`,
    kinds: { whale: '고래 신규', earnings: '실적 임박', darkpool: '다크풀 급증', gamma: 'Gamma Flip / Max Pain 근접' } },
  en: { title: 'Today’s summary', total: (n: number) => `${n} picks to watch`,
    kinds: { whale: 'Whale new positions', earnings: 'Earnings soon', darkpool: 'Dark pool surge', gamma: 'Near Gamma Flip / Max Pain' } },
  ja: { title: '今日のまとめ', total: (n: number) => `今日の注目 ${n}件`,
    kinds: { whale: 'ホエール新規', earnings: '決算間近', darkpool: 'ダークプール急増', gamma: 'Gamma Flip / Max Pain 接近' } },
} satisfies Record<Loc, { title: string; total: (n: number) => string; kinds: Record<PickKind, string> }>;

/** Full page items, not the two dashboard previews; each card counts once. */
export function summarizeTodayPicks(items: readonly { kind: PickKind }[], loc: Loc): { total: string; kinds: string } {
  const copy = SUMMARY_COPY[loc];
  const order: PickKind[] = ['whale', 'earnings', 'darkpool', 'gamma'];
  const counts = new Map<PickKind, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return { total: copy.total(items.length), kinds: order.filter((k) => counts.has(k))
    .map((k) => `${copy.kinds[k]} ${counts.get(k)}`).join(' · ') };
}

export function economicEventLine(event: TodayEconomicEvent, loc: Loc): string {
  const day = new Date(`${event.date}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }).format(day);
  return `${day.getUTCMonth() + 1}/${day.getUTCDate()}(${weekday}) ${event.time} ET ${event.event}`;
}
