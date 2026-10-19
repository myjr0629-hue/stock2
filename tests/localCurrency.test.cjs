// Run: node tests/localCurrency.test.cjs (offline; no Redis or HTTP requests).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const originalLoad = Module._load;
const messages = Object.fromEntries(['ko', 'ja', 'en'].map(locale => [locale, require(`../src/messages/${locale}.json`)]));
let locale = 'ko';
let swrData;
let swrCalls = [];
let bannerSuppressed = false;
const rates = {
  usdkrw: 1350, usdjpy: 150,
  usdkrwUpdatedAt: '2026-10-19T12:00:00.000Z',
  usdjpyUpdatedAt: '2026-10-19T13:00:00.000Z',
};
Module._load = function(request, parent, isMain) {
  if (request === 'swr') return (key, fetcher, config) => {
    swrCalls.push({ key, fetcher, config });
    return { data: key === null ? undefined : swrData };
  };
  if (request === 'next-intl') return {
    useTranslations: namespace => (key, values = {}) => {
      let text = messages[locale][namespace][key];
      assert.equal(typeof text, 'string', `${locale}.${namespace}.${key}`);
      for (const [name, value] of Object.entries(values)) text = text.replace(`{${name}}`, value);
      return text;
    },
  };
  if (request === '@/hooks/useBannerSuppression') return { useBannerSuppression(active) { bannerSuppressed = active; } };
  if (request === '@/services/redisClient') return { getFromCache: async key => ({
    krw: { price: 1350, updatedAt: rates.usdkrwUpdatedAt },
    jpy: { price: 150, updatedAt: rates.usdjpyUpdatedAt },
  })[key] };
  if (request === '@/services/yahooFinanceHub') return { YAHOO_CACHE_KEYS: { USDKRW: 'krw', USDJPY: 'jpy' } };
  if (request === 'next/server') return { NextResponse: { json: data => data } };
  if (request.endsWith('.module.css')) return new Proxy({}, { get: (_, key) => key });
  if (request.startsWith('@/')) request = path.join(root, 'src', request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const { formatLocalCurrency: fmt, localExchangeRate, createExchangeRateLoader, EXCHANGE_RATE_TTL_MS: TTL } = require('../src/lib/app/localCurrency.ts');
const { LocalCurrencyLine } = require('../src/components/app/LocalCurrencyLine.tsx');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log(`✓ ${name}`); }
function render(lang, data = rates, usd = 1234.567) {
  locale = lang; swrData = data; swrCalls = [];
  return renderToStaticMarkup(React.createElement(LocalCurrencyLine, { usd, locale }));
}
const response = data => ({ ok: true, json: async () => data });

(async () => {
  await test('ko 원화 / ja 엔화 / en·미지원 로케일 생략', () => {
    assert.equal(fmt(1234.567, 'ko', rates), '≈ ₩1,666,665');
    assert.equal(fmt(1234.567, 'ja', rates), '≈ ¥185,185');
    assert.equal(fmt(10, 'en', rates), null);
    assert.equal(fmt(10, 'fr', rates), null);
  });
  await test('쉼표 3자리·소수 0자리·반올림 경계·큰 평가액', () => {
    for (const [lang, symbol] of [['ko', '₩'], ['ja', '¥']]) {
      const unit = { usdkrw: 1, usdjpy: 1 };
      assert.equal(fmt(1234567.49, lang, unit), `≈ ${symbol}1,234,567`);
      assert.equal(fmt(1234567.5, lang, unit), `≈ ${symbol}1,234,568`);
      assert.equal(fmt(1234567890.5, lang, unit), `≈ ${symbol}1,234,567,891`);
      assert.equal(fmt(0, lang, rates), `≈ ${symbol}0`);
    }
  });
  await test('음수 평가손익 부호·양수 부호 유지', () => {
    assert.equal(fmt(-10, 'ko', rates), '≈ -₩13,500');
    assert.equal(fmt(10, 'ja', rates, true), '≈ +¥1,500');
    assert.equal(fmt(-10, 'ja', rates, true), '≈ -¥1,500');
  });
  await test('환율 결측·0·음수·비유한값·문자열은 생략', () => {
    for (const bad of [null, undefined, 0, -1, NaN, Infinity, '1350']) {
      assert.equal(fmt(10, 'ko', { usdkrw: bad, usdjpy: 150 }), null);
      assert.equal(fmt(10, 'ja', { usdkrw: 1350, usdjpy: bad }), null);
    }
    assert.equal(fmt(10, 'ko', null), null);
    for (const bad of [null, undefined, NaN, Infinity]) assert.equal(fmt(bad, 'ko', rates), null);
    assert.equal(fmt(Number.MAX_VALUE, 'ko', rates), null);
  });
  await test('한 통화 결측이 다른 통화를 가리지 않음', () => {
    assert.equal(fmt(10, 'ja', { usdkrw: null, usdjpy: 150 }), '≈ ¥1,500');
    assert.equal(fmt(10, 'ko', { usdkrw: 1350, usdjpy: null }), '≈ ₩13,500');
  });
  await test('통화별 기준 시각 분리·잘못된 시각 생략', () => {
    assert.equal(localExchangeRate('ko', rates).updatedAt, rates.usdkrwUpdatedAt);
    assert.equal(localExchangeRate('ja', rates).updatedAt, rates.usdjpyUpdatedAt);
    assert.equal(localExchangeRate('ko', { ...rates, usdkrwUpdatedAt: 'bad' }).updatedAt, null);
  });
  await test('실제 표시 컴포넌트: ko·ja 통화·각 기준 시각·i 접근성', () => {
    const ko = render('ko');
    assert.match(ko, /≈ ₩1,666,665/);
    assert.match(ko, /환율 기준 시각:.*21:00/);
    assert.match(ko, /role="button".*tabindex="0"/);
    const ja = render('ja');
    assert.match(ja, /≈ ¥185,185/);
    assert.match(ja, /為替レート基準時刻:.*22:00/);
  });
  await test('실제 표시 컴포넌트: en DOM·요청 없음 / 결측 DOM 없음', () => {
    assert.equal(render('en'), '');
    assert.equal(swrCalls[0].key, null);
    assert.equal(render('ko', { usdjpy: 150 }), '');
    assert.equal(render('ja', undefined, null), '');
    assert.equal(render('ko', rates, Infinity), '');
  });
  await test('시간 결측: 환산은 표시·시각 없음 문구, 다른 통화 시각 전용 금지', () => {
    const html = render('ja', { usdjpy: 150, usdkrwUpdatedAt: rates.usdkrwUpdatedAt });
    assert.match(html, /≈ ¥185,185/);
    assert.match(html, /為替レート基準時刻なし/);
  });
  await test('툴팁을 연 상태에서 환율 결측으로 바뀌면 배너 억제도 해제', () => {
    const useState = React.useState;
    try {
      React.useState = () => [true, () => {}];
      assert.equal(render('ko', {}), '');
      assert.equal(bannerSuppressed, false);
    } finally { React.useState = useState; }
  });
  await test('실제 훅: 모든 앱 호출자 ko·ja 키 공유 / 30분 / 포커스·재접속 요청 없음', () => {
    render('ko'); const ko = swrCalls[0];
    render('ja'); const ja = swrCalls[0];
    assert.equal(ko.key, ja.key);
    assert.equal(ko.fetcher, ja.fetcher);
    assert.equal(ko.config.refreshInterval, 1800000);
    assert.equal(ko.config.dedupingInterval, 1800000);
    assert.equal(ko.config.revalidateOnFocus, false);
    assert.equal(ko.config.revalidateOnReconnect, false);
  });
  await test('동시 목록·헤더 조회 1회 / 30분 직전 캐시 / 만료 후 1회', async () => {
    let clock = 100; let calls = 0;
    const load = createExchangeRateLoader(async url => { assert.equal(url, '/api/exchange-rates'); calls++; return response(rates); }, () => clock);
    const results = await Promise.all(Array.from({ length: 100 }, () => load()));
    assert.equal(calls, 1); assert.deepEqual(results[99], rates);
    clock += TTL - 1; await load(); assert.equal(calls, 1);
    clock++; await Promise.all([load(), load()]); assert.equal(calls, 2);
  });
  await test('HTTP·네트워크·JSON 실패·결측도 30분 캐시, 만료 실패 시 이전 값 사용 금지', async () => {
    for (const request of [
      async () => ({ ok: false }), async () => { throw Error('offline'); },
      () => { throw Error('sync'); }, async () => ({ ok: true, json: async () => { throw Error('invalid'); } }),
      async () => response(null), async () => response([]),
    ]) {
      let clock = 1; let calls = 0;
      const load = createExchangeRateLoader(async () => { calls++; return request(); }, () => clock);
      assert.equal(await load(), null); await load(); assert.equal(calls, 1);
      clock += TTL; assert.equal(await load(), null); assert.equal(calls, 2);
    }
    let clock = 1; let fail = false;
    const load = createExchangeRateLoader(async () => fail ? { ok: false } : response(rates), () => clock);
    assert.deepEqual(await load(), rates); clock += TTL; fail = true;
    assert.equal(await load(), null);
  });
  await test('API 기존 필드 보존·KRW/JPY 독립 기준 시각 (Redis mock)', async () => {
    const data = await require('../src/app/api/exchange-rates/route.ts').GET();
    assert.equal(data.usdkrw, 1350); assert.equal(data.usdjpy, 150);
    assert.equal(data.updatedAt, rates.usdkrwUpdatedAt);
    assert.equal(data.usdkrwUpdatedAt, rates.usdkrwUpdatedAt);
    assert.equal(data.usdjpyUpdatedAt, rates.usdjpyUpdatedAt);
  });
  console.log(`${passed}/${passed} 통과`);
})().catch(error => { console.error(error); process.exitCode = 1; });
