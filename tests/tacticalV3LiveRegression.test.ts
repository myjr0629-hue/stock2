import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTacticalPrompt, checkTacticalOutput, tacticalIndexReasons, tacticalTokenRules, TACTICAL_GATE_MAX_CHARS } from '@/lib/ai/tacticalPrompt';
import { buildIndexFacts, type IndexFact } from '@/lib/ai/tacticalIndexFacts';
import { guardianNumsFromAiContext, guardianNumbersGate, guardianTokenRules } from '@/lib/ai/guardianNumbers';
import { deriveSessions, fixtureFromSnapshot } from '../scripts/tactical-v3-compare.cjs';

const fixture = JSON.parse(readFileSync('tests/fixtures/tactical-v3/live-1049-regression.json', 'utf8'));
const context = fixture.context;
const prompt = buildTacticalPrompt(context, 'ko');
assert.equal(context.indexBasis.futures.nq.live, false, '실입력은 live:false');
assert.deepEqual(buildIndexFacts(context.indexBasis, 'PRE', Date.parse(context.asOf)).map(f => f.id), ['nasdaq', 'spx'], 'live:false인 실입력의 정체 선물을 현재 사실에서 제외');
assert.equal(buildIndexFacts(context.indexBasis, 'PRE', Date.parse(context.asOf) + 21 * 60000).filter(f => f.kind === 'futures').length, 0, '낡은 선물 거절');
const futureTimestamp = structuredClone(context.indexBasis);
futureTimestamp.futures.nq.asOf = '2026-10-23T11:00:00Z';
assert.ok(!buildIndexFacts(futureTimestamp, 'PRE', Date.parse(context.asOf)).some(f => f.id === 'nq'), '미래 시각도 거절');
assert.match(prompt, /INDEX_FACTS_SPOT: 현물\(직전 정규장/);
assert.match(prompt, /INDEX_FACTS_FUTURES: 선물\(지금/);
assert.match(prompt, /420–520/);   // ★10/31 스토리형 길이(+30~50%)
assert.match(prompt, /Never use 매수, 매도, 買い, 売り, buy/);
assert.match(prompt, /lead with the consequence/);
assert.match(prompt, /breadth = how widely stocks are advancing/);

const first = '어제(10/22) 정규장에서 나스닥 종합은 2.6%, S&P500은 1.2% 내렸고, 지금 개장 전 나스닥100 선물은 보합(+0.03%), S&P500 선물은 0.2% 약세입니다.';
const why = '10/23 06:29 ET 보도는 AI 거래 약세와 국채 금리 급락으로 시장이 나뉘었다고 전했습니다.';
const soWhat = '반등을 받칠 힘이 약하고(시장 건강도 RLSI 31, 약함), 옵션 포지션(GEX)은 중립이라 흔들림을 키우지도 줄이지도 않습니다.';
const next = '다음 분기점은 10/23(금) 09:45 ET(한국 22:45) 예정된 S&P Global Composite PMI (Oct)로, 경기 신호가 약하면 주식의 부담이 커지고 강하면 누그러지는 구조입니다.';
const good = [first, why, soWhat, next].join(' ');
assert.deepEqual(checkTacticalOutput(good, 'ko', prompt), []);
assert.deepEqual(tacticalIndexReasons(first.replace('보합(+0.03%)', '보합'), prompt), []);
assert.ok(tacticalIndexReasons('어제 나스닥 종합은 2.6% 내렸습니다.', prompt).includes('tactical:premarket-futures-required'));
assert.ok(tacticalIndexReasons('지금 개장 전 나스닥100 선물은 보합입니다.', prompt).includes('tactical:premarket-spot-required'));
assert.ok(tacticalIndexReasons(first.replace('0.2% 약세', '0.2% 상승'), prompt).includes('tactical:index-direction'));
assert.deepEqual(tacticalIndexReasons(first.replace('0.2% 약세', '0.2%'), prompt), [], '이름·숫자가 맞고 반대 방향어가 없으면 통과');
assert.ok(tacticalIndexReasons(first.replace('2.6%', '2.5%'), prompt).includes('tactical:index-value'));
assert.deepEqual(tacticalIndexReasons(first.replace('1.2%', '1.21%'), prompt), [], '표시한 두 자리로 반올림 일치');
assert.ok(tacticalIndexReasons(first.replace('1.2%', '1.22%'), prompt).includes('tactical:index-value'));
assert.ok(tacticalIndexReasons(first.replace('보합(+0.03%)', '보합(-0.03%)'), prompt).includes('tactical:index-direction'));
assert.ok(tacticalIndexReasons(first.replace('0.2% 약세', '보합'), prompt).includes('tactical:index-direction'));
for (const value of [-0.106, -0.1, 0, 0.1, 0.149]) {  // 반올림 1자리 ±0.1 이내 = 보합 허용(실모델 10/23 20:33 NQ −0.106)
    const c = { ...context, indexFacts: context.indexFacts.map((f: IndexFact) => f.id === 'nq' ? { ...f, chgPct: value } : f) };
    assert.deepEqual(tacticalIndexReasons(first.replace('보합(+0.03%)', '보합'), buildTacticalPrompt(c, 'ko')), [], `flat boundary ${value}`);
}
for (const value of [-0.16, 0.16]) {
    const c = { ...context, indexFacts: context.indexFacts.map((f: IndexFact) => f.id === 'nq' ? { ...f, chgPct: value } : f) };
    assert.ok(tacticalIndexReasons(first.replace('보합(+0.03%)', '보합'), buildTacticalPrompt(c, 'ko')).includes('tactical:index-direction'));
}
// 날짜·시각을 한 뉴스에서 함께 대조. 내부 출처명 없이 통과하며 다른 날·시각·2개 인용은 거절한다.
for (const invalidWhy of [why.replace('10/23', '10/22'), why.replace('06:29', '06:28'), why.replace('06:29', '6:29'), why.replace(' ET', ''), why.replace('전했습니다.', '전했고, 같은 날 06:26 ET 보도도 있습니다.')]) {
    assert.ok(checkTacticalOutput([first, invalidWhy, soWhat, next].join(' '), 'ko', prompt).includes('tactical:news-source-time-required'));
}
assert.ok(checkTacticalOutput(good.replace('지금 개장 전', '06:36 ET 개장 전'), 'ko', prompt).includes('tactical:state-time-forbidden'));
for (const locale of ['ko', 'ja', 'en'] as const) {
    const rules = tacticalTokenRules(locale, { NDX_CHG: -2.6, SPX_CHG: -1.2, RLSI: 31 });
    assert.doesNotMatch(rules, /→ \{(?:NDX_CHG|SPX_CHG)\}/);
    assert.match(rules, /never use \{NDX_CHG\} or \{SPX_CHG\}/);
    assert.match(rules, /→ \{RLSI\}/);
    const cap = TACTICAL_GATE_MAX_CHARS[locale];
    const p = buildTacticalPrompt(context, locale);
    assert.ok(!checkTacticalOutput('x'.repeat(cap), locale, p).includes('tactical:too-long'));
    assert.ok(checkTacticalOutput('x'.repeat(cap + 1), locale, p).includes('tactical:too-long'));
}
assert.match(guardianTokenRules('ko', { NDX_CHG: -2.6 }), /→ \{NDX_CHG\}/, '기본 rotation/gamma 규칙 보존');
const { NDX_CHG, SPX_CHG, ...nums } = guardianNumsFromAiContext(context);
for (const row of fixture.outputs) {
    const p = buildTacticalPrompt(context, row.locale);
    const reasons = checkTacticalOutput(row.text, row.locale, p);
    // 실제 소수점·날짜·U.S.·Oct. 문장이 네 문장인데 탈락하던 사례 전부 재생.
    assert.ok(!reasons.includes('tactical:four-sentences'), `${row.session}/${row.repeat}/${row.locale}`);
    assert.equal(reasons.includes('tactical:too-long'), [...row.text].length > TACTICAL_GATE_MAX_CHARS[row.locale as 'ko' | 'en' | 'ja']);
    if (row.previousReasons.includes('tactical:advice')) assert.ok(reasons.includes('tactical:advice'), '권유 가드는 완화하지 않음');
    if (/\{(?:NDX_CHG|SPX_CHG)\}/.test(row.text)) {
        assert.ok(!guardianNumbersGate(row.text, nums).ok);
        assert.ok(reasons.includes('tactical:index-token-forbidden'));
    }
}
assert.ok(checkTacticalOutput(good.replace('반등을 받칠 힘', '매수하세요, 반등을 받칠 힘'), 'ko', prompt).includes('tactical:advice'));
// 파생 POST: 종가 이후 기준 없으면 미확인, 기준이 있으면 그 변화만 쓴다.
const preFixture = fixtureFromSnapshot({ context }, 'live-1049');
const post = deriveSessions(preFixture).find((f: any) => f.context.session === 'POST');
const postFirst = '오늘(10/22) 정규장에서 나스닥 종합은 2.6%, S&P500은 1.2% 내렸고, 지금 종가 이후 선물 변화는 미확인입니다.';
const noNews = '오늘 시장 전체를 움직인 뚜렷한 재료는 확인되지 않았습니다.';
assert.deepEqual(checkTacticalOutput([postFirst, noNews, soWhat, next].join(' '), 'ko', buildTacticalPrompt(post.context, 'ko')), []);
post.context.indexFacts.push({ ...context.indexFacts.find((f: IndexFact) => f.id === 'nq'), chgPct: 0.3 });
assert.deepEqual(checkTacticalOutput([postFirst.replace('종가 이후 선물 변화는 미확인', '장후 나스닥100 선물은 종가 시점 대비 0.3% 상승 중'), noNews, soWhat, next].join(' '), 'ko', buildTacticalPrompt(post.context, 'ko')), []);
console.log('통과 live-1049 실제 27문장 재생·정체 선물 제외·첫 문장·반올림·보합 경계·자리표·680/700/1150자·권유 보존·뉴스 날짜/시각·4문장·POST');

// 2차 실제 출력: 재생만 수행하며 새 실모델 통과율로 세지 않는다.
const r2 = JSON.parse(readFileSync('tests/fixtures/tactical-v3/r2-outputs.json', 'utf8'));
const derivedReg = deriveSessions(preFixture).find((f: any) => f.context.session === 'REG');
for (const row of r2.outputs) {
    const c = row.session === 'PRE' ? context : row.session === 'REG' ? derivedReg.context : post.context;
    const p = buildTacticalPrompt(c, row.locale);
    const reasons = checkTacticalOutput(row.text, row.locale, p);
    if (row.previousReasons.includes('tactical:four-sentences')) assert.ok(!reasons.includes('tactical:four-sentences'), `${row.session}/${row.locale}/${row.repeat}: 5문장 수용`);
    if (row.previousReasons.includes('tactical:too-long')) assert.ok(!reasons.includes('tactical:too-long'), `en ${[...row.text].length}자 수용`);
    if (row.session === 'REG') assert.ok(reasons.includes('tactical:session-mismatch'), '실제 REG의 장후 표현 재현·거부');
    if (row.previousReasons.includes('tactical:positioning-required')) assert.ok(reasons.includes('tactical:positioning-required'), '옵션 포지션 누락 검사는 유지');
}
for (const locale of ['ko', 'en', 'ja'] as const) {
    const p = buildTacticalPrompt(derivedReg.context, locale);
    const template = p.split('SESSION templates (FORMAT ONLY; replace every date, value and direction from INDEX_FACTS): ')[1].split('\n')[0];
    assert.doesNotMatch(template, /장후|개장 전|after-hours|premarket|時間外|取引開始前/);
    assert.match(p, /MANDATORY \/ 반드시 \/ 必ず: include options positioning/);
}
console.log('통과 r2 실제 27출력: 5문장·영어 길이 재생 / REG 장후 표현 거부 / 옵션 포지션 누락 거부 유지');
