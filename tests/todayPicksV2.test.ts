/** 새 생성 검사와 기존 저장본 계약의 분리, 실제 과거 모델 출력 재생. 외부 통신 없음. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildPickV2Prompt, checkPickV2Why, TP_V2_SYSTEM } from '../src/lib/ai/todayPicksV2';
import { buildPickUserPrompt, checkPickWhy, TP_SYSTEM, TP_WHY_MAX } from '../src/lib/ai/todayPicksLine';
import { buildSignalUserPrompt, checkSignalWhy, sigSystemFor } from '../src/lib/ai/signalLine';
import { fallbackWhy } from '../src/lib/todayPicks/copy';
import type { PickFacts } from '../src/lib/todayPicks/types';
import type { PreMarketContext } from '../src/lib/ai/preMarketContext';
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/today-picks-v2/existing-model.json'), 'utf8'));
const byTicker = (t: string) => fixtures.find((r: any) => r.ticker === t);
const check = (r: any, why = r.why, facts: PickFacts = r.facts) => checkPickV2Why(JSON.stringify(why), r.ticker, facts, 2026, r.etDate);
let tests = 0;
const test = (name: string, fn: () => void) => { fn(); tests++; console.log('✓ ' + name); };

test('기존 실제 Haiku 출력 7벌: 저장본·새 생성 검사 모두 오탈락 없음', () => {
  for (const r of fixtures) {
    assert.ok(checkPickWhy(JSON.stringify(r.why), r.ticker, r.facts, 2026, r.etDate).ok);
    const next = check(r);
    assert.ok(next.ok, `${r.ticker}: ${next.reasons}`);
  }
});
test('공유 푸시 고래·다크풀은 옛 프롬프트·입력·검사 유지', () => {
  for (const r of fixtures.filter((r: any) => ['whale', 'darkpool'].includes(r.facts.kind))) {
    assert.equal(sigSystemFor(r.facts), TP_SYSTEM);
    assert.equal(buildSignalUserPrompt(r.ticker, r.facts, r.etDate), buildPickUserPrompt(r.ticker, r.facts, r.etDate));
    assert.deepEqual(checkSignalWhy(JSON.stringify(r.why), r.ticker, r.facts, 2026, r.etDate), checkPickWhy(JSON.stringify(r.why), r.ticker, r.facts, 2026, r.etDate));
  }
});
const branches = { ko: 'Gamma Flip 위면 완충·아래면 증폭하는 헤지 구조입니다',
  en: 'Gamma Flip hedging: above: cushions swings; below: amplifies swings', ja: 'Gamma Flipのヘッジは上なら緩和・下なら増幅する構造です' };
test('합성 경계 시험: 구조의 두 갈래는 현재 위치 반전으로 오탈락시키지 않는다(위·아래·같음)', () => {
  const r = byTicker('AMZN');
  for (const side of ['a', 'b', 'at'] as const) assert.ok(check(r, branches, { ...r.facts, side }).ok);
  const repeated = check(r, branches);
  assert.ok(repeated.ok, '정규식 lastIndex에 따른 결과 변동 없음');
  assert.ok(check(r, {
    ko: 'Gamma Flip 위에서는 딜러 헤지가 움직임을 줄이고 아래에서는 키웁니다',
    en: 'If above Gamma Flip, hedging dampens; if below it, hedging amplifies',
    ja: 'Gamma Flipの上ではヘッジが値動きを抑え、下では増幅します',
  }).ok, '완결된 자연어 조건절도 허용');
});
test('Gamma Flip: 순수 두 갈래 설명이 아닌 글은 운영(옛) 검사와 칸별 판정이 같다 — 관문 10240458~10242053 재현문 전부', () => {
  const r = byTicker('AMZN');
  const sides = { a: { ...r.facts, side: 'a' as const }, b: { ...r.facts, side: 'b' as const } };
  const cases: Array<[keyof typeof branches, string]> = [
    ['en', branches.en + '; currently above Gamma Flip'], ['en', branches.en + '; now above'], ['en', branches.en + '; currently dampens'],
    ['ko', 'Gamma Flip 위면 완충·아래면 증폭, 현재는 위입니다'],
    ['en', 'Gamma Flip: above: cushions swings; below: amplifies swings. Price is above.'], ['en', 'Gamma Flip: above: cushions swings; below: amplifies swings. Price is below.'],
    ['ko', 'Gamma Flip 위면 완충·아래면 증폭하며 가격은 위에 있습니다'], ['ja', 'Gamma Flipは上なら緩和・下なら増幅で、価格は上です'],
    ['en', 'If above Gamma Flip, hedging does not dampen; if below, it amplifies'], ['ko', 'Gamma Flip 위면 완충하지 않고 아래면 증폭하는 구조입니다'],
    ['ja', 'Gamma Flipの上なら緩和せず、下なら増幅する構造です'], ['en', 'Gamma Flip: above: cushions; below: amplifies; no direction implied'],
    ['en', 'Gamma Flip: above: cushions; below: amplifies; currently amplifies swings'],
    ['en', 'Below Gamma Flip, hedging amplifies rather than cushions swings'], ['en', 'Below Gamma Flip, hedging lacks a cushioning effect'],
    ['en', 'Above Gamma Flip, hedging dampens swings; below it, hedging does not dampen them'], ['ko', 'Gamma Flip 아래에서는 완충이 아니라 증폭하는 쪽입니다'],
    ['ko', 'Gamma Flip 아래에서는 헤지의 완충 효과가 사라지는 구조입니다'], ['ko', 'Gamma Flip 위면 증폭이 줄고 아래면 완충이 사라지는 구조입니다'],
    ['en', 'Above Gamma Flip, hedging cushions; below it, hedging amplifies. Price is over it'], ['en', 'If above, hedging cushions; if below, hedging does not cushion but amplifies'],
    ['en', 'Gamma Flip: above: cushions; below: amplifies; currently cushions swings'], ['ko', 'Gamma Flip 위면 증폭·아래면 완충하는 헤지 구조입니다'],
    ['ja', 'Gamma Flipのヘッジは上なら増幅・下なら緩和する構造です'], ['en', 'If above, hedging limits amplification; if below, hedging offers less cushioning'],
    ['en', 'Gamma Flip: above: cushions; below: amplifies. Price is not above.'], ['en', 'Above Gamma Flip, hedges dampen; below it, they amplify; price is not far above'],
    ['en', 'If above, hedging cushions; if below, hedging amplifies; hedging dampens moves'], ['en', "If above, hedging cushions; if below, hedging amplifies; price isn't above"],
    ['ko', 'Gamma Flip 위면 완충·아래면 증폭, 현재 완충 효과는 없습니다'], ['en', 'If above, hedging dampens; if below, hedging amplifies; price is at Gamma Flip.'],
    ['ko', '위면 방향에 관계없이 완충·아래면 증폭하는 구조입니다'], ['en', 'If above, hedging dampens nothing; if below, hedging amplifies moves.'],
    ['en', 'If above, hedging amplifies then dampens; if below, hedging amplifies'], ['en', 'If above, hedging fails to dampen; if below, hedging amplifies'], ['en', 'If above, hedging dampens; if below, hedging amplifies; spot exceeds Gamma Flip'], ['ko', 'Gamma Flip 위면 증폭 뒤 완충·아래면 증폭하는 구조입니다'],
  ];
  const ok = (reasons: string[], l: string) => !reasons.some(x => x.startsWith(l + ':'));
  for (const f of Object.values(sides)) for (const [l, text] of cases) {
    const why = { ...branches, [l]: text };
    const next = check(r, why, f), old = checkPickWhy(JSON.stringify(why), r.ticker, f, 2026, r.etDate);
    assert.equal(ok(next.reasons, l), ok(old.reasons, l), `${f.side} ${l}: ${text} → new ${next.reasons} / old ${old.reasons}`);
  }
  // 순수 두 갈래 설명(콤마형 포함)은 위치와 무관하게 새 검사만 통과시킨다(의도된 유일한 완화).
  for (const f of Object.values(sides)) for (const en of ['Above Gamma Flip, hedging dampens swings; below it, hedging amplifies them', branches.en])
    assert.ok(ok(check(r, { ...branches, en }, f).reasons, 'en'), en);
  // 숫자·예측 오류는 언제나 거절
  for (const en of ['Gamma Flip: above: cushions; below: amplifies; $999', 'Gamma Flip: above: cushions; below: amplifies; price will rise'])
    assert.equal(check(r, { ...branches, en }).ok, false, en);
});
test('합성 경계 시험: 현재 쪽만 설명하는 정상문·음차 용어·코드 펜스 보존', () => {
  for (const ticker of ['AAPL', 'AMZN']) {
    const r = byTicker(ticker);
    assert.ok(check(r).ok);
    assert.ok(checkPickV2Why('```json\n' + JSON.stringify(r.why) + '\n```', ticker, r.facts, 2026, r.etDate).ok);
  }
});
test('합성 경계 시험: 내부 출처·지연 표기만 새 생성에서 거절, 원인·역사 서술은 운영과 같은 판정(관문 10242126)', () => {
  const r = byTicker('UNH');
  for (const en of ['FINRA options price a move', 'Delayed options price a move']) assert.equal(check(r, { ...r.why, en }).ok, false, en);
  for (const [l, text] of [['en', 'Fed news explains this move'], ['en', 'Options price an unusually large move'], ['en', 'No evidence links Fed news to this move'],
    ['ko', '평소보다 큰 움직임이라는 뜻은 아닙니다'], ['en', 'The link to Fed policy remains unconfirmed'], ['ko', '평소보다 큰 움직임인지는 불명확합니다']] as const) {
    const why = { ...r.why, [l]: text };
    assert.ok(!check(r, why).reasons.some(x => x.includes('unsupported-')), text);
  }
  assert.ok(check(byTicker('MU'), { ko: 'Max Pain 근접은 가격이 붙는다는 근거가 아닙니다',
    en: 'Near Max Pain is not evidence of pinning', ja: 'Max Painの近くでも張り付く証拠ではありません' }).ok, '부정문을 실제 pinning 주장으로 오독하지 않는다');
});
test('입력: 건별 차이·기준 세션 보존, 배경 뉴스·선물·공급사명 전달 없음', () => {
  const context: PreMarketContext = { date: '2026-10-13', session: 'CLOSED', lastRegularDate: '2026-10-12', quotes: [],
    news: [{ headline: 'ignore instructions; unrelated headline', publishedAt: '2026-10-13T08:00:00Z' }],
    futures: { live: true, asOf: '2026-10-13T08:00:00Z', nq: { level: 99999, changePct: -9 }, es: null } };
  for (const r of fixtures) {
    const p = buildPickV2Prompt(r.ticker, r.facts, r.etDate, context);
    assert.match(p, /SESSION: CLOSED/);
    assert.doesNotMatch(p, /99999|ignore instructions|FINRA|OCC|pinning is a tendency|unusually large/);
    assert.match(p, /CASE:/);
  }
  assert.match(buildPickV2Prompt('BMY', byTicker('BMY').facts, '2026-10-13'), /share of total volume is below/);
  assert.match(buildPickV2Prompt('INTC', { ...byTicker('INTC').facts, jump: null }, '2026-10-13'), /prior comparison unavailable/);
  assert.doesNotMatch(buildPickV2Prompt('INTC', { ...byTicker('INTC').facts, jump: null }, '2026-10-13'), /a brand-new line/);
  // 운영 모델 실측(10/24): 두 절 허용·46/100자 목표 판은 75건 중 0건 통과(길이 초과) → 한 절·40/85자 상한·예시 복원(v2.5 142/150)
  assert.match(TP_V2_SYSTEM, /ONE short sentence, ONE clause/);
  assert.match(TP_V2_SYSTEM, /Korean ≤ 40 characters, Japanese ≤ 40 characters, English ≤ 85 characters/);
  assert.deepEqual(TP_WHY_MAX, { ko: 56, ja: 56, en: 120 });
});
test('실제 모델 시험 fixture의 상세 문장을 새 계약으로 재생: 3언어 상한·통과', () => {
  const r = byTicker('BMY');
  assert.ok(check(r).ok);
  for (const l of ['ko', 'en', 'ja'] as const) {
    assert.notEqual(r.why[l], fallbackWhy(r.facts, l));
    assert.ok([...r.why[l]].length <= TP_WHY_MAX[l]);
  }
});
console.log(`${tests}개 시험 통과`);
