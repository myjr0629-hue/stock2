import { CONFIRMED_EARNINGS, type ConfirmedEarnings } from '@/lib/earningsConfirmed';
import { phaseOf } from '@/lib/earningsWeek';
import { daysBetweenYmd, etDateOf } from '@/lib/marketCalendar';
import { impliedForRow } from '@/lib/earnings/earningsImplied';
import { actualsKey } from '@/lib/earnings/earningsActuals';
import { scorecardPairOf, type ScorecardRow } from '@/lib/earnings/earningsScorecard';

export type Intent = { ticker: string; date: string; pct: number | null; history: ScorecardRow | null };
export function upcoming(ticker: string, now = Date.now(), list: readonly ConfirmedEarnings[] = CONFIRMED_EARNINGS) {
  const today = etDateOf(now);
  return list.filter(e => e.ticker === ticker && (daysBetweenYmd(today, e.date) ?? -1) >= 0
    && (daysBetweenYmd(today, e.date) ?? 8) <= 7 && phaseOf(e.date, e.hour, now) !== 'done')
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

// Read only existing snapshots; never refresh the calendar or options data.
export async function readIntent(ticker: string, now = Date.now()): Promise<Intent | null> {
  const event = upcoming(ticker, now);
  if (!event) return null;
  const base: Intent = { ticker, date: event.date, pct: null, history: null };
  try {
    const [{ readImpliedPack }, { mgetFromCacheStrict }] = await Promise.all([
      import('@/services/earningsImpliedService'), import('@/services/redisClient'),
    ]);
    // Records are keyed by announcement date; the confirmed list retains only one date per ticker.
    // Probe the preceding 120 calendar days in one bounded read for the latest quarter.
    const dates = Array.from({ length: 120 }, (_, i) => {
      const d = new Date(`${event.date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - i - 1); return d.toISOString().slice(0, 10);
    });
    const [pack, records] = await Promise.all([
      readImpliedPack().catch(() => null), mgetFromCacheStrict<unknown>(dates.map(d => actualsKey(ticker, d))).catch(() => []),
    ]);
    base.pct = impliedForRow(event, pack, now)?.pct ?? null;
    for (let i = 0; i < dates.length; i++) {
      const row = scorecardPairOf(records[i], now)?.row;
      if (row && row.ticker === ticker && row.date === dates[i]) { base.history = row; break; }
    }
  } catch { /* The confirmed date is still usable if storage is unavailable. */ }
  return base;
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function intentCopy(v: Intent, locale: string) {
  const loc = locale === 'ko' || locale === 'ja' ? locale : 'en';
  const date = loc === 'en' ? `${months[Number(v.date.slice(5, 7)) - 1]} ${Number(v.date.slice(8))}` : `${Number(v.date.slice(5, 7))}/${Number(v.date.slice(8))}`;
  const pct = v.pct == null ? null : `±${v.pct.toFixed(1)}%`;
  if (loc === 'ko') return {
    title: `${v.ticker} 실적 ${date}: 옵션 예상 변동폭${pct ? ` ${pct}` : ''} — 예상 vs 실제 | SIGNUM HQ`,
    heading: '실적 예상 vs 실제', upcoming: `${v.ticker} 실적 발표 ${date} · 옵션 예상 변동폭 ${pct ?? '미확인'}`,
    history: v.history && `${v.history.date} 예상 ±${v.history.expectedPct.toFixed(1)}% → 실제 ${v.history.actualPct > 0 ? '+' : ''}${v.history.actualPct.toFixed(1)}% · ${v.history.beyond ? '범위 밖' : '범위 안'}`,
    q1: `${v.ticker} 실적 예상 변동폭은?`, a1: `${v.ticker} 실적 발표 ${date}의 옵션 예상 변동폭은 ${pct ?? '아직 확인되지 않았습니다'}.`,
    q2: '예상 변동폭은 어떻게 계산하나?', a2: '발표 후 첫 만기의 ATM 콜과 풋 가격을 더한 스트래들을 주가로 나눕니다. 옵션 만기까지의 범위이며 실적 후 하루 실제 변동과 기간이 다릅니다.',
  };
  if (loc === 'ja') return {
    title: `${v.ticker} 決算 ${date}：オプション想定変動幅${pct ? ` ${pct}` : ''} — 想定と実際 | SIGNUM HQ`,
    heading: '決算の想定と実際', upcoming: `${v.ticker} 決算発表 ${date} · オプション想定変動幅 ${pct ?? '未確認'}`,
    history: v.history && `${v.history.date} 想定 ±${v.history.expectedPct.toFixed(1)}% → 実際 ${v.history.actualPct > 0 ? '+' : ''}${v.history.actualPct.toFixed(1)}% · ${v.history.beyond ? '範囲外' : '範囲内'}`,
    q1: `${v.ticker}の決算想定変動幅は？`, a1: `${v.ticker}の${date}決算のオプション想定変動幅は${pct ?? '未確認'}です。`,
    q2: '想定変動幅はどう計算する？', a2: '発表後最初の満期のATMコールとプットの価格を合計したストラドルを株価で割ります。満期までの範囲であり、決算後1日の実際の変動とは期間が異なります。',
  };
  return {
    title: `${v.ticker} Earnings ${date}: Options Price ${pct ? `a ${pct} Move` : 'an Expected Move'} — Expected vs Actual | SIGNUM HQ`,
    heading: 'Earnings expected vs actual', upcoming: `${v.ticker} earnings ${date} · Options expected move ${pct ?? 'unavailable'}`,
    history: v.history && `${v.history.date} Expected ±${v.history.expectedPct.toFixed(1)}% → Actual ${v.history.actualPct > 0 ? '+' : ''}${v.history.actualPct.toFixed(1)}% · ${v.history.beyond ? 'outside range' : 'within range'}`,
    q1: `What is ${v.ticker}'s earnings expected move?`, a1: `${v.ticker} reports ${date}; the options expected move is ${pct ?? 'not yet available'}.`,
    q2: 'How is the expected move calculated?', a2: 'Add the ATM call and put prices for the first expiry after the announcement and divide by the stock price. This range extends to expiry; the actual reaction covers one session.',
  };
}
