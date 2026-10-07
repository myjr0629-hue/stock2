/**
 * 13F «기관 보유» 패널 — 합계·비중이 «어떤 표본» 기준인지 정직하게 적는다 (2026-10-07, 앱 강화 0단계 T7)
 *
 * 배경(진단 확정): /api/command/13f 의 Redis 색인(signum-13f Lambda)은 9/20 주간 실행(3,831쪽·NVDA 5,937곳)이 마지막으로 완전했고,
 *   9/27·10/4 실행은 5쪽(≈4~5천 행)만 읽어 «제출이 빠른 소형 자문사 24곳»(NVDA 합계 $0.7B)으로 색인을 덮어썼다. 패널은 그 합계·비중을
 *   «전체 기관»처럼 보여 줬다. 수리(전수 재색인·원천 점검)는 별도 작업 — 그동안 화면이 «제출 기관 N곳 기준 · 기준일»을 같이 말한다.
 *   (숨기지 않는다 — 표시를 가리지 않고 근거를 덧붙인다.)
 *
 * 앱 전용 표기다: MobileCmd13F 가 locale 을 넘길 때만 쓴다(웹 MobileCmd13FOnly 는 무변경).
 * 순수 함수 — 시험 tests/holdersBasis.test.ts.
 */

export type HoldersLocale = 'ko' | 'en' | 'ja';
export const asHoldersLocale = (l?: string): HoldersLocale => (l === 'ko' || l === 'ja' ? l : 'en');

interface HolderRow { marketValue?: number | null; period?: string | null }
interface Summary { totalHolders?: number | null; totalValue?: number | null; period?: string | null }

/** summary 가 없는 응답(원천이 Intrinio 일 때)에서 표시용 합계를 «보여 주는 목록 기준»으로 만든다 — «0곳·$0» 으로 보이던 결함 수리 */
export function deriveHoldersSummary(
  summary: Summary | null | undefined,
  holders: HolderRow[],
  top?: { totalHolders?: number | null; period?: string | null },
): { totalHolders: number; totalValue: number; period: string | null } {
  if (summary && Number(summary.totalHolders) > 0) {
    return {
      totalHolders: Number(summary.totalHolders),
      totalValue: Number(summary.totalValue) || holders.reduce((s, h) => s + (Number(h.marketValue) || 0), 0),
      period: summary.period ?? holders[0]?.period ?? top?.period ?? null,
    };
  }
  // summary 없음: 합계와 비중의 분모를 «목록에 실린 기관»으로 고정한다(응답의 totalHolders 는 요청 상한(120)에 걸린 수라 합계와 짝이 맞지 않는다)
  return {
    totalHolders: holders.length,
    totalValue: holders.reduce((s, h) => s + (Number(h.marketValue) || 0), 0),
    period: holders[0]?.period || top?.period || null,
  };
}

/** «제출 기관 N곳 기준 · 기준일 YYYY-MM-DD» (대표 지정 문구) — 기준일을 모르면 앞부분만 */
export function holdersBasisLabel(locale: string | undefined, totalHolders: number, period: string | null | undefined): string {
  const l = asHoldersLocale(locale);
  const n = Math.max(0, Math.round(Number(totalHolders) || 0)).toLocaleString('en-US');
  const d = period && /^\d{4}-\d{2}-\d{2}/.test(period) ? period.slice(0, 10) : '';
  if (l === 'ko') return `제출 기관 ${n}곳 기준${d ? ` · 기준일 ${d}` : ''}`;
  if (l === 'ja') return `提出機関 ${n} 社ベース${d ? ` · 基準日 ${d}` : ''}`;
  return `Based on ${n} filing institution${n === '1' ? '' : 's'}${d ? ` · as of ${d}` : ''}`;
}
