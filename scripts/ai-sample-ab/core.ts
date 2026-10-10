/**
 * 주말·휴장에도 «실제 요청 입력»으로 현행(Bedrock Haiku 4.5)과 Haiku 5.5 를 나란히 비교하는 하네스 (2026-10-10).
 *
 * 입력을 손으로 쓰지 않는다 — 운영 라우트의 핸들러(POST/GET)를 «그대로» 실행해서, 그 라우트가 모델에 보내려던 요청을
 * 가로챈다(runLadder 입구를 갈아 끼움). 라우트가 읽는 데이터(Redis·FMP·Polygon·Supabase·운영 API)는 실제 값이다.
 *
 * 쓰기는 전부 막는다(안전망 4겹):
 *   ① redisClient.setInCache/deleteFromCache/setNegativeCache = 기록만 하는 빈 함수
 *   ② fetch 가드 — Upstash REST·EC2 프록시의 쓰기 명령, Supabase 의 POST/PATCH/PUT/DELETE, 그 밖 호스트의 비-GET 은 막고 센다
 *   ③ 모델 호출은 가로채기 단계에서 막는다(LLM 호스트는 allowLLM 이 켜진 비교 단계에서만 통과)
 *   ④ 비밀값(env)은 임시 파일에서 읽어 process.env 에만 올린다. 출력·로그에 쓰지 않는다.
 *
 * 실행: node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true,"jsx":"react-jsx"}' scripts/ai-sample-ab/<driver>.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// ─────────────────────────────────────────────────────────────────────────────
// 환경
// ─────────────────────────────────────────────────────────────────────────────
export function loadEnvFile(file: string): number {
    let n = 0;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!m) continue;
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        v = v.replace(/\\n/g, '\n');
        if (process.env[m[1]] === undefined) { process.env[m[1]] = v; n++; }
    }
    return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// 상태
// ─────────────────────────────────────────────────────────────────────────────
export interface Captured {
    purpose: string;
    system: string;          // 모델이 받는 완성된 system (날짜 앵커 + 금융 공통어 + 호출 지점 system)
    userPrompt: string;
    maxTokens: number;
    temperature: number | null;
    jsonPrefill: boolean;
    expectJson: boolean | 'array' | null;
    locale: string | null;
    timeoutMs: number | null;
    validate?: (text: string) => any;
    legacy: (ctx: { elapsedMs: number }) => Promise<any>;
    /** 같은 호출을 다른 userPrompt 로 — 현행에도 입력 변형을 적용해 볼 때(캡처 입력 한정) */
    legacyWith?: (userPrompt: string) => Promise<any>;
    meta?: Record<string, unknown>;
}
export const state = {
    captured: [] as Captured[],
    blocked: [] as string[],
    allowLLM: false,
    stopAfterCapture: true,
    /** 리허설: 켜져 있으면 runLadder 를 가로채지 않고 «진짜 runLadder»를 이 deps 로 실행한다(쓰기·크레딧 호출은 deps 가 막고 서버로 보낸다) */
    realLadderDeps: null as null | Record<string, unknown>,
    redisWritesNoop: 0,
};
export class CaptureStop extends Error { constructor() { super('capture-stop'); this.name = 'CaptureStop'; } }

// ─────────────────────────────────────────────────────────────────────────────
// fetch 가드
// ─────────────────────────────────────────────────────────────────────────────
const READ_CMDS = new Set(['GET', 'MGET', 'LRANGE', 'EXISTS', 'TTL', 'PTTL', 'HGET', 'HGETALL', 'HMGET', 'ZRANGE', 'ZSCORE', 'ZCARD', 'ZREVRANGE', 'SCARD', 'SMEMBERS', 'SISMEMBER', 'KEYS', 'SCAN', 'STRLEN', 'LLEN', 'TYPE', 'DBSIZE', 'PING', 'HLEN', 'HEXISTS', 'ZRANGEBYSCORE', 'ZREVRANGEBYSCORE', 'LINDEX']);
const LLM_HOSTS = [/(^|\.)anthropic\.com$/, /bedrock/i, /amazonaws\.com$/];

export function installFetchGuard(): void {
    const real = globalThis.fetch;
    const upstashHost = (() => { try { return new URL(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || 'http://x').host; } catch { return ''; } })();
    const ecHost = (() => { try { return new URL(process.env.EC2_REDIS_PROXY_URL || 'http://52.23.98.13:8081').host; } catch { return ''; } })();
    const fake = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    (globalThis as any).fetch = async (input: any, init: any = {}) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : String(input?.url || input);
        const method = String(init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input?.method : '') || 'GET').toUpperCase();
        let host = ''; let pathname = '';
        try { const u = new URL(url); host = u.host; pathname = u.pathname; } catch { /* relative */ }

        if (LLM_HOSTS.some((re) => re.test(host.replace(/:\d+$/, '')))) {
            if (state.allowLLM) return real(input, init);
            state.blocked.push(`LLM ${method} ${host}`);
            return fake({ error: 'blocked-by-harness' });
        }
        if (host && host === upstashHost) {
            // Upstash REST — 본문이 명령 배열(또는 배열의 배열 = pipeline)
            let body: any = null;
            try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : null; } catch { /* fallthrough */ }
            const cmds: any[][] = Array.isArray(body) ? (Array.isArray(body[0]) ? body : [body]) : [];
            if (cmds.length === 1) { for (const o of readOverrides) { const r = o(cmds[0]); if (r) return fake(Array.isArray(body) && Array.isArray(body[0]) ? [{ result: r.value }] : { result: r.value }); } }
            const isRead = method === 'GET' ? !/\/(set|del|incr|expire|rpush|lpush|ltrim|hset|zadd|sadd)/i.test(pathname) : cmds.length > 0 && cmds.every((c) => READ_CMDS.has(String(c?.[0] || '').toUpperCase()));
            if (isRead) return real(input, init);
            state.blocked.push(`UPSTASH-WRITE ${cmds.map((c) => String(c?.[0])).join(',') || method + pathname}`);
            return fake(Array.isArray(body) && Array.isArray(body[0]) ? body.map(() => ({ result: 'OK' })) : { result: 'OK' });
        }
        if (host && host === ecHost) {
            if (method === 'GET' && /^\/(get|mget)/.test(pathname)) return real(input, init);
            state.blocked.push(`EC-PROXY ${method} ${pathname}`);
            return fake({ ok: true });
        }
        if (/supabase\.co$/.test(host)) {
            if (method === 'GET' || method === 'HEAD') return real(input, init);
            state.blocked.push(`SUPABASE ${method} ${pathname.slice(0, 40)}`);
            return fake([]);
        }
        if (method === 'GET' || method === 'HEAD') return real(input, init);
        // 그 밖 호스트의 비-GET: 읽기 전용 POST 일 수도 있으나(예: GraphQL) 일단 막고 센다 — 드라이버가 필요하면 allowPostHosts 로 연다
        if (allowPostHosts.some((re) => re.test(host))) return real(input, init);
        state.blocked.push(`POST-BLOCKED ${method} ${host}${pathname.slice(0, 40)}`);
        return fake({});
    };
}
export const allowPostHosts: RegExp[] = [];
/** 읽기 가로채기(예: 이 키는 «없다»고 답한다) — 값이 있는 쪽을 못 쓰는 상황을 만들어 그 아래 경로(번역 대체 등)의 실제 요청을 얻을 때 */
export const readOverrides: Array<(cmd: any[]) => { value: unknown } | undefined> = [];

// ─────────────────────────────────────────────────────────────────────────────
// 가짜 시계 — 주말에 «금요일 장 마감 후»로 라우트를 돌린다 (new Date()·Date.now() 만 움직인다)
// ─────────────────────────────────────────────────────────────────────────────
let _clockBase: number | null = null;
let _clockT0 = 0;
let _clockInstalled = false;
/** 가짜 시계를 켠다/바꾼다. null 이면 실제 시계. 라우트마다 «그 크론이 도는 시각»을 흉내 낼 때 쓴다. */
export function setClock(fakeIsoOrNull: string | null): void {
    const RealDate: DateConstructor = (setClock as any)._real || Date;
    (setClock as any)._real = RealDate;
    _clockBase = fakeIsoOrNull ? RealDate.parse(fakeIsoOrNull) : null;
    _clockT0 = RealDate.now();
    if (_clockInstalled) return;
    _clockInstalled = true;
    const nowFake = () => (_clockBase == null ? RealDate.now() : _clockBase + (RealDate.now() - _clockT0));
    class FakeDate extends RealDate {
        constructor(...a: any[]) {
            if (a.length === 0) super(nowFake()); else super(...(a as [any]));
        }
        static now() { return nowFake(); }
    }
    (globalThis as any).Date = FakeDate;
}
export function installClock(fakeIsoOrNull: string | null): void { setClock(fakeIsoOrNull); }

// ─────────────────────────────────────────────────────────────────────────────
// 모듈 갈아 끼우기 — 해석된 파일 경로로 판정한다(상대·별칭 import 모두)
// ─────────────────────────────────────────────────────────────────────────────
const srcDir = path.join(__dirname, '..', '..', 'src');
const target = (rel: string) => path.join(srcDir, rel);
const wrapped = new Map<string, any>();

function withEsModule(obj: any, orig: any): any {
    Object.defineProperty(obj, '__esModule', { value: true });
    void orig;
    return obj;
}

let realRunLadder: ((req: any, legacy: any, deps?: any) => Promise<any>) | null = null;

export function installModuleHooks(): void {
    const M: any = Module;
    const origLoad = M._load;
    const resolve = M._resolveFilename;
    const stubRunLadder = async (req: any, legacy: any) => {
        if (state.realLadderDeps && realRunLadder) return realRunLadder(req, legacy, state.realLadderDeps as any);
        state.captured.push({
            purpose: req.purpose, system: req.system, userPrompt: req.userPrompt, maxTokens: req.maxTokens,
            temperature: req.temperature ?? null, jsonPrefill: !!req.jsonPrefill, expectJson: req.expectJson ?? null,
            locale: req.locale ?? null, timeoutMs: req.timeoutMs ?? null, validate: req.validate, legacy,
        });
        throw new CaptureStop();
    };
    M._load = function (request: string, parent: any, isMain: boolean) {
        // 요청 범위 밖에서 Supabase(읽기 전용 조회)가 쿠키를 읽으려 한다 — 빈 쿠키 저장소를 준다(로그인 없는 익명 읽기와 같다)
        if (request === 'next/headers') {
            if (!wrapped.has('next/headers')) {
                const jar = { getAll: () => [], get: () => undefined, set: () => undefined, has: () => false };
                wrapped.set('next/headers', withEsModule({ cookies: async () => jar, headers: async () => new Headers() }, null));
            }
            return wrapped.get('next/headers');
        }
        const exp = origLoad.apply(this, arguments as any);
        let fn = '';
        try { fn = resolve.call(this, request, parent, isMain); } catch { return exp; }
        const stripped = fn.replace(/\.(ts|tsx|js)$/, '');
        const hit = (rel: string) => stripped === target(rel);
        if (hit('lib/ai/llmLadder')) {
            if (!wrapped.has(fn)) { realRunLadder = exp.runLadder; wrapped.set(fn, withEsModule({ ...exp, runLadder: stubRunLadder }, exp)); }
            return wrapped.get(fn);
        }
        if (hit('services/redisClient')) {
            if (!wrapped.has(fn)) {
                const noop = async () => { state.redisWritesNoop++; return true; };
                wrapped.set(fn, withEsModule({ ...exp, setInCache: noop, deleteFromCache: noop, setNegativeCache: noop }, exp));
            }
            return wrapped.get(fn);
        }
        return exp;
    };
}

export function resetCaptured(): void { state.captured = []; }

export async function runRoute(fn: (req: Request) => Promise<Response>, url: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
    const res = await fn(new Request(url, init));
    let body: any = null; try { body = await res.json(); } catch { /* noop */ }
    return { status: res.status, body };
}

export function bootHarness(opts: { envFile: string; fakeNowIso?: string | null }): void {
    const n = loadEnvFile(opts.envFile);
    (process.env as any).NODE_ENV = 'development';
    process.env.BEDROCK_MIN_GAP_MS = process.env.BEDROCK_MIN_GAP_MS || '7000';       // 분당 10건 한도에 맞춘 간격(이 프로세스 안)
    process.env.BEDROCK_RATE_MAX_WAIT_MS = process.env.BEDROCK_RATE_MAX_WAIT_MS || '900000';
    installFetchGuard();
    installModuleHooks();
    installClock(opts.fakeNowIso ?? null);
    console.error(`[harness] env ${n} vars loaded (names only counted) · clock ${opts.fakeNowIso || 'real'}`);
}

export function saveSamples(file: string, items: Captured[], extra: Record<string, unknown> = {}): void {
    const slim = items.map((c) => ({
        purpose: c.purpose, system: c.system, userPrompt: c.userPrompt, maxTokens: c.maxTokens, temperature: c.temperature,
        jsonPrefill: c.jsonPrefill, expectJson: c.expectJson, locale: c.locale, timeoutMs: c.timeoutMs, meta: c.meta ?? {}, ...extra,
    }));
    fs.writeFileSync(file, JSON.stringify(slim));
}
