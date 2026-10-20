/** Options flow dates describe the displayed metrics, independently of the stock market session.
 * Realtime Greeks/quotes do not make EOD premium or volume realtime.
 * [2026-10-20 NB3] 새 요소를 덧붙이지 않는다(대표 «기존 것을 부수지 마라») — 기존 «LIVE FLOW» 배지 자리의 글자만
 * 원천이 밝힌 기준일로 바꾼다. 날짜가 없으면 null(호출부는 기존 배지 그대로).
 */
type FlowBasisSource = {
  dataFreshness?: { premium?: unknown; volume?: unknown; chainDate?: unknown } | null;
};

/** 옵션 값 묶음(dataFreshness)이 스스로 밝힌 날짜만 — 구조·레벨의 chainDate·주가 세션 날짜·응답 나이는 쓰지 않는다. */
export function optionFlowBasisDate(
  flow: FlowBasisSource | null | undefined,
  metrics: readonly ('premium' | 'volume')[] = ['premium', 'volume'],
): string | null {
  if (!flow || metrics.every(metric => flow.dataFreshness?.[metric] === 'REALTIME')) return null;
  const date = flow.dataFreshness?.chainDate;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return date;
}

/** 배지 자리용 짧은 기준일 — «10/16 마감»·«10/16 終値»·«10/16 close». 날짜가 없으면 null. */
export function optionFlowBadgeLabel(
  flow: FlowBasisSource | null | undefined,
  locale: string,
  metrics: readonly ('premium' | 'volume')[] = ['premium', 'volume'],
): string | null {
  const date = optionFlowBasisDate(flow, metrics);
  if (!date) return null;
  const md = `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  return locale === 'ko' ? `${md} 마감` : locale === 'ja' ? `${md} 終値` : `${md} close`;
}
