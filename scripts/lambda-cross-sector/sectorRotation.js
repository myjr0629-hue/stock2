// Generated from src/lib/ai/sectorRotation.ts; keep parity (tests/sectorDataIntegrity.test.ts).
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rotationBarWidth = exports.formatRotationPct = void 0;
exports.sectorMeanChange = sectorMeanChange;
exports.rotationPct = rotationPct;
exports.normalizeSectorRotation = normalizeSectorRotation;
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
/** Ground=true: producer must use snapshot measurements even when the model invents a numeric field. */
function normalizeSectorRotation(structured, measurements = [], previous, ground = false) {
    var _a, _b;
    if (!structured.sectorRotation)
        return structured;
    const sr = structured.sectorRotation;
    const old = [...(((_a = previous === null || previous === void 0 ? void 0 : previous.sectorRotation) === null || _a === void 0 ? void 0 : _a.winners) || []), ...(((_b = previous === null || previous === void 0 ? void 0 : previous.sectorRotation) === null || _b === void 0 ? void 0 : _b.losers) || [])];
    const normalize = (row) => {
        var _a, _b;
        const measured = measurements.find(m => key(m.sector) === key(row.sector) || (m.sectorId && key(m.sectorId) === key(row.sector)));
        const prior = old.find(r => key(r.sector) === key(row.sector) && rotationPct(r) != null);
        const adopted = measured && finite(measured.changePct) ? measured
            : !ground && rotationPct(row) != null ? row : prior;
        const value = adopted ? rotationPct(adopted) : null;
        return Object.assign(Object.assign({}, row), { changePct: value, change: (0, exports.formatRotationPct)(value), changeDate: value != null ? adopted === null || adopted === void 0 ? void 0 : adopted.changeDate : undefined, avgAlpha: (_b = (_a = measured === null || measured === void 0 ? void 0 : measured.avgAlpha) !== null && _a !== void 0 ? _a : row.avgAlpha) !== null && _b !== void 0 ? _b : null });
    };
    return Object.assign(Object.assign({}, structured), { sectorRotation: Object.assign(Object.assign({}, sr), { winners: (sr.winners || []).map(normalize), losers: (sr.losers || []).map(normalize) }) });
}
