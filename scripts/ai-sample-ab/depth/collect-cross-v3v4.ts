/**
 * 크로스섹터 v3(Lambda·Sonnet 4.6) 대 v4(Vercel 라우트·Haiku 5.5 사다리) «같은 날» 수집 (2026-10-11) — 금요일(10/9) 마감 시계 + 운영 읽기 전용 실데이터.
 *   화면이 읽는 저장본은 두 곳이 만든다: AWS Lambda(v3) · Vercel 크론 POST(v4). 둘을 같은 입력 날(금요일)로 N 회씩 돌려 «저장 직전 briefData + 모델이 본 프롬프트»를 파일로 남긴다.
 *   채점은 compare-cross-v3v4.ts 가 한다(같은 잣대 — 가드·숫자 근거·keyLevels·칸 길이).
 *   저장은 하네스가 막는다(운영 저장본을 덮어쓰지 않는다). 비밀값은 임시 env 사본에서 process.env 로만 올린다(출력 없음).
 *   사용: collect-cross-v3v4.ts <ENVFILE> <v3|v4> [N=5]     출력: $OUT/cross-v3v4/<mode>.json (OUT 기본 ./depth-out)
 */
import path from 'node:path';
import { bootHarness, setClock, state, resetCaptured, runRoute, allowPostHosts } from '../core';
import { OUT, writeJson } from './lib';

const [envFile, mode, nArg] = process.argv.slice(2);
if (!envFile || (mode !== 'v3' && mode !== 'v4')) { console.error('usage: collect-cross-v3v4.ts <ENVFILE> <v3|v4> [N]'); process.exit(2); }
bootHarness({ envFile });
const BASE = 'https://www.signumhq.com';
const FRI_CLOSE = '2026-10-09T21:50:00Z';
const rounds = Number(nArg) || 5;
const outFile = path.join(OUT, 'cross-v3v4', `${mode}${process.env.TAG ? '.' + process.env.TAG : ''}.json`);

const promptOf = (body: any): string => {
    const m = Array.isArray(body?.messages) ? body.messages.find((x: any) => x.role === 'user') : null;
    const c = m?.content;
    return typeof c === 'string' ? c : Array.isArray(c) ? c.map((x: any) => x?.text || '').join('\n') : '';
};

async function collectV4() {
    allowPostHosts.push(/(^|\.)signumhq\.com$/);
    const { memoryStore } = await import('@/lib/ai/llmStore');
    const { LadderRungError } = await import('@/lib/ai/llmLadder');
    const secret = process.env.CRON_SECRET || '';
    const store = memoryStore();
    let lastPrompt = ''; let lastRaw = ''; let lastModel = '';
    state.realLadderDeps = {
        store,
        anthropicKey: () => 'server-side',
        hasAws: () => false,
        callAnthropic: async (c: { body: Record<string, unknown>; timeoutMs: number }) => {
            lastPrompt = promptOf(c.body);
            const res = await fetch(`${BASE}/api/admin/ai-ab`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ raw: { body: c.body, timeoutMs: c.timeoutMs } }), signal: AbortSignal.timeout(c.timeoutMs + 8000) });
            const j: any = await res.json();
            if (!j.ok) throw new LadderRungError(j.kind || 'network', j.closeSec || 0, String(j.detail || 'fail'));
            lastModel = String(c.body.model);
            lastRaw = typeof j.parsed?.text === 'string' ? j.parsed.text : JSON.stringify(j.parsed ?? '').slice(0, 20000);
            return { parsed: j.parsed, modelUsed: String(c.body.model) };
        },
        log: (lv: string, msg: string) => console.error(`   [${lv}] ${msg.slice(0, 160)}`),
    };
    const { POST } = await import('@/app/api/intel/cross-sector-brief/route');
    const warns: string[] = [];
    const origWarn = console.warn; console.warn = (...a: any[]) => { warns.push(a.map(String).join(' ')); origWarn(...a); };
    const out: any[] = [];
    for (let i = 0; i < rounds; i++) {
        resetCaptured(); warns.length = 0; setClock(FRI_CLOSE); lastPrompt = ''; lastRaw = ''; lastModel = '';
        const t0 = performance.now();   // 가짜 시계(Date.now)와 섞이지 않게 실제 단조 시계
        const r = await runRoute(POST, `${BASE}/api/intel/cross-sector-brief`, { method: 'POST' });
        setClock(null);
        const calls: any[] = []; for (const [k, v] of store.data) if (k.startsWith('llm:calls:')) for (const l of v as string[]) calls.push(JSON.parse(l));
        out.push({ round: i + 1, status: r.status, ms: Math.round(performance.now() - t0), error: r.body?.error, brief: r.body, prompt: lastPrompt, model: lastModel, lastCall: calls[calls.length - 1] ?? null, warns: warns.slice(0, 8) });
        console.error(`v4 #${i + 1} status=${r.status} ${Math.round(performance.now() - t0)}ms keyLevels=${(r.body?.structured?.outlook?.keyLevels || []).length}`);
        writeJson(outFile, { mode, rounds: out.length, runs: out });
        state.blocked = [];
    }
}

async function collectV3() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bedrock = require('@aws-sdk/client-bedrock-runtime');
    let firstPrompt = ''; const rawTexts: string[] = [];
    const origSend = bedrock.BedrockRuntimeClient.prototype.send;
    bedrock.BedrockRuntimeClient.prototype.send = async function (cmd: any) {
        try { const b = cmd?.input?.body; const j = JSON.parse(typeof b === 'string' ? b : new TextDecoder().decode(b)); if (!firstPrompt) firstPrompt = promptOf(j); } catch { /* 요청 본문을 못 읽어도 실행은 계속 */ }
        const r = await origSend.call(this, cmd);
        try { const j = JSON.parse(new TextDecoder().decode(r.body)); rawTexts.push(String(j?.content?.[0]?.text || '')); } catch { /* 무시 */ }
        return r;
    };
    const guarded = globalThis.fetch;
    let saved: any = null;
    (globalThis as any).fetch = async (input: any, init: any = {}) => {
        try {
            const url = typeof input === 'string' ? input : String(input?.url || input);
            if (String(init?.method || 'GET').toUpperCase() === 'POST' && /\/set$/.test(new URL(url).pathname) && typeof init.body === 'string') {
                const b = JSON.parse(init.body);
                if (String(b.key).startsWith('postmarket:cross-brief-v3:')) saved = b.value;
            } else if (String(init?.method || 'GET').toUpperCase() === 'POST' && /\/set\//.test(url) && typeof init.body === 'string') {
                const v = JSON.parse(init.body);
                if (v && v.structured && decodeURIComponent(url).includes('postmarket:cross-brief-v3:')) saved = saved || v;
            }
        } catch { /* 무시 */ }
        return guarded(input, init);
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const lambda = require(path.resolve('scripts/lambda-cross-sector/index.js'));
    const origLog = console.log; console.log = () => { /* Lambda 로그는 버린다 */ };
    const out: any[] = [];
    for (let i = 0; i < rounds; i++) {
        rawTexts.length = 0; saved = null; firstPrompt = '';
        setClock(FRI_CLOSE);
        const t0 = performance.now();
        const r = await lambda.handler({}, {});
        setClock(null);
        out.push({ round: i + 1, status: r?.statusCode, ms: Math.round(performance.now() - t0), brief: saved, prompt: firstPrompt, model: 'bedrock-sonnet-4.6', raw: rawTexts[rawTexts.length - 1] || '' });
        origLog(`v3 #${i + 1} status=${r?.statusCode} ${Math.round(performance.now() - t0)}ms keyLevels=${(saved?.structured?.outlook?.keyLevels || []).length}`);
        writeJson(outFile, { mode, rounds: out.length, runs: out });
    }
}

(async () => {
    await (mode === 'v4' ? collectV4() : collectV3());
    console.error(`saved ${outFile}`);
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
