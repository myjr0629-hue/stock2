import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// 실제 updatedList map 콜백을 실행한다. React 렌더·네트워크·환경 파일은 필요 없다.
const source = fs.readFileSync('src/components/LiveTickerDashboard.tsx', 'utf8');
const ast = ts.createSourceFile('LiveTickerDashboard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback: ts.Node | undefined;
function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'updatedList'
        && node.initializer && ts.isCallExpression(node.initializer)) callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(callback, 'related updatedList 콜백');
const compiled = ts.transpileModule(`module.exports = ${callback.getText(ast)};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helper = source.includes("from '@/lib/relatedRowMerge'")
    ? require('../src/lib/relatedRowMerge').mergeRelatedRow : undefined;
function merge(oldItem: any, newItem: any) {
    const mod = { exports: undefined as any };
    new Function('module', 'prev', 'mergeRelatedRow', compiled)(mod, { topRelated: oldItem ? [oldItem] : [] }, helper);
    return mod.exports(newItem);
}

const before0400 = Date.parse('2026-10-26T07:59:00Z');
const after0400 = Date.parse('2026-10-26T08:01:00Z');
const oldRow = { ticker: 'XYZ', price: 100.56, change: 0.56, prevClose: 100, logo: null,
    session: '2026-10-23', asOf: after0400 };
const lateRow = { ...oldRow, price: 100.56, change: -0.44, prevClose: 101,
    asOf: before0400, closeSession: '2026-10-23' };
const values = (row: any) => [row.price, row.change, row.prevClose];

// ① 04:00 이후 새 분모 100을 03:59 응답의 101로 덮으면 +0.56%가 -0.44%가 된다.
const late = merge(oldRow, lateRow);
assert.deepEqual(values(late), [100.56, 0.56, 100], '늦게 도착한 과거 행은 가격·등락·분모를 덮지 않는다');
assert.equal(Math.round((late.price - late.prevClose) / late.prevClose * 10000) / 100, 0.56);
assert.equal(late.asOf, after0400, '값을 선택한 행의 시각 유지');
assert.equal(late.closeSession, undefined, '거절한 공식 행의 표식도 섞지 않는다');
assert.deepEqual(values(merge(oldRow, { ...lateRow, price: 99, session: '2026-10-22' })), values(oldRow), '과거 가격도 거절');
assert.equal(merge(oldRow, { ...lateRow, session: '2026-10-22' }).session, oldRow.session, '가격과 세션 기준을 함께 유지');
assert.deepEqual(values(merge(late, { ...lateRow, asOf: before0400 + 1000 })), values(oldRow), '연속 지연 응답에도 새 값 유지');
assert.deepEqual(values(merge(lateRow, oldRow)), values(oldRow), '새 시각 행은 채택');
assert.deepEqual(values(merge(oldRow, { ...lateRow, asOf: after0400 })), values(lateRow), '동일 시각은 기존 도착 순서 유지');

// ② 공식 보합은 결측이 아니다. 기존 -1% 대신 정확히 0%.
const falling = { ...oldRow, price: 99, change: -1, asOf: before0400 };
const flat = { ...oldRow, price: 100, change: 0, closeSession: '2026-10-23' };
assert.deepEqual(values(merge(falling, flat)), [100, 0, 100], '공식 종가 보합');
assert.deepEqual(values(merge({ ...falling, asOf: undefined }, { ...flat, asOf: undefined })), [100, 0, 100], '무시각 공식 보합도 유효');
assert.deepEqual(values(merge(oldRow, { ...flat, asOf: before0400 })), values(oldRow), '공식 표식이 있어도 더 오래된 값은 거절');
assert.deepEqual(values(merge(falling, { ...flat, closeSession: undefined })), [100, -1, 100], '비공식 0은 기존 결측 보호 유지');

// ③ ABSOLUTE FIX V2: 실패 행(price/change 0)은 기존 실시간 값을 지킨다.
for (const closeSession of [undefined, '2026-10-23']) {
    assert.deepEqual(values(merge(oldRow, { ...flat, price: 0, change: 0, prevClose: 0, closeSession,
        asOf: after0400 + 1000 })), values(oldRow), '공식 표식도 가격 0 보호를 우회할 수 없다');
}
assert.deepEqual(values(merge(oldRow, { ticker: 'XYZ', price: 0, change: 0 })), values(oldRow), '시각·분모 없는 실패 행');

// 08:01 정상 → 시각 없는 가격 0 실패 → 07:59 지연 응답에도 비교 기준을 잃지 않는다.
for (const asOf of [undefined, null]) {
    const failed = merge(oldRow, { ticker: 'XYZ', price: 0, change: 0, asOf });
    assert.equal(failed.asOf, after0400, '가격 0 실패 뒤 기존 계산 시각 유지');
    const delayed = merge(failed, lateRow);
    assert.deepEqual(values(delayed), values(oldRow), '실패 뒤 과거 행도 가격·등락·분모를 덮지 않는다');
    assert.equal(delayed.asOf, after0400, '연속 병합 뒤 계산 시각 유지');
    assert.equal(Math.round((delayed.price - delayed.prevClose) / delayed.prevClose * 10000) / 100, 0.56);
    assert.deepEqual(values(merge(failed, { ...lateRow, asOf: after0400 + 1000 })), values(lateRow), '실패 뒤 새 시각 정상 행은 채택');
}
const noTimeFailed = merge(oldRow, { ticker: 'XYZ', price: 0, change: 0 });
assert.equal(noTimeFailed.asOf, after0400, 'asOf 필드 없는 실패 행도 기존 계산 시각 유지');
assert.deepEqual(values(merge(noTimeFailed, lateRow)), values(oldRow), 'asOf 필드 없는 실패 뒤 과거 행 거절');

// ④ 과거 관문 회귀: 한쪽만 시각이 있으면 분모 보충을 막지 않는다.
for (const prevClose of [undefined, 0]) {
    const missing = { ...oldRow, prevClose };
    assert.equal(merge(missing, { ...lateRow, asOf: undefined }).prevClose, 101, '옛 행만 시각 있음: 분모 보충');
}
for (const invalid of [undefined, null, 0, -1, NaN, Infinity, '2026-10-26T08:00:00Z']) {
    assert.deepEqual(values(merge(oldRow, { ...lateRow, asOf: invalid })), values(lateRow), '새 행 시각이 없거나 잘못되면 기존 병합');
    assert.deepEqual(values(merge({ ...oldRow, asOf: invalid }, lateRow)), values(lateRow), '옛 행 시각이 없거나 잘못되면 기존 병합');
}
assert.equal(merge(oldRow, { ...flat, prevClose: undefined }).prevClose, 100, '새 행 분모 없음: 기존 분모 유지');
assert.equal(merge(oldRow, { ...flat, prevClose: 0 }).prevClose, 100, '새 행 분모 0: 기존 분모 유지');
assert.deepEqual(values(merge(undefined, flat)), values(flat), '이전 행 없음');
assert.deepEqual(values(merge({ ...oldRow, price: 0, change: 0 }, lateRow)), values(lateRow), '실패했던 이전 행은 정상 값으로 회복');
const original = structuredClone(oldRow), incoming = structuredClone(lateRow);
merge(oldRow, lateRow);
assert.deepEqual(oldRow, original, '기존 객체 불변');
assert.deepEqual(lateRow, incoming, '응답 객체 불변');
console.log('relatedRowMerge: 두 반례·가격 0·단측/잘못된 시각·분모 보충·연속 지연 응답 보호 통과');
