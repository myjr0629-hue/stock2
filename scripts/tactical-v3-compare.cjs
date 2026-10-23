#!/usr/bin/env node
/** 읽기 전용 비교. 기본 실행은 네트워크/환경 파일/모델 호출 없음.
 * --redis: 프로세스 환경의 인증으로 GET만 실행 (API GET은 생성·쓰기 부작용 때문에 호출하지 않음).
 * --capture: Redis에 이미 있는 입력 또는 --snapshot 저장본에서 실제 세션 fixture를 저장.
 * --live: 실제 callBedrock 사다리, 세션별 3회 삼개국어 생성.
 * --baseline-live: origin/main 프롬프트·검사도 같은 입력으로 각 3회. --derive-sessions: PRE에서 시각만 바꾼 REG·POST를 파생으로 명시. IntelligenceNode는 저장하므로 호출하지 않음.
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
const { validateInsight, cleanInsight } = require('../src/lib/ai/outputGate');
const { forecastHits, checkComparisons, checkRanges } = require('../src/lib/ai/trustLayer');
const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests/fixtures/tactical-v3');
const LOCALES = ['ko', 'en', 'ja'];
const SESSIONS = ['PRE', 'REG', 'POST'];
const BASELINE = 'origin/main';
const { evidenceTime } = require('../src/lib/ai/evidenceTime');
const decode = value => { if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return null; } };
let baselineCache;
function baseline() {
  if (baselineCache) return baselineCache;
  // origin/main의 프롬프트·검사·자리표를 고정 SHA로 읽는다. 운영 쓰기 없음.
  const revision = execFileSync('git', ['rev-parse', BASELINE], { cwd: ROOT, encoding: 'utf8' }).trim();
  const load = relative => {
    const filename = path.join(ROOT, relative);
    const source = execFileSync('git', ['show', `${revision}:${relative}`], { cwd: ROOT, encoding: 'utf8' });
    const ts = require('typescript');
    const mod = new Module(filename, module);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
    return mod.exports;
  };
  return baselineCache = { ...load('src/lib/ai/tacticalPrompt.ts'), numbers: load('src/lib/ai/guardianNumbers.ts'), revision };
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
    // 두 계약에 같은 원문 입력을 전달한다. 시장 뉴스 필터는 각 계약의 프롬프트가 적용한다.
    marketNewsHeadlines: (c.marketNewsHeadlines || c.news || []).filter(v => typeof v === 'string'),
    scheduledEvents: (c.scheduledEvents || []).filter(v => typeof v === 'string'),
    gexIndex: nums(c.gexIndex, g.gexIndex), gexLevel: c.gexLevel || g.gexLevel,
    spxChangePct: indexBasis.cash?.spx?.changePct ?? null,
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
// 운영 가격을 유지하고 시각만 이동한다. 실제 REG·POST 관측으로 취급하지 않는다.
function deriveSessions(fixture) {
  if (fixture.provenance !== 'operational-snapshot' || fixture.context.session !== 'PRE') throw new Error('파생에는 실제 PRE 입력 필요');
  const date = fixture.context.indexBasis.cash?.nasdaq?.sessionDate || fixture.context.indexBasis.cash?.spx?.sessionDate;
  if (!date) throw new Error('파생 기준 정규장 날짜 없음');
  return ['REG', 'POST'].map(session => {
    const context = JSON.parse(JSON.stringify(fixture.context));
    const at = evidenceTime('wall:et', `${date} ${session === 'REG' ? '15:30' : '17:30'}`);
    const quoteAt = evidenceTime('wall:et', `${date} ${session === 'REG' ? '15:29' : '17:29'}`);
    context.asOf = at.iso;
    context.session = session;
    for (const p of Object.values(context.indexBasis.cash)) {
      if (session === 'REG' && p.price != null) Object.assign(p, { asOf: quoteAt.iso, live: true, sessionDate: date });
    }
    for (const p of Object.values(context.indexBasis.futures)) {
      p.asOf = quoteAt.iso;
      // PRE 정산 대비 값을 장후 수익률로 바꾸지 않는다.
      p.cashCloseReferenceAt = null;
      p.sinceCashClosePct = null;
    }
    context.indexFacts = buildIndexFacts(context.indexBasis, session, at.ms);
    return { contract: 'tactical-v3', provenance: 'derived-session', source: `파생: ${fixture.source}; ${date} ${session === 'REG' ? '15:30' : '17:30'} ET, 운영 가격 유지·시각만 변경`, derivedFrom: fixture.context.asOf, context };
  });
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
    const raw = decode(row.value);
    const data = raw?.value || raw;
    const version = data?.basis?.contractVersion;
    const legacy = /guardian:gemini:v2:reality:|session:insight:REALITY_(?!V3_)/.test(row.key)
      || [2, '2', 'v2'].includes(version) || /\{\s*(?:NDX_CHG|SPX_CHG)\s*\}/.test(data?.text || '');
    const prompt = current.buildTacticalPrompt(ctx, row.locale);
    // 보관본 비교도 실제 복구 출구와 같은 계약. v2의 옛 선물 숫자를 현재 현물과 대조하지 않는다.
    const newReasons = current.checkTacticalStored(text, legacy ? prompt.replace(/^INDEX_FACTS: .*$/m, 'INDEX_FACTS: []') : prompt, true);
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
      // 로컬 .env 에 Upstash 가 없으면(10/4 교체 뒤 공개 저장소에서 제거) EC2 프록시 읽기로 대신한다 — GET 만.
      if (!restUrl || !restToken) {
        if (!proxyUrl || !proxyKey) throw new Error('Redis 읽기 설정 없음');
        return readJson(`${proxyUrl.replace(/\/$/, '')}/get?key=${encodeURIComponent(key)}`, { Authorization: `Bearer ${proxyKey}` }, fetcher);
      }
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
      for (const scope of ['REALITY', 'REALITY_V3']) {
        const key = `session:insight:${scope}_${locale.toUpperCase()}:${date}`;
        rows.push({ key, locale, value: await read.archive(key) });
      }
    }
  }
  return rows;
}
async function quiet(fn) {
  // 공급사 오류 본문/환경을 로그에 남기지 않는다. 보고서는 생성 문장·이유 코드만 보관한다.
  const held = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = () => {};
  try { return await fn(); } finally { [console.log, console.warn, console.error] = held; }
}
function modelRequest(ctx, contract, old) {
  const implementation = contract === 'old' ? old : current;
  const numbers = contract === 'old' ? old.numbers : { guardianNumsFromAiContext, guardianTokenRules };
  let nums = numbers.guardianNumsFromAiContext(ctx);
  if (contract === 'new') { const { NDX_CHG, SPX_CHG, ...rest } = nums; nums = rest; }
  const prompts = Object.fromEntries(LOCALES.map(locale => [locale, implementation.buildTacticalPrompt(ctx, locale)]));
  const userPrompt = LOCALES.map(l => `=== ${l} ===\n${prompts[l]}${numbers.guardianTokenRules(l, nums, contract === 'new' ? 'tactical' : undefined)}`).join('\n\n');
  return { implementation, numbers: contract === 'old' ? old.numbers : { guardianNumbersGate, guardianCmpFacts }, nums, prompts, userPrompt };
}
async function liveCompare(fixtures, options = {}) {
  const old = options.baselineLive ? baseline() : null;
  const runtime = options.callModel ? null : require('../src/services/bedrockClient');
  const { triLangGate } = require('../src/lib/ai/ladderGates');
  const results = [];
  for (const session of SESSIONS) {
    const fixture = fixtures.find(f => f.context.session === session && ['operational-snapshot', 'derived-session'].includes(f.provenance));
    if (!fixture) continue;
    for (let repeat = 1; repeat <= 3; repeat++) {
      for (const contract of options.baselineLive ? ['old', 'new'] : ['new']) {
        const request = modelRequest(fixture.context, contract, old);
        const meta = { session, repeat, contract, provenance: fixture.provenance, baselineRevision: old?.revision };
        try {
          const result = await quiet(() => (options.callModel || runtime.callBedrock)({ modelId: runtime?.MODELS.HAIKU_35 || 'offline',
            system: 'Return only one JSON object with string keys ko, en, ja. Follow each language block. All three languages must carry the same facts.',
            userPrompt: request.userPrompt,
            maxTokens: 3500, temperature: 0.2, timeoutMs: 32000, fallbackModel: null, jsonPrefill: false,
            label: 'Guardian/REALITY_TRI', expectJson: true, locale: 'multi', validate: triLangGate() }));
          const raw = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
          for (const locale of LOCALES) {
            const template = typeof raw[locale] === 'string' ? cleanInsight(raw[locale]) : '';
            const filled = request.numbers.guardianNumbersGate(template, request.nums);
            const text = filled.text;
            const reasons = [...filled.reasons, ...validateInsight(text, locale).reasons,
              ...forecastHits(text, locale).map(x => `forecast:${x.id}`),
              ...checkComparisons(text, request.numbers.guardianCmpFacts(request.nums)), ...checkRanges(text, request.numbers.guardianCmpFacts(request.nums)),
              ...request.implementation.checkTacticalOutput(text, locale, request.prompts[locale])];
            results.push({ ...meta, locale, reasons, text, model: result.model });
          }
        } catch { for (const locale of LOCALES) results.push({ ...meta, locale, reasons: ['model:failed'], text: '' }); }
      }
    }
  }
  return results;
}
const md = text => String(text || '').replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
function markdown(stored, live, fixtures) {
  const evaluated = stored.filter(r => !r.missing);
  const out = ['# Tactical v3 비교', '', `기준 코드: ${BASELINE}${live.find(r => r.baselineRevision)?.baselineRevision ? ` (${live.find(r => r.baselineRevision).baselineRevision})` : ''}. Redis/DB 쓰기 0. 모델은 --live 또는 --baseline-live일 때만 호출.`, '',
    `저장본 ${evaluated.length}개: 이전 탈락 ${evaluated.filter(r => r.oldReasons.length).length}개 / 새 탈락 ${evaluated.filter(r => r.newReasons.length).length}개.`,
    `입력 세션: ${fixtures.map(f => `${f.context.session} (${f.provenance === 'derived-session' ? '파생, 실제 해당 세션 관측 아님' : '운영 실입력'})`).join(', ') || '없음'}. 파생은 --derive-sessions에서만 생성.`, '',
    '| 키 | 이전 재검사 | 새 재검사 |', '|---|---|---|'];
  for (const r of evaluated) out.push(`| ${md(r.key)} | ${md(r.oldReasons.join(',') || '통과')} | ${md(r.newReasons.join(',') || '통과')} |`);
  const rate = rows => rows.length ? `${rows.filter(r => !r.reasons.length).length}/${rows.length} (${(100 * rows.filter(r => !r.reasons.length).length / rows.length).toFixed(1)}%)` : '미실행';
  out.push('', '| 실모델 통과율 | 옛 계약(origin/main) | 새 계약 |', '|---|---|---|', `| 전체 | ${rate(live.filter(r => r.contract === 'old'))} | ${rate(live.filter(r => r.contract !== 'old'))} |`);
  for (const session of SESSIONS) out.push(`| ${session} | ${rate(live.filter(r => r.session === session && r.contract === 'old'))} | ${rate(live.filter(r => r.session === session && r.contract !== 'old'))} |`);
  for (const locale of LOCALES) out.push(`| ${locale} | ${rate(live.filter(r => r.locale === locale && r.contract === 'old'))} | ${rate(live.filter(r => r.locale === locale && r.contract !== 'old'))} |`);
  // 세션 합계·언어 합계만 좋고 특정 세션×언어가 악화되는 경우도 반영 보류한다.
  const cells = SESSIONS.flatMap(session => LOCALES.map(locale => ({ session, locale,
    old: live.filter(r => r.contract === 'old' && r.session === session && r.locale === locale),
    next: live.filter(r => r.contract !== 'old' && r.session === session && r.locale === locale) })));
  const passedRate = rows => rows.filter(r => !r.reasons.length).length / rows.length;
  for (const cell of cells) out.push(`| ${cell.session}/${cell.locale} | ${rate(cell.old)} | ${rate(cell.next)} |`);
  const measured = cells.every(c => c.old.length >= 3 && c.next.length >= 3);
  const newRows = live.filter(r => r.contract !== 'old');
  const accepted = measured && passedRate(newRows) >= 0.85 && cells.every(c => passedRate(c.next) >= passedRate(c.old));
  out.push('', `반영 조건(전체 85% 이상·각 세션/언어 옛 계약 이상): ${!measured ? '미측정 — 양쪽 계약 각각 27개 필요' : accepted ? '충족' : '보류'}.`);
  out.push('', '| 계약·세션·반복 | 입력 | 언어 | 검사 | 문장 |', '|---|---|---|---|---|');
  for (const r of live) out.push(`| ${r.contract || 'new'} ${r.session} ${r.repeat} | ${r.provenance === 'derived-session' ? '파생' : '운영 실입력'} | ${r.locale} | ${md(r.reasons.join(',') || '통과')} | ${md(r.text)} |`);
  out.push('', '파생 REG·POST는 세션별 실제 수집 검증을 대신하지 않는다. 환경 파일은 읽지 않는다. 운영 세션에서 인증 환경을 주입한 뒤 실행한다.', '');
  return out.join('\n');
}
async function main(args) {
  const flag = name => args.includes(name);
  const option = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  const snapshotFiles = args.flatMap((a, i) => a === '--snapshot' && args[i + 1] ? [args[i + 1]] : []);
  const runLive = flag('--live') || flag('--baseline-live');
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
  if (flag('--derive-sessions')) {
    const pre = snapshots.find(f => f.context.session === 'PRE') || fixtures.find(f => f.context.session === 'PRE');
    if (!pre) throw new Error('파생에는 PRE 입력 필요');
    for (const derived of deriveSessions(pre)) if (!fixtures.some(f => f.context.session === derived.context.session)) fixtures.push(derived);
  }
  const ctx = snapshots[0]?.context || fixtures[0]?.context;
  if (stored.length && !ctx) throw new Error('저장본 재검사에 쓸 실제 시장 입력 필요');
  const compared = ctx ? compareStored(stored, ctx) : [];
  const missing = SESSIONS.filter(session => !fixtures.some(f => f.context.session === session));
  if (runLive && missing.length) throw new Error('PRE·REG·POST 실제 입력 세션 수집 필요');
  const live = runLive ? await liveCompare(fixtures, { baselineLive: flag('--baseline-live') }) : [];
  const report = option('--out') || path.join(os.homedir(), 'Documents/signum-work/2026-10-23/tactical-v3/compare.md');
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, markdown(compared, live, fixtures));
  fs.writeFileSync(report.replace(/\.md$/, '') + '.json', JSON.stringify({ stored: compared, live, fixtures }, null, 2) + '\n');
  console.log(`비교 완료: 저장본 ${compared.filter(r => !r.missing).length}개, 모델 출력 ${live.length}개, 미수집 세션 ${missing.join(',') || '없음'}`);
  return { stored: compared, live, fixtures };
}
module.exports = { contextFromSnapshot, fixtureFromSnapshot, renderStored, compareStored, readers, collectStored, markdown, liveCompare, deriveSessions, modelRequest, baseline, main };
if (require.main === module) main(process.argv.slice(2)).catch(() => { console.error('비교 중단: 입력·읽기 설정 또는 출력 경로를 확인하십시오. 비밀값과 공급사 오류 본문은 출력하지 않습니다.'); process.exitCode = 1; });
