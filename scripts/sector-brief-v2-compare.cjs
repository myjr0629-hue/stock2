#!/usr/bin/env node
// Default: offline. --redis: GET only. --live: same Haiku 5.5 provider, old/new 3 calls each, all 3 locales.
// Provider functions only: do not import the cron, callBedrock wrapper, ledger or operational cache writers.
require('./offline-test-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const current = require('../src/lib/ai/sectorBrief');
const { buildSectorFacts, SECTOR_TICKERS } = require('../src/lib/ai/sectorBriefFacts');
const { sessionQuote, generationSession } = require('../src/lib/ai/preMarketContext');
const { etClock } = require('../src/lib/marketSession');
const { buildLegacyPrompt } = require('./sector-brief-legacy.cjs');
const BASELINE = '0b6afec9ffbaeac3844b8ff7874bc20cc06bdc29';
const LOCALES = ['ko', 'en', 'ja'];
const FIELDS = { ko: 'headline', en: 'headlineEN', ja: 'headlineJP' };
const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests/fixtures/sector-brief-v2');
const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
const pick = (x, keys) => Object.fromEntries(keys.filter(k => x?.[k] !== undefined).map(k => [k, x[k]]));
function sanitizeFact(f) {
  const out = pick(f, ['id', 'label', 'priceBasis', 'priceDate', 'measured', 'total', 'up', 'down', 'flat', 'avgChangePct', 'spreadPct', 'exLeaderAvgChangePct']);
  out.leader = pick(f.leader, ['t', 'c']); out.laggard = pick(f.laggard, ['t', 'c']);
  if (Array.isArray(f.members)) out.members = f.members.map(m => pick(m, ['t', 'c']));
  if (f.priorOptions) out.priorOptions = pick(f.priorOptions, ['recordDate', 'openedOn', 'lastRegularDate', 'measured', 'callOI', 'putOI']);
  return out;
}
function sanitizePack(raw) {
  const x = decode(raw)?.pack || decode(raw);
  if (!x?.sectors || typeof x.sectors !== 'object') return null;
  const sectors = {};
  for (const id of Object.keys(SECTOR_TICKERS)) {
    if (x.sectors[id]) sectors[id] = pick(x.sectors[id], Object.values(FIELDS));
  }
  return { ...pick(x, ['date', 'session', 'generatedAt', 'promptVersion']), sectors,
    ...(Array.isArray(x.facts) ? { facts: x.facts.map(sanitizeFact) } : {}) };
}
function fixtureFromSnapshot(raw) {
  const x = decode(raw);
  const pack = sanitizePack(x);
  let facts = (x.facts || pack?.facts || []).map(sanitizeFact);
  let asOf = x.asOf || pack?.generatedAt;
  let session = x.session || pack?.session;
  let date = x.date || pack?.date;
  // Saved quote response is actual input, never a manufactured session. Require its own timestamp.
  if (!facts.length && x.data && typeof x.timestamp === 'number') {
    const now = x.timestamp, clock = etClock(now), quotes = {}, regular = {};
    asOf = new Date(now).toISOString(); date = clock.date;
    session = ({ pre: 'PRE-MARKET', regular: 'REGULAR SESSION', reg: 'REGULAR SESSION', post: 'AFTER HOURS', closed: 'CLOSED' })[x.session] || generationSession(now);
    for (const t of new Set(Object.values(SECTOR_TICKERS).flat())) {
      if (!x.data[t]) continue;
      quotes[t] = sessionQuote(t, x.data[t], x.session, now);
      regular[t] = sessionQuote(t, x.data[t], 'closed', now);
    }
    facts = buildSectorFacts(quotes, regular, x.session, clock.minutes < 570, date, now);
  }
  if (!Number.isFinite(Date.parse(asOf)) || !date || !session) throw new Error('input:missing-date-session');
  // Keep only the existing context allowlist for the frozen old prompt. New prompt deliberately excludes it.
  const c = x.context;
  const context = c ? { ...pick(c, ['date', 'session', 'lastRegularDate']),
    quotes: (c.quotes || []).map(q => pick(q, ['ticker', 'price', 'changePct', 'date', 'basis'])),
    futures: pick(c.futures, ['nq', 'es', 'live', 'asOf']),
    news: (c.news || []).map(n => pick(n, ['headline', 'publishedAt'])) } : null;
  return { contract: 'sector-brief-v2', provenance: 'operational-snapshot', source: 'saved-public-input',
    asOf, date, session, facts, ...(context ? { context } : {}), ...(pack ? { pack } : {}) };
}
function inputHash(fixture) {
  return crypto.createHash('sha256').update(JSON.stringify({ date: fixture.date, session: fixture.session, facts: fixture.facts, context: fixture.context || null })).digest('hex');
}
function compareStored(pack, fixtureHash) {
  if (!pack) return [];
  const rows = [];
  for (const [id, value] of Object.entries(pack.sectors)) for (const locale of LOCALES) {
    const text = value[FIELDS[locale]];
    if (typeof text !== 'string' || !text.trim()) continue;
    const fact = pack.facts?.find(f => f.id === id);
    rows.push({ id, locale, text, date: pack.date, inputHash: fixtureHash, oldReasons: current.checkSectorBriefStored(text), newReasons: current.checkSectorBriefStored(text),
      // Diagnostic only: NEVER used by the serving paths, with missing facts explicitly marked.
      generationOld: fact ? current.checkSectorBriefLegacy(text, locale, fact) : null,
      generationNew: fact ? current.checkSectorBriefNew(text, locale, fact) : null });
  }
  return rows;
}
async function readPack(env = process.env, fetcher = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const proxy = env.EC2_REDIS_PROXY_URL;
  const key = env.EC2_REDIS_PROXY_KEY || env.REDIS_PROXY_KEY;
  if (!(url && token) && !(proxy && key)) throw new Error('redis:missing-process-env');
  const endpoint = url && token ? `${url.replace(/\/$/, '')}/get/${encodeURIComponent('intel:ai_headlines:v1')}`
    : `${proxy.replace(/\/$/, '')}/get?key=${encodeURIComponent('intel:ai_headlines:v1')}`;
  const response = await fetcher(endpoint, { method: 'GET', headers: { Authorization: `Bearer ${url && token ? token : key}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('redis:read-failed');
  const body = await response.json();
  if (body.error || !Object.hasOwn(body, 'result')) throw new Error('redis:bad-response');
  return decode(body.result);
}
function providerFor(env = process.env, choice) {
  const provider = choice || (env.ANTHROPIC_API_KEY_CREDITS ? 'anthropic' : 'bedrock-invoke');
  if (!['anthropic', 'bedrock-invoke', 'bedrock-mantle'].includes(provider)) throw new Error('model:unknown-provider');
  if (provider === 'anthropic' ? !env.ANTHROPIC_API_KEY_CREDITS : !(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY)) throw new Error('model:missing-process-env');
  return provider;
}
async function callProvider(request, provider) {
  // Calling these provider functions skips operational ledger/capture/cache mutations and retries.
  const { defaultCallAnthropic, defaultCallBedrock55, A55_MODEL } = require('../src/lib/ai/llmLadder');
  const { shapeH55Body } = require('../src/lib/ai/llmRequest');
  const { financeTermsRule } = require('../src/lib/ai/commonTerms');
  const body = shapeH55Body(A55_MODEL, { ...request, system: financeTermsRule() + request.system,
    maxTokens: 4000, effort: 'low', thinking: 'disabled', jsonPrefill: true });
  const call = { body, timeoutMs: 32000 };
  const result = provider === 'anthropic' ? await defaultCallAnthropic(call, process.env.ANTHROPIC_API_KEY_CREDITS)
    : await defaultCallBedrock55(provider === 'bedrock-invoke' ? 'invoke' : 'mantle', call);
  return { text: result.parsed.text, model: result.modelUsed, stopReason: result.parsed.stopReason };
}
async function quiet(fn) {
  const held = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = () => {};
  try { return await fn(); } finally { [console.log, console.warn, console.error] = held; }
}
async function liveCompare(fixtures, options = {}) {
  const call = options.callModel || ((request) => callProvider(request, options.provider));
  const results = [];
  for (const fixture of fixtures.filter(f => f.provenance === 'operational-snapshot' && f.facts.length)) {
    // Same measured input; old contract sees exactly its original fields.
    const oldFacts = fixture.facts.map(({ members, exLeaderAvgChangePct, ...f }) => f);
    const requests = { old: buildLegacyPrompt(oldFacts, fixture.session, fixture.date, fixture.context),
      new: current.buildSectorBriefPrompt(fixture.facts, fixture.session, fixture.date) };
    for (let repeat = 1; repeat <= 3; repeat++) for (const contract of repeat % 2 ? ['old', 'new'] : ['new', 'old']) {
      const meta = { session: fixture.session, asOf: fixture.asOf, inputHash: inputHash(fixture), repeat, contract, provider: options.provider || 'mock' };
      let parsed = null, failed = null, model = '';
      try {
        const result = await quiet(() => call(requests[contract], meta));
        model = result.model;
        if (['refusal', 'max_tokens'].includes(result.stopReason)) failed = `model:${result.stopReason}`;
        else parsed = current.parseSectorBrief(result.text);
      } catch { failed = 'model:failed-or-json'; }
      const check = contract === 'old' ? current.checkSectorBriefLegacy : current.checkSectorBriefNew;
      const gateGood = parsed ? fixture.facts.filter(f => check(String(parsed?.[f.id]?.ko || ''), 'ko', f).length === 0).length : 0;
      const batchAccepted = !failed && gateGood >= Math.ceil(fixture.facts.length * 0.8);
      for (const f of fixture.facts) {
        const koAccepted = !failed && check(String(parsed?.[f.id]?.ko || ''), 'ko', f).length === 0;
        for (const locale of LOCALES) {
          const text = typeof parsed?.[f.id]?.[locale] === 'string' ? parsed[f.id][locale].trim() : '';
          const reasons = failed ? [failed] : check(text, locale, f);
          results.push({ ...meta, id: f.id, locale, text, reasons, model, batchAccepted,
            finalAccepted: batchAccepted && koAccepted && !reasons.length,
            withinTarget: text.length >= (locale === 'en' ? 55 : 40) && text.length <= (locale === 'en' ? 95 : 70) });
        }
      }
    }
  }
  return results;
}
const md = t => String(t || '').replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
function markdown(stored, live) {
  const rate = rows => rows.length ? `${rows.filter(r => r.finalAccepted).length}/${rows.length}` : '미측정';
  const out = ['# 섹터 브리프 v2 비교', '', `옛 프롬프트: ${BASELINE}. 운영 쓰기 0. 실모델은 같은 Haiku 5.5 공급사에 옛/새 각 3회(매회 ko/en/ja), 재시도 없음.`,
    '첫 응답을 검사한 성적이며 운영 사다리 전체 성공률을 뜻하지 않는다.', '',
    `운영 저장본 ${stored.length}칸: 옛 서빙 탈락 ${stored.filter(r => r.oldReasons.length).length}, 새 서빙 탈락 ${stored.filter(r => r.newReasons.length).length}.`,
    `생성 검사 진단: 입력 짝 있음 ${stored.filter(r => r.generationOld).length}, 없음 ${stored.filter(r => !r.generationOld).length}. 입력 없는 저장본의 숫자를 현재 시세로 재검사하지 않는다.`, '',
    `입력 짝이 있는 저장본의 생성 검사 탈락: 옛 ${stored.filter(r => r.generationOld?.length).length}, 새 ${stored.filter(r => r.generationNew?.length).length}(서빙 미적용).`, '',
    '| 언어 | 옛 최종 채택 | 새 최종 채택 |', '|---|---|---|'];
  for (const locale of LOCALES) out.push(`| ${locale} | ${rate(live.filter(r => r.locale === locale && r.contract === 'old'))} | ${rate(live.filter(r => r.locale === locale && r.contract === 'new'))} |`);
  out.push('', '| 언어 | 실제 운영 저장 문장 → 새 실모델 문장(동일 섹터) |', '|---|---|');
  for (const locale of LOCALES) {
    const before = stored.find(r => r.inputHash && r.locale === locale && live.some(n => n.locale === locale && n.id === r.id && n.inputHash === r.inputHash && n.contract === 'new' && n.finalAccepted));
    const after = before && live.find(n => n.locale === locale && n.id === before.id && n.inputHash === before.inputHash && n.contract === 'new' && n.finalAccepted);
    out.push(`| ${locale} | ${before && after ? `${md(before.text)} → ${md(after.text)}` : '미확보 — 운영 저장본과 새 실모델 결과가 모두 필요'} |`);
  }
  out.push('', '| 저장본 | 옛/새 서빙 | 옛 생성 진단 | 새 생성 진단(서빙 미적용) | 문장 |', '|---|---|---|---|---|');
  for (const r of stored) out.push(`| ${r.id}/${r.locale} | ${r.oldReasons.join(',') || '통과'}/${r.newReasons.join(',') || '통과'} | ${r.generationOld?.join(',') || (r.generationOld ? '통과' : '입력 없음')} | ${r.generationNew?.join(',') || (r.generationNew ? '통과' : '입력 없음')} | ${md(r.text)} |`);
  out.push('', '| 계약/반복/세션/섹터 | 언어 | 검사 | 최종 채택 | 길이 목표 | 문장 |', '|---|---|---|---|---|---|');
  for (const r of live) out.push(`| ${r.contract}/${r.repeat}/${r.session}/${r.id} | ${r.locale} | ${r.reasons.join(',') || '통과'} | ${r.finalAccepted ? '채택' : '탈락'} | ${r.withinTarget ? '충족' : '초과/미달'} | ${md(r.text)} |`);
  return out.join('\n') + '\n';
}
function readInput(file) {
  if (path.basename(file).startsWith('.env')) throw new Error('input:env-file-forbidden');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
async function main(args) {
  const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  const snapshots = args.flatMap((arg, i) => arg === '--snapshot' ? [fixtureFromSnapshot(readInput(args[i + 1]))] : []);
  const fixtures = snapshots.length ? snapshots : fs.readdirSync(FIXTURES).filter(f => /^operational-.*\.json$/.test(f)).map(f => fixtureFromSnapshot(readInput(path.join(FIXTURES, f))));
  if (args.includes('--redis')) {
    const pack = await readPack();
    if (pack) fixtures.push(fixtureFromSnapshot(pack));
  }
  if (args.includes('--capture')) {
    if (!snapshots.length && !args.includes('--redis')) throw new Error('capture:input-required');
    for (const f of fixtures) fs.writeFileSync(path.join(FIXTURES, `operational-${f.date}-${inputHash(f).slice(0, 8)}.json`), JSON.stringify(f, null, 2) + '\n');
  }
  const stored = fixtures.flatMap(f => compareStored(f.pack,
    f.pack?.facts && JSON.stringify(f.pack.facts) === JSON.stringify(f.facts) ? inputHash(f) : undefined));
  const provider = args.includes('--live') ? providerFor(process.env, option('--provider')) : null;
  if (args.includes('--live') && !fixtures.some(f => f.facts.length)) throw new Error('live:paired-input-required');
  const live = args.includes('--live') ? await liveCompare(fixtures, { provider }) : [];
  const report = markdown(stored, live);
  const output = option('--out');
  if (output) {
    if (path.basename(output).startsWith('.env')) throw new Error('output:env-file-forbidden');
    fs.writeFileSync(output, report);
    fs.writeFileSync(output + '.json', JSON.stringify({ baseline: BASELINE, stored, live }, null, 2) + '\n');
  } else process.stdout.write(report);
}
module.exports = { fixtureFromSnapshot, sanitizePack, compareStored, readPack, providerFor, liveCompare, markdown, inputHash, main };
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  // Never echo provider errors, URLs, headers, credentials or the process environment.
  const safe = /^(?:input|redis|model|capture|live|output):[a-z-]+$/.test(error.message) ? error.message : 'compare:failed';
  console.error(safe); process.exitCode = 1;
});
