/** 관문 10191831: 실제 보충 함수→히트맵 계산·렌더, 무네트워크. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fillSnapshotChanges, snapshotChangesFromResponse } from '../src/lib/app/intelSnapshotChange';
import { averageMeasured, measuredOrNull } from '../src/lib/app/intelMissing';
import { shownRegularSessionDate } from '../src/lib/marketCalendar';

const source = ts.createSourceFile('heatmap.tsx', fs.readFileSync(`${__dirname}/../src/app/[locale]/app-view/heatmap/page.tsx`, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const code = source.statements.filter(n => !ts.isImportDeclaration(n)).map(n => n.getText(source).replace(/^export default /, '')).join('\n');
const quote = (ticker = 'A', over: any = {}): any => ({ ticker, session: 'CLOSED', price: 100, changePct: 0, regularCloseToday: null, missingFields: ['changePct'], ...over });
const saved = (date: string, tickers: any[]) => snapshotChangesFromResponse({ success: true, snapshot_date: date, snapshot: { tickers } });
const sunday = Date.parse('2026-10-18T12:00:00Z');
const filled = (date = '2026-10-15', ticker = 'A', change = -2) => fillSnapshotChanges([quote(ticker)], saved(date, [{ ticker, close_price: 98, change_pct: change }]), '2026-10-16')[0];

function render(rows: any[], time = sunday, session = 'closed', isHoliday = false) {
    const deps = {
        React, averageMeasured, measuredOrNull, shownRegularSessionDate: () => shownRegularSessionDate(time),
        useState: (v: any) => [v === false ? true : v, () => {}], useMemo: (f: any) => f(), useEffect() {},
        useRouter: () => ({ push() {}, back() {} }), useParams: () => ({ locale: 'ko' }),
        useIntelSharedDataForApp: () => ({ m7: rows }), useMarketStatus: () => ({ status: { session, isHoliday } }),
        useStarLongPress: () => () => ({}), useAppWatchlist: () => ({ has: () => false }),
        AppTickerLogo: () => null, LogoWithBadge: ({ children }: any) => children, lpRowClass: '',
        s: new Proxy({}, { get: (_, key) => String(key) }),
    };
    const page = new Function(...Object.keys(deps), ts.transpileModule(`${code}\nreturn HeatmapPage;`, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
    }).outputText)(...Object.values(deps));
    return renderToStaticMarkup(page());
}
const cells = (html: string) => [...html.matchAll(/<span class="hmC"[\s\S]*?<\/span>/g)].map(m => m[0]);

test('관문 입력: 10/18에 10/16 결측→10/15 -2%이면 칸에 10/15, 직전 거래일 안내 없음', () => {
    const q = filled();
    assert.deepEqual([q.price, q.changePct, q.changePctSourceDate], [98, -2, '2026-10-15']);
    const html = render([q]);
    assert.match(cells(html)[0], /10\/15/);
    assert.doesNotMatch(html, /직전 거래일 마감값/);
    assert.match(html, /2026-10-15/);
});

test('10/15·10/16 혼합은 각 칸에 자기 날짜, 공통 직전 거래일 안내 없음', () => {
    const html = render([filled(), filled('2026-10-16', 'B', 1)]);
    const byTicker = cells(html);
    assert.match(byTicker.find(c => c.includes('<b>A</b>'))!, /10\/15/);
    assert.match(byTicker.find(c => c.includes('<b>B</b>'))!, /10\/16/);
    assert.doesNotMatch(html, /직전 거래일 마감값/);
});

test('실측 0도 날짜 유지, 전부 실제 직전 거래일 값이면 기존 안내 유지', () => {
    const html = render([filled('2026-10-16', 'A', 0)]);
    assert.match(cells(html)[0], /0\.0%/);
    assert.match(cells(html)[0], /10\/16/);
    assert.match(html, /장 마감 — 직전 거래일 마감값입니다\./);
});

test('원천 없는 칸은 — 유지, 날짜와 직전 거래일 안내를 만들지 않음', () => {
    const html = render([quote()]);
    assert.match(cells(html)[0], /—/);
    assert.doesNotMatch(cells(html)[0], /10\/1[56]/);
    assert.doesNotMatch(html, /직전 거래일 마감값/);
});

test('휴장 안내도 실제 원천이 오래되면 10/15를 표시', () => {
    const html = render([filled()], sunday, 'closed', true);
    assert.match(cells(html)[0], /10\/15/);
    assert.doesNotMatch(html, /직전 거래일 마감값/);
    assert.match(html, /휴장/);
});

test('월요일 PRE의 보충 없는 실측은 기존 달력의 금요일 날짜', () => {
    const html = render([quote('A', { session: 'PRE', changePct: 1, missingFields: [] })], Date.parse('2026-10-19T12:00:00Z'), 'pre');
    assert.match(cells(html)[0], /10\/16/);
    assert.doesNotMatch(html, /직전 거래일 마감값/);
});

test('REG 실측 복구 뒤에는 현재 세션 날짜, 이전 보충 날짜 제거', () => {
    const current = quote('A', { session: 'REG', price: 100, changePct: 0, missingFields: [] });
    const out = fillSnapshotChanges([current], saved('2026-10-16', [{ ticker: 'A', close_price: 98, change_pct: -2 }]), '2026-10-19');
    const html = render(out, Date.parse('2026-10-19T14:00:00Z'), 'regular');
    assert.match(cells(html)[0], /10\/19/);
    assert.doesNotMatch(html, /10\/16/);
});

test('전체 양 끝 순위 행에도 종목별 원천 날짜 유지', () => {
    const rows = Array.from({ length: 9 }, (_, i) => filled(i % 2 ? '2026-10-16' : '2026-10-15', `A${i}`, i - 4));
    const html = render(rows);
    const ranked = [...html.matchAll(/<a class="hmXR [\s\S]*?<\/a>/g)].map(m => m[0]);
    assert.equal(ranked.length, 8);
    for (const row of ranked) {
        const index = Number(row.match(/<b class="hmXT2">A(\d)<\/b>/)![1]);
        assert.match(row, index % 2 ? /10\/16/ : /10\/15/);
    }
});
