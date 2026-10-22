// 실행: node --test tests/readCheckSeo.test.cjs
// 합성 자료와 Next의 실제 XML 직렬화기 사용. 환경 파일·운영망 접근 없음.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const { resolveSitemap } = require('next/dist/build/webpack/loaders/metadata/resolve-route-data');

const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) {
  return resolve.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, ...args);
};
const compile = (source, fileName) => ts.transpileModule(source, { fileName, compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} }).outputText;
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, name) =>
  mod._compile(compile(fs.readFileSync(name, 'utf8'), name), name);
const stub = (name, exports) => {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};
globalThis.fetch = async () => { throw new Error('외부 접근 금지'); };
const BASE = 'https://www.signumhq.com';
const LOCALES = ['en', 'ko', 'ja'];
const PAGE = '/tools/read-check';
const expectedLanguages = Object.fromEntries([
  ...LOCALES.map(l => [l, `${BASE}/${l}${PAGE}`]), ['x-default', `${BASE}/en${PAGE}`],
]);
const NOW = Date.parse('2026-10-22T03:00:00Z');
class FixedDate extends Date { constructor(value = NOW) { super(value); } }
stub('../src/lib/net/publicBase', { publicBase: () => BASE });
let picks;
stub('../src/services/todayPicksService', { readPicks: async () => {
  if (picks instanceof Error) throw picks;
  return picks;
} });
stub('../src/services/readCheckService', { readCheckSnapshot: async () => {
  throw new Error('메타데이터에서 운영 자료 조회 금지');
} });
const load = (filename, source, overrides = {}) => {
  const exports = {};
  const localRequire = Module.createRequire(path.join(root, filename));
  vm.runInNewContext(compile(source, filename), { exports, Date: FixedDate, Response,
    require: id => Object.hasOwn(overrides, id) ? overrides[id] : localRequire(id),
  }, { filename });
  return exports;
};
const SITEMAP = 'src/lib/seo/sitemap.ts';
// 운영 반영 시점과 비교해 기존 URL의 순서·날짜·빈도·우선순위·언어 링크 보존을 검사한다.
const previousSource = execFileSync('git', ['show', `5d77ec668:${SITEMAP}`], { cwd: root, encoding: 'utf8' });
const previous = load(SITEMAP, previousSource);
const current = load(SITEMAP, fs.readFileSync(path.join(root, SITEMAP), 'utf8'));
const route = (filename, builder) => load(filename, fs.readFileSync(path.join(root, filename), 'utf8'), {
  '@/lib/seo/sitemap': builder,
});
const allRoute = route('src/app/sitemap.ts', current);
const koRoute = route('src/app/sitemap-ko.xml/route.ts', current);
const oldKoRoute = route('src/app/sitemap-ko.xml/route.ts', previous);
// 후속 공개 도구도 제거한 뒤 read-check 도입 전 기준과 비교한다. 신규 시나리오는 전용 시험에서 검증한다.
const stripNewUrls = xml => xml.replace(/<url>\s*<loc>[^<]*\/tools\/(?:read-check|earnings-scenario)<\/loc>[\s\S]*?<\/url>\n?/g, '');
const text = { en: 'test', ko: '시험', ja: '試験' };
const fullDoc = { v: 1, at: NOW, etDate: '2026-10-21', slot: 'pm', items: [{
  id: 'test', ticker: 'NVDA', kind: 'darkpool', asOf: '2026-10-21',
  facts: { kind: 'darkpool', pct: 45, ratio: 2, volume: 1000000, date: '2026-10-21', marketAvg: 50 },
  what: text, why: text, push: text, whyAi: false,
}] };

test('전체 사이트맵 XML: 3 URL·상호 hreflang·x-default, 기존 URL 바이트 동일', async () => {
  for (const state of [{ doc: fullDoc, off: false }, { doc: null, off: false },
    { doc: fullDoc, off: true }, new Error('합성 읽기 장애')]) {
    picks = state;
    const before = resolveSitemap(await previous.buildSitemap());
    const entries = await allRoute.default();
    const xml = resolveSitemap(entries);
    const added = entries.filter(e => e.url.endsWith(PAGE));
    assert.deepEqual(Array.from(added, e => e.url), LOCALES.map(l => `${BASE}/${l}${PAGE}`));
    assert.equal(new Set(entries.map(e => e.url)).size, entries.length);
    for (const entry of added) {
      assert.deepEqual({ ...entry.alternates.languages }, expectedLanguages);
      assert.equal(entry.lastModified, undefined);
      const block = xml.match(/<url>[\s\S]*?<\/url>/g).find(b => b.includes(`<loc>${entry.url}</loc>`));
      for (const [l, url] of Object.entries(expectedLanguages))
        assert.ok(block.includes(`<xhtml:link rel="alternate" hreflang="${l}" href="${url}" />`));
    }
    assert.deepEqual(Buffer.from(stripNewUrls(xml)), Buffer.from(before));
  }
});

test('한국어 사이트맵 응답: 한국어 진단만 추가, 기존 응답 바이트 동일', async () => {
  picks = { doc: fullDoc, off: false };
  const before = await (await oldKoRoute.GET()).text();
  const response = await koRoute.GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/xml/);
  const xml = await response.text();
  assert.equal((xml.match(/\/tools\/read-check<\/loc>/g) ?? []).length, 1);
  assert.ok(xml.includes(`<loc>${BASE}/ko${PAGE}</loc>`));
  assert.deepEqual(Buffer.from(stripNewUrls(xml)), Buffer.from(before));
});

test('3언어 메타데이터: title·description·canonical·OG·hreflang 모두 존재', async () => {
  const page = require('../src/app/[locale]/tools/read-check/page');
  const { READ_COPY } = require('../src/lib/readCheck/copy');
  const titles = new Set(), descriptions = new Set();
  for (const l of LOCALES) {
    const metadata = await page.generateMetadata({ params: Promise.resolve({ locale: l }) });
    const url = `${BASE}/${l}${PAGE}`;
    assert.ok(READ_COPY[l].title.trim()); assert.ok(READ_COPY[l].description.trim());
    assert.equal(metadata.title, READ_COPY[l].title);
    assert.equal(metadata.description, READ_COPY[l].description);
    assert.equal(metadata.alternates.canonical, url);
    assert.deepEqual(metadata.alternates.languages, expectedLanguages);
    assert.deepEqual(metadata.robots, { index: true, follow: true });
    assert.equal(metadata.openGraph.title, metadata.title);
    assert.equal(metadata.openGraph.description, metadata.description);
    assert.equal(metadata.openGraph.url, url);
    assert.deepEqual(metadata.openGraph.images, [{ url: `${url}/og`, width: 1200, height: 630, alt: metadata.title }]);
    titles.add(metadata.title); descriptions.add(metadata.description);
  }
  assert.equal(titles.size, 3); assert.equal(descriptions.size, 3);
});
