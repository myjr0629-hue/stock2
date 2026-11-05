/**
 * /app 안드로이드 쿠폰 화면 — 링크의 애플 코드 생존과 분리(feat/android-coupon-decouple-1105).
 *   ① 끝난 애플 코드·코드 없는 링크도, 풀에 번호가 있으면 쿠폰 화면
 *   ② 풀이 비어도 이미 받은 사람(쿠키 sg_cpn · 같은 IP 24시간 번호)은 쿠폰 화면 재열람
 *   ③ 소진·조회 실패·설정 없음·봇·플래그 꺼짐 → 예전 동작 그대로(크롬 Play 302 · 앱 안 브라우저 intent 안내 화면)
 *   ④ 살아 있는 애플 코드 링크(안드·아이폰)·아이폰·PC 는 조회 없이 예전 그대로
 *   ⑤ 배정 API 가 번호를 주면 sg_cpn 쿠키(값 1)를 남긴다
 * Upstash·after 는 메모리 대역.
 */
import assert from 'node:assert/strict';
import Module from 'node:module';

const sets = new Map<string, Set<string>>();
const strings = new Map<string, string>();
let reads = 0;
let fail = false;
class FakeRedis {
  private op<T>(fn: () => T): Promise<T> { reads++; if (fail) return Promise.reject(new Error('offline')); return Promise.resolve(fn()); }
  scard(k: string) { return this.op(() => sets.get(k)?.size ?? 0); }
  exists(k: string) { return this.op(() => (strings.has(k) ? 1 : 0)); }
  get(k: string) { return this.op(() => strings.get(k) ?? null); }
  spop(k: string) { return this.op(() => { const s = sets.get(k); if (!s || !s.size) return null; const v = [...s][0]; s.delete(v); return v; }); }
  sadd(k: string, m: string) { return this.op(() => { const s = sets.get(k) || new Set<string>(); s.add(m); sets.set(k, s); return 1; }); }
  decr(k: string) { return this.op(() => { const n = Number(strings.get(k) || 0) - 1; strings.set(k, String(n)); return n; }); }
  set(k: string, v: string, o?: { nx?: boolean }) { return this.op(() => { if (o?.nx && strings.has(k)) return null; strings.set(k, v); return 'OK'; }); }
  pipeline() {
    const ops: (() => unknown)[] = [];
    const chain: any = {
      scard: (k: string) => { ops.push(() => sets.get(k)?.size ?? 0); return chain; },
      exists: (k: string) => { ops.push(() => (strings.has(k) ? 1 : 0)); return chain; },
      incr: (k: string) => { ops.push(() => { const n = Number(strings.get(k) || 0) + 1; strings.set(k, String(n)); return n; }); return chain; },
      expire: () => { ops.push(() => 1); return chain; },
      hset: () => { ops.push(() => 1); return chain; },
      exec: () => this.op(() => ops.map((f) => f())),
    };
    return chain;
  }
}
const redisPath = require.resolve('@upstash/redis');
require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: { Redis: FakeRedis } } as unknown as Module;
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
const claimRoute = require('../src/app/api/coupon/claim/route');
const { couponKeys } = require('../src/lib/marketing/coupon');
const { ipHash, couponIpSecret, COUPON_CLAIMED_COOKIE } = require('../src/lib/marketing/couponClaim');
const { isLivePromoCode } = require('../src/lib/marketing/linkPreview');

const K = couponKeys('preview');
const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36';
const kakao = 'Mozilla/5.0 (Linux; Android 13; SM-S911N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410430';
const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1';
const bot = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const request = (path: string, ua: string, extra: Record<string, string> = {}) =>
  new NextRequest(`https://www.signumhq.com${path}`, { headers: { 'user-agent': ua, 'accept-language': 'ko-KR', ...extra } });
const FAKE = (i: number) => `ZZTEST${String(i).padStart(17, '0')}`;
const stock = (n: number) => { sets.set(K.pool, new Set(Array.from({ length: n }, (_, i) => FAKE(i)))); };
const isCoupon = async (r: any) => { assert.equal(r.status, 200); assert.equal(r.headers.get('vary'), 'User-Agent'); assert.match(await r.text(), /id="claim"/); };
const isPlay302 = (r: any, content?: string) => {
  assert.equal(r.status, 302);
  const loc = r.headers.get('location');
  assert.match(loc, /^https:\/\/play\.google\.com\/store\/apps\/details/);
  if (content) assert.match(decodeURIComponent(loc), new RegExp(`utm_content=${content}`)); else assert.doesNotMatch(decodeURIComponent(loc), /utm_content=/);
};
const isInAppPage = async (r: any) => { assert.equal(r.status, 200); const h = await r.text(); assert.doesNotMatch(h, /id="claim"/); assert.match(h, /intent:\/\//); };

(async () => {
  assert.equal(isLivePromoCode('THREADSPRO'), false, '10/31 끝난 채널 코드');
  assert.equal(isLivePromoCode('SIGNUMPRO'), true, '살아 있는 크리에이터 형식 코드');

  // ① 풀에 번호 있음 → 끝난 코드·코드 없음·형식 밖 코드 모두 쿠폰 화면(크롬·앱 안 브라우저)
  stock(3);
  for (const path of ['/app?from=threads&code=THREADSPRO', '/app?from=home', '/app?from=home&code=ABCD1234', '/app?from=gift&ref=abc']) {
    await isCoupon(await GET(request(path, android)));
    await isCoupon(await GET(request(path, kakao)));
  }

  // ③ 소진 → 예전 동작 그대로
  stock(0);
  isPlay302(await GET(request('/app?from=threads&code=THREADSPRO', android)), 'code');
  isPlay302(await GET(request('/app?from=home', android)));
  await isInAppPage(await GET(request('/app?from=home', kakao)));                       // 앱 안 브라우저 = intent 안내 화면(예전 그대로)
  await isInAppPage(await GET(request('/app?from=threads&code=THREADSPRO', kakao)));

  // ② 소진이어도 이미 받은 사람은 쿠폰 화면(기기 저장 번호·24시간 재표시)
  const before = reads;
  await isCoupon(await GET(request('/app?from=home', android, { cookie: `${COUPON_CLAIMED_COOKIE}=1` })));
  await isCoupon(await GET(request('/app?from=threads&code=THREADSPRO', kakao, { cookie: `${COUPON_CLAIMED_COOKIE}=1` })));
  assert.equal(reads, before, '받은 표식이 있으면 저장소를 조회하지 않는다');
  strings.set(K.ip(ipHash('10.0.0.7', couponIpSecret())), FAKE(99));
  await isCoupon(await GET(request('/app?from=home', android, { 'x-coupon-test-ip': '10.0.0.7' })));
  isPlay302(await GET(request('/app?from=home', android, { 'x-coupon-test-ip': '10.0.0.8' })));

  // ③ 조회 실패 → 예전 동작
  fail = true; stock(3);
  isPlay302(await GET(request('/app?from=home', android)));
  await isInAppPage(await GET(request('/app?from=home', kakao)));
  fail = false;

  // ④ 살아 있는 애플 코드 링크(안드)는 조회 없이 예전 쿠폰 화면 — 소진이어도(예전처럼 화면에서 «소진» 안내)
  stock(0);
  let r0 = reads;
  await isCoupon(await GET(request('/app?from=x&code=SIGNUMPRO', android)));
  assert.equal(reads, r0, '살아 있는 코드 링크는 조회하지 않는다(예전 그대로)');

  // 봇·플래그 꺼짐 → 조회 없음 · 예전 302
  stock(3);
  r0 = reads;
  const rb = await GET(request('/app?from=home', `${bot} Android`));
  assert.doesNotMatch(await rb.text(), /id="claim"/);   // 봇은 예전 그대로(미리보기 카드)
  process.env.COUPON_ANDROID = '0';
  isPlay302(await GET(request('/app?from=home', android)));
  isPlay302(await GET(request('/app?from=threads&code=THREADSPRO', android)), 'code');
  process.env.COUPON_ANDROID = '1';
  assert.equal(reads, r0, '봇·플래그 꺼짐이면 조회하지 않는다');

  // ④ 아이폰 불변 · 조회 없음
  r0 = reads;
  let r = await GET(request('/app?from=threads&code=THREADSPRO', ios));
  assert.equal(r.status, 302); assert.match(r.headers.get('location'), /apps\.apple\.com\/redeem.*code=THREADSPRO/);
  r = await GET(request('/app?from=home', ios));
  assert.equal(r.status, 302); assert.match(r.headers.get('location'), /apps\.apple\.com\/app\//);
  r = await GET(request('/app?from=home&code=SIGNUMPRO', ios));
  assert.equal(r.status, 200); assert.match(await r.text(), /id="go"/);
  r = await GET(request('/app?from=home', ios, { cookie: `${COUPON_CLAIMED_COOKIE}=1` }));
  assert.equal(r.status, 302);
  assert.equal(reads, r0, '아이폰은 재고를 조회하지 않는다');

  // ⑤ 배정 API — 번호를 주면 sg_cpn 쿠키(같은 IP 재요청도)
  stock(2);
  const claim = (ip: string) => claimRoute.POST(new NextRequest('https://www.signumhq.com/api/coupon/claim', {
    method: 'POST', body: JSON.stringify({ from: 'home', code: '', l: 'ko' }),
    headers: { 'user-agent': android, 'accept-language': 'ko-KR', 'content-type': 'application/json', 'x-coupon': '1', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', host: 'www.signumhq.com', 'x-coupon-test-ip': ip },
  }));
  for (const ip of ['10.1.1.1', '10.1.1.1']) {
    const c = await claim(ip);
    assert.equal(c.status, 200);
    const sc = c.headers.get('set-cookie') || '';
    assert.match(sc, new RegExp(`${COUPON_CLAIMED_COOKIE}=1`)); assert.match(sc, /Path=\/app/); assert.match(sc, /HttpOnly/i);
  }
  stock(0);
  const empty = await claim('10.1.1.2');
  assert.equal(empty.status, 410);
  assert.equal(empty.headers.get('set-cookie'), null, '소진 응답엔 표식을 남기지 않는다');

  console.log('androidCouponDecouple: 통과');
})().catch((err: unknown) => { console.error(err); process.exitCode = 1; });
