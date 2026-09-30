/**
 * 검색 표면 «판본» 판정 시험 — src/lib/seo/freshness.ts
 * 실행: node_modules/.bin/ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/seoFreshness.test.ts
 */
import assert from 'node:assert/strict';
import { seoFreshness, etDate } from '../src/lib/seo/freshness';

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✓ ${name}`); };
const H = 3600e3;

// 뉴욕 날짜 경계 — UTC 날짜로 재면 틀리는 곳
t('ET 날짜: 2026-09-25T03:00Z = 뉴욕 9/24 23:00', () => assert.equal(etDate('2026-09-25T03:00:00Z'), '2026-09-24'));
t('ET 날짜: 2026-09-26T02:30Z = 뉴욕 9/25 22:30', () => assert.equal(etDate('2026-09-26T02:30:00Z'), '2026-09-25'));
t('ET 날짜: 잘못된 값 → null', () => assert.equal(etDate(undefined), null));

// 금요일(9/25) 세션이 최신인 주말·월요일 아침
const FRI = '2026-09-25';
t('주말에 만든 사본은 신선(월요일 아침 60시간이어도 버리지 않는다)', () => {
    const f = seoFreshness({ generatedAt: '2026-09-27T12:00:00Z', payloadDpDate: FRI, sourceRead: true, session: FRI, rowDate: FRI, now: Date.parse('2026-09-28T12:00:00Z') });
    assert.deepEqual(f, { levelsFresh: true, basisMatch: true, proseFresh: true, levelsAsOf: null });
});
t('열흘 전 사본(9/18)은 낡음 → 제목에서 빼고 «09/18» 기준 표시', () => {
    const f = seoFreshness({ generatedAt: '2026-09-18T15:00:00Z', payloadDpDate: '2026-09-17', sourceRead: true, session: FRI, rowDate: FRI });
    assert.equal(f.levelsFresh, false); assert.equal(f.proseFresh, false); assert.equal(f.levelsAsOf, '09/18');
});
t('뉴욕 9/24 23:00 에 만든 사본은 9/25 세션보다 낡음(UTC 날짜로는 9/25 라 통과했을 것)', () => {
    const f = seoFreshness({ generatedAt: '2026-09-25T03:00:00Z', payloadDpDate: '2026-09-24', sourceRead: true, session: FRI, rowDate: FRI });
    assert.equal(f.levelsFresh, false); assert.equal(f.levelsAsOf, '09/24');
});
t('마감 뒤·적재 전에 만든 사본: 레벨은 신선, 해석은 전날 다크풀 위 → 해석만 숨김', () => {
    const f = seoFreshness({ generatedAt: '2026-09-25T23:30:00Z', payloadDpDate: '2026-09-24', sourceRead: true, session: FRI, rowDate: FRI });
    assert.deepEqual(f, { levelsFresh: true, basisMatch: false, proseFresh: false, levelsAsOf: null });
});
t('원천에 행이 없는 종목: 사본도 다크풀이 없으면 일치', () => {
    const f = seoFreshness({ generatedAt: '2026-09-26T01:00:00Z', payloadDpDate: null, sourceRead: true, session: FRI, rowDate: null });
    assert.equal(f.basisMatch, true); assert.equal(f.proseFresh, true);
});
t('원천에 행이 없는데 사본은 다크풀 날짜가 있음 → 불일치', () => {
    const f = seoFreshness({ generatedAt: '2026-09-26T01:00:00Z', payloadDpDate: '2026-09-24', sourceRead: true, session: FRI, rowDate: null });
    assert.equal(f.basisMatch, false); assert.equal(f.proseFresh, false);
});
t('이월 행(행 날짜 9/24, 세션 9/25): 해석이 9/24 위에 쓰였으면 일치', () => {
    const f = seoFreshness({ generatedAt: '2026-09-26T01:00:00Z', payloadDpDate: '2026-09-24', sourceRead: true, session: FRI, rowDate: '2026-09-24' });
    assert.equal(f.basisMatch, true); assert.equal(f.levelsFresh, true);
});

// 원천(EC2) 장애 — 기준일을 모르므로 시간으로만
const NOW = Date.parse('2026-09-28T14:00:00Z');
t('원천 장애 + 10시간 된 사본 → 신선', () => {
    const f = seoFreshness({ generatedAt: new Date(NOW - 10 * H).toISOString(), payloadDpDate: FRI, sourceRead: false, session: null, rowDate: null, now: NOW });
    assert.equal(f.levelsFresh, true); assert.equal(f.basisMatch, true);
});
t('원천 장애 + 40시간 된 사본 → 낡음', () => {
    const f = seoFreshness({ generatedAt: new Date(NOW - 40 * H).toISOString(), payloadDpDate: FRI, sourceRead: false, session: null, rowDate: null, now: NOW });
    assert.equal(f.levelsFresh, false); assert.equal(f.proseFresh, false);
});
t('생성 시각 없음 → 낡음, 기준일도 없음(본문에도 안 싣는다)', () => {
    const f = seoFreshness({ generatedAt: undefined, payloadDpDate: FRI, sourceRead: true, session: FRI, rowDate: FRI });
    assert.equal(f.levelsFresh, false); assert.equal(f.levelsAsOf, null);
});

console.log(`seoFreshness: ${n}/${n} 통과`);
