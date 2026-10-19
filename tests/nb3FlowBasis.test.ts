/** NB3 offline replay — 기존 «LIVE FLOW» 배지 자리의 글자만 원천 기준일로 바뀌는지(새 요소 0).
 * node -r ts-node/register/transpile-only -r tsconfig-paths/register tests/nb3FlowBasis.test.ts <reg-snapshots> [integrity-sweep]
 * TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","jsx":"react-jsx"}'
 * No browser, network, env file, Redis or DB.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { optionFlowBadgeLabel, optionFlowBasisDate } from '../src/lib/app/optionFlowBasis';

const realFetch = globalThis.fetch;
globalThis.fetch = (() => { throw new Error('NB3 replay must stay offline'); }) as any;
process.on('exit', () => { globalThis.fetch = realFetch; });

const FLOW = 'src/app/[locale]/app-view/flow/page.tsx';
const source = fs.readFileSync(FLOW, 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const decls = new Map<string, ts.VariableDeclaration>();
(function visit(n: ts.Node) {
  if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && !decls.has(n.name.text)) decls.set(n.name.text, n);
  ts.forEachChild(n, visit);
})(ast);
const evaluate = (code: string, ctx: Record<string, any>) => {
  const js = ts.transpileModule(`(${code})`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext(js, { useMemo: (fn: () => any) => fn(), optionFlowBadgeLabel, ...ctx });
};
const value = (name: string, ctx: Record<string, any> = {}) => {
  const init = decls.get(name)?.initializer;
  assert.ok(init, `flow.${name} exists`);
  return evaluate(init.getText(ast), ctx);
};
const flowCopyAll = value('APP_FLOW_COPY');
// Source 칸 객체 리터럴만 떼어 평가한다 — 화면 구조(요소 수)는 손대지 않았다는 것을 함께 확인.
const sourceCellExpr = (() => {
  const i = source.indexOf('{ label: flowCopy.sourceFreshness,');
  assert.ok(i > 0, 'Source cell exists');
  const end = source.indexOf('}\n', i);
  return source.slice(i, end + 1);
})();
const sourceCell = (tickerData: any, session: string, locale: string) => {
  const flowCopy = flowCopyAll[locale];
  const effectiveSession = session;
  const opiCalculated = value('opiCalculated', { opi: 42, effectiveSession });
  const flowBasisBadge = value('flowBasisBadge', { tickerData, locale });
  return { ...evaluate(sourceCellExpr, { flowCopy, opiCalculated, flowBasisBadge }) };
};

const eod = { dataFreshness: { premium: 'EOD', volume: 'EOD', greeks: 'REALTIME', chainDate: '2026-10-16' } };

test('badge date: only the date the option values declare — never Greeks, stock session, OI date, clock', () => {
  assert.equal(optionFlowBadgeLabel(eod, 'ko'), '10/16 마감');
  assert.equal(optionFlowBadgeLabel(eod, 'ja'), '10/16 終値');
  assert.equal(optionFlowBadgeLabel(eod, 'en'), '10/16 close');
  const live = { dataFreshness: { ...eod.dataFreshness, premium: 'REALTIME', volume: 'REALTIME' } };
  assert.equal(optionFlowBadgeLabel(live, 'ko'), null);
  const mixed = { dataFreshness: { ...eod.dataFreshness, premium: 'REALTIME' } };
  assert.equal(optionFlowBadgeLabel(mixed, 'ko'), '10/16 마감', 'volume still EOD → not LIVE');
  for (const chainDate of [null, undefined, '', '2026-02-30', '2026-13-01', 1792195200000, '2026-10-16T20:00:00Z']) {
    assert.equal(optionFlowBasisDate({ dataFreshness: { premium: 'EOD', chainDate } } as any), null);
    assert.equal(optionFlowBadgeLabel({ dataFreshness: { premium: 'EOD', chainDate }, prevDate: '2026-10-15', timestampET: '2026-10-19', structure: { chainDate: '2026-10-16' } } as any, 'ko'), null);
  }
  assert.equal(optionFlowBadgeLabel(null, 'ko'), null);
  assert.equal(optionFlowBadgeLabel({}, 'ko'), null);
});

test('Source badge: same slot — LIVE FLOW when realtime, date when EOD, existing text when undated', () => {
  const live = { flow: { dataFreshness: { premium: 'REALTIME', volume: 'REALTIME', chainDate: '2026-10-19' } } };
  assert.deepEqual(sourceCell(live, 'REG', 'ko'), { label: 'Source', value: 'LIVE FLOW', color: 'var(--cyan)' });
  assert.deepEqual(sourceCell({ flow: eod }, 'REG', 'ko'), { label: 'Source', value: '10/16 마감', color: '#94a3b8' });
  assert.deepEqual(sourceCell({ flow: eod }, 'CLOSED', 'en'), { label: flowCopyAll.en.sourceFreshness, value: '10/16 close', color: '#94a3b8' });
  const undated = { flow: { dataFreshness: { premium: 'EOD', volume: 'EOD', chainDate: null } } };
  assert.equal(sourceCell(undated, 'REG', 'ko').value, 'LIVE FLOW', 'no invented date — unchanged badge');
  assert.equal(sourceCell(undated, 'CLOSED', 'ko').value, 'ESTIMATED');
  assert.equal(sourceCell({}, 'REG', 'ja').value, flowCopyAll.ja.liveSource);
});

test('no new element: engine-axes badge and other labels untouched, no date component left', () => {
  assert.ok(!source.includes('OptionFlowBasisDate'), 'no added date element');
  assert.ok(source.includes("fontWeight: 750 }}>{flowCopy.liveSource}</span>"), 'engine axes keeps the existing badge (mixed bases — no premium date there)');
  assert.ok(!fs.existsSync('src/components/app/OptionFlowBasisDate.tsx'));
  const cmd = fs.readFileSync('src/app/[locale]/app-view/cmd/page.tsx', 'utf8');
  assert.ok(!cmd.includes('optionFlowBasis'), 'cmd unchanged');
});

const snapshots = process.argv[2];
const sweep = process.argv[3];
const json = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
for (const ticker of ['NVDA', 'AAPL', 'TSLA', 'SPY', 'WTFC']) {
  test(`${ticker}: saved 23:10 KST REG ticker payload → Source badge`, { skip: !snapshots }, () => {
    const payload = json(path.join(snapshots, `ticker-${ticker}-2310.json`));
    const before = JSON.stringify(payload);
    const d = payload.flow?.dataFreshness ?? {};
    const shouldDate = !(d.premium === 'REALTIME' && d.volume === 'REALTIME') && typeof d.chainDate === 'string';
    for (const session of ['REG', 'CLOSED']) {
      const cell = sourceCell(payload, session, 'ko');
      if (shouldDate) assert.equal(cell.value, `${Number(d.chainDate.slice(5, 7))}/${Number(d.chainDate.slice(8, 10))} 마감`);
      else assert.equal(cell.value, session === 'CLOSED' ? 'ESTIMATED' : 'LIVE FLOW');
      console.log(`  ${ticker} ${session}: premium=${d.premium} volume=${d.volume} chainDate=${d.chainDate} → «${cell.value}»`);
    }
    assert.equal(JSON.stringify(payload), before, 'replay never changes source values');
  });
}
for (const dir of ['live', 'closed']) {
  for (const ticker of ['NVDA', 'AAPL', 'TSLA', 'SPY', 'MSFT', 'WTFC', 'FITB']) {
    test(`${ticker}: sweep ${dir} operating API → Source badge`, { skip: !sweep }, () => {
      const f = path.join(sweep, dir, `flow_${ticker}`, 'api.json');
      if (!fs.existsSync(f)) return;
      const rows = json(f);
      const row = rows.filter((r: any) => r.status === 200 && r.url.includes('/api/live/ticker?')).at(-1);
      if (!row) return;
      const payload = typeof row.body === 'string' ? JSON.parse(row.body) : row.body;
      const date = optionFlowBasisDate(payload.flow);
      const cell = sourceCell(payload, payload.session, 'ko');
      if (date) assert.match(cell.value, /^\d{1,2}\/\d{1,2} 마감$/);
      else assert.ok(['LIVE FLOW', 'ESTIMATED'].includes(cell.value));
      console.log(`  ${ticker} ${dir}(${payload.session}): chainDate=${payload.flow?.dataFreshness?.chainDate ?? null} → «${cell.value}»`);
    });
  }
}
