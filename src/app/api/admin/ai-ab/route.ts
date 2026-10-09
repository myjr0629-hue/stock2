/**
 * POST /api/admin/ai-ab — 품질 비교 (같은 실제 입력을 현행(Bedrock Haiku 4.5)과 Haiku 5.5(Anthropic API)로 나란히)
 *
 * 입력은 «운영이 실제로 보낸 프롬프트»다 — 사다리 입구가 캡처 스위치(llm:cap:on)가 켜진 동안 용도별로 보관한 것(llm:cap:{용도}, 4일).
 * 지어낸 입력은 쓰지 않는다. 캡처가 모자란 용도는 표본 수를 그대로 돌려준다(부족하다고 보고한다).
 *
 * 요청: { purpose, from?:0, count?:3, effort?:'low'|'medium'|'high', thinking?:'disabled', list?:true }
 *   list:true  → 보관된 입력 수·언어 분포만
 *   그 외      → from 부터 count 건을 돌린다(한 요청은 라우트 한도 60초 안 — 38초 넘으면 새 입력을 시작하지 않고 next 를 돌려준다)
 * 응답: 건별 { locale, legacy:{ms,usage,costUsd,chars,gate,text}, h55:{…, provider} } — 가드는 lib/ai/ladderGates.evaluateOutput 하나(두 모델에 같은 잣대).
 * 인증: Authorization: Bearer <CRON_SECRET>. 키 값은 응답·로그에 없다.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { adminAuthorized } from '@/lib/ai/adminAuth';
import { financeTermsRule } from '@/lib/ai/commonTerms';
import { evaluateOutput } from '@/lib/ai/ladderGates';
import { LLM_KEYS, defaultCallAnthropic, LadderRungError, TRACKED_PURPOSES } from '@/lib/ai/llmLadder';
import { shapeH55Body, type Effort } from '@/lib/ai/llmRequest';
import { costOf } from '@/lib/ai/llmPricing';
import { upstashStore } from '@/lib/ai/llmStore';
import { reserveBedrockSlot, BEDROCK_CLIENT_RETRY } from '@/services/bedrockRateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LEGACY_MODEL = 'global.anthropic.claude-haiku-4-5-20251001-v1:0';

interface Captured {
    t: number; purpose: string; system: string; userPrompt: string; maxTokens: number;
    temperature: number | null; jsonPrefill: boolean; locale: 'ko' | 'en' | 'ja' | 'multi' | null; expectJson?: boolean | 'array';
}

let _client: BedrockRuntimeClient | null = null;
const bedrock = () => (_client ||= new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! },
    ...BEDROCK_CLIENT_RETRY,
}));

const usageOf = (u: any) => ({ input: Number(u?.input_tokens) || 0, output: Number(u?.output_tokens) || 0, cacheWrite: Number(u?.cache_creation_input_tokens) || 0, cacheRead: Number(u?.cache_read_input_tokens) || 0 });

/** 현행 호출을 «그대로» 재현 — 같은 system·temperature·프리필 */
async function runLegacy(c: Captured) {
    const t0 = Date.now();
    try {
        const messages: any[] = [{ role: 'user', content: c.userPrompt }];
        if (c.jsonPrefill) messages.push({ role: 'assistant', content: '{' });
        await reserveBedrockSlot('ai-ab');
        const res = await Promise.race([
            bedrock().send(new InvokeModelCommand({
                modelId: LEGACY_MODEL, contentType: 'application/json', accept: 'application/json',
                body: JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: c.maxTokens, temperature: c.temperature ?? 0.3, system: c.system.includes('<finance_terms>') ? c.system : financeTermsRule() + c.system, messages }),
            })),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout 45s')), 45_000)),
        ]);
        const body = JSON.parse(new TextDecoder().decode(res.body));
        let text = (body.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        if (c.jsonPrefill) text = '{' + text;
        const usage = usageOf(body.usage);
        return { ok: true as const, ms: Date.now() - t0, text, usage, costUsd: costOf(usage, 'haiku-4.5'), stop: body.stop_reason || null };
    } catch (e: any) {
        return { ok: false as const, ms: Date.now() - t0, error: `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 160)}` };
    }
}

async function runH55(c: Captured, effort: Effort, expectJson: boolean | 'array', thinking?: 'disabled') {
    const t0 = Date.now();
    const key = (process.env.ANTHROPIC_API_KEY_CREDITS || '').trim();
    if (!key) return { ok: false as const, ms: 0, error: 'no-key' };
    try {
        const body = shapeH55Body('claude-haiku-5-5', {
            system: c.system, userPrompt: c.userPrompt, maxTokens: c.maxTokens,
            jsonPrefill: !!(c.jsonPrefill || expectJson), jsonArray: expectJson === 'array', effort, thinking,
        });
        const r = await defaultCallAnthropic({ body, timeoutMs: 45_000 }, key);
        const p = r.parsed;
        return {
            ok: true as const, ms: Date.now() - t0, text: p.text, usage: p.usage, costUsd: costOf(p.usage, 'haiku-5.5'),
            stop: p.stopReason, refusal: p.stopReason === 'refusal' ? (p.refusalCategory || 'refusal') : null, thinking: p.hadThinking,
        };
    } catch (e: any) {
        const re = e instanceof LadderRungError ? e : null;
        return { ok: false as const, ms: Date.now() - t0, error: re ? `${re.kind}: ${re.detail.slice(0, 160)}` : String(e?.message || e).slice(0, 160) };
    }
}

export async function POST(req: NextRequest) {
    if (!adminAuthorized(req.headers)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const purpose = String(body.purpose || '');
    if (!TRACKED_PURPOSES.includes(purpose)) return NextResponse.json({ error: 'unknown purpose', tracked: TRACKED_PURPOSES }, { status: 400 });

    const raw = await upstashStore.lrange(LLM_KEYS.capList(purpose), 0, 29);
    const seen = new Set<string>();
    const inputs: Captured[] = [];
    for (const line of raw) {
        try {
            const c = JSON.parse(line) as Captured;
            const h = crypto.createHash('sha1').update(c.system + '\u0000' + c.userPrompt).digest('hex');
            if (seen.has(h)) continue;
            seen.add(h); inputs.push(c);
        } catch { /* skip */ }
    }
    if (body.list) {
        const byLoc: Record<string, number> = {};
        for (const c of inputs) byLoc[c.locale || '?'] = (byLoc[c.locale || '?'] || 0) + 1;
        return NextResponse.json({ ok: true, purpose, captured: inputs.length, byLocale: byLoc, newestAt: inputs[0] ? new Date(inputs[0].t).toISOString() : null });
    }

    const from = Math.max(0, Number(body.from) || 0);
    const count = Math.min(5, Math.max(1, Number(body.count) || 3));
    const effort: Effort = body.effort === 'medium' || body.effort === 'high' ? body.effort : 'low';
    const thinking = body.thinking === 'disabled' ? 'disabled' as const : undefined;
    const started = Date.now();
    const results: any[] = [];
    let i = from;
    for (; i < Math.min(inputs.length, from + count); i++) {
        if (Date.now() - started > 38_000) break;
        const c = inputs[i];
        // JSON 기대 여부 — 캡처에 표지가 없으면 프리필·프롬프트로 추정
        const expectJson: boolean | 'array' = c.expectJson ?? (purpose === 'NewsDigest' ? 'array' : (c.jsonPrefill || /\bJSON\b/.test(c.userPrompt + c.system)));
        const [lg, hn] = await Promise.all([runLegacy(c), runH55(c, effort, expectJson, thinking)]);
        const source = c.userPrompt;
        const judge = (r: any) => (r.ok ? evaluateOutput({
            purpose, locale: c.locale, text: r.text, source, expectJson,
            truncated: r.stop === 'max_tokens', refusal: !!r.refusal,
        }) : { ok: false, reasons: [`call-failed:${r.error}`], chars: 0, jsonOk: null });
        results.push({
            i, locale: c.locale, capturedAt: new Date(c.t).toISOString(), promptChars: c.system.length + c.userPrompt.length,
            legacy: { ...lg, gate: judge(lg) },
            h55: { ...hn, gate: judge(hn) },
        });
    }
    return NextResponse.json({ ok: true, purpose, captured: inputs.length, from, next: i < inputs.length ? i : null, effort, thinking: thinking ?? 'adaptive', results });
}
