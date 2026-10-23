import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTacticalPrompt, checkTacticalOutput, checkTacticalStored, tacticalIndexReasons, unsupportedEventReasons, scheduleClaimReasons } from '@/lib/ai/tacticalPrompt';
import { buildIndexFacts, type IndexFact } from '@/lib/ai/tacticalIndexFacts';
import { checkDepthLine } from '@/lib/ai/watchlistDepth';
import { deriveSessions, fixtureFromSnapshot } from '../scripts/tactical-v3-compare.cjs';

const fixture = JSON.parse(readFileSync('tests/fixtures/tactical-v3/r4-outputs.json', 'utf8'));
const locales = ['ko', 'en', 'ja'] as const;
assert.equal(fixture.outputs.length, 27);
let passed = 0;
for (const row of fixture.outputs) {
    const p = buildTacticalPrompt(fixture.contexts[row.session], row.locale);
    const reasons = checkTacticalOutput(row.text, row.locale, p);
    const previousSession = row.session === 'REG' && /어제|yesterday|昨日/i.test(row.text);
    const expected = row.session === 'REG' ? [...(previousSession ? ['tactical:session-mismatch'] : []), 'tactical:index-unavailable']
        : row.session === 'PRE' && row.locale === 'en' && row.repeat === 3 ? ['tactical:too-long'] : [];
    assert.deepEqual(reasons, expected, `${row.session}/${row.locale}/${row.repeat}`);
    assert.ok(!reasons.includes('event:unsupported:7'));
    assert.ok(!reasons.includes('tactical:index-change-required'));
    if (!reasons.length) passed++;
    if (row.session === 'POST') assert.deepEqual(checkTacticalStored(row.text, p), []);
}
assert.equal(passed, 17, '실제 출력 재검사: 새 실모델 생성 통과율이 아님');

// REG의 실제 숫자 없는 선물 서술도 근거가 없으면 거절. 현물 값·방향·날짜 검사는 유지.
const reg = fixture.contexts.REG;
for (const locale of locales) {
    const prompt = buildTacticalPrompt(reg, locale);
    const facts = JSON.parse(prompt.match(/^INDEX_FACTS: (.*)$/m)![1]);
    assert.ok(facts.length && facts.every((f: IndexFact) => f.kind === 'spot'));
    const row = fixture.outputs.find((r: any) => r.session === 'REG' && r.locale === locale && r.repeat === 1);
    const first = row.text.split(locale === 'ja' ? '。' : /(?<!\d)\.(?!\d)/)[0];
    const current = first.replace('어제(10/22)', '10/22');
    assert.deepEqual(tacticalIndexReasons(current, prompt), ['tactical:index-unavailable']);
    // 새 생성 계약에 맞는 현물 전용 문장은 통과한다(원문 fixture는 수정하지 않음).
    const cashOnly = current.slice(0, current.indexOf({ ko: ', 현재', en: '; Nasdaq 100', ja: '、現在' }[locale]));
    assert.deepEqual(tacticalIndexReasons(cashOnly, prompt), []);
    assert.ok(tacticalIndexReasons(current.replace('2.6%', '2.5%'), prompt).includes('tactical:index-value'));
    assert.ok(tacticalIndexReasons(current.replace('10/22', '10/21'), prompt).includes('tactical:cash-session-date'));
    const noSpotNumber = current.replace('2.6%', '').replace('1.2%', '');
    assert.ok(tacticalIndexReasons(noSpotNumber, prompt).includes('tactical:index-change-required'));
    const futureOnly = { ko: '나스닥100 선물은 보합입니다.', en: 'Nasdaq 100 futures are flat.', ja: 'ナスダック100先物は横ばいです。' }[locale];
    assert.ok(tacticalIndexReasons(futureOnly, prompt).includes('tactical:regular-spot-required'));
    const fallback = buildTacticalPrompt({ ...reg, indexFacts: reg.indexFacts.filter((f: IndexFact) => f.kind === 'futures') }, locale);
    assert.match(fallback, new RegExp({ ko: 'INDEX_FACTS_SPOT: 현물 관측 없음', en: 'INDEX_FACTS_SPOT: cash observations unavailable', ja: 'INDEX_FACTS_SPOT: 現物観測なし' }[locale]));
    const fallbackFirst = { ko: '현물 관측 없음, 나스닥100 선물은 소폭 하락 중입니다.', en: 'Cash observations unavailable; Nasdaq 100 futures are slightly lower.', ja: '現物観測なし、ナスダック100先物は小幅下落中です。' }[locale];
    assert.ok(tacticalIndexReasons(fallbackFirst, fallback).includes('tactical:index-direction'), 'NQ 사실은 +0.0163%: 하락 서술은 거절');
    const flatFirst = { ko: '현물 관측 없음, 나스닥100 선물은 보합입니다.', en: 'Cash observations unavailable; Nasdaq 100 futures are flat.', ja: '現物観測なし、ナスダック100先物は横ばいです。' }[locale];
    assert.deepEqual(tacticalIndexReasons(flatFirst, fallback), [], '숫자 없는 REG 선물도 근거와 보합 방향이 맞으면 통과');
    assert.ok(tacticalIndexReasons(fallbackFirst.replace(/소폭|slightly|小幅/, '9%'), fallback).includes('tactical:index-value'));
}
const at = Date.parse(reg.asOf);
assert.ok(buildIndexFacts(reg.indexBasis, 'REG', at).every(f => f.kind === 'spot'));
const absent = structuredClone(reg.indexBasis);
absent.cash.nasdaq.price = null;
absent.cash.spx.price = null;
const fallbackFacts = buildIndexFacts(absent, 'REG', at);
assert.ok(fallbackFacts.length && fallbackFacts.every(f => f.kind === 'futures'));
const oneSpot = structuredClone(absent);
oneSpot.cash.nasdaq = reg.indexBasis.cash.nasdaq;
assert.deepEqual(buildIndexFacts(oneSpot, 'REG', at).map(f => f.id), ['nasdaq']);
const derived = deriveSessions(fixtureFromSnapshot({ context: fixture.contexts.PRE }, 'r4 market fields'));
assert.ok(derived.find((f: any) => f.context.session === 'REG').context.indexFacts.every((f: IndexFact) => f.kind === 'spot'));

// POST/CLOSED: 독자 시간대의 상대 낱말은 무시, 날짜 누락·틀린 날짜와 현재 현물 진행형은 거절.
for (const session of ['POST', 'CLOSED'] as const) for (const locale of locales) {
    const ctx = { ...fixture.contexts.POST, session };
    const prompt = buildTacticalPrompt(ctx, locale);
    const row = fixture.outputs.find((r: any) => r.session === 'POST' && r.locale === locale);
    for (const word of locale === 'ko' ? ['어제', '오늘', ''] : locale === 'en' ? ['yesterday', 'today', ''] : ['昨日', '本日', '']) {
        const text = locale === 'ko' ? row.text.replace('어제(10/22)', `${word}(10/22)`)
            : locale === 'en' ? row.text.replace('the 10/22', `${word} (10/22)`)
                : row.text.replace('10/22', `${word}(10/22)`);
        assert.deepEqual(checkTacticalOutput(text, locale, prompt), []);
        assert.deepEqual(checkTacticalStored(text, prompt), []);
        for (const bad of [text.replace('10/22', '10/21'), text.replace('10/22', '')]) {
            assert.ok(checkTacticalOutput(bad, locale, prompt).includes('tactical:cash-session-date'));
            assert.deepEqual(checkTacticalStored(bad, prompt), [], '복구는 현재 날짜와 대조하지 않음');
        }
    }
}

// 공유 사건 판정의 세 호출 경로: 생성, 엄격 일정 주장, 내 종목 해석. 근거 없는 전쟁은 계속 거절.
const variants = ['war', 'wars', 'warfare', 'wartime', 'conflict', 'conflicts', 'military strike', 'military strikes', 'airstrike', 'airstrikes', 'missile', 'missiles'];
for (const word of variants) for (const text of ['전쟁 관련 보도', 'conflict report', '戦争の報道']) {
    assert.deepEqual(unsupportedEventReasons(text, `Iran ${word}`), []);
    assert.deepEqual(unsupportedEventReasons(text, 'Oil prices rise'), ['event:unsupported:7']);
}
for (const word of ['reward', 'warranty', 'conflicting', 'airstriker']) assert.deepEqual(unsupportedEventReasons('전쟁 보도', word), ['event:unsupported:7']);
const news = 'FACTS — XOM\nTOP EVIDENCE [news]: company headline\nU.S. oil rises above $100 as Iran says it is prepared for warfare';
assert.deepEqual(checkDepthLine('전쟁 소식이 옵션 지지선을 시험하는 자리', 'ko', news), []);
assert.ok(checkDepthLine('전쟁 소식이 옵션 지지선을 시험하는 자리', 'ko', news.replace('warfare', 'negotiations')).includes('event:unsupported:7'));
const upcoming = '[economic calendar; 2026-10-23 09:45 ET] warfare briefing (scheduled; not a released result)';
const claim = 'Conflict briefing scheduled 10/23 09:45 ET';
assert.deepEqual(scheduleClaimReasons(claim, [upcoming], Date.parse('2026-10-23T12:00:00Z'), 'strict'), []);
assert.ok(scheduleClaimReasons(claim, [upcoming.replace('warfare', 'oil')], Date.parse('2026-10-23T12:00:00Z'), 'strict').includes('event:unsupported:7'));
console.log('통과 r4 실제 27출력(17통과·근거 없는 REG 선물 9/영어 길이 1 거절), REG 현물 우선·결측 선물·숫자, POST 날짜 숫자, 공유 사건 3경로');
