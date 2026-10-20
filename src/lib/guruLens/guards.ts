import { Company, LENS_IDS, Snapshot } from './types';
import { num } from './rules';

export interface Hold {
    code: string;
    ticker?: string;
    detail: string;
}
/** Thresholds are publication safeguards, not investment rules. */
export function publicationHolds(
    companies: Company[],
    next: Snapshot,
    previous: Snapshot | null,
    expectedCount = 495,
): Hold[] {
    const holds: Hold[] = [];
    const add = (code: string, detail: string, ticker?: string) =>
        holds.push({ code, detail, ...(ticker ? { ticker } : {}) });
    if (companies.length !== expectedCount || new Set(companies.map((r) => r.ticker)).size !== expectedCount)
        add('universe', '유니버스 누락·중복');
    const priced = companies.filter((r) => r.price > 0 && r.priceDate),
        identified = companies.filter((r) => r.cik > 0);
    // Preserve the existing 95% detection threshold; quarantine affected tickers
    // instead of turning this source-coverage safeguard into a universe-wide hold.
    const coverageFailed = priced.length < expectedCount * 0.95 || identified.length < expectedCount * 0.95;
    for (const r of companies) {
        if (coverageFailed && (!(r.price > 0) || !r.priceDate || !(r.cik > 0)))
            add('coverage', '가격·CIK 결측', r.ticker);
        const before = previous?.companies[r.ticker];
        if (before && (before.cik !== r.cik || before.reportedCik !== r.reportedCik))
            add('cik_change', `${before.cik}/${before.reportedCik} → ${r.cik}/${r.reportedCik}`, r.ticker);
        if (r.shares !== null && (!num(r.shares) || r.shares <= 0))
            add('unit', '유효하지 않은 주식수', r.ticker);
        if (r.currency && r.currency !== 'USD') add('unit', `통화 ${r.currency}`, r.ticker);
        for (const issue of r.issues)
            if (!['price_missing', 'shares_missing', 'cik_missing'].includes(issue))
                add('source_integrity', issue, r.ticker);
        if (r.price > 0 && (!num(r.price) || r.priceDate > next.generatedAt.slice(0, 10)))
            add('price', '유효하지 않은 가격 기준', r.ticker);
        if (r.priceDate && Date.parse(next.generatedAt) - Date.parse(r.priceDate) > 7 * 86400_000)
            add('stale_price', r.priceDate, r.ticker);
        if (r.sharesDate && r.priceDate && r.sharesDate > r.priceDate)
            add('shares_date', '가격보다 뒤인 주식수', r.ticker);
        const mult = r.splits
            .filter((s) => r.sharesDate && s.date > r.sharesDate && s.date <= r.priceDate)
            .reduce((p, s) => p * s.ratio, 1);
        if (!num(mult) || mult <= 0 || Math.abs(mult - r.splitMultiplier) > 1e-6)
            add('split', '분할 계수 불일치', r.ticker);
        if (
            r.splits.some(
                (s) =>
                    s.date >= `${r.year}-07-01` &&
                    s.date <= r.priceDate &&
                    Math.abs(s.ratio - Math.round(s.ratio)) > 0.001 &&
                    ![2, 3, 4, 5, 10, 15, 20, 25, 0.5, 0.2, 1 / 3].some(
                        (valid) => Math.abs(s.ratio - valid) < 0.001,
                    ),
            )
        )
            add('spinoff', '비정수 기업행위 검토 필요', r.ticker);
        for (let y = r.year - 3; y <= r.year; y++) {
            const ni = r.ni[y],
                eps = r.eps[y],
                sh = r.wsh[y];
            if ([ni, eps, sh].some((v) => v !== null && v !== undefined && !num(v)))
                add('unit', `비유한 재무값 ${y}`, r.ticker);
            if (num(sh) && sh > 0 && sh < 1e5) add('unit', `주식수 자릿수 ${y}`, r.ticker);
            if (num(ni) && num(eps) && num(sh) && eps * sh !== 0) {
                const k = Math.abs(ni / (eps * sh));
                if (k > 50 || k < 0.02 || ni * eps < 0)
                    add('net_income_digits', `${y} NI/(EPS×주식수)=${k}`, r.ticker);
            }
        }
        // Compare two PERs on the same (current split) basis. Allow buybacks/class differences up to 5x.
        const eps = r.eps[r.year],
            wsh = r.wsh[r.year],
            ni = r.ni[r.year];
        const sinceYear = r.splits
            .filter((s) => s.date > `${r.year}-12-31` && s.date <= r.priceDate)
            .reduce((p, s) => p * s.ratio, 1);
        if (
            num(eps) &&
            eps > 0 &&
            num(ni) &&
            ni > 0 &&
            num(r.shares) &&
            r.shares > 0 &&
            num(wsh) &&
            wsh > 0
        ) {
            const perCap = (r.price * r.shares) / ni,
                perEps = r.price / (eps / sinceYear),
                k = perCap / perEps;
            if (k > 5 || k < 0.2)
                add('per_mismatch', `PER 시총/이익=${perCap}; 가격/분할조정EPS=${perEps}`, r.ticker);
        }
    }
    for (const id of LENS_IDS) {
        const current = next.lenses[id],
            old = previous?.lenses[id];
        if (
            !current ||
            current.rows.length !== (next.includedCount ?? expectedCount) ||
            current.passCount !== current.rows.filter((r) => r.passed).length
        )
            add('result_shape', id);
        if (current?.rows.some((r) => r.score !== null && !num(r.score))) add('score', id);
        // Absolute floor avoids treating a normal 0→1 move as a collapse. 0→10 is held.
        if (old && current && Math.abs(current.passCount - old.passCount) >= Math.max(10, old.passCount * 0.5))
            add('pass_count', `${id}: ${old.passCount} → ${current.passCount}`);
    }
    return holds;
}
