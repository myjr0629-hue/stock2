/** Options flow dates describe the displayed metrics, independently of the stock market session.
 * Realtime Greeks/quotes do not make EOD premium or volume realtime.
 */
type FlowBasisSource = {
  dataFreshness?: { premium?: unknown; volume?: unknown; chainDate?: unknown } | null;
  chainDate?: unknown;
};

export function optionFlowBasisLabel(
  flow: FlowBasisSource | null | undefined,
  locale: string,
  metrics: readonly ('premium' | 'volume')[] = ['premium', 'volume'],
): string | null {
  if (!flow || metrics.every(metric => flow.dataFreshness?.[metric] === 'REALTIME')) return null;
  // Only a date attached to these option values is evidence. Stock-session dates,
  // response ages and realtime quote timestamps cannot date an EOD options cache.
  const date = flow.dataFreshness?.chainDate ?? flow.chainDate;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return locale === 'ko' ? `${md} 기준` : locale === 'ja' ? `${md} 時点` : `as of ${md}`;
}
