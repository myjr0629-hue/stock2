// Generated from src/lib/sourceFreshness.ts + src/lib/ai/sectorRotation.ts (transpiled, standalone for Lambda); keep parity (tests/sectorDataIntegrity.test.ts).
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROTATION_MEMORY_KEY = exports.rotationBarWidth = exports.formatRotationPct = exports.isSourceDate = void 0;
exports.compareSourceDate = compareSourceDate;
exports.pickFreshest = pickFreshest;
exports.sectorMeanChange = sectorMeanChange;
exports.rotationPct = rotationPct;
exports.rotationHistory = rotationHistory;
exports.normalizeSectorRotation = normalizeSectorRotation;
exports.compactRotationHistory = compactRotationHistory;
exports.rememberRotation = rememberRotation;
/**
 * The one ordering for «which measured value is newer» (home sector tiles, rotation rows, snapshot repair).
 * A value carries the date of the session it measured (YYYY-MM-DD). Dated beats undated, a later date beats
 * an earlier one, and a tie keeps the earlier candidate — callers list the current response first.
 * Nothing newer may ever be replaced by something older.
 */
const isSourceDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
exports.isSourceDate = isSourceDate;
/** > 0 when `a` is newer than `b`, < 0 when older, 0 when equally new (including both undated). */
function compareSourceDate(a, b) {
    const da = (0, exports.isSourceDate)(a) ? a : '';
    const db = (0, exports.isSourceDate)(b) ? b : '';
    return da === db ? 0 : da > db ? 1 : -1;
}
/** Newest candidate by source date; ties keep list order (first wins). */
function pickFreshest(candidates, dateOf) {
    let best;
    for (const c of candidates)
        if (best === undefined || compareSourceDate(dateOf(c), dateOf(best)) > 0)
            best = c;
    return best;
}
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const key = (s) => s.split('(')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
function sectorMeanChange(tickers) {
    const values = tickers.map(t => t.change_pct).filter(finite);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
function rotationPct(row) {
    if (finite(row.changePct))
        return row.changePct;
    // Legacy change strings may be alpha even when they look like plain percentages.
    // Only the explicit numeric contract (or snapshot repair) is a sector return.
    return null;
}
const formatRotationPct = (pct) => finite(pct) ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—';
exports.formatRotationPct = formatRotationPct;
const rotationBarWidth = (pct) => finite(pct) ? Math.min(100, Math.abs(pct) * 11) : 0;
exports.rotationBarWidth = rotationBarWidth;
/** Every previously shown rotation (state, storage, …) as one history; normalize picks the newest per sector. */
function rotationHistory(...briefs) {
    const rows = briefs.flatMap(b => { var _a, _b; return [...(((_a = b === null || b === void 0 ? void 0 : b.sectorRotation) === null || _a === void 0 ? void 0 : _a.winners) || []), ...(((_b = b === null || b === void 0 ? void 0 : b.sectorRotation) === null || _b === void 0 ? void 0 : _b.losers) || [])]; });
    return { sectorRotation: { winners: rows, losers: [] } };
}
/**
 * Ground=true: producer must use snapshot measurements even when the model invents a numeric field.
 * Every candidate (snapshot measurements, the incoming row, the previously shown row) competes by source
 * date through the single ordering in lib/sourceFreshness — a newer value is never replaced by an older one.
 * Value, date, alpha and reason are taken from the adopted candidate as one bundle.
 */
function normalizeSectorRotation(structured, measurements = [], previous, ground = false) {
    var _a, _b;
    if (!structured.sectorRotation)
        return structured;
    const sr = structured.sectorRotation;
    const old = [...(((_a = previous === null || previous === void 0 ? void 0 : previous.sectorRotation) === null || _a === void 0 ? void 0 : _a.winners) || []), ...(((_b = previous === null || previous === void 0 ? void 0 : previous.sectorRotation) === null || _b === void 0 ? void 0 : _b.losers) || [])];
    const normalize = (row) => {
        var _a;
        const same = (s) => typeof s === 'string' && key(s) === key(row.sector);
        // A row's own numeric value, date and reason were written together; a snapshot only fills a row that has
        // no value (legacy/missing), so a snapshot can never pair its number with another value's reason.
        const measured = ground || rotationPct(row) == null
            ? measurements.filter(m => (same(m.sector) || same(m.sectorId)) && finite(m.changePct)) : [];
        const candidates = [
            // Ground (producer): the model wrote the row's reason from these same measurements, so it stays.
            // Repair of a legacy row: its reason was written for an alpha string, not this return — never pair them.
            ...measured.map(m => {
                var _a;
                return ({ pct: m.changePct, date: m.changeDate, alpha: (_a = m.avgAlpha) !== null && _a !== void 0 ? _a : null,
                    reason: ground ? undefined : { ko: '', en: '', ja: '' } });
            }),
            ...(!ground && rotationPct(row) != null ? [{ pct: row.changePct, date: row.changeDate, alpha: (_a = row.avgAlpha) !== null && _a !== void 0 ? _a : null }] : []),
            ...old.filter(r => same(r.sector) && rotationPct(r) != null)
                .map(r => { var _a; return ({ pct: r.changePct, date: r.changeDate, alpha: (_a = r.avgAlpha) !== null && _a !== void 0 ? _a : null, reason: r.reason }); }),
        ];
        const adopted = pickFreshest(candidates, c => c.date);
        if (!adopted)
            return Object.assign(Object.assign({}, row), { changePct: null, change: (0, exports.formatRotationPct)(null), changeDate: undefined, avgAlpha: null });
        return Object.assign(Object.assign({}, row), { changePct: adopted.pct, change: (0, exports.formatRotationPct)(adopted.pct), changeDate: (0, exports.isSourceDate)(adopted.date) ? adopted.date : undefined, avgAlpha: finite(adopted.alpha) ? adopted.alpha : null, reason: adopted.reason || row.reason });
    };
    return Object.assign(Object.assign({}, structured), { sectorRotation: Object.assign(Object.assign({}, sr), { winners: (sr.winners || []).map(normalize), losers: (sr.losers || []).map(normalize) }) });
}
/** Per-sector newest rows from every source (first wins a tie). This — not the displayed list — is what is remembered. */
function compactRotationHistory(...briefs) {
    const bySector = new Map();
    for (const r of rotationHistory(...briefs).sectorRotation.winners) {
        if (!r || typeof r.sector !== 'string' || rotationPct(r) == null)
            continue;
        const cur = bySector.get(key(r.sector));
        if (!cur || compareSourceDate(r.changeDate, cur.changeDate) > 0)
            bySector.set(key(r.sector), r);
    }
    return { sectorRotation: { winners: [...bySector.values()].slice(0, 64), losers: [] } };
}
exports.ROTATION_MEMORY_KEY = 'signum:rotation:v2';
const browserStore = () => { var _a; try {
    return (_a = globalThis.localStorage) !== null && _a !== void 0 ? _a : null;
}
catch (_b) {
    return null;
} };
/**
 * Client exit (app Intel + web brief): normalize an incoming brief against every remembered row — in-memory,
 * storage and what is on screen — then remember the per-sector newest rows. A response that omits a sector
 * therefore cannot erase that sector's newer value before an older response arrives.
 */
function rememberRotation(incoming, memory, shown, store = browserStore()) {
    let saved = null;
    try {
        saved = JSON.parse((store === null || store === void 0 ? void 0 : store.getItem(exports.ROTATION_MEMORY_KEY)) || 'null');
    }
    catch ( /* storage unavailable */_a) { /* storage unavailable */ }
    const history = rotationHistory(memory.current, shown, saved);
    const next = normalizeSectorRotation(incoming, [], history);
    memory.current = compactRotationHistory(next, history);
    try {
        store === null || store === void 0 ? void 0 : store.setItem(exports.ROTATION_MEMORY_KEY, JSON.stringify(memory.current));
    }
    catch ( /* storage unavailable */_b) { /* storage unavailable */ }
    return next;
}
