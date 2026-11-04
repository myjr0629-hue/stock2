import assert from 'node:assert/strict';
process.env.EC2_REDIS_PROXY_URL = 'http://ec2.test';
process.env.EC2_REDIS_PROXY_KEY = 'test';
process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
let ec: 'empty' | 'invalid' | 'failure' = 'empty';
let up: 'empty' | 'failure' = 'empty';
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.startsWith('http://ec2.test')) {
    if (ec === 'failure') return Response.json({ error: 'unavailable' }, { status: 503 });
    return Response.json(ec === 'invalid' ? {} : { results: [null, null] });
  }
  if (url.startsWith('https://upstash.test')) {
    if (up === 'failure') return Response.json({ error: 'unavailable' }, { status: 503 });
    const result = { result: [null, null] };
    return Response.json(url.endsWith('/pipeline') ? [result] : result);
  }
  throw new Error('unexpected network');
};
async function run() {
  const { mgetFromCache, mgetFromCacheStrict } = await import('../src/services/redisClient');
  const keys = ['earnings:actuals:v1:A', 'earnings:actuals:v1:B'];
  assert.deepEqual(await mgetFromCacheStrict(keys), [null, null]);
  ec = 'invalid'; assert.deepEqual(await mgetFromCacheStrict(keys), [null, null]);
  up = 'failure'; await assert.rejects(mgetFromCacheStrict(keys), /cache_mget_unavailable/);
  ec = 'failure'; await assert.rejects(mgetFromCacheStrict(keys), /cache_mget_unavailable/);
  assert.deepEqual(await mgetFromCache(keys), [null, null]);
  assert.deepEqual(await mgetFromCacheStrict([]), []);
  console.log('strict cache: ok');
}
void run().catch(e => { console.error(e); process.exitCode = 1; });
