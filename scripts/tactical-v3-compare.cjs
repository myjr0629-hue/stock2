#!/usr/bin/env node
/** 읽기 전용 비교. 기본 실행은 네트워크/환경 파일/모델 호출 없음.
 * --redis: .env.local을 런타임에만 로드하고 GET만 실행 (API GET은 생성·쓰기 부작용 때문에 호출하지 않음).
 * --capture: Redis에 이미 있는 입력 또는 --snapshot 저장본에서 실제 세션 fixture를 저장.
 * --live: 실제 callBedrock 사다리, 세션별 3회 삼개국어 생성. IntelligenceNode는 저장하므로 호출하지 않음.
 */
require('./offline-test-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const current = require('../src/lib/ai/tacticalPrompt');
const { tacticalSessionAt, buildIndexFacts } = require('../src/lib/ai/tacticalIndexFacts');
const { guardianNumsFromAiContext, fillGuardianTokens, guardianTokenRules, guardianNumbersGate, guardianCmpFacts } = require('../src/lib/ai/guardianNumbers');
const { prevTradingDate, etDateOf } = require('../src/lib/marketCalendar');
const { filterMarketHeadlines } = require('../src/lib/ai/tacticalNews');
const { validateInsight, cleanInsight } = require('../src/lib/ai/outputGate');
const { forecastHits, checkComparisons, checkRanges } = require('../src/lib/ai/trustLayer');
const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests/fixtures/tactical-v3');
const LOCALES = ['ko', 'en', 'ja'];
const SESSIONS = ['PRE', 'REG', 'POST'];
const BASELINE = '3e0c44880';
const decode = value => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return null; } };
function baseline() {
  // 소스·모듈 경로만 읽는다. 임시 파일이나 운영 코드는 수정하지 않는다.
  const filename = path.join(ROOT, 'src/lib/ai/tacticalPrompt.ts');
  const source = execFileSync('git', ['show', `${BASELINE}:src/lib/ai/tacticalPrompt.ts`], { cwd: ROOT, encoding: 'utf8' });
  const ts = require('typescript');
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  return mod.exports;
}
// 저장할 입력은 시장 값의 허용 목록만. 계정/헤더/설정/환경을 fixture에 복사하지 않는다.
function contextFromSnapshot(raw) {
  const x = raw?.data || raw;
  const c = x?.context || x;
  const m = c.market || {};
  const g = c.gammaShield || {};
  const asOf = c.asOf || c.timestamp || c.coreAt;
  if (!asOf || !Number.isFinite(Date.parse(asOf))) throw new Error('입력 관측 시각 없음');
  const indexBasis = c.indexBasis || m.indexBasis;
  if (!indexBasis || indexBasis.v !== 1) throw new Error('실제 indexBasis 입력 없음');
  const session = tacticalSessionAt(Date.parse(asOf));
  const nums = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const ctx = { asOf, session, rlsiScore: nums(c.rlsiScore, c.rlsi?.score), nasdaqChange: indexBasis.cash?.nasdaq?.changePct ?? null,
    vix: nums(c.vix, m.vix), indexBasis: JSON.parse(JSON.stringify(indexBasis)),
    marketNewsHeadlines: filterMarketHeadlines((c.marketNewsHeadlines || c.news || []).filter(v => typeof v === 'string')),
    scheduledEvents: (c.scheduledEvents || []).filter(v => typeof v === 'string'),
    gexIndex: nums(c.gexIndex, g.gexIndex), gexLevel: c.gexLevel || g.gexLevel,
    triggerSupport: nums(c.triggerSupport, g.supportWall), triggerResistance: nums(c.triggerResistance, g.resistanceWall),
    us10y: nums(c.us10y, m.factors?.us10y?.level), dxy: nums(c.dxy, m.dxy) };
  if (!Number.isFinite(ctx.rlsiScore) || !Number.isFinite(ctx.vix)) throw new Error('시장 필수 입력 없음');
  ctx.indexFacts = buildIndexFacts(indexBasis, session, Date.parse(asOf));
  return ctx;
}
function fixtureFromSnapshot(raw, source) {
  const context = contextFromSnapshot(raw);
  return { contract: 'tactical-v3', provenance: 'operational-snapshot', source, capturedAt: new Date().toISOString(), context };
}
function renderStored(row, fallbackNums) {
  const value = decode(row);
  const data = value?.value || value;
  if (typeof data?.text !== 'string') return null;
  const filled = fillGuardianTokens(data.text, data.basis || fallbackNums || null);
  return filled.ok ? filled.text : data.text;
}
function compareStored(rows, ctx, old = baseline()) {
  return rows.map(row => {
    const text = renderStored(row.value, guardianNumsFromAiContext(ctx));
    if (!text) return { key: row.key, locale: row.locale, missing: true };
    const oldReasons = old.checkTacticalStored(text, old.buildTacticalPrompt(ctx, row.locale));
    const newReasons = current.checkTacticalStored(text, current.buildTacticalPrompt(ctx, row.locale));
    return { key: row.key, locale: row.locale, oldReasons, newReasons };
  });
}
async function readJson(url, headers, fetcher = fetch) {
  const res = await fetcher(url, { method: 'GET', headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('읽기 요청 실패');
  const body = await res.json();
  if (body.error || !Object.hasOwn(body, 'result')) throw new Error('읽기 응답 확인 실패');
  return decode(body.result);
}
function readers(env = process.env, fetcher = fetch) {
  const restUrl = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const restToken = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const proxyUrl = env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
  const proxyKey = env.EC2_REDIS_PROXY_KEY || env.REDIS_PROXY_KEY;
  return {
    insight: async key => {
      if (!restUrl || !restToken) throw new Error('Redis 읽기 설정 없음');
      return readJson(`${restUrl.replace(/\/$/, '')}/get/${encodeURIComponent(key)}`, { Authorization: `Bearer ${restToken}` }, fetcher);
    },
    archive: async key => {
      if (!proxyUrl || !proxyKey) throw new Error('세션 보관 읽기 설정 없음');
      return readJson(`${proxyUrl.replace(/\/$/, '')}/get?key=${encodeURIComponent(key)}`, { Authorization: `Bearer ${proxyKey}` }, fetcher);
    },
  };
}
async function collectStored(read, nowMs = Date.now()) {
  const rows = [];
  for (const locale of LOCALES) {
    for (const version of ['v2', 'v3']) {
      const key = `guardian:gemini:${version}:reality:${locale}`;
      rows.push({ key, locale, value: await read.insight(key) });
    }
    let date = etDateOf(nowMs);
    for (let i = 0; i < 20; i++, date = prevTradingDate(date)) {
      const key = `session:insight:REALITY_${locale.toUpperCase()}:${date}`;
      rows.push({ key, locale, value: await read.archive(key) });
    }
  }
  return rows;
}
async function quiet(fn) {
  // 공급사 오류 본문/환경을 로그에 남기지 않는다. 보고서는 이유 코드·검사를 통과한 글만 보관한다.
  const held = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = () => {};
  try { return await fn(); } finally { [console.log, console.warn, console.error] = held; }
}
async function liveCompare(fixtures) {
  const { callBedrock, MODELS } = require('../src/services/bedrockClient');
  const { triLangGate } = require('../src/lib/ai/ladderGates');
  const results = [];
  for (const session of SESSIONS) {
    const fixture = fixtures.find(f => f.context.session === session && f.provenance === 'operational-snapshot');
    if (!fixture) continue;
    for (let repeat = 1; repeat <= 3; repeat++) {
      const ctx = fixture.context;
      const { NDX_CHG, SPX_CHG, ...nums } = guardianNumsFromAiContext(ctx);
      try {
        const result = await quiet(() => callBedrock({ modelId: MODELS.HAIKU_35,
          system: 'Return only one JSON object with string keys ko, en, ja. Follow each language block. All three languages must carry the same facts.',
          userPrompt: LOCALES.map(l => `=== ${l} ===\n${current.buildTacticalPrompt(ctx, l)}${guardianTokenRules(l, nums)}`).join('\n\n'),
          maxTokens: 3500, temperature: 0.2, timeoutMs: 32000, fallbackModel: null, jsonPrefill: false,
          label: 'Guardian/REALITY_TRI', expectJson: true, locale: 'multi', validate: triLangGate() }));
        const raw = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
        for (const locale of LOCALES) {
          const template = typeof raw[locale] === 'string' ? cleanInsight(raw[locale]) : '';
          const filled = guardianNumbersGate(template, nums);
          const text = filled.text;
          const reasons = [...filled.reasons, ...validateInsight(text, locale).reasons,
            ...forecastHits(text, locale).map(x => `forecast:${x.id}`),
            ...checkComparisons(text, guardianCmpFacts(nums)), ...checkRanges(text, guardianCmpFacts(nums)),
            ...current.checkTacticalOutput(text, locale, current.buildTacticalPrompt(ctx, locale))];
          results.push({ session, repeat, locale, reasons, text, model: result.model });
        }
      } catch { for (const locale of LOCALES) results.push({ session, repeat, locale, reasons: ['model:failed'], text: '' }); }
    }
  }
  return results;
}
const md = text => String(text || '').replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
function markdown(stored, live, fixtures) {
  const evaluated = stored.filter(r => !r.missing);
  const out = ['# Tactical v3 비교', '', `기준 코드: ${BASELINE}. 운영 쓰기 0. 모델은 --live일 때만 호출.`, '',
    `저장본 ${evaluated.length}개: 이전 탈락 ${evaluated.filter(r => r.oldReasons.length).length}개 / 새 탈락 ${evaluated.filter(r => r.newReasons.length).length}개.`,
    `운영 입력 세션: ${fixtures.map(f => f.context.session).join(', ') || '없음'}. 미수집 세션은 생성하지 않음.`, '',
    '| 키 | 이전 재검사 | 새 재검사 |', '|---|---|---|'];
  for (const r of evaluated) out.push(`| ${md(r.key)} | ${md(r.oldReasons.join(',') || '통과')} | ${md(r.newReasons.join(',') || '통과')} |`);
  out.push('', `실모델: ${live.length ? `${live.filter(r => !r.reasons.length).length}/${live.length} 통과` : '미실행'}`, '', '| 세션·반복 | 언어 | 검사 | 문장 |', '|---|---|---|---|');
  for (const r of live) out.push(`| ${r.session} ${r.repeat} | ${r.locale} | ${md(r.reasons.join(',') || '통과')} | ${md(r.text)} |`);
  out.push('', '운영 관측을 얻기 전에는 synthetic 자료를 운영 fixture로 사용하지 않는다. 실제 PRE·REG·POST 저장 입력을 --snapshot으로 제공하거나 해당 세션에서 --redis --capture를 실행한다.', '');
  return out.join('\n');
}
async function main(args) {
  const flag = name => args.includes(name);
  const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  const snapshotFiles = args.flatMap((a, i) => a === '--snapshot' && args[i + 1] ? [args[i + 1]] : []);
  if (flag('--redis') || flag('--live')) require('dotenv').config({ path: path.join(ROOT, '.env.local'), quiet: true });
  fs.mkdirSync(FIXTURES, { recursive: true });
  const fixtures = fs.readdirSync(FIXTURES).filter(f => /^(PRE|REG|POST)\.json$/.test(f)).map(f => JSON.parse(fs.readFileSync(path.join(FIXTURES, f), 'utf8'))).filter(f => f.provenance === 'operational-snapshot');
  const snapshots = snapshotFiles.map(file => fixtureFromSnapshot(JSON.parse(fs.readFileSync(file, 'utf8')), 'saved-input'));
  let stored = [];
  if (flag('--redis')) {
    const read = readers();
    // 캐시 GET만. /api/debug/guardian은 생성·쓰기 부작용이 있어 접근하지 않는다.
    // API 응답에서 생략되는 news/scheduledEvents까지 가진 실제 공유 입력을 우선한다.
    const core = await read.archive('gcore:v1');
    const snapshot = await read.archive('guardian:snapshot:ko');
    const input = core?.market?.indexBasis ? core : snapshot;
    if (input) snapshots.push(fixtureFromSnapshot(input, core?.market?.indexBasis ? 'gcore:v1' : 'guardian:snapshot:ko'));
    stored = await collectStored(read);
  }
  for (const f of snapshots) {
    if (!SESSIONS.includes(f.context.session)) continue;
    const at = fixtures.findIndex(x => x.context.session === f.context.session);
    if (at >= 0) fixtures.splice(at, 1);
    fixtures.push(f);
    if (flag('--capture')) fs.writeFileSync(path.join(FIXTURES, `${f.context.session}.json`), JSON.stringify(f, null, 2) + '\n');
  }
  const ctx = snapshots[0]?.context || fixtures[0]?.context;
  if (stored.length && !ctx) throw new Error('저장본 재검사에 쓸 실제 시장 입력 필요');
  const compared = ctx ? compareStored(stored, ctx) : [];
  const missing = SESSIONS.filter(session => !fixtures.some(f => f.context.session === session));
  if (flag('--live') && missing.length) throw new Error('PRE·REG·POST 실제 입력 세션 수집 필요');
  const live = flag('--live') ? await liveCompare(fixtures) : [];
  const report = option('--out') || path.join(os.homedir(), 'Documents/signum-work/2026-10-23/tactical-v3/compare.md');
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, markdown(compared, live, fixtures));
  console.log(`비교 완료: 저장본 ${compared.filter(r => !r.missing).length}개, 모델 출력 ${live.length}개, 미수집 세션 ${missing.join(',') || '없음'}`);
  return { stored: compared, live, fixtures };
}
module.exports = { contextFromSnapshot, fixtureFromSnapshot, renderStored, compareStored, readers, collectStored, markdown, liveCompare, main };
if (require.main === module) main(process.argv.slice(2)).catch(() => { console.error('비교 중단: 입력·읽기 설정 또는 출력 경로를 확인하십시오. 비밀값과 공급사 오류 본문은 출력하지 않습니다.'); process.exitCode = 1; });
