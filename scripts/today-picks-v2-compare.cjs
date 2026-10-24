#!/usr/bin/env node
/* 기본: 오프라인 fixture 재검사. --snapshot FILE / --redis: 운영 저장본 GET만.
 * --live: 동일 입력으로 옛/새 각 3회, 응답마다 ko/en/ja. Claude 운영 세션에서만 실행.
 * 모델 API 외 운영 쓰기 0: 서비스/사다리/Redis 계측 경로를 호출하지 않는다. .env 읽기 없음. */
require('./offline-test-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const current = require('../src/lib/ai/todayPicksV2');
const storedGate = require('../src/lib/ai/todayPicksLine');
const { preMarketPrompt } = require('../src/lib/ai/preMarketContext');
const { financeTermsRule } = require('../src/lib/ai/commonTerms');
const ROOT = path.resolve(__dirname, '..');
const BASELINE = '0b6afec9ffbaeac3844b8ff7874bc20cc06bdc29';
const LOCALES = ['ko', 'en', 'ja'];
const DEFAULT_FIXTURE = path.join(ROOT, 'tests/fixtures/today-picks-v2/existing-model.json');
let old;
function baseline() {
  if (old) return old;
  const filename = path.join(ROOT, 'src/lib/ai/todayPicksLine.ts');
  const source = execFileSync('git', ['show', `${BASELINE}:src/lib/ai/todayPicksLine.ts`], { cwd: ROOT, encoding: 'utf8' });
  const ts = require('typescript');
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  return old = mod.exports;
}
const decode = x => typeof x === 'string' ? JSON.parse(x) : x;
function readFile(file) {
  if (!/\.json$/i.test(file) || /^\.env/i.test(path.basename(file)) || /^\.env/i.test(path.basename(fs.realpathSync(file)))) throw new Error('환경 파일은 입력할 수 없습니다');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
// 스냅샷의 계정·환경·헤더 등을 복사하지 않는다. 시장 사실만 명시적으로 뽑는다.
function pickFacts(f) {
  const keys = { whale: ['openedOn', 'notional', 'callPct', 'jump'], darkpool: ['date', 'pct', 'ratio', 'volume', 'marketAvg'],
    gamma: ['level', 'chainDate', 'expiry', 'spot', 'levelPrice', 'distPct', 'side'],
    earnings: ['date', 'hour', 'etTime', 'impliedPct', 'impliedExpiry', 'session'] }[f?.kind];
  if (!keys) throw new Error('알 수 없는 항목 사실');
  const out = { kind: f.kind };
  for (const key of keys) {
    const value = f[key];
    if (value !== null && !['number', 'string'].includes(typeof value)) throw new Error('시장 사실 형식 오류');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('시장 숫자 오류');
    if (typeof value === 'string') {
      const enumValues = { level: ['gammaFlip', 'maxPain'], side: ['a', 'b', 'at'], hour: ['bmo', 'amc', ''] }[key];
      const valid = enumValues ? enumValues.includes(value) : key === 'etTime' ? /^\d{2}:\d{2}$/.test(value) : /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (!valid) throw new Error('시장 문자열 형식 오류');
    }
    out[key] = value;
  }
  if (f.kind === 'whale') {
    out.best = {};
    for (const k of ['type', 'strike', 'expiry', 'added', 'oi', 'notional']) {
      const v = f.best?.[k];
      const valid = k === 'type' ? ['call', 'put'].includes(v) : k === 'expiry' ? typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) : typeof v === 'number' && Number.isFinite(v);
      if (!valid) throw new Error('옵션 계약 형식 오류');
      out.best[k] = v;
    }
  }
  return out;
}
function snapshotContext(c) {
  if (!c) return undefined;
  const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const iso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) ? v : null;
  const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const point = p => p && num(p.level) != null ? { level: p.level, changePct: num(p.changePct) } : null;
  if (!date(c.date) || !date(c.lastRegularDate) || !['PRE-MARKET', 'REGULAR SESSION', 'AFTER HOURS', 'CLOSED'].includes(c.session)) return undefined;
  return { date: c.date, lastRegularDate: c.lastRegularDate, session: c.session,
    quotes: (c.quotes || []).filter(q => /^[A-Z][A-Z0-9.-]{0,9}$/.test(q.ticker) && date(q.date) && ['PRE', 'REG', 'POST'].includes(q.basis))
      .map(q => ({ ticker: q.ticker, price: num(q.price), changePct: num(q.changePct), date: q.date, basis: q.basis })),
    futures: { live: c.futures?.live === true, asOf: iso(c.futures?.asOf), nq: point(c.futures?.nq), es: point(c.futures?.es),
      ...(c.futures?.nqAsOf ? { nqAsOf: iso(c.futures.nqAsOf) } : {}), ...(c.futures?.esAsOf ? { esAsOf: iso(c.futures.esAsOf) } : {}) },
    news: (c.news || []).filter(n => typeof n.headline === 'string' && iso(n.publishedAt)).map(n => ({ headline: n.headline, publishedAt: n.publishedAt })) };
}
function snapshotRows(raw) {
  const doc = decode(raw?.doc || raw?.result || raw);
  if (!doc || !/^\d{4}-\d{2}-\d{2}$/.test(doc.etDate) || !Array.isArray(doc.items)) throw new Error('TodayPicksDoc 저장본 필요');
  return doc.items.map((p, i) => {
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(p.ticker) || !LOCALES.every(l => typeof p.why?.[l] === 'string')) throw new Error('저장 항목 형식 오류');
    return { id: `snapshot-${i + 1}`, provenance: 'operational-snapshot', etDate: doc.etDate, ticker: p.ticker, facts: pickFacts(p.facts),
      why: Object.fromEntries(LOCALES.map(l => [l, p.why[l]])), whyAi: p.whyAi === true, context: snapshotContext(doc.context),
      session: ['PRE-MARKET', 'REGULAR SESSION', 'AFTER HOURS', 'CLOSED'].includes(doc.session) ? doc.session : undefined };
  });
}
async function readRedis(env = process.env, fetcher = fetch) {
  const base = env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081';
  const key = env.EC2_REDIS_PROXY_KEY || env.REDIS_PROXY_KEY;
  if (!key) throw new Error('Redis GET 인증 환경 없음');
  const res = await fetcher(`${base.replace(/\/$/, '')}/get?key=todaypicks%3Av1%3Alatest`, {
    method: 'GET', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('Redis GET 실패');
  const body = await res.json();
  if (body.error) throw new Error('Redis GET 응답 오류');
  return snapshotRows(body);
}
function perLocale(reasons, locale) { return reasons.filter(r => !/^(ko|en|ja):/.test(r) || r.startsWith(locale + ':')); }
function compareStored(records) {
  const previous = baseline();
  return records.flatMap(r => {
    const args = [JSON.stringify(r.why), r.ticker, r.facts, Number(r.etDate.slice(0, 4)), r.etDate];
    const a = previous.checkPickWhy(...args), b = storedGate.checkPickWhy(...args), hypothetical = current.checkPickV2Why(...args);
    return LOCALES.map(locale => ({ id: r.id, ticker: r.ticker, kind: r.facts.kind, locale, provenance: r.provenance,
      oldReasons: perLocale(a.reasons, locale), newReasons: perLocale(b.reasons, locale), generationOnlyReasons: perLocale(hypothetical.reasons, locale) }));
  });
}
async function callCreditModel(request, env = process.env, fetcher = fetch) {
  const key = env.ANTHROPIC_API_KEY_CREDITS;
  if (!key) throw new Error('크레딧 모델 인증 환경 없음');
  // bedrockClient.dateAnchor + financeTermsRule와 같은 공통 앞부분. 클라이언트/사다리는 불러오지 않는다.
  const now = new Date(), zone = { timeZone: 'America/New_York' };
  const long = new Intl.DateTimeFormat('en-US', { ...zone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(now);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { ...zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(x => [x.type, x.value]));
  const anchor = `<current_date>Today is ${long} (${p.year}-${p.month}-${p.day}, New York time). This is the real current date; your training data is older.
- If a source gives a date without a year (e.g. "Jan. 10"), write it without a year. Never attach a year the source does not state.
- Resolve words like "this year" or "next month" from today's date, not from your training data.</current_date>\n\n`;
  // 운영 TodayPicks의 크레딧 Haiku 5.5와 동일 모델. 자동 재시도·AWS 대체·운영 계측 쓰기 없음.
  const res = await fetcher('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15000), body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 400, temperature: 0.2,
      system: anchor + financeTermsRule() + request.system, messages: [{ role: 'user', content: request.userPrompt }] }) });
  if (!res.ok) throw new Error('모델 요청 실패');
  const body = await res.json();
  return { text: (body.content || []).filter(c => c.type === 'text').map(c => c.text).join(''), model: body.model, truncated: body.stop_reason === 'max_tokens' };
}
async function liveCompare(records, { callModel = callCreditModel } = {}) {
  const previous = baseline(), results = [];
  // 같은 사실의 문장 변형은 한 입력으로 센다. 종류·쪽이 다른 입력은 각각 3회.
  const unique = [...new Map(records.map(r => [r.ticker + JSON.stringify(r.facts), r])).values()];
  for (const r of unique) for (let repeat = 1; repeat <= 3; repeat++) for (const contract of repeat % 2 ? ['old', 'new'] : ['new', 'old']) {
    const context = r.context || (r.session ? { session: r.session } : undefined);
    const userPrompt = contract === 'old' ? previous.buildPickUserPrompt(r.ticker, r.facts, r.etDate) + (r.context ? preMarketPrompt({ ...r.context, quotes: r.context.quotes.filter(q => q.ticker === r.ticker) }) : '') : current.buildPickV2Prompt(r.ticker, r.facts, r.etDate, context);
    const checker = contract === 'old' ? previous.checkPickWhy : current.checkPickV2Why;
    let result, checked, parsed;
    try {
      result = await callModel({ system: contract === 'old' ? previous.TP_SYSTEM : current.TP_V2_SYSTEM, userPrompt });
      checked = result.truncated ? { ok: false, reasons: ['model:truncated'] } : checker(result.text, r.ticker, r.facts, Number(r.etDate.slice(0, 4)), r.etDate);
      const s = result.text.replace(/```(?:json)?/g, '').trim();
      parsed = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
    } catch { checked = { ok: false, reasons: ['model:failed-or-json'] }; parsed = {}; }
    for (const locale of LOCALES) results.push({ id: r.id, ticker: r.ticker, kind: r.facts.kind, provenance: r.provenance, repeat, contract, locale,
      reasons: perLocale(checked.reasons, locale), itemAccepted: checked.ok, text: typeof parsed?.[locale] === 'string' ? parsed[locale] : '', model: result?.model || '' });
  }
  return results;
}
const md = x => String(x).replace(/\|/g, '\\|').replace(/[\r\n]/g, ' ');
function markdown(stored, live) {
  const rate = rows => rows.length ? `${rows.filter(r => !r.reasons.length).length}/${rows.length}` : '미실행';
  const out = ['# 오늘 볼 것 v2 비교', '', `옛 계약 고정 SHA: ${BASELINE}. 환경 파일 읽기·운영 저장소 쓰기 없음.`,
    '저장본에는 기존 검사를 유지한다. 새 생성 전용 검사는 진단 열에만 표시하며 저장본 탈락에 합산하지 않는다.',
    `재검사 ${stored.length}개 언어 행: 옛 탈락 ${stored.filter(r => r.oldReasons.length).length}, 새 저장본 계약 탈락 ${stored.filter(r => r.newReasons.length).length}.`,
    `출처: ${[...new Set(stored.map(r => r.provenance))].join(', ') || '없음'} (existing-model-test-output은 기존 실모델 시험 출력이며 운영 저장본 수집이 아님).`, '',
    '| 항목 | 언어 | 옛 검사 | 새 저장본 검사 | 새 생성 검사(진단) |', '|---|---|---|---|---|'];
  for (const r of stored) out.push(`| ${r.ticker}/${r.kind} | ${r.locale} | ${md(r.oldReasons.join(',') || '통과')} | ${md(r.newReasons.join(',') || '통과')} | ${md(r.generationOnlyReasons.join(',') || '통과')} |`);
  out.push('', '실모델은 첫 응답만 비교한다. 운영 재시도 뒤 최종 통과율·대체율을 측정한 값은 아니다.', '', '| 언어 | 옛 통과 | 새 통과 |', '|---|---|---|');
  for (const l of LOCALES) out.push(`| ${l} | ${rate(live.filter(r => r.locale === l && r.contract === 'old'))} | ${rate(live.filter(r => r.locale === l && r.contract === 'new'))} |`);
  for (const kind of [...new Set(live.map(r => r.kind))]) for (const l of LOCALES) out.push(`| ${kind}/${l} | ${rate(live.filter(r => r.kind === kind && r.locale === l && r.contract === 'old'))} | ${rate(live.filter(r => r.kind === kind && r.locale === l && r.contract === 'new'))} |`);
  for (const contract of ['old', 'new']) {
    const items = live.filter(r => r.contract === contract && r.locale === 'ko');
    out.push(`\n${contract}: 세 언어 동시 통과 ${items.filter(r => r.itemAccepted).length}/${items.length}항목${items.length ? '' : ' (미실행)'}.`);
  }
  out.push('', '| 계약/반복/항목 | 언어 | 검사 | 문장 |', '|---|---|---|---|');
  for (const r of live) out.push(`| ${r.contract}/${r.repeat}/${r.ticker} | ${r.locale} | ${md(r.reasons.join(',') || '통과')} | ${md(r.text)} |`);
  return out.join('\n') + '\n';
}
async function main(args) {
  const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  let rows = args.includes('--redis') ? await readRedis() : option('--snapshot') ? snapshotRows(readFile(option('--snapshot'))) : readFile(DEFAULT_FIXTURE);
  if (args.includes('--live') && !process.env.ANTHROPIC_API_KEY_CREDITS) throw new Error('실모델 환경 없음: Claude 운영 세션에서 인증 환경을 주입하십시오');
  if (args.includes('--live') && !rows.every(r => r.provenance === 'operational-snapshot')) throw new Error('--live에는 --snapshot 또는 --redis 운영 입력이 필요합니다');
  const stored = compareStored(rows), live = args.includes('--live') ? await liveCompare(rows) : [];
  const report = markdown(stored, live);
  const capture = option('--capture');
  if (capture) {
    if (!/\.json$/i.test(capture) || /^\.env/i.test(path.basename(capture))) throw new Error('캡처는 JSON 파일만 허용합니다');
    fs.mkdirSync(path.dirname(path.resolve(capture)), { recursive: true });
    fs.writeFileSync(capture, JSON.stringify({ contract: current.TP_V2_VERSION, baselineRevision: BASELINE, inputs: rows, live }, null, 2) + '\n');
  }
  const output = option('--out');
  if (output) {
    if (/^\.env/i.test(path.basename(output))) throw new Error('환경 파일에는 기록할 수 없습니다');
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, report);
  } else process.stdout.write(report);
}
module.exports = { baseline, snapshotRows, compareStored, readRedis, callCreditModel, liveCompare, markdown, main };
if (require.main === module) main(process.argv.slice(2)).catch(() => { console.error('비교 실패: 입력·인증 환경·모델 응답을 확인하십시오. 비밀값과 오류 원문은 출력하지 않습니다.'); process.exitCode = 1; });
