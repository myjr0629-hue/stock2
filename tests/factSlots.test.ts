import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACT_SCHEMA_VERSION, FACT_RENDERER_VERSION, type FactScope, type FactSource, type FactPlan, type TrustedExplanation } from '../src/lib/ai/factContract';
import { factBundle, indexFact, ucPositionFact, calendarFact, ucRatioFact, validFactDate, validFactSource } from '../src/lib/ai/factAdapters';
import { parseFactJSON, validateFactPlan } from '../src/lib/ai/factPlan';
import { renderFactPlan } from '../src/lib/ai/factRender';
import { readFactSnapshot, renderFactSnapshot } from '../src/lib/ai/factCache';

let count = 0;
const test = (name: string, fn: () => void) => { fn(); count++; console.log(`PASS ${name}`); };
const scope: FactScope = { itemId: 'article-A', targetId: 'NVDA', snapshotId: 'snapshot-A' };
const source: FactSource = { id: 'options-eod', version: '2026-10-16', kind: 'structured', observedAt: '2026-10-16T05:00:00Z', basisDate: '2026-10-15', timeZone: 'America/New_York' };
const meta = (factId: string, patch: Partial<FactSource> = {}) => ({ factId, scope, source: { ...source, ...patch } });
const position = ucPositionFact(meta('position'), 'NVDA', { optionsDate: '2026-10-15', newOiContracts: 100, newOiNotional: 5.3e9, newOiSide: 'call' })!;
const earnings = calendarFact(meta('earnings', { basisDate: '2026-10-16' }), { ticker: 'NVDA', eventId: 'earnings-A', event: 'earnings', eventDate: '2026-10-16' })!;
const expiry = calendarFact(meta('expiry', { basisDate: '2026-10-19' }), { ticker: 'NVDA', eventId: 'expiry-A', event: 'expiry', eventDate: '2026-10-19' })!;
const spx = indexFact(meta('spx'), { instrument: 'spx_spot', timing: 'close', level: 7659.44, changePct: -1.09 })!;
const futures = indexFact(meta('futures'), { instrument: 'spx_futures', timing: 'intraday', level: 7704.25, changePct: -1.11 })!;
const vix = indexFact(meta('vix'), { instrument: 'vix_spot', timing: 'close', level: 20, changePct: 5 })!;
const reviewed = indexFact(meta('reviewed', { kind: 'reviewed_article', id: 'article-A:reviewed:v1' }), { instrument: 'spx_spot', timing: 'article', level: 7600.25, changePct: -1.25 })!;
const composite = indexFact(meta('composite', { kind: 'reviewed_article' }), { instrument: 'composite_spot', timing: 'article', level: 24000, changePct: -1.25 })!;
const ndx = indexFact(meta('ndx'), { instrument: 'ndx_spot', timing: 'close', level: 26000, changePct: -2.31 })!;
const nq = indexFact(meta('nq', { kind: 'reviewed_article' }), { instrument: 'ndx_futures', timing: 'article', level: 26100, changePct: -1.25 })!;
const vol = ucRatioFact(meta('vol'), 'NVDA', 'volume_call_over_put', { volumePcr: 5.75, oiPcr: 1.86 })!;
const oi = ucRatioFact(meta('oi'), 'NVDA', 'oi_put_over_call', { volumePcr: 5.75, oiPcr: 1.86 })!;
const bundle = factBundle(scope, [position, earnings, expiry, spx, futures, vix, reviewed, composite, ndx, nq, vol, oi]);
const plan = (...blocks: FactPlan['blocks']): FactPlan => ({ schemaVersion: 1, itemId: scope.itemId, blocks });
const indexPlan = plan({ templateId: 'index_observation', factId: 'spx' }, { templateId: 'index_observation', factId: 'vix' });
const sessionPlan = plan({ templateId: 'position_session', factId: 'position' }, { templateId: 'calendar_event', factId: 'earnings' }, { templateId: 'calendar_event', factId: 'expiry' });
const explanation: TrustedExplanation = { explanationId: 'context', scope, requires: [], text: { ko: '서로 다른 일정은 각각의 기준일을 가진다.', en: 'Each event has its own reference date.', ja: '各イベントにはそれぞれ基準日があります。' } };
const locales = ['ko', 'en', 'ja'] as const;
const snapshot = { schemaVersion: FACT_SCHEMA_VERSION, rendererVersion: FACT_RENDERER_VERSION, bundle, plan: sessionPlan, explanations: [] };

test('source adapters retain actual position session, contracts, notional and side', () => {
    assert.ok(position); assert.equal(position.sessionDate, '2026-10-15'); assert.equal(position.notional, 5300000000);
    for (const optionsDate of [null, '2026-10-16', '2026-02-30']) assert.equal(ucPositionFact(meta('bad'), 'NVDA', { optionsDate, newOiContracts: 1, newOiNotional: 1, newOiSide: 'call' }), null);
    assert.equal(ucPositionFact(meta('bad'), 'AAPL', { optionsDate: source.basisDate, newOiContracts: 1, newOiNotional: 1, newOiSide: 'put' }), null);
});
test('unreviewed prose cannot become an article observation; spot/futures remain explicit', () => {
    assert.equal(indexFact(meta('bad'), { instrument: 'spx_spot', timing: 'article', level: 7600.25, changePct: -1.25 }), null);
    assert.ok(reviewed); assert.equal(futures.instrument, 'spx_futures');
    for (const changePct of [NaN, Infinity, null, -101]) assert.equal(indexFact(meta('bad'), { instrument: 'spx_spot', timing: 'close', level: 1, changePct }), null);
});
test('strict calendar and timestamp validation, leap day, invalid date, DST boundaries', () => {
    assert.ok(validFactDate('2028-02-29')); assert.ok(!validFactDate('2026-02-29')); assert.ok(!validFactDate('2026-04-31'));
    assert.ok(!validFactSource({ ...source, observedAt: '2026-02-30T00:00:00Z' }));
    assert.ok(!validFactSource({ ...source, observedAt: '2026-10-15T10:00:00' }));
    for (const observedAt of ['2026-03-08T06:59:59Z', '2026-03-08T07:00:00Z', '2026-11-01T05:59:59Z', '2026-11-01T06:00:00Z', '2026-10-16T00:30:00+09:00']) {
        const f = { ...position, source: { ...source, observedAt } };
        const out = renderFactPlan(plan({ templateId: 'position_session', factId: 'position' }), factBundle(scope, [f]), 'en');
        assert.match(out.text, /2026-10-15 \(Thursday\)/);
    }
});
test('Thursday session, Friday earnings and Monday expiry coexist in every language', () => {
    const weekdays = [['목요일', '금요일', '월요일'], ['Thursday', 'Friday', 'Monday'], ['木曜日', '金曜日', '月曜日']];
    locales.forEach((loc, i) => {
        const out = renderFactPlan(sessionPlan, bundle, loc);
        assert.equal(out.issues.length, 0); assert.equal(out.sentences.length, 3);
        weekdays[i].forEach((day, j) => assert.ok(out.sentences[j].includes(day)));
        assert.match(out.sentences[0], /5,300,000,000\.00/);
    });
});
test('spot, futures, VIX, Composite and NDX cannot exchange their numbers', () => {
    const p = plan(...['spx', 'futures', 'vix', 'composite', 'ndx', 'nq', 'reviewed'].map(factId => ({ templateId: 'index_observation' as const, factId })));
    for (const loc of locales) {
        const out = renderFactPlan(p, bundle, loc); assert.equal(out.sentences.length, 7);
        ['7,659.44', '7,704.25', '20.00', '24,000.00', '26,000.00', '26,100.00', '7,600.25'].forEach((v, i) => assert.ok(out.sentences[i].includes(v)));
        ['1.09', '1.11', '5.00', '1.25', '2.31', '1.25', '1.25'].forEach((v, i) => assert.ok(out.sentences[i].includes(v + '%')));
    }
    const en = renderFactPlan(p, bundle, 'en').sentences;
    assert.match(en[0], /spot index.*down 1.09%/); assert.match(en[1], /futures.*down 1.11%/);
    assert.match(en[2], /VIX.*up 5.00%/); assert.match(en[6], /article observation.*7,600.25/);
});
test('sign, rounded zero and unit invariants are computed, never model-selected', () => {
    for (const [change, expected] of [[1.09, 'up 1.09%'], [-1.09, 'down 1.09%'], [-0, 'unchanged 0.00%'], [-0.001, 'unchanged 0.00%']] as const) {
        const out = renderFactPlan(plan({ templateId: 'index_observation', factId: 'spx' }), factBundle(scope, [{ ...spx, change }]), 'en');
        assert.ok(out.text.includes(expected));
    }
    for (const changeUnit of ['bp', 'percentage_points', 'USD']) {
        const out = renderFactPlan(indexPlan, { ...bundle, facts: [{ ...spx, changeUnit }, vix] }, 'en');
        assert.equal(out.sentences.length, 1); assert.match(out.text, /VIX/);
    }
});
test('volume call/put and OI put/call are separate facts including valid zero', () => {
    const p = plan({ templateId: 'option_ratio', factId: 'vol' }, { templateId: 'option_ratio', factId: 'oi' });
    const out = renderFactPlan(p, bundle, 'en').sentences;
    assert.match(out[0], /volume calls\/puts: 5.75 \(call-heavy\)/); assert.match(out[1], /open-interest puts\/calls: 1.86 \(put-heavy\)/);
    const zero = ucRatioFact(meta('zero'), 'NVDA', 'oi_put_over_call', { oiPcr: 0 })!;
    assert.match(renderFactPlan(plan({ templateId: 'option_ratio', factId: 'zero' }), factBundle(scope, [zero]), 'en').text, /0.00 \(call-heavy\)/);
    assert.equal(ucRatioFact(meta('bad'), 'NVDA', 'oi_put_over_call', { oiPcr: -1 }), null);
});
test('missing fact removes only its sentence and retains independent explanations', () => {
    const p = plan({ templateId: 'position_session', factId: 'absent' }, ...indexPlan.blocks, { templateId: 'explanation', explanationId: 'context' });
    for (const loc of locales) {
        const out = renderFactPlan(p, bundle, loc, [explanation]);
        assert.equal(out.sentences.length, 3); assert.equal(out.issues[0].code, 'fact_unavailable');
        assert.equal(out.sentences[2], explanation.text[loc]); assert.ok(!out.text.includes('absent'));
    }
    const dependent = { ...explanation, requires: ['absent'] };
    assert.equal(renderFactPlan(p, bundle, 'en', [dependent]).sentences.length, 2);
});
test('cross-item, cross-ticker, cross-snapshot and wrong template references cannot render', () => {
    for (const patch of [{ itemId: 'article-B' }, { targetId: 'AAPL' }, { snapshotId: 'snapshot-B' }]) {
        const out = renderFactPlan(indexPlan, { ...bundle, facts: [{ ...spx, scope: { ...scope, ...patch } }, vix] }, 'en');
        assert.equal(out.sentences.length, 1); assert.match(out.text, /VIX/);
    }
    assert.equal(renderFactPlan({ ...indexPlan, itemId: 'article-B' }, bundle, 'en').sentences.length, 0);
    assert.equal(renderFactPlan(plan({ templateId: 'position_session', factId: 'spx' }), bundle, 'en').issues[0].code, 'template_type');
});
test('wire shape rejects free text, unknown templates, fields, duplicates and truncated JSON', () => {
    const invalid: unknown[] = [
        { ...indexPlan, text: 'up' }, { ...indexPlan, schemaVersion: 2 }, { ...indexPlan, blocks: ['up'] },
        plan({ templateId: 'index_observation', factId: 'spx' }, { templateId: 'index_observation', factId: 'spx' }),
        { ...indexPlan, blocks: [{ templateId: 'custom', factId: 'spx' }] },
        { ...indexPlan, blocks: [{ templateId: ['index_observation'], factId: 'spx' }] },
        { ...indexPlan, blocks: [{ templateId: 'index_observation', factId: 'spx', direction: 'up' }] },
        '{"schemaVersion":1,"itemId":"article-A","blocks":[',
        '{"schemaVersion":1,"schemaVersion":1,"itemId":"article-A","blocks":[]}',
        '{"schemaVersion":1,"itemId":"article-A","blocks":[{"templateId":"index_observation","factId":"spx","factId":"vix"}]}',
    ];
    for (const v of invalid) assert.equal(validateFactPlan(v, bundle).plan, null);
    assert.throws(() => parseFactJSON('{"a":1,"\\u0061":2}'));
    assert.deepEqual(parseFactJSON('{"a":[{"b":"escaped \\" brace }"}]}'), { a: [{ b: 'escaped " brace }' }] });
    assert.equal(validateFactPlan(indexPlan, { ...bundle, facts: [spx, spx] }).issues[0].code, 'duplicate_fact');
    assert.equal(validateFactPlan(plan({ templateId: 'explanation', explanationId: 'context' }), bundle, [explanation, explanation]).issues[0].code, 'duplicate_explanation');
});
test('frozen storage round trip re-renders identically; legacy strings are not certified', () => {
    const serialized = JSON.stringify(snapshot);
    for (const loc of locales) {
        const expected = renderFactPlan(sessionPlan, bundle, loc);
        for (let repeat = 0; repeat < 3; repeat++) assert.deepEqual(renderFactSnapshot(serialized, loc).rendered, expected);
    }
    assert.equal(readFactSnapshot({ items: [{ summaryEN: 'S&P 500 at 7704' }] }).status, 'legacy');
    assert.equal(readFactSnapshot({ ...snapshot, rendererVersion: 99 }).status, 'unsupported_version');
    assert.equal(readFactSnapshot({ ...snapshot, schemaVersion: 2 }).status, 'unsupported_version');
    assert.equal(readFactSnapshot('{"schemaVersion":1,').status, 'invalid');
    assert.equal(renderFactSnapshot(snapshot, 'fr').rendered!.issues[0].code, 'unsupported_locale');
    const read = readFactSnapshot(snapshot); assert.equal(read.status, 'ready');
    if (read.status === 'ready') {
        assert.equal(readFactSnapshot(JSON.stringify(read.snapshot)).status, 'ready');
        (read.snapshot.bundle as { facts: unknown[] }).facts.length = 0; assert.equal(bundle.facts.length, 12);
    }
});
test('stored invalid source and dependent interpretation are rechecked at final exit', () => {
    const invalid = { ...position, source: { ...source, basisDate: '2026-10-16' } };
    const withExplanation = { ...snapshot, explanations: [{ ...explanation, requires: ['position'] }], plan: plan(...sessionPlan.blocks, { templateId: 'explanation', explanationId: 'context' }), bundle: factBundle(scope, [invalid, earnings, expiry]) };
    const out = renderFactSnapshot(withExplanation, 'en').rendered!;
    assert.equal(out.sentences.length, 2); assert.deepEqual(out.issues.map(i => i.code), ['fact_unavailable', 'explanation_unavailable']);
});

const regressions = JSON.parse(readFileSync(join(__dirname, 'fixtures/ai-guard/weekday-index-gates.json'), 'utf8')) as Array<{ report: string; issue: number; kind: string; texts: string[]; deferred?: string }>;
assert.equal(regressions.length, 31); assert.equal(new Set(regressions.map(r => r.report)).size, 8);
for (const row of regressions) test(`gate ${row.report} #${row.issue}: ${row.kind}`, () => {
    // Every original normal/error sentence is excluded by contract, not semantically parsed.
    for (const text of row.texts) {
        assert.equal(validateFactPlan(text, bundle).plan, null);
        assert.equal(validateFactPlan({ ...indexPlan, blocks: [{ templateId: 'index_observation', factId: 'spx', text }] }, bundle).plan, null);
    }
    if (row.deferred) { assert.equal(row.kind, 'retry'); return; }
    if (row.kind === 'legacy') { assert.equal(readFactSnapshot({ summaryKR: row.texts[0] }).status, 'legacy'); return; }
    const p = row.kind === 'session' ? sessionPlan : row.kind === 'article'
        ? plan({ templateId: 'index_observation', factId: 'reviewed' }, { templateId: 'index_observation', factId: 'composite' }, { templateId: 'index_observation', factId: 'nq' }) : indexPlan;
    for (const loc of locales) {
        const out = renderFactPlan(p, bundle, loc);
        assert.equal(out.issues.length, 0); assert.equal(out.sentences.length, p.blocks.length);
        assert.ok(!/[{}]/.test(out.text));
    }
});
console.log(`${count} tests passed; 31 findings / 8 reports covered (2 route retry findings deferred).`);
