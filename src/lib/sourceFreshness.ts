/**
 * The one ordering for «which measured value is newer» (home sector tiles, rotation rows, snapshot repair).
 * A value carries the date of the session it measured (YYYY-MM-DD). Dated beats undated, a later date beats
 * an earlier one, and a tie keeps the earlier candidate — callers list the current response first.
 * Nothing newer may ever be replaced by something older.
 */
export const isSourceDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** > 0 when `a` is newer than `b`, < 0 when older, 0 when equally new (including both undated). */
export function compareSourceDate(a: unknown, b: unknown): number {
  const da = isSourceDate(a) ? a : '';
  const db = isSourceDate(b) ? b : '';
  return da === db ? 0 : da > db ? 1 : -1;
}

/** Newest candidate by source date; ties keep list order (first wins). */
export function pickFreshest<T>(candidates: readonly T[], dateOf: (c: T) => unknown): T | undefined {
  let best: T | undefined;
  for (const c of candidates) if (best === undefined || compareSourceDate(dateOf(c), dateOf(best)) > 0) best = c;
  return best;
}
