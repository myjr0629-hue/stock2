// ============================================================================
// lastSession — reconstruct the last completed regular trading session
// ----------------------------------------------------------------------------
// WHY: On a market HOLIDAY (a weekday the market is closed, e.g. US Independence
// Day observed), Polygon's live snapshot has an EMPTY day bar: `day.c === 0`,
// `afterHours.p` is null, `lastTrade.p`/`min.c` are 0. `prevDay.c` holds the last
// real session's regular close but there is no field for the session BEFORE it,
// so change% can't be derived and after-hours is gone.
//
// On weekends this doesn't happen (the snapshot keeps Friday's bar), which is why
// only holidays (and holiday-adjacent weekends) break. Price paths branch only on
// `session === 'closed'`, treating a holiday like a weekend — so the weekend
// fallbacks silently collapse to `prevClose` (change 0.00%, POST mirrors regular).
//
// This helper rebuilds the last session from DURABLE Polygon history:
//   - daily aggregates (desc) → last two real session closes → regular close + change%
//   - the last session's open-close → its after-hours close → POST price + change%
// so the app always shows the last session's data, holiday or not.
//
// Only call this for tickers whose snapshot day bar is empty on a CLOSED session
// (i.e. `session === 'closed' && !snap.day.c`), so normal regular/pre/post/weekend
// behavior is never touched.
// ============================================================================

import { fetchMassive, CACHE_POLICY } from '@/services/massiveClient';

export interface LastSessionData {
  /** last completed regular session close (e.g. Thursday's close) */
  regClose: number;
  /** the session-before close, baseline for the regular change% (e.g. Wednesday) */
  prevClose: number;
  /** (regClose - prevClose) / prevClose * 100 */
  changePct: number;
  /** last session's after-hours close (0 if none / same as regClose) */
  postPrice: number;
  /** (postPrice - regClose) / regClose * 100 (0 when no post) */
  postChangePct: number;
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Reconstruct the last completed trading session for the given tickers.
 * Returns a map keyed by ticker; a ticker is omitted if history is unavailable
 * (caller keeps its existing fallback for those).
 */
export async function reconstructLastSession(
  tickers: string[],
): Promise<Record<string, LastSessionData>> {
  const out: Record<string, LastSessionData> = {};
  if (!tickers.length) return out;

  const to = utcDate(Date.now());
  const from = utcDate(Date.now() - 30 * 86_400_000); // 30d window → always ≥2 sessions

  await Promise.all(
    tickers.map(async (t) => {
      try {
        const aggs = await fetchMassive(
          `/v2/aggs/ticker/${t}/range/1/day/${from}/${to}`,
          { adjusted: 'true', sort: 'desc', limit: '3' },
          false,
          undefined,
          CACHE_POLICY.LIVE,
        ).catch(() => null);

        const rs: Array<{ c?: number; t?: number }> = aggs?.results || [];
        if (rs.length < 2) return;

        const regClose = rs[0]?.c || 0;
        const prevClose = rs[1]?.c || 0;
        if (!(regClose > 0 && prevClose > 0)) return;

        const changePct = ((regClose - prevClose) / prevClose) * 100;

        // Last session's after-hours from its daily open-close bar.
        let postPrice = 0;
        let postChangePct = 0;
        const lastTs = rs[0]?.t;
        if (lastTs) {
          const oc = await fetchMassive(
            `/v1/open-close/${t}/${utcDate(lastTs)}`,
            { adjusted: 'true' },
            false,
            undefined,
            CACHE_POLICY.LIVE,
          ).catch(() => null);
          const ah = oc?.afterHours || 0;
          // require a real, distinct after-hours print (avoid mirroring the close)
          if (ah > 0 && Math.abs(ah - regClose) / regClose > 0.0001) {
            postPrice = ah;
            postChangePct = ((ah - regClose) / regClose) * 100;
          }
        }

        out[t] = { regClose, prevClose, changePct, postPrice, postChangePct };
      } catch {
        // skip this ticker; caller keeps its own fallback
      }
    }),
  );

  return out;
}
