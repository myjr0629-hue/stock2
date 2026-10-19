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
    // Full-match only. In particular, '+52.2% avgAlpha' and 'Laggard SMR -5.20%' fail.
    if (row.changePct === undefined && typeof row.change === 'string' && /^[+-]?\d+(?:\.\d+)?%$/.test(row.change.trim())) {
        const n = Number(row.change.trim().slice(0, -1));
        return finite(n) ? n : null;
    }
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
        var _a, _b, _c;
        const measured = measurements.find(m => key(m.sector) === key(row.sector) || (m.sectorId && key(m.sectorId) === key(row.sector)));
        const prior = old.find(r => key(r.sector) === key(row.sector) && rotationPct(r) != null);
        const pct = measured && finite(measured.changePct) ? measured.changePct : ground ? null : rotationPct(row);
        const value = pct !== null && pct !== void 0 ? pct : (prior ? rotationPct(prior) : null);
        return Object.assign(Object.assign({}, row), { changePct: value, change: (0, exports.formatRotationPct)(value), changeDate: pct != null ? (_a = measured === null || measured === void 0 ? void 0 : measured.changeDate) !== null && _a !== void 0 ? _a : row.changeDate : prior === null || prior === void 0 ? void 0 : prior.changeDate, avgAlpha: (_c = (_b = measured === null || measured === void 0 ? void 0 : measured.avgAlpha) !== null && _b !== void 0 ? _b : row.avgAlpha) !== null && _c !== void 0 ? _c : null });
    };
    return Object.assign(Object.assign({}, structured), { sectorRotation: Object.assign(Object.assign({}, sr), { winners: (sr.winners || []).map(normalize), losers: (sr.losers || []).map(normalize) }) });
}
