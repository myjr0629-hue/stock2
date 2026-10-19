import { normalizeQuoteSession, oneNumberBase, oneNumberFromQuote } from '../../utils/calcPriceDisplay';

export const HOME_SECTORS = [
  ['Tech', 'XLK'], ['Energy', 'XLE'], ['Cons. Disc', 'XLY'], ['Materials', 'XLB'],
  ['Industrials', 'XLI'], ['Finance', 'XLF'], ['Healthcare', 'XLV'], ['Utilities', 'XLU'],
] as const;

export interface HomeSector {
  name: string;
  pct: number | null;
  /** Current measurements only; remembered values never influence the risk score. */
  riskPct?: number;
  base?: number;
  regularPct?: number;
  regularDate?: string;
  fallbackDate?: string;
}
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const dated = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Only dated regular-session measurements survive a missing quote. Extended values never become a regular close. */
export function buildHomeSectors(
  quotes: Record<string, any>, previous: HomeSector[] = [], session = '',
  todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
): HomeSector[] {
  return HOME_SECTORS.map(([name, ticker]) => {
    const q = quotes[ticker];
    const prev = previous.find(s => s?.name === name);
    const regValid = dated(q?.regularDate) && q.regularDate <= todayET
      && !q?.error && finite(q?.price) && q.price > 0 && finite(q?.changePercent);
    const priorClose = q?.previousClose ?? q?.prevClose;
    const measuredRegular = regValid && Math.abs(q.changePercent) < 0.0001 && finite(priorClose) && priorClose > 0
      ? (q.price - priorClose) / priorClose * 100 : regValid ? q.changePercent : undefined;
    const previousValid = finite(prev?.regularPct) && dated(prev?.regularDate) && prev.regularDate <= todayET;
    // A late response must never replace a newer dated measurement (including one restored from storage).
    const adoptRegular = regValid && (!previousValid || q.regularDate >= prev!.regularDate!);
    const regularPct = adoptRegular ? measuredRegular : previousValid ? prev!.regularPct : undefined;
    const regularDate = adoptRegular ? q.regularDate : previousValid ? prev!.regularDate : undefined;
    const sess = normalizeQuoteSession(String(q?.session || session));
    const one = !q?.error ? oneNumberFromQuote(q, sess) : null;
    // Session names describe the market clock, not the age of the supplied value.
    const currentExtended = one?.ext && q?.extendedDate === todayET && finite(one.changePct);
    const current = currentExtended ? one!.changePct
      : adoptRegular && q.regularDate === todayET ? measuredRegular! : null;
    return {
      name, pct: current ?? (finite(regularPct) && dated(regularDate) ? regularPct : null),
      riskPct: current ?? undefined,
      base: current != null ? oneNumberBase(q, sess) : undefined,
      regularPct, regularDate,
      fallbackDate: (current == null || (sess !== 'reg' && !currentExtended)) && finite(regularPct) && dated(regularDate) ? regularDate : undefined,
    };
  });
}
