import assert from 'node:assert/strict';
import Module from 'node:module';
import { NextRequest } from 'next/server';

const nsPath = require.resolve('next/server');
const ns = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...ns, after: () => {} } } as Module;
globalThis.fetch = async () => { throw new Error('External requests forbidden'); };
const route = require('../src/app/app/route');
const campaignRoute = require('../src/app/api/gift/campaign/route');
const claim = require('../src/app/api/gift/claim/route');
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36';
const desktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36';
const headers = { 'user-agent': android, 'accept-language': 'ko', origin: 'https://www.signumhq.com', 'sec-fetch-site': 'same-origin' };
const req = (path: string, ua = android) => new NextRequest(`https://www.signumhq.com${path}`, { headers: { ...headers, 'user-agent': ua } });
const ref = (url: string) => new URL(url).searchParams.get('referrer');
const encoded = (source: string, medium: string, camp: string) => encodeURIComponent(`utm_source=${source}&utm_medium=${medium}&utm_campaign=${camp}`);

async function main() {
  let failures = 0;
  const test = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); console.log(`PASS ${name}`); } catch (err) { failures++; console.error(`FAIL ${name}: ${err}`); }
  };
  await test('campaign without valid source', async () => {
    delete process.env.GIFT_SHARE_ENABLED;
    for (const from of ['', '&from=bad%26value']) {
      const r = await route.GET(req(`/app?camp=weekend-1101${from}`));
      assert.equal(ref(r.headers.get('location')!), 'utm_source=direct&utm_medium=smartlink&utm_campaign=weekend-1101');
    }
  });
  await test('campaign form and QR preserve normalized source', async () => {
    process.env.GIFT_SHARE_ENABLED = '1';
    for (const source of ['SHARE-test', 'gift']) {
      const normalized = source === 'gift' ? 'gift' : 'share_test';
      const path = `/app?camp=weekend-1101&from=${source}&l=ko`;
      const html = await (await route.GET(req(path))).text();
      assert.ok(html.includes(`name="from" value="${normalized}"`));
      const pc = await (await route.GET(req(path, desktop))).text();
      assert.ok(pc.includes(`&amp;from=${normalized}&amp;l=ko&amp;via=qr`));
      const result = await campaignRoute.POST(new NextRequest('https://www.signumhq.com/api/gift/campaign', { method: 'POST', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ camp: 'weekend-1101', from: normalized, l: 'ko' }) }));
      assert.ok((await result.text()).includes(encoded(normalized, 'campaign', 'weekend-1101')));
    }
  });
  await test('gift form fallback preserves source', async () => {
    process.env.GIFT_SHARE_ENABLED = '1';
    const html = await (await route.GET(req(`/app?gift=${'a'.repeat(43)}&from=FRIEND-test`))).text();
    const action = html.match(/<form method="post" action="([^"]+)"/)![1].replace(/&amp;/g, '&');
    const r = await claim.POST(new NextRequest(new URL(action, 'https://www.signumhq.com'), { method: 'POST', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ gift: 'a'.repeat(43) }) }));
    assert.equal(ref(r.headers.get('location')!), 'utm_source=friend_test&utm_medium=gift&utm_campaign=gift');
  });
  if (failures) process.exitCode = 1;
}
main().catch(err => { console.error(err); process.exitCode = 1; });
