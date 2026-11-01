import assert from 'node:assert/strict';

const stub = (path: string, exports: any) => {
  const id = require.resolve(path); require.cache[id] = { id, filename: id, loaded: true, exports } as any;
};
stub('../src/lib/net/publicBase', { publicBase: () => 'https://local.test' });
stub('../src/lib/marketing/pageViewMark', { markPageView: async () => {} });
stub('../src/services/darkPool', {
  getDarkPoolCurrent: async () => null,
  getDarkPoolLeaders: async () => ({ date: '2026-10-30', covered: 0, marketAvg: 0, universe: 0, surge: [], absorbed: [], sold: [], shortHigh: [], shortLow: [] }),
});
stub('../src/services/institutionalFlow', { getInstitutionalFlowLeaders: async () => ({ date: '2026-10-30', totalNotional: 0, tickers: 0, callPct: 0, contracts: [], byTicker: [], topCalls: [], topPuts: [] }) });
stub('../src/lib/rankings/present', { loadRankingSnapshot: async () => null, describeItem: () => '', emptyText: () => '' });
stub('../src/services/structureService', { peekStructureLevelsDetailed: async () => ({ levels: new Map(), noSnapshot: [] }) });
stub('../src/services/intrinioClient', { peekEodCloseRow: async () => null });
stub('../src/services/todayPicksService', { readPicks: async () => ({ doc: null, off: false }) });
stub('../src/components/share/ShareLanding', { ShareLanding: () => null });
stub('next/headers', { headers: async () => new Headers({ 'user-agent': 'Googlebot' }), cookies: async () => ({ get: () => undefined }) });
globalThis.fetch = async (url: any) => {
  assert.ok(String(url).startsWith('https://local.test/api/undercurrent/ticker?'));
  return Response.json({ success: true, hasMoneyData: false, cards: [], money: {} });
};
const { datasetDescription } = require('../src/lib/seo/datasetDescription');
const { RANKINGS } = require('../src/lib/rankings/registry');
const pages = [
  require('../src/app/[locale]/dark-pool/page').default,
  require('../src/app/[locale]/options-flow/page').default,
  require('../src/app/[locale]/flow/[ticker]/page').default,
  require('../src/app/[locale]/rankings/page').default,
  require('../src/app/[locale]/rankings/[id]/page').default,
];
function extract(node: any): any {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'script' && node.props.type === 'application/ld+json') {
    const data = JSON.parse(node.props.dangerouslySetInnerHTML.__html);
    return (Array.isArray(data) ? data : [data]).find((x: any) => x['@type'] === 'Dataset');
  }
  for (const child of [node.props?.children].flat(Infinity)) { const found = extract(child); if (found) return found; }
  return null;
}
function check(text: string) {
  assert.ok(Array.from(text).length >= 50, `too short: ${text}`);
  assert.ok(text.length <= 5000, `too long: ${text.length}`);
}
(async () => {
  let count = 0;
  for (const locale of ['en', 'ko', 'ja']) {
    for (let i = 0; i < pages.length; i++) {
      const ids = i === 4 ? RANKINGS.map((r: any) => r.id) : [undefined];
      const tickers = i === 2 ? ['MSFT', 'AAPL'] : [undefined];
      for (const id of ids) for (const ticker of tickers) {
        const tree = await pages[i]({ params: Promise.resolve({ locale, id, ticker }), searchParams: Promise.resolve({}) });
        const dataset = extract(tree);
        assert.ok(dataset, `missing dataset: ${i} ${locale} ${id}`);
        check(dataset.description); count++;
      }
    }
    check(datasetDescription('', locale));
    check(datasetDescription('짧음', locale));
    const long = datasetDescription('A complete sentence. '.repeat(400), locale);
    check(long); assert.ok(long.endsWith('.'));
    check(datasetDescription('😀'.repeat(6000), locale));
    check(datasetDescription('x'.repeat(6000), locale));
  }
  assert.equal(datasetDescription('a'.repeat(50), 'en'), 'a'.repeat(50));
  console.log(`Dataset descriptions: ${count} page cases and boundary cases passed`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
