/** 대표 결정(10/19 10:4x) ② 고래 총량에서 내부자 분리 · ③ 리스크 점수 = 라벨 의미(높을수록 위험) — 오프라인 재현. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { marketDownsideRisk, fearGreedScore } from '../src/lib/marketIndicators';

const read = (p: string) => fs.readFileSync(p, 'utf8');
function initializer(file: string, name: string): string {
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const visit = (n: ts.Node) => { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name && n.initializer) found.push(n.initializer.getText(ast)); ts.forEachChild(n, visit); };
    visit(ast); assert.equal(found.length, 1, `${file}:${name}`); return found[0];
}
const run = (code: string, ctx: Record<string, unknown>) => vm.runInNewContext(ts.transpile(code, { target: ts.ScriptTarget.ES2022 }), ctx);

test('③ risk = 100 − RLSI (higher = riskier); failed/absent RLSI is missing, never a fake 50', () => {
    assert.equal(marketDownsideRisk({ score: 32 }), 68);
    assert.equal(marketDownsideRisk({ score: 70, available: true }), 30);
    assert.equal(marketDownsideRisk({ score: 0 }), 100); assert.equal(marketDownsideRisk({ score: 100 }), 0);
    for (const bad of [null, undefined, {}, { score: NaN }, { score: -1 }, { score: 101 }, { score: '50' }, { available: false, score: 50 }]) assert.equal(marketDownsideRisk(bad), null);
});
test('③ dash «리스크» cell, tone and verdict use the shared risk with risk-off at ≥58', () => {
    const dash = 'src/app/[locale]/app-view/dash/page.tsx';
    const risk = initializer(dash, 'riskScore'), tone = initializer(dash, 'riskTone'), verdict = initializer(dash, 'verdictKey');
    assert.equal(run(risk, { marketDownsideRisk, rlsi: { score: 32 } }), 68);
    assert.equal(run(risk, { marketDownsideRisk, rlsi: null }), null);
    const copy = { riskOn: 'on', riskOff: 'off', mixed: 'mixed' };
    for (const [riskScore, t, v] of [[68, 'off', 'off'], [58, 'off', 'off'], [50, 'mixed', 'mix'], [42, 'on', 'on'], [null, 'mixed', 'mix']] as const) {
        assert.equal(run(tone, { riskScore, copy }), t); assert.equal(run(verdict, { riskScore }), v);
    }
    assert.match(read(dash), /\{riskScore \?\? '—'\}<s> \/100<\/s>/);
    assert.doesNotMatch(read(dash), /calculateMarketRiskScore/);
});
test('F&G: one value for the same label — CNN first, else the Guardian/RLSI VIX 12~35 approximation; nothing → missing', () => {
    assert.equal(fearGreedScore(31.4, 40), 31.4); assert.equal(fearGreedScore(0, 20), 0, 'a real CNN 0 is an observation');
    assert.equal(fearGreedScore(null, 12), 100); assert.equal(fearGreedScore(null, 35), 0); assert.equal(fearGreedScore(undefined, 17), 78);
    assert.equal(fearGreedScore(null, null), null); assert.equal(fearGreedScore(-1, 0), null);
    // RLSI sentiment (Guardian F&G tile) uses the same approximation.
    const rlsi = read('src/services/guardian/rlsiEngine.ts');
    assert.match(rlsi, /return Math\.round\(100 - \(\(vix - 12\) \/ 23\) \* 100\)/);
    const dash = read('src/app/[locale]/app-view/dash/page.tsx');
    assert.match(dash, /const fg = fearGreedScore\(macroSnap\?\.fearGreed\?\.score, f\.vix\?\.level\);\s*if \(fg != null\)/);
});
test('RLSI failure default is flagged unavailable (score 50 is not an observation)', () => {
    const src = read('src/services/guardian/rlsiEngine.ts');
    assert.match(src, /const result: RLSIResult = \{\s*available: true,/);
    assert.match(src, /CRITICAL ERROR[\s\S]{0,80}return \{\s*available: false,\s*score: 50,/);
});
test('② whale total = whale options only (insider filings are separate); composition bar = options 100%', () => {
    const flow = 'src/app/[locale]/app-view/flow/page.tsx';
    assert.equal(run(initializer(flow, 'institutionalTotal'), { whaleDayTotal: 389.7e6, dpDayValue: 4e6 }), 389.7e6);
    assert.equal(run(initializer(flow, 'institutionalTotal'), { whaleDayTotal: 0, dpDayValue: 2.2e6 }), 0);
    const mix = initializer(flow, 'optionMixPct');
    assert.equal(run(mix, { whaleTotalVol: 389.7e6, whaleDayTotal: 389.7e6 }), 100);
    assert.equal(run(mix, { whaleTotalVol: 0, whaleDayTotal: 0 }), 50, 'empty bar unchanged');
});
