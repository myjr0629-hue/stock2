#!/usr/bin/env node
/** 순환매(rotation = verdict.description) 옛/새 계약 실모델 비교 — 읽기 전용(운영 Redis/DB 쓰기 0).
 * 입력: 운영 공유 코어(gcore:v1 모양 JSON — rotationIntensity·sectors·news·market.indexBasis) 파일. --input <파일> 을 세션마다 준다.
 *   (세션은 코어 timestamp 로 판정 — PRE·REG·POST 각각 1개 이상. 운영 실입력이 없으면 --derive-sessions 로 PRE 에서 시각만 바꾼 파생을 «파생»으로 표시)
 * 실행: 실제 callBedrock 사다리(운영과 같은 3개 언어 1호출·같은 system·같은 출구 검사) — 계약마다 세션별 --repeat(기본 3)회.
 *   옛 계약 = origin/main intelligenceNode 의 ROTATION_PROMPTS·gateText(원문을 그 SHA 에서 읽어 컴파일), 새 계약 = 작업 트리.
 * 숫자 충돌 = 글 속 지수 이름+퍼센트가 Tactical 과 같은 INDEX_FACTS(현물/선물·세션 기준)와 다른 것(rotationIndexReasons 의 값·방향·없는 지수).
 */
require('./offline-test-typescript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const LOCALES = ['ko', 'en', 'ja'];
const SESSIONS = ['PRE', 'REG', 'POST'];

const { buildIndexFacts, tacticalSessionAt } = require('../src/lib/ai/tacticalIndexFacts');
const { guardianNumsFromAiContext } = require('../src/lib/ai/guardianNumbers');
const { guardianCashChange } = require('../src/lib/marketIndexBasis');
const { sectorLabelForAi } = require('../src/lib/ai/sectorLabels');
const { SECTOR_MAP } = require('../src/services/universePolicy');
const { rotationFactsFrom, rotationIndexReasons, buildRotationPrompt } = require('../src/lib/ai/rotationPrompt');
const { evidenceTime } = require('../src/lib/ai/evidenceTime');

function oldModule(rev = 'origin/main') {
  const revision = execFileSync('git', ['rev-parse', rev], { cwd: ROOT, encoding: 'utf8' }).trim();
  const rel = 'src/services/guardian/intelligenceNode.ts';
  const source = execFileSync('git', ['show', `${revision}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 << 20 })
    + '\nexport const _rotationTestHooks = { gateText, tokenizeInsight, ROTATION_PROMPTS, TRI_SYSTEM, parseTriJson, restoreSectorLabels };\n';
  const ts = require('typescript');
  const filename = path.join(ROOT, 'src/services/guardian/__baseline_intelligenceNode.ts');
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  return { hooks: mod.exports._rotationTestHooks, revision };
}

function us10yChangeBp(f) {
  if (!f) return undefined;
  if (typeof f.chgAbs === 'number' && Number.isFinite(f.chgAbs) && Math.abs(f.chgAbs) < 1) return Math.round(f.chgAbs * 100);
  if (typeof f.level === 'number' && typeof f.chgPct === 'number' && Number.isFinite(f.level) && Number.isFinite(f.chgPct) && f.chgPct > -100) {
    const prev = f.level / (1 + f.chgPct / 100); const bp = Math.round((f.level - prev) * 100); return Math.abs(bp) < 100 ? bp : undefined;
  }
  return undefined;
}

/** unifiedDataStream 의 aiContext 와 같은 필드(운영 생성 재료) — 공유 코어 하나에서 */
function contextFromCore(core, locale) {
  const ri = core.rotationIntensity, macro = core.market || {}, rlsi = core.rlsi || {}, g = core.gammaShield || {}, flows = core.sectors || [], vectors = core.vectors || [];
  const ts = Date.parse(core.timestamp);
  const nq = guardianCashChange(macro, core.session);
  const fmt = items => items.map(s => `${sectorLabelForAi(s.sector)}(${s.flow > 0 ? '+' : ''}${s.flow.toFixed(1)}%)`).join(', ');
  let signalConflict;
  if (rlsi.score >= 55 && nq != null && nq > 0 && ri.direction === 'RISK_OFF' && ri.conviction === 'HIGH') signalConflict = `겉은 강세(RLSI ${rlsi.score.toFixed(0)}, NASDAQ +${nq.toFixed(2)}%), 속은 약세(${ri.direction} ${ri.conviction})`;
  else if (rlsi.score <= 35 && nq != null && nq < 0 && ri.direction === 'RISK_ON' && ri.conviction === 'HIGH') signalConflict = `지표 약세(RLSI ${rlsi.score.toFixed(0)}, NASDAQ ${nq.toFixed(2)}%), 성장주 유입(${ri.direction} ${ri.conviction})`;
  let div = {};
  try { const { deriveLocaleParts } = require('../src/services/guardian/guardianCore'); const p = deriveLocaleParts(core, locale); div = { divergenceCase: p.divCase.caseId, divergenceDesc: p.divCase.verdictDesc }; } catch { /* 재료 없음 */ }
  const reg = rlsi.session === 'REG';
  return {
    rlsiScore: rlsi.score, nasdaqChange: macro.nqChangePercent || 0, indexBasis: macro.indexBasis,
    indexFacts: buildIndexFacts(macro.indexBasis, rlsi.session, ts), session: rlsi.session,
    vectors: vectors.map(v => ({ source: v.sourceId, target: v.targetId, strength: v.strength })),
    rvol: core.rvol?.ndx?.status === 'OPEN' && (core.rvol.ndx.rvol ?? 0) > 0 ? core.rvol.ndx.rvol : undefined,
    vix: macro.vix || 0, locale,
    us10y: macro.factors?.us10y?.level ?? macro.yieldCurve?.us10y ?? undefined, us10yChangeBp: us10yChangeBp(macro.factors?.us10y),
    spread2s10s: macro.yieldCurve?.spread2s10s ?? undefined, realYield: macro.realYield?.realYield ?? undefined, realYieldStance: macro.realYield?.stance ?? undefined,
    breadthPct: reg ? rlsi.components?.breadthPct : undefined, adRatio: reg ? rlsi.components?.adRatio : undefined,
    volumeBreadth: reg ? rlsi.components?.volumeBreadth : undefined, breadthSignal: reg ? rlsi.components?.breadthSignal : undefined,
    rotationRegime: ri.regime, topInflow5d: ri.topInflow?.length ? fmt(ri.topInflow) : undefined, topOutflow5d: ri.topOutflow?.length ? fmt(ri.topOutflow) : undefined,
    noiseWarning: ri.noiseFlags?.join(', ') || undefined, trendVsToday: ri.bounceWarnings?.join(' | ') || undefined, rotationConviction: ri.conviction,
    rotationFacts: rotationFactsFrom(ri, flows, vectors), signalConflict,
    marketNewsHeadlines: core.news?.length ? core.news : undefined, scheduledEvents: core.scheduledEvents, asOf: core.timestamp,
    fearGreedScore: rlsi.components?.sentimentScore ?? undefined, fearGreedRating: rlsi.components?.sentimentSource?.replace('CNN F&G: ', '') ?? undefined,
    spxChangePct: macro.factors?.spx?.chgPct ?? undefined, dxy: macro.dxy ?? undefined,
    goldChangePct: macro.factors?.gold?.chgPct ?? undefined, oilChangePct: macro.factors?.oil?.chgPct ?? undefined,
    btcChangePct: macro.factors?.btc?.chgPct ?? undefined, tltChangePct: macro.tltChangePct ?? undefined,
    gexIndex: g.gexIndex ?? undefined, gexLevel: g.gexLevel ?? undefined, squeezeRisk: g.squeezeRisk ?? undefined, squeezeLevel: g.squeezeLevel ?? undefined,
    triggerSupport: g.supportWall ?? undefined, triggerResistance: g.resistanceWall ?? undefined, triggerCurrent: g.currentPrice ?? undefined,
    gammaFlipPoint: g.gammaFlipPoint ?? undefined, gexChange: g.gexChange ?? undefined, spyGexIndex: g.spyGexIndex ?? undefined, qqqGexIndex: g.qqqGexIndex ?? undefined,
    ...div,
    sectorIFS: flows.filter(f => f.instFlow).map(f => ({ id: f.id, ifs: f.instFlow.ifs, divergence: f.instFlow.divergence })),
    stealthAlert: flows.filter(f => f.instFlow?.divergence === 'DIVERGENT' && f.change < 0 && f.instFlow.ifs > 20).map(f => `${sectorLabelForAi(f.name)}: ${f.change.toFixed(1)}% but IFS +${f.instFlow.ifs.toFixed(0)}`)[0] || undefined,
    exitAlert: flows.filter(f => f.instFlow?.divergence === 'DIVERGENT' && f.change > 0 && f.instFlow.ifs < -20).map(f => `${sectorLabelForAi(f.name)}: +${f.change.toFixed(1)}% but IFS ${f.instFlow.ifs.toFixed(0)}`)[0] || undefined,
  };
}

/** PRE 운영 입력에서 시각만 바꾼 REG·POST(실제 해당 세션 관측 아님 — 보고서에 «파생») */
function deriveSession(core, session) {
  const c = JSON.parse(JSON.stringify(core));
  const date = c.market.indexBasis.cash?.nasdaq?.sessionDate;
  const at = evidenceTime('wall:et', `${date} ${session === 'REG' ? '15:30' : '17:30'}`);
  const q = evidenceTime('wall:et', `${date} ${session === 'REG' ? '15:29' : '17:29'}`);
  c.timestamp = at.iso; c.session = session; c.rlsi.session = session;
  for (const p of Object.values(c.market.indexBasis.cash)) if (session === 'REG' && p.price != null) Object.assign(p, { asOf: q.iso, live: true, sessionDate: date });
  for (const p of Object.values(c.market.indexBasis.futures)) { p.asOf = q.iso; p.cashCloseReferenceAt = null; p.sinceCashClosePct = null; }
  return c;
}

const conflictCodes = r => r.filter(x => /^rotation:index-(?:value|direction|unavailable|token-forbidden)$/.test(x));

async function run(inputs, opts) {
  const old = oldModule();
  const cur = require('../src/services/guardian/intelligenceNode')._rotationCompareHooks;
  const runtime = require('../src/services/bedrockClient');
  const { triLangGate } = require('../src/lib/ai/ladderGates');
  const results = [];
  const held = [console.log, console.warn, console.error];
  for (const { core, provenance, source } of inputs) {
    const session = tacticalSessionAt(Date.parse(core.timestamp));
    const ctxBy = Object.fromEntries(LOCALES.map(l => [l, contextFromCore(core, l)]));
    const ts = Date.parse(core.timestamp);
    for (let repeat = 1; repeat <= opts.repeat; repeat++) {
      for (const contract of ['old', 'new']) {
        const base = ctxBy.ko;
        const ctxNew = cur.rotationCurrent(base, ts);
        const nums = guardianNumsFromAiContext(contract === 'new' ? ctxNew : base);
        const prompt = l => {
          if (contract === 'new') return cur.rotationPromptFor({ ...ctxNew, ...{ divergenceCase: ctxBy[l].divergenceCase } }, l);
          const c = ctxBy[l];
          const name = id => sectorLabelForAi(SECTOR_MAP[id]?.name || id);
          const vectorDesc = c.vectors.length ? c.vectors.slice(0, 3).map(v => `${name(v.source)}->${name(v.target)}`).join(', ') : 'No significant rotation';
          return old.hooks.ROTATION_PROMPTS[l](c, vectorDesc);
        };
        const rules = (l) => contract === 'new' ? cur.tokenRulesFor('rotation', l, nums) : require('../src/lib/ai/guardianNumbers').guardianTokenRules(l, nums);
        const blocks = LOCALES.map(l => `=== ${({ ko: 'KOREAN', en: 'ENGLISH', ja: 'JAPANESE' })[l]} (${l}) INSTRUCTIONS ===\n${prompt(l) + rules(l)}`).join('\n\n');
        const user = `Write the analysis once, in three languages, following each language's own instruction block below. All three must carry the same facts and the same placeholders. Return the JSON object only.\n\n${blocks}`;
        const hooks = contract === 'new' ? cur : old.hooks;
        const meta = { session, provenance, source, repeat, contract };
        let raw = null, model = null;
        try {
          console.log = console.warn = console.error = () => {};
          const r = await runtime.callBedrock({ modelId: runtime.MODELS.HAIKU_35, system: hooks.TRI_SYSTEM, userPrompt: user, maxTokens: 3500, temperature: 0.2,
            timeoutMs: 32000, fallbackModel: null, jsonPrefill: false, label: 'Guardian/ROTATION_TRI', expectJson: true, locale: 'multi', validate: triLangGate() });
          model = r.model;
          raw = hooks.restoreSectorLabels(hooks.parseTriJson(r.text || ''));
        } catch { raw = null; } finally { [console.log, console.warn, console.error] = held; }
        for (const l of LOCALES) {
          if (!raw?.[l]) { results.push({ ...meta, locale: l, reasons: ['model:failed'], conflicts: [], text: '' }); continue; }
          // 운영 gateAll 과 같은 호출 — 옛 계약은 프롬프트 없이(origin/main), 새 계약은 프롬프트로 v3 검사
          const g = hooks.gateText('rotation', hooks.tokenizeInsight('rotation', raw[l], nums), l, nums, nums, true, contract === 'new' ? prompt(l) : undefined);
          // 숫자 충돌은 두 계약 모두 같은 기준(새 프롬프트의 INDEX_FACTS)으로
          const ref = cur.rotationPromptFor(ctxNew, l);
          results.push({ ...meta, locale: l, reasons: g.reasons, conflicts: conflictCodes(rotationIndexReasons(g.text, ref)), text: g.text, chars: [...g.text].length, model });
        }
        process.stdout.write(`${session} r${repeat} ${contract}: ${LOCALES.map(l => results.find(x => x.session === session && x.repeat === repeat && x.contract === contract && x.locale === l)?.reasons.length ? '✗' : '✓').join('')}\n`);
      }
    }
  }
  return { results, revision: old.revision };
}

const md = t => String(t || '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ⏎ ');
function report(results, revision, inputs) {
  const rate = rows => rows.length ? `${rows.filter(r => !r.reasons.length).length}/${rows.length} (${(100 * rows.filter(r => !r.reasons.length).length / rows.length).toFixed(1)}%)` : '—';
  const pr = rows => rows.length ? rows.filter(r => !r.reasons.length).length / rows.length : 0;
  const by = (c, f) => results.filter(r => r.contract === c && f(r));
  const out = ['# 순환매 v3 비교(실모델)', '', `옛 계약: origin/main ${revision.slice(0, 9)} · 새 계약: 작업 트리. 운영 쓰기 0.`, '',
    `입력: ${inputs.map(i => `${tacticalSessionAt(Date.parse(i.core.timestamp))} ${i.core.timestamp} (${i.provenance === 'derived' ? '파생 — 실제 해당 세션 관측 아님' : '운영 실입력'}: ${i.source})`).join(' · ')}`, '',
    '| 통과율 | 옛 계약 | 새 계약 |', '|---|---|---|', `| 전체 | ${rate(by('old', () => true))} | ${rate(by('new', () => true))} |`];
  for (const s of SESSIONS) out.push(`| ${s} | ${rate(by('old', r => r.session === s))} | ${rate(by('new', r => r.session === s))} |`);
  for (const l of LOCALES) out.push(`| ${l} | ${rate(by('old', r => r.locale === l))} | ${rate(by('new', r => r.locale === l))} |`);
  const cells = SESSIONS.flatMap(s => LOCALES.map(l => ({ s, l, o: by('old', r => r.session === s && r.locale === l), n: by('new', r => r.session === s && r.locale === l) })));
  for (const c of cells) out.push(`| ${c.s}/${c.l} | ${rate(c.o)} | ${rate(c.n)} |`);
  const conflicts = c => by(c, r => r.conflicts.length).length;
  out.push('', `숫자 충돌(지수 이름+% 가 INDEX_FACTS 와 다름): 옛 ${conflicts('old')}건 / 새 ${conflicts('new')}건 (각 ${by('old', () => true).length}·${by('new', () => true).length}개 중)`);
  const measured = cells.every(c => c.o.length >= 3 && c.n.length >= 3);
  const ok = measured && pr(by('new', () => true)) >= 0.85 && cells.every(c => pr(c.n) >= pr(c.o)) && conflicts('new') === 0;
  out.push('', `반영 조건(전체 85% 이상·세션×언어 칸마다 옛 이상·새 숫자 충돌 0): ${!measured ? '미측정' : ok ? '충족' : '보류'}`);
  const reasons = {};
  for (const r of results) for (const x of r.reasons) reasons[`${r.contract}:${x.replace(/:[^:]*[^\x00-\x7F].*$/, '')}`] = (reasons[`${r.contract}:${x.replace(/:[^:]*[^\x00-\x7F].*$/, '')}`] || 0) + 1;
  out.push('', '탈락 사유 집계: ' + (Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음'));
  out.push('', '| 계약 | 세션 | 회 | 언어 | 글자 | 검사 | 숫자 충돌 | 문장 |', '|---|---|---|---|---|---|---|---|');
  for (const r of results) out.push(`| ${r.contract} | ${r.session} | ${r.repeat} | ${r.locale} | ${r.chars ?? 0} | ${md(r.reasons.join(', ') || '통과')} | ${md(r.conflicts.join(',') || '0')} | ${md(r.text)} |`);
  return { text: out.join('\n') + '\n', ok };
}

async function main(argv) {
  const opt = n => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1]; };
  const files = argv.flatMap((a, i) => (a === '--input' && argv[i + 1] ? [argv[i + 1]] : []));
  const decode = v => { if (typeof v?.result === 'string') { try { return JSON.parse(v.result); } catch { return null; } } return v?.result && typeof v.result === 'object' ? v.result : v; };
  const inputs = files.map(f => ({ core: decode(JSON.parse(fs.readFileSync(f, 'utf8'))), provenance: 'operational', source: path.basename(f) }));
  if (argv.includes('--derive-sessions')) {
    const pre = inputs.find(i => tacticalSessionAt(Date.parse(i.core.timestamp)) === 'PRE');
    for (const s of ['REG', 'POST']) if (pre && !inputs.some(i => tacticalSessionAt(Date.parse(i.core.timestamp)) === s)) inputs.push({ core: deriveSession(pre.core, s), provenance: 'derived', source: `파생: ${pre.source}` });
  }
  const sessions = inputs.map(i => tacticalSessionAt(Date.parse(i.core.timestamp)));
  const only = opt('--sessions') ? opt('--sessions').split(',') : SESSIONS;
  const chosen = inputs.filter((_, k) => only.includes(sessions[k]));
  const { results, revision } = await run(chosen, { repeat: Number(opt('--repeat') || 3) });
  const out = opt('--out') || path.join(require('node:os').homedir(), 'Documents/signum-work/2026-10-24/rotation-v3/compare.md');
  const r = report(results, revision, chosen);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, r.text);
  fs.writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify({ revision, inputs: chosen.map(i => ({ ts: i.core.timestamp, provenance: i.provenance, source: i.source })), results }, null, 2) + '\n');
  console.log(r.text.split('\n').slice(0, 30).join('\n'));
}
module.exports = { contextFromCore, deriveSession, oldModule, report };
if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error('비교 중단:', e?.message); process.exitCode = 1; });
