import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import type { ConfirmedEarnings } from '../src/lib/earningsConfirmed';
import { atmReceiptExpectedPct, parseRecord, sameExpected, type ActualsRecord, type ExpectedSnap } from '../src/lib/earnings/earningsActuals';
import { buildEarningsReceipts } from '../src/lib/earnings/earningsReceipts';
import { aggregateScorecard } from '../src/lib/earnings/earningsScorecard';
import { NOW, record } from './earningsScorecardFixture';

let n = 0;
const test = (name: string, fn: () => void) => { fn(); n++; console.log(`✓ ${name}`); };
const week = '2026-10-12';
const schedule = (ticker: string): ConfirmedEarnings => ({ ticker, date: '2026-10-13', hour: 'bmo',
  sourceKind: 'company-pr', sourceUrl: 'https://example.com/ir', announcedOn: '2026-10-01',
  verifiedAt: '2026-10-01T12:00:00Z', quote: '합성 일정' });
const snap = (r: ActualsRecord, fields: Partial<ExpectedSnap>): ActualsRecord => ({ ...r, expected: { ...r.expected!, ...fields } });

// 수정 전 실제 함수를 같은 입력에 실행한다. 디스크·운영 저장소에 기록하지 않는다.
function before<T>(name: string): T {
  const path = `src/lib/earnings/${name}.ts`;
  const source = execFileSync('git', ['show', `df149853d0574ee5209ea8e02cd23eb0710f1bd5:${path}`], { encoding: 'utf8' });
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, require: createRequire(resolve(path)) });
  return exports as T;
}
const oldReceipts = before<typeof import('../src/lib/earnings/earningsReceipts')>('earningsReceipts').buildEarningsReceipts;
const oldScorecard = before<typeof import('../src/lib/earnings/earningsScorecard')>('earningsScorecard').aggregateScorecard;

test('재현: 분리 7.7%·ATM 8.6%·실제 8%는 영수증과 성적표 모두 범위 안', () => {
  const r = snap(record('REPRO', 7.7, 8), { method: 'event-split', straddlePct: 8.6, straddle: 8.6 });
  assert.equal(oldReceipts(week, [schedule(r.ticker)], [r], NOW).rows[0].beyond, true);
  const receipt = buildEarningsReceipts(week, [schedule(r.ticker)], [r], NOW);
  const scorecard = aggregateScorecard(week, [r], NOW);
  assert.equal(receipt.rows[0].expected?.pct, 8.6); assert.equal(receipt.rows[0].beyond, false);
  assert.equal(receipt.summary.within, 1); assert.equal(receipt.summary.outside, 0);
  assert.equal(scorecard.rows[0].expectedPct, 8.6); assert.equal(scorecard.rows[0].beyond, false);
  assert.equal(r.expected!.pct, 7.7, '원본 분리값 보존'); assert.equal(r.expected!.method, 'event-split');
});

test('method·별도 ATM 값은 파서 두 번과 JSON 왕복 뒤에도 유지, 잘못된 method는 미확인', () => {
  for (const method of ['weekly', 'monthly', 'event-split'] as const) {
    const r = snap(record(), { method, straddlePct: 3 });
    const parsed = parseRecord(JSON.parse(JSON.stringify(parseRecord(r))))!;
    assert.equal(parsed.expected!.method, method); assert.equal(parsed.expected!.straddlePct, 3);
  }
  for (const method of [null, '', 'future', 1]) {
    const r = { ...record(), expected: { ...record().expected!, method } };
    const parsed = parseRecord(parseRecord(r))!;
    assert.equal(parsed.expected!.method, null); assert.equal(atmReceiptExpectedPct(parsed.expected!), null);
  }
  const legacy = parseRecord(parseRecord(record()))!;
  assert.equal(legacy.expected!.method, undefined); assert.equal(atmReceiptExpectedPct(legacy.expected!), 3);
  assert.equal(atmReceiptExpectedPct({ ...legacy.expected!, method: 'event-split', straddle: 1e308, spot: 1e-308 }), null);
});

test('숫자가 같아도 method·ATM 근거 변경은 저장 대상, capturedAt만 변경하면 동일', () => {
  const e = record().expected!;
  assert.equal(sameExpected(e, { ...e, capturedAt: e.capturedAt + 1 }), true);
  for (const change of [{ method: 'monthly' as const }, { straddlePct: 3 }, { straddle: 3.1 }, { spot: 101 }, { strike: 101 }]) {
    assert.equal(sameExpected(e, { ...e, ...change }), false);
  }
});

const mixed = [
  snap(record('A01', 6.2, 6), { method: 'weekly', straddlePct: 6.2 }),
  snap(record('A02', 8.6, 8), { method: 'monthly', straddlePct: 8.6 }),
  snap(record('A03', 7.7, 8), { method: 'event-split', straddlePct: 8.6, straddle: 8.6 }),
  snap(record('A04', 7.7, 8), { method: 'event-split', straddle: 8.6 }),
  snap(record('A05', 7.7, 8), { method: 'event-split', straddle: null }),
  record('A06', 8.6, 8),
  snap(record('A07', 7.7, 8), { straddle: 8.6 }),
  snap(record('A08', 7.7, 8), { straddle: null }),
  { ...record('A09', 8.6, 8), expected: { ...record('A09', 8.6).expected!, method: 'future' } },
  snap(record('A10', 8.6, 8), { method: null }),
  snap(record('A11', 6.2, 6), { method: 'weekly', straddle: null, spot: null }),
  snap(record('A12', 7.7, 8), { method: 'event-split', straddlePct: null, straddle: 8.6 }),
  snap(record('A13', 8.6, 8), { method: 'monthly', straddlePct: 7.7 }),
  snap(record('A14', 8.6, -8.6), { method: 'event-split', straddlePct: 8.6 }),
  // 센트 반올림 원금액의 재계산보다, 분리 전 직접 보존한 ATM 비율이 우선이다.
  snap(record('A15', 7.7, 8.65), { method: 'event-split', straddlePct: 8.6, straddle: 8.65 }),
];
test('15개 혼재 기록: 정의 불명·충돌 7개 판정 제외, 모든 행·실제 가격 유지', () => {
  const entries = mixed.map(r => schedule(r.ticker));
  const receipts = buildEarningsReceipts(week, entries, mixed, NOW);
  const scorecard = aggregateScorecard(week, mixed, NOW);
  assert.deepEqual(receipts.summary, { total: 15, pre: 8, within: 7, outside: 1, backfilled: 0, unverified: 0, missing: 7 });
  assert.equal(receipts.rows.length, 15); assert.ok(receipts.rows.every(r => r.actual != null));
  const excluded = receipts.rows.filter(r => r.beyond == null).map(r => r.ticker);
  assert.deepEqual(excluded, ['A05', 'A07', 'A08', 'A09', 'A10', 'A12', 'A13']);
  for (const r of receipts.rows.filter(r => r.beyond == null)) assert.deepEqual(r.issues, ['invalid_expected']);
  assert.equal(scorecard.summary.n, 8); assert.equal(scorecard.summary.withinCount, 7); assert.equal(scorecard.summary.beyondCount, 1);
  assert.deepEqual(scorecard.rows.map(r => [r.ticker, r.expectedPct, r.beyond]),
    receipts.rows.filter(r => r.beyond != null).map(r => [r.ticker, r.expected!.pct, r.beyond]));
  assert.equal(receipts.rows[14].expected!.pct, 8.6); assert.equal(receipts.rows[14].beyond, true);
});

test('수정 전후 혼재 입력 비교: 수치 교정 3개·판정 반전 2개·제외 7개', () => {
  const entries = mixed.map(r => schedule(r.ticker));
  const old = oldReceipts(week, entries, mixed, NOW), next = buildEarningsReceipts(week, entries, mixed, NOW);
  const changes = next.rows.filter((r, i) => r.expected?.pct !== old.rows[i].expected?.pct || r.beyond !== old.rows[i].beyond);
  assert.equal(changes.length, 10);
  assert.equal(changes.filter(r => r.expected != null).length, 3);
  assert.equal(next.rows.filter((r, i) => r.beyond === false && old.rows[i].beyond === true).length, 2);
  const previousCard = oldScorecard(week, mixed, NOW);
  assert.equal(previousCard.summary.n, 15); assert.equal(previousCard.summary.withinCount, 8); assert.equal(previousCard.summary.beyondCount, 7);
  for (const r of changes) {
    const prev = old.rows.find(p => p.ticker === r.ticker)!;
    console.log(`변화 ${r.ticker}: 예상 ${prev.expected?.pct ?? '제외'} → ${r.expected?.pct ?? '제외'}, 범위 밖 ${prev.beyond} → ${r.beyond ?? '판정 제외'}`);
  }
});

test('기존 보강 입력 6종목: 예상 수치·판정 변화 0개(운영 실측 아님)', () => {
  // 원래 보강 스크립트의 정적 ROWS만 읽는다. 스크립트 실행·운영 쓰기는 없다.
  const source = readFileSync('scripts/earnings-actuals-seed-expected.ts', 'utf8');
  const literal = source.match(/const ROWS:[^=]+=[\s\n]*(\[[\s\S]*?\n\]);/)![1];
  const inputs = vm.runInNewContext(literal) as Array<[string, number, number, number, number]>;
  const actual: Record<string, number> = { JPM: -0.8585, JNJ: -5.7331, C: -5.6019, GS: -0.2282, UNH: -0.2008, WFC: -3.0965 };
  const records = inputs.map(([ticker, pct, strike, straddle, spot]) =>
    snap(record(ticker, pct, actual[ticker]), { strike, straddle, spot, src: 'eod-chain' }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  const entries = records.map(r => schedule(r.ticker));
  const old = oldReceipts(week, entries, records, NOW), next = buildEarningsReceipts(week, entries, records, NOW);
  assert.equal(records.length, 6);
  for (const r of next.rows) {
    const prev = old.rows.find(p => p.ticker === r.ticker)!;
    assert.equal(r.expected?.pct, prev.expected?.pct); assert.equal(r.beyond, prev.beyond);
    console.log(`기존 입력 ${r.ticker}: 예상 ${r.expected!.pct}%, ${r.beyond ? '범위 밖' : '범위 안'} (변화 없음)`);
  }
  assert.equal(next.summary.backfilled, 6); assert.equal(next.summary.pre, 0);
  const oldCard = oldScorecard(week, records, NOW), card = aggregateScorecard(week, records, NOW);
  assert.equal(card.summary.n, 6); assert.equal(card.summary.withinCount, oldCard.summary.withinCount);
  assert.equal(card.summary.beyondCount, oldCard.summary.beyondCount);
  assert.equal(card.summary.medianExpected, oldCard.summary.medianExpected);
});

console.log(`${n}개 정의 혼재·수치 변화 시험 통과`);
