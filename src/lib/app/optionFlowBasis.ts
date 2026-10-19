/** Options flow dates describe the displayed metrics, independently of the stock market session.
 * Realtime Greeks/quotes do not make EOD premium or volume realtime.
 */
type FlowBasisSource = {
  dataFreshness?: { premium?: unknown; volume?: unknown; chainDate?: unknown } | null;
};

export function optionFlowBasisLabel(
  flow: FlowBasisSource | null | undefined,
  locale: string,
  metrics: readonly ('premium' | 'volume')[] = ['premium', 'volume'],
): string | null {
  if (!flow || metrics.every(metric => flow.dataFreshness?.[metric] === 'REALTIME')) return null;
  // Only a date attached to these option values is evidence. Stock-session dates,
  // response ages and realtime quote timestamps cannot date an EOD options cache.
  // 옵션 값 묶음(dataFreshness)이 스스로 밝힌 날짜만 — 구조·레벨의 chainDate 는 프리미엄 날짜가 아니다(관문 10200744).
  const date = flow.dataFreshness?.chainDate;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return locale === 'ko' ? `${md} 기준` : locale === 'ja' ? `${md} 時点` : `as of ${md}`;
}
