import { isCanonicalGexRow, normalizeStructureHistoryRow, GEX_FORMULA_VERSION } from './gexHistory';
import { finite } from './market';

export interface GexTimelineRow {
    timestamp: number;
    gex: number | null;
    gammaRegime: string | null;
    [key: string]: any;
}
export type ActualGexPoint = GexTimelineRow & { gex: number; gammaRegime: string };
export const hasGexValue = (row: GexTimelineRow): row is ActualGexPoint => finite(row.gex);

/** Missing samples retain their position. Only actual samples enter statistics and latest-value displays. */
export function gexTimelineRows(raw: unknown): GexTimelineRow[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(r => r && isCanonicalGexRow(r) && finite(r.timestamp) && Number.isFinite(new Date(r.timestamp).getTime()))
        .map(r => ({ ...normalizeStructureHistoryRow(r), gexFormulaVersion: GEX_FORMULA_VERSION,
            gex: finite(r.gex) ? r.gex : null,
            gammaRegime: finite(r.gex) ? (r.gex > 0 ? 'POSITIVE' : r.gex < 0 ? 'NEGATIVE' : 'NEUTRAL') : null }))
        .sort((a, b) => a.timestamp - b.timestamp);
}

/** A missing sample starts a new SVG subpath; it must never become zero or bridge a gap. */
export function gexPlot(rows: GexTimelineRow[], width: number, height: number, min: number, max: number, padding = 0) {
    const span = max - min || 1;
    const x = (i: number) => padding + (rows.length > 1 ? i / (rows.length - 1) : .5) * (width - 2 * padding);
    const y = (v: number) => padding + (1 - (v - min) / span) * (height - 2 * padding);
    const zeroY = y(0);
    const segments: { x: number; y: number; timestamp: number }[][] = [];
    let segment: { x: number; y: number; timestamp: number }[] = [];
    rows.forEach((r, i) => {
        if (hasGexValue(r)) segment.push({ x: x(i), y: y(r.gex), timestamp: r.timestamp });
        else if (segment.length) { segments.push(segment); segment = []; }
    });
    if (segment.length) segments.push(segment);
    const path = (s: typeof segment) => s.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return { zeroY,
        linePath: segments.map(path).join(' '),
        fillPath: segments.map(s => `${path(s)} L ${s.at(-1)!.x.toFixed(1)} ${zeroY.toFixed(1)} L ${s[0].x.toFixed(1)} ${zeroY.toFixed(1)} Z`).join(' '),
        last: segments.at(-1)?.at(-1) ?? null };
}

export function formatGex(v: unknown): string {
    if (!finite(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toFixed(0);
}
