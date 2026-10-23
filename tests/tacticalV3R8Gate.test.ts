import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tacticalIndexReasons } from '../src/lib/ai/tacticalPrompt';
// 관문 10232340: ① INDEX_FACTS 비었을 때 정상 결측 표현 통과 ② PRE 현물 날짜 대조
const empty = 'SESSION: PRE\nINDEX_FACTS: []';
for (const s of ['지금 개장 전 지수 관측 자료가 없습니다', '現在、指数の観測データはありません', 'Index observations are not available right now'])
    assert.deepEqual(tacticalIndexReasons(s, empty), [], s);
assert.ok(tacticalIndexReasons('나스닥 종합은 2.6% 하락했고 관측 자료가 없습니다', empty).includes('tactical:index-unavailable'));
const facts = JSON.stringify([{ id: 'nasdaq', kind: 'spot', chgPct: -2.6, sessionDate: '2026-10-22' }]);
const pre = `SESSION: PRE\nINDEX_FACTS: ${facts}`;
assert.ok(tacticalIndexReasons('10/23 정규장에서 나스닥 종합은 2.6% 내렸습니다', pre).includes('tactical:cash-session-date'));
assert.ok(!tacticalIndexReasons('10/22(목) 정규장에서 나스닥 종합은 2.6% 내렸습니다', pre).includes('tactical:cash-session-date'));
assert.ok(readFileSync('src/lib/ai/tacticalPrompt.ts', 'utf8').includes("session === 'PRE' || session === 'REG'"));
console.log('통과 관문 10232340 결측 표현·PRE 날짜');
// PRE 는 날짜를 안 써도 탈락 아님(틀린 날짜만 탈락 — 오탈락 방지)
assert.ok(!tacticalIndexReasons('어제 정규장에서 나스닥 종합은 2.6% 내렸습니다', pre).includes('tactical:cash-session-date'));
console.log('통과 PRE 날짜 생략 허용');
