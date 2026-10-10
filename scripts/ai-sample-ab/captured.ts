/**
 * 운영이 실제로 모델에 보낸 요청(캡처 스위치가 켜진 동안 Redis llm:cap:{용도} 에 보관 — 읽기 전용)을 불러온다.
 * 라우트를 로컬에서 돌릴 수 없는 용도(화면이 계산한 flowData 가 필요한 플로우 AI 등)와 Guardian 처럼 캐시·락이 얽힌 용도에 쓴다.
 */
import crypto from 'node:crypto';
import { InvokeModelCommand, BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import type { Captured } from './core';

export async function loadCaptured(purpose: string, max = 30): Promise<Captured[]> {
    const { upstashStore } = await import('@/lib/ai/llmStore');
    const { LLM_KEYS } = await import('@/lib/ai/llmLadder');
    const raw = await upstashStore.lrange(LLM_KEYS.capList(purpose), 0, 39);
    const seen = new Set<string>(); const out: Captured[] = [];
    for (const line of raw) {
        try {
            const c = JSON.parse(line);
            const h = crypto.createHash('sha1').update(c.system + '\u0000' + c.userPrompt).digest('hex');
            if (seen.has(h)) continue; seen.add(h);
            out.push({
                purpose, system: c.system, userPrompt: c.userPrompt, maxTokens: c.maxTokens, temperature: c.temperature ?? null,
                jsonPrefill: !!c.jsonPrefill, expectJson: c.expectJson ?? null, locale: c.locale ?? null, timeoutMs: null,
                legacy: async () => legacyCall({ system: c.system, userPrompt: c.userPrompt, maxTokens: c.maxTokens, temperature: c.temperature ?? 0.3, jsonPrefill: !!c.jsonPrefill }),
                legacyWith: async (u: string) => legacyCall({ system: c.system, userPrompt: u, maxTokens: c.maxTokens, temperature: c.temperature ?? 0.3, jsonPrefill: !!c.jsonPrefill }),
                meta: { capturedAt: new Date(c.t).toISOString() },
            });
        } catch { /* skip */ }
        if (out.length >= max) break;
    }
    return out;
}

let _client: BedrockRuntimeClient | null = null;
const bedrock = () => (_client ||= new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! },
    maxAttempts: 1,
}));

/** 현행 호출 재현(callBedrock 의 legacy 와 같은 모델·프로필 순서·프리필·temperature) */
export async function legacyCall(o: { system: string; userPrompt: string; maxTokens: number; temperature: number; jsonPrefill: boolean }) {
    const profiles = ['global.anthropic.claude-haiku-4-5-20251001-v1:0', 'us.anthropic.claude-haiku-4-5-20251001-v1:0'];
    let last: any;
    for (let attempt = 0; attempt < 4; attempt++) {
        const modelId = profiles[attempt % 2];
        try {
            const messages: any[] = [{ role: 'user', content: o.userPrompt }];
            if (o.jsonPrefill) messages.push({ role: 'assistant', content: '{' });
            const res = await Promise.race([
                bedrock().send(new InvokeModelCommand({
                    modelId, contentType: 'application/json', accept: 'application/json',
                    body: JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: o.maxTokens, temperature: o.temperature, system: o.system, messages }),
                })),
                new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout 55s')), 55_000)),
            ]);
            const body = JSON.parse(new TextDecoder().decode((res as any).body));
            let text = (body.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
            if (o.jsonPrefill) text = '{' + text;
            const u = body.usage || {};
            return { text, model: 'claude-haiku-4.5', priceModel: 'haiku-4.5', truncated: body.stop_reason === 'max_tokens', usage: { input: Number(u.input_tokens) || 0, output: Number(u.output_tokens) || 0, cacheWrite: Number(u.cache_creation_input_tokens) || 0, cacheRead: Number(u.cache_read_input_tokens) || 0 } };
        } catch (e: any) {
            last = e;
            if (!/Throttl|Too many|timeout/i.test(String(e?.name) + String(e?.message))) throw e;
            await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
        }
    }
    throw last;
}
