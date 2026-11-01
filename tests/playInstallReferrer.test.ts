import assert from 'node:assert/strict';
import Module from 'node:module';
import { NextRequest } from 'next/server';
import { installUrl } from '../src/lib/giftShare/config';
import { playUrlWithReferrer } from '../src/lib/marketing/storeRedirect';

const nsPath = require.resolve('next/server');
const ns = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...ns, after: () => {} } } as Module;
globalThis.fetch = async () => { throw new Error('External requests forbidden'); };
const route = require('../src/app/app/route');
const campaignRoute = require('../src/app/api/gift/campaign/route');
const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36';
const headers = { 'user-agent': ua, 'accept-language': 'ko', origin: 'https://www.signumhq.com', 'sec-fetch-site': 'same-origin' };
const request = (path: string) => new NextRequest(`https://www.signumhq.com${path}`, { headers });
const ref = (url: string) => new URL(url).searchParams.get('referrer');
const encoded = (source: string, medium: string, campaign: string) => encodeURIComponent(`utm_source=${source}&utm_medium=${medium}&utm_campaign=${campaign}`);

(async () => {
  process.env.GIFT_SHARE_ENABLED = '1';
  let response = await route.GET(request('/app?camp=weekend-1101&from=PPOMPPU-test'));
  assert.ok((await response.text()).includes(encoded('ppomppu_test', 'campaign', 'weekend-1101')));
  response = await route.GET(request(`/app?gift=${'a'.repeat(43)}&from=FRIEND-test`));
  assert.ok((await response.text()).includes(encoded('friend_test', 'gift', 'gift')));
  response = await campaignRoute.POST(new NextRequest('https://www.signumhq.com/api/gift/campaign', {
    method: 'POST', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ camp: 'weekend-1101', from: 'PPOMPPU-test', l: 'ko' }),
  }));
  assert.ok((await response.text()).includes(encoded('ppomppu_test', 'campaign', 'weekend-1101')));
  delete process.env.GIFT_SHARE_ENABLED;
  response = await route.GET(request('/app?camp=weekend-1101&from=PPOMPPU-test'));
  assert.equal(ref(response.headers.get('location')!), 'utm_source=ppomppu_test&utm_medium=smartlink&utm_campaign=weekend-1101');
  response = await route.GET(request('/app?from=home'));
  assert.equal(ref(response.headers.get('location')!), 'utm_source=home&utm_medium=smartlink&utm_campaign=signumhq_web');
  assert.equal(ref(installUrl('android', { from: 'bad&500=1', campaign: 'weekend-1101' })), 'utm_source=gift&utm_medium=campaign&utm_campaign=weekend-1101');
  assert.equal(ref(installUrl('android', { from: 'a'.repeat(25) })), 'utm_source=gift&utm_medium=gift&utm_campaign=gift');
  assert.equal(ref(playUrlWithReferrer('https://play.google.com/store/apps/details?id=x', 'ok', 'signum', 'smartlink', undefined, 'x&evil=1')), 'utm_source=ok&utm_medium=smartlink&utm_campaign=signumhq_web');
  assert.equal(playUrlWithReferrer('https://play.google.com/store/apps/details?id=x', 'ok&evil=1'), 'https://play.google.com/store/apps/details?id=x');
  assert.equal(installUrl('ios', { from: 'home', campaign: 'weekend-1101' }), installUrl('ios'));
  console.log('Play install referrer tests passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
