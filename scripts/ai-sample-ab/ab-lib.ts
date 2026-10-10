/**
 * 같은 입력을 현행(라우트가 넘긴 legacy = 운영 그대로의 Bedrock Haiku 4.5 호출)과 Haiku 5.5(Anthropic 크레딧)로 나란히 돌리고
 * 가드로 채점한다. 가드 두 벌: ① 라우트의 진짜 출구 가드(validate — 사다리가 «다음 단으로 넘길지»를 정하는 기준 그대로)
 * ② 공통 가드(evaluateOutput — 언어 혼입·거절·음차·금액 자릿수·연도·JSON·잘림).
 */
import fs from 'node:fs';
import { state, allowPostHosts, type Captured } from './core';

export interface Variant { name: string; effort: 'low' | 'medium' | 'high'; thinking?: 'disabled' | 'adaptive'; maxTokens?: number; systemSuffix?: string; userTransform?: (u: string) => string; outputTransform?: (t: string) => string; cacheSystem?: boolean }

export interface Side {
    ok: boolean; error?: string; ms: number; text: string; model?: string; stop?: string | null;
    usage?: { input: number; output: number; cacheWrite: number; cacheRead: number }; costUsd?: number;
    prodGate?: { ok: boolean; reason: string } | null;
    eval?: { ok: boolean; reasons: string[] };
    perLang?: { ko: boolean; en: boolean; ja: boolean };
    pass?: boolean;
}
export interface Row { src?: string; purpose: string; idx: number; round: number; locale: string | null; head: string; legacy?: Side; legacyV?: Record<string, Side>; variants: Record<string, Side> }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let legacyChain: Promise<unknown> = Promise.resolve();
let lastLegacyAt = 0;
const LEGACY_GAP_MS = Number(process.env.AB_LEGACY_GAP_MS || 7000);
function throttledLegacy<T>(fn: () => Promise<T>): Promise<T> {
    const run = legacyChain.then(async () => {
        const wait = Math.max(0, lastLegacyAt + LEGACY_GAP_MS - Date.now());
        if (wait) await sleep(wait);
        lastLegacyAt = Date.now();
        return fn();
    });
    legacyChain = run.catch(() => undefined);
    return run;
}

function perLangFrom(reasons: string[]): { ko: boolean; en: boolean; ja: boolean } {
    const generic = reasons.filter((r) => !/^(ko|en|ja):/.test(r));
    const bad = (l: string) => reasons.some((r) => r.startsWith(l + ':'));
    return { ko: !generic.length && !bad('ko'), en: !generic.length && !bad('en'), ja: !generic.length && !bad('ja') };
}

/** 짧은 칸이 수치·티커·회사명과 섞인 구조화 JSON — 글자 비율 대신 문자 체계 혼입으로 언어를 본다 */
const STRUCTURED = new Set(['CrossSector', 'IntelSnapshot', 'EarningsBrief']);

export async function score(c: Captured, text: string, stop: string | null | undefined, refusal: boolean, kind: 'legacy' | 'h55'): Promise<Pick<Side, 'prodGate' | 'eval' | 'perLang' | 'pass' | 'text'>> {
    const { evaluateOutput } = await import('@/lib/ai/ladderGates');
    const { interpretGate } = await import('@/lib/ai/llmLadder');
    const { normalizeJsonText } = await import('@/lib/ai/llmRequest');
    let t = text;
    const wantsJson = !!(c.jsonPrefill || c.expectJson);
    // 사다리(①②)는 JSON 호출이면 군말을 걷어 낸 뒤 가드에 넘긴다 — 현행(③)은 그대로 넘긴다
    // 현행 라우트도 JSON 을 꺼낼 때 군말·코드펜스를 걷어 낸다(예: earnings-brief 의 /\{[\s\S]*\}/ 추출, 모닝 브리핑의 indexOf('{')) — 같은 정리를 양쪽에 건다
    if (wantsJson) { const j = normalizeJsonText(t, c.expectJson === 'array' ? 'array' : 'object'); if (j.ok) t = j.text; }
    let prodGate: { ok: boolean; reason: string } | null = null;
    if (c.validate) { try { prodGate = interpretGate(c.validate(t)); } catch (e: any) { prodGate = { ok: true, reason: 'gate-throw' }; } }
    const loc = (c.locale === 'ko' || c.locale === 'en' || c.locale === 'ja' || c.locale === 'multi') ? c.locale : null;
    const ev = evaluateOutput({
        purpose: c.purpose, locale: loc as any, text: t, source: c.userPrompt, expectJson: c.expectJson ?? (c.jsonPrefill ? true : false),
        truncated: stop === 'max_tokens', refusal, structured: STRUCTURED.has(c.purpose),
    });
    // 비교용 거짓 양성 제거는 evaluateOutput 안에서 이미 한다. 라우트 가드가 있으면 둘 다 통과해야 통과.
    const reasons = [...ev.reasons, ...(prodGate && !prodGate.ok ? [`prod:${prodGate.reason}`] : [])];
    const pass = ev.ok && (!prodGate || prodGate.ok);
    return { prodGate, eval: { ok: ev.ok, reasons }, perLang: perLangFrom(reasons), pass, text: t };
}

async function runLegacy(c: Captured, call?: () => Promise<any>, outT?: (t: string) => string): Promise<Side> {
    const { costOf } = await import('@/lib/ai/llmPricing');
    const t0 = Date.now();
    try {
        const timed = await throttledLegacy(async () => { const t = Date.now(); const r = await (call ? call() : c.legacy({ elapsedMs: 0 })); return { r, ms: Date.now() - t }; });
        const r: any = timed.r;
        const ms = timed.ms;
        const sc = await score(c, outT ? outT(r.text || '') : (r.text || ''), r.truncated ? 'max_tokens' : null, false, 'legacy');
        return { ok: true, ms, model: r.model, stop: r.truncated ? 'max_tokens' : null, usage: r.usage, costUsd: costOf(r.usage, r.priceModel ?? 'haiku-4.5'), ...sc } as Side;
    } catch (e: any) {
        return { ok: false, ms: Date.now() - t0, text: '', error: `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 160)}` };
    }
}

async function runH55(c: Captured, v: Variant): Promise<Side> {
    // 크레딧 키는 Vercel 민감 변수라 로컬로 받아지지 않는다 → 서버 쪽 관리자 비교 엔드포인트(adhoc)로 «같은 요청»을 보낸다.
    //   (서버가 shapeH55Body + defaultCallAnthropic 으로 호출 — 사다리와 같은 요청 모양. 비밀은 CRON_SECRET 하나만 로컬에 있다.)
    const { financeTermsRule } = await import('@/lib/ai/commonTerms');
    const { costOf } = await import('@/lib/ai/llmPricing');
    const secret = process.env.CRON_SECRET || '';
    if (!secret) return { ok: false, ms: 0, text: '', error: 'no-secret' };
    const base = (process.env.AB_BASE || 'https://www.signumhq.com').replace(/\/$/, '');
    const t0 = Date.now();
    try {
        let system = v.systemSuffix ? c.system + '\n\n' + v.systemSuffix : c.system;
        // 서버가 financeTermsRule 을 앞에 붙이므로, 이미 들어 있으면 한 번 걷어 낸다(내용은 같고 순서만 date→finance 에서 finance→date 로)
        const ft = financeTermsRule();
        if (system.includes(ft)) system = system.replace(ft, '');
        const user = v.userTransform ? v.userTransform(c.userPrompt) : c.userPrompt;
        const wantsJson = !!(c.jsonPrefill || c.expectJson);
        const res = await fetch(`${base}/api/admin/ai-ab`, {
            method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
            body: JSON.stringify({ adhoc: { system, userPrompt: user, maxTokens: v.maxTokens ?? c.maxTokens, expectJson: wantsJson, timeoutMs: 58_000, cacheSystem: !!v.cacheSystem }, effort: v.effort, thinking: v.thinking === 'disabled' ? 'disabled' : undefined }),
            signal: AbortSignal.timeout(75_000),
        });
        if (!res.ok) return { ok: false, ms: Date.now() - t0, text: '', error: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` };
        const j: any = await res.json();
        const h = j.h55;
        if (!h?.ok) return { ok: false, ms: h?.ms ?? Date.now() - t0, text: '', error: String(h?.error || 'fail').slice(0, 160) };
        const out = v.outputTransform ? v.outputTransform(h.text) : h.text;
        const sc = await score(c, out, h.stop, !!h.refusal || h.stop === 'refusal', 'h55');
        return { ok: true, ms: h.ms, stop: h.stop, usage: h.usage, costUsd: h.costUsd ?? costOf(h.usage, 'haiku-5.5'), model: 'claude-haiku-5.5', ...sc } as Side;
    } catch (e: any) {
        return { ok: false, ms: Date.now() - t0, text: '', error: `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 160)}` };
    }
}

/** items 를 rounds 번 돌린다(입력이 1~2건뿐인 용도는 같은 입력을 여러 번 — 모델 출력의 변동을 본다). */
export async function runAB(items: Captured[], opts: {
    rounds?: number; variants: Variant[]; skipLegacy?: boolean; concurrency?: number; localeOf?: (c: Captured) => string | null; log?: (s: string) => void;
    /** 현행에도 같은 입력 변형을 적용해 따로 잰다(예: 가디언 영어 섹터명이 현행에서 후퇴하지 않는지) — c.legacyWith 필요 */
    legacyVariants?: Array<{ name: string; userTransform?: (u: string) => string; outputTransform?: (t: string) => string }>;
    /** 출구 후처리(예: 음차 복원) — 모든 쪽의 같은 글에 적용한 점수를 «+post» 로 따로 낸다 */
    post?: (t: string) => string;
}): Promise<Row[]> {
    state.allowLLM = true;
    allowPostHosts.push(/(^|\.)signumhq\.com$/);
    const log = opts.log || ((s: string) => console.error(s));
    const rounds = opts.rounds ?? 1;
    const jobs: Array<() => Promise<Row>> = [];
    const addPost = async (c: Captured, side: Side | undefined): Promise<Side | undefined> => {
        if (!side || !side.ok || !opts.post) return undefined;
        const sc = await score(c, opts.post(side.text), side.stop, false, 'h55');
        return { ...side, ...sc };
    };
    items.forEach((c, idx) => {
        for (let round = 0; round < rounds; round++) {
            jobs.push(async () => {
                const row: Row = { src: c.userPrompt, purpose: c.purpose, idx, round, locale: opts.localeOf ? opts.localeOf(c) : c.locale, head: c.userPrompt.slice(0, 80).replace(/\s+/g, ' '), variants: {}, legacyV: {} };
                const hs = opts.variants.map(async (v) => {
                    row.variants[v.name] = await runH55(c, v);
                    const p = await addPost(c, row.variants[v.name]); if (p) row.variants[v.name + '+post'] = p;
                });
                const lg = opts.skipLegacy ? Promise.resolve(undefined) : (async () => {
                    row.legacy = await runLegacy(c);
                    const p = await addPost(c, row.legacy); if (p) row.legacyV!['legacy+post'] = p;
                    for (const lv of opts.legacyVariants || []) {
                        if (!c.legacyWith) break;
                        const u = lv.userTransform ? lv.userTransform(c.userPrompt) : c.userPrompt;
                        row.legacyV![lv.name] = await runLegacy(c, () => c.legacyWith!(u), lv.outputTransform);
                        const p2 = await addPost(c, row.legacyV![lv.name]); if (p2) row.legacyV![lv.name + '+post'] = p2;
                    }
                })();
                await Promise.all([...hs, lg]);
                log(`  ${c.purpose}#${idx}.${round} ${row.legacy ? `legacy ${row.legacy.ok ? (row.legacy.pass ? 'PASS' : 'FAIL') : 'ERR'} ${((row.legacy.ms || 0) / 1000).toFixed(1)}s` : ''} | ` + Object.entries(row.variants).filter(([n]) => !n.endsWith('+post')).map(([n, s]) => `${n} ${s.ok ? (s.pass ? 'PASS' : 'FAIL') : 'ERR'} ${(s.ms / 1000).toFixed(1)}s`).join(' | ') + (Object.keys(row.legacyV || {}).filter((k) => !k.endsWith('+post')).length ? ' | ' + Object.entries(row.legacyV!).filter(([n]) => !n.endsWith('+post')).map(([n, s]) => `${n} ${s.ok ? (s.pass ? 'PASS' : 'FAIL') : 'ERR'}`).join(' ') : ''));
                return row;
            });
        }
    });
    const rows: Row[] = [];
    let next = 0;
    const workers = Array.from({ length: opts.concurrency ?? 3 }, async () => { while (next < jobs.length) { const j = jobs[next++]; rows.push(await j()); } });
    await Promise.all(workers);
    return rows.sort((a, b) => a.idx - b.idx || a.round - b.round);
}

const pct = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export interface Summary { purpose: string; variant: string; n: number; legacyPass: string; h55Pass: string; perLang: Record<string, string>; legacyP50: number | null; legacyP95: number | null; h55P50: number | null; h55P95: number | null; legacyOut: number | null; h55Out: number | null; legacyCost: number | null; h55Cost: number | null; legacyFail: Record<string, number>; h55Fail: Record<string, number>; cut: number; refusal: number }

export function summarize(rows: Row[], variant: string, legacyKey = 'legacy'): Summary {
    const purpose = rows[0]?.purpose || '';
    const L = (r: Row): Side | undefined => (legacyKey === 'legacy' ? r.legacy : r.legacyV?.[legacyKey]);
    const h = (r: Row) => r.variants[variant];
    const cnt = (xs: Row[], f: (r: Row) => boolean) => `${xs.filter(f).length}/${xs.length}`;
    const failMap = (side: (r: Row) => Side | undefined) => {
        const m: Record<string, number> = {};
        for (const r of rows) { const s = side(r); if (!s) continue; if (!s.ok) { m['call-failed'] = (m['call-failed'] || 0) + 1; continue; } for (const re of s.eval?.reasons || []) { const k = re.replace(/[:=].*$/, '') + (re.match(/^(ko|en|ja):/) ? ':' + re.split(':')[1] : ''); m[k] = (m[k] || 0) + 1; } }
        return m;
    };
    const perLang: Record<string, string> = {};
    for (const l of ['ko', 'en', 'ja'] as const) {
        const lg = rows.filter((r) => L(r)?.ok && L(r)!.perLang).filter((r) => L(r)!.perLang![l]).length;
        const lt = rows.filter((r) => L(r)?.ok).length;
        const hg = rows.filter((r) => h(r)?.ok && h(r).perLang![l]).length;
        const ht = rows.filter((r) => h(r)?.ok).length;
        perLang[l] = `현행 ${lg}/${lt} · 5.5 ${hg}/${ht}`;
    }
    return {
        purpose, variant: legacyKey === 'legacy' ? variant : `${variant} (현행=${legacyKey})`, n: rows.length,
        legacyPass: cnt(rows.filter((r) => L(r)?.ok), (r) => !!L(r)!.pass), h55Pass: cnt(rows.filter((r) => h(r)?.ok), (r) => !!h(r).pass),
        perLang,
        legacyP50: pct(rows.filter((r) => L(r)?.ok).map((r) => L(r)!.ms), 0.5), legacyP95: pct(rows.filter((r) => L(r)?.ok).map((r) => L(r)!.ms), 0.95),
        h55P50: pct(rows.filter((r) => h(r)?.ok).map((r) => h(r).ms), 0.5), h55P95: pct(rows.filter((r) => h(r)?.ok).map((r) => h(r).ms), 0.95),
        legacyOut: avg(rows.filter((r) => L(r)?.ok).map((r) => L(r)!.usage?.output || 0)), h55Out: avg(rows.filter((r) => h(r)?.ok).map((r) => h(r).usage?.output || 0)),
        legacyCost: avg(rows.filter((r) => L(r)?.ok).map((r) => L(r)!.costUsd || 0)), h55Cost: avg(rows.filter((r) => h(r)?.ok).map((r) => h(r).costUsd || 0)),
        legacyFail: failMap((r) => L(r)), h55Fail: failMap((r) => h(r)),
        cut: rows.filter((r) => h(r)?.stop === 'max_tokens').length, refusal: rows.filter((r) => h(r)?.stop === 'refusal').length,
    };
}

export function printSummary(s: Summary): string {
    const f = (x: number | null) => (x == null ? '-' : (x / 1000).toFixed(1) + 's');
    const d = (x: number | null) => (x == null ? '-' : x.toFixed(5));
    return [
        `## ${s.purpose} · ${s.variant} — n=${s.n}`,
        `  가드 통과  현행 ${s.legacyPass} | 5.5 ${s.h55Pass}    언어별 ko[${s.perLang.ko}] en[${s.perLang.en}] ja[${s.perLang.ja}]`,
        `  응답 시간  현행 p50 ${f(s.legacyP50)} p95 ${f(s.legacyP95)} | 5.5 p50 ${f(s.h55P50)} p95 ${f(s.h55P95)}`,
        `  출력 토큰  현행 ${s.legacyOut?.toFixed(0)} | 5.5 ${s.h55Out?.toFixed(0)}   호출당 비용  현행 $${d(s.legacyCost)} | 5.5 $${d(s.h55Cost)}`,
        `  실패 사유  현행 ${JSON.stringify(s.legacyFail)} | 5.5 ${JSON.stringify(s.h55Fail)}   5.5 잘림 ${s.cut} 거절 ${s.refusal}`,
    ].join('\n');
}

export function dumpRows(file: string, rows: Row[]): void { fs.writeFileSync(file, JSON.stringify(rows)); }
