/** Offline: node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' tests/robotsFunnelBots.test.ts */
import assert from 'node:assert/strict';
import Module from 'node:module';
import fs from 'node:fs';

function mock(name: string, exports: unknown) {
  const id = require.resolve(name);
  require.cache[id] = { id, filename: id, loaded: true, exports } as Module;
}
mock('../src/lib/net/publicBase', { publicBase: () => 'https://local.test' });
const writes = new Map<string, unknown>();
mock('../src/services/redisClient', {
  getFromCache: async (key: string) => writes.get(key) ?? null,
  setInCache: async (key: string, value: unknown) => { writes.set(key, value); },
});
const server = require('next/server');
const pending: Promise<void>[] = [];
mock('next/server', { ...server, after: (fn: () => Promise<void>) => { pending.push(fn()); } });
const robots = require('../src/app/robots').default();
const { resolveRobots } = require('next/dist/build/webpack/loaders/metadata/resolve-route-data');
const { POST } = require('../src/app/api/funnel-hit/route');

async function main() {
  const routing = fs.readFileSync('src/i18n/routing.ts', 'utf8');
  const localeList = routing.match(/export const locales = \[([^\]]+)\]/)?.[1];
  assert.ok(localeList);
  const locales = [...localeList.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual([...locales].sort(), ['en', 'ja', 'ko']);
  const routes = ['app-view', 'login', 'settings', 'dashboard', 'intel', 'intel-guardian', 'quant-radar', 'watchlist', 'portfolio', 'ticker'];
  const oldRules = ['/api/', '/admin/', ...['', '/en', '/ko', '/ja'].flatMap((prefix) =>
    routes.flatMap((route) => [`${prefix}/${route}$`, `${prefix}/${route}?`, `${prefix}/${route}/`]))];
  const output: string = resolveRobots(robots);
  for (const rule of oldRules) assert.ok(output.split('\n').includes(`Disallow: ${rule}`), rule);
  assert.ok(output.includes('User-Agent: *\nAllow: /\n'));
  assert.ok(output.includes('Sitemap: https://local.test/sitemap.xml'));
  assert.ok(output.includes('Host: https://local.test'));
  const patterns: string[] = robots.rules.disallow;
  const blocked = (path: string) => patterns.some((pattern) => pattern.endsWith('$') ? path === pattern.slice(0, -1) : path.startsWith(pattern));
  for (const locale of locales) {
    for (const route of routes) for (const suffix of ['', '?x=1', '/', '/detail']) assert.ok(blocked(`/${locale}/${route}${suffix}`));
    for (const path of ['', '/', '/earnings', '/earnings/NVDA', '/blog', '/how-it-works/intel', '/app-view-public']) assert.ok(!blocked(`/${locale}${path}`));
  }
  console.log('✓ robots: 기존 출력과 전체 로케일·공개 경로');

  process.env.VERCEL_ENV = 'preview';
  const bots = ['HeadlessChrome/130', 'ExampleBot/1', 'Crawler/1', 'Spider/1', 'Googlebot/2.1', 'bingbot/2.0', 'Lighthouse', 'Playwright', 'Puppeteer', 'Slackbot'];
  const humans: Array<[string, string]> = [
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 'ios'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', 'android'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', 'web'],
    ['', 'ios'],
  ];
  async function hit(ua: string, platform: string) {
    const response = await POST(new server.NextRequest(`https://local.test/api/funnel-hit?st=onb_show&s=onb_legal&p=${platform}&v=1.0`, { method: 'POST', headers: { 'user-agent': ua } }));
    assert.equal(response.status, 204);
    await Promise.all(pending.splice(0));
  }
  for (const ua of bots) { writes.clear(); await hit(ua, 'web'); assert.equal(writes.size, 0, ua); }
  for (const [ua, platform] of humans) {
    writes.clear(); await hit(ua, platform);
    const keys = [...writes.keys()];
    assert.equal(keys.length, 2, ua);
    assert.ok(keys.some((key) => new RegExp(`^fxp:onb_show:onb_legal:${platform}:\\d{4}-\\d{2}-\\d{2}$`).test(key)));
    assert.ok(keys.some((key) => /^fxp:v:\d{4}-\d{2}-\d{2}$/.test(key)));
    assert.deepEqual([...writes.values()].find((v) => typeof v === 'object'), { [`onb_show|${platform}|1.0`]: 1 });
  }
  console.log('✓ funnel: 봇 수집 차단 및 브라우저·네이티브 집계');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
