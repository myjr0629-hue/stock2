/**
 * ★2026-10-31 T35-A 예정 일정 이름 한·일 표기 사전 — 출구 검사 대조(네트워크 0).
 *   ① 운영 /api/guardian/economic-calendar 10/31 03:5x KST 전수(91 본 이름)에 한·일 표기가 있다
 *   ② 10/30 운영 장애 문장(ko·ja 가 CFTC 이름을 번역) → 수리 전 탈락 / 수리 후 통과, 지난 일정·다른 일정·다른 시각은 그대로 탈락
 *   ③ 관문 10310351 지적: «청년 실업률»·«若年失業率» 오통과 금지, «2년물 국채 입찰»·«미시간대 소비자심리지수» 정상 문장 통과
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { knowsEventName, scheduledEventNameHits, eventCoreName, withEventNameGloss } from '@/lib/ai/scheduledEventNames';
import { scheduleClaimReasons, unsupportedEventReasons, tacticalNextReasons, checkTacticalStored } from '@/lib/ai/tacticalPrompt';

const fixture = JSON.parse(readFileSync('tests/fixtures/economic-calendar/observed-2026-10-31-names.json', 'utf8')) as { names: string[] };
const line = (name: string, date = '2026-10-30', time = '15:30') => `[economic calendar; ${date} ${time} ET] ${name} (scheduled; not a released result)`;
const AT_1740Z = Date.parse('2026-10-30T17:40:00Z');      // 13:40 ET — CFTC 15:30 ET 전
const AT_2000Z = Date.parse('2026-10-30T20:00:00Z');      // 16:00 ET — CFTC 지남
const CFTC4 = ['CFTC Crude Oil speculative net positions', 'CFTC Gold Speculative net positions', 'CFTC Nasdaq 100 speculative net positions', 'CFTC S&P 500 speculative net positions'].map(n => line(n));
const strict = (text: string, evidence: string[], now = AT_1740Z) => scheduleClaimReasons(text, evidence, now, 'strict');

// ① 운영 캘린더 전수
const missing = fixture.names.filter(n => { const k = knowsEventName(n); return !k.ko || !k.ja; });
assert.deepEqual(missing, [], `사전에 한·일 표기가 없는 운영 일정 이름: ${missing.join(', ')}`);
assert.ok(fixture.names.length >= 91);

// ② 10/30 장애 문장 재생(운영 저장본 ko 18:03:49Z·ja 17:37:41Z 의 일정 표기 + 로그의 «예정된 …» 형태)
const realKo = [
    '다음 시험대는 10/30(금) 15:30 ET 예정된 CFTC 원유 투기적 순포지션으로, 순매수가 늘면 유가 압력이 이어지고 줄면 누그러지는 쪽으로 읽힙니다.',
    '다음 분기점은 10/30(금) 15:30 ET 예정된 CFTC 원유 투기 순포지션 발표로, 늘어나면 유가 압력이 유지되고 줄어들면 완화됩니다.',
    '다음은 10/30(금) 15:30 ET에 예정된 원유 투기적 순포지션(CFTC) 발표로, 순매수 포지션이 늘면 유가 압력이 이어지고 줄면 완화됩니다.',
];
const realJa = [
    '次の材料は、10/30(金) 15:30 ET に予定されているCFTCの原油投機筋ネットポジション報告で、ネットロングが増えれば原油の圧力は続き、減れば和らぎます。',
    '次の試金石は10/30(金) 15:30 ET予定のCFTC原油投機筋ネットポジションで、増加なら原油高圧力が続き、減少なら和らぎます。',
];
for (const t of [...realKo, ...realJa]) {
    assert.deepEqual(strict(t, CFTC4), [], `수리 후 통과: ${t}`);
    assert.ok(strict(t, CFTC4, AT_2000Z).includes('schedule:claim-not-upcoming'), `지난 일정은 탈락: ${t}`);
    assert.ok(strict(t, CFTC4.slice(1)).length, `원유 줄이 없으면(금·나스닥·S&P 만) 탈락: ${t}`);
    assert.ok(strict(t, [line('CFTC Crude Oil speculative net positions', '2026-10-30', '15:31')]).length, `시각이 다르면 탈락: ${t}`);
    assert.ok(strict(t, [line('CFTC Crude Oil speculative net positions', '2026-10-31')], AT_1740Z).length, `날짜가 다르면 탈락: ${t}`);
}
// 같은 문장이 수리 전(사전 없음)엔 claim-not-upcoming 이었다 — 사전 표기를 지우면 재현된다
assert.ok(strict(realKo[0].replace('CFTC 원유 투기적 순포지션', '원유 선물 지표'), CFTC4).includes('schedule:claim-not-upcoming'), '사전 밖 표기는 예전처럼 탈락');
// 실모델 10/31 재생(12회 × ko·ja): 영어 이름이 번역 꼬리표로 갈라진 표기(«CFTC S&P 500 미결제약정(speculative net positions)») — main 검사 ko 1/12·ja 2/12 통과
const live = JSON.parse(readFileSync('tests/fixtures/economic-calendar/live-1031-cftc-next.json', 'utf8')) as { rows: Array<{ i: number; locale: string; next: string; mainReasons: string[] }> };
const LIVE_AT = Date.parse('2026-10-30T18:56:00Z');
let liveMainFail = 0;
for (const r of live.rows) {
    const next = r.next.replace(/\((?:한국|日本時間) \d{2}:\d{2}\)/g, '');
    if (r.mainReasons.includes('schedule:claim-not-upcoming')) liveMainFail++;
    assert.deepEqual(strict(next, CFTC4, LIVE_AT), [], `실모델 ${r.i}/${r.locale} 수리 후 통과: ${r.next}`);
    assert.ok(strict(next, CFTC4, AT_2000Z).includes('schedule:claim-not-upcoming'), `실모델 ${r.i}/${r.locale} 지난 일정은 탈락`);
    assert.ok(strict(next, CFTC4.filter(l => !l.includes('S&P 500')), LIVE_AT).length, `실모델 ${r.i}/${r.locale} S&P 500 줄이 없으면 탈락`);
}
assert.equal(liveMainFail, 20, 'main 검사 실패 20/24 재현');
// 갈라진 영어 이름: 낱말 전부·순서·한 번만 갈라짐·꼬리표에 영숫자 없음
const CRUDE = [line('CFTC Crude Oil speculative net positions')];
assert.deepEqual(strict('10/30(금) 15:30 ET 예정된 CFTC 원유 미결제약정(Crude Oil speculative net positions)', CRUDE), [], '«이름(번역)»과 같은 계약 — 꼬리표 번역 품질은 검사 대상 아님');
for (const t of ['10/30(금) 15:30 ET 예정된 CFTC 원유(speculative net positions)', '10/30(금) 15:30 ET 예정된 CFTC 원유 2주(Crude Oil speculative net positions)',
    '10/30(금) 15:30 ET 예정된 CFTC 원유(Crude Oil) 투기(speculative net positions)', '10/30(금) 15:30 ET 예정된 CFTC 금(Gold speculative net positions)',
    '10/30(금) 15:30 ET 예정된 CFTC 금 미결제약정(Crude Oil speculative net positions)', '10/30(금) 15:30 ET 예정된 CFTC 구리 미결제약정(Crude Oil speculative net positions)'])
    assert.ok(strict(t, CRUDE).length, `갈라진 이름 오인 금지: ${t}`);
// 저장본(claims)·생성(NEXT + 현지 시각) 경로도 같다
const prompt = `Write ... entirely in 한국어.\nAS_OF: 2026-10-30T17:40:00.000Z\nTODAY_NEWS: []\nSCHEDULED_EVENTS: ${JSON.stringify(CFTC4)}\n`;
const withLocal = realKo[0].replace('15:30 ET', '15:30 ET(한국 04:30)');
assert.deepEqual(tacticalNextReasons(withLocal, prompt, 'generate'), [], '생성 NEXT(현지 시각 병기)');
assert.deepEqual(checkTacticalStored(`앞 문장입니다. ${realKo[0]}`, prompt), []);
assert.ok(tacticalNextReasons(withLocal, prompt.replace('17:40:00', '20:00:00'), 'generate').includes('schedule:claim-not-upcoming'));

// ③ 관문 10310351 — 수식어가 붙은 다른 지표는 통과하지 않는다
const UR = [line('Unemployment Rate (Oct)', '2026-11-06', '08:30')];
const NOV5 = Date.parse('2026-11-05T15:00:00Z');
for (const t of ['11/6(금) 08:30 ET 예정된 실업률(U-6) 발표', '11/6(금) 08:30 ET 예정된 (U-6) 실업률', '11/6(금) 08:30 ET 예정된 실업률(Youth)', '11/6(금) 08:30 ET 예정된 실업률(청년) 발표', '11/6(금) 08:30 ET 예정된 (청년) 실업률', '11/6(金) 08:30 ET 予定の失業率(若年層)', '11/6(금) 08:30 ET 노인 실업률 예정', '11/6(금) 08:30 ET 여성 실업률 예정', '11/6(금) 08:30 ET 흑인 실업률 예정', '11/6(금) 08:30 ET 청년 실업률 예정', '11/6(금) 08:30 ET 예정된 청년실업률', '11/6(金) 08:30 ET 予定の若年失業率', '11/6(金) 08:30 ET 予定の若年層の失業率', '11/6(금) 08:30 ET 예정된 청년층의 실업률', '11/6(금) 08:30 ET 예정된 실업률 전월비', '11/6 08:30 ET Youth 실업률 예정'])
    assert.ok(strict(t, UR, NOV5).length, `오통과 금지: ${t}`);
for (const t of ['11/6(금) 08:30 ET 예정된 실업률(10월) 발표', '11/6(금) 08:30 ET 예정된 실업률(Unemployment Rate)', '11/6(금) 08:30 ET 예정된 실업률', '11/6(금) 08:30 ET 미국 실업률 발표 예정', '11/6(金) 08:30 ET 予定の米失業率'])
    assert.deepEqual(strict(t, UR, NOV5), [], `정상 통과: ${t}`);
// U-6 는 U-6 줄로만
assert.ok(strict('11/6(금) 08:30 ET 예정된 U-6 실업률', UR, NOV5).length);
assert.deepEqual(strict('11/6(금) 08:30 ET 예정된 U-6 실업률', [line('U-6 Unemployment Rate (Oct)', '2026-11-06', '08:30')], NOV5), []);
// 국채 입찰: 같은 만기만
const NOV10 = Date.parse('2026-11-10T15:00:00Z');
const AUC2 = [line('2-Year Note Auction', '2026-11-10', '13:00')];
assert.deepEqual(strict('11/10(화) 13:00 ET 2년물 국채 입찰 예정', AUC2, NOV10), []);
assert.deepEqual(strict('11/10(火) 13:00 ET 予定の2年国債入札', AUC2, NOV10), []);
assert.ok(strict('11/10(화) 13:00 ET 10년물 국채 입찰 예정', AUC2, NOV10).length, '다른 만기 입찰은 탈락');
assert.ok(strict('11/10(화) 13:00 ET 12년물 국채 입찰 예정', AUC2, NOV10).length, '숫자 경계');
assert.ok(strict('11/10(화) 13:00 ET 2년물 물가연동 국채 입찰 예정', AUC2, NOV10).length, 'TIPS ≠ 명목');
assert.deepEqual(unsupportedEventReasons('2년물 국채 입찰', AUC2.join('\n')), [], '국채 입찰 사건군 근거');
assert.ok(unsupportedEventReasons('국채 입찰', line('Housing Starts')).length, '근거 없는 사건군은 그대로 탈락');
// GDP·미시간: 차수를 쓰면 그 차수 줄만(관문 10310437 «속보치 예정» ↔ 확정치 줄)
const GDPF = [line('GDP Growth Rate QoQ Final (Q3)', '2026-12-22', '08:30')], GDPA = [line('GDP Growth Rate QoQ Adv (Q3)', '2026-12-22', '08:30')];
const DEC21 = Date.parse('2026-12-21T15:00:00Z');
assert.ok(strict('12/22(화) 08:30 ET GDP 성장률 속보치 예정', GDPF, DEC21).length, '속보치 ≠ 확정치');
assert.ok(strict('12/22(火) 08:30 ET 予定のGDP速報値', GDPF, DEC21).length);
assert.deepEqual(strict('12/22(화) 08:30 ET GDP 성장률 속보치 예정', GDPA, DEC21), []);
assert.deepEqual(strict('12/22(화) 08:30 ET GDP 성장률 확정치 예정', GDPF, DEC21), []);
assert.deepEqual(strict('12/22(화) 08:30 ET 예정된 GDP 성장률', GDPF, DEC21), [], '차수 없는 표기 = 같은 발표 묶음');
assert.ok(strict('11/13(금) 10:00 ET 미시간대 소비자심리지수 확정치 예정', [line('Michigan Consumer Sentiment Prel (Nov)', '2026-11-13', '10:00')], Date.parse('2026-11-13T13:00:00Z')).length, '예비≠확정');
assert.deepEqual(strict('11/13(금) 10:00 ET 미시간대 소비자심리지수 예비치 예정', [line('Michigan Consumer Sentiment Prel (Nov)', '2026-11-13', '10:00')], Date.parse('2026-11-13T13:00:00Z')), []);
// 미시간대 소비자심리지수
const MICH = [line('Michigan Consumer Sentiment (Nov)', '2026-11-13', '10:00')];
const NOV13 = Date.parse('2026-11-13T13:00:00Z');
assert.deepEqual(strict('11/13(금) 10:00 ET 미시간대 소비자심리지수 예정', MICH, NOV13), []);
assert.deepEqual(strict('11/13(金) 10:00 ET 予定のミシガン大学消費者信頼感指数', MICH, NOV13), []);
assert.ok(strict('11/13(금) 10:00 ET CB 소비자신뢰지수 예정', MICH, NOV13).length, 'CB ≠ 미시간');
// 근원·기간: 더 구체적인 이름은 그 줄로만
const CPI = [line('Inflation Rate YoY (Oct)', '2026-11-12', '08:30'), line('Inflation Rate MoM (Oct)', '2026-11-12', '08:30')];
const NOV11 = Date.parse('2026-11-11T15:00:00Z');
assert.ok(strict('11/12(목) 08:30 ET 근원 물가상승률 전년비 예정', CPI, NOV11).length, '근원은 근원 줄로만');
assert.deepEqual(strict('11/12(목) 08:30 ET 근원 물가상승률 전년비 예정', [...CPI, line('Core Inflation Rate YoY (Oct)', '2026-11-12', '08:30')], NOV11), []);
assert.deepEqual(strict('11/12(목) 08:30 ET 소비자물가 상승률 전년비 예정', CPI, NOV11), []);
assert.ok(strict('11/12(목) 08:30 ET 물가상승률 발표 예정', CPI, NOV11).length, '기간 없는 표기는 기간 없는 줄(Inflation Rate)로만(관문 10310550 ①)');
assert.deepEqual(strict('11/12(목) 08:30 ET 물가상승률 발표 예정', [...CPI, line('Inflation Rate (Oct)', '2026-11-12', '08:30')], NOV11), []);
const HS = [line('Housing Starts MoM (Oct)', '2026-11-18', '08:30')], NOV17 = Date.parse('2026-11-17T15:00:00Z');
assert.ok(strict('11/18(수) 08:30 ET 주택 착공 건수 발표 예정', HS, NOV17).length, '착공 건수 ≠ 착공 전월비');
assert.deepEqual(strict('11/18(수) 08:30 ET 주택 착공 건수 전월비 발표 예정', HS, NOV17), []);
assert.deepEqual(strict('11/18(수) 08:30 ET 주택 착공 건수 발표 예정', [line('Housing Starts (Oct)', '2026-11-18', '08:30')], NOV17), []);
assert.ok(strict('11/12(목) 08:30 ET 물가상승률 전분기 대비 예정', CPI, NOV11).length, '남은 기간 수식어는 다른 지표');
// API ≠ EIA · 휘발유 ≠ 원유
const NOV4 = Date.parse('2026-11-04T13:00:00Z');
assert.deepEqual(strict('11/4(수) 10:30 ET EIA 원유 재고 예정', [line('EIA Crude Oil Stocks Change (Oct/30)', '2026-11-04', '10:30')], NOV4), []);
assert.ok(strict('11/4(수) 10:30 ET API 원유 재고 예정', [line('EIA Crude Oil Stocks Change (Oct/30)', '2026-11-04', '10:30')], NOV4).length);
assert.ok(strict('11/4(수) 10:30 ET EIA 정제유 재고 변화 예정', [line('EIA Distillate Fuel Production Change (Oct/30)', '2026-11-04', '10:30')], NOV4).length, '생산량 ≠ 재고(관문 10310455)');
assert.deepEqual(strict('11/4(수) 10:30 ET EIA 정제유 재고 변화 예정', [line('EIA Distillate Stocks Change (Oct/30)', '2026-11-04', '10:30')], NOV4), []);
assert.ok(strict('11/4(수) 10:30 ET EIA 휘발유 재고 예정', [line('EIA Crude Oil Stocks Change (Oct/30)', '2026-11-04', '10:30')], NOV4).length);
// 연준 인사: 같은 사람·시각만, 지나면 탈락(T35 원인 사례 — 10/30 12:00 ET Fed Daly)
const DALY = [line('Fed Daly Speech', '2026-10-30', '12:00')];
const AT_1530Z = Date.parse('2026-10-30T15:30:00Z');
for (const t of ['10/30(금) 12:00 ET 예정된 데일리 샌프란시스코 연은 총재 연설', '10/30(금) 12:00 ET 연준 데일리 총재 연설 예정', '10/30(金) 12:00 ET 予定のデイリー・サンフランシスコ連銀総裁講演']) {
    assert.deepEqual(strict(t, DALY, AT_1530Z), [], t);
    assert.ok(strict(t, DALY, Date.parse('2026-10-30T16:01:00Z')).includes('schedule:claim-not-upcoming'), `지난 연설: ${t}`);
    assert.ok(strict(t, [line('Fed Barkin Speech', '2026-10-30', '12:00')], AT_1530Z).length, `다른 인사: ${t}`);
}
// JOLTS 대문자 약어(근거는 «JOLTs»)는 사전 표기 안에서만 이름으로 인정
const JOLTS = [line('JOLTs Job Openings (Sep)', '2026-11-03', '10:00')];
assert.deepEqual(strict('11/3(화) 10:00 ET JOLTS 구인건수 예정', JOLTS, Date.parse('2026-11-03T13:00:00Z')), []);
assert.ok(strict('11/3(화) 10:00 ET JOLTS 예정', JOLTS, Date.parse('2026-11-03T13:00:00Z')).length, '사전 표기 밖 약어는 예전처럼 탈락');

// 회사명 «비자»(V)가 «소비자» 안에서 잡히지 않는다 — 실제 비자 실적 주장은 그대로 V 줄을 요구
assert.ok(strict('11/13(금) 10:00 ET 비자 실적 예정', MICH, NOV13).length);

// 모닝 브리핑 줄 이름(괄호 없는 기간 «New Home Sales Sep»)·«영어 이름(번역)» 꼬리표
const NHS = ['[economic calendar; 2026-10-26 10:00 ET] New Home Sales Sep (scheduled; not a released result; consensus 0.7; previous 0.65)'];
const OCT26 = Date.parse('2026-10-26T12:00:00Z');
assert.deepEqual(strict('다음 분기점은 10/26(월) 10:00 ET 예정된 New Home Sales (Sep)(신규 주택 판매)로', NHS, OCT26), []);
assert.deepEqual(strict('다음 분기점은 10/26(월) 10:00 ET 예정된 신규 주택 판매로', NHS, OCT26), []);
assert.ok(strict('다음 분기점은 10/26(월) 10:00 ET 예정된 기존 주택 판매로', NHS, OCT26).length, '기존≠신규');
assert.deepEqual(strict('다음 분기점은 10/26(월) 10:00 ET 예정된 New Home Sales Sep(신규 주택 판매)로', NHS, OCT26), [], '괄호 없는 기간 이름 + 꼬리표');

// FOMC 성명 ≠ 금리 결정(관문 10310451 ①)
const FOMC = [line('Fed Interest Rate Decision', '2026-12-09', '14:00')];
const DEC9 = Date.parse('2026-12-09T15:00:00Z');
assert.deepEqual(strict('12/9(수) 14:00 ET 예정된 FOMC 금리 결정', FOMC, DEC9), []);
assert.ok(strict('12/9(수) 14:00 ET 예정된 FOMC 성명', FOMC, DEC9).length, 'FOMC 성명');
assert.ok(strict('12/9(水) 14:00 ET 予定のFOMC声明', FOMC, DEC9).length, 'FOMC声明');

// 회사명 인식은 기존대로(앞에 글자가 붙어도) — 관문 10310511 ① «미국테슬라»·«自動車メーカーテスラ» 는 TSLA 줄을 요구
const NVDA = ['[earnings calendar; 2026-10-21; 16:00 ET] NVDA (confirmed; scheduled; not a released result)'];
const OCT21 = Date.parse('2026-10-21T15:00:00Z');
assert.deepEqual(strict('10/21(수) 16:00 ET NVDA 실적 발표 예정', NVDA, OCT21), []);
assert.ok(strict('10/21(수) 16:00 ET NVDA와 미국테슬라 실적 발표 예정', NVDA, OCT21).length, '미국테슬라');
assert.ok(strict('10/21(水) 16:00 ET NVDAと自動車メーカーテスラの決算発表予定', NVDA, OCT21).length, '自動車メーカーテスラ');

// 사건군 근거 보강은 근거 줄 이름에서만(지시문 속 낱말 아님)
assert.equal(withEventNameGloss('no calendar lines'), 'no calendar lines');
assert.ok(withEventNameGloss(JSON.stringify([line('2-Year Note Auction')])).includes('국채 입찰'));
assert.equal(eventCoreName('API Crude Oil Stock Change (Oct/30)'), 'API Crude Oil Stock Change');
assert.deepEqual(scheduledEventNameHits('In regular trading the CPI report is due.'), [], '영어 원문은 사전이 아니라 기존 대조');

console.log(`통과 T35-A 사건 이름 사전: 운영 캘린더 ${fixture.names.length}종 한·일 표기 · 장애 문장 ${realKo.length + realJa.length}건·실모델 NEXT ${live.rows.length}건 재생 · 오통과/정상 탈락 회귀 0`);
