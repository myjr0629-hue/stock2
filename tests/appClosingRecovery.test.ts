import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { reportDate, crossBriefUrl } from '../src/lib/app/reportLink';

const DAY = '2026-10-19';
const LATEST = '2026-10-22';
const path = 'src/app/[locale]/app-view/intel/page.tsx';
const source = fs.readFileSync(process.argv[2] || path, 'utf8');
const sf = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(root: ts.Node, predicate: (n: ts.Node) => boolean): ts.Node {
    let found: ts.Node | undefined;
    const visit = (n: ts.Node) => { if (found) return; if (predicate(n)) found = n; else ts.forEachChild(n, visit); };
    visit(root); assert.ok(found, '실제 앱 배선'); return found;
}
const effect = (find(sf, n => ts.isCallExpression(n) && n.expression.getText(sf) === 'useEffect'
    && n.arguments[0]?.getText(sf).includes('crossBriefUrl(requestedDate)')) as ts.CallExpression).arguments[0].getText(sf);
const view = (find(sf, n => ts.isJsxExpression(n) && !!n.expression?.getText(sf).startsWith("!selectedSector && intelTab === 'report'")) as ts.JsxExpression).expression!.getText(sf);
function evaluate(text: string, deps: Record<string, any>) {
    const js = ts.transpileModule(`return (${text});`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
    return new Function('require', 'exports', ...Object.keys(deps), js)(require, {}, ...Object.values(deps));
}
const flush = () => new Promise<void>(done => setImmediate(done));
const response = (data: any, status = 200) => ({ ok: status === 200, json: async () => data });
const success = (date: string) => response({ success: true, date, structured: { marker: date }, generatedAt: `${date}T22:00:00Z` });
const deferred = () => { let resolve!: (v: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; };
function harness(locale: string, fetch: (url: string, options: any) => Promise<any>) {
    const state: Record<string, any> = { IntelTab: 'report', SelectedSector: null, CrossBriefLoading: true, GlobalReportLoading: true };
    const routes: string[] = [];
    const timers = new Map<number, () => void>();
    let timerId = 0;
    const setters = Object.fromEntries(['CrossBriefError', 'CrossBriefLoading', 'ClosingDate', 'ClosingReports', 'GlobalReportLoading', 'ExpandedReport', 'CrossBrief', 'CrossMacro', 'VixTerm', 'CrossBriefGeneratedAt', 'IntelTab'].map(key => [`set${key}`, (value: any) => { state[key] = value; }]));
    const deps = { ...setters, reportDate, crossBriefUrl, locale, AbortController,
        router: { replace: (url: string, options: any) => { assert.deepEqual(options, { scroll: false }); routes.push(url); } },
        window: { setTimeout: (fn: () => void, ms: number) => { assert.equal(ms, 12000); timers.set(++timerId, fn); return timerId; }, clearTimeout: (id: number) => timers.delete(id) },
    };
    return { state, routes, timers,
        start: (requestedDate: string | null, get = fetch) => evaluate(effect, { ...deps, requestedDate, fetch: get })(),
        render: (requestedDate: string | null) => renderToStaticMarkup(evaluate(view, {
            selectedSector: null, intelTab: state.IntelTab, requestedDate, locale,
            crossBriefError: state.CrossBriefError, crossBriefLoading: state.CrossBriefLoading,
            crossBrief: state.CrossBrief, closingDate: state.ClosingDate, expandedReport: null,
            appCopy: { reportLoading: 'LOADING_MARKER' }, appLocale: locale,
            SECTOR_CONFIGS: [{ id: 'quantum_edge' }, { id: 'm7' }], datedReports: {}, globalReportLoading: state.GlobalReportLoading,
            SECTOR_APP_COPY: { [locale]: { quantum_edge: { name: 'QUANTUM_MARKER' }, m7: { name: 'M7_MARKER' } } },
        })),
    };
}

async function main() {
    for (const locale of ['ko', 'en', 'ja']) {
        const calls: string[] = [];
        const h = harness(locale, async url => { calls.push(url); return url.includes('date=') ? response({}, 404) : success(LATEST); });
        const cancel = h.start(DAY);
        assert.equal(h.state.CrossBriefLoading, true);
        assert.match(h.render(DAY), /LOADING_MARKER/);
        await flush();
        assert.equal(h.state.CrossBriefError, true);
        assert.equal(h.state.CrossBriefLoading, false);
        assert.deepEqual(h.routes, [`/${locale}/app-view/intel?tab=report`]);
        const failed = h.render(DAY);
        assert.doesNotMatch(failed, /LOADING_MARKER|spin 1s/, '404 뒤 로딩 종료');
        assert.match(failed, /QUANTUM_MARKER/); assert.match(failed, /M7_MARKER/, '오류 중에도 섹터 목록 유지');
        cancel();
        h.start(null); await flush();
        assert.equal(h.state.CrossBriefError, false);
        assert.equal(h.state.CrossBriefLoading, false);
        assert.equal(h.state.ClosingDate, LATEST);
        assert.equal(h.state.CrossBrief.marker, LATEST);
        assert.deepEqual(calls, [crossBriefUrl(DAY), crossBriefUrl(null)], '최신 조회는 한 번');
        assert.equal(h.timers.size, 0);
    }

    for (const get of [async () => response({}, 404), async () => response({}, 500), async () => { throw new Error('offline'); },
        async () => response({ success: true, date: DAY }), async () => response({ success: false, date: DAY, structured: {} }),
        async () => response({ success: true, structured: {} }), async () => success(LATEST)]) {
        const h = harness('ko', get);
        h.start(DAY); await flush();
        assert.equal(h.state.CrossBriefLoading, false);
        assert.equal(h.state.CrossBrief, null, '404·실패·불완전·다른 날짜 응답 거절');
        assert.equal(h.routes.length, 1);
    }
    const unavailable = harness('ko', async () => response({}, 404));
    let cancel = unavailable.start(DAY); await flush(); cancel();
    unavailable.start(null); await flush();
    assert.equal(unavailable.state.IntelTab, 'sector', '최신도 없으면 인텔 기본 화면');
    assert.equal(unavailable.state.CrossBriefLoading, false);
    assert.equal(unavailable.routes.length, 1, '재이동 반복 없음');
    assert.equal(unavailable.render(null), '');

    const timeout = harness('ko', (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout')))));
    timeout.start(DAY); [...timeout.timers.values()][0](); await flush();
    assert.equal(timeout.state.CrossBriefLoading, false, '응답 지연도 유한 시간 안에 종료');
    assert.equal(timeout.routes.length, 1);

    for (const late of [success(DAY), response({}, 404)]) {
        const old = deferred();
        const h = harness('ko', async () => success(LATEST));
        cancel = h.start(DAY, () => old.promise); cancel();
        h.start(LATEST); await flush();
        old.resolve(late); await flush();
        assert.equal(h.state.ClosingDate, LATEST);
        assert.equal(h.state.CrossBriefError, false);
        assert.equal(h.routes.length, 0, '이전 요청이 새 화면을 이동시키지 않음');
    }
    const oldBody = deferred();
    const h = harness('ko', async () => success(LATEST));
    cancel = h.start(DAY, async () => ({ ok: true, json: () => oldBody.promise }));
    await flush(); cancel(); h.start(LATEST); await flush();
    oldBody.resolve({ success: true, date: DAY, structured: {} }); await flush();
    assert.equal(h.state.ClosingDate, LATEST, '늦은 본문도 새 날짜를 덮지 않음');
    assert.equal(h.routes.length, 0);
    console.log('ok - 앱 만료 알림: 로딩/오류 분리·섹터 유지·최신→기본 화면·시간 제한·경합 보호');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
