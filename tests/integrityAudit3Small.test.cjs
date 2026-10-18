// Offline regressions for N5/N6/N8. Execute: node tests/integrityAudit3Small.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
// An optional baseline directory lets the same cases reproduce the original defects.
const sourceRoot = process.argv[2] ? path.resolve(process.argv[2]) : root;
const read = (rel) => fs.readFileSync(path.join(sourceRoot, rel), 'utf8');
const guardian = 'src/app/[locale]/app-view/guardian/page.tsx';
const watchlist = 'src/components/app/watchlist/useWatchlistData.ts';
const today = 'src/components/app/useTodayPicks.ts';
const hour = 3600_000;
const flush = () => new Promise((resolve) => setImmediate(resolve));
let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message.split('\n')[0]}`); }
}

function sandbox(rel, mocks, extraGlobals = {}, suffix = '') {
  const code = ts.transpileModule(read(rel) + suffix, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
  } }).outputText;
  const mod = { exports: {} };
  const context = vm.createContext({
    module: mod, exports: mod.exports,
    require(id) {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      throw new Error(`Unmocked import: ${id}`);
    },
    fetch() { throw new Error('Live network forbidden'); },
    setTimeout, clearTimeout, ...extraGlobals,
  });
  vm.runInContext(code, context, { filename: rel });
  return mod.exports;
}

function vixCard(level, chgPct) {
  const source = ts.createSourceFile(guardian, read(guardian), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const vars = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) vars[node.name.text] = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  const card = vars.macroCards.elements.find((node) => node.properties.some((p) =>
    p.name?.getText(source) === 'key' && p.initializer?.text === 'vix'));
  const script = `const vix = ${vars.vix.getText(source)}; const vixChg = ${vars.vixChg.getText(source)}; (${card.getText(source)})`;
  return vm.runInNewContext(script, {
    snapshot: { factors: { vix: { level, chgPct } } },
    t: { vixLabel: 'VIX' }, vixStatus: { color: 'status', border: 'transparent', bg: 'status' },
    isVolMetricActive: true,
  });
}

function watchlistHarness() {
  let now = Date.UTC(2026, 9, 19), data = {}, reason = null;
  const mod = sandbox(watchlist, {
    react: {}, '@/lib/app/tickerNames': {}, '@/hooks/useLiveQuotes': {},
    '@/lib/earningsDate': {}, '@/lib/marketCalendar': {},
  }, {
    Date: class extends Date { static now() { return now; } },
    fetch: async (url) => ({ ok: true, json: async () => url.startsWith('/api/flow/dark-pool')
      ? (reason ? { available: false, reason } : { available: true, tickers: data })
      : url.startsWith('/api/market/earnings') ? { rows: [] } : { available: true, opening: {} } }),
  });
  return {
    async save(key, values, advance = 16 * 60_000, noDataReason = null) {
      now += advance; data = values; reason = noDataReason;
      mod._wlDataTest.loadExtras(key, 'en'); await flush();
    },
    get: (key) => mod._wlDataTest.derive(key),
  };
}
const dp = (pct, date = '2026-10-16') => ({ pct, volRatio: pct === 40 ? 3 : 2, date });

function todayHarness() {
  let now = Date.UTC(2026, 9, 19), state, cleanup, nextTimer = 0, calls = 0;
  let response = async () => { throw new Error('offline'); };
  const storage = new Map(), timeouts = new Map(), intervals = new Map(), listeners = new Map(), history = [];
  const addEventListener = (name, cb) => listeners.set(name, cb);
  const mod = sandbox(today, {
    react: {
      useState(initial) { state = initial; return [state, (value) => { state = value; history.push(value.status); }]; },
      useEffect(effect) { cleanup = effect(); },
    },
  }, {
    Date: class extends Date { static now() { return now; } },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    fetch: (...args) => { calls++; return response(...args); },
    setTimeout: (fn, ms) => { const id = ++nextTimer; timeouts.set(id, { fn, ms }); return id; },
    clearTimeout: (id) => timeouts.delete(id),
    setInterval: (fn, ms) => { const id = ++nextTimer; intervals.set(id, { fn, ms }); return id; },
    clearInterval: (id) => intervals.delete(id),
    document: { visibilityState: 'visible', addEventListener, removeEventListener: (name) => listeners.delete(name) },
  }, '\nexport const testMemory = mem;');
  return {
    start(loc = 'en') { cleanup?.(); history.length = 0; mod.useTodayPicks(loc); },
    advance(ms) { now += ms; },
    seed(age, view, loc = 'en') { mod.testMemory.set(loc, { at: now - age, view }); },
    local(age, view, loc = 'en') { storage.set(`sg:tp:v1:${loc}`, JSON.stringify({ at: now - age, view })); },
    respond(fn) { response = fn; },
    success(view) { response = async () => ({ ok: true, json: async () => view }); },
    resume() { listeners.get('app:resume')(); },
    tick() { [...intervals.values()].forEach(({ fn }) => fn()); },
    retry() { [...timeouts.values()].filter(({ ms }) => ms === 20_000).forEach(({ fn }) => fn()); },
    get state() { return state; }, get history() { return history; }, get calls() { return calls; },
  };
}
const view = { items: [{ ticker: 'TEST', what: 'fixture', why: 'fixture' }], off: false };

(async () => {
  await test('N5 missing change preserves VIX level and displays —', () => {
    for (const change of [null, undefined]) {
      const card = vixCard(22, change);
      assert.equal(card.value, '22.0'); assert.equal(card.sub, '—'); assert.equal(card.subColor, '#94a3b8');
      assert.equal(card.active, true); assert.equal(card.label, 'VIX');
    }
  });
  await test('N5 measured zero and signed changes keep existing display', () => {
    for (const [change, expected] of [[0, '+0.0%'], [1.2, '+1.2%'], [-1.2, '-1.2%']]) assert.equal(vixCard(22, change).sub, expected);
    assert.equal(vixCard(null, null).value, '—'); assert.equal(vixCard(null, null).sub, '');
  });
  await test('N6 A → A,B → refreshed A selects 40% / 3x in every list', async () => {
    const h = watchlistHarness();
    await h.save('A', { A: dp(30) });
    await h.save('A,B', { A: dp(30), B: dp(25) });
    await h.save('A', { A: dp(40) });
    for (const key of ['A', 'A,B', 'A,B,C']) {
      assert.equal(h.get(key).darkPool.A.pct, 40); assert.equal(h.get(key).darkPool.A.volRatio, 3);
    }
    assert.equal(h.get('A,B').darkPool.B.pct, 25);
  });
  await test('N6 later-arriving old session cannot replace newer session, per ticker', async () => {
    const h = watchlistHarness();
    await h.save('A', { A: dp(40) });
    await h.save('A,B', { A: dp(30, '2026-10-15'), B: dp(25) });
    assert.equal(h.get('A,B').darkPool.A.pct, 40); assert.equal(h.get('A,B').darkPool.B.pct, 25);
  });
  await test('N6 gate: same-key old-session refresh preserves 10/16 40% / 3x', async () => {
    const h = watchlistHarness();
    await h.save('A', { A: dp(40, '2026-10-16') });
    await h.save('A,B', { A: dp(30, '2026-10-15'), B: dp(25) });
    await h.save('A', { A: dp(30, '2026-10-15') }, 16 * 60_000);
    for (const key of ['A', 'A,B', 'A,B,C']) {
      const a = h.get(key).darkPool.A;
      assert.equal(a.date, '2026-10-16'); assert.equal(a.pct, 40); assert.equal(a.volRatio, 3);
    }
    assert.equal(h.get('A,B').darkPool.B.pct, 25);
  });
  await test('N6 retained session survives eviction of the original list copy', async () => {
    const h = watchlistHarness();
    await h.save('A', { A: dp(40) });
    await h.save('A,B', { A: dp(30, '2026-10-15'), B: dp(25) });
    await h.save('A', { A: dp(30, '2026-10-15') });
    for (let i = 0; i < 11; i++) await h.save(`T${i}`, {});
    const a = h.get('A').darkPool.A;
    assert.equal(a.date, '2026-10-16'); assert.equal(a.pct, 40); assert.equal(a.volRatio, 3);
  });
  await test('N6 copied facts retain their save time across same-session refresh and absence', async () => {
    const h = watchlistHarness();
    await h.save('A', { A: dp(40) });
    await h.save('A,B', { A: dp(30, '2026-10-15'), B: dp(25) });
    await h.save('A', { A: dp(35) });
    assert.equal(h.get('A,B').darkPool.A.pct, 35);
    await h.save('A', {}, undefined, 'not-in-universe');
    assert.equal(h.get('A,B').darkPool.A, undefined);
    await h.save('A,B', { A: dp(30, '2026-10-15'), B: dp(26) });
    assert.equal(h.get('A').darkPool.A.pct, 30);
    assert.equal(h.get('A,B').darkPool.B.pct, 26);
  });
  await test('N6 session date takes priority over save time in the reverse order', async () => {
    const h = watchlistHarness();
    await h.save('A', { A: dp(30, '2026-10-15') });
    await h.save('A,B', { A: dp(40) });
    await h.save('A', { A: dp(30, '2026-10-15') });
    assert.equal(h.get('A').darkPool.A.pct, 40);
  });
  await test('N6 same session or absent dates use actual save time', async () => {
    for (const date of ['2026-10-16', null]) {
      const h = watchlistHarness();
      await h.save('A', { A: dp(30, date) }); await h.save('A,B', { A: dp(30, date) }); await h.save('A', { A: dp(40, date) });
      assert.equal(h.get('A,B').darkPool.A.pct, 40);
    }
  });
  await test('N6 successful absence clears only that ticker; failures preserve facts', async () => {
    const h = watchlistHarness();
    await h.save('A', { A: dp(40) }); await h.save('A,B', { A: dp(30), B: dp(25) });
    await h.save('A', {}, undefined, 'not-in-universe');
    assert.equal(h.get('A,B').darkPool.A, undefined); assert.equal(h.get('A,B').darkPool.B.pct, 25);
    await h.save('A', { A: dp(40) }); await h.save('A,B', {}, undefined, 'error');
    assert.equal(h.get('A,B').darkPool.A.pct, 40);
  });
  await test('N6 cache capacity retains recently refreshed list', async () => {
    const h = watchlistHarness();
    await h.save('A', { A: dp(30) });
    for (let i = 0; i < 11; i++) await h.save(`T${i}`, {});
    await h.save('A', { A: dp(40) }); await h.save('LAST', {});
    assert.equal(h.get('A').darkPool.A?.pct, 40);
  });
  await test('N8 72-hour memory never becomes ready after remount and failed fetch', async () => {
    const h = todayHarness(); h.seed(72 * hour, view); h.start();
    assert.equal(h.state.status, 'loading'); await flush();
    assert.equal(h.state.status, 'empty'); assert.ok(!h.history.includes('ready'));
  });
  await test('N8 memory and local storage share the exact 36-hour boundary', async () => {
    for (const source of ['seed', 'local']) for (const age of [36 * hour, 36 * hour + 1]) {
      const h = todayHarness(); h[source](age, view); h.start(); await flush();
      assert.equal(h.state.status, age === 36 * hour ? 'ready' : 'empty', `${source} age=${age}`);
    }
  });
  await test('N8 mounted card expires on resume or polling; retry cannot revive it', async () => {
    for (const trigger of ['resume', 'tick']) {
      const h = todayHarness(); h.seed(35 * hour, view); h.start(); await flush();
      assert.equal(h.state.status, 'ready'); h.advance(2 * hour); h[trigger]();
      assert.equal(h.state.status, 'loading'); await flush(); assert.equal(h.state.status, 'empty');
      h.retry(); await flush(); assert.equal(h.state.status, 'empty');
    }
  });
  await test('N8 failure rechecks age when a pending request crosses expiry', async () => {
    const h = todayHarness(); h.seed(36 * hour - 1, view);
    let reject; h.respond(() => new Promise((_resolve, fail) => { reject = fail; })); h.start();
    assert.equal(h.state.status, 'ready'); h.advance(2); reject(new Error('offline')); await flush();
    assert.equal(h.state.status, 'empty');
  });
  await test('N8 local fallback keeps original timestamp through later failures', async () => {
    const h = todayHarness(); h.seed(72 * hour, view); h.local(35 * hour, view); h.start(); await flush();
    assert.equal(h.state.status, 'ready'); h.advance(2 * hour); h.resume(); await flush(); assert.equal(h.state.status, 'empty');
  });
  await test('N8 fresh memory still avoids fetching within the 5-minute cache', async () => {
    const h = todayHarness(); h.seed(60_000, view); h.start(); await flush();
    assert.equal(h.state.status, 'ready'); assert.equal(h.calls, 0);
  });
  await test('N8 successful refresh replaces expired cache and off/empty retain existing state', async () => {
    for (const result of [view, { ...view, off: true }, { ...view, items: [] }]) {
      const h = todayHarness(); h.seed(72 * hour, view); h.success(result); h.start(); await flush();
      assert.equal(h.state.status, result.off || !result.items.length ? 'empty' : 'ready');
    }
  });
  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
