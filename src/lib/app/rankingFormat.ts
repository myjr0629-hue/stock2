/**
 * 랭킹(앱 «랭킹 11종») 행의 «오늘 vs 기준» 숫자 서식 — 지표 종류별 유효숫자·단위 (2026-10-07, 앱 강화 0단계 T3)
 *
 * 옛 결함: `Math.round(it.baseline).toLocaleString()` 이 모든 기준값을 정수로 반올림해 «SPY 풋콜 비율 · 0.85 vs 2 → 0.56×»(실제 기준값 1.52 — 0.85÷1.52=0.56 이지
 *   0.85÷2=0.43 이 아니다)로 보였고, 금액은 «50,698,303 vs 8,765,333» 처럼 단위·통화 없는 8자리였다. 비율은 소수 둘째 자리, 금액은 $·K·M·B 압축(유효숫자 3자리),
 *   수량(계약·주식)은 K·M·B 압축 — 그래야 «오늘 ÷ 기준 = 배수» 가 눈으로 맞는다.
 *
 * 순수 함수 — 시험 tests/rankingFormat.test.ts.
 */

export type RankUnit = 'ratio' | 'money' | 'count';

/** /api/ranking 의 deviation 축(metric) → 단위. 서버 DEV_AXES 와 같은 키: pcr · totalCallOI · totalPutOI · totalPremium */
export function rankUnitOf(metric: string | null | undefined): RankUnit {
  switch (metric) {
    case 'pcr': return 'ratio';
    case 'totalPremium': return 'money';
    default: return 'count';   // totalCallOI · totalPutOI(계약 수) · 다크풀 체결량(주식 수) · 모르는 지표
  }
}

/** 유효숫자 3자리 — 100 이상 정수 · 10~100 소수 1자리 · 10 미만 소수 2자리 */
const sig3 = (x: number): string => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));
const UNITS: Array<[number, string]> = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

/** 1,234,567 → «1.23M» · 45,766,146 → «45.8M» · 512,711 → «513K» · 6,206 → «6.21K» · 512 → «512» (prefix: «$» 등) */
export function fmtCompact(v: number, prefix = ''): string {
  if (!Number.isFinite(v)) return '—';
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  for (let i = 0; i < UNITS.length; i++) {
    const [div, suf] = UNITS[i];
    if (a < div) continue;
    const s = sig3(a / div);
    // 반올림이 1000 이 되면(999.6K → «1000K») 한 단위 위로
    if (parseFloat(s) >= 1000 && i > 0) return `${sign}${prefix}${sig3(a / UNITS[i - 1][0])}${UNITS[i - 1][1]}`;
    return `${sign}${prefix}${s}${suf}`;
  }
  return `${sign}${prefix}${Math.round(a)}`;
}

/** 한 값을 단위에 맞게: 비율 «1.52» · 금액 «$45.8M» · 수량 «2.65M» */
export function fmtRankValue(unit: RankUnit, v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (unit === 'ratio') return Number(v).toFixed(2);
  if (unit === 'money') return fmtCompact(v, '$');
  return fmtCompact(v);
}

/** «오늘 vs 기준» 한 줄. 한쪽이라도 없으면 null(줄을 지어내지 않는다) */
export function fmtRankPair(metric: string | null | undefined, today: unknown, baseline: unknown): string | null {
  if (today == null || baseline == null) return null;
  const a = Number(today);
  const b = Number(baseline);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const unit = rankUnitOf(metric);
  return `${fmtRankValue(unit, a)} vs ${fmtRankValue(unit, b)}`;
}

/** 달러 한 값 — «$32.9M» · «$513K» (돈과 미결제 행의 콜·풋 프리미엄) */
export function fmtMoney(v: unknown): string | null {
  if (v == null || v === '') return null;   // 없는 값을 «$0» 으로 지어내지 않는다
  const n = Number(v);
  return Number.isFinite(n) ? fmtCompact(n, '$') : null;
}
