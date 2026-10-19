/** Offline replay of the captured WTFC/FITB material; no API or environment files. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { buildDeepSnapshot, type DeepSnapshotInput } from '../src/lib/ai/deepSnapshot';
import { commandScores } from '../src/lib/commandScores';
import { deepMetricXml } from '../src/lib/ai/deepMaterialPrompt';
import { flowTokensFromDeepSnapshot, flowTokenRules } from '../src/lib/ai/flowTokens';
import { deepMaterialIssues } from '../src/lib/ai/deepTrust';

function input(ticker: string, unified: any = {}, rawTickerData: any = {}): DeepSnapshotInput {
    return { ticker, price: 100, priceChange: 0, session: 'CLOSED', unified, rawTickerData,
        insider: null, technicals: null, creditSpread: null };
}

for (const ticker of ['WTFC', 'FITB']) {
    test(`${ticker}: replay captured material shape, alpha absent, actual Command scores replace fabricated 50/C`, () => {
        const old = JSON.parse(fs.readFileSync(`tests/fixtures/ai-material/${ticker}.json`, 'utf8'));
        assert.deepEqual(old.contextScore, { value: 0, grade: 'C' });
        assert.deepEqual(old.conviction, { score: 50, grade: 'C' });
        // Original upstream responses were not captured. Reconstruct only the
        // source fields demonstrably present in the saved material; no alpha.
        const x = input(ticker, {
            structure: { ...old.structure, pcRatio: old.structure.pcRatio === 0 ? null : old.structure.pcRatio,
                levels: { callWall: old.structure.callWall, putFloor: old.structure.putFloor } },
            sma: { ...old.sma, phase: old.sma.trendPhase },
            volatility: { squeezeScore: old.structure.squeezeScore, squeezeRisk: old.structure.squeezeRisk },
            fundamentals: { score: old.fundamental.score, grade: old.fundamental.grade, pe: old.fundamental.pe },
            analyst: { bullishPct: old.analyst.buyPct }, squeeze: old.squeeze,
        }, { vwap: old.vwap, flow: old.flow });
        x.price = old.price;
        const s = buildDeepSnapshot(x);
        const screen = commandScores({ price: x.price, vwap: old.vwap, unified: x.unified, rawTickerData: x.rawTickerData });
        assert.deepEqual(s.contextScore, { value: null, grade: null });
        assert.deepEqual(s.smartFlow, { value: null, trend: null });
        assert.deepEqual(s.conviction, { score: screen.cScore, grade: screen.cGrade });
        assert.equal(s.conviction.score, ticker === 'WTFC' ? 70 : 60);
        assert.equal(s.structure.gammaConcentration, null);
        assert.equal(s.structure.gammaConcentrationLabel, null);
        assert.equal(s.structure.pcRatio, null, 'legacy PC zero has no observation evidence in the captured material');
        assert.equal(s.structure.gammaFlipLevel, ticker === 'WTFC' ? null : 55);
        assert.equal(s.fundamental.pe, Number(old.fundamental.pe));
        assert.equal(s.fundamental.fcfMargin, null, 'captured FCF zero was a hardcoded placeholder');
        assert.equal(s.flow.netPremium, old.flow.netPremium);
        assert.match(deepMetricXml(s), /context_score value="N\/A" grade="N\/A"/);
        assert.ok(deepMetricXml(s).includes(`conviction score="${screen.cScore}" grade="${screen.cGrade}"`));
        assert.equal('NET_PREM' in flowTokensFromDeepSnapshot(s), ticker === 'WTFC');
        assert.equal('PC' in flowTokensFromDeepSnapshot(s), false);
    });
}

test('entirely missing material has no neutral scores, structure zeros or numeric placeholders', () => {
    const s = buildDeepSnapshot(input('MISSING'));
    for (const group of [s.contextScore, s.conviction, s.smartFlow, s.structure, s.volatility, s.fundamental, s.analyst]) {
        for (const value of Object.values(group)) assert.equal(value, null);
    }
    assert.equal(s.signalCore, null);
    assert.deepEqual(flowTokensFromDeepSnapshot(s), { PRICE: 100 });
    assert.doesNotMatch(flowTokenRules(flowTokensFromDeepSnapshot(s)), /\{PC\}|\{NET_PREM\}|\{CALL_WALL\}/);
    assert.match(deepMetricXml(s), /squeeze_risk>N\/A \(N\/A%\)/);
    assert.equal(deepMaterialIssues(s).ok, false);
});

test('measured zero scores, premiums, GEX and PC survive snapshot, XML and tokens', () => {
    const s = buildDeepSnapshot(input('ZERO', {
        alpha: { score: 0, grade: 'F' }, smartFlow: 0,
        structure: { netGex: 0, pcRatio: 0, squeezeScore: 0, squeezeRisk: 'LOW' },
        fundamentals: { score: 0, grade: 'F', fcfMargin: 0 }, analyst: { totalAnalysts: 2, bullishPct: 0 },
    }, { flow: { netPremium: 0, contractsProcessed: 2 } }));
    assert.deepEqual(s.contextScore, { value: 0, grade: 'F' });
    assert.equal(s.structure.netGex, 0); assert.equal(s.structure.squeezeScore, 0);
    assert.equal(s.conviction.score, 50); assert.equal(s.fundamental.score, 0);
    assert.equal(s.analyst.score, 0);
    assert.equal(flowTokensFromDeepSnapshot(s).PC, 0);
    assert.equal(flowTokensFromDeepSnapshot(s).NET_PREM, 0);
    const xml = deepMetricXml(s);
    assert.match(xml, /context_score value="0" grade="F"/);
    assert.match(xml, /net_gex>0.0M/); assert.match(xml, /squeeze_risk>LOW \(0%\)/);
    assert.match(xml, /fundamentals score="0"/); assert.match(xml, /analyst_score>0\/100/);
});

test('dated last good wins only when current is missing; original date persists through repeated gaps', () => {
    const asOf = '2026-10-16T20:00:00.000Z';
    buildDeepSnapshot(input('HISTORY', { alpha: { score: 74, grade: 'B', asOf }, structure: { netGex: 12, levels: { callWall: 110 }, asOf } }));
    for (let i = 0; i < 2; i++) {
        const s = buildDeepSnapshot(input('HISTORY', { timestamp: Date.now(), alpha: { score: null, grade: 'C' } }));
        assert.deepEqual(s.contextScore, { value: 74, grade: 'B' });
        assert.equal(s.structure.callWall, 110);
        assert.deepEqual(s.sources['contextScore.value'], { asOf, historical: true });
        assert.deepEqual(s.sources['structure.callWall'], { asOf, historical: true });
        assert.match(deepMetricXml(s), /2026-10-16T20:00:00.000Z/);
        assert.match(deepMetricXml(s), /never current readings/);
    }
    const current = buildDeepSnapshot(input('HISTORY', { alpha: { score: 0, grade: 'F', asOf: '2026-10-19T14:00:00Z' } }));
    assert.equal(current.contextScore.value, 0);
    assert.equal(current.sources['contextScore.value'].historical, false);
});

test('undated values are usable now but never become dated last good; ticker histories are isolated', () => {
    buildDeepSnapshot(input('UNDATED', { timestamp: Date.now(), alpha: { score: 72, grade: 'B' } }));
    assert.equal(buildDeepSnapshot(input('UNDATED')).contextScore.value, null);
    assert.equal(buildDeepSnapshot(input('OTHER')).contextScore.value, null);
});

test('a current score cannot inherit a previous grade; an empty analyst aggregate is missing', () => {
    buildDeepSnapshot(input('GRADE', { alpha: { score: 74, grade: 'B', asOf: '2026-10-16' } }));
    const s = buildDeepSnapshot(input('GRADE', { alpha: { score: 0, asOf: '2026-10-19' }, analyst: { totalAnalysts: 0, bullishPct: 0 } }));
    assert.deepEqual(s.contextScore, { value: 0, grade: null });
    assert.equal(buildDeepSnapshot(input('GRADE')).contextScore.grade, null);
    assert.equal(s.analyst.score, null);
    buildDeepSnapshot(input('UNDATED_GRADE', { alpha: { score: 74, grade: 'B', asOf: '2026-10-16' } }));
    assert.equal(buildDeepSnapshot(input('UNDATED_GRADE', { alpha: { score: 0 } })).contextScore.grade, null);
    assert.deepEqual(buildDeepSnapshot(input('UNDATED_GRADE')).contextScore, { value: 74, grade: 'B' });
});

test('premium last good uses producer chainDate and keeps its original date through failure', () => {
    buildDeepSnapshot(input('PREMIUM_DATE', {}, { flow: { netPremium: 0, contractsProcessed: 2, dataFreshness: { chainDate: '2026-10-16' } } }));
    const s = buildDeepSnapshot(input('PREMIUM_DATE', {}, { flow: { dataSource: 'NONE', netPremium: 0 } }));
    assert.equal(s.flow.netPremium, 0);
    assert.deepEqual(s.sources['flow.netPremium'], { asOf: '2026-10-16T00:00:00.000Z', historical: true });
    assert.equal(flowTokensFromDeepSnapshot(s).NET_PREM, 0);
});

test('an upstream neutral smartFlow base without observations is missing', () => {
    assert.equal(buildDeepSnapshot(input('BASE_FLOW', { smartFlow: 50 })).smartFlow.value, null);
});

test('analyst breakdown remains usable and a measured zero concentration stays zero', () => {
    const s = buildDeepSnapshot(input('BREAKDOWN', {
        analyst: { totalAnalysts: 4, breakdown: { strongBuy: 1, buy: 2 } },
        structure: { totalCallOI: 4, totalPutOI: 6, gammaConcentration: 0, gammaConcentrationLabel: 'LOOSE' },
    }));
    assert.equal(s.analyst.score, 75);
    assert.equal(s.structure.gammaConcentration, 0);
    assert.equal(s.structure.gammaConcentrationLabel, 'LOOSE');
    assert.match(deepMetricXml(s), /gamma_concentration>0% \(LOOSE\)/);
});

test('failed structures and non-finite inputs cannot create observations', () => {
    for (const value of [null, undefined, '', '0', false, NaN, Infinity, -Infinity]) {
        const s = buildDeepSnapshot(input('INVALID', { alpha: { score: value }, smartFlow: value,
            structure: { netGex: value, pcRatio: value, levels: { callWall: value } } }));
        assert.equal(s.contextScore.value, null); assert.equal(s.smartFlow.value, null);
        assert.equal(s.structure.netGex, null); assert.equal(s.structure.pcRatio, null);
        assert.equal(s.structure.callWall, null);
    }
    const s = buildDeepSnapshot(input('FAILED', { structure: { options_status: 'NONE', netGex: 0, pcRatio: 0 } }));
    assert.equal(s.structure.netGex, null); assert.equal(s.conviction.score, null);
});
