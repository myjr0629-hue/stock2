import { reactionSessions, type ActualsRecord } from '../src/lib/earnings/earningsActuals';

export const NOW = Date.parse('2026-10-20T12:00:00-04:00');
export function record(ticker = 'JPM', expectedPct = 3, actualPct = -2, check: 'fmp' | null = 'fmp',
  date = '2026-10-13', hour: 'bmo' | 'amc' = 'bmo'): ActualsRecord {
  const sessions = reactionSessions(date, hour)!;
  const at = Date.parse(`${sessions.react}T21:00:00Z`);
  return {
    v: 1, ticker, date, hour, at,
    expected: { firstExpiryVerified: true, pct: expectedPct, expiry: '2026-10-16', session: sessions.base, basis: 'eod',
      strike: 100, straddle: expectedPct, spot: 100, capturedAt: Date.parse(`${sessions.base}T20:00:00Z`), src: 'page' },
    actual: { pct: actualPct, baseDate: sessions.base, reactDate: sessions.react, baseClose: 100,
      reactClose: 100 * (1 + actualPct / 100), src: 'intrinio-daily', check, at },
  };
}
