import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { upcoming, intentCopy, type Intent } from '../src/lib/seo/tickerEarningsIntent';
const now = Date.parse('2026-11-05T15:00:00Z');
const event = { ticker: 'AAPL', date: '2026-11-12', hour: 'amc' } as any;
const data: Intent = { ticker: 'AAPL', date: '2026-11-06', pct: 4.6, history: null };
test('confirmed 7-day window, announcement phase, and missing move in three languages', () => {
  assert.ok(upcoming('AAPL', now, [event]));
  assert.equal(upcoming('AAPL', now, [{ ...event, date: '2026-11-13' }]), null);
  assert.equal(upcoming('MSFT', now, [event]), null);
  assert.equal(upcoming('AAPL', Date.parse('2026-11-05T23:30:00Z'), [{ ...event, date: '2026-11-05' }]), null);
  assert.equal(intentCopy(data, 'en').title, 'AAPL Earnings Nov 6: Options Price a ±4.6% Move — Expected vs Actual | SIGNUM HQ');
  assert.equal(intentCopy(data, 'ko').title, 'AAPL 실적 11/6: 옵션 예상 변동폭 ±4.6% — 예상 vs 실제 | SIGNUM HQ');
  assert.equal(intentCopy(data, 'ja').title, 'AAPL 決算 11/6：オプション想定変動幅 ±4.6% — 想定と実際 | SIGNUM HQ');
  for (const loc of ['en', 'ko', 'ja']) {
    const c = intentCopy({ ...data, pct: null }, loc);
    assert.ok(!c.title.includes('±')); assert.ok(c.title.includes('AAPL')); assert.equal(c.history, null);
  }
});

const stub = (path: string, exports: any) => { const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports } as any; };
let current: Intent | null = data;
stub('../src/lib/seo/tickerEarningsIntent', { readIntent: async () => current, intentCopy });
stub('../src/services/structureService', { peekStructureLevelsDetailed: async () => ({ levels: new Map(), noSnapshot: [] }) });
stub('../src/services/darkPool', { getDarkPoolCurrent: async () => null });
stub('../src/services/intrinioClient', { peekEodCloseRow: async () => null });
stub('../src/lib/marketing/pageViewMark', { markPageView: async () => {} });
stub('../src/components/share/ShareLanding', { ShareLanding: () => null });
stub('../src/lib/net/publicBase', { publicBase: () => 'https://local.test' });
stub('next/headers', { headers: async () => new Headers({ 'user-agent': 'Googlebot' }), cookies: async () => ({ get: () => undefined }) });
globalThis.fetch = async (url: any) => {
  assert.ok(String(url).startsWith('https://local.test/api/undercurrent/ticker?'));
  return Response.json({ success: true, ticker: 'AAPL', hasMoneyData: true, cards: [], generatedAt: new Date().toISOString(), money: { price: null, maxPain: 525, callWall: 555, putFloor: 500, darkPoolPct: 37.3, darkPoolDate: '2026-10-23' } });
};
const Page = require('../src/app/[locale]/flow/[ticker]/page');
const props = (locale: string) => ({ params: Promise.resolve({ locale, ticker: 'AAPL' }), searchParams: Promise.resolve({}) });
test('metadata, visible block and matching FAQ appear only for eligible tickers', async () => {
  for (const locale of ['en', 'ko', 'ja']) {
    current = data;
    assert.equal((await Page.generateMetadata(props(locale))).title, intentCopy(data, locale).title);
    const html = renderToStaticMarkup(await Page.default(props(locale)));
    assert.ok(html.includes(intentCopy(data, locale).heading));
    assert.ok(html.includes('FAQPage')); assert.ok(html.includes('±4.6%'));
    assert.ok(!html.includes('→ Actual'));
    current = { ...data, history: { date: '2026-08-01', expectedPct: 5.0, actualPct: -3.0, beyond: false } as any };
    const withHistory = renderToStaticMarkup(await Page.default(props(locale)));
    assert.ok(withHistory.includes('±5.0%')); assert.ok(withHistory.includes('-3.0%'));
    current = null;
    const no = renderToStaticMarkup(await Page.default(props(locale)));
    assert.ok(!no.includes('FAQPage')); assert.ok(!no.includes(intentCopy(data, locale).heading));
    assert.notEqual((await Page.generateMetadata(props(locale))).title, intentCopy(data, locale).title);
  }
});
