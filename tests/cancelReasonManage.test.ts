/** Offline: exercise the settings completion handler in the same click stack. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync('src/app/[locale]/app-view/settings/page.tsx', 'utf8');
const tree = ts.createSourceFile('settings.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler = '';
function visit(node: ts.Node) {
  if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'onDone' && node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && node.parent.parent.getText(tree).startsWith('<CancelReasonSheet')) {
    handler = node.initializer.expression.getText(tree);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(handler);
const js = ts.transpileModule(`result = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
for (const native of [false, true]) for (const mode of ['manage', 'preview']) for (const response of ['choice', 'skip']) {
  const calls: string[] = [];
  let queued: (() => void) | undefined;
  const context = { result: undefined as unknown as () => void, reasonMode: mode, isNativeApp: native,
    setReasonMode: () => calls.push('close'),
    openSubscriptionManagement: () => { calls.push('open'); return Promise.resolve(); },
    openAfterCancelReason: (action: () => void) => { calls.push('wait'); queued = action; },
  };
  vm.runInNewContext(js, context);
  context.result(); // Called directly from either survey button's onClick.
  if (mode === 'preview') assert.deepEqual(calls, ['close'], response);
  else if (native) {
    assert.deepEqual(calls, ['close', 'wait'], response);
    queued!(); assert.deepEqual(calls, ['close', 'wait', 'open'], response);
  } else assert.deepEqual(calls, ['close', 'open'], response);
}
console.log('cancelReasonManage: web immediate, native delayed, preview and both responses passed');
