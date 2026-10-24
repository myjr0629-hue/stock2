const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
// v3 병합 직전 main을 옛 계약으로 고정한다. 움직이는 origin/main은 병합 후 이미 v3다.
// 비교 도구의 git 의존성만 주입하고, 실제 프롬프트·검사는 이 SHA의 원본을 읽는다.
const baselineRevision = '0b6afec9ffbaeac3844b8ff7874bc20cc06bdc29';
const execFileSync = childProcess.execFileSync;
let comparison;
try {
  childProcess.execFileSync = (command, args, options) => command === 'git' && args[0] === 'rev-parse' && args[1] === 'origin/main'
    ? baselineRevision + '\n' : execFileSync(command, args, options);
  comparison = require('../scripts/tactical-v3-compare.cjs');
} finally { childProcess.execFileSync = execFileSync; }
const { fixtureFromSnapshot, compareStored, readers, collectStored, markdown, deriveSessions, liveCompare, modelRequest, baseline } = comparison;
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
  assert.ok(!results[0].newReasons.includes('tactical:index-change-required'), '복구 비교에는 새 생성 계약을 적용하지 않음');
  const legacyRows = [
    { key: 'guardian:gemini:v2:reality:en', locale: 'en', value: { text: 'Nasdaq {NDX_CHG} and S&P500 {SPX_CHG} show a mixed market. The next test is unconfirmed.', basis: { NDX_CHG: -0.06, SPX_CHG: 0.15 } } },
    { key: 'session:insight:REALITY_EN:2026-10-22', locale: 'en', value: { value: { text: 'Nasdaq -0.06% and S&P500 +0.15% show a mixed market. The next test is unconfirmed.' } } },
  ];
  for (const row of compareStored(legacyRows, fixture.context)) assert.deepEqual(row.newReasons, [], 'v2 복구는 옛 숫자 기준');
  const calls = [];
  const read = { insight: async key => { calls.push(key); return null; }, archive: async key => { calls.push(key); return null; } };
  const captured = await collectStored(read, Date.parse(timestamp));
  assert.equal(captured.length, 126, '언어별 v2/v3 현재본 2개 + 날짜별 REALITY/REALITY_V3 각각 최대20');
  for (const locale of ['KO', 'EN', 'JA']) assert.equal(calls.filter(k => k.startsWith(`session:insight:REALITY_${locale}:`)).length, 20);
  for (const locale of ['KO', 'EN', 'JA']) assert.equal(calls.filter(k => k.startsWith(`session:insight:REALITY_V3_${locale}:`)).length, 20);
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
  const derived = deriveSessions(fixture);
  assert.deepEqual(derived.map(f => f.context.session), ['REG', 'POST']);
  assert.ok(derived.every(f => f.provenance === 'derived-session' && f.derivedFrom === fixture.context.asOf));
  assert.equal(derived[0].context.asOf, '2026-10-22T19:30:00.000Z');
  assert.equal(derived[1].context.asOf, '2026-10-22T21:30:00.000Z');
  assert.equal(derived[0].context.indexBasis.cash.nasdaq.live, true);
  assert.equal(derived[0].context.indexBasis.cash.nasdaq.asOf, '2026-10-22T19:29:00.000Z');
  assert.ok(derived[0].context.indexFacts.some(f => f.id === 'nasdaq' && f.asOfET === '2026-10-22 15:29 ET'));
  assert.equal(derived[0].context.indexBasis.cash.nasdaq.price, fixture.context.indexBasis.cash.nasdaq.price);
  assert.equal(derived[0].context.indexBasis.cash.nasdaq.changePct, -1.2);
  assert.equal(fixture.context.indexBasis.cash.nasdaq.asOf, '2026-10-22T19:59:00.000Z', '원본 불변');
  assert.ok(!derived[1].context.indexFacts.some(f => f.kind === 'futures'), '정산 대비를 종가 이후로 재해석하지 않음');
  const winter = structuredClone(fixture);
  winter.context.indexBasis.cash.nasdaq.sessionDate = '2026-12-01';
  assert.equal(deriveSessions(winter)[0].context.asOf, '2026-12-01T20:30:00.000Z', '파생 시각도 DST 적용');
  const old = baseline();
  const withCompany = { ...fixture.context, marketNewsHeadlines: ['[NEWS PULSE; 2026-10-23T09:50:00.000Z; 05:50 ET] Volvo Cars shares plunge on weak China sales'] };
  assert.match(modelRequest(withCompany, 'old', old).prompts.ko, /Volvo/);
  assert.doesNotMatch(modelRequest(withCompany, 'new', old).prompts.ko, /Volvo/);
  for (const locale of ['ko', 'en', 'ja']) assert.equal(require('../src/lib/ai/guardianNumbers').guardianTokenRules(locale, { NDX_CHG: -1.2, RLSI: 31 }), old.numbers.guardianTokenRules(locale, { NDX_CHG: -1.2, RLSI: 31 }), '공유 자리표 기본 모드 불변');
  assert.equal(old.revision, baselineRevision);
  assert.match(modelRequest(fixture.context, 'old', old).userPrompt, /first sentence, no numbers, no times, no sources/);
  assert.match(modelRequest(fixture.context, 'old', old).userPrompt, /→ \{NDX_CHG\}/);
  assert.doesNotMatch(modelRequest(fixture.context, 'new', old).userPrompt, /→ \{(?:NDX_CHG|SPX_CHG)\}/);
  assert.match(modelRequest(fixture.context, 'new', old).userPrompt, /never use \{NDX_CHG\} or \{SPX_CHG\}/);
  let generated = 0;
  const requests = [];
  const live = await liveCompare([fixture, ...derived], { baselineLive: true, callModel: async request => {
    generated++;
    requests.push(request.userPrompt);
    return { text: JSON.stringify({ ko: rows[0].value.text, en: 'Nasdaq observations are unavailable. The market driver is unconfirmed. Options positioning is neutral. The next test is unconfirmed.', ja: 'ナスダック現物は未確認です。相場全体の材料は未確認です。オプションは中立です。次の分岐点は未確認です。' }), model: 'offline-mock' };
  } });
  assert.equal(generated, 18, '3세션×3회×옛/새 계약, 외부 모델 대신 모의 호출');
  assert.equal(live.length, 54);
  for (const contract of ['old', 'new']) for (const session of ['PRE', 'REG', 'POST']) for (const locale of ['ko', 'en', 'ja']) {
    assert.equal(live.filter(r => r.contract === contract && r.session === session && r.locale === locale).length, 3);
  }
  for (let i = 0; i < requests.length; i += 2) assert.equal(requests[i].match(/^AS_OF: (.*)$/m)[1], requests[i + 1].match(/^AS_OF: (.*)$/m)[1], '옛/새 같은 입력 시각');
  const report = markdown(results, live, [fixture, ...derived]);
  assert.match(report, /옛 계약\(origin\/main\)/);
  assert.match(report, /파생, 실제 해당 세션 관측 아님/);
  for (const contract of ['old', 'new']) {
    const count = live.filter(r => r.contract === contract && !r.reasons.length).length;
    assert.ok(report.includes(`${count}/27`));
  }
  assert.match(report, /PRE\/ko/);
  const allPass = live.map(r => ({ ...r, reasons: [] }));
  assert.match(markdown([], allPass, []), /반영 조건.*충족/);
  assert.match(markdown([], allPass.filter(r => r.contract !== 'old'), []), /반영 조건.*미측정/);
  // 전체 26/27(96.3%)이어도 한 세션/언어가 옛 계약보다 나쁘면 보류.
  const regression = allPass.map((r, i) => i === allPass.findIndex(x => x.contract === 'new') ? { ...r, reasons: ['mock:regression'] } : r);
  assert.match(markdown([], regression, []), /반영 조건.*보류/);
  const failed = await liveCompare([fixture], { callModel: async () => { throw new Error('provider failure'); } });
  assert.equal(failed.length, 9);
  assert.ok(failed.every(r => r.reasons[0] === 'model:failed' && r.text === ''), '오류 본문 저장하지 않음');
  console.log('통과 Tactical 비교: 실제 입력 허용 목록·구/신 저장본 비교·언어별 최대20·GET 전용·실모델 기본 꺼짐');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
