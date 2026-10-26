// 10/26 08:40 UTC 첫 운영 생성(sector-brief-v2) 결함 4건 회귀 — 운영 저장본 입력·문장 그대로(TRACKER T6).
// 범위 축소(ops-1027 10/26 19:1x): «제외 평균» 값은 입력에서 빼고 전용 결속 검사 없이 기존 숫자 근거 검사로 거른다.
require('../scripts/offline-test-typescript.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const sb = require('../src/lib/ai/sectorBrief');
const fx = require('./fixtures/sector-brief-1026/prod-20261026-0840.json');
const F = id => fx.facts.find(f => f.id === id);
const FIELD = { ko: 'headline', en: 'headlineEN', ja: 'headlineJP' };

test('모델 입력: 내부 약칭·제외 평균 없음 · 언어별 세션 표지 · 先行 금지 지시', () => {
  const p = sb.buildSectorBriefPrompt(fx.facts, fx.session, fx.date);
  assert.doesNotMatch(p.userPrompt, /exLeader|avgWithout|avgChangePct|spreadPct|priorOptions/);
  const input = JSON.parse(p.userPrompt.split('\n').slice(2, -2).join('\n'));
  const bio = input.find(x => x.id === 'bio_pulse');
  assert.deepEqual(bio.sessionTag, { ko: '10/23 정규장', en: '10/23 REG', ja: '10/23 通常取引' });
  assert.equal(bio.members.length, 7);
  assert.equal(input.find(x => x.id === 'physical_ai').sessionTag.ko, '10/26 개장 전');
  assert.match(p.system, /Korean included/); assert.match(p.system, /never write them/);
  assert.match(p.system, /Do not compute or cite any average that excludes a name/);
  assert.match(p.system, /Never use 先行\/선행/);
  assert.match(p.system, /equal-weight mean/); assert.match(p.system, /percentage POINTS/); assert.match(p.system, /40-70.*55-95/);
});

test('결함 1: 입력 필드 이름(exLeader 등) 노출은 탈락, 티커·mRNA 는 정상', () => {
  const ko = fx.stored.silicon_core.headline;
  assert.match(ko, /exLeader/);
  assert.ok(sb.checkSectorBriefNew(ko, 'ko', F('silicon_core')).includes('internal-field'));
  for (const t of ['MU 2.46%로 선두, equalWeightAvgPct 기준 강세 관측 (10/23 정규장)', 'silicon_core 섹터 MU 2.46% 선두 관측 (10/23 정규장)'])
    assert.ok(sb.checkSectorBriefNew(t, 'ko', F('silicon_core')).includes('internal-field'), t);
  for (const t of ['MU +2.46% leads and 6 of 7 rose, so strength is shared (10/23 REG).', 'MU +2.46% leads; mRNA-free group shows shared strength (10/23 REG).'])
    assert.deepEqual(sb.checkSectorBriefNew(t, 'en', F('silicon_core')), [], t);
});

test('결함 4: «제외 평균» 숫자는 입력에 없으므로 운영 문장 전부(3언어) 근거 없는 숫자로 탈락', () => {
  const cases = { silicon_core: ['ko', 'en'], bio_pulse: ['ko', 'en', 'ja'], quantum_edge: ['ko', 'en'], fintech_pulse: ['ko', 'en', 'ja'], cloud_fortress: ['ko', 'en'] };
  for (const [id, locs] of Object.entries(cases)) for (const loc of locs) {
    const r = sb.checkSectorBriefNew(fx.stored[id][FIELD[loc]], loc, F(id));
    assert.ok(r.some(x => x.startsWith('number:')), `${id} ${loc} ${r}`);
  }
  for (const [loc, t] of [['ko', 'GILD 제외 평균 −2.44%로 약세 관측 (10/23 정규장)'], ['ko', 'VKTX 제외 평균 −1.64%로 약세 관측 (10/23 정규장)'],
    ['en', 'All 7 fell; average ex-VKTX −1.64% (10/23 REG).'], ['ja', 'VKTXを除く平均は−1.64%（10/23 通常取引）']])
    assert.ok(sb.checkSectorBriefNew(t, loc, F('bio_pulse')).some(x => x.startsWith('number:')), t);
  // 제외 평균 없이 말로 쓴 문장은 정상
  assert.deepEqual(sb.checkSectorBriefNew('7종 전부 하락, VKTX −5.54%로 낙폭 최대이고 나머지도 모두 내려 약세가 폭넓게 관측 (10/23 정규장)', 'ko', F('bio_pulse')), []);
});

test('결함 3: 직전 정규장 섹터 문장에 기준일이 없으면 «(10/23 정규장)» 표지, 당일·이미 있으면 그대로', () => {
  const prior = fx.facts.filter(f => f.priceDate !== fx.date).map(f => f.id);
  assert.deepEqual(prior, ['m7', 'silicon_core', 'power_matrix', 'bio_pulse', 'quantum_edge', 'fintech_pulse', 'cloud_fortress']);
  for (const id of prior) {
    const ko = fx.stored[id].headline;
    assert.equal(sb.hasPriceDate(ko, '2026-10-23'), false, id);
    assert.equal(sb.withPriceDateTag(ko, 'ko', F(id), fx.date), `${ko} (10/23 정규장)`);
    assert.equal(sb.withPriceDateTag(fx.stored[id].headlineEN, 'en', F(id), fx.date), fx.stored[id].headlineEN);
  }
  assert.equal(sb.withPriceDateTag(fx.stored.physical_ai.headline, 'ko', F('physical_ai'), fx.date), fx.stored.physical_ai.headline);
  for (const t of ['10월 23일 정규장 MSFT 0.66% 상승, 나머지 하락 관측', '10/23 정규장 MSFT 0.66% 상승 관측']) {
    assert.equal(sb.hasPriceDate(t, '2026-10-23'), true);
    assert.deepEqual(sb.checkSectorBriefNew(t, 'ko', F('m7')), [], t);
  }
  assert.deepEqual(sb.checkSectorBriefNew('10月23日の通常取引でMSFT +0.66%、他は下落と観測', 'ja', F('m7')), []);
  const parsed = { m7: { ko: fx.stored.m7.headline, en: fx.stored.m7.headlineEN, ja: fx.stored.m7.headlineJP } };
  assert.equal(sb.selectSectorBriefOutput(parsed, [F('m7')], fx.date).sectors.m7.headline, `${fx.stored.m7.headline} (10/23 정규장)`);
  assert.equal(sb.selectSectorBriefOutput(parsed, [F('m7')]).sectors.m7.headline, fx.stored.m7.headline);
  // 표지가 언어 검사를 우회하지 않는다(검사는 모델 원문 기준)
  const bad = sb.selectSectorBriefOutput({ m7: { ...parsed.m7, ja: 'MSFT rose while 6 of 7 measured names fell' } }, [F('m7')], fx.date);
  assert.equal(bad.sectors.m7.headlineJP, undefined);
  assert.ok(bad.rejected.some(r => r.includes('ja:language-or-min-length')));
});

test('운영 저장 문장 중 결함 없는 칸은 새 검사도 통과(과잉 탈락 0)', () => {
  const flagged = new Set(['silicon_core:ko', 'silicon_core:en', 'bio_pulse:ko', 'bio_pulse:en', 'bio_pulse:ja', 'quantum_edge:ko', 'quantum_edge:en',
    'fintech_pulse:ko', 'fintech_pulse:en', 'fintech_pulse:ja', 'cloud_fortress:ko', 'cloud_fortress:en']);
  for (const f of fx.facts) for (const loc of sb.SECTOR_LOCALES) {
    const t = fx.stored[f.id][FIELD[loc]];
    if (!t || flagged.has(`${f.id}:${loc}`)) continue;
    assert.deepEqual(sb.checkSectorBriefNew(sb.withPriceDateTag(t, loc, f, fx.date), loc, f), [], `${f.id} ${loc} ${t}`);
  }
});

test('관문 10261929: 다른 사실값과 같은 틀린 제외 평균(«VKTX 제외 평균 −2.54%» = LLY 값)도 표현 자체로 탈락, 일반 문장은 정상', () => {
  for (const [loc, t] of [['ko', 'VKTX 제외 평균 −2.54%로 약세 관측 (10/23 정규장)'], ['ja', 'VKTXを除く平均は−2.54%（10/23 通常取引）'],
    ['en', 'All 7 fell; average ex-VKTX −2.54% (10/23 REG).'], ['en', 'Excluding VKTX, the average was −2.54% (10/23 REG).']])
    assert.ok(sb.checkSectorBriefNew(t, loc, F('bio_pulse')).includes('excluded-average'), t);
  for (const [loc, t] of [['ko', '5/7 상승, 평균 1.57% — DDOG 4.62% 선두, CRM -0.69% 제외 대부분 상승 관측 (10/23 정규장)'],
    ['en', 'DDOG leads at +4.62%; five of seven rose, broad participation (10/23 REG)']])
    assert.deepEqual(sb.checkSectorBriefNew(t, loc, F('cloud_fortress')), [], t);
});
