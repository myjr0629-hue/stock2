/** Real URL bridge and subscription-management wrapper; no browser, SDK or network access. */
import assert from 'node:assert/strict';
import Module from 'node:module';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}
let native = true, fails = false, popup: object | null = null, popupThrows = false;
const nativeUrls: string[] = [], fallbackUrls: string[] = [];
const g = globalThis as any;
g.window = { open: (url: string) => {
  fallbackUrls.push(url);
  if (popupThrows) throw new Error('offline');
  return popup;
} };
g.document = { documentElement: { classList: { contains: () => false } } };
mock('@capacitor/core', { Capacitor: { isNativePlatform: () => native, getPlatform: () => native ? 'android' : 'web' } });
mock('@capacitor/browser', { Browser: { open: async ({ url }: { url: string }) => {
  nativeUrls.push(url);
  if (fails) throw new Error('offline');
} } });
const bridgePath = require.resolve('../src/lib/native/capacitorBridge');
function load() {
  delete require.cache[bridgePath];
  nativeUrls.length = 0; fallbackUrls.length = 0;
  return require(bridgePath);
}
let count = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn(); count++; console.log(`  ✓ ${name}`);
}
(async () => {
  const url = 'https://play.google.com/redeem';
  await test('네이티브 Browser.open 성공만 opened · 폴백 호출 없음', async () => {
    assert.equal(await load().openExternalUrl(url), 'opened');
    assert.deepEqual(nativeUrls, [url]); assert.deepEqual(fallbackUrls, []);
  });
  for (const isNative of [true, false]) {
    for (const result of ['null', 'object', 'throw']) {
      await test(`${isNative ? '네이티브 실패' : '웹'}: 폴백 ${result}는 열기 성공이 아님 · 기존 URL 1회 전달`, async () => {
        native = isNative; fails = true;
        popup = result === 'object' ? {} : null; popupThrows = result === 'throw';
        const bridge = load();
        if (popupThrows) await assert.rejects(bridge.openExternalUrl(url), /offline/);
        else assert.equal(await bridge.openExternalUrl(url), popup ? 'unconfirmed' : 'failed');
        assert.deepEqual(nativeUrls, isNative ? [url] : []);
        assert.deepEqual(fallbackUrls, [url]);
      });
    }
  }
  await test('구독 관리 호출자는 기존 Promise<void>·스토어 URL·폴백 동작 유지', async () => {
    native = true; fails = true; popup = null; popupThrows = false; load();
    const wrapper = require.resolve('../src/lib/app/subscriptionManagement');
    delete require.cache[wrapper];
    const { openSubscriptionManagement } = require(wrapper);
    assert.equal(await openSubscriptionManagement('APP_STORE'), undefined);
    assert.equal(await openSubscriptionManagement('PLAY_STORE'), undefined);
    assert.equal(await openSubscriptionManagement(), undefined);
    assert.deepEqual(fallbackUrls, [
      'https://apps.apple.com/account/subscriptions',
      'https://play.google.com/store/account/subscriptions',
      'https://play.google.com/store/account/subscriptions',
    ]);
    assert.deepEqual(nativeUrls, fallbackUrls);
  });
  console.log(`\n✅ externalUrl: ${count}건 통과`);
})().catch((error) => { console.error(error); process.exit(1); });
