/** Offline component lifecycle regression: no browser, native SDK, or network. */
import assert from 'node:assert/strict';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const effects: Array<() => (() => void) | undefined> = [];
let view: any = null;
mock('react', {
  useEffect: (fn: typeof effects[number]) => effects.push(fn),
  useRef: (value: unknown) => ({ current: value }),
  useState: () => [null, (value: unknown) => { view = value; }],
  useCallback: (fn: unknown) => fn, useId: () => 'test',
});
mock('../src/components/app/ProPaywall.module.css', {});
mock('../src/components/app/GiftAnnounceSheet.module.css', {});
mock('../src/components/app/watchlist/BottomSheet', {});
mock('../src/hooks/useBannerSuppression', {});
mock('../src/lib/app/funnel', { trackFunnel: () => {} });
mock('../src/lib/app/subscriptionManagement', {});
let native: ((state: { isActive: boolean }) => void) | undefined;
mock('@capacitor/app', { App: { addListener: async (_event: string, listener: typeof native) => {
  native = listener; return { remove: async () => { native = undefined; } };
} } });
const now = Date.now();
const info = (willRenew: boolean) => ({ entitlements: { active: { pro: {
  isActive: true, willRenew, periodType: 'TRIAL', store: 'APP_STORE', ownershipType: 'PURCHASED',
  productIdentifier: 'offline-product', latestPurchaseDate: new Date(now - 86400000).toISOString(), expirationDate: new Date(now + 86400000).toISOString(),
} } } });
let snapshot = { customerInfo: info(true), platform: 'ios' };
let loads = 0, resumes = 0, verifies = 0, used = false;
let pending: ((value: typeof snapshot) => void) | undefined;
let defer = false;
let serviceGeneration = 0;
mock('../src/services/trialRenewalOff', {
  beginTrialRenewalOffEntry: () => { serviceGeneration++; used = false; },
  loadFreshTrialRenewalOff: async () => { loads++; return snapshot; },
  refreshTrialRenewalOffOnResume: () => { resumes++; serviceGeneration++; used = false; },
  verifyTrialRenewalOff: () => {
    if (used) return null;
    used = true; verifies++;
    const generation = serviceGeneration;
    return { result: defer ? new Promise((resolve) => { pending = resolve; }) : Promise.resolve(snapshot), release: () => { if (generation === serviceGeneration) used = false; } };
  },
});
const events = new Map<string, () => void>();
let modal = false, observer: (() => void) | undefined;
class FakeObserver {
  constructor(fn: () => void) { observer = fn; }
  observe() {} disconnect() { observer = undefined; }
}
const doc = {
  visibilityState: 'visible', documentElement: {},
  querySelector: () => modal ? {} : null,
  addEventListener: (event: string, fn: () => void) => { events.set(event, fn); },
  removeEventListener: (event: string) => { events.delete(event); },
};
Object.assign(globalThis, { document: doc, MutationObserver: FakeObserver, localStorage: { getItem: () => null }, location: { search: '' } });
const source = readFileSync('src/components/app/TrialRenewalOffNotice.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exportsForTest: Record<string, any> = {};
const testRequire = (name: string) => require(name.startsWith('@/') ? `../src/${name.slice(2)}` : name.startsWith('./') ? `../src/components/app/${name.slice(2)}` : name);
vm.runInThisContext('(function(exports, require) {' + compiled + '\n})')(exportsForTest, testRequire);
const { TrialRenewalOffNotice } = exportsForTest;
async function main() {
  TrialRenewalOffNotice({ locale: 'ko' });
  const cleanup = effects[0](); await tick();
  assert.equal(view, null); assert.equal(loads, 1); assert.equal(verifies, 0);
  native!({ isActive: false });
  snapshot = { customerInfo: info(false), platform: 'ios' };
  native!({ isActive: true }); events.get('app:resume')?.(); events.get('visibilitychange')?.(); await tick();
  assert.ok(view); assert.equal(resumes, 1); assert.equal(loads, 2); assert.equal(verifies, 1);
  cleanup?.();

  view = null; used = false; defer = true;
  TrialRenewalOffNotice({ locale: 'ko' });
  const cleanup2 = effects[1](); await tick();
  assert.ok(pending); modal = true; pending!(snapshot); pending = undefined; await tick();
  assert.equal(view, null); assert.ok(observer); assert.equal(used, false);
  defer = false; modal = false; observer!(); await tick();
  assert.ok(view); assert.equal(verifies, 3);
  cleanup2?.();

  view = null; used = false; defer = true;
  TrialRenewalOffNotice({ locale: 'ko' });
  const cleanup3 = effects[2](); await tick();
  doc.visibilityState = 'hidden'; events.get('visibilitychange')?.();
  pending!(snapshot); pending = undefined; await tick();
  assert.equal(view, null); assert.equal(used, false);
  defer = false; doc.visibilityState = 'visible'; events.get('visibilitychange')?.();
  native!({ isActive: true }); events.get('app:resume')?.(); await tick();
  assert.ok(view); assert.equal(resumes, 2); assert.equal(verifies, 5);
  cleanup3?.();
  view = null; defer = true;
  TrialRenewalOffNotice({ locale: 'ko' });
  const cleanup4 = effects[3](); await tick();
  const oldResult = pending!;
  cleanup4?.();
  TrialRenewalOffNotice({ locale: 'ko' });
  const cleanup5 = effects[4](); await tick();
  const newResult = pending!;
  assert.notEqual(newResult, oldResult);
  oldResult(snapshot); await tick();
  assert.equal(view, null); assert.equal(used, true);
  newResult(snapshot); await tick();
  assert.ok(view); cleanup5?.();
  view = null; defer = true;
  TrialRenewalOffNotice({ locale: 'ko' });
  const cleanup6 = effects[5](); await tick();
  const beforeResume = pending!;
  doc.visibilityState = 'hidden'; events.get('visibilitychange')?.();
  doc.visibilityState = 'visible'; events.get('visibilitychange')?.(); await tick();
  const afterResume = pending!;
  assert.notEqual(afterResume, beforeResume);
  beforeResume(snapshot); await tick();
  assert.equal(view, null); assert.equal(used, true);
  afterResume(snapshot); await tick();
  assert.ok(view); cleanup6?.();
  console.log('trialRenewalOffResume: resume refresh, modal and background interruptions passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
