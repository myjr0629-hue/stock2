/** Options flow dates describe the displayed metrics, independently of the stock market session.
 * Realtime Greeks/quotes do not make EOD premium or volume realtime.
 */
type FlowBasisSource = {
  dataFreshness?: { premium?: unknown; volume?: unknown; chainDate?: unknown } | null;
  chainDate?: unknown;
};

type ClosedSnapshot = {
  session?: unknown;
  prices?: { regularDate?: unknown } | null;
  baseline?: { shownSessionET?: unknown } | null;
  _stale?: unknown;
  _lastGoodAgeMs?: unknown;
};

export function optionFlowBasisLabel(
  flow: FlowBasisSource | null | undefined,
  locale: string,
  metrics: readonly ('premium' | 'volume')[] = ['premium', 'volume'],
  snapshot?: ClosedSnapshot | null,
): string | null {
  if (!flow || metrics.every(metric => flow.dataFreshness?.[metric] === 'REALTIME')) return null;
  // Prefer the actual option date, including an older date. Never replace it with the market date.
  let date = flow.dataFreshness?.chainDate ?? flow.chainDate;
  // Legacy CLOSED responses omit the option date despite declaring these metrics previous-session EOD.
  // Infer that session only for a healthy CLOSED snapshot whose two regular-session dates agree.
  // This is a fallback under the declared EOD contract, not a recovered contract observation.
  // REG/PRE/POST, stale last-good payloads and undated unified.structure cannot use this inference.
  // Fresh uncached responses have neither last-good field; cached healthy responses have false/0.
  const healthy = snapshot && ((snapshot._stale === undefined && snapshot._lastGoodAgeMs === undefined)
    || (snapshot._stale === false && snapshot._lastGoodAgeMs === 0));
  if (date == null && snapshot?.session === 'CLOSED'
    && healthy
    && metrics.every(metric => flow.dataFreshness?.[metric] === 'EOD')
    && snapshot.prices?.regularDate === snapshot.baseline?.shownSessionET) {
    date = snapshot.prices?.regularDate;
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return locale === 'ko' ? `${md} 기준` : locale === 'ja' ? `${md} 時点` : `as of ${md}`;
}
