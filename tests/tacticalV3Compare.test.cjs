const assert = require('node:assert/strict');
const { fixtureFromSnapshot, compareStored, readers, collectStored, markdown } = require('../scripts/tactical-v3-compare.cjs');
const { buildMarketIndexBasis } = require('../src/lib/marketIndexBasis');
async function main() {
  const timestamp = '2026-10-23T09:58:00Z';
  const q = (symbol, changePct, marketTime) => ({ symbol, price: 100, changePct, marketTime, lastChangeAt: marketTime, source: 'YAHOO' });
  const indexBasis = buildMarketIndexBasis({ nasdaq: q('^IXIC', -1.2, '2026-10-22T19:59:00Z'), nq: q('NQ=F', 0.1, '2026-10-23T09:57:00Z') }, Date.parse(timestamp));
  const fixture = fixtureFromSnapshot({ data: { timestamp, market: { indexBasis, vix: 19.6 }, rlsi: { score: 31 }, unrelatedPrivateField: 'never copy' } }, 'saved-input');
  assert.equal(fixture.context.session, 'PRE');
  assert.equal(fixture.context.indexFacts[0].chgPct, 0.1);
  assert.ok(!JSON.stringify(fixture).includes('never copy'));
  assert.throws(() => fixtureFromSnapshot({ timestamp }, 'saved-input'));
  const rows = [{ key: 'cached-ko', locale: 'ko', value: { text: '나스닥 현물 관측은 미확인입니다. NEWS PULSE 보도는 미확인입니다. 옵션 포지션은 중립입니다. 다음 분기점은 미확인입니다.' } }];
  const results = compareStored(rows, fixture.context);
  assert.deepEqual(results[0].oldReasons, []);
  assert.ok(results[0].newReasons.includes('tactical:internal-source'));
  assert.ok(results[0].newReasons.includes('tactical:index-change-required'));
  const calls = [];
  const read = { insight: async key => { calls.push(key); return null; }, archive: async key => { calls.push(key); return null; } };
  const captured = await collectStored(read, Date.parse(timestamp));
  assert.equal(captured.length, 66, '언어별 v2/v3 현재본 2개 + 날짜별 완료 세션 최대20');
  for (const locale of ['KO', 'EN', 'JA']) assert.equal(calls.filter(k => k.startsWith(`session:insight:REALITY_${locale}:`)).length, 20);
  const methods = [];
  const fetcher = async (url, opts) => {
    methods.push(opts.method);
    assert.ok(url.includes('/get'));
    return { ok: true, json: async () => ({ result: null }) };
  };
  const remote = readers({ UPSTASH_REDIS_REST_URL: 'https://offline.invalid', UPSTASH_REDIS_REST_TOKEN: 'placeholder', EC2_REDIS_PROXY_URL: 'https://offline.invalid', EC2_REDIS_PROXY_KEY: 'placeholder' }, fetcher);
  await remote.insight('guardian:gemini:v2:reality:ko');
  await remote.archive('session:insight:REALITY_KO:2026-10-22');
  assert.deepEqual(methods, ['GET', 'GET'], '외부 쓰기 명령 없음');
  assert.match(markdown(results, [], [fixture]), /이전 탈락 0개 \/ 새 탈락 1개/);
  console.log('통과 Tactical 비교: 실제 입력 허용 목록·구/신 저장본 비교·언어별 최대20·GET 전용·실모델 기본 꺼짐');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
