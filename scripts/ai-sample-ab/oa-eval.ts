/**
 * OpenAI 후보 vs Haiku 5.5 — 운영 라우트의 실제 요청 입력(금요일 11/6 실데이터, 가짜 시계)·운영 출구 가드로 나란히 (2026-11-07).
 * 사용: oa-eval.ts <ENVFILE> <OUTDIR> <Purpose[,Purpose…]> [models csv]
 *   모델 호출은 운영 관리자 비교 엔드포인트(/api/admin/ai-ab adhoc)로 보낸다 — 키는 서버에만 있다. 로컬에는 CRON_SECRET 만.
 */
import fs from 'node:fs';
import path from 'node:path';
import { bootHarness, setClock, state, resetCaptured, runRoute, allowPostHosts, type Captured } from './core';
import { score } from './ab-lib';

const [envFile, outDir, purposesArg, modelsArg] = process.argv.slice(2);
bootHarness({ envFile });
// next/server after() — 요청 문맥 밖(스크립트)에서는 그냥 흘려보낸다(UC 라우트의 원장·계수 기록 — 쓰기는 하네스가 막는다)
{
    const M: any = require('node:module');
    const prev = M._load;
    M._load = function (request: string, ...rest: any[]) {
        const exp = prev.call(this, request, ...rest);
        if (request === 'next/server' && exp && !exp.__oaPatched) {
            const patched = Object.create(exp);
            Object.defineProperty(patched, 'after', { value: (fn: any) => { try { Promise.resolve(typeof fn === 'function' ? fn() : fn).catch(() => undefined); } catch { /* noop */ } } });
            Object.defineProperty(patched, '__oaPatched', { value: true });
            return patched;
        }
        return exp;
    };
}
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'https://www.signumhq.com';
const MODELS = (modelsArg || 'claude-haiku-5-5,gpt-6.1-sol@low,gpt-6.1-terra,gpt-6-luna,gpt-5.4-mini').split(',');
const FRI_CLOSE = '2026-11-06T22:30:00Z';   // 금 17:30 ET(서머타임 끝 — ET=UTC−5)
const FRI_PRE = '2026-11-06T13:30:00Z';     // 금 08:30 ET
const FRI_MID = '2026-11-06T16:00:00Z';     // 금 11:00 ET
const TICKERS = ['NVDA', 'TSLA', 'PLTR'];

interface Cfg { clock: string; rounds: number; max: number; build: () => Promise<void>; depth?: boolean; localeOf?: (c: Captured) => string | null }
const cfg: Record<string, Cfg> = {
    CrossSector: { clock: FRI_CLOSE, rounds: 3, max: 1, build: async () => { const { POST } = await import('@/app/api/intel/cross-sector-brief/route'); await runRoute(POST, `${BASE}/api/intel/cross-sector-brief`, { method: 'POST' }); } },
    MorningBriefing: { clock: FRI_PRE, rounds: 3, max: 1, build: async () => { const { POST } = await import('@/app/api/guardian/briefing/generate/route'); await runRoute(POST, `${BASE}/api/guardian/briefing/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) }); } },
    Guardian: { clock: FRI_MID, rounds: 1, max: 3, build: async () => {
        const { GuardianDataHub } = await import('@/services/guardian/unifiedDataStream');
        try { await GuardianDataHub.getGuardianSnapshot(true, 'ko'); } catch (e: any) { console.error('guardian', e?.message); }
    } },
    // 로컬은 EC2 프록시 키가 없어 배치 자료를 못 만든다 → 운영 /api/watchlist/batch?mode=price(크론이 쓰는 것과 같은 함수) 응답으로 같은 사실 빌더 → generateOne(사다리 입구에서 가로챔)
    WatchlistLine: { clock: 'real', rounds: 1, max: 3, build: async () => {
        const r = await fetch(`${BASE}/api/watchlist/batch?mode=price&tickers=${TICKERS.join(',')}`);
        const j: any = await r.json();
        const { buildLineFacts } = await import('@/lib/ai/watchlistLine');
        const { generateOne } = await import('@/services/watchlistAiLineService');
        for (const row of (j?.results || [])) {
            const f = buildLineFacts(String(row.ticker), row.realtime);
            console.error('  facts', row.ticker, !!f);
            if (f) { try { await generateOne(f); } catch (e: any) { console.error('wl', e?.message); } }
        }
    } },
    TodayPicks: { clock: 'real', rounds: 1, max: 3, build: async () => { const { GET } = await import('@/app/api/cron/today-picks/route'); await runRoute(GET as any, `${BASE}/api/cron/today-picks?force=1`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }); } },
    UC: { clock: 'real', rounds: 1, max: 9, depth: true, build: async () => {
        const { GET } = await import('@/app/api/undercurrent/ticker/route');
        for (const loc of ['ko', 'en', 'ja']) for (const t of TICKERS) { try { await runRoute(GET as any, `${BASE}/api/undercurrent/ticker?t=${t}&locale=${loc}&refresh=1`); } catch (e: any) { console.error('uc', t, loc, e?.message); } }
    } },
};

const ledgerMissed: string[] = [];   // 원장 기록이 빠진 호출 — 이번 회차의 병렬 호출을 다 받은 뒤 멈춘다(보정 범위를 빠짐없이 남긴다)
async function callModel(c: Captured, model: string, system: string): Promise<any> {
    const secret = process.env.CRON_SECRET || '';
    const wantsJson = !!(c.jsonPrefill || c.expectJson);
    const t0 = Date.now();
    const isOa = model.startsWith('gpt-');
    // «모델@effort» — 예: gpt-6.1-sol@low (sol 은 none 을 받지 않는다: 400 «Supported values are low…max»)
    const [mName, mEffort] = model.split('@');
    try {
        const res = await fetch(`${BASE}/api/admin/ai-ab`, {
            method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
            body: JSON.stringify({
                adhoc: { system, userPrompt: c.userPrompt, maxTokens: c.maxTokens, expectJson: c.expectJson === 'array' ? 'array' : wantsJson, timeoutMs: isOa ? 240_000 : 58_000, ...(isOa ? { model: mName, oaEffort: mEffort || 'none' } : {}) },
                effort: 'low', thinking: 'disabled', tag: 'oa-eval-1107',
            }),
            signal: AbortSignal.timeout(isOa ? 290_000 : 75_000),
        });
        if (!res.ok) return { ok: false, ms: Date.now() - t0, error: `HTTP ${res.status} ${(await res.text()).slice(0, 160)}` };
        const j: any = await res.json();
        // 옛 서버는 모르는 모델을 Haiku 로 바꿔 부른다 — 요청한 모델이 아니면 버린다
        if (j.h55?.ok && isOa && j.h55.model !== mName) return { ok: false, ms: j.h55.ms, error: `server-ran-${j.h55.model}` };
        // 원장 기록이 빠졌으면 그 뒤 유료 호출을 멈춘다(상한 판단이 실제보다 낮아진다) — 사람이 원장을 맞춘 뒤 다시 돌린다
        if (j.h55?.ledgerMissed) { ledgerMissed.push(`${model} $${j.h55.costUsd}`); }
        return j.h55;
    } catch (e: any) { return { ok: false, ms: Date.now() - t0, error: String(e?.message || e).slice(0, 160) }; }
}

(async () => {
    const { financeTermsRule } = await import('@/lib/ai/commonTerms');
    const { depthDirectiveFor } = await import('@/lib/ai/depthDirective');
    const { LADDER_PURPOSES } = await import('@/lib/ai/llmLadder');
    const all: any[] = [];
    for (const purpose of purposesArg.split(',')) {
        const c0 = cfg[purpose];
        setClock(c0.clock === 'real' ? null : c0.clock); resetCaptured();
        try { await c0.build(); } catch (e: any) { console.error(purpose, 'build error', e?.message); }
        setClock(null);
        const seen = new Set<string>(); const items: Captured[] = [];
        for (const x of state.captured) { if (x.purpose !== purpose) continue; const k = x.system + '\u0000' + x.userPrompt; if (seen.has(k)) continue; seen.add(k); items.push(x); }
        const use = items.slice(0, c0.max);
        console.error(`\n### ${purpose}: 가로챈 ${state.captured.length}건 → ${purpose} ${items.length}건 중 ${use.length}건 × ${c0.rounds}회 · 막은 쓰기 ${state.blocked.length}건`);
        state.blocked = [];
        fs.writeFileSync(path.join(outDir, `inputs-${purpose}.json`), JSON.stringify(use.map((c) => ({ system: c.system, userPrompt: c.userPrompt, maxTokens: c.maxTokens, jsonPrefill: c.jsonPrefill, expectJson: c.expectJson, locale: c.locale }))));
        if (process.env.OA_DRY === '1') { for (const c of use) console.error(`   [${c.locale}] max ${c.maxTokens} json ${c.jsonPrefill || c.expectJson} sys ${c.system.length} user ${c.userPrompt.length} validate ${!!c.validate} · ${c.userPrompt.slice(0, 90).replace(/\s+/g, ' ')}`); continue; }
        state.allowLLM = true; allowPostHosts.push(/(^|\.)signumhq\.com$/);
        const lc = LADDER_PURPOSES[purpose];
        for (const [idx, c] of use.entries()) {
            let system = c.system;
            const ft = financeTermsRule(); if (system.includes(ft)) system = system.replace(ft, '');
            if (c0.depth && lc?.depth && (!lc.depthWhen || system.includes(lc.depthWhen)) && !system.includes('<depth_standard>')) system += depthDirectiveFor(purpose);
            for (let round = 0; round < (Number(process.env.OA_ROUNDS) || c0.rounds); round++) {
                const sides = await Promise.all(MODELS.map(async (m) => {
                    const h = await callModel(c, m, system);
                    if (!h?.ok) return { model: m, ok: false, ms: h?.ms ?? 0, error: h?.error };
                    const sc = await score(c, h.text, h.stop, !!h.refusal || h.stop === 'refusal', 'h55');
                    return { model: m, ok: true, ms: h.ms, usage: h.usage, costUsd: h.costUsd, stop: h.stop, ...sc };
                }));
                const row = { purpose, idx, round, locale: c.locale, head: c.userPrompt.slice(0, 100).replace(/\s+/g, ' '), sides };
                all.push(row);
                console.error(`  ${purpose}#${idx}.${round} [${c.locale}] ` + sides.map((s: any) => `${s.model.replace('claude-', '')} ${s.ok ? (s.pass ? 'PASS' : 'FAIL') : 'ERR'} ${(s.ms / 1000).toFixed(1)}s`).join(' | '));
                fs.writeFileSync(path.join(outDir, `rows-${purpose}.json`), JSON.stringify(all.filter((r) => r.purpose === purpose)));
                if (ledgerMissed.length) { console.error(`FATAL 원장 누락 ${ledgerMissed.length}건 — ${ledgerMissed.join(', ')} · 원장 보정 후 다시 돌린다`); process.exit(2); }
            }
        }
        state.allowLLM = false;
    }
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
