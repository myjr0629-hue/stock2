/** Offline interaction test: neither the store nor the network is contacted. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}
const hits: string[] = [];
let done = 0;
const effects: Array<() => void | (() => void)> = [];
const listeners = new Set<() => void>();
const storage = new Map<string, string>();
let writes = 0;
const doc = { visibilityState: 'visible', addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
Object.assign(globalThis, { document: doc, localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { writes++; storage.set(key, value); } } });
mock('react/jsx-runtime', { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }), Fragment: 'fragment' });
mock('react', { useRef: (current: unknown) => ({ current }), useEffect: (fn: () => void) => effects.push(fn) });
mock('../src/components/app/ProPaywall.module.css', { default: {} });
mock('../src/components/app/watchlist/BottomSheet', { BottomSheet: () => null, afterSheetHistory: () => Promise.resolve() });
mock('../src/lib/app/funnel', { trackFunnel: (stage: string) => hits.push(stage) });
const source = readFileSync('src/components/app/CancelReasonSheet.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exportsForTest: Record<string, any> = {};
const testRequire = (name: string) => require(name.startsWith('@/') ? `../src/${name.slice(2)}` : name.startsWith('./') ? `../src/components/app/${name.slice(2)}` : name);
vm.runInThisContext('(function(exports, require) {' + compiled + '\n})')(exportsForTest, testRequire);
function buttons(preview = false) {
  const root = exportsForTest.CancelReasonSheet({ locale: 'ko', preview, onDone: () => { done++; } });
  const sheet = root.props.children;
  const contents = sheet.props.children({ titleId: 'title' });
  return { sheet, choices: contents.props.children[1], skip: contents.props.children[2] };
}
const first = buttons();
// An abandoned render never runs mount effects and must leave the gate available.
assert.equal(writes, 0);
effects.length = 0;
doc.visibilityState = 'hidden';
buttons();
const hiddenCleanup = effects.splice(0).map((effect) => effect());
hiddenCleanup.forEach((fn) => fn?.());
doc.visibilityState = 'visible';
listeners.forEach((listener) => listener());
assert.equal(writes, 0);
hits.length = 0;
const mounted = buttons();
const cleanup = effects.splice(0).map((effect) => effect());
assert.equal(writes, 1);
listeners.forEach((listener) => listener());
assert.equal(writes, 1);
cleanup.forEach((fn) => fn?.());
mounted.skip.props.onClick(); mounted.sheet.props.onClose();
assert.deepEqual(hits, ['cancel_reason:show', 'cancel_reason:skip']);
assert.equal(done, 1);
const second = buttons(); effects.splice(0).forEach((effect) => effect()); second.choices[0].props.onClick();
assert.equal(hits.at(-1), 'cancel_reason:price'); assert.equal(done, 2);
const before = hits.length;
const preview = buttons(true); effects.splice(0).forEach((effect) => effect()); preview.choices[4].props.onClick();
assert.equal(hits.length, before); assert.equal(done, 3);
console.log('cancelReasonSheet: skip, selection, duplicate action and preview passed');
