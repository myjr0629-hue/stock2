const assert = require('node:assert/strict');
const { snapshotRows, compareStored, liveCompare, readRedis, callCreditModel, markdown } = require('../scripts/today-picks-v2-compare.cjs');
const fixtures = require('./fixtures/today-picks-v2/existing-model.json');
(async () => {
  const compared = compareStored(fixtures);
  assert.equal(compared.length, 21);
  assert.equal(compared.filter(r => r.oldReasons.length).length, 0);
  assert.equal(compared.filter(r => r.newReasons.length).length, 0);
  assert.equal(compared.filter(r => r.generationOnlyReasons.length).length, 0);
  const doc = { etDate: fixtures[0].etDate, session: 'PRE-MARKET', extra: 'excluded', items: fixtures.map(r => ({ ...r, whyAi: true })),
    context: { date: '2026-10-13', lastRegularDate: '2026-10-12', session: 'PRE-MARKET', extra: 'excluded', quotes: [],
      futures: { live: false, asOf: null, nq: null, es: null }, news: [{ headline: 'offline context headline', publishedAt: '2026-10-13T08:00:00Z' }] } };
  const rows = snapshotRows(doc);
  assert.ok(rows.every(r => r.provenance === 'operational-snapshot' && !Object.hasOwn(r, 'extra')));
  assert.ok(rows.every(r => !Object.hasOwn(r.context, 'extra')));
  let calls = 0;
  const live = await liveCompare(rows, { callModel: async request => {
    assert.ok(request.system && request.userPrompt);
    if (request.userPrompt.includes('CONTRACT: today-picks-v2')) assert.ok(!request.userPrompt.includes('offline context headline'));
    else assert.ok(request.userPrompt.includes('PRE-OPEN CONTEXT') && request.userPrompt.includes('offline context headline'));
    calls++;
    return { text: JSON.stringify(fixtures[0].why), model: 'offline-double' };
  } });
  assert.equal(calls, 6 * 3 * 2, '고유 입력 6개 × 각 3회 × 옛/새 계약');
  assert.equal(live.length, calls * 3, '각 응답을 3언어로 검사');
  for (const ticker of new Set(rows.map(r => r.ticker))) for (const contract of ['old', 'new']) for (const locale of ['ko', 'en', 'ja']) {
    assert.equal(live.filter(r => r.ticker === ticker && r.contract === contract && r.locale === locale).length, 3);
  }
  const failed = await liveCompare([rows[0]], { callModel: async () => { throw new Error('private error must stay private'); } });
  assert.equal(failed.length, 18);
  assert.ok(failed.every(r => r.reasons[0] === 'model:failed-or-json' && !r.text));
  assert.ok(!JSON.stringify(failed).includes('private error'));
  let reads = 0;
  const read = await readRedis({ EC2_REDIS_PROXY_URL: 'http://localhost', REDIS_PROXY_KEY: 'offline-placeholder' }, async (url, o) => {
    reads++;
    assert.equal(o.method, 'GET');
    assert.ok(url.endsWith('/get?key=todaypicks%3Av1%3Alatest'));
    return { ok: true, json: async () => ({ result: JSON.stringify(doc) }) };
  });
  assert.equal(reads, 1); assert.equal(read.length, rows.length);
  await assert.rejects(readRedis({}, () => { throw new Error('must not fetch'); }));
  await assert.rejects(callCreditModel({}, {}, () => { throw new Error('must not fetch'); }));
  let modelCalls = 0;
  const credit = await callCreditModel({ system: 'test', userPrompt: 'test' }, { ANTHROPIC_API_KEY_CREDITS: 'offline-placeholder' }, async (url, o) => {
    modelCalls++;
    assert.equal(url, 'https://api.anthropic.com/v1/messages'); assert.equal(o.method, 'POST');
    const body = JSON.parse(o.body);
    assert.equal(body.model, 'claude-haiku-5-5'); assert.equal(body.max_tokens, 400);
    assert.match(body.system, /<current_date>/); assert.match(body.system, /Gamma Flip/); assert.ok(body.system.endsWith('test'));
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{}' }], model: body.model }) };
  });
  assert.equal(modelCalls, 1); assert.equal(credit.text, '{}');
  const truncated = await liveCompare([rows[0]], { callModel: async () => ({ text: JSON.stringify(fixtures[0].why), truncated: true }) });
  assert.ok(truncated.every(r => r.reasons.includes('model:truncated') && !r.itemAccepted), 'JSON이 닫혀도 토큰 제한 잘림은 운영처럼 거절');
  assert.match(markdown(compared, []), /옛 탈락 0, 새 저장본 계약 탈락 0/);
  console.log('비교 도구: 고정 기준·읽기 전용·옛/새 각 3회·3언어·실패 비노출 통과');
})().catch(e => { console.error(e); process.exitCode = 1; });
