// 관문 11050040·11050108 수리 시험 — ① 배너(실적 의도 종목만 SIGNUM) ② 직전 기록 조회(포인터 + 기록, 키 2개 이하) ③ 문구 = 값의 정의(3언어·메타·JSON-LD)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { CONFIRMED_EARNINGS } from '../src/lib/earningsConfirmed';
import { record } from './earningsScorecardFixture';
import { actualsKey, actualsLatestKey, parseLatestPointer } from '../src/lib/earnings/earningsActuals';
import { impliedRowKey } from '../src/lib/earnings/earningsImplied';
import { flowTickerOf, smartBannerAppId } from '../src/lib/seo/smartBanner';

const stub = (path: string, exports: any) => { const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports } as any; };

// ── 저장소 가짜: 읽은 키를 센다 ──
const store = new Map<string, unknown>();
const reads: string[][] = [];
let pack: any = null;
stub('../src/services/redisClient', {
  mgetFromCacheStrict: async (keys: string[]) => { reads.push(keys); return keys.map((k) => store.get(k) ?? null); },
});
stub('../src/services/earningsImpliedService', { readImpliedPack: async () => pack });
const { readIntent, intentCopy, upcoming } = require('../src/lib/seo/tickerEarningsIntent') as typeof import('../src/lib/seo/tickerEarningsIntent');
const { syncActualsLatestPointers } = require('../src/services/earningsActualsService') as typeof import('../src/services/earningsActualsService');

// 확인 목록의 실제 한 줄(장후 발표)을 고르고, 그 3일 전 정오(ET)를 «지금»으로
const ev = CONFIRMED_EARNINGS.find((e) => e.hour === 'amc')!;
const T = ev.ticker.toUpperCase();
const NOW = Date.parse(`${ev.date}T12:00:00-04:00`) - 3 * 86400_000;
const expiry = (() => { const d = new Date(`${ev.date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); })();
const cell = (extra: Record<string, unknown> = {}) => ({ v: 1, at: NOW, day: '', cells: { [impliedRowKey(T, ev.date)]: { p: 4.6, e: expiry, f: expiry, b: 'eod', s: '2000-01-01', r: null, method: 'weekly', ...extra } } });

test('① 배너 — 실적 의도 종목 페이지만 SIGNUM, 그 밖은 기존 규칙 그대로', () => {
  const SIGNUM = '6783130444', UC = '6788779895', WIM = '6794356135';
  assert.equal(smartBannerAppId('/en/flow/NVDA'), UC, '실적 7일 밖 /flow = 기존 Undercurrent');
  assert.equal(smartBannerAppId('/en/flow/NVDA', false, false), UC);
  assert.equal(smartBannerAppId('/en/flow/AAPL', false, true), SIGNUM, '실적 의도 종목 = SIGNUM');
  assert.equal(smartBannerAppId('/ko/flow/AAPL/', false, true), SIGNUM);
  for (const [p, want] of [['/ko/undercurrent', UC], ['/ja/tickers', UC], ['/en/wim', WIM], ['/ko', SIGNUM], ['/en/learn/max-pain', UC], ['/en/flowchart', SIGNUM]] as const) {
    assert.equal(smartBannerAppId(p, false, true), want, `${p} — 종목 페이지가 아니면 실적 표식이 있어도 그대로`);
  }
  assert.equal(smartBannerAppId('/en/flow/NVDA', true), SIGNUM, '공유 유입 규칙 그대로');
  assert.equal(flowTickerOf('/en/flow/aapl'), 'AAPL');
  assert.equal(flowTickerOf('/ko/flow/BRK.B/'), 'BRK.B');
  assert.equal(flowTickerOf('/en/flowchart'), null);
  assert.equal(flowTickerOf('/en/undercurrent'), null);
  // 루트 레이아웃: 같은 upcoming(정적 확인 목록) 판정을 세 번째 인자로만 넘긴다
  const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
  assert.match(layout, /const earningsIntent = !!flowTicker && upcomingEarnings\(flowTicker\) != null;/);
  assert.match(layout, /smartBannerAppId\(path, share\.fromShare, earningsIntent\)/);
  // 실제 목록 기준: 7일 안 종목은 판정 참, 확인 목록에 없는 종목은 거짓
  assert.ok(upcoming(T, NOW));
  assert.equal(upcoming('ZZZZNOTREAL', NOW), null);
});

test('② 직전 기록 — 날짜 창 없이 포인터 + 기록(키 2개 이하), 오래된 기록도 표시', async () => {
  pack = cell();
  // 포인터 없음 → 기록 없음, 포인터 키 1개만 읽는다
  store.clear(); reads.length = 0;
  let v = await readIntent(T, NOW);
  assert.equal(v?.history, null);
  assert.deepEqual(reads, [[actualsLatestKey(T)]], '포인터 1키만');
  // 200일 전 기록(예전 121일 창 밖)도 포인터가 가리키면 읽는다
  const old = '2026-03-12';
  const rec = record(T, 5, -3, 'fmp', old, 'amc');
  store.set(actualsLatestKey(T), { date: old });
  store.set(actualsKey(T, old), rec);
  reads.length = 0;
  v = await readIntent(T, Date.parse(`${ev.date}T12:00:00-04:00`) - 3 * 86400_000);
  assert.equal(v?.history?.date, old);
  assert.equal(v?.history?.expectedPct, 5);
  assert.equal(v?.history?.actualPct, -3);
  assert.equal(reads.flat().length, 2, '방문당 읽기 키 2개');
  assert.deepEqual(reads.flat(), [actualsLatestKey(T), actualsKey(T, old)]);
  // 포인터가 다가오는 발표일 이후를 가리키면 쓰지 않는다(기록 키를 읽지 않는다)
  store.set(actualsLatestKey(T), { date: ev.date });
  reads.length = 0;
  v = await readIntent(T, NOW);
  assert.equal(v?.history, null);
  assert.equal(reads.flat().length, 1);
  // 깨진 포인터 값
  assert.equal(parseLatestPointer({ date: '2026/03/12' }), null);
  assert.equal(parseLatestPointer('2026-03-12'), null);
  // 소스에 날짜 창 훑기가 남아 있지 않다
  const src = fs.readFileSync('src/lib/seo/tickerEarningsIntent.ts', 'utf8');
  assert.doesNotMatch(src, /length: 120|121/);
});

test('② 포인터 쓰기 — 크론 동기화는 완성 기록만, 앞으로만 옮긴다', async () => {
  const list = [
    { ...ev, ticker: 'AAA', date: '2026-10-13', hour: 'amc' as const },
    { ...ev, ticker: 'BBB', date: '2026-10-14', hour: 'bmo' as const },
    { ...ev, ticker: 'CCC', date: '2026-10-15', hour: 'amc' as const },
    { ...ev, ticker: 'DDD', date: '2026-12-01', hour: 'amc' as const },
  ];
  const now = Date.parse('2026-11-05T12:00:00-05:00');
  const mem = new Map<string, unknown>([
    [actualsKey('AAA', '2026-10-13'), record('AAA', 4, 2, 'fmp', '2026-10-13', 'amc')],
    [actualsKey('BBB', '2026-10-14'), { ...record('BBB', 4, 2, 'fmp', '2026-10-14', 'bmo'), actual: null }], // 미완성
    [actualsKey('CCC', '2026-10-15'), record('CCC', 4, 2, 'fmp', '2026-10-15', 'amc')],
    [actualsLatestKey('CCC'), { date: '2026-10-15' }],   // 이미 같은 날짜
  ]);
  const sets: Array<[string, unknown]> = [];
  const keysRead: string[][] = [];
  const r = await syncActualsLatestPointers({ nowMs: now, list, deps: {
    mget: async (keys) => { keysRead.push(keys); return keys.map((k) => mem.get(k) ?? null); },
    set: async (k, v) => { sets.push([k, v]); mem.set(k, v); return true; },
  } });
  assert.deepEqual(sets, [[actualsLatestKey('AAA'), { date: '2026-10-13' }]], '완성 + 포인터 없음만 쓴다');
  assert.equal(r.checked, 3, '미래 발표(DDD)는 보지 않는다');
  assert.equal(keysRead.length, 2, 'mget 2번');
  // 더 옛 기록이 와도 포인터를 뒤로 돌리지 않는다
  mem.set(actualsLatestKey('AAA'), { date: '2026-12-31' });
  sets.length = 0;
  await syncActualsLatestPointers({ nowMs: now, list, deps: { mget: async (keys) => keys.map((k) => mem.get(k) ?? null), set: async (k, v) => { sets.push([k, v]); return true; } } });
  assert.deepEqual(sets, []);
  const route = fs.readFileSync('src/app/api/cron/earnings-actuals/route.ts', 'utf8');
  assert.match(route, /if \(!dryRun && r\.lockAcquired && Date\.now\(\) - t0 < maxDuration \* 1000 - 15_000\)/, '쓰기 잠금 회차만');
});

test('③ 문구 = 보이는 값의 정의 — 스트래들/이벤트 분리 3언어·메타·JSON-LD', async () => {
  store.clear();
  pack = cell();
  const straddle = (await readIntent(T, NOW))!;
  assert.equal(straddle.pct, 4.6); assert.equal(straddle.basis, 'straddle');
  pack = cell({ method: 'event-split', eventMovePct: 3.1, p: 3.1 });
  const split = (await readIntent(T, NOW))!;
  assert.equal(split.pct, 3.1, '보이는 값 = 이벤트 분리값'); assert.equal(split.basis, 'event-split');
  const STRADDLE = { en: /divide by the stock price/, ko: /주가로 나눕니다/, ja: /株価で割ります/ };
  const SPLIT = { en: /ordinary-day variance/, ko: /평상시 변동분을 빼/, ja: /平常時の変動分を差し引き/ };
  for (const loc of ['en', 'ko', 'ja'] as const) {
    const a = intentCopy(straddle, loc), b = intentCopy(split, loc);
    assert.match(a.a2, STRADDLE[loc]); assert.doesNotMatch(a.a2, SPLIT[loc]);
    assert.match(b.a2, SPLIT[loc]); assert.doesNotMatch(b.a2, STRADDLE[loc]);
    assert.ok(b.title.includes('±3.1%') && b.a1.includes('±3.1%') && b.upcoming.includes('±3.1%'));
    // 값이 없으면 정의 문구는 기본(스트래들)
    assert.match(intentCopy({ ...split, pct: null }, loc).a2, STRADDLE[loc]);
    // 직전 기록은 성적표 기준(ATM 스트래들)임을 밝힌다
    const h = intentCopy({ ...split, history: { date: '2026-03-12', expectedPct: 5, actualPct: -3, beyond: false } as any }, loc).history!;
    assert.match(h, /ATM/);
  }
  // 페이지: 메타 설명 = upcoming + a2 · JSON-LD 답 = a1·a2(같은 객체에서)
  const page = fs.readFileSync('src/app/[locale]/flow/[ticker]/page.tsx', 'utf8');
  assert.match(page, /const desc = es \? `\$\{es\.upcoming\}\. \$\{es\.a2\}`/);
  assert.match(page, /acceptedAnswer: \{ '@type': 'Answer', text: i === 0 \? earnings\.a1 : earnings\.a2 \}/);
});
