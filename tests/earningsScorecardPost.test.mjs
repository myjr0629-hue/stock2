import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, renderDrafts, validateScorecard } from '../scripts/earnings-scorecard-post.mjs';

const row = (ticker, expectedPct, actualPct, check) => ({ ticker, date: '2026-10-13', hour: 'bmo',
  expectedPct, actualPct, beyond: Math.abs(actualPct) > expectedPct, check });
const rows = [row('AAA', 3, -5, 'intrinio_only'), row('BBB', 3, 3, 'fmp')];
// 합성 데이터: 운영 수치가 아니다.
const fixture = {
  v: 1, week: '2026-10-12', weekEnd: '2026-10-18', timezone: 'America/New_York',
  asOf: '2026-10-20T16:00:00.000Z', dataAsOf: '2026-10-13T21:00:00.000Z',
  source: { records: 'earnings:actuals:v1:{TICKER}:{date}', expected: 'pre-announcement ATM straddle / spot', actual: 'Intrinio closes' },
  rows, summary: { n: 2, withinCount: 1, beyondCount: 1, medianAbsActual: 4, medianExpected: 3,
    biggestSurprise: { ...rows[0], excessPctPoints: 2 } },
};
const empty = { ...fixture, rows: [], dataAsOf: null, summary: { n: 0, withinCount: 0, beyondCount: 0,
  medianAbsActual: null, medianExpected: null, biggestSurprise: null } };
let n = 0;
async function test(name, fn) { await fn(); n++; console.log(`✓ ${name}`); }
const dir = await mkdtemp(join(tmpdir(), 'signum-scorecard-'));
try {
  await test('3개 언어에 같은 수치·기간·대조·기간 차이·예측 아님 명시', () => {
    const drafts = renderDrafts(fixture);
    for (const loc of ['en', 'ja', 'ko']) {
      assert.match(drafts[loc], /2026-10-12–2026-10-18 ET/);
      assert.match(drafts[loc], /AAA.*−5\.0% vs ±3\.0%/);
      assert.match(drafts[loc], /Implied move reflects market pricing, not a forecast\./);
      assert.match(drafts[loc], /Intrinio/);
      assert.match(drafts[loc], /FMP/);
    }
    assert.match(drafts.en, /1 of 2 recorded earnings moves/);
    assert.match(drafts.ja, /2件中1件/); assert.match(drafts.ko, /2건 중 1건/);
    assert.match(drafts.en, /option expiry; actual reaction covers one session/);
  });
  await test('빈 기록은 통계 미계산, 최대 이탈을 지어내지 않음', () => {
    const drafts = renderDrafts(empty);
    assert.match(drafts.en, /no move statistics calculated/);
    assert.doesNotMatch(drafts.en, /0 of 0|biggest surprise|±0/i);
    assert.match(drafts.ja, /算出していません/); assert.match(drafts.ko, /계산하지 않았습니다/);
  });
  await test('전부 범위 내이면 최대 이탈 없음', () => {
    const only = { ...fixture, rows: [rows[1]], summary: { n: 1, withinCount: 1, beyondCount: 0,
      medianAbsActual: 3, medianExpected: 3, biggestSurprise: null } };
    assert.match(renderDrafts(only).en, /No recorded move exceeded/);
  });
  await test('주·요약·경계·check·중앙값·최대 이탈 불일치 거절', () => {
    for (const change of [
      { week: '2026-10-19' }, { weekEnd: '2026-10-16' }, { summary: { ...fixture.summary, n: 3 } },
      { rows: [{ ...rows[0], check: null }, rows[1]] }, { rows: [rows[0], { ...rows[1], beyond: true }] },
      { summary: { ...fixture.summary, medianExpected: 0 } },
      { summary: { ...fixture.summary, biggestSurprise: { ...rows[0], excessPctPoints: null } } },
      { summary: { ...fixture.summary, biggestSurprise: { ...rows[1], excessPctPoints: 2 } } },
    ]) assert.throws(() => validateScorecard({ ...fixture, ...change }, fixture.week));
  });
  await test('오프라인 CLI는 JSON + 3개 텍스트 파일 작성, 덮어쓰기 거절', async () => {
    const input = join(dir, 'input.json'), out = join(dir, 'offline');
    await writeFile(input, JSON.stringify(fixture));
    const args = ['--week', fixture.week, '--input', input, '--out', out];
    await main(args);
    assert.deepEqual((await readdir(out)).sort(), ['en.txt', 'ja.txt', 'ko.txt', 'scorecard.json']);
    assert.equal(await readFile(join(out, 'en.txt'), 'utf8'), renderDrafts(fixture).en);
    await assert.rejects(main(args), /EEXIST/);
  });
  await test('API 입력 모드는 지정 주 GET 1회뿐, HTTP 오류 때 파일 없음 (fetch 모의)', async () => {
    const requests = [];
    let status = 200;
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      requests.push([init.method, url.pathname + url.search]);
      assert.equal(init.redirect, 'error');
      return Response.json(status === 200 ? fixture : { error: 'unavailable' }, { status });
    };
    try {
      const base = 'http://localhost:3000';
      await main(['--week', fixture.week, '--base', base, '--out', join(dir, 'online')]);
      assert.deepEqual(requests, [['GET', '/api/earnings/scorecard?week=2026-10-12']]);
      status = 503;
      await assert.rejects(main(['--week', fixture.week, '--base', base, '--out', join(dir, 'failed')]), /HTTP 503/);
      await assert.rejects(readdir(join(dir, 'failed')), /ENOENT/);
    } finally { globalThis.fetch = realFetch; }
  });
  await test('잘못된 주·인자·인증정보 URL은 작업 전 거절', async () => {
    await assert.rejects(main(['--week', '2026-10-13']));
    await assert.rejects(main(['--unknown', 'x']));
    await assert.rejects(main(['--week', fixture.week, '--base', 'https://example.com/?query=disallowed']));
  });
  console.log(`${n} draft tests passed; local files/mocked fetch only`);
} finally { await rm(dir, { recursive: true, force: true }); }
