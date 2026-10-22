'use strict';

// 합계에 사용한 계약들이 같은 EOD 세션임을 확인한다. 날짜를 수집일로 추정하지 않는다.
function optionHistoryDate(contracts) {
  const dates = new Set();
  if (!contracts.length) return { chainDate: null, optionBasis: 'eod' };
  for (const c of contracts) {
    const d = c.eodDate;
    const ms = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? Date.parse(d) : NaN;
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== d) {
      return { chainDate: null, optionBasis: 'eod' };
    }
    dates.add(d);
  }
  return { chainDate: dates.size === 1 ? [...dates][0] : null, optionBasis: 'eod' };
}

module.exports = { optionHistoryDate };
