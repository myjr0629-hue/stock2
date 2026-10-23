require('../scripts/offline-test-typescript.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const contract = require('../src/lib/ai/sectorBrief');
const { buildSectorFacts, SECTOR_TICKERS } = require('../src/lib/ai/sectorBriefFacts');
const compare = require('../scripts/sector-brief-v2-compare.cjs');
const { buildLegacyPrompt } = require('../scripts/sector-brief-legacy.cjs');
const root = path.resolve(__dirname, '..');
// Authored regression inputs/expected strings, explicitly not operational/model examples.
const fact = { id: 'm7', label: 'Magnificent 7', priceBasis: 'REG', priceDate: '2026-10-23',
  measured: 7, total: 7, up: 1, down: 5, flat: 1, avgChangePct: 0.14,
  leader: { t: 'NVDA', c: 6 }, laggard: { t: 'TSLA', c: -2 }, spreadPct: 8,
  members: [{ t: 'NVDA', c: 6 }, { t: 'AAPL', c: 0 }, { t: 'MSFT', c: -0.5 }, { t: 'GOOGL', c: -0.5 }, { t: 'AMZN', c: -1 }, { t: 'META', c: -1 }, { t: 'TSLA', c: -2 }],
  exLeaderAvgChangePct: -0.83 };
const good = { ko: '정규장 NVDA +6%, 나머지는 약세여서 동반 상승은 확인되지 않음',
  en: 'Cash: NVDA +6%; peers remain weak, with no broad rally observed',
  ja: '通常取引でNVDA +6%、他銘柄は弱く、セクター全体に広がる上昇は未確認' };
const reasons = (text, locale = 'ko', f = fact) => contract.checkSectorBriefNew(text, locale, f);
test('same mean, different participation has distinct grounded input; session mixtures still excluded', () => {
  const now = Date.parse('2026-10-23T14:00:00Z');
  const quotes = Object.fromEntries(fact.members.map(r => [r.t, { ticker: r.t, price: 100, changePct: r.c, date: fact.priceDate, basis: 'REG' }]));
  const rows = buildSectorFacts(quotes, quotes, 'regular', false, fact.priceDate, now);
  assert.equal(rows.length, 1); assert.equal(rows[0].exLeaderAvgChangePct, -0.83);
  const equal = Object.fromEntries(fact.members.map(r => [r.t, { ...quotes[r.t], changePct: 1 / 7 }]));
  const equalFacts = buildSectorFacts(equal, equal, 'regular', false, fact.priceDate, now);
  assert.equal(rows[0].avgChangePct, equalFacts[0].avgChangePct);
  assert.equal(equalFacts[0].up, 7); assert.equal(rows[0].up, 1);
  assert.ok(rows[0].members.every(m => m.c === fact.members.find(r => r.t === m.t).c));
  const mixed = { ...quotes, NVDA: { ...quotes.NVDA, basis: 'PRE', changePct: 8 } };
  assert.equal(buildSectorFacts(mixed, quotes, 'pre', true, fact.priceDate, now)[0].priceBasis, 'REG');
  const partial = Object.fromEntries(Object.entries(quotes).slice(0, 4));
  const f = buildSectorFacts(partial, partial, 'regular', false, fact.priceDate, now)[0];
  assert.equal(f.measured, 4); assert.equal(f.total, 7);
  assert.equal(buildSectorFacts(quotes, quotes, 'regular', false, fact.priceDate, now, {})[0].priorOptions.recordDate, null);
});
test('prompt retains existing lengths/tone and excludes options/futures/undated news from input', () => {
  const f = { ...fact, priorOptions: { recordDate: '2026-10-22', callOI: 999 } };
  const p = contract.buildSectorBriefPrompt([f], 'PRE-MARKET', '2026-10-26');
  assert.match(p.system, /40-70.*55-95/); assert.match(p.system, /관측\/확인/);
  assert.match(p.system, /Causal evidence: NONE/); assert.match(p.system, /two interpretations/);
  assert.match(p.system, /equal-weight mean/); assert.match(p.system, /percentage POINTS/);
  assert.doesNotMatch(p.userPrompt, /priorOptions|callOI|futures|news|999/);
  assert.match(p.userPrompt, /exLeaderAvgChangePct/); assert.match(p.userPrompt, /members/);
});
test('ordinary good text, dated REG fallback and optional two-way tests are not over-rejected in 3 languages', () => {
  for (const locale of contract.SECTOR_LOCALES) assert.deepEqual(reasons(good[locale], locale), []);
  for (const [locale, text] of Object.entries({
    ko: '10/23 정규장 NVDA +6%, 나머지 약세로 상승은 일부에 집중된 모습 확인',
    en: '10/23 cash: NVDA +6%; peers weak, concentrated strength observed',
    ja: '10/23通常取引、NVDA +6%、他銘柄は弱く一部への集中を確認',
  })) assert.deepEqual(reasons(text, locale), []);
  for (const [locale, text] of Object.entries({
    ko: 'NVDA 강세, 동료 종목이 오르면 확산이고 그렇지 않으면 집중으로 해석',
    en: 'If all members are up, participation broadens; otherwise leadership stays narrow',
    ja: '他銘柄が上がれば広がり、上がらなければ一部銘柄への集中と読む',
  })) assert.deepEqual(reasons(text, locale), []);
  assert.deepEqual(reasons('섹터 안 종목별 움직임 차이가 관측됩니다'), []);
  assert.deepEqual(reasons('정규장 NVDA를 제외한 평균 -0.83%, 선두만 강한 모습 확인'), []);
  assert.deepEqual(reasons('정규장 NVDA 상승, 기관 매집 여부는 가격만으로 확인되지 않음'), []);
  assert.deepEqual(reasons('정규장 NVDA 상승, 금리 영향은 확인되지 않음'), []);
  assert.deepEqual(reasons('Cash: NVDA +6%; institutional buying is unconfirmed', 'en'), []);
  assert.deepEqual(reasons('Cash: not all stocks are up; NVDA leads but peers remain weak', 'en'), []);
  assert.deepEqual(reasons('개장 전 확인한 10/23 정규장 NVDA +6%, 나머지는 약세로 관측'), []);
});
test('new-only unambiguous errors: stock sign, unsupported event/flow, internal source, latency and session', () => {
  const cases = [
    ['정규장 NVDA -6%, 나머지 약세와 동반 하락 관측', 'stock-number:NVDA'],
    ['정규장 NVDA 6% 하락, 나머지 약세와 동반 하락 관측', 'stock-number:NVDA'],
    ['Cash: NVDA down 6%; peers remain weak', 'stock-number:NVDA', 'en'],
    ['通常取引でNVDA 6%下落、他銘柄も弱い動きを確認', 'stock-number:NVDA', 'ja'],
    ['정규장 NVDA +9.75%, 나머지는 약세로 관측', 'number:'],
    ['실적 덕분에 정규장 NVDA 강세가 지속되는 모습 확인', 'unsupported-cause'],
    ['금리 영향으로 정규장 NVDA 강세가 집중되는 모습 확인', 'unsupported-cause'],
    ['정규장 기관 매집이 집중되어 주도주의 강세 확인', 'unsupported-flow'],
    ['NEWS PULSE에서 NVDA 강세와 종목별 차이 확인', 'internal-source'],
    ['지연 시세 기준 정규장 NVDA 상승과 나머지 약세 확인', 'latency-label'],
    ['Delayed cash prices: NVDA +6%; peers remain weak', 'latency-label', 'en'],
    ['遅延の通常取引でNVDAの上昇集中を確認', 'latency-label', 'ja'],
    ['개장 전 NVDA 강세, 나머지 종목은 약세로 관측', 'session-contradiction'],
    ['정규장 전 종목 상승, 섹터 전반의 동반 강세 확인', 'breadth-contradiction'],
    ['정규장 NVDA 강세와 선물 동반 상승이 관측됨', 'unsupported-futures'],
    ['Cash: NVDA will rally while peers are weak', 'forecast:', 'en'],
  ];
  for (const [text, expected, locale] of cases) assert.ok(reasons(text, locale).some(r => r.startsWith(expected)), `${expected}: ${text}`);
  // Same strings keep the serving contract; new generation restrictions never apply to cache restore.
  for (const [text] of cases) assert.deepEqual(contract.checkSectorBriefStored(text), []);
});
test('partial language rejection is isolated; missing/bad batch never becomes a new blank payload', () => {
  const parsed = { m7: { ...good, en: 'Cash: NVDA will rally; peers follow' } };
  const result = contract.selectSectorBriefOutput(parsed, [fact]);
  assert.equal(result.kept, 1); assert.equal(result.sectors.m7.headline, good.ko);
  assert.equal(result.sectors.m7.headlineJP, good.ja); assert.equal(result.sectors.m7.headlineEN, undefined);
  assert.equal(contract.sectorBriefBatchGate(JSON.stringify(parsed), [fact]), true);
  assert.equal(contract.sectorBriefBatchGate('{"m7":{"ko":""}}', [fact]), false);
  assert.equal(contract.selectSectorBriefOutput(null, [fact]).kept, 0);
  assert.equal(contract.sectorBriefBatchGate('invalid', [fact]), false);
});
test('baseline is frozen with original numbers and original old prompt wording', () => {
  const old = buildLegacyPrompt([fact], 'REGULAR SESSION', fact.priceDate, null);
  assert.match(old.system, /Interpret them — do not restate them/);
  assert.match(old.system, /40-70.*55-95/);
  const text = 'NVDA -6%, 나머지 약세와 동반 하락 관측';
  assert.deepEqual(contract.checkSectorBriefLegacy(text, 'ko', fact), []);
  assert.ok(reasons(text).includes('stock-number:NVDA'));
});
test('snapshot allowlist strips unrelated fields; stored rows without paired facts are never compared against new prices', () => {
  const raw = { asOf: '2026-10-23T14:00:00Z', date: fact.priceDate, session: 'REGULAR SESSION', facts: [{ ...fact, extra: 'omit' }],
    pack: { date: fact.priceDate, session: 'REGULAR SESSION', generatedAt: '2026-10-23T14:00:00Z',
      sectors: { m7: { headline: good.ko, headlineEN: good.en, headlineJP: good.ja, extra: 'omit' } }, extra: 'omit' }, extra: 'omit' };
  const f = compare.fixtureFromSnapshot(raw);
  assert.doesNotMatch(JSON.stringify(f), /extra|omit/);
  const stored = compare.compareStored(f.pack);
  assert.equal(stored.length, 3);
  assert.ok(stored.every(r => !r.oldReasons.length && !r.newReasons.length && r.generationNew === null));
  assert.match(compare.markdown(stored, []), /옛 서빙 탈락 0, 새 서빙 탈락 0/);
  assert.match(compare.markdown(stored, [{ id: 'm7', locale: 'ko', contract: 'new', finalAccepted: true, text: good.ko, reasons: [] }]), /ko \| 미확보/);
  assert.throws(() => compare.providerFor({}), /model:missing-process-env/);
});
test('read-only Redis adapter issues exactly one GET for the existing headline pack', async () => {
  let count = 0;
  const body = { date: fact.priceDate, sectors: { m7: { headline: good.ko } } };
  const result = await compare.readPack({ UPSTASH_REDIS_REST_URL: 'https://example.invalid', UPSTASH_REDIS_REST_TOKEN: 'fixture' }, async (url, opts) => {
    count++; assert.equal(opts.method, 'GET'); assert.match(url, /\/get\/intel%3Aai_headlines%3Av1$/);
    return Response.json({ result: JSON.stringify(body) });
  });
  assert.equal(count, 1); assert.deepEqual(result, body);
});
test('live comparison executes old/new exactly 3 times with 3 locales, same input; no discarded failures', async () => {
  const fixture = { provenance: 'operational-snapshot', date: fact.priceDate, session: 'REGULAR SESSION', asOf: '2026-10-23T14:00:00Z', facts: [fact] };
  const calls = [];
  const result = await compare.liveCompare([fixture], { callModel: async (request, meta) => {
    calls.push(meta); assert.equal(typeof request.system, 'string');
    if (meta.repeat === 2 && meta.contract === 'new') throw new Error('fixture failure');
    return { text: JSON.stringify({ m7: good }), model: 'fixture-model' };
  } });
  assert.equal(calls.length, 6); assert.equal(result.length, 18);
  for (const c of ['old', 'new']) for (const locale of contract.SECTOR_LOCALES) assert.equal(result.filter(r => r.contract === c && r.locale === locale).length, 3);
  assert.equal(new Set(calls.map(c => c.inputHash)).size, 1);
  assert.equal(result.filter(r => r.reasons.includes('model:failed-or-json')).length, 3);
  assert.equal(result.filter(r => r.finalAccepted).length, 15);
});
test('actual operational quote fixture replays original session and measured members without derived prices', () => {
  const files = fs.readdirSync(path.join(root, 'tests/fixtures/sector-brief-v2')).filter(f => /^operational-.*\.json$/.test(f));
  assert.ok(files.length);
  for (const file of files) {
    const f = compare.fixtureFromSnapshot(JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/sector-brief-v2', file), 'utf8')));
    assert.equal(f.provenance, 'operational-snapshot');
    assert.ok(f.facts.length); assert.ok(f.facts.every(x => x.members.length === x.measured));
    assert.equal(f.session, 'AFTER HOURS');
    assert.deepEqual(reasons('After-hours: NVDA -0.0%; measured names marginally lower', 'en', f.facts[0]), []);
  }
});
test('both actual stored consumers still display legacy text without the new generation gate', async () => {
  const file = 'src/app/api/intel/snapshot/route.ts';
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === 'overlayAiHeadline');
  assert.ok(fn);
  const now = Date.parse('2026-10-23T14:00:00Z');
  const oldNow = Date.now; Date.now = () => now;
  // Date constructor also uses wall clock in the original function; use today's date for the pack.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const legacy = 'NEWS PULSE 기존 저장 문장도 그대로 복구됨';
  let pack = { date: today, generatedAt: new Date(now).toISOString(), session: 'REGULAR SESSION', sectors: { m7: { headline: legacy } } };
  const js = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const overlay = new Function('getFromCache', `${js}; return overlayAiHeadline`)(async () => pack);
  const snapshot = { sector_summary: { briefing: { headline: '기존', headlineEN: 'Existing English', headlineJP: '既存の日本語' } } };
  try {
    const out = await overlay(snapshot, 'm7');
    assert.equal(out.sector_summary.briefing.headline, legacy);
    assert.equal(out.sector_summary.briefing.headlineEN, 'Existing English');
    pack = null;
    assert.equal(await overlay(snapshot, 'm7'), snapshot);
  } finally { Date.now = oldNow; }
  for (const p of [file, 'src/app/api/intel/money-map/route.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, p), 'utf8'), /checkSectorBriefNew|sectorBriefBatchGate/);
  }
});
