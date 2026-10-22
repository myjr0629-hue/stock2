/** Offline regression checks. No .env, live HTTP, Redis, vendor, or AI access.
 * node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/seoSitemapRobots.test.ts
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { isFlowTicker } from '../src/lib/seo/flowTicker';
import { FLOW_TICKERS } from '../src/lib/seo/flowTickers';
import { canonicalShareClass } from '../src/lib/tickerSymbol';

const BASE = 'https://local.test';
const CLASSES = ['BF.B', 'BRK.B', 'HEI.A', 'MOG.A', 'PBR.A'];
const LOCALES = ['en', 'ko', 'ja'];
let checks = 0;
const test = async (name: string, fn: () => unknown) => { await fn(); checks++; console.log(`✓ ${name}`); };
const stub = (path: string, exports: unknown) => {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};
globalThis.fetch = async () => { throw new Error('Unexpected external request'); };
stub('../src/services/redisClient', { getFromCache: async () => { throw new Error('Unexpected Redis access'); } });
stub('../src/lib/net/publicBase', { publicBase: () => BASE });
stub('../src/lib/marketing/pageViewMark', { markPageView: async () => {} });
stub('../src/components/share/ShareLanding', { ShareLanding: () => null });
stub('../src/components/share/TodayPicksShare', { TodayPicksShare: () => null });
stub('next/headers', { headers: async () => new Headers({ 'user-agent': 'Yeti' }), cookies: async () => ({ get: () => undefined }) });

const text = { en: 'test', ko: '시험', ja: '試験' };
const item = { id: 'test', ticker: 'NVDA', kind: 'darkpool', asOf: '2026-10-19',
  facts: { kind: 'darkpool', pct: 45, ratio: 2, volume: 1000000, date: '2026-10-19', marketAvg: 50 },
  what: text, why: text, push: text, whyAi: false };
const fullDoc = { v: 1, at: Date.now(), etDate: '2026-10-19', slot: 'pm', items: [item] };
let picks: any = { doc: fullDoc, off: false };
let readFails = false;
stub('../src/services/todayPicksService', { readPicks: async () => {
  if (readFails) throw new Error('offline');
  return picks;
} });
const sitemap = require('../src/app/sitemap').default;
const korean = require('../src/app/sitemap-ko.xml/route');
const today = require('../src/app/[locale]/today/page');
const robots = require('../src/app/robots').default();
const disallow: string[] = robots.rules.disallow;
// robots wildcards span path separators. '$' anchors only the end; query is part of the URL.
const matches = (path: string, pattern: string) => {
  const end = pattern.endsWith('$');
  const body = (end ? pattern.slice(0, -1) : pattern).split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${body}${end ? '$' : ''}`).test(path);
};
const blocked = (path: string) => disallow.some((p) => matches(path, p));
const audit = (entries: { url: string }[]) => {
  const seen = new Set<string>();
  for (const { url } of entries) {
    assert.ok(!seen.has(url), `duplicate: ${url}`); seen.add(url);
    const u = new URL(url);
    assert.ok(!blocked(u.pathname + u.search), `robots: ${url}`);
    const ticker = /^\/(en|ko|ja)\/flow\/(.+)$/.exec(u.pathname)?.[2];
    if (ticker) assert.ok(isFlowTicker(ticker), `invalid ticker: ${ticker}`);
  }
};

// Exercise actual UC route logic with isolated dependencies, including cache key and validation.
const source = fs.readFileSync('src/app/api/undercurrent/ticker/route.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
let ucRead: string[] = [];
const ucExports: any = {};
vm.runInNewContext(js, { exports: ucExports, URL, Date, Request, console, require: (id: string) => {
  if (id === 'next/server') return { NextResponse: { json: (v: unknown, options: any = {}) => Response.json(v, options) }, after: () => {} };
  if (id === '@/lib/seo/flowTicker') return { isFlowTicker };
  if (id === '@/lib/ai/creditPacing') return { BASELINE_KNOBS: { ucTickerFreshSec: 600 }, pacingKnobs: async () => ({ ucTickerFreshSec: 600 }) };
  if (id === '@/services/redisClient') return { getFromCache: async (key: string) => { ucRead.push(key); return { success: true, generatedAt: new Date().toISOString(), cards: [] }; } };
  if (id === '../shared') return { normLocale: (l: string) => l, reconcileOptionMoney: async () => {}, enforceAmounts: () => {}, enforceLean: () => {} };
  return {}; // generation-only imports never called by nogen=1
} });

let hasDp = true;
const dpCalls: string[] = [];
stub('../src/services/darkPool', { getDarkPoolCurrent: async (ticker: string) => {
  dpCalls.push(ticker);
  return hasDp ? { session: '2026-10-19', row: { ticker, pct: 45, date: '2026-10-19', marketAvg: 50, volume: 1000000 } } : null;
} });
stub('../src/services/structureService', { peekStructureLevelsDetailed: async (tickers: string[]) => {
  assert.ok(tickers.every(isFlowTicker)); return { levels: new Map(), noSnapshot: tickers };
} });
stub('../src/services/intrinioClient', { peekEodCloseRow: async () => null });
const flow = require('../src/app/[locale]/flow/[ticker]/page');

(async () => {
  await test('티커 계약: 전체 2,228종 · 클래스 5종 · 비정상 입력 거부', () => {
    assert.equal(FLOW_TICKERS.length, 2228);
    assert.deepEqual(FLOW_TICKERS.filter((t: string) => !isFlowTicker(t)), []);
    assert.deepEqual(FLOW_TICKERS.filter((t: string) => t.includes('.')).sort(), [...CLASSES].sort());
    for (const t of [...CLASSES, 'NVDA', 'ABCDEF', 'TRUE', 'NAN']) assert.ok(isFlowTicker(t), t);
    for (const t of ['', 'NULL', 'ABCDEFG', '.BRK', 'BRK.', 'BRK..B', 'BRK.B.C', 'BRK.BB', 'BRK-B', 'BRK/B', '1ABC', 'brk.b', 'A?x', 'A B']) assert.ok(!isFlowTicker(t), t);
    assert.equal(canonicalShareClass('BRK-B'), 'BRK.B', 'existing source contract uses dots');
  });
  await test('robots: 모든 앱 루트·쿼리·하위 경로 차단, 공개 가이드·tickers 허용', () => {
    assert.ok(matches('/ko/how-it-works/intel', '/*/intel'), 'old overmatch reproduced');
    for (const prefix of ['', '/en', '/ko', '/ja']) {
      for (const app of ['app-view', 'login', 'settings', 'dashboard', 'intel', 'intel-guardian', 'quant-radar', 'watchlist', 'portfolio', 'ticker']) {
        for (const suffix of ['', '?ticker=NVDA', '/', '/detail', '/detail?x=1']) assert.ok(blocked(`${prefix}/${app}${suffix}`));
        assert.ok(!blocked(`${prefix}/${app}-public`));
      }
      for (const pub of ['tickers', 'how-it-works/intel', 'how-it-works/dashboard', 'how-it-works/intel-guardian', 'earnings-week', 'flow/BRK.B']) assert.ok(!blocked(`${prefix}/${pub}`));
    }
    assert.ok(!blocked('/sitemap-ko.xml'));
  });
  await test('사이트맵 전체: 중복·robots·검증식 불일치 0, 한국어 XML은 한국어 부분집합', async () => {
    const all = await sitemap(); audit(all); assert.equal(all.length, 6783);
    assert.equal(all.filter((e: any) => e.url.endsWith('/receipts/earnings')).length, 3);
    assert.equal(all.filter((e: any) => e.url.endsWith('/tools/read-check')).length, 3);
    assert.equal(all.filter((e: any) => e.url.endsWith('/tools/earnings-scenario')).length, 3);
    const ko = await korean.GET(); assert.equal(ko.status, 200); assert.match(ko.headers.get('content-type'), /application\/xml/);
    const xml = await ko.text();
    fs.writeFileSync('/tmp/signum-seo-sitemap-ko.xml', xml);
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
    assert.deepEqual(urls, all.filter((e: any) => new URL(e.url).pathname.startsWith('/ko')).map((e: any) => e.url));
    assert.equal(urls.length, 2261);
    for (const p of ['/ko', '/ko/earnings-week', ...CLASSES.map((t) => `/ko/flow/${t}`)]) assert.ok(urls.includes(BASE + p));
    console.log(`  전체 ${all.length} / 한국어 ${urls.length}, 중복·차단·형식 불일치 0`);
  });
  await test('자체 검사: 중복·robots 차단·페이지 검증식 불일치 주입 시 실패', () => {
    for (const rows of [[{ url: BASE + '/ko' }, { url: BASE + '/ko' }], [{ url: BASE + '/ko/intel' }], [{ url: BASE + '/ko/flow/A..B' }]]) assert.throws(() => audit(rows));
  });
  await test('/today: 정상·빈 문서·없음·꺼짐·읽기 실패마다 메타/양쪽 사이트맵 일치', async () => {
    for (const state of [{ doc: fullDoc, off: false }, { doc: { ...fullDoc, items: [] }, off: false }, { doc: null, off: false }, { doc: fullDoc, off: true }, null]) {
      readFails = state === null; picks = state;
      const all = await sitemap(); const xml = await (await korean.GET()).text();
      const include = state?.doc?.items.length > 0 && !state?.off;
      for (const locale of LOCALES) {
        const meta = await today.generateMetadata({ params: Promise.resolve({ locale }) });
        assert.equal(meta.robots?.index !== false, Boolean(include));
        assert.equal(all.some((e: any) => e.url === `${BASE}/${locale}/today`), Boolean(include));
      }
      assert.equal(xml.includes(`${BASE}/ko/today</loc>`), Boolean(include));
      audit(all);
    }
    readFails = false; picks = { doc: fullDoc, off: false };
  });
  await test('UC 실라우트: 클래스 5종×3언어 200·점 키 유지, 잘못된 입력 400', async () => {
    for (const ticker of CLASSES) for (const locale of LOCALES) {
      const response = await ucExports.GET(new Request(`${BASE}/api/undercurrent/ticker?t=${ticker}&locale=${locale}&nogen=1`));
      assert.equal(response.status, 200, ticker);
      assert.equal(ucRead.at(-1), `undercurrent:ticker:v6:${ticker}:${locale}`);
    }
    const before = ucRead.length;
    for (const ticker of ['NULL', 'A..B', 'BRK.BB', 'ABCDEFG']) assert.equal((await ucExports.GET(new Request(`${BASE}/api/undercurrent/ticker?t=${ticker}&nogen=1`))).status, 400);
    assert.equal(ucRead.length, before, 'invalid symbols never read data');
  });
  await test('실제 FINRA 저장본 읽기: 클래스 5종을 점 키로 조회 (저장본 모의)', async () => {
    const module: any = {};
    const snapshot = { date: '2026-10-19', marketAvg: 50, covered: CLASSES.length,
      tickers: Object.fromEntries(CLASSES.map((t) => [t, { pct: 45, vol: 1000000 }])) };
    const compiled = ts.transpileModule(fs.readFileSync('src/services/darkPool.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(compiled, { exports: module, Date, AbortController, setTimeout, clearTimeout,
      process: { env: {} }, require: (id: string) => {
        assert.equal(id, '@/lib/seo/etfSet'); return { isEtf: () => false };
      }, fetch: async (url: string) => {
        assert.equal(new URL(url).searchParams.get('key'), 'finra:offexchange');
        return Response.json({ result: JSON.stringify(snapshot) });
      } });
    for (const ticker of CLASSES) {
      const result = await module.getDarkPoolCurrent(ticker);
      assert.equal(result.row.ticker, ticker); assert.equal(result.row.pct, 45);
    }
  });
  await test('페이지 실제 SSR: 클래스 15개·FINRA만 있을 때 본문/자기 canonical/언어 링크 정상', async () => {
    globalThis.fetch = async (input) => {
      const u = new URL(String(input));
      assert.equal(u.origin, BASE); assert.equal(u.pathname, '/api/undercurrent/ticker');
      assert.ok(CLASSES.includes(u.searchParams.get('t')!)); assert.equal(u.searchParams.get('nogen'), '1');
      return Response.json({ success: false }, { status: 404 });
    };
    for (const ticker of CLASSES) for (const locale of LOCALES) {
      const props = { params: Promise.resolve({ locale, ticker }), searchParams: Promise.resolve({}) };
      const html = renderToStaticMarkup(await flow.default(props));
      assert.ok(html.includes(ticker)); assert.ok(html.includes('45.0%'));
      const meta = await flow.generateMetadata(props);
      assert.equal(meta.alternates.canonical, `${BASE}/${locale}/flow/${ticker}`);
      assert.equal(meta.alternates.languages.ko, `${BASE}/ko/flow/${ticker}`);
      assert.notEqual(meta.robots?.index, false);
    }
    assert.ok(dpCalls.every((t) => CLASSES.includes(t)), 'dot symbols reach the data reader unchanged');
  });
  await test('페이지 SSR: UC 사본만 있어도 정상, 원천 둘 다 없으면 기존 404 유지', async () => {
    hasDp = false;
    globalThis.fetch = async () => Response.json({ success: true, ticker: 'BRK.B', cards: [], hasMoneyData: true, money: {}, generatedAt: new Date().toISOString() });
    const props = { params: Promise.resolve({ locale: 'ko', ticker: 'BRK.B' }), searchParams: Promise.resolve({}) };
    assert.ok(renderToStaticMarkup(await flow.default(props)).includes('BRK.B'));
    globalThis.fetch = async () => Response.json({}, { status: 404 });
    await assert.rejects(flow.default(props), /NEXT_HTTP_ERROR_FALLBACK;404/);
    const before = dpCalls.length;
    await assert.rejects(flow.default({ ...props, params: Promise.resolve({ locale: 'ko', ticker: 'A..B' }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
    assert.equal(dpCalls.length, before);
  });
  await test('Next matcher: 점 티커도 locale middleware, XML·정적 파일·API 제외 유지', () => {
    const source = fs.readFileSync('src/middleware.ts', 'utf8');
    const result: any = {};
    vm.runInNewContext(ts.transpileModule(source.slice(source.indexOf('export const config')), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: result });
    for (const path of ['/ko/flow/BRK.B', '/ja/flow/BF.B', '/flow/BRK.B', '/en/flow/NVDA']) assert.ok(unstable_doesMiddlewareMatch({ config: result.config, url: BASE + path }), path);
    for (const path of ['/sitemap.xml', '/sitemap-ko.xml', '/logo.png', '/api/test', '/_next/static/main.js']) assert.ok(!unstable_doesMiddlewareMatch({ config: result.config, url: BASE + path }), path);
  });
  console.log(`총 ${checks}개 묶음 통과 (오프라인)`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
