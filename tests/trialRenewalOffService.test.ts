/** SDK-only offline checks, no network. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

async function scenario(mode: 'success' | 'failure' | 'web') {
  const calls: string[] = [];
  const modules: Record<string, unknown> = {
    '@/services/revenueCat': { initRevenueCat: async () => true },
    '@capacitor/core': { Capacitor: { isNativePlatform: () => mode !== 'web', getPlatform: () => 'ios' } },
    '@revenuecat/purchases-capacitor': { Purchases: {
      invalidateCustomerInfoCache: async () => { calls.push('invalidate'); },
      getCustomerInfo: async () => { calls.push('customer'); if (mode === 'failure') throw new Error('offline'); return { customerInfo: { entitlements: { active: {} } } }; },
    } },
  };
  const source = readFileSync('src/services/trialRenewalOff.ts', 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports: Record<string, any> = {};
  vm.runInNewContext(compiled, { exports, require: (name: string) => modules[name], setTimeout, clearTimeout, Promise });
  const load = exports.loadFreshTrialRenewalOff as () => Promise<any>;
  if (mode === 'failure') {
    await assert.rejects(load(), /offline/);
    await assert.rejects(load(), /offline/);
    assert.deepEqual(calls, ['customer']);
  } else if (mode === 'web') {
    assert.equal(await load(), null);
    assert.deepEqual(calls, []);
  } else {
    const [first, concurrent] = await Promise.all([load(), load()]);
    assert.equal(first.platform, 'ios');
    assert.equal(concurrent, first);
    assert.equal(await load(), first);
    assert.deepEqual(calls, ['customer']);
  }
}
async function main() {
  await scenario('success'); await scenario('failure'); await scenario('web');
  console.log('trialRenewalOffService: one SDK read, failure and web passed');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
