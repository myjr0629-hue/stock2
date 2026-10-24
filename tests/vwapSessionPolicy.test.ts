import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
import { normalizeVwap } from '../src/lib/vwap';
import { vwapForCalculation } from '../src/lib/sessionVwapPolicy';
import { commandConvictionRaw, retainConvictionInputs, scoreCommandConviction, webConvictionSnapshot } from '../src/lib/commandConviction';
import { commandScores } from '../src/lib/commandScores';
import { buildDeepSnapshot } from '../src/lib/ai/deepSnapshot';

const RealDate = Date;
let now = Date.parse('2026-10-21T13:31:00Z');
global.Date = class extends RealDate {
    constructor(...args: any[]) { super(...(args.length ? args : [now]) as [any]); }
    static now() { return now; }
} as DateConstructor;
const today = '2026-10-21', prev = '2026-10-20';
const unified = { sma: { cross: 'NONE', date: today } };
const snap = (value: any, date: string, previous?: any) => {
    const { raw, dates, invalidated } = commandConvictionRaw(unified, 123, value, null, { vwap: date });
    return retainConvictionInputs('VWAP-POLICY', raw, dates, previous, invalidated);
};

test('09:31 직전 숫자·원천 날짜 보존, 앱/웹/어댑터 당일 확신도는 null VWAP과 동일', () => {
    now = RealDate.parse('2026-10-21T13:31:00Z');
    const old = snap(100, prev), absent = snap(null, prev);
    assert.equal(old.inputs.vwap, 100); assert.equal(old.sourceDates.vwap, prev);
    assert.deepEqual(scoreCommandConviction(old.inputs, old.sourceDates), scoreCommandConviction(absent.inputs, absent.sourceDates));
    const web = webConvictionSnapshot('WEBPOLICY', { unified, quote: { vwap: 100, vwapDate: prev }, price: 123 });
    assert.equal(scoreCommandConviction(web.inputs, web.sourceDates)?.score, 50);
    assert.equal(commandScores({ unified, price: 123, vwap: 100, rawTickerData: { vwapDate: prev } }).cScore, 50);
    assert.equal(vwapForCalculation(100, undefined), null, '날짜 미상도 당일 값으로 쓰지 않는다');
});

test('09:50 당일 투표 복구·늦게 온 직전 값이 당일 입력과 점수를 덮지 않음', () => {
    now = RealDate.parse('2026-10-21T13:50:00Z');
    const current = snap(100, today, snap(150, prev));
    const late = snap(150, prev, current);
    assert.equal(late.inputs.vwap, 100); assert.equal(late.sourceDates.vwap, today);
    assert.equal(scoreCommandConviction(late.inputs, late.sourceDates)?.score, 58);
    assert.equal(commandScores({ unified, price: 123, convictionInputs: late.inputs, convictionSourceDates: late.sourceDates }).cScore, 58);
    const mapped = find('src/app/[locale]/app-view/cmd/page.tsx', n => ts.isPropertyAssignment(n)
        && n.name.getText() === 'vwap' && n.initializer.getText().includes('lastConviction.current'));
    const display = new Function('lastConviction', 'session', 'normalizeVwap', 't', `return ({${mapped}}).vwap;`);
    assert.equal(display({ current: late }, 'REG', normalizeVwap, { vwap: 150 }), 100, '앱 화면 숫자도 선택된 당일 값을 유지한다');
    for (const session of ['PRE', 'POST', 'CLOSED']) assert.equal(display({ current: late }, session, normalizeVwap, { vwap: 150 }), 150, '장외 숫자 매핑은 원래 응답값 그대로');
});

test('AI 재료와 점수도 같은 날짜 검사: 직전 투표 없음 → 당일 교체 → 늦은 직전 값 차단', () => {
    now = RealDate.parse('2026-10-21T13:31:00Z');
    const material = (date: string, vwap: number) => buildDeepSnapshot({ ticker: 'POLICY-AI', price: 123,
        priceChange: 0, session: 'REG', unified, rawTickerData: { vwap, vwapDate: date }, insider: null, technicals: null, creditSpread: null });
    const old = material(prev, 100);
    assert.equal(old.vwap, null); assert.equal(old.vwapDistance, 'N/A');
    now = RealDate.parse('2026-10-21T13:50:00Z');
    assert.equal(material(today, 100).vwap, 100);
    assert.equal(material(prev, 150).vwap, 100);
});

function find(file: string, predicate: (n: ts.Node) => boolean): string {
    const source = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let found = '';
    function visit(n: ts.Node) { if (predicate(n)) found = n.getText(ast); ts.forEachChild(n, visit); }
    visit(ast); assert.ok(found, file); return found;
}

test('웹 체크리스트 DecisionGate 실제 VWAP 분기: 직전 점수 0·당일 +8', () => {
    now = RealDate.parse('2026-10-21T13:31:00Z');
    const block = find('src/components/DecisionGate.tsx', n => ts.isIfStatement(n) && n.expression.getText() === 'isREG' && n.getText().includes('const vwap ='));
    const run = new Function('liveQuote', 'vwapForCalculation', `let bullScore=0, bearScore=0; const signals=[], isREG=true, displayPrice=123, td=()=>''; ${block}; return {bullScore,bearScore};`);
    assert.deepEqual(run({ vwap: 100, vwapDate: prev }, vwapForCalculation), { bullScore: 0, bearScore: 0 });
    assert.deepEqual(run({ vwap: 100, vwapDate: today }, vwapForCalculation), { bullScore: 8, bearScore: 0 });
});

test('대시보드 알파 실제 입력식: 화면 숫자 유지, 직전 계산 입력 null·당일 입력 유지', () => {
    now = RealDate.parse('2026-10-21T13:31:00Z');
    const input = find('src/app/api/dashboard/unified/route.ts', n => ts.isPropertyAssignment(n)
        && n.name.getText() === 'vwap' && n.initializer.getText().startsWith('vwapForCalculation'));
    const fn = new Function('data', 'vwapForCalculation', `return ({${input}}).vwap;`);
    assert.equal(fn({ vwap: 100, vwapDate: prev }, vwapForCalculation), null);
    assert.equal(fn({ vwap: 100, vwapDate: today }, vwapForCalculation), 100);
});

for (const iso of ['2026-10-21T12:00:00Z', '2026-10-21T20:01:00Z', '2026-10-24T12:00:00Z']) {
    test(`PRE/POST/주말 계산 기존 동작 유지: ${iso}`, () => {
        now = RealDate.parse(iso);
        const old = snap(100, prev);
        assert.equal(vwapForCalculation(100, prev), 100);
        assert.equal(scoreCommandConviction(old.inputs, old.sourceDates)?.score, 58);
    });
}
