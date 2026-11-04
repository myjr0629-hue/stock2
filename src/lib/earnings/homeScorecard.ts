import { addDaysYmd } from '@/lib/earningsWeek';
import { calendarReaction, calendarScorecardSummary } from './calendarScorecardDisplay';
import { impliedPctText } from './earningsImplied';

type Locale = 'ko' | 'en' | 'ja';
type ReadWeek = (week: string) => Promise<unknown>;

/** 빈 이번 주에만 직전 주를 읽는다. 실패나 잘못된 응답은 표시하지 않는다. */
export async function homeScorecard(read: ReadWeek, week: string, locale: Locale): Promise<string | null> {
  try {
    let data = await read(week);
    let selected = week;
    const value = data as { week?: unknown; summary?: { n?: unknown; withinCount?: unknown }; rows?: unknown } | null;
    if (value?.week === week && value.summary?.n === 0 && value.summary.withinCount === 0) {
      selected = addDaysYmd(week, -7);
      data = await read(selected);
    }
    const summary = calendarScorecardSummary(data, selected);
    if (!summary) return null;
    const rows = (data as { rows?: unknown }).rows;
    if (!Array.isArray(rows)) return null;
    const row = [...rows].reverse().find((r) => r && typeof r.ticker === 'string' && r.ticker
      && typeof r.expectedPct === 'number' && Number.isFinite(r.expectedPct) && r.expectedPct > 0
      && typeof r.actualPct === 'number' && Number.isFinite(r.actualPct) && typeof r.beyond === 'boolean');
    if (!row) return null;
    const actual = calendarReaction({ pct: row.expectedPct, expiry: '', basis: null, session: '', reported: true, actualPct: row.actualPct, within: !row.beyond });
    const expected = impliedPctText(row.expectedPct);
    const previous = selected !== week;
    if (locale === 'ko') return `${previous ? '지난주' : '이번 주'} 채점: ${summary.n}종목 중 ${summary.withinCount}개 예상 범위 안 · 최근: ${row.ticker} 예상 ${expected} → 실제 ${actual}(${row.beyond ? '밖' : '안'})`;
    if (locale === 'ja') return `${previous ? '先週' : '今週'}の採点: ${summary.n}銘柄中${summary.withinCount}銘柄が予想範囲内 · 直近: ${row.ticker} 予想 ${expected} → 実際 ${actual}（${row.beyond ? '範囲外' : '範囲内'}）`;
    return `${previous ? 'Last week' : 'This week'}: ${summary.withinCount} of ${summary.n} within range · Latest: ${row.ticker} implied ${expected} → actual ${actual} (${row.beyond ? 'outside' : 'within'})`;
  } catch { return null; }
}
