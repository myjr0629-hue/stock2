/** Read boundary only: preserve stored rows and keep different formulas in separate series. */
import { etCloseMs, etDateOfMs } from '../gexBackfillMerge';
import { structureFields } from './optionStructure';
import { shownRegularSessionDate, sessionCloseMinutes } from '../marketCalendar';
import { finite } from './market';
export const GEX_FORMULA_VERSION = 'structure_v2';
export function gexFormulaVersion(row: any): string {
    // Older structure editions already carried an unambiguous basis. An explicit version wins.
    return row?.gexFormulaVersion ?? row?.gexBasis ?? 'legacy_whole_chain';
}
export function isCanonicalGexRow(row: any): boolean {
    return gexFormulaVersion(row) === GEX_FORMULA_VERSION;
}
export function structureHistoryPoint(ticker: string, version: any, now = Date.now()) {
    const s = version?.data, f = structureFields(s);
    if (f.gex === null || !/^\d{4}-\d{2}-\d{2}$/.test(s?.chainDate ?? '')) return null;
    const captured = typeof version.timestamp === 'number' && Number.isFinite(version.timestamp) ? version.timestamp : now;
    const live = s.structureGreeksBasis === 'live' || s.impliedMove?.basis === 'live';
    const sessionDate = s.structureSessionDate ?? (live ? shownRegularSessionDate(captured) : s.chainDate);
    const close = etCloseMs(sessionDate) + (sessionCloseMinutes(sessionDate) - 960) * 60_000;
    return { ticker, timestamp: Math.min(captured, close, now),
        gex: f.gex, gammaRegime: f.gex > 0 ? 'POSITIVE' : f.gex < 0 ? 'NEGATIVE' : 'NEUTRAL',
        flipLevel: s.gammaFlipLevel ?? null, callWall: s.levels?.callWall ?? null,
        putFloor: s.levels?.putFloor ?? null, maxPain: s.maxPain ?? null,
        price: s.underlyingPrice ?? null, squeezeScore: f.squeezeScore,
        ivSkew: f.ivSkew, atmIv: f.atmIv, gexBasis: GEX_FORMULA_VERSION, gexFormulaVersion: GEX_FORMULA_VERSION,
        chainDate: s.chainDate, sessionDate, source: 'structure' as const, structureAsOf: captured };
}
/** A weekend collection time is not another trading session for an EOD edition. */
export function normalizeStructureHistoryRow(row: any) {
    if (!isCanonicalGexRow(row) || !row.sessionDate
        || typeof row.timestamp !== 'number' || !Number.isFinite(row.timestamp)
        || etDateOfMs(Number(row.timestamp)) === row.sessionDate) return row;
    return { ...row, recordedAt: row.timestamp,
        timestamp: etCloseMs(row.sessionDate) + (sessionCloseMinutes(row.sessionDate) - 960) * 60_000 };
}
export function reconcileGexHistory(rows: any[], current: any) {
    const all = [...rows, ...(current ? [current] : [])].map(normalizeStructureHistoryRow);
    const data: any[] = [], legacy: any[] = [];
    for (const row of all) {
        const r = { ...row, gexBasis: row.gexBasis ?? 'legacy_whole_chain', gexFormulaVersion: gexFormulaVersion(row) };
        if (!isCanonicalGexRow(r)) legacy.push(r);
        else data.push(r);
    }
    const byTimestamp = new Map<number, any>();
    for (const row of data) {
        if (finite(row.gex) || !finite(byTimestamp.get(row.timestamp)?.gex)) byTimestamp.set(row.timestamp, row);
    }
    const unique = [...byTimestamp.values()];
    unique.sort((a, b) => a.timestamp - b.timestamp);
    return { data: unique, supersededLegacy: legacy };
}

/** Bound responses without deleting a missing interval or the last actual observation. */
export function sampleGexHistory(rows: any[], max = 600): any[] {
    if (rows.length <= max) return rows;
    const budget = Math.floor(max / 2) - 2;
    const indices = new Set([0, rows.length - 1]);
    for (let i = rows.length - 1; i >= 0; i--) {
        if (typeof rows[i].gex === 'number' && Number.isFinite(rows[i].gex)) { indices.add(i); break; }
    }
    for (let i = 1; i < budget; i++) indices.add(Math.floor(i * (rows.length - 1) / budget));
    const selected = [...indices].sort((a, b) => a - b);
    const out: any[] = [];
    let prev = -1;
    for (const index of selected) {
        const missing = rows.slice(prev + 1, index).find(r => typeof r.gex !== 'number' || !Number.isFinite(r.gex));
        if (missing) out.push(missing);
        out.push(rows[index]);
        prev = index;
    }
    return out;
}
