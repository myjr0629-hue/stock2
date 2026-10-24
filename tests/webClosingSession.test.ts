import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { reportDate, crossBriefUrl } from '../src/lib/app/reportLink';

const DAY = '2026-10-22';
const NEXT = '2026-10-23';
const parse = (file: string) => ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(sf: ts.Node, predicate: (n: ts.Node) => boolean): ts.Node {
    let found: ts.Node | undefined;
    const visit = (n: ts.Node) => { if (found) return; if (predicate(n)) found = n; else ts.forEachChild(n, visit); };
    visit(sf); assert.ok(found, '실제 컴포넌트 배선'); return found;
}
function evaluate(source: string, deps: Record<string, any>) {
    const compiled = ts.transpileModule(`return (${source});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    return new Function(...Object.keys(deps), compiled)(...Object.values(deps));
}
const deck = parse('src/components/intel/TacticalReportDeck.tsx');
const parent = parse('src/components/intel/PostMarketBriefView.tsx');
const effect = (sf: ts.SourceFile) => {
    const component = find(sf, n => ts.isFunctionDeclaration(n) && ['TacticalReportDeck', 'PostMarketBriefView'].includes(n.name?.text || ''));
    return (find(component, n => ts.isCallExpression(n) && n.expression.getText(sf) === 'useEffect') as ts.CallExpression).arguments[0].getText(sf);
};
const dateExpr = (find(parent, n => ts.isVariableDeclaration(n) && n.name.getText(parent) === 'closingDate') as ts.VariableDeclaration).initializer!.getText(parent);
const deckTag = find(parent, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(parent) === 'TacticalReportDeck') as ts.JsxSelfClosingElement;
const dateAttr = deckTag.attributes.properties.find(n => ts.isJsxAttribute(n) && n.name.getText(parent) === 'date') as ts.JsxAttribute;
assert.ok(dateAttr?.initializer && ts.isJsxExpression(dateAttr.initializer));
const suppliedDate = (brief: any, requestedDate: string | null) => {
    const closingDate = evaluate(dateExpr, { brief, requestedDate, reportDate });
    return evaluate((dateAttr.initializer as ts.JsxExpression).expression!.getText(parent), { closingDate });
};
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
const payload = (day: string) => ({ success: true, snapshot_date: day, snapshot: { day } });
const response = (data: any, status = 200) => ({ ok: status === 200, status, text: async () => JSON.stringify(data), json: async () => data });
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; };
function harness(sf: ts.SourceFile, base: Record<string, any>) {
    const state: Record<string, any> = {};
    const setters = Object.fromEntries(['Snapshot', 'SnapshotDate', 'Error', 'Loading', 'Brief', 'BriefLoading'].map(k => [`set${k}`, (value: any) => { state[k] = value; }]));
    return { state, start: (overrides: Record<string, any> = {}) => evaluate(effect(sf), { ...base, ...setters, ...overrides })() };
}

async function main() {
    const urls: string[] = [];
    const config = { apiEndpoints: { snapshot: '/api/intel/snapshot?sector=m7' } };
    const h = harness(deck, { config, tr: (key: string) => key, date: DAY,
        fetch: async (url: string) => { urls.push(url); return response(payload(DAY)); } });
    h.start(); await flush();
    assert.equal(new URL(urls[0], 'https://local.invalid').searchParams.get('date'), DAY);
    assert.equal(h.state.SnapshotDate, DAY);
    assert.equal(h.state.Snapshot.day, DAY);

    h.start({ fetch: async () => response(payload(NEXT)) }); await flush();
    assert.equal(h.state.Snapshot, null, '다른 날짜 응답 거절');
    assert.equal(h.state.Error, 'noSnapshotData');
    h.start({ fetch: async () => response({}, 404) }); await flush();
    assert.equal(h.state.Error, 'snapshotNotReady');
    assert.equal(h.state.Snapshot, null);
    const count = urls.length;
    h.start({ date: null }); await flush();
    assert.equal(urls.length, count, '요약 날짜 결측 시 최신 조회 없음');
    assert.equal(h.state.Error, 'noSnapshotData');

    h.start({ date: undefined }); await flush();
    assert.equal(new URL(urls.at(-1)!, 'https://local.invalid').searchParams.has('date'), false, '독립 섹터 화면은 기존 latest 조회');
    assert.equal(h.state.SnapshotDate, DAY);

    for (const late of [response(payload(DAY)), response({}, 404)]) {
        const old = deferred();
        const cancel = h.start({ fetch: () => old.promise });
        cancel();
        h.start({ date: NEXT, fetch: async () => response(payload(NEXT)) }); await flush();
        old.resolve(late); await flush();
        assert.equal(h.state.SnapshotDate, NEXT, '이전 날짜의 늦은 성공/실패 응답 무시');
        assert.equal(h.state.Error, null);
    }
    const oldText = deferred();
    const cancel = h.start({ fetch: async () => ({ ok: true, text: () => oldText.promise }) });
    await flush(); cancel();
    h.start({ date: NEXT, fetch: async () => response(payload(NEXT)) }); await flush();
    oldText.resolve(JSON.stringify(payload(DAY))); await flush();
    assert.equal(h.state.SnapshotDate, NEXT, '본문 수신 중 날짜 변경도 보호');

    const p = harness(parent, { requestedDate: DAY, reportDate, crossBriefUrl,
        fetch: async () => response({ success: true, date: DAY, structured: {} }) });
    p.start(); await flush();
    assert.equal(suppliedDate(p.state.Brief, DAY), DAY, '요약 수신 날짜가 실제 하위 date 속성으로 전달');
    assert.equal(suppliedDate(p.state.Brief, NEXT), null, '날짜 전환 중 이전 보고서 날짜 사용 금지');
    assert.equal(suppliedDate(p.state.Brief, null), DAY, '날짜 없는 진입도 반환된 보고서 날짜로 고정');
    p.start({ fetch: async () => response({ success: true, date: NEXT, structured: {} }) }); await flush();
    assert.equal(p.state.Brief, null, '지정일과 다른 요약 거절');
    p.start({ fetch: async () => response({ success: true, structured: {} }) }); await flush();
    assert.equal(p.state.Brief, null, '날짜 없는 요약 거절');
    console.log('ok - 웹 요약→섹터 날짜 전달, 불일치·결측·404·경합 거절, 독립 섹터 latest 유지');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
