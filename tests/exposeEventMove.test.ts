import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { ConfirmedEarnings } from '../src/lib/earningsConfirmed';
import type { ImpliedMove } from '../src/lib/impliedMove';

// 실제 계산·직렬화 경로를 사용하고, 저장소와 모든 부작용은 메모리에서 차단한다.
const store = new Map<string, unknown>();
const stub = (id: string, exports: unknown) => {
  const filename = require.resolve(id);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as any;
};
const forbidden = () => { throw new Error('unexpected write/network/warm'); };
globalThis.fetch = forbidden;
stub('../src/services/redisClient', {
  getFromCache: async (key: string) => store.get(key) ?? null,
  mgetFromCache: async (keys: string[]) => keys.map(key => store.get(key) ?? null),
  setInCache: forbidden,
});
stub('../src/services/structureService', {
  structureV2Key: (ticker: string) => `structure:v2:${ticker}`,
  structureLastGoodKey: (ticker: string) => `structure:lastgood:${ticker}`,
  peekStructureLevelsDetailed: async () => ({ levels: new Map(), noSnapshot: [] }),
  displayLevels: forbidden, warmMissingStructure: forbidden,
});
stub('../src/services/eodSnapshot', { readEodCloses: async () => null });
stub('../src/services/earningsActualsService', { readActualRecords: async () => new Map(), recordMapKey: (t: string, d: string) => `${t}|${d}` });
stub('../src/services/earningsImpliedLock', { acquireEarningsImpliedLock: forbidden });

const NOW = Date.parse('2026-10-12T12:00:00Z');
const date = '2026-10-16', session = '2026-10-09', expiry = '2026-11-20';
const entries: ConfirmedEarnings[] = ['SPLIT', 'MONTHLY', 'EMPTY'].map(ticker => ({
  ticker, date, hour: 'amc', sourceKind: 'company-pr', sourceUrl: 'https://example.test/earnings',
  announcedOn: session, verifiedAt: '2026-10-09T12:00:00Z', quote: 'fixture',
}));
const calendarRows = entries.map(({ ticker, date, hour }) => ({ ticker, date, hour, epsEstimate: 1.2 }));
stub('../src/services/earningsCalendarService', {
  EARNINGS_CALENDAR_CACHE_KEY: 'market:earnings-calendar:v4',
  getMarketEarningsCalendar: async () => ({ ok: true, cache: 'hit', payload: { ok: true, rows: calendarRows, fixture: 'preserve' } }),
});

const { NextRequest } = require('next/server');
const { atmStraddleImpliedMove, eodQuoteRows } = require('../src/lib/impliedMove') as typeof import('../src/lib/impliedMove');
const { splitMonthlyEvent } = require('../src/lib/earnings/eventMove') as typeof import('../src/lib/earnings/eventMove');
const { buildEarningsWeek } = require('../src/services/earningsWeekService') as typeof import('../src/services/earningsWeekService');
const { buildImpliedPack } = require('../src/services/earningsImpliedService') as typeof import('../src/services/earningsImpliedService');
const { mergeImpliedPacks, impliedForRow } = require('../src/lib/earnings/earningsImplied') as typeof import('../src/lib/earnings/earningsImplied');
const options = require('../src/app/api/options/implied-move/route') as typeof import('../src/app/api/options/implied-move/route');
const calendar = require('../src/app/api/market/earnings-calendar/route') as typeof import('../src/app/api/market/earnings-calendar/route');

const rows = (e: string, iv: number | null, s = session) => ['call', 'put'].map(contract_type => ({
  details: { expiration_date: e, strike_price: 100, contract_type },
  last_quote: { bid: 4.2, ask: 4.4 }, _intrinio: { date: s, eod: { iv } },
}));
const omitEvent = (value: any): any => Array.isArray(value) ? value.map(omitEvent)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value)
    // [10/31] implied.first(«발표 직후 첫 만기» 확인 표식)도 이번 추가 필드 — 기존 응답 비교에서만 뺀다.
    .filter(([key]) => key !== 'eventMovePct' && key !== 'first').map(([key, v]) => [key, omitEvent(v)])) : value;

(async () => {
  const realNow = Date.now;
  Date.now = () => NOW;
  try {
    const postRows = rows(expiry, 0.35), preRows = rows(date, 0.2);
    const post: ImpliedMove = atmStraddleImpliedMove(eodQuoteRows(postRows), 100, { expiry, chainDate: session })!;
    const split = splitMonthlyEvent(post, postRows, preRows, date, false);
    const expected = Math.round(Math.sqrt(0.35 ** 2 * 42 / 365 - 0.2 ** 2 * 41 / 365) * 1000) / 10;
    assert.equal(split.method, 'event-split'); assert.equal(split.eventMovePct, expected);
    const { method: _method, eventMovePct: _eventMovePct, ...observed } = split;
    assert.deepEqual(observed, post, '사건 분리 뒤에도 실제 스트래들 관측값 유지');
    const failures = [
      splitMonthlyEvent({ ...post, basis: 'live' }, postRows, preRows, date, false),
      splitMonthlyEvent(post, postRows, [], date, false),
      splitMonthlyEvent(post, postRows, rows(date, 0.2, '2026-10-08'), date, false),
      splitMonthlyEvent(post, rows(expiry, null), preRows, date, false),
      splitMonthlyEvent(post, postRows, rows(date, 0.9), date, false),
      splitMonthlyEvent(post, postRows, preRows, date, true),
    ];
    for (const failed of failures) { assert.equal(failed.method, 'monthly'); assert.equal(failed.eventMovePct, undefined); }
    for (const [ticker, im] of [['SPLIT', split], ['MONTHLY', failures[1]]] as const) {
      store.set(`structure:v2:${ticker}`, { timestamp: NOW, data: {
        options_status: 'OK', expiration: expiry, availableExpirations: [expiry], underlyingPrice: 100, impliedMove: im,
      } });
      store.set(`earnings:event-probe:v3:${ticker}:${date}:next`, { im, checkedAt: NOW });
    }
    const api = await (await options.GET(new NextRequest(`https://example.test/api/options/implied-move?t=SPLIT,MONTHLY,EMPTY&after=${date}&timing=amc`))).json();
    const plain = await (await options.GET(new NextRequest('https://example.test/api/options/implied-move?t=SPLIT'))).json();
    const week = await buildEarningsWeek(NOW, entries, { readOnly: true });
    const pack = await buildImpliedPack(calendarRows, NOW);
    store.set('earnings:implied:v1', pack);
    const response = await (await calendar.GET(new Request('https://example.test/api/market/earnings-calendar'))).json();
    const snapshot = omitEvent({ api, plain, week, calendar: response });
    // after 없는 요청의 method는 이번 추가 필드이므로 기존 응답 비교에서만 뺀다.
    delete snapshot.plain.results[0].method;
    const baselinePath = path.join(__dirname, 'fixtures/exposeEventMove.before.json');
    assert.deepEqual(snapshot, JSON.parse(fs.readFileSync(baselinePath, 'utf8')), '변경 전 모든 기존 필드·값 유지');
    assert.equal(api.results[0].eventMovePct, expected); assert.equal(api.results[0].method, 'event-split');
    assert.equal(plain.results[0].eventMovePct, expected); assert.equal(plain.results[0].method, 'event-split');
    assert.equal(week.rows.find(r => r.ticker === 'SPLIT')?.eventMovePct, expected);
    assert.equal(pack.cells[`SPLIT|${date}`].eventMovePct, expected);
    assert.equal(response.rows.find((r: any) => r.ticker === 'SPLIT').implied.eventMovePct, expected);
    for (const ticker of ['MONTHLY', 'EMPTY']) {
      assert.equal('eventMovePct' in api.results.find((r: any) => r.ticker === ticker), false);
      assert.equal('eventMovePct' in week.rows.find(r => r.ticker === ticker)!, false);
      const implied = response.rows.find((r: any) => r.ticker === ticker).implied;
      assert.ok(implied == null || !('eventMovePct' in implied));
    }
    // 마지막 정상본을 잇거나 구형 묶음을 읽을 때도 새 필드를 지어내거나 잃지 않는다.
    const empty = { ...pack, cells: { [`SPLIT|${date}`]: { p: null, e: null, b: null, s: null, r: 'read_failed' } } };
    const carried = mergeImpliedPacks(empty, pack, NOW, calendarRows);
    assert.equal(impliedForRow(calendarRows[0], carried, NOW)?.eventMovePct, expected);
    const legacy = structuredClone(pack);
    delete legacy.cells[`SPLIT|${date}`].eventMovePct;
    assert.equal('eventMovePct' in impliedForRow(calendarRows[0], legacy, NOW)!, false);
    console.log('exposeEventMove: event-split 성립·불성립 6조건, API·주간·캘린더 전달, 기존 응답 스냅샷·구형/이월 묶음 통과');
  } finally { Date.now = realNow; }
})().catch(error => { console.error(error); process.exitCode = 1; });
