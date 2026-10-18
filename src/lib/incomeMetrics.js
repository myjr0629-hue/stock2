/** Canonical quarterly income metrics; Lambda embeds this same source (parity-tested). */
function computeIncomeMetrics(rows) {
    const number = (value) => {
        if (typeof value !== 'number' && typeof value !== 'string') return null;
        if (typeof value === 'string' && !value.trim()) return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };
    const period = (row) => {
        const year = number(row && row.fiscal_year);
        const q = row && (row.fiscal_period ?? row.fiscal_quarter);
        const match = String(q ?? '').match(/^Q?([1-4])$/i);
        return year !== null && Number.isInteger(year) && year > 0 && match
            ? { year, quarter: Number(match[1]) } : null;
    };
    const ordered = (Array.isArray(rows) ? rows : []).filter(Boolean).slice().sort((a, b) => {
        const ap = period(a), bp = period(b);
        if (ap && bp) return (bp.year * 4 + bp.quarter) - (ap.year * 4 + ap.quarter);
        return String(b.period_end ?? '').localeCompare(String(a.period_end ?? ''));
    });
    const latest = ordered[0];
    const revenue = number(latest && latest.revenue);
    const income = number(latest && latest.consolidated_net_income_loss);
    const netMargin = revenue !== null && revenue > 0 && income !== null ? income / revenue * 100 : null;
    let revenueGrowth = null;
    const p = period(latest);
    if (p && revenue !== null) {
        const previous = ordered.find(row => {
            const other = period(row);
            return other && other.year === p.year - 1 && other.quarter === p.quarter;
        });
        const priorRevenue = number(previous && previous.revenue);
        if (priorRevenue !== null && priorRevenue > 0) revenueGrowth = (revenue - priorRevenue) / priorRevenue * 100;
    }
    return {
        netMargin: netMargin !== null && Number.isFinite(netMargin) ? netMargin : null,
        revenueGrowth: revenueGrowth !== null && Number.isFinite(revenueGrowth) ? revenueGrowth : null,
        _incomeMetricsVersion: 1,
    };
}
module.exports = { computeIncomeMetrics };
