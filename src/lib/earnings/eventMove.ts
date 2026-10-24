import { atmStraddleImpliedMove, eodQuoteRows, type ImpliedMove } from '@/lib/impliedMove';
import { isNonTradingDay } from '@/lib/marketCalendar';

export type EarningsMoveMethod = 'weekly' | 'event-split' | 'monthly';
/** Preserve the observed straddle; the event estimate is a separate quantity. */
export type EarningsMove = ImpliedMove & { method: EarningsMoveMethod; eventMovePct?: number };
const DAY = 86400_000;

/** Calendar classification only; collection always uses the supplier's actual list. */
export function monthlyExpiryAfter(after: string, sameDay: boolean): string {
  const month = new Date(`${after.slice(0, 7)}-01T12:00:00Z`);
  for (let i = 0; i < 2; i++) {
    const first = new Date(month);
    first.setUTCMonth(first.getUTCMonth() + i);
    const offset = (5 - first.getUTCDay() + 7) % 7;
    let expiry = new Date(first.getTime() + (offset + 14) * DAY).toISOString().slice(0, 10);
    while (isNonTradingDay(expiry)) expiry = new Date(Date.parse(`${expiry}T12:00:00Z`) - DAY).toISOString().slice(0, 10);
    if (sameDay ? expiry >= after : expiry > after) return expiry;
  }
  throw new Error('monthly expiry out of range');
}

export const expiryMethod = (expiry: string): 'weekly' | 'monthly' => monthlyExpiryAfter(expiry, true) === expiry ? 'monthly' : 'weekly';

/** Same-session, two-sided EOD ATM IV, in annualized decimal units. No IV imputation. */
function atmIv(rows: any[], im: ImpliedMove): number | null {
  const legs = ['call', 'put'].map(type => rows.find(c =>
    c?.details?.expiration_date === im.expiry && c?.details?.strike_price === im.strike
    && c?.details?.contract_type === type && c?._intrinio?.date === im.session));
  const ivs = legs.map(c => c?._intrinio?.eod?.iv);
  if (!ivs.every(iv => typeof iv === 'number' && Number.isFinite(iv) && iv > 0)) return null;
  return (ivs[0] + ivs[1]) / 2;
}

/** User-specified event variance approximation. Missing/zero estimates retain the real monthly straddle. */
// eventMovePct 생략(null): post가 발표 전 EOD가 아니거나 직전 만기·동일 체인 날짜·양쪽 ATM 호가/IV가 없거나 기간·분리값 범위가 유효하지 않을 때.
export function splitMonthlyEvent(post: ImpliedMove, postRows: any[], preRows: any[], after: string, sameDay = true): EarningsMove {
  const monthly: EarningsMove = { ...post, method: 'monthly' };
  if (!post.expiry || !post.session || post.session >= after || post.basis !== 'eod') return monthly;
  const preExpiry = [...new Set<string>(preRows.map(c => c?.details?.expiration_date)
    .filter((e): e is string => typeof e === 'string' && e > post.session! && (sameDay ? e < after : e <= after)))].sort().pop();
  if (!preExpiry) return monthly;
  const rows = preRows.filter(c => c?.details?.expiration_date === preExpiry);
  if (rows.some(c => c?._intrinio?.date !== post.session)) return monthly;
  const pre = atmStraddleImpliedMove(eodQuoteRows(rows), post.spot, { expiry: preExpiry, chainDate: post.session });
  if (!pre) return monthly;
  const ivPost = atmIv(postRows, post), ivPre = atmIv(rows, pre);
  const tPost = (Date.parse(post.expiry) - Date.parse(post.session)) / DAY / 365;
  if (ivPost == null || ivPre == null || !(tPost > 1 / 365)) return monthly;
  const pct = Math.round(Math.sqrt(Math.max(0, ivPost ** 2 * tPost - ivPre ** 2 * (tPost - 1 / 365))) * 1000) / 10;
  return pct > 0 && pct < 100 ? { ...monthly, method: 'event-split', eventMovePct: pct } : monthly;
}
