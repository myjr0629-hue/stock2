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

// ── 다음 주요 지표(대표 10/18 «경제 캘린더의 가장 최근 주요 지표 발표 일정 + 아래 AI 해석») ──
export interface NextMajorEvent {
  /** 공급사 이름 그대로(번역은 화면에서 경제 캘린더와 같은 규칙으로) */
  event: string;
  /** 발표 시각(UTC ms) — 화면이 언어별 시간대로 바꿔 쓴다 */
  utcMs: number;
  /** ET 날짜·시각(캐시 키·AI 프롬프트용) */
  etDate: string; etTime: string;
  estimate: number | null; previous: number | null; unit: string | null;
  /** 같은 시각에 함께 나오는 다른 HIGH 지표 수 */
  alsoCount: number;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** 지금부터 horizonDays 안의 미국 HIGH 지표 중 가장 가까운 발표. 같은 시각이면 PRIORITY 순. 발표 15분 뒤까지는 «방금 발표»로 남긴다. */
export function selectNextMajorEvent(events: unknown, now: number, horizonDays = 7): NextMajorEvent | null {
  if (!Array.isArray(events)) return null;
  const rows: Array<NextMajorEvent & { rank: number }> = [];
  for (const e of events) {
    if (!e || e.impact !== 'HIGH' || (e.country != null && e.country !== 'US') ||
        typeof e.event !== 'string' || !e.event.trim()) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '') || !/^\d{2}:\d{2}$/.test(e.time ?? '')) continue;
    const ms = Date.parse(`${e.date}T${e.time}:00Z`);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 16) !== `${e.date}T${e.time}`) continue;
    if (ms < now - 15 * 60_000 || ms > now + horizonDays * 86_400_000) continue;
    const et = fmpCalendarToET(e.date, e.time);
    if (!et) continue;
    const rank = PRIORITY.findIndex((pattern) => pattern.test(e.event));
    rows.push({ event: e.event.trim(), utcMs: ms, etDate: et.date, etTime: et.time,
      estimate: num(e.estimate), previous: num(e.previous), unit: typeof e.unit === 'string' ? e.unit : null,
      alsoCount: 0, rank: rank < 0 ? PRIORITY.length : rank });
  }
  if (!rows.length) return null;
  rows.sort((a, b) => a.utcMs - b.utcMs || a.rank - b.rank || a.event.localeCompare(b.event));
  const first = rows[0];
  const { rank: _rank, ...out } = first;
  return { ...out, alsoCount: rows.filter((r) => r.utcMs === first.utcMs).length - 1 };
}

const TZ: Record<Loc, { zone: string; label: string }> = {
  ko: { zone: 'Asia/Seoul', label: 'KST' }, ja: { zone: 'Asia/Tokyo', label: 'JST' }, en: { zone: 'America/New_York', label: 'ET' },
};

/** «10/20(화) 21:30 KST» — 언어별 시간대 */
export function releaseTimeLabel(utcMs: number, loc: Loc): string {
  const { zone, label } = TZ[loc];
  const parts = Object.fromEntries(new Intl.DateTimeFormat(loc === 'en' ? 'en-US' : loc, {
    timeZone: zone, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  return `${parts.month}/${parts.day}(${parts.weekday}) ${parts.hour}:${parts.minute} ${label}`;
}

/** 남은 시간 «2일 후» · «5시간 후» · «곧» · «방금 발표» */
export function untilLabel(utcMs: number, now: number, loc: Loc): string {
  const d = utcMs - now;
  const L = { ko: ['방금 발표', '곧', '시간 후', '일 후'], en: ['just released', 'soon', 'h', 'd'], ja: ['発表直後', 'まもなく', '時間後', '日後'] }[loc];
  if (d <= 0) return L[0];
  if (d < 60 * 60_000) return L[1];
  if (d < 24 * 3_600_000) return loc === 'en' ? `in ${Math.floor(d / 3_600_000)}${L[2]}` : `${Math.floor(d / 3_600_000)}${L[2]}`;
  const days = Math.round(d / 86_400_000);
  return loc === 'en' ? `in ${days}${L[3]}` : `${days}${L[3]}`;
}

export const NEXT_COPY: Record<Loc, { next: string; estimate: string; previous: string; also: (n: number) => string; earnings: string; calendar: string }> = {
  ko: { next: '다음 주요 지표', estimate: '예상', previous: '이전', also: (n) => `외 ${n}건`, earnings: '실적', calendar: '경제 캘린더' },
  en: { next: 'Next key release', estimate: 'Est', previous: 'Prev', also: (n) => `+${n} more`, earnings: 'Earnings', calendar: 'Economic calendar' },
  ja: { next: '次の主要指標', estimate: '予想', previous: '前回', also: (n) => `他${n}件`, earnings: '決算', calendar: '経済カレンダー' },
};
