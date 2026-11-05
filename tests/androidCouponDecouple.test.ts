/** /app 쿠폰 분기 — Redis와 after를 메모리 대역으로 대체한다. */
import assert from 'node:assert/strict';
import Module from 'node:module';

let stock = 1;
let reads = 0;
let fail = false;
const redisPath = require.resolve('@upstash/redis');
require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: { Redis: class {
  async scard(key: string) { reads++; assert.equal(key, 'promo:pv:play:pool'); if (fail) throw new Error('offline'); return stock; }
} } } as unknown as Module;
const nsPath = require.resolve('next/server');
const ns = require(nsPath);
require.cache[nsPath] = { id: nsPath, filename: nsPath, loaded: true, exports: { ...ns, after: () => {} } } as unknown as Module;
process.env.VERCEL_ENV = 'preview';
process.env.COUPON_ANDROID = '1';
process.env.UPSTASH_REDIS_REST_URL = 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
Date.now = () => Date.parse('2026-11-05T12:00:00Z');
const { NextRequest } = require('next/server');
const { GET } = require('../src/app/app/route');
const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36';
const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1';
const request = (path: string, ua: string) => new NextRequest(`https://www.signumhq.com${path}`, { headers: { 'user-agent': ua, 'accept-language': 'ko-KR' } });
(async () => {
  for (const path of ['/app?from=threads&code=THREADSPRO', '/app?from=home', '/app?from=home&code=ABCD1234']) {
    const r = await GET(request(path, android));
    assert.equal(r.status, 200); assert.equal(r.headers.get('vary'), 'User-Agent');
    assert.match(await r.text(), /id="claim"/);
  }
  stock = 0;
  for (const path of ['/app?from=threads&code=THREADSPRO', '/app?from=home']) {
    const r = await GET(request(path, android));
    assert.equal(r.status, 302); assert.match(r.headers.get('location'), /^https:\/\/play\.google\.com\/store\/apps\/details/);
  }
  const inApp = `${android} KAKAOTALK 2410430`;
  assert.equal((await GET(request('/app?from=home', inApp))).status, 302);
  fail = true;
  assert.equal((await GET(request('/app?from=home', android))).status, 302);
  fail = false; stock = 1;
  process.env.COUPON_ANDROID = '0';
  const beforeOff = reads;
  assert.equal((await GET(request('/app?from=home', android))).status, 302);
  assert.equal(reads, beforeOff, '플래그 꺼짐이면 조회하지 않는다');
  process.env.COUPON_ANDROID = '1';
  const before = reads;
  let r = await GET(request('/app?from=threads&code=THREADSPRO', ios));
  assert.equal(r.status, 302); assert.match(r.headers.get('location'), /apps\.apple\.com\/redeem.*code=THREADSPRO/);
  r = await GET(request('/app?from=home', ios));
  assert.equal(r.status, 302); assert.match(r.headers.get('location'), /apps\.apple\.com\/app\//);
  r = await GET(request('/app?from=home&code=SIGNUMPRO', ios));
  assert.equal(r.status, 200); assert.match(await r.text(), /id="go"/);
  assert.equal(reads, before, 'iOS는 재고를 조회하지 않는다');
  console.log('androidCouponDecouple: 통과');
})().catch((err: unknown) => { console.error(err); process.exitCode = 1; });
