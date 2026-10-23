#!/usr/bin/env node
// 운영 세션 전용. .env 파일을 읽지 않는다. Redis에는 GET만 보낸다.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const C = require('./lambda-cross-sector/closingReport.js');
const LEVELS = require('./lambda-cross-sector/indexLevels.js');
const KEYLEVELS = require('./lambda-cross-sector/keyLevels.js');

export function options(args) {
    const o = { count: 20, days: 90, runs: 1, generate: false, end: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--generate') o.generate = true;
        else if (a === '--help') o.help = true;
        else if (['--count', '--days', '--runs', '--end'].includes(a)) o[a.slice(2)] = args[++i];
        else throw new Error('지원하지 않는 인자');
    }
    for (const [k, max] of [['count', 100], ['days', 366], ['runs', 5]]) {
        o[k] = Number(o[k]);
        if (!Number.isInteger(o[k]) || o[k] < 1 || o[k] > max) throw new Error('숫자 인자 범위 오류');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.end) || new Date(`${o.end}T12:00:00Z`).toISOString().slice(0, 10) !== o.end) throw new Error('날짜 오류');
    return o;
}

// Exact archived keys only. No SCAN/KEYS, API routes, cache clients or self-healing GETs.
export async function recentReports(read, { count, days, end }) {
    const found = [];
    for (let offset = 0; offset < days && found.length < count; offset++) {
        const date = new Date(Date.parse(`${end}T12:00:00Z`) - offset * 86400000).toISOString().slice(0, 10);
        for (const version of ['v4', 'v3', 'v2']) {
            const key = `postmarket:cross-brief-${version}:${date}`;
            let brief = await read(key);
            if (typeof brief === 'string') { try { brief = JSON.parse(brief); } catch { continue; } }
            if (brief?.structured && brief.date === date) found.push({ key, date, version, brief });
            if (found.length === count) break;
        }
    }
    return found;
}

// Match the producers' numeric context, using only the session-checked archived readings.
function archivedMacro({ regularClose: cash, readings: r }) {
    const fmt = (q, label) => q ? `${label}: ${q.price.toFixed(q.price > 1000 ? 0 : 2)} (${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%)` : null;
    const tnxBp = q => {
        const abs = Number.isFinite(q.change) ? q.change
            : (Number.isFinite(q.price) && Number.isFinite(q.changePct) && q.changePct > -100 ? q.price - q.price / (1 + q.changePct / 100) : null);
        if (abs == null) return '—';
        const bp = Math.round(abs * 100);
        return `${bp > 0 ? '+' : ''}${bp}bp`;
    };
    return [
        fmt(r.vix, 'VIX'), fmt(r.vix3m, 'VIX3M'),
        r.vix && r.vix3m ? `VIX/VIX3M Ratio: ${(r.vix.price / (r.vix3m.price || 1)).toFixed(3)} (${r.vix.price > r.vix3m.price ? 'BACKWARDATION ⚠️' : 'CONTANGO ✓'})` : null,
        fmt(cash.spx, 'S&P500'), fmt(cash.nasdaq, 'NASDAQ'), fmt(cash.dow, 'DOW'),
        fmt(r.futures?.es, 'ES=F daily futures change (not since cash close)'),
        fmt(r.futures?.nq, 'NQ=F NASDAQ100 daily futures change (not NASDAQ Composite)'),
        fmt(r.futures?.rty, 'RTY=F daily futures change (not cash close)'),
        r.us10y ? `US10Y: ${r.us10y.price.toFixed(2)}% (${tnxBp(r.us10y)})` : null,
        fmt(r.dollar, 'DXY'), fmt(r.tlt, 'TLT(20Y+Bond)'), fmt(r.gold, 'Gold'), fmt(r.oil, 'WTI Oil'),
        r.btc ? `BTC: $${r.btc.price.toFixed(0)} (${r.btc.changePct >= 0 ? '+' : ''}${r.btc.changePct.toFixed(2)}%)` : null,
        r.fearGreed ? `Fear & Greed: ${r.fearGreed.value || r.fearGreed.score || 'N/A'}` : null,
        r.usdkrw ? `USD/KRW: ${r.usdkrw.price.toFixed(2)} (${r.usdkrw.changePct >= 0 ? '+' : ''}${r.usdkrw.changePct.toFixed(2)}%)` : null,
        r.usdjpy ? `USD/JPY: ${r.usdjpy.price.toFixed(2)} (${r.usdjpy.changePct >= 0 ? '+' : ''}${r.usdjpy.changePct.toFixed(2)}%)` : null,
    ].filter(Boolean).join(' | ');
}

export function archivedInput({ brief, date }) {
    // Without timestamped original inputs, regenerating an old date from today's Redis is invalid.
    if (!brief.reportEvidence?.regularClose?.spx || !brief.reportEvidence?.regularClose?.nasdaq) return null;
    const evidence = structuredClone(brief.reportEvidence);
    if (Object.values(evidence.regularClose).some(q => q && q.sessionDate !== date)) return null;
    const now = new Date(brief.generatedAt);
    if (!Number.isFinite(now.getTime())) return null;
    evidence.sessionDate = date;
    const readings = evidence.readings || {};
    for (const [k, q] of Object.entries(readings)) {
        if (k === 'futures') readings[k] = Object.fromEntries(Object.entries(q || {}).map(([t, row]) => [t, C.sessionReading(row, date, now)]));
        else readings[k] = C.sessionReading(q, date, now);
    }
    evidence.readings = readings;
    evidence.news = (evidence.news || []).filter(n => n.publishedEt?.startsWith(`${date} `));
    let sectors = brief.sectorInputs;
    if (!Array.isArray(sectors) && typeof brief.reportSource === 'string') {
        const block = brief.reportSource.split('## Sector snapshots (check sessionDate; no stale snapshot is included)\n')[1]?.split('\n## REQUIRED CLOSING NARRATIVE')[0];
        try { sectors = JSON.parse(block); } catch { /* original sector input unavailable */ }
    }
    if (!Array.isArray(sectors)) return null;
    sectors = sectors.filter(s => s.sessionDate === date);
    // Rebuild numeric macro context from timestamped evidence. Never reuse an undated macro string.
    const macroStr = archivedMacro(evidence);
    const rows = (brief.optionLevels || []).filter(r => r.asOf != null && new Date(r.asOf).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === date);
    const block = LEVELS.buildLevelsBlock(rows);
    const prompt = C.buildClosingPrompt({ sessionDate: date, macroStr, levelsSection: LEVELS.levelsPromptSection(block.block), evidence, sectorSummaries: sectors,
        keyLevelsSchema: KEYLEVELS.SCHEMA_EXAMPLE, keyLevelsRequirement: KEYLEVELS.REQUIREMENT });
    return { evidence, prompt, macroStr, rows };
}

export function redact(text, env = process.env) {
    let s = String(text ?? '');
    for (const [key, value] of Object.entries(env)) {
        if (/(?:KEY|TOKEN|SECRET|COOKIE|PASSWORD|CREDENTIAL)/i.test(key) && value?.length >= 4) s = s.split(value).join('[REDACTED]');
    }
    return s.replace(/\b(?:sk-ant-|sk-proj-)[A-Za-z0-9_-]+/g, '[REDACTED]')
        .replace(/\b(?:Bearer|Basic)\s+[^\s<]+/gi, '[REDACTED]');
}
const cell = text => redact(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>');
export function localeLines(value, locale, path = '') {
    if (value == null) return [];
    if (typeof value !== 'object') return [`${path}: ${value}`];
    if (['ko', 'en', 'ja'].some(l => Object.hasOwn(value, l))) return localeLines(value[locale], locale, path);
    return Object.entries(value).flatMap(([key, v]) => localeLines(v, locale, path ? `${path}.${key}` : key));
}
export function comparisonMarkdown(record, fresh, status) {
    return [`### ${record.date} / ${record.version}`, '', `저장: ${cell(record.brief.generatedAt || '시각 없음')} · provider=${cell(record.brief.provider || record.brief.guard?.provider || '미기록')} · model=${cell(record.brief.model || record.brief.guard?.model || '미기록')}`, '', `상태: ${cell(status)}`, '', '| 언어 | 운영 저장본 | 새 프롬프트 결과 |', '|---|---|---|',
        ...['ko', 'en', 'ja'].map(loc => `| ${loc} | ${cell(localeLines(record.brief.structured, loc).join('\n'))} | ${cell(fresh ? localeLines(fresh, loc).join('\n') : '비교 불가 / 미실행')} |`), ''].join('\n');
}

export function redisReader(env = process.env, fetcher = fetch) {
    const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
    const token = env.UPSTASH_REDIS_REST_READ_ONLY_TOKEN || env.KV_REST_API_READ_ONLY_TOKEN;
    const proxyUrl = env.EC2_REDIS_PROXY_URL;
    const proxyKey = env.EC2_REDIS_PROXY_KEY || env.REDIS_PROXY_KEY;
    if (!!proxyUrl !== !!proxyKey) throw new Error('EC2 읽기 설정 누락');
    if (!url || !token) throw new Error('Redis URL·읽기 전용 토큰 환경변수 필요');
    return async key => {
        if (!/^(?:postmarket:cross-brief-v[234]:\d{4}-\d{2}-\d{2}|llm:[\w:.-]+)$/.test(key)) throw new Error('허용하지 않은 읽기 키');
        const proxy = proxyUrl && key.startsWith('postmarket:');
        const endpoint = proxy ? `${proxyUrl.replace(/\/$/, '')}/get?key=${encodeURIComponent(key)}` : `${url.replace(/\/$/, '')}/get/${encodeURIComponent(key)}`;
        const res = await fetcher(endpoint, { headers: { Authorization: `Bearer ${proxy ? proxyKey : token}` }, signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error('Redis 읽기 실패');
        const data = await res.json();
        if (data.error) throw new Error('Redis 읽기 실패');
        return data.result;
    };
}

export async function modelRunner(read) {
    // Existing TS loader and provider clients, no dotenv or new SDK implementation.
    require('./offline-test-typescript.cjs');
    const { runLadder } = require('../src/lib/ai/llmLadder.ts');
    const { memoryStore } = require('../src/lib/ai/llmStore.ts');
    const { callBedrock } = require('../src/services/bedrockClient.ts');
    const { multiLangJsonGate } = require('../src/lib/ai/ladderGates.ts');
    const { closingReportProblems } = require('../src/lib/ai/closingReport.ts');
    const { restoreCommonTermsDeep } = require('../src/lib/ai/commonTerms.ts');
    const { buildGenerationGuard } = require('../src/lib/ai/crossBriefServe.ts');
    const local = memoryStore();
    const store = { ...local, get: async key => {
        if (!local.data.has(key)) { const value = await read(key); if (value != null) local.data.set(key, value); }
        return local.get(key);
    } };
    return async input => {
        const system = 'You are SIGNUM Intelligence. Return ONLY valid JSON. No investment advice. Preserve the archived session date; the current date is not the report date.';
        const validate = text => {
            const base = multiLangJsonGate('CrossSector', input.prompt, { keys: ['marketOverview', 'sectorRotation', 'outlook', 'closingNarrative'], structured: true })(text);
            if (base !== true) return base;
            try { const reasons = closingReportProblems({ structured: JSON.parse(text), reportEvidence: input.evidence }); return reasons.length ? { ok: false, reasons } : true; } catch { return false; }
        };
        const start = Date.now();
        // Provider failures can include URLs/headers. Suppress client logs; report only fixed errors.
        const logs = { log: console.log, warn: console.warn, error: console.error };
        console.log = console.warn = console.error = () => {};
        try {
            const result = await runLadder({ purpose: 'CrossSector', system, userPrompt: input.prompt, maxTokens: 8192, temperature: 0.4, timeoutMs: 55000, expectJson: true, locale: 'multi', validate },
                async () => callBedrock({ purpose: 'CloseReportComparison', label: 'CloseReportComparison', system, userPrompt: input.prompt, maxTokens: 8192, temperature: 0.4, timeoutMs: 55000, maxRetries: 1, fallbackModel: null, allowLastResort: false }),
                { store, log: () => {} });
            const structured = restoreCommonTermsDeep(JSON.parse(result.text));
            LEVELS.finalizeCrossSectorKeyLevels(structured, input.macroStr, input.rows);
            const guard = buildGenerationGuard({ brief: { structured, reportEvidence: input.evidence, macroSnapshot: input.macroStr, levelsSnapshot: LEVELS.buildLevelsBlock(input.rows).ground }, source: `${system}\n${input.prompt}`, provider: result.provider, model: result.model });
            return { structured, guard, status: `provider=${result.provider}; model=${result.model}; ${Date.now() - start}ms; costUsd=${result.provider === 'legacy' ? 'unknown' : result.costUsd}; guard=${guard.ok}; reasons=${guard.reasons.join(',')}; trail=${result.trail.join(',')}` };
        } finally { Object.assign(console, logs); }
    };
}

export async function main(args = process.argv.slice(2)) {
    const o = options(args);
    if (o.help) {
        console.log('사용: node scripts/compare-close-report.mjs --count 20 --days 90 --end YYYY-MM-DD [--generate --runs 3]\n환경변수: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_READ_ONLY_TOKEN (또는 KV 대응 변수). .env 로드 없음.\n기본은 저장본 조회만. --generate는 유료 모델 호출. N은 날짜가 아닌 저장 키 개수(v4→v3→v2). --runs는 저장본당 생성 횟수.\nEC2_REDIS_PROXY_URL·EC2_REDIS_PROXY_KEY가 있으면 보고서는 EC2 GET, 사다리 상태는 Upstash GET. 없으면 Upstash GET만. 원입력 결측은 재생하지 않음. 모델 원장·캡처·서킷 쓰기는 프로세스 메모리에만 기록.');
        return;
    }
    const read = redisReader();
    const records = await recentReports(read, o);
    console.log(`# 장마감 리포트 비교\n\n요청 ${o.count}개 · 저장본 ${records.length}개 · 조회 범위 ${o.days}일 · 종료 ${o.end} · 보고서 조회 ${process.env.EC2_REDIS_PROXY_URL ? 'EC2' : 'Upstash'}\n`);
    let generate;
    let completed = 0, failed = 0, missing = 0, rejected = 0;
    for (const record of records) {
        const input = archivedInput(record);
        if (!o.generate || !input) {
            if (!input) missing++;
            console.log(comparisonMarkdown(record, null, input ? '모델 미실행 (--generate 필요)' : '날짜가 검증된 저장 원입력 없음 — 최신 데이터로 대체하지 않음'));
            continue;
        }
        generate ||= await modelRunner(read);
        for (let run = 1; run <= o.runs; run++) {
            try {
                const result = await generate(input);
                completed++;
                if (!result.guard.ok) rejected++;
                console.log(comparisonMarkdown(record, result.structured, `회차 ${run}/${o.runs}; ${result.status}`));
            } catch {
                failed++;
                console.log(comparisonMarkdown(record, null, `회차 ${run}/${o.runs}; 모델 생성 실패 (오류 원문 출력 금지)`));
            }
        }
    }
    console.log(`\n저장본 ${records.length}/${o.count} · 생성 완료 ${completed} · 생성 실패 ${failed} · 가드 탈락 ${rejected} · 원입력 없음 ${missing}`);
    if (records.length < o.count || missing || failed || rejected) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('비교 실패: 인자·읽기 전용 자격증명·연결을 확인하세요. 오류 원문은 출력하지 않습니다.'); process.exitCode = 1; });
