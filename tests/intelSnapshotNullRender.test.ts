/**
 * 무네트워크: 실제 저장 매퍼 → JSON → 모바일/웹 REPORT의 전체 React 서버 렌더.
 * 선택 인자에 과거 MobileSectorReport.tsx 경로를 주면 동일 입력으로 수정 전 오류를 재현한다.
 * 서비스·API 모듈은 로드하지 않고 순수 계산부만 AST에서 실행한다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { snapshotChangeOrNull, snapshotChangesFromResponse } from '../src/lib/app/intelSnapshotChange';
import * as yieldChange from '../src/lib/yieldChange';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const parse = (rel: string) => ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, rel.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
function find(root: ts.Node, pred: (n: ts.Node) => boolean): ts.Node {
    let result: ts.Node | undefined;
    const visit = (n: ts.Node) => { if (result) return; if (pred(n)) result = n; else ts.forEachChild(n, visit); };
    visit(root); assert.ok(result, '실제 소스 노드'); return result;
}
const fn = (sf: ts.SourceFile, name: string) => find(sf, n => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(sf).replace(/^export\s+/, '');
const decl = (sf: ts.SourceFile, name: string) => find(sf, n => ts.isVariableDeclaration(n) && n.name.getText(sf) === name) as ts.VariableDeclaration;
const compile = (source: string) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const run = (source: string, deps: Record<string, any>) => new Function(...Object.keys(deps), compile(source))(...Object.values(deps));
const route = parse('src/app/api/intel/snapshot/route.ts');
const save = (quotes: any[]) => JSON.parse(JSON.stringify(run(`${fn(route, 'nz')}\nreturn ${decl(route, 'tickerSnapshots').initializer!.getText(route)};`, {
    liveData: { data: quotes }, batchMap: {}, generateVerdict: () => 'HOLD', generateAnalysisKR: () => '',
})));
const quote = (ticker: string, changePct: number | null, missingFields: string[] = []) => ({ ticker, changePct, missingFields, price: 100, alphaScore: 50 });
const payload = (tickers: any[]) => ({
    success: true, snapshot_date: '2026-10-16',
    snapshot: {
        meta: { snapshot_timestamp: '2026-10-16T20:05:00Z', sector: 'm7', locked_until: '2026-10-19T20:05:00Z' },
        tickers,
        sector_summary: { avg_alpha: 50, avg_pcr: 1, total_gex: 0, gainers: 0, losers: 0, dominant_regime: 'LONG', outlook: 'NEUTRAL', next_day_briefing_kr: '', briefing: { headline: '', bullets: [], watchpoints: [] } },
    },
});
const config = { key: 'm7', id: 'm7', name: 'M7', shortName: 'M7', accentHex: '#06b6d4', theme: { accentHex: '#06b6d4' }, apiEndpoints: { snapshot: '/api/intel/snapshot?sector=m7' } };
const mobileSource = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : read('src/components/intel/mobile/MobileSectorReport.tsx');
const webSource = read('src/components/intel/TacticalReportDeck.tsx');

function render(kind: 'mobile' | 'web', data: ReturnType<typeof payload>, locale = 'en') {
    // fetch/effects 실행 없이 응답 수신 후 상태만 주입한다. JSX와 하위 컴포넌트는 React로 실제 렌더한다.
    const states = kind === 'mobile' ? [data, false, null] : [data.snapshot, data.snapshot_date, false, null];
    let stateIndex = 0;
    const hooks = { ...React, useState: () => [states[stateIndex++], () => {}], useEffect() {}, useCallback: (f: any) => f };
    const deps: Record<string, any> = {
        react: hooks,
        'react/jsx-runtime': require('react/jsx-runtime'),
        'next-intl': { useLocale: () => locale, useTranslations: () => (key: string, vars?: any) => `${key}${vars ? JSON.stringify(vars) : ''}` },
        'lucide-react': new Proxy({}, { get: () => () => null }),
        '@/lib/yieldChange': yieldChange,
        '@/components/gate/FeatureGate': { ProGate: ({ children }: any) => children },
    };
    const mod = { exports: {} as any };
    new Function('require', 'module', 'exports', compile(kind === 'mobile' ? mobileSource : webSource))((id: string) => {
        assert.ok(id in deps, `예상하지 않은 모듈·외부 접근 금지: ${id}`); return deps[id];
    }, mod, mod.exports);
    const Component = kind === 'mobile' ? mod.exports.MobileSectorReport : mod.exports.TacticalReportDeck;
    return renderToStaticMarkup(React.createElement(Component, kind === 'mobile' ? { sector: config } : { config }));
}
const text = (html: string) => html.replace(/<[^>]*>/g, '');
let count = 0;
const test = (name: string, body: () => void) => { body(); count++; console.log(`✓ ${name}`); };

test('대조군: 저장된 실측 0은 모바일에서 +0.00% 유지', () => {
    assert.match(text(render('mobile', payload(save([quote('ZERO', 0)])))), /ZERO\+0\.00%/);
});

test('저장 매퍼의 결측 0 → JSON null → 모바일 REPORT 전체 렌더, 행·칸 유지', () => {
    const stored = save([quote('MISSING', 0, ['changePct'])]);
    assert.equal(stored[0].change_pct, null);
    for (const locale of ['ko', 'en', 'ja']) {
        const html = render('mobile', payload(stored), locale);
        assert.match(text(html), /MISSING/);
        assert.match(text(html), /MVP——WORST— —/);
        assert.match(html, /text-white\/40[^>]*>—<\/span>/);
        assert.doesNotMatch(text(html), /[+-]?0\.00%|null|undefined|NaN/);
    }
});

test('모바일 종가·점수도 null인 실제 저장 행은 — 경로로 렌더', () => {
    const stored = save([{ ...quote('NULLS', null), price: null, alphaScore: null }]);
    const output = text(render('mobile', payload(stored)));
    assert.match(output, /NULLS——Ctx —/);
    assert.doesNotMatch(output, /\$0\.00|0\.00%|NaN|undefined/);
});

test('모바일·웹 혼합 행: 결측은 표시 유지, MVP/WORST는 실측 순위, 0·양수·음수 유지', () => {
    const data = payload(save([quote('MISSING', 0, ['changePct']), quote('ZERO', 0), quote('UP', 4), quote('DOWN', -3)]));
    for (const kind of ['mobile', 'web'] as const) {
        const output = text(render(kind, data));
        assert.match(output, /MVPUP\+4\.00%/);
        assert.match(output, /WORSTDOWN ?-3\.00%/);
        assert.match(output, /MISSING/);
        assert.match(output, /ZERO.*?\+0\.00%/);
    }
});

test('모바일·웹 전부 null 또는 빈 목록도 슬롯을 유지하며 렌더', () => {
    for (const stored of [save([quote('MISSING', null)]), []]) {
        for (const kind of ['mobile', 'web'] as const) {
            const output = text(render(kind, payload(stored)));
            assert.match(output, /MVP—/); assert.match(output, /WORST—/);
            assert.doesNotMatch(output, /0\.00%|undefined|NaN/);
        }
    }
});

for (const source of ['src/app/api/intel/cross-sector-brief/route.ts', 'scripts/lambda-cross-sector/index.js']) {
test(`${source} 실제 매퍼: null 제외, 전부 결측은 기존 - 경로`, () => {
    const cross = parse(source);
    const summarize = (stored: any[]) => run(`return ${decl(cross, 'sectorSummaries').initializer!.getText(cross)};`, {
        validSnapshots: [{ id: 'm7', data: payload(stored).snapshot }], SECTOR_LABELS: { m7: 'M7' },
        CLOSING: require('../scripts/lambda-cross-sector/closingReport'), todayDate: '2026-10-22', now: new Date('2026-10-22T21:50:00Z'), closeMinutes: 960,
    })[0];
    for (const stored of [save([quote('MISSING', null)]), []]) {
        const row = summarize(stored); assert.equal(row.leader, '-'); assert.equal(row.laggard, '-');
    }
    const row = summarize(save([quote('MISSING', null), quote('DOWN', -2), quote('ZERO', 0)]));
    assert.equal(row.leader, 'ZERO +0.00%'); assert.equal(row.laggard, 'DOWN -2.00%');
});
}

test('공유 스냅샷 판독과 앱의 두 실제 매퍼: 명시적 null·표식 우선, 실측 0 유지', () => {
    const page = parse('src/app/[locale]/app-view/intel/page.tsx');
    const maps: ts.PropertyAssignment[] = [];
    const visit = (n: ts.Node) => {
        if (ts.isPropertyAssignment(n) && n.name.getText(page) === 'changePct' && n.initializer.getText(page) === 'snapshotChangeOrNull(tick)') maps.push(n);
        ts.forEachChild(n, visit);
    };
    visit(page); assert.equal(maps.length, 2, '로드·프리페치 양쪽 소비처');
    for (const [tick, expected] of [
        [{ ticker: 'A', change_pct: null, changePct: 5 }, null],
        [{ ticker: 'A', change_pct: 0, missingFields: ['changePct'] }, null],
        [{ ticker: 'A', change_pct: 0 }, 0],
        [{ ticker: 'A', changePct: -2 }, -2],
        [{ ticker: 'A' }, null],
    ] as const) {
        assert.equal(snapshotChangeOrNull(tick), expected);
        for (const map of maps) assert.equal(run(`return ${map.initializer.getText(page)};`, { tick, snapshotChangeOrNull }), expected);
        const changes = snapshotChangesFromResponse(payload([{ close_price: 100, ...tick }]));
        assert.equal(changes.A?.changePct ?? null, expected);
    }
});

test('서버·웹 대체 브리핑도 전부 null일 때 결측 경로, 혼합 목록 렌더 통과', () => {
    const briefing = run(`${fn(route, 'generateNextDayBriefing')}\nreturn generateNextDayBriefing;`, {});
    const out = briefing(save([quote('MISSING', null)]), { dominantRegime: 'LONG', avgPcr: 1, totalGex: 0, gainers: 0, losers: 0, outlook: 'NEUTRAL' });
    assert.equal(out.briefing.bullets.length, 0);
    assert.doesNotMatch(JSON.stringify(out), /0\.00%/);
    const legacy: any = payload(save([quote('MISSING', null)]));
    delete legacy.snapshot.sector_summary.briefing;
    assert.doesNotThrow(() => render('web', legacy));
});

console.log(`${count}건 통과`);
