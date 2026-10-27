/** T2 10/28 — 장후 스냅샷 재계산 판정: 글이 종가 이후 선물 사실 없이 만들어졌고(표식) 지금은 그 사실이 있으면 다시 계산(5분 간격). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildMarketIndexBasis } from '@/lib/marketIndexBasis';
import { hasFuturesSinceCloseFact, postTacticalMayLackFutures, promptHasFuturesFacts, POST_TACTICAL_RETRY_MS } from '@/lib/ai/tacticalIndexFacts';

const MIN = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();
// 10/27 운영 실측값(EC2·Upstash 기준 키, 야후 캐시 20:24Z)
const nq = { symbol: 'NQ=F', price: 29797.5, changePct: 1.22, marketTime: '2026-10-27T20:14:05.000Z', lastChangeAt: '2026-10-27T20:24:07.239Z', source: 'YAHOO' };
const es = { symbol: 'ES=F', price: 7760.5, changePct: 0.6, marketTime: '2026-10-27T20:14:05.000Z', lastChangeAt: '2026-10-27T20:24:07.383Z', source: 'YAHOO' };
const refs = { nq: { symbol: 'NQ=F' as const, sessionDate: '2026-10-27', price: 29816.5, asOf: '2026-10-27T20:00:06.000Z' },
    es: { symbol: 'ES=F' as const, sessionDate: '2026-10-27', price: 7758.25, asOf: '2026-10-27T19:59:59.000Z' } };
const now = Date.parse('2026-10-27T20:24:13Z');
assert.equal(hasFuturesSinceCloseFact(buildMarketIndexBasis({ nq, es }, now, refs), now), true, '10/28 05:24 KST 운영 값 = 선물 사실 있음');
assert.equal(hasFuturesSinceCloseFact(buildMarketIndexBasis({ nq, es }, now, {}), now), false, '기준 없으면 없음');
assert.equal(hasFuturesSinceCloseFact(null, now), false);
const reg = Date.parse('2026-10-27T18:00:00Z');
assert.equal(hasFuturesSinceCloseFact(buildMarketIndexBasis({ nq: { ...nq, marketTime: iso(reg - MIN), lastChangeAt: iso(reg - MIN) } }, reg, refs), reg), false, 'REG 는 대상 아님');

const snap = '2026-10-27T20:01:29.469Z';   // 운영 장후 스냅샷 계산 시각(16:01 ET)
assert.equal(postTacticalMayLackFutures({ timestamp: snap }, 'POST', now), true, '표식 없는 옛 스냅샷(배포 전) = 대상');
assert.equal(postTacticalMayLackFutures({ timestamp: snap, tacticalFutures: false }, 'POST', now), true);
assert.equal(postTacticalMayLackFutures({ timestamp: snap, tacticalFutures: true }, 'POST', now), false, '선물 사실로 만든 글 = 반복 없음');
assert.equal(postTacticalMayLackFutures({ timestamp: iso(now - POST_TACTICAL_RETRY_MS + 1), tacticalFutures: false }, 'POST', now), false, '계산 뒤 5분 안은 쉼(실패·휴식 중 재시도 간격)');
assert.equal(postTacticalMayLackFutures({ timestamp: iso(now - POST_TACTICAL_RETRY_MS), tacticalFutures: false }, 'POST', now), true);
for (const s of ['REG', 'PRE', 'CLOSED', undefined]) assert.equal(postTacticalMayLackFutures({ timestamp: snap }, s, now), false, `${s} 무영향`);
assert.equal(postTacticalMayLackFutures(null, 'POST', now), false);
assert.equal(POST_TACTICAL_RETRY_MS, 5 * MIN);

assert.equal(promptHasFuturesFacts('SESSION: POST\nINDEX_FACTS: [{"id":"nq","kind":"futures"}]\n'), true);
assert.equal(promptHasFuturesFacts('SESSION: POST\nINDEX_FACTS: [{"id":"nasdaq","kind":"spot"}]\n'), false);
assert.equal(promptHasFuturesFacts('INDEX_FACTS: not-json'), false);
assert.equal(promptHasFuturesFacts(undefined), false);

const src = fs.readFileSync(path.join(__dirname, '../src/services/guardian/unifiedDataStream.ts'), 'utf8');
assert.equal((src.match(/await postTacticalNeedsFutures\(/g) || []).length, 2, 'Redis·메모리 두 캐시 경로');
assert.match(src, /rlsi\.session === 'POST' \? \{ tacticalFutures \} : \{\}/, '장후 스냅샷에 표식');
assert.match(src, /IntelligenceNode\.tacticalHasFutures\(locale, realityText\)/);
assert.match(src, /indexBasis: postBasis \?\? macro\.indexBasis/, '장후 생성 재료 지수 기준은 지금 다시 읽음');
console.log('통과 장후 스냅샷 재계산 판정(운영 10/27 값·표식·5분 간격·세션별·프롬프트 선물 사실)');
