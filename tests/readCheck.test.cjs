// 실행: node --test tests/readCheck.test.cjs — 합성 자료만 사용, 환경 파일·운영망·브라우저 접근 없음.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const ts = require('typescript');
const { execFileSync } = require('node:child_process');
// Next 서버 부트스트랩과 같은 Node AsyncLocalStorage를 테스트 런타임에 제공한다.
globalThis.AsyncLocalStorage = require('node:async_hooks').AsyncLocalStorage;
const root = path.resolve(__dirname, '..');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(id, ...args) {
  return resolve.call(this, id.startsWith('@/') ? path.join(root, 'src', id.slice(2)) : id, ...args);
};
const compile = (source, fileName) => ts.transpileModule(source, { fileName,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (mod, name) => mod._compile(compile(fs.readFileSync(name, 'utf8'), name), name);
const stub = (name, exports) => { const id = require.resolve(name); require.cache[id] = { id, filename: id, loaded: true, exports }; };
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const rules = require('../src/lib/readCheck/rules');
const { READ_COPY, evidence } = require('../src/lib/readCheck/copy');
const NOW = Date.parse('2026-10-21T10:00:00Z');
const originalNow = Date.now;
Date.now = () => NOW;
const empty = () => ({ options: null, darkPool: null, insider: null });
const complete = () => ({
  options: { date: '2026-10-20', callVol: 10001, putVol: 9999 },
  darkPool: { date: '2026-10-20', pct: 51.123456789, volume: 1234567 },
  insider: { date: '2026-10-20', transactionDate: '2026-10-19', code: 'S', shares: 125.25,
    plan: null, derivative: false, filingUrl: 'https://www.sec.gov/Archives/test.xml' },
});
const filing = (code = 'S', date = '2026-10-19') => ({ transaction_filings: [{ filing_date: '2026-10-20',
  filing_url: 'https://www.sec.gov/Archives/test.xml', transactions: [{ transaction_date: date,
    transaction_type_code: code, amount_of_shares: 125.25, derivative_transaction: false }] }] });
let reads = 0, darkReads = 0, keys = [], fail = false;
const values = new Map();
let darkMap = {};
let rawDarkSnapshot;
// FINRA 조회의 I/O만 합성 응답으로 대체하고 실제 원천 변환기를 서비스까지 연결한다.
const realDarkPool = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/services/darkPool.ts'), 'utf8'), 'darkPool.ts'), {
  exports: realDarkPool.exports, require: () => ({ isEtf: () => false }), process: { env: {} },
  AbortController, setTimeout, clearTimeout,
  fetch: async () => ({ ok: true, json: async () => ({ result: rawDarkSnapshot }) }),
});
stub('../src/services/redisClient', { mgetFromCache: async ks => {
  reads++; keys = ks; await new Promise(resolve => setImmediate(resolve));
  if (fail) throw new Error('합성 읽기 장애');
  return ks.map(k => values.get(k) ?? null);
}, setInCache: () => { throw new Error('운영 쓰기 금지'); } });
stub('../src/services/darkPool', { getDarkPoolBatchChecked: async (...args) => {
  darkReads++; if (fail) throw new Error('합성 FINRA 장애');
  if (rawDarkSnapshot !== undefined) return realDarkPool.exports.getDarkPoolBatchChecked(...args);
  return { ok: true, map: darkMap };
} });
stub('../src/lib/net/publicBase', { publicBase: () => 'https://www.signumhq.com' });
const supplierKey = require('../src/lib/guruLens/badges').insiderKey;
const service = require('../src/services/readCheckService');
// Next의 실제 unstable_cache를 사용하고 저장 백엔드만 메모리로 대체한다.
const cacheStore = new Map();
let cacheWrites = 0;
globalThis.__incrementalCache = {
  generateCacheKey: async k => k,
  get: async (k, ctx) => { assert.equal(ctx.revalidate, 300); return cacheStore.get(k) ?? null; },
  set: async (k, value) => { cacheWrites++; cacheStore.set(k, { value, isStale: false }); },
};
const page = require('../src/app/[locale]/tools/read-check/page');
const props = (l, q = {}) => ({ params: Promise.resolve({ locale: l }), searchParams: Promise.resolve(q) });
const html = async (l, q) => renderToStaticMarkup(await page.default(props(l, q)));
const realFetch = globalThis.fetch;
let blockedFetches = 0;
globalThis.fetch = async () => { blockedFetches++; throw new Error('외부 접근 금지'); };

test('옵션 규칙: 우세·등호·0·음수·NaN·부분 결측', () => {
  const f = complete();
  assert.equal(rules.judge('options', 'claim', f), 'overreach');
  assert.equal(rules.judge('options', 'observe', f), 'supported');
  assert.equal(rules.judge('options', 'opposite', f), 'overreach');
  for (const [c, p, result] of [[1,1,'premise'], [0,1,'premise'], [1,0,'overreach'], [0,0,'insufficient'],
    [-1,1,'insufficient'], [NaN,1,'insufficient'], [Infinity,1,'insufficient'], [null,1,'insufficient'], [1,undefined,'insufficient'], [1.5,2,'insufficient']]) {
    f.options.callVol = c; f.options.putVol = p;
    assert.equal(rules.judge('options', 'claim', f), result);
  }
  assert.equal(rules.judge('options', 'observe', empty()), 'insufficient');
});
test('장외 규칙: 0·100 경계와 결측, 어느 비중도 매집·순매도 확정 불가', () => {
  const f = complete();
  for (const pct of [0, 0.00001, 50, 100]) {
    f.darkPool.pct = pct;
    assert.equal(rules.judge('darkPool', 'claim', f), 'overreach');
    assert.equal(rules.judge('darkPool', 'opposite', f), 'overreach');
    assert.equal(rules.judge('darkPool', 'observe', f), 'supported');
  }
  for (const pct of [-0.01, 100.01, null, NaN, '50']) {
    f.darkPool.pct = pct; assert.equal(rules.judge('darkPool', 'observe', f), 'insufficient');
  }
  f.darkPool.pct = 50; f.darkPool.volume = null;
  assert.equal(rules.judge('darkPool', 'claim', f), 'insufficient');
});
test('내부자 규칙: S·M·F·P, 계획 true/false/미확인, 파생 미확인', () => {
  const f = complete();
  for (const plan of [true, false, null]) {
    f.insider.plan = plan;
    assert.equal(rules.judge('insider', 'claim', f), 'overreach');
    assert.equal(rules.judge('insider', 'opposite', f), 'overreach');
    assert.equal(rules.judge('insider', 'observe', f), 'supported');
  }
  for (const code of ['M','F','P','A','G','C']) {
    f.insider.code = code; assert.equal(rules.judge('insider', 'claim', f), 'premise');
  }
  f.insider.code = ''; assert.equal(rules.judge('insider', 'claim', f), 'insufficient');
  f.insider.code = 'S'; f.insider.derivative = null;
  assert.equal(rules.judge('insider', 'observe', f), 'supported');
  f.insider.shares = null;
  assert.equal(rules.judge('insider', 'observe', f), 'insufficient');
});
test('날짜·입력 경계: 허용 목록, 반복 쿼리, 유효 달력일·만료·미래', () => {
  assert.equal(rules.parseTicker(' nvda '), 'NVDA');
  for (const x of ['SPY', 'BAD', '<script>', ['NVDA'], undefined]) assert.equal(rules.parseTicker(x), null);
  for (const x of [['observe'], 'correct', undefined]) assert.equal(rules.parseChoice(x), null);
  assert.equal(rules.validDay('2026-02-30'), false);
  assert.equal(rules.recentDay('2026-10-14', NOW, 7), true);
  assert.equal(rules.recentDay('2026-10-13', NOW, 7), false);
  assert.equal(rules.recentDay('2026-10-22', NOW, 7), false);
});
test('내부자 어댑터: 미제공 계획은 null, 원문 값 보존, 잘못된 날짜·URL·행 방어', () => {
  const f = filing();
  let fact = service.insiderFromCache(f, NOW);
  assert.equal(fact.plan, null); assert.equal(fact.shares, 125.25);
  assert.equal(fact.filingUrl, 'https://www.sec.gov/Archives/test.xml');
  for (const url of ['javascript:alert(1)', 'https://sec.gov.evil.test/Archives/x', 'https://www.sec.gov/Archives/x?secret=test', 'https://user:pass@www.sec.gov/Archives/x']) {
    f.transaction_filings[0].filing_url = url;
    assert.equal(service.insiderFromCache(f, NOW).filingUrl, null);
  }
  f.transaction_filings[0].transactions[0].transaction_date = '2026-10-21';
  assert.equal(service.insiderFromCache(f, NOW), null, '공시일 뒤 거래일 배제');
  assert.equal(service.insiderFromCache({ transaction_filings: [null, { transactions: [null] }] }, NOW), null);
  assert.equal(service.insiderFromCache(filing('S', '2026-01-01'), NOW), null);
  const combined = filing('M'); combined.transaction_filings.push(...filing('S').transaction_filings);
  assert.equal(service.insiderFromCache(combined, NOW).code, 'S');
});
test('운영 캐시 계약: 동일 키 9개·FINRA 1회, 원본 정밀도·종목별 날짜·빈 응답 대체', async () => {
  values.set('intrinio:options:eod', { date: '2026-10-20', tickers: { MSFT: { callVol: 0, putVol: 20 } } });
  values.set(supplierKey('AMZN'), filing('M'));
  darkMap = { META: { date: '2026-10-19', pct: 51.123456789, volume: 1234567 } };
  const snapshot = await service.loadReadCheckSnapshot();
  assert.equal(keys.length, 9); assert.equal(keys[0], 'intrinio:options:eod');
  assert.deepEqual(keys.slice(1), rules.READ_CHECK_TICKERS.map(supplierKey));
  const cases = rules.selectCases(snapshot.rows, null);
  assert.deepEqual(cases.map(x => x.ticker), ['MSFT', 'META', 'AMZN']);
  assert.ok(cases.every(x => x.replaced));
  assert.equal(cases[1].facts.darkPool.date, '2026-10-19');
  assert.equal(evidence('darkPool', cases[1].facts, 'ko')[0][1], '51.123456789%');
  assert.equal(cases[0].facts.options.callVol, 0, '0을 결측으로 바꾸지 않는다');
});
test('운영 실측 형태: 옵션 묶음 JSON 문자열·ISO 공시 시각도 읽는다(10/21 EC2 MGET 실측)', async () => {
  values.clear(); darkMap = {};
  values.set('intrinio:options:eod', JSON.stringify({ date: '2026-10-20', tickers: { NVDA: { callVol: 1163577, putVol: 679587 } } }));
  const iso = filing('S', '2026-10-16'); iso.transaction_filings[0].filing_date = '2026-10-19T22:32:55.000Z';
  values.set(supplierKey('AAPL'), iso);
  const rows = (await service.loadReadCheckSnapshot()).rows;
  const nvda = rows.find(r => r.ticker === 'NVDA'), aapl = rows.find(r => r.ticker === 'AAPL');
  assert.deepEqual(nvda.options, { date: '2026-10-20', callVol: 1163577, putVol: 679587 });
  assert.equal(aapl.insider.date, '2026-10-19'); assert.equal(aapl.insider.transactionDate, '2026-10-16');
  values.set('intrinio:options:eod', '{깨진 JSON');
  assert.equal((await service.loadReadCheckSnapshot()).rows.find(r => r.ticker === 'NVDA').options, null);
  assert.deepEqual(evidence('options', { options: nvda.options }, 'ko').map(x => x[1]), ['1,163,577', '679,587']);
  assert.equal(require('../src/lib/readCheck/copy').grouped(1234567.125), '1,234,567.125');
  values.clear();
});
test('운영 장애·오래된 판: 사례 3개 유지, 허용 종목 대체 후 전부 없으면 자료 부족', async () => {
  fail = true;
  const bad = await service.loadReadCheckSnapshot();
  const cases = rules.selectCases(bad.rows, 'AAPL');
  assert.equal(cases.length, 3);
  for (const c of cases) assert.equal(rules.judge(c.kind, 'observe', c.facts), 'insufficient');
  fail = false;
  values.set('intrinio:options:eod', { date: '2026-10-13', tickers: { MSFT: { callVol: 10, putVol: 1 } } });
  const old = await service.loadReadCheckSnapshot();
  assert.ok(old.rows.every(r => r.options === null));
});
test('관문 재현: FINRA 원본 거래량 결측은 실제 변환·서비스·화면에서 자료 부족', async () => {
  try {
    for (const vol of [null, undefined, '0', -1, NaN, Infinity]) {
      rawDarkSnapshot = { date: '2026-10-20', tickers: { TSLA: { pct: 48.2, vol } } };
      const snapshot = await service.loadReadCheckSnapshot();
      assert.equal(snapshot.rows.find(r => r.ticker === 'TSLA').darkPool, null, `거래량 ${String(vol)}`);
      const item = rules.selectCases(snapshot.rows, null).find(c => c.kind === 'darkPool');
      for (const choice of ['observe', 'claim', 'opposite']) {
        assert.equal(rules.judge('darkPool', choice, item.facts), 'insufficient');
      }
      cacheStore.clear();
      for (const l of ['ko', 'en', 'ja']) {
        const h = await html(l, { darkPool: 'observe' });
        const card = h.match(/<article[^>]*data-kind="darkPool"[\s\S]*?<\/article>/)[0];
        assert.match(card, /data-verdict="insufficient"/);
        assert.ok(card.includes(READ_COPY[l].missing));
        assert.doesNotMatch(card, /<dd>0/);
        assert.equal((h.match(/<article /g) ?? []).length, 3);
      }
    }
    // 실제 0은 유효하며, 행의 관측일을 전체 판의 날짜로 바꾸지 않는다.
    rawDarkSnapshot = { date: '2026-10-20', tickers: { TSLA: { pct: 48.2, vol: 0, d: '2026-10-19' } } };
    const zero = (await service.loadReadCheckSnapshot()).rows.find(r => r.ticker === 'TSLA');
    assert.equal(zero.darkPool.volume, 0);
    assert.equal(zero.darkPool.date, '2026-10-19');
    assert.equal(rules.judge('darkPool', 'observe', zero), 'supported');
    // 결측 종목은 기존 규칙대로 다른 종목으로 대체하되 과거 판·오래된 행으로 메우지 않는다.
    rawDarkSnapshot = { date: '2026-10-20', tickers: {
      TSLA: { pct: 48.2, vol: null }, META: { pct: 51, vol: 100, d: '2026-10-01' },
      AAPL: { pct: 40, vol: 123, d: '2026-10-20' },
    }, stale: { date: '2026-10-19', tickers: { TSLA: { pct: 48.2, vol: 999 } } } };
    const item = rules.selectCases((await service.loadReadCheckSnapshot()).rows, null)[1];
    assert.equal(item.ticker, 'AAPL'); assert.equal(item.replaced, true);
    assert.equal(item.facts.darkPool.volume, 123); assert.equal(item.facts.darkPool.date, '2026-10-20');
    // 기본 호출을 쓰는 기존 화면·API의 반환은 그대로다.
    const legacy = await realDarkPool.exports.getDarkPoolBatchChecked(['TSLA', 'AAPL']);
    assert.equal(legacy.map.TSLA.volume, 0);
    assert.deepEqual(legacy.map, await realDarkPool.exports.getDarkPoolBatch(['TSLA', 'AAPL']));
  } finally { rawDarkSnapshot = undefined; cacheStore.clear(); }
});
test('관문 재현: 설치된 Next 진단기로 페이지 export 71002 방지', () => {
  const utils = require('next/dist/server/typescript/utils');
  const config = require('next/dist/server/typescript/rules/config').default;
  utils.init({ ts, info: { project: { getCurrentDirectory: () => root,
    projectService: { logger: { info() {} } } } } });
  const filename = 'src/app/[locale]/tools/read-check/page.tsx';
  const diagnose = text => {
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    return source.statements.filter(n => ts.isVariableStatement(n)
      && n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword))
      .flatMap(n => config.getSemanticDiagnosticsForExportVariableStatement(source, n));
  };
  const before = execFileSync('git', ['show', `b7072dfbb:${filename}`], { cwd: root, encoding: 'utf8' });
  assert.ok(diagnose(before).some(d => d.code === 71002), '이전 구현의 관문 오류 재현');
  assert.deepEqual(diagnose(fs.readFileSync(path.join(root, filename), 'utf8')).map(d => d.code), []);
  assert.deepEqual(Object.keys(page).sort(), ['default', 'dynamic', 'generateMetadata']);
});
test('실제 Next 캐시: 동시 미스 20개는 읽기 1벌, 3언어·답안·입력은 같은 5분 캐시', async () => {
  values.clear(); darkMap = {};
  values.set('intrinio:options:eod', { date: '2026-10-20', tickers: { NVDA: { callVol: 10001, putVol: 9999 } } });
  values.set(supplierKey('AAPL'), filing());
  darkMap.TSLA = { date: '2026-10-20', pct: 51.123456789, volume: 1234567 };
  cacheStore.clear();
  const before = reads, beforeDark = darkReads;
  await Promise.all(Array.from({ length: 20 }, () => service.readCheckSnapshot()));
  assert.equal(reads - before, 1); assert.equal(darkReads - beforeDark, 1);
  for (const l of ['ko','en','ja']) {
    await html(l, { t: 'MSFT', options: 'observe', darkPool: 'claim', insider: 'opposite' });
    await html(l, { t: '<script>', options: ['claim'] });
  }
  assert.equal(reads - before, 1); assert.equal(darkReads - beforeDark, 1);
  assert.ok(cacheWrites > 0); assert.equal(blockedFetches, 0, '공급사·AI 호출 0');
  // 만료된 캐시는 다음 읽기에서 한 벌만 재조회한다.
  for (const entry of cacheStore.values()) entry.isStale = true;
  await service.readCheckSnapshot();
  assert.equal(reads - before, 2); assert.equal(darkReads - beforeDark, 2);
});
test('3언어 SSR: 세 사례·보기 3개·판정 3항목·출처·정밀도·앱 연결·입력 방어', async () => {
  const filename = 'src/app/[locale]/tools/read-check/page.tsx', before = { exports: {} };
  const source = execFileSync('git', ['show', `b7072dfbb:${filename}`], { cwd: root, encoding: 'utf8' });
  new Function('require', 'module', 'exports', compile(source, filename))(require, before, before.exports);
  for (const l of ['ko','en','ja']) {
    const c = READ_COPY[l], h = await html(l, { options: 'observe', darkPool: 'claim', insider: 'observe' });
    // 10/21 검수: 조회 시각 표기만 «YYYY-MM-DD HH:MM UTC»로 정리했다 — 그 한 줄 외 바이트 동일.
    const norm = x => x.replace(/(<time dateTime="[^"]+">)[^<]*<\/time> (?:\(UTC\)|UTC)/g, '$1</time> UTC');
    assert.match(h, /<time dateTime="[^"]+">\d{4}-\d{2}-\d{2} \d{2}:\d{2}<\/time> UTC/);
    assert.equal(norm(h), norm(renderToStaticMarkup(await before.exports.default(props(l, {
      options: 'observe', darkPool: 'claim', insider: 'observe',
    })))), '정상 자료의 기존 라벨·문구·배치·CSS 바이트 동일');
    assert.ok(h.includes(`lang="${l}"`)); assert.ok(h.includes(c.title));
    assert.equal((h.match(/<article /g) ?? []).length, 3);
    assert.equal((h.match(/type="radio"/g) ?? []).length, 9);
    assert.equal((h.match(/class="rc-result"/g) ?? []).length, 3);
    for (const text of [c.confirmed, c.unknown, c.better, c.unprovided, '51.123456789%', '10,001', '125.25',
      'Data source: FINRA', `https://www.signumhq.com/app?from=readcheck_${l}`, 'https://www.sec.gov/Archives/test.xml']) assert.ok(h.includes(text), text);
    assert.ok(h.includes('name="options" value="observe"'));
    const bad = await html(l, { t: '<script>', options: ['claim'] });
    assert.ok(bad.includes(c.invalid)); assert.ok(!bad.includes('<script>'));
    assert.equal((bad.match(/class="rc-result"/g) ?? []).length, 0);
  }
});
test('메타데이터: 색인 허용·canonical·hreflang·기존 OG 경로 방식', async () => {
  for (const l of ['ko','en','ja']) {
    const m = await page.generateMetadata(props(l));
    assert.deepEqual(m.robots, { index: true, follow: true });
    assert.equal(m.alternates.canonical, `https://www.signumhq.com/${l}/tools/read-check`);
    assert.equal(Object.keys(m.alternates.languages).length, 4);
    assert.equal(m.openGraph.images[0].url, `https://www.signumhq.com/${l}/tools/read-check/og`);
  }
});
test('OG: 실제 PNG 1200×630, 3언어 및 글꼴 장애시 영문 대체, 운영 읽기 없음', async () => {
  const og = require('../src/app/[locale]/tools/read-check/og/route');
  const before = reads;
  for (const l of ['ko','en','ja']) {
    const res = await og.GET(new Request(`http://localhost/${l}/tools/read-check/og`), { params: Promise.resolve({ locale: l }) });
    assert.equal(res.status, 200);
    const png = Buffer.from(await res.arrayBuffer());
    assert.equal(png.subarray(1,4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
  }
  assert.equal(reads, before);
  assert.equal(blockedFetches, 2, '외부 글꼴 시도만 차단됨');
});
test('기존 영수증·원천 API·내부자 어댑터: 기준 커밋과 소스 바이트 동일', () => {
  const base = '8efa93c14';
  // 이후 병합된 다른 기능을 저장소 전체 변경 목록으로 금지하지 않는다.
  // 이 도구가 사용하는 원천 API와 기존 영수증은 실제 소스로 계속 대조한다.
  for (const f of ['src/app/[locale]/receipts/earnings/page.tsx', 'src/app/[locale]/receipts/earnings/og/route.tsx',
    'src/app/api/flow/options-eod/route.ts', 'src/app/api/flow/dark-pool/route.ts',
    'src/app/api/command/insider/route.ts', 'src/services/insiderService.ts']) {
    assert.deepEqual(fs.readFileSync(path.join(root, f)), execFileSync('git', ['show', `${base}:${f}`], { cwd: root }));
  }
});
test('기존 영수증 3언어 HTML: 데이터·결측·빈 주가 기준 구현과 바이트 동일', async () => {
  const filename = 'src/app/[locale]/receipts/earnings/page.tsx';
  let receiptData;
  stub('../src/services/earningsReceiptsService', { readEarningsReceipts: async () => receiptData });
  const current = require('../src/app/[locale]/receipts/earnings/page');
  const old = { exports: {} };
  const source = execFileSync('git', ['show', `8efa93c14:${filename}`], { cwd: root, encoding: 'utf8' });
  new Function('require', 'module', 'exports', compile(source, filename))(require, old, old.exports);
  const base = { week: '2026-10-12', weekEnd: '2026-10-18', asOf: new Date(NOW).toISOString(),
    summary: { total: 1, pre: 0, within: 0, outside: 0, backfilled: 0, unverified: 0, missing: 1 } };
  const row = { ticker: 'AAPL', date: '2026-10-13', hour: 'amc', etTime: null,
    sourceUrl: 'https://example.test/earnings', provenance: 'pre', beyond: false, issues: [],
    expected: { pct: 3, capturedAt: NOW - 86400_000, expiry: '2026-10-16', session: '2026-10-12', src: 'page' },
    actual: { pct: 2, baseDate: '2026-10-13', baseClose: 100, reactDate: '2026-10-14', reactClose: 102, at: NOW, check: 'fmp' } };
  for (const rows of [[row], [{ ...row, expected: null, actual: null, provenance: 'missing', beyond: null, issues: ['no_record'] }], []]) {
    receiptData = { ...base, rows, emptyReason: rows.length ? null : 'no_schedule' };
    for (const l of ['ko','en','ja']) {
      const p = { params: Promise.resolve({ locale: l }), searchParams: Promise.resolve({ week: '2026-10-12' }) };
      assert.equal(renderToStaticMarkup(await current.default(p)), renderToStaticMarkup(await old.exports.default(p)));
    }
  }
});
test('전체 결측 SSR: 세 사례와 세 판정 영역을 숨기지 않는다', async () => {
  fail = true; cacheStore.clear();
  for (const l of ['ko','en','ja']) {
    const h = await html(l);
    assert.equal((h.match(/<article /g) ?? []).length, 3);
    assert.equal((h.match(/data-verdict="insufficient"/g) ?? []).length, 3);
    assert.ok(h.includes(READ_COPY[l].missing));
  }
  fail = false; cacheStore.clear();
});
test('375폭 검토 자료: 유동 카드·줄바꿈·44px 조작·다크 토큰 및 3언어 오프라인 HTML', async () => {
  const css = (await html('ko')).match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /width:100%;max-width:760px/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /var\(--background,#1f2533\)/);
  assert.doesNotMatch(css, /display:none|min-width:[1-9]/);
  const out = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'signum-read-check-preview-'));
  for (const l of ['ko','en','ja']) {
    const h = await html(l, { options: 'observe', darkPool: 'claim', insider: 'observe' });
    fs.writeFileSync(path.join(out, `${l}.html`), `<!doctype html><html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${READ_COPY[l].title}</title><style>html,body{margin:0;background:#1f2533;font-family:system-ui,sans-serif}</style></head><body>${h}</body></html>`);
  }
  for (const l of ['ko','en','ja']) assert.ok(fs.readFileSync(path.join(out, `${l}.html`), 'utf8').includes(READ_COPY[l].title));
});
test.after(() => { globalThis.fetch = realFetch; Date.now = originalNow; delete globalThis.__incrementalCache; });
