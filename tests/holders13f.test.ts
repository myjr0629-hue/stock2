/**
 * 13F «기관 보유» API — 티커→CUSIP 표 · 소표본 표기 · Intrinio 폴백의 기준일 (2026-10-07, 앱 강화 1단계 ②)
 *
 * 진단: 색인이 9/27·10/4 에 5쪽 표본(NVDA 24곳·$0.7B)으로 덮여도 라우트는 그것을 «전체 기관»처럼 내보냈다. 표에 없는 종목(ANET)은 Intrinio 로 가는데
 *   기준일이 2025-12-31 이었다. 손으로 적은 «CIK → 이름·도메인» 표는 SEC 데이터와 대조하니 JPMorgan 과 Morgan Stanley 를 바꿔 적고 있었다.
 * 이 시험이 고정하는 것: ① CUSIP 표(OpenFIGI 생성 + 손표 폴백) ② partial 판정(새 색인은 제출 기관 수, 옛 항목은 보유 기관 수) ③ 라우트 응답(가짜 Upstash)
 *   ④ Intrinio 는 기준일이 있을 때만 · 오래된 기준일은 stalePeriod ⑤ 죽은 Massive/Polygon 폴백으로 더는 가지 않는다 ⑥ 옛 CIK 손표 삭제.
 *
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' tests/holders13f.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// ── 가짜 Upstash REST + 외부 호출 기록(어디로 갔는지 본다) ──
process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
const STORE = new Map<string, string>();
const fetched: string[] = [];
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
(globalThis as any).fetch = async (input: any, init?: any) => {
  const url = String(input);
  fetched.push(url);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (url.startsWith('https://upstash.test')) {
    const body = JSON.parse(init?.body || '[]');
    const run = (c: string[]) => { if (String(c[0]).toUpperCase() === 'GET') return STORE.has(String(c[1])) ? b64(STORE.get(String(c[1]))!) : null; return 'OK'; };
    return url.endsWith('/pipeline') ? json((body as string[][]).map((c) => ({ result: run(c) }))) : json({ result: run(body) });
  }
  if (url.startsWith('https://data.sec.gov/submissions/')) return json({ name: 'RESOLVED BY EDGAR' });
  throw new Error('예상 밖 외부 호출: ' + url);
};

// ── Intrinio 모듈 가로채기(라우트가 동적 import 한다) ──
let intrinioRows: any[] = [];
const intrinioPath = require.resolve('../src/services/intrinioClient');
require.cache[intrinioPath] = { id: intrinioPath, filename: intrinioPath, loaded: true, exports: { getInstitutionalOwnershipIntrinio: async () => intrinioRows } } as unknown as Module;

import { NextRequest } from 'next/server';
import { cusipForTicker, isPartialIndex, latestCompletedPeriod, CUSIP_MAP, MIN_UNIVERSE_FILERS, MIN_LEGACY_HOLDERS } from '../src/lib/holders13f';
import { holdersBasisLabel, holdersPartialLabel } from '../src/lib/app/holdersBasis';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const route = require('../src/app/api/command/13f/route');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MAP: Record<string, string> = require('../src/data/cusipByTicker.json');

let n = 0;
const queue: Array<[string, () => void | Promise<void>]> = [];
const t = (name: string, fn: () => void | Promise<void>) => { queue.push([name, fn]); };
const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const get = async (ticker?: string) => {
  const res = await route.GET(new NextRequest(`https://x.test/api/command/13f${ticker ? `?ticker=${ticker}` : ''}`));
  return { status: res.status, body: await res.json() };
};
const holder = (i: number, name: string | null, domain: string | null = null) => ({ cik: String(1000 + i).padStart(10, '0'), name, domain, shares: 1_000_000 * (60 - i), marketValue: 200_000_000 * (60 - i), period: '2026-06-30', filingDate: '2026-08-07' });
const entry = (over: Record<string, unknown> = {}) => ({
  holders: Array.from({ length: 60 }, (_, i) => holder(i, i === 0 ? 'BlackRock, Inc.' : `Filer ${i} LLC`, i === 0 ? 'blackrock.com' : null)),
  totalHolders: 5905, totalShares: 16_786_000_000, totalValue: 3_359_000_000_000, period: '2026-06-30', updatedAt: '2026-10-07T02:23:52.672Z',
  source: 'sec-form13f-datasets', dataset: '01jun2026-31aug2026', universeFilers: 8857, ...over,
});

// ───────────── ① CUSIP 표 ─────────────
t('CUSIP 표: 생성 표가 이긴다 · 손표는 빈 곳만 · 대소문자 무시 · 모르면 null · 점 있는 클래스 주식(BRK.B)', () => {
  assert.equal(cusipForTicker('NVDA'), '67066G104');
  assert.equal(cusipForTicker('nvda'), '67066G104');
  assert.equal(cusipForTicker('AAPL'), '037833100');
  assert.equal(cusipForTicker('MSFT'), '594918104');
  assert.equal(cusipForTicker('GOOGL'), '02079K305');
  assert.equal(cusipForTicker('BRK.B'), '084670702');
  assert.equal(cusipForTicker('ZZZZNOTATICKER'), null);
  assert.equal(cusipForTicker(''), null);
  // 손표만 아는 종목은 손표 값(생성 표에 없을 때)
  const handOnly = Object.keys(CUSIP_MAP).find((k) => !(k in MAP));
  if (handOnly) assert.equal(cusipForTicker(handOnly), CUSIP_MAP[handOnly]);
});

t('CUSIP 표 파일: 형식(9자) · 규모(4,000개 이상) · 한 CUSIP 이 두 티커를 가리키지 않는다 · 손표 68개와 충돌하면 생성 표를 따른다(보고용 출력)', () => {
  const entries = Object.entries(MAP);
  assert.ok(entries.length >= 4000, `매핑 ${entries.length}개`);
  assert.ok(entries.every(([k, v]) => /^[0-9A-Z]{9}$/.test(v) && /^[A-Z0-9.\-]{1,10}$/.test(k)), '티커·CUSIP 형식');
  const byCusip = new Map<string, string[]>();
  for (const [k, v] of entries) byCusip.set(v, [...(byCusip.get(v) || []), k]);
  const multi = [...byCusip.entries()].filter(([, ks]) => ks.length > 1);
  assert.deepEqual(multi, [], `CUSIP 하나에 티커 둘 이상: ${JSON.stringify(multi.slice(0, 5))}`);
  const conflicts = Object.entries(CUSIP_MAP).filter(([k, v]) => MAP[k] && MAP[k] !== v);
  console.log(`    (손표 ${Object.keys(CUSIP_MAP).length}개 중 생성 표와 CUSIP 이 다른 것 ${conflicts.length}개: ${conflicts.map(([k, v]) => `${k} 손=${v} 생성=${MAP[k]}`).join(' · ') || '없음'})`);
});

t('CUSIP 표 범위: 앱 유니버스(data/stock_universe_us800.json)의 대부분을 덮는다(85% 이상) — 못 덮은 종목은 Intrinio(기준일 표기)로 간다', () => {
  const uni = JSON.parse(read('data/stock_universe_us800.json'));
  const arr: any[] = Array.isArray(uni) ? uni : (uni.tickers || uni.universe || uni.symbols || Object.keys(uni));
  const syms = arr.map((x) => String(typeof x === 'string' ? x : (x.ticker || x.symbol || ''))).filter(Boolean);
  assert.ok(syms.length >= 300, `유니버스 ${syms.length}`);
  const covered = syms.filter((s) => cusipForTicker(s));
  const missing = syms.filter((s) => !cusipForTicker(s));
  console.log(`    (유니버스 ${syms.length}종목 중 CUSIP 표로 덮인 것 ${covered.length} = ${(covered.length / syms.length * 100).toFixed(1)}% · 못 덮은 것 예: ${missing.slice(0, 12).join(', ')})`);
  assert.ok(covered.length / syms.length >= 0.85, `덮은 비율 ${(covered.length / syms.length * 100).toFixed(1)}%`);
});

// ───────────── ② partial 판정 · 기준일 ─────────────
t('isPartialIndex: SEC 색인은 제출 기관 수로(3,000 미만이면 표본) · 출처 표식 없는 옛 항목은 보유 기관 수로(500 미만이면 표본)', () => {
  assert.equal(MIN_UNIVERSE_FILERS, 3000);
  assert.equal(MIN_LEGACY_HOLDERS, 500);
  assert.equal(isPartialIndex({ source: 'sec-form13f-datasets', universeFilers: 8857, totalHolders: 5905 }), false);
  assert.equal(isPartialIndex({ source: 'sec-form13f-datasets', universeFilers: 120, totalHolders: 24 }), true);
  assert.equal(isPartialIndex({ source: 'sec-form13f-datasets' }), true, 'universeFilers 를 모르면 표본으로(가정하지 않는다)');
  assert.equal(isPartialIndex({ totalHolders: 24 }), true, '옛 항목: NVDA 24곳(10/4 운영)');
  assert.equal(isPartialIndex({ totalHolders: 5937 }), false, '옛 항목: 9/20 정상 색인 NVDA 5,937곳');
  assert.equal(isPartialIndex({ holders: new Array(18).fill({}) }), true, '옛 항목에 totalHolders 가 없으면 목록 길이');
});

t('latestCompletedPeriod: 분기 말 + 46일 뒤에야 그 분기가 «끝난» 기준일 — 10/7 → 2026-06-30 · 8/1(마감 8/14 전) → 2026-03-31 · 옛 Lambda 의 «달만 비교» 오류 방지', () => {
  assert.equal(latestCompletedPeriod(new Date('2026-10-07T00:00:00Z')), '2026-06-30');
  assert.equal(latestCompletedPeriod(new Date('2026-08-01T00:00:00Z')), '2026-03-31');
  assert.equal(latestCompletedPeriod(new Date('2026-08-16T00:00:00Z')), '2026-06-30');
  assert.equal(latestCompletedPeriod(new Date('2026-11-15T00:00:00Z')), '2026-09-30');
  assert.equal(latestCompletedPeriod(new Date('2027-01-10T00:00:00Z')), '2026-09-30');
  assert.equal(latestCompletedPeriod(new Date('2027-02-20T00:00:00Z')), '2026-12-31');
});

// ───────────── ③ 라우트 ─────────────
t('GET: 정상 색인(SEC · 제출 기관 8,857) — summary 는 전체 집계 · partial=false · 상위 20 · 이름·도메인은 색인 그대로', async () => {
  STORE.set('cache:13f:cusip:67066G104', JSON.stringify(entry()));
  const { status, body } = await get('NVDA');
  assert.equal(status, 200);
  assert.equal(body._source, 'redis-cache');
  assert.equal(body._dataset, '01jun2026-31aug2026');
  assert.equal(body.summary.totalHolders, 5905);
  assert.equal(body.summary.totalValue, 3_359_000_000_000);
  assert.equal(body.summary.period, '2026-06-30');
  assert.equal(body.summary.partial, false);
  assert.equal(body.summary.universeFilers, 8857);
  assert.equal(body.holders.length, 20);
  assert.equal(body.holders[0].name, 'BlackRock, Inc.');
  assert.equal(body.holders[0].domain, 'blackrock.com');
  assert.equal(body.holders[1].domain, null, '색인에 도메인이 없으면 null — 옛 CIK 손표로 로고를 지어내지 않는다');
  assert.equal(body.holders[0].rank, 1);
  assert.equal(body.holders[0].filingDate, '2026-08-07');
  assert.equal(body.holders[19].rank, 20);
});

t('GET: 소표본(옛 항목 — 출처 표식 없음·NVDA 24곳·$0.7B)은 partial=true — 응답은 그대로 주되 «전체»로 읽히지 않게 표시한다', async () => {
  STORE.set('cache:13f:cusip:67066G104', JSON.stringify({
    holders: Array.from({ length: 24 }, (_, i) => holder(i, `Small Advisor ${i}`)), totalHolders: 24, totalShares: 4_000_000, totalValue: 743_596_716, period: '2026-06-30', updatedAt: '2026-10-04T06:00:48.228Z',
  }));
  const { body } = await get('NVDA');
  assert.equal(body.summary.partial, true);
  assert.equal(body.summary.totalHolders, 24);
  assert.equal(body.summary.universeFilers, null);
  // 새 색인이라도 제출 기관이 모자라면 표본
  STORE.set('cache:13f:cusip:67066G104', JSON.stringify(entry({ universeFilers: 200 })));
  assert.equal((await get('NVDA')).body.summary.partial, true);
});

t('GET: 이름 없는 옛 항목의 기관은 EDGAR 로 해석(캐시) — 새 색인은 이름이 들어 있어 외부 호출이 없다', async () => {
  fetched.length = 0;
  STORE.set('cache:13f:cusip:037833100', JSON.stringify(entry()));
  await get('AAPL');
  assert.deepEqual(fetched.filter((u) => u.includes('data.sec.gov')), [], '새 색인: EDGAR 호출 없음');
  fetched.length = 0;
  STORE.set('cache:13f:cusip:594918104', JSON.stringify(entry({ holders: [holder(0, null), holder(1, null)], totalHolders: 2 })));
  const { body } = await get('MSFT');
  assert.equal(body.holders[0].name, 'RESOLVED BY EDGAR');
  assert.ok(fetched.some((u) => u.includes('data.sec.gov/submissions/CIK')), '이름이 없으면 EDGAR 로 간다');
});

t('GET: 색인에 없는 종목 + Intrinio(기준일 있음) — 기준일을 같이 싣는다 · 직전 분기 말보다 오래되면 stalePeriod=true · 먼 미래 기준일은 false', async () => {
  const row = (i: number, period: string) => ({ owner_cik: String(2000 + i), owner_name: `OWNER ${i}`, period_ended: period, shares: 1000 - i, market_value: 50_000 - i, previous_shares: 900, shares_change: 100, shares_change_pct: 11.1, isNewPosition: false });
  intrinioRows = Array.from({ length: 8 }, (_, i) => row(i, '2025-12-31'));
  const old = await get('ANETX');
  assert.equal(old.body._source, 'intrinio');
  assert.equal(old.body.period, '2025-12-31');
  assert.equal(old.body.stalePeriod, '2025-12-31' < latestCompletedPeriod());
  assert.equal(old.body.stalePeriod, true);
  assert.equal(old.body.holders[0].period, '2025-12-31');
  intrinioRows = Array.from({ length: 8 }, (_, i) => row(i, '2099-12-31'));
  assert.equal((await get('ANETX')).body.stalePeriod, false);
});

t('GET: Intrinio 응답에 기준일이 없으면 쓰지 않는다(전체 기관처럼 보이는 것을 막는다) · 5곳 미만이면 쓰지 않는다 · 그 경우 빈 응답 + 사유', async () => {
  const row = (i: number, period: string) => ({ owner_cik: String(2000 + i), owner_name: `OWNER ${i}`, period_ended: period, shares: 1000, market_value: 50_000 });
  intrinioRows = Array.from({ length: 8 }, (_, i) => row(i, ''));
  const noPeriod = await get('ANETX');
  assert.deepEqual(noPeriod.body.holders, []);
  assert.equal(noPeriod.body.message, 'No 13-F data found for this ticker');
  assert.equal(noPeriod.body.summary.totalHolders, 0);
  intrinioRows = Array.from({ length: 4 }, (_, i) => row(i, '2026-06-30'));
  assert.deepEqual((await get('ANETX')).body.holders, []);
});

t('GET: 죽은 Massive/Polygon 폴백으로 더는 가지 않는다(외부 호출 기록에 polygon·massive 없음) · ticker 없으면 400', async () => {
  fetched.length = 0;
  intrinioRows = [];
  const miss = await get('ZZNOCUSIP');
  assert.deepEqual(miss.body.holders, []);
  assert.deepEqual(fetched.filter((u) => /polygon|massive/i.test(u)), []);
  assert.equal((await get()).status, 400);
  const src = read('src/app/api/command/13f/route.ts');
  assert.ok(!/MASSIVE_API_KEY|api\.polygon\.io|stocks\/filings\/vX/.test(src), '라우트에 죽은 피드가 없다');
  assert.ok(!/KNOWN_INSTITUTIONS|getInstitutionDomain/.test(src), '틀린 CIK 손표(JPMorgan↔Morgan Stanley 뒤바뀜)가 없다');
});

// ───────────── ④ 앱 표기 ─────────────
t('앱 표기: 소표본 문구(3개 언어) · 정상 색인의 기준 문장은 그대로 · 앱 패널은 summary.partial 일 때만 표본 줄을 그린다(웹은 locale 이 없어 불변)', () => {
  assert.equal(holdersPartialLabel('ko'), '일부 제출분만 집계된 표본입니다 — 전체 기관 합계가 아닙니다');
  assert.ok(holdersPartialLabel('ja').includes('サンプル'));
  assert.ok(holdersPartialLabel('en').startsWith('Partial sample'));
  assert.equal(holdersPartialLabel('fr'), holdersPartialLabel('en'));
  assert.equal(holdersBasisLabel('ko', 5905, '2026-06-30'), '제출 기관 5,905곳 기준 · 기준일 2026-06-30');
  const ui = read('src/components/intel/mobile/MobileCmd13F.tsx');
  assert.ok(/appMode && summary\?\.partial === true/.test(ui));
  assert.ok(ui.includes('data-testid="holders-partial"'));
});

(async () => {
  for (const [name, fn] of queue) {
    try { await fn(); n += 1; console.log(`  ✓ ${name}`); }
    catch (e) { console.error(`  ✗ ${name}\n`, e); process.exitCode = 1; break; }
  }
  if (!process.exitCode) console.log(`\n${n}개 통과`);
})();
