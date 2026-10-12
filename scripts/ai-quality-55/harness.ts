/**
 * aiq55 전·후 시험 하네스 (2026-10-12) — 운영 라우트 핸들러를 «그대로» 로컬에서 실행하고(진짜 runLadder), 새 입력 ON/OFF 만 바꿔 같은 입력으로 나란히 잰다.
 *
 *   · 입력은 운영 데이터다(레디스 읽기·운영 API 읽기). 쓰기는 전부 막는다(scripts/ai-sample-ab/core.ts 의 4겹 + 아래 캐시 숨김).
 *   · ① 크레딧 호출은 서버 관리자 raw 통과(/api/admin/ai-ab {raw})로 — 크레딧 키는 로컬에 없다. 시험 호출도 월 원장에 센다.
 *   · ③ 현행(Bedrock Haiku 4.5)은 라우트의 legacy 그대로(AWS 환경변수 임시 사본).
 *   · EC2 전용 키(finra:offexchange · ranking:*)는 로컬에서 프록시 키가 없어 읽히지 않는다 → 운영 공개 API 로 같은 값을 읽는 얇은 대체를 낀다(앱 코드는 안 바꾼다).
 *   · 캐시된 AI 글(ai-flow-analysis·ai-deep-analysis·cache:intel-analysis·undercurrent:ticker)은 숨겨 «생성»이 일어나게 한다.
 *
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' scripts/ai-quality-55/<driver>.ts <ENVFILE> ...
 * 비밀값은 어디에도 출력하지 않는다.
 */
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { bootHarness, state, allowPostHosts, runRoute } from '../ai-sample-ab/core';

export const BASE = 'https://www.signumhq.com';

const HIDE: RegExp[] = [/^ai-flow-analysis:/, /^ai-deep-analysis:/, /^cache:intel-analysis:/, /^undercurrent:ticker:/, /:swrlock$/];

let rankingMemo: { at: number; v: any } | null = null;
async function rankingFromProd(): Promise<any | null> {
    const now = Date.now();
    if (rankingMemo && now - rankingMemo.at < 300_000) return rankingMemo.v;
    try {
        const r = await fetch(`${BASE}/api/ranking?run=all`, { signal: AbortSignal.timeout(20_000) });
        const j = r.ok ? await r.json() : null;
        rankingMemo = { at: now, v: j };
        return j;
    } catch { return null; }
}

const wrappedExt = new Map<string, any>();
/** runLadder 입구에서 본 요청(①을 거치지 않은 현행 단 응답의 «근거 입력»을 위해) */
export const ladderReqs: Array<{ purpose: string; system: string; user: string }> = [];

export function installExtraHooks(): void {
    const M: any = Module;
    const prev = M._load;
    const resolve = M._resolveFilename;
    const srcDir = path.join(__dirname, '..', '..', 'src');
    M._load = function (request: string, parent: any, isMain: boolean) {
        const exp = prev.apply(this, arguments as any);
        let fn = '';
        try { fn = resolve.call(this, request, parent, isMain); } catch { return exp; }
        const stripped = fn.replace(/\.(ts|tsx|js)$/, '');
        if (stripped === path.join(srcDir, 'services/redisClient')) {
            if (!wrappedExt.has(fn)) {
                const g0 = exp.getFromCache, m0 = exp.mgetFromCache;
                const get = async (k: string) => {
                    if (HIDE.some((re) => re.test(k))) return null;
                    if (k === 'ranking:v9:all:30:5') return rankingFromProd();
                    return g0(k);
                };
                const mget = async (ks: string[]) => {
                    const out = await m0(ks.map((k) => (HIDE.some((re) => re.test(k)) || k === 'ranking:v9:all:30:5' ? '__hidden__' : k)));
                    return Promise.all(ks.map(async (k, i) => (k === 'ranking:v9:all:30:5' ? rankingFromProd() : HIDE.some((re) => re.test(k)) ? null : out[i])));
                };
                const o = Object.create(Object.getPrototypeOf(exp));
                Object.defineProperties(o, Object.getOwnPropertyDescriptors(exp));
                Object.defineProperty(o, 'getFromCache', { value: get, enumerable: true, configurable: true, writable: true });
                Object.defineProperty(o, 'mgetFromCache', { value: mget, enumerable: true, configurable: true, writable: true });
                wrappedExt.set(fn, o);
            }
            return wrappedExt.get(fn);
        }
        if (stripped === path.join(srcDir, 'lib/ai/llmLadder')) {
            if (!wrappedExt.has(fn)) {
                const run0 = exp.runLadder;
                const o = Object.create(Object.getPrototypeOf(exp));
                Object.defineProperties(o, Object.getOwnPropertyDescriptors(exp));
                Object.defineProperty(o, 'runLadder', { value: async (req: any, legacy: any, deps?: any) => { ladderReqs.push({ purpose: String(req?.purpose), system: String(req?.system ?? ''), user: String(req?.userPrompt ?? '') }); return run0(req, legacy, deps); }, enumerable: true, configurable: true, writable: true });
                wrappedExt.set(fn, o);
            }
            return wrappedExt.get(fn);
        }
        if (stripped === path.join(srcDir, 'services/darkPool')) {
            if (!wrappedExt.has(fn)) {
                const row = async (t: string) => {
                    try {
                        const r = await fetch(`${BASE}/api/flow/dark-pool?t=${encodeURIComponent(t)}`, { signal: AbortSignal.timeout(8000) });
                        const j: any = await r.json();
                        if (!j?.available) return null;
                        const { available, attribution, basis, ...rest } = j; void available; void attribution; void basis;
                        return rest;
                    } catch { return null; }
                };
                const o = Object.create(Object.getPrototypeOf(exp));
                Object.defineProperties(o, Object.getOwnPropertyDescriptors(exp));
                const def = (name: string, fn2: any) => Object.defineProperty(o, name, { value: fn2, enumerable: true, configurable: true, writable: true });
                def('getDarkPool', async (t: string) => row(String(t).toUpperCase()));
                def('getDarkPoolChecked', async (t: string) => ({ ok: true, row: await row(String(t).toUpperCase()) }));
                wrappedExt.set(fn, o);
            }
            return wrappedExt.get(fn);
        }
        return exp;
    };
}

export interface RunRecord {
    surface: string; mode: 'off' | 'on'; ticker: string; locale: string;
    status: number; wallMs: number; body: any;
    ladder: any[];          // llm:calls 기록(이 실행 몫)
    requests: Array<{ model: string; system: string; user: string; ms: number; text?: string; usage?: any }>;   // ① 요청(마지막이 최종)
    entry: Array<{ purpose: string; system: string; user: string }>;                                      // runLadder 입구 요청(현행 단이 답한 글의 근거 입력)
    warns: string[];
    error?: string;
}

export interface Runner {
    run(surface: string, mode: 'off' | 'on', ticker: string, locale: string, fn: () => Promise<{ status: number; body: any }>): Promise<RunRecord>;
    setMode(mode: 'off' | 'on'): void;
}

export async function boot(envFile: string): Promise<Runner> {
    bootHarness({ envFile });
    installExtraHooks();
    allowPostHosts.push(/(^|\.)signumhq\.com$/);
    state.allowLLM = true;
    const { memoryStore } = await import('@/lib/ai/llmStore');
    const { LadderRungError, A55_MODEL, LADDER_PURPOSES } = await import('@/lib/ai/llmLadder');
    const { _resetAiqMemoForTest } = await import('@/services/aiqContextService');
    const secret = process.env.CRON_SECRET || '';
    const store = memoryStore();
    let requests: RunRecord['requests'] = [];
    state.realLadderDeps = {
        store,
        anthropicKey: () => 'server-side',
        hasAws: () => false,
        allowlist: () => LADDER_PURPOSES,
        callAnthropic: async (c: { body: Record<string, any>; timeoutMs: number }) => {
            const t0 = Date.now();
            const res = await fetch(`${BASE}/api/admin/ai-ab`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ raw: { body: c.body, timeoutMs: c.timeoutMs } }), signal: AbortSignal.timeout(c.timeoutMs + 10_000) });
            const j: any = await res.json();
            requests.push({ model: String(c.body.model), system: String(c.body.system), user: String(c.body.messages?.[0]?.content ?? ''), ms: Date.now() - t0, text: String(j?.parsed?.text ?? '').slice(0, 20000), usage: j?.parsed?.usage });
            if (!j.ok) throw new LadderRungError(j.kind || 'network', j.closeSec || 0, String(j.detail || 'fail'));
            return { parsed: j.parsed, modelUsed: String(c.body.model || A55_MODEL) };
        },
        log: (lv: string, msg: string) => { if (lv !== 'info') console.error(`      [ladder:${lv}] ${msg.slice(0, 180)}`); },
    };
    const warns: string[] = [];
    const ow = console.warn; console.warn = (...a: any[]) => { warns.push(a.map(String).join(' ').slice(0, 300)); if (process.env.VERBOSE) ow(...a); };
    return {
        setMode(mode) { if (mode === 'off') process.env.AIQ55_OFF = '1'; else delete process.env.AIQ55_OFF; _resetAiqMemoForTest(); },
        async run(surface, mode, ticker, locale, fn) {
            this.setMode(mode);
            for (const k of [...store.data.keys()]) if (k.startsWith('llm:calls:')) store.data.delete(k);
            requests = []; warns.length = 0; ladderReqs.length = 0;
            const t0 = Date.now();
            let status = 0, body: any = null, error: string | undefined;
            try { const r = await fn(); status = r.status; body = r.body; } catch (e: any) { error = String(e?.message || e).slice(0, 200); }
            const wallMs = Date.now() - t0;
            const ladder: any[] = [];
            for (const [k, v] of store.data) if (k.startsWith('llm:calls:')) for (const l of v as string[]) ladder.push(JSON.parse(l));
            ladder.sort((a, b) => a.t - b.t);
            return { surface, mode, ticker, locale, status, wallMs, body, ladder, requests: [...requests], entry: ladderReqs.map((x) => ({ ...x })), warns: [...warns], ...(error ? { error } : {}) };
        },
    };
}

export { runRoute };
export const OUTDIR = process.env.OUT || '/Users/eunhoon/Documents/signum-work/research/DIFF-2026-10-12/raw';
export const write = (name: string, v: unknown) => { fs.mkdirSync(OUTDIR, { recursive: true }); fs.writeFileSync(path.join(OUTDIR, name), JSON.stringify(v)); };
