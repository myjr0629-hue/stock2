/** Historic harvest rows retain their basis; current-session structure wins as a complete edition. */
import { etCloseMs, etDateOfMs } from '../gexBackfillMerge';
import { structureFields } from './optionStructure';
import { shownRegularSessionDate, sessionCloseMinutes } from '../marketCalendar';
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
        ivSkew: f.ivSkew, atmIv: f.atmIv, gexBasis: 'structure_v2',
        chainDate: s.chainDate, sessionDate, source: 'structure' as const, structureAsOf: captured };
}
/** A weekend collection time is not another trading session for an EOD edition. */
export function normalizeStructureHistoryRow(row: any) {
    if (row?.gexBasis !== 'structure_v2' || !row.sessionDate
        || etDateOfMs(Number(row.timestamp)) === row.sessionDate) return row;
    return { ...row, recordedAt: row.timestamp,
        timestamp: etCloseMs(row.sessionDate) + (sessionCloseMinutes(row.sessionDate) - 960) * 60_000 };
}
export function reconcileGexHistory(rows: any[], current: any) {
    const all = [...rows, ...(current ? [current] : [])].map(normalizeStructureHistoryRow);
    const day = (r: any) => r.sessionDate || r.chainDate || etDateOfMs(Number(r.timestamp));
    const canonicalDays = new Set(all.filter(r => r.gexBasis === 'structure_v2').map(day));
    const currentDay = current?.sessionDate ?? current?.chainDate;
    const data: any[] = [], legacy: any[] = [];
    for (const row of all) {
        const r = { ...row, gexBasis: row.gexBasis ?? 'legacy_whole_chain' };
        if (r.gexBasis !== 'structure_v2' && (canonicalDays.has(day(r)) || (currentDay && day(r) > currentDay))) legacy.push(r);
        else data.push(r);
    }
    const unique = [...new Map(data.map(r => [r.timestamp, r])).values()];
    unique.sort((a, b) => a.timestamp - b.timestamp);
    return { data: unique, supersededLegacy: legacy };
}
