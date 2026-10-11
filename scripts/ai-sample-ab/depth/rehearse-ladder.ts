/**
 * 사다리 리허설 — «진짜 runLadder + 이 브랜치의 LADDER_PURPOSES(Sonnet 단·깊이 지시문·일일 상한)»로 금요일 실입력을 끝까지 돌린다.
 *   ① 크레딧 호출은 서버 관리자 raw 통과(요청 본문 그대로, 모델 허용 목록 Haiku 5.5·Sonnet 5.5) · ② 닫힘 · ③ 현행은 실제 Bedrock Haiku 4.5
 *   저장소는 메모리(운영 원장·기록에 쓰지 않는다 — 단 raw 통과 호출의 비용은 서버가 월 원장에 센다)
 *   사용: rehearse-ladder.ts <ENVFILE> <Purpose> [N] [rounds]
 * 보는 것: 어느 단이 답했나(provider) · 시도 기록(trail) · 가드 통과 · 시간 · 비용 · 깊이 지시문 부착(dp) · Sonnet 일일 상한 동작
 */
import path from 'node:path';
import { loadEnvFile } from '../core';
import { OUT, readJson, pool, type Sample } from './lib';
import { gateFor } from './gates';
import { legacyCall } from '../captured';

const [envFile, purpose, nArg, roundsArg] = process.argv.slice(2);
loadEnvFile(envFile);
const BASE = 'https://www.signumhq.com';

(async () => {
    const { memoryStore } = await import('@/lib/ai/llmStore');
    const { runLadder, LadderRungError, LLM_KEYS, hourId } = await import('@/lib/ai/llmLadder');
    const { parseMessageResponse } = await import('@/lib/ai/llmRequest');
    const secret = process.env.CRON_SECRET || '';
    const store = memoryStore();
    const samples = readJson<Sample[]>(path.join(OUT, 'samples', `${purpose}.json`)).slice(0, Number(nArg) || 5);
    const rounds = Number(roundsArg) || 1;
    const deps = {
        store,
        anthropicKey: () => 'server-side',
        hasAws: () => false,
        callAnthropic: async (c: { body: Record<string, unknown>; timeoutMs: number }) => {
            const res = await fetch(`${BASE}/api/admin/ai-ab`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify({ raw: { body: c.body, timeoutMs: c.timeoutMs } }), signal: AbortSignal.timeout(c.timeoutMs + 8000) });
            const j: any = await res.json();
            if (!j.ok) throw new LadderRungError(j.kind || 'network', j.closeSec || 0, String(j.detail || 'fail'));
            return { parsed: j.parsed, modelUsed: String(c.body.model) };
        },
        log: (lv: string, msg: string) => console.error(`   [${lv}] ${msg.slice(0, 160)}`),
    };
    void parseMessageResponse;
    const jobs = samples.flatMap((s) => Array.from({ length: rounds }, (_, r) => ({ s, r })));
    const rows = await pool(jobs, 3, async ({ s, r }) => {
        const validate = await gateFor(s);
        const t0 = Date.now();
        try {
            const o = await runLadder(
                { purpose: s.purpose, system: s.system, userPrompt: s.userPrompt, maxTokens: s.maxTokens, expectJson: s.expectJson === true ? true : undefined, jsonPrefill: s.expectJson === true, locale: s.locale, timeoutMs: 55_000, validate },
                async (ctx) => {
                    const r2 = await legacyCall({ system: s.system, userPrompt: s.userPrompt, maxTokens: s.maxTokens, temperature: 0.3, jsonPrefill: true });
                    return { text: r2.text, model: r2.model, priceModel: r2.priceModel as 'haiku-4.5', usage: r2.usage, truncated: r2.truncated };
                },
                deps as any,
            );
            console.error(`${s.id}.${r}: ${o.provider} ${o.trail.join('>')} ${((Date.now() - t0) / 1000).toFixed(1)}s $${o.costUsd.toFixed(4)}`);
            return { id: s.id, ok: true, provider: o.provider, trail: o.trail, ms: Date.now() - t0, cost: o.costUsd, model: o.model, text: o.text };
        } catch (e: any) {
            console.error(`${s.id}.${r}: THROW ${String(e?.message || e).slice(0, 120)}`);
            return { id: s.id, ok: false, provider: 'throw', trail: [], ms: Date.now() - t0, cost: 0, model: '', text: '' };
        }
    });
    const byProv: Record<string, number> = {};
    for (const x of rows) byProv[x.provider] = (byProv[x.provider] || 0) + 1;
    const ms = rows.filter((x) => x.ok).map((x) => x.ms).sort((a, b) => a - b);
    const calls: any[] = [];
    for (const [k, v] of store.data) if (k.startsWith('llm:calls:')) for (const l of v) calls.push(JSON.parse(l));
    const spent = calls.reduce((a, c) => a + (c.c || 0), 0);
    console.log(JSON.stringify({
        purpose, n: rows.length, providers: byProv, answered: rows.filter((x) => x.ok).length,
        p50: ms[Math.floor(ms.length / 2)], p95: ms[Math.min(ms.length - 1, Math.ceil(0.95 * ms.length) - 1)],
        costMean: rows.reduce((a, x) => a + x.cost, 0) / Math.max(1, rows.length), ledgerSpend: spent,
        depthMarked: calls.filter((c) => c.dp).length, guardPass: calls.filter((c) => c.g === 1).length, guardFail: calls.filter((c) => c.g === 0).length,
        trails: rows.map((x) => x.trail.join('>')).reduce((m: Record<string, number>, t) => { m[t] = (m[t] || 0) + 1; return m; }, {}),
        sonnetDayUsd: Number(store.data.get(LLM_KEYS.sonnetDay(new Date().toISOString().slice(0, 10).replace(/-/g, '')))) || 0,
    }, null, 1));
    void hourId;
    process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
