import { CONFIRMED_EARNINGS, type ConfirmedEarnings } from '@/lib/earningsConfirmed';
import { phaseOf } from '@/lib/earningsWeek';
import { daysBetweenYmd, etDateOf } from '@/lib/marketCalendar';
import { impliedForRow } from '@/lib/earnings/earningsImplied';
import { actualsKey, actualsLatestKey, parseLatestPointer } from '@/lib/earnings/earningsActuals';
import { scorecardPairOf, type ScorecardRow } from '@/lib/earnings/earningsScorecard';

/**
 * basis = 화면·메타·FAQ 에 나가는 pct 의 정의 — 실적 묶음 칸(earnings:implied:v1)의 값 그대로:
 *   'straddle'    발표 후 첫 만기 ATM 스트래들 ÷ 주가
 *   'event-split' 같은 만기 ATM 내재변동성에서 직전 만기의 평상시 변동분을 뺀 «실적 이벤트 분리값»(lib/earnings/eventMove.splitMonthlyEvent)
 * history.expectedPct 는 성적표 기준(ATM 스트래들 — earningsActuals.atmReceiptExpectedPct)이라 문구에 그 기준을 함께 적는다.
 */
export type IntentBasis = 'straddle' | 'event-split';
export type Intent = { ticker: string; date: string; pct: number | null; basis?: IntentBasis | null; history: ScorecardRow | null };
export function upcoming(ticker: string, now = Date.now(), list: readonly ConfirmedEarnings[] = CONFIRMED_EARNINGS) {
  const today = etDateOf(now);
  return list.filter(e => e.ticker === ticker && (daysBetweenYmd(today, e.date) ?? -1) >= 0
    && (daysBetweenYmd(today, e.date) ?? 8) <= 7 && phaseOf(e.date, e.hour, now) !== 'done')
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

// Read only existing snapshots; never refresh the calendar or options data (vendor calls per request: 0).
// Scorecard lookup reads at most 2 keys: the per-ticker latest-record pointer, then that one record (no date-window scan).
export async function readIntent(ticker: string, now = Date.now()): Promise<Intent | null> {
  const event = upcoming(ticker, now);
  if (!event) return null;
  const base: Intent = { ticker, date: event.date, pct: null, basis: null, history: null };
  try {
    const [{ readImpliedPack }, { mgetFromCacheStrict }] = await Promise.all([
      import('@/services/earningsImpliedService'), import('@/services/redisClient'),
    ]);
    const readHistory = async (): Promise<ScorecardRow | null> => {
      const [ptr] = await mgetFromCacheStrict<unknown>([actualsLatestKey(ticker)]).catch(() => [null]);
      const date = parseLatestPointer(ptr);
      if (!date || !(date < event.date)) return null;
      const [rec] = await mgetFromCacheStrict<unknown>([actualsKey(ticker, date)]).catch(() => [null]);
      const row = scorecardPairOf(rec, now)?.row;
      return row && row.ticker === ticker && row.date === date ? row : null;
    };
    const [pack, history] = await Promise.all([readImpliedPack().catch(() => null), readHistory().catch(() => null)]);
    const implied = impliedForRow(event, pack, now);
    if (implied) {
      // 칸의 값(p)은 이벤트 분리값이 있으면 그 값이다(services/impliedMoveService.impliedRowOf) — 정의를 값과 함께 넘긴다
      const split = typeof implied.eventMovePct === 'number' && Number.isFinite(implied.eventMovePct) && implied.eventMovePct > 0;
      base.pct = split ? implied.eventMovePct! : implied.pct;
      base.basis = split ? 'event-split' : 'straddle';
    }
    base.history = history;
  } catch { /* The confirmed date is still usable if storage is unavailable. */ }
  return base;
}

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function intentCopy(v: Intent, locale: string) {
  const loc = locale === 'ko' || locale === 'ja' ? locale : 'en';
  const date = loc === 'en' ? `${months[Number(v.date.slice(5, 7)) - 1]} ${Number(v.date.slice(8))}` : `${Number(v.date.slice(5, 7))}/${Number(v.date.slice(8))}`;
  const pct = v.pct == null ? null : `±${v.pct.toFixed(1)}%`;
  const split = v.pct != null && v.basis === 'event-split';
  if (loc === 'ko') return {
    title: `${v.ticker} 실적 ${date}: 옵션 예상 변동폭${pct ? ` ${pct}` : ''} — 예상 vs 실제 | SIGNUM HQ`,
    heading: '실적 예상 vs 실제', upcoming: `${v.ticker} 실적 발표 ${date} · 옵션 예상 변동폭 ${pct ?? '미확인'}`,
    history: v.history && `${v.history.date} 예상 ±${v.history.expectedPct.toFixed(1)}%(ATM 스트래들) → 실제 ${v.history.actualPct > 0 ? '+' : ''}${v.history.actualPct.toFixed(1)}% · ${v.history.beyond ? '범위 밖' : '범위 안'}`,
    q1: `${v.ticker} 실적 예상 변동폭은?`, a1: `${v.ticker} 실적 발표 ${date}의 옵션 예상 변동폭은 ${pct ?? '아직 확인되지 않았습니다'}.`,
    q2: '예상 변동폭은 어떻게 계산하나?', a2: split
      ? '발표 후 첫 만기 ATM 옵션의 내재변동성에서 직전 만기가 반영한 평상시 변동분을 빼, 실적 발표 자체에 반영된 변동폭만 분리합니다. 실제 변동은 발표 후 첫 거래일 하루입니다.'
      : '발표 후 첫 만기의 ATM 콜과 풋 가격을 더한 스트래들을 주가로 나눕니다. 옵션 만기까지의 범위이며 실적 후 하루 실제 변동과 기간이 다릅니다.',
  };
  if (loc === 'ja') return {
    title: `${v.ticker} 決算 ${date}：オプション想定変動幅${pct ? ` ${pct}` : ''} — 想定と実際 | SIGNUM HQ`,
    heading: '決算の想定と実際', upcoming: `${v.ticker} 決算発表 ${date} · オプション想定変動幅 ${pct ?? '未確認'}`,
    history: v.history && `${v.history.date} 想定 ±${v.history.expectedPct.toFixed(1)}%(ATMストラドル) → 実際 ${v.history.actualPct > 0 ? '+' : ''}${v.history.actualPct.toFixed(1)}% · ${v.history.beyond ? '範囲外' : '範囲内'}`,
    q1: `${v.ticker}の決算想定変動幅は？`, a1: `${v.ticker}の${date}決算のオプション想定変動幅は${pct ?? '未確認'}です。`,
    q2: '想定変動幅はどう計算する？', a2: split
      ? '発表後最初の満期のATMオプションのインプライド・ボラティリティから、直前の満期が織り込む平常時の変動分を差し引き、決算発表そのものに織り込まれた変動幅だけを分離します。実際の変動は発表後最初の取引日1日です。'
      : '発表後最初の満期のATMコールとプットの価格を合計したストラドルを株価で割ります。満期までの範囲であり、決算後1日の実際の変動とは期間が異なります。',
  };
  return {
    title: `${v.ticker} Earnings ${date}: Options Price ${pct ? `a ${pct} Move` : 'an Expected Move'} — Expected vs Actual | SIGNUM HQ`,
    heading: 'Earnings expected vs actual', upcoming: `${v.ticker} earnings ${date} · Options expected move ${pct ?? 'unavailable'}`,
    history: v.history && `${v.history.date} Expected ±${v.history.expectedPct.toFixed(1)}% (ATM straddle) → Actual ${v.history.actualPct > 0 ? '+' : ''}${v.history.actualPct.toFixed(1)}% · ${v.history.beyond ? 'outside range' : 'within range'}`,
    q1: `What is ${v.ticker}'s earnings expected move?`, a1: `${v.ticker} reports ${date}; the options expected move is ${pct ?? 'not yet available'}.`,
    q2: 'How is the expected move calculated?', a2: split
      ? 'Take the at-the-money implied volatility of the first expiry after the announcement and remove the ordinary-day variance priced by the prior expiry, isolating the move priced for the earnings event itself. The actual reaction covers the first session after the report.'
      : 'Add the ATM call and put prices for the first expiry after the announcement and divide by the stock price. This range extends to expiry; the actual reaction covers one session.',
  };
}
