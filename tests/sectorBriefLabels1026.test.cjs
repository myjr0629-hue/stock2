// 10/26 08:40 UTC 첫 운영 생성(sector-brief-v2) 결함 4건 회귀 — 운영 저장본 입력·문장 그대로(TRACKER T6).
require('../scripts/offline-test-typescript.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const sb = require('../src/lib/ai/sectorBrief');
const fx = require('./fixtures/sector-brief-1026/prod-20261026-0840.json');
const F = id => fx.facts.find(f => f.id === id);
const FIELD = { ko: 'headline', en: 'headlineEN', ja: 'headlineJP' };

test('모델 입력: 내부 약칭 대신 뜻이 드러나는 이름 · 제외 평균은 뺀 종목과 함께 · 언어별 세션 표지', () => {
  const p = sb.buildSectorBriefPrompt(fx.facts, fx.session, fx.date);
  assert.doesNotMatch(p.userPrompt, /exLeader|avgChangePct|spreadPct|priorOptions/);
  const input = JSON.parse(p.userPrompt.split('\n').slice(2, -2).join('\n'));
  const bio = input.find(x => x.id === 'bio_pulse');
  assert.deepEqual(bio.avgWithoutBest, { excludedTicker: 'GILD', pct: -2.44 });
  assert.deepEqual(bio.avgWithoutWorst, { excludedTicker: 'VKTX', pct: -1.64 });
  assert.deepEqual(bio.sessionTag, { ko: '10/23 정규장', en: '10/23 REG', ja: '10/23 通常取引' });
  assert.equal(input.find(x => x.id === 'physical_ai').sessionTag.ko, '10/26 개장 전');
  assert.match(p.system, /GILD 제외 평균/); assert.match(p.system, /Korean included/); assert.match(p.system, /never write them/);
  // 기존 계약 유지
  assert.match(p.system, /equal-weight mean/); assert.match(p.system, /percentage POINTS/); assert.match(p.system, /40-70.*55-95/);
});

test('결함 1: 입력 필드 이름(exLeader 등) 노출은 탈락, 티커·mRNA·ex-GILD 는 정상', () => {
  const ko = fx.stored.silicon_core.headline;
  assert.match(ko, /exLeader/);
  assert.ok(sb.checkSectorBriefNew(ko, 'ko', F('silicon_core')).includes('internal-field'));
  for (const t of ['MU 2.46%로 선두, avgWithoutBest 0.97% 관측 (10/23 정규장)', 'silicon_core 섹터 MU 2.46% 선두 관측 (10/23 정규장)'])
    assert.ok(sb.checkSectorBriefNew(t, 'ko', F('silicon_core')).includes('internal-field'), t);
  for (const t of ['MU +2.46% leads; average ex-MU is +0.97%, so strength is shared (10/23 REG).',
    'MU +2.46% leads; mRNA-free group shows shared strength (10/23 REG).'])
    assert.ok(!sb.checkSectorBriefNew(t, 'en', F('silicon_core')).includes('internal-field'), t);
});

test('결함 4: 제외 평균이 최약 종목 옆에 붙은 운영 문장은 3언어 모두 탈락, 뺀 종목을 바로 쓴 문장은 통과', () => {
  for (const id of ['bio_pulse', 'fintech_pulse']) for (const loc of sb.SECTOR_LOCALES) {
    const r = sb.checkSectorBriefNew(fx.stored[id][FIELD[loc]], loc, F(id));
    assert.ok(r.some(x => x.startsWith('ex-average')), `${id} ${loc} ${r}`);
  }
  const ok = {
    ko: ['7종 전부 하락, VKTX −5.54%로 낙폭 최대이며 VKTX 제외 평균 −1.64%로 약세가 폭넓게 관측 (10/23 정규장)',
      '7종 전부 하락, GILD 제외 평균 −2.44%로 선방 종목을 빼면 약세가 더 깊음 관측 (10/23 정규장)'],
    en: ['All 7 fell; VKTX −5.54% was the worst and the average ex-VKTX is −1.64%, so the decline is broad (10/23 REG).',
      'All 7 fell; excluding VKTX, the average is −1.64%, a broad decline (10/23 REG).'],
    ja: ['7銘柄すべて下落。VKTX −5.54%が最大の下げで、VKTXを除く平均は−1.64%と広範な弱さを観測（10/23 通常取引）'],
  };
  for (const [loc, ts] of Object.entries(ok)) for (const t of ts) assert.deepEqual(sb.checkSectorBriefNew(t, loc, F('bio_pulse')), [], t);
  const bad = {
    ko: ['7종 전부 하락, VKTX −5.54%로 낙폭 최대이며 VKTX 제외 평균 −2.44% 관측 (10/23 정규장)',
      '7종 전부 하락, VKTX 제외 평균 +1.64%로 약세 관측 (10/23 정규장)'],
    en: ['All 7 fell; excluding VKTX the average is −2.44% (10/23 REG).', 'All 7 fell; average ex-VKTX −2.44% (10/23 REG).'],
    ja: ['7銘柄すべて下落。VKTXを除く平均は−2.44%（10/23 通常取引）', '7銘柄すべて下落。VKTXを除く平均は+1.64%（10/23 通常取引）'],
  };
  for (const [loc, ts] of Object.entries(bad)) for (const t of ts)
    assert.ok(sb.checkSectorBriefNew(t, loc, F('bio_pulse')).includes('ex-average:VKTX'), `${loc} ${t}`);
  // 상승 섹터에서 선두를 뺀 평균을 선두 이름과 함께 쓰면 정상(운영 en 문장 형태)
  assert.deepEqual(sb.checkSectorBriefNew(fx.stored.cloud_fortress.headlineEN, 'en', F('cloud_fortress')), []);
});

test('결함 3: 직전 정규장 섹터 문장에 기준일이 없으면 사실 세션 표지를 붙인다(ko 7섹터), 당일·이미 있으면 그대로', () => {
  const prior = fx.facts.filter(f => f.priceDate !== fx.date).map(f => f.id);
  assert.deepEqual(prior, ['m7', 'silicon_core', 'power_matrix', 'bio_pulse', 'quantum_edge', 'fintech_pulse', 'cloud_fortress']);
  for (const id of prior) {
    const ko = fx.stored[id].headline;
    assert.equal(sb.hasPriceDate(ko, '2026-10-23'), false, id);
    assert.equal(sb.withPriceDateTag(ko, 'ko', F(id), fx.date), `${ko} (10/23 정규장)`);
    assert.equal(sb.withPriceDateTag(fx.stored[id].headlineEN, 'en', F(id), fx.date), fx.stored[id].headlineEN);
  }
  assert.equal(sb.withPriceDateTag('MU 선두 관측', 'ja', F('silicon_core'), fx.date), 'MU 선두 관측（10/23 通常取引）');
  assert.equal(sb.withPriceDateTag(fx.stored.physical_ai.headline, 'ko', F('physical_ai'), fx.date), fx.stored.physical_ai.headline);
  for (const t of ['10월 23일 정규장 MSFT 0.66% 상승, 나머지 하락 관측', '10/23 정규장 MSFT 0.66% 상승 관측']) {
    assert.equal(sb.hasPriceDate(t, '2026-10-23'), true);
    assert.deepEqual(sb.checkSectorBriefNew(t, 'ko', F('m7')), [], t);
  }
  assert.deepEqual(sb.checkSectorBriefNew('10月23日の通常取引でMSFT +0.66%、他は下落と観測', 'ja', F('m7')), []);
  // 선택 단계: 표지를 붙인 뒤 저장, 거래일을 안 주면 예전 그대로
  const parsed = { m7: { ko: fx.stored.m7.headline, en: fx.stored.m7.headlineEN, ja: fx.stored.m7.headlineJP } };
  assert.equal(sb.selectSectorBriefOutput(parsed, [F('m7')], fx.date).sectors.m7.headline, `${fx.stored.m7.headline} (10/23 정규장)`);
  assert.equal(sb.selectSectorBriefOutput(parsed, [F('m7')]).sectors.m7.headline, fx.stored.m7.headline);
});

test('운영 저장 문장 중 결함 없는 칸은 새 검사도 통과(과잉 탈락 0)', () => {
  assert.ok(sb.checkSectorBriefNew(fx.stored.quantum_edge.headline, 'ko', F('quantum_edge')).includes('ex-average-unnamed:1.16'));
  // quantum_edge ko «제외 평균 1.16%»는 뺀 종목 없는 맨 «제외 평균»(bio_pulse 결함과 같은 형태) — 새 검사가 거른다.
  const flagged = new Set(['quantum_edge:ko', 'cloud_fortress:ko', 'silicon_core:ko', 'bio_pulse:ko', 'bio_pulse:en', 'bio_pulse:ja', 'fintech_pulse:ko', 'fintech_pulse:en', 'fintech_pulse:ja']);
  for (const f of fx.facts) for (const loc of sb.SECTOR_LOCALES) {
    const t = fx.stored[f.id][FIELD[loc]];
    if (!t || flagged.has(`${f.id}:${loc}`)) continue;
    assert.deepEqual(sb.checkSectorBriefNew(sb.withPriceDateTag(t, loc, f, fx.date), loc, f), [], `${f.id} ${loc} ${t}`);
  }
});

test('실모델 dry 회귀: en «average ex-T X%»는 T 의 등락으로 읽지 않는다(바르게 묶이면 통과, 틀리면 ex-average 탈락)', () => {
  const ok = [['m7', 'Six of seven fell; average ex-GOOGL −0.43%, so the drop is broad rather than just the worst name (10/23 REG)'],
    ['bio_pulse', 'All seven fell; average ex-GILD −2.44%, so the decline spans nearly all members (10/23 REG)'],
    ['silicon_core', 'Six of seven rose; average ex-MU +0.97%, so the advance is broad and not just MU (10/23 REG)'],
    ['fintech_pulse', 'All 7 fell, with XYZ −3.24% and AFRM −3.20% (10/23 REG); average ex-UPST −2.11%, so the decline is not confined to one name']];
  for (const [id, t] of ok) assert.deepEqual(sb.checkSectorBriefNew(t, 'en', F(id)), [], t);
  assert.ok(sb.checkSectorBriefNew('Six of seven fell; average ex-GOOGL −0.75% (10/23 REG)', 'en', F('m7')).includes('ex-average:GOOGL'));
  // 종목 자신의 등락 오기는 그대로 탈락
  assert.ok(sb.checkSectorBriefNew('GOOGL −0.43% was the weakest (10/23 REG)', 'en', F('m7')).includes('stock-number:GOOGL'));
  assert.match(sb.buildSectorBriefPrompt(fx.facts, fx.session, fx.date).system, /Never use 先行\/선행/);
});

test('관문 10261816 반례: 제외 표현 뒤 종목 오기·다른 종목 제외 평균 오결속·날짜 표지로 언어 검사 우회 — 모두 탈락', () => {
  assert.notDeepEqual(sb.checkSectorBriefNew('Other than MSFT +6%, all 6 measured names fell (10/23 REG).', 'en', F('m7')), []);
  assert.deepEqual(sb.checkSectorBriefNew('Other than MSFT +0.66%, all 6 measured names fell (10/23 REG).', 'en', F('m7')), []);
  for (const [loc, t] of [['ko', 'GILD 선방 속 VKTX 제외 시 평균 −2.44%로 폭넓은 약세 관측 (10/23 정규장)'],
    ['ko', '7개 전부 하락, VKTX -5.54%를 제외해도 -2.44%로 약세가 넓게 관측, GILD 선방 (10/23 정규장)'],
    ['en', 'GILD held up best; excluding VKTX, the average was −2.44% (10/23 REG).'],
    ['en', 'GILD held up best; without VKTX the group averaged −2.44% (10/23 REG).'],
    ['ja', 'GILDが最も底堅く、VKTXを除いた場合の平均は−2.44%（10/23 通常取引）'],
    ['ja', 'GILDが底堅い一方、VKTX以外も−2.44%と広く下落（10/23 通常取引）']])
    assert.ok(sb.checkSectorBriefNew(t, loc, F('bio_pulse')).some(r => r.startsWith('ex-average')), `${loc} ${t}`);
  for (const [loc, t] of [['ko', 'GILD 선방 속 VKTX 제외 시 평균 −1.64%로 폭넓은 약세 관측 (10/23 정규장)'],
    ['ja', 'GILDが底堅い一方、VKTX以外も−1.64%と広く下落（10/23 通常取引）'],
    ['en', 'GILD held up best; without VKTX the group averaged −1.64% (10/23 REG).']])
    assert.deepEqual(sb.checkSectorBriefNew(t, loc, F('bio_pulse')), [], `${loc} ${t}`);
  // ja 칸에 영어 본문 + 붙인 일본어 표지 → 언어 검사 탈락(원문 기준)
  const parsed = { m7: { ko: fx.stored.m7.headline, en: fx.stored.m7.headlineEN, ja: 'MSFT rose while 6 of 7 measured names fell' } };
  const sel = sb.selectSectorBriefOutput(parsed, [F('m7')], fx.date);
  assert.equal(sel.sectors.m7.headlineJP, undefined);
  assert.ok(sel.rejected.some(r => r.includes('ja:language-or-min-length')));
});

test('실모델 표본 형태: 뒤붙임 ex-T·괄호 속 자기 등락·«나머지 N개 평균»은 바르게 묶이면 통과, 틀리면 탈락', () => {
  assert.deepEqual(sb.checkSectorBriefNew('All seven fell; average −2.20%, still −1.64% ex-VKTX, so the decline is broad (10/23 REG)', 'en', F('bio_pulse')), []);
  assert.ok(sb.checkSectorBriefNew('All seven fell; still −2.44% ex-VKTX (10/23 REG)', 'en', F('bio_pulse')).includes('ex-average:VKTX'));
  assert.deepEqual(sb.checkSectorBriefNew('On 10/23 REG, 5 of 7 rose, avg +1.57%; ex-DDOG (+4.62%) still +1.06%, showing broad participation', 'en', F('cloud_fortress')), []);
  assert.deepEqual(sb.checkSectorBriefNew('MSFT 강세에도 7개 중 6개 하락, 나머지 6개 평균 -0.75%로 약세가 넓게 확인됨(10/23 정규장 기준).', 'ko', F('m7')), []);
  assert.ok(sb.checkSectorBriefNew('VKTX −5.54%로 최약, 나머지 6개 평균 −2.44%로 약세 관측 (10/23 정규장)', 'ko', F('bio_pulse')).includes('ex-average:VKTX'));
  assert.ok(sb.checkSectorBriefNew('5개 중 LMT 1.16% 상승에 비해 ASTS −2.21% 하락 — 제외 평균 −0.61%로 LMT 의존 흐름 관측 (10/26 개장 전).', 'ko', F('orbit_defense')).some(r => r.startsWith('ex-average')));
});

test('«나머지 N종목 하락, 평균 X%»의 섹터 전체 평균은 제외 평균으로 묶지 않는다', () => {
  assert.deepEqual(sb.checkSectorBriefNew('MSFT 상승 속 나머지 6종목 하락, 평균 -0.55% 관측 (10/23 정규장)', 'ko', F('m7')), []);
  assert.deepEqual(sb.checkSectorBriefNew('10/23 정규장 기준 MSFT 제외 6개 하락, 평균 −0.55%; GOOGL 제외 시 −0.43%로 하락은 대체로 공유됨 관측', 'ko', F('m7')), []);
  assert.ok(sb.checkSectorBriefNew('MSFT 제외 6개 하락, 평균 −0.43% 관측 (10/23 정규장)', 'ko', F('m7')).some(r => r.startsWith('ex-average')));
  assert.deepEqual(sb.checkSectorBriefNew('10/23 通常取引では MSFT のみ上昇し、残り6銘柄は下落。平均 -0.55%、MSFTを除く平均 -0.75%で広く弱さを観測', 'ja', F('m7')), []);
});

test('관문 10261842 반례: 방향어 붙은 종목 등락·쉼표 뒤 틀린 제외 평균은 탈락, 다른 종목 값·앞붙임 ex-T 는 정상', () => {
  assert.ok(sb.checkSectorBriefNew('Other than MSFT down 0.75%, all 6 measured names fell (10/23 REG).', 'en', F('m7')).includes('stock-number:MSFT'));
  assert.ok(sb.checkSectorBriefNew('All 7 fell; excluding VKTX, the average was −2.20% (10/23 REG).', 'en', F('bio_pulse')).includes('ex-average:VKTX'));
  assert.deepEqual(sb.checkSectorBriefNew('MSFT 제외 6개 하락, 최대 낙폭 −1.24%로 약세 관측 (10/23 정규장)', 'ko', F('m7')), []);
  assert.deepEqual(sb.checkSectorBriefNew('Mean −2.44% ex-GILD; VKTX −5.54% was worst (10/23 REG).', 'en', F('bio_pulse')), []);
  assert.ok(sb.checkSectorBriefNew('Mean −1.64% ex-GILD; VKTX −5.54% was worst (10/23 REG).', 'en', F('bio_pulse')).includes('ex-average:GILD'));
  assert.deepEqual(sb.checkSectorBriefNew('Six of seven rose; average excluding MU +0.97%, so strength is shared (10/23 REG).', 'en', F('silicon_core')), []);
});

test('제외 평균 방향어 모순(부호 없이 «상승»·«up»)도 탈락', () => {
  assert.ok(sb.checkSectorBriefNew('7종 전부 하락, VKTX 제외 평균 1.64% 상승 관측 (10/23 정규장)', 'ko', F('bio_pulse')).includes('ex-average:VKTX'));
  assert.deepEqual(sb.checkSectorBriefNew('7종 전부 하락, VKTX 제외 평균 1.64% 하락으로 약세 확산 관측 (10/23 정규장)', 'ko', F('bio_pulse')), []);
  assert.ok(sb.checkSectorBriefNew('VKTXを除く平均は1.64%上昇（10/23 通常取引）', 'ja', F('bio_pulse')).includes('ex-average:VKTX'));
  assert.ok(sb.checkSectorBriefNew('All 7 fell; the average without VKTX was up 1.64% (10/23 REG).', 'en', F('bio_pulse')).includes('ex-average:VKTX'));
  assert.deepEqual(sb.checkSectorBriefNew('All 7 fell; the average without VKTX was down 1.64% (10/23 REG).', 'en', F('bio_pulse')), []);
});

test('관문 10261850 반례: «나머지 6종목 평균»에 전체 평균·부호와 방향어 모순은 탈락', () => {
  assert.ok(sb.checkSectorBriefNew('MSFT 상승, 나머지 6종목 평균 −0.55%로 약세 관측 (10/23 정규장)', 'ko', F('m7')).includes('ex-average:MSFT'));
  assert.ok(sb.checkSectorBriefNew('MSFTのみ上昇、残り6銘柄の平均−0.55%と弱さを観測（10/23 通常取引）', 'ja', F('m7')).includes('ex-average:MSFT'));
  assert.deepEqual(sb.checkSectorBriefNew('MSFT 상승, 나머지 6종목 평균 −0.75%로 약세 관측 (10/23 정규장)', 'ko', F('m7')), []);
  assert.ok(sb.checkSectorBriefNew('MU 제외 평균 +0.97% 하락으로 약세 확산 관측 (10/23 정규장)', 'ko', F('silicon_core')).includes('ex-average:MU'));
  assert.deepEqual(sb.checkSectorBriefNew('MU 제외 평균 +0.97% 상승으로 강세 확산 관측 (10/23 정규장)', 'ko', F('silicon_core')), []);
});
