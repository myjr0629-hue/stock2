import assert from 'node:assert/strict';
import Module from 'node:module';
const queue: (() => unknown)[] = [];
const nsPath = require.resolve('next/server');
const ns = require(nsPath);
require.cache[nsPath] = { ...require.cache[nsPath], exports: { ...ns, after: (fn: () => unknown) => queue.push(fn) } } as Module;
const redisPath = require.resolve('../src/services/redisClient');
const redis = require(redisPath);
const values = new Map<string, any>();
redis.getFromCache = async (key: string) => values.get(key);
redis.setInCache = async (key: string, value: any) => { values.set(key, value); };
const landingPath = require.resolve('../src/lib/giftShare/landing');
const landing = require(landingPath);
landing.giftLanding = async () => new ns.NextResponse('ok');
const { GET } = require('../src/app/app/route');
process.env.GIFT_SHARE_ENABLED = '1';
process.env.VERCEL_ENV = 'preview';
const base = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
async function visit(ua: string, meta = true) {
  values.clear(); queue.length = 0;
  const headers: Record<string, string> = { 'user-agent': ua, 'accept-language': 'ko' };
  if (meta) { headers['sec-fetch-mode'] = 'navigate'; headers['sec-fetch-dest'] = 'document'; }
  await GET(new ns.NextRequest('https://www.signumhq.com/app?from=gift&gift=' + 'A'.repeat(43), { headers }));
  for (const fn of queue.splice(0)) await fn();
  return [...values.entries()];
}
(async () => {
  let v = await visit(base + ' KAKAOTALK 10.4.5');
  assert.ok(v.some(([k, x]) => k.startsWith('clkp:sg:gift:') && x['ios|human'] === 1));
  assert.ok(v.some(([k, x]) => k.startsWith('mkt:attr:hit:gift:') && x === 1));
  v = await visit(base + ' Line/14.0', false);
  assert.ok(v.some(([k, x]) => k.startsWith('clkp:sg:gift:') && x['ios|nometa'] === 1));
  assert.ok(v.some(([k]) => k.startsWith('mkt:attr:hit:gift:')));
  v = await visit('kakaotalk-scrap/1.0');
  assert.equal(v.length, 0);
  console.log('선물 토큰 클릭 계측 통과');
})().catch(e => { console.error(e); process.exitCode = 1; });
