/**
 * POST /api/admin/ai-ab — 품질 비교 (같은 실제 입력을 현행(Bedrock Haiku 4.5)과 Haiku 5.5(Anthropic API)로 나란히)
 *
 * 입력은 «운영이 실제로 보낸 프롬프트»다 — 사다리 입구가 캡처 스위치(llm:cap:on)가 켜진 동안 용도별로 보관한 것(llm:cap:{용도}, 4일).
 * 지어낸 입력은 쓰지 않는다. 캡처가 모자란 용도는 표본 수를 그대로 돌려준다(부족하다고 보고한다).
 *
 * 요청: { purpose, from?:0, count?:3, effort?:'low'|'medium'|'high', thinking?:'disabled', list?:true, maxTokens?:n }
 *   list:true  → 보관된 입력 수·언어 분포만
 *   maxTokens  → 캡처된 상한 대신 이 값으로 두 모델을 돌린다(최대 16000) — «상한이 잘림의 원인인가» 를 가리거나 실제 출력 길이 분포를 잴 때
 *   skipLegacy:true → 현행(AWS) 호출을 건너뛰고 Haiku 5.5 만 돌린다(분당 10건 한도를 아끼며 프롬프트 변형만 비교할 때)
 *   h55SystemSuffix:'…' → Haiku 5.5 호출의 system 끝에만 덧붙인다(예: 언어 지시 강화안 시험). 현행 쪽은 캡처 그대로. 운영 프롬프트는 바뀌지 않는다.
 *   h55UserReplace:{"원문":"바꿀말",…} → Haiku 5.5 호출의 사용자 메시지(입력 데이터)에서 문자열을 바꿔 보낸다(예: 입력에 섞인 한국어 섹터명을 영어로 — 입력 쪽 원인 시험). 운영 입력은 바뀌지 않는다.
 *   TickerNews → 현행 쪽은 Bedrock Haiku 가 아니라 Amazon Nova Lite(운영 경로와 같다). 건별로 제목마다 한·일 통과 여부(news)를 붙인다.
 *   그 외      → from 부터 count 건을 돌린다(한 요청은 라우트 한도 60초 안 — 38초 넘으면 새 입력을 시작하지 않고 next 를 돌려준다)
 * 응답: 건별 { locale, legacy:{ms,usage,costUsd,chars,gate,text}, h55:{…, provider} } — 가드는 lib/ai/ladderGates.evaluateOutput 하나(두 모델에 같은 잣대).
 * 인증: Authorization: Bearer <CRON_SECRET>. 키 값은 응답·로그에 없다.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { BedrockRuntimeClient, InvokeModelCommand, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { adminAuthorized } from '@/lib/ai/adminAuth';
import { financeTermsRule } from '@/lib/ai/commonTerms';
import { evaluateOutput } from '@/lib/ai/ladderGates';
import { newsItemVerdicts, titlesFromNewsPrompt } from '@/lib/ai/tickerNewsGuard';
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

/** 현행 호출을 «그대로» 재현 — 같은 system·temperature·프리필, 스로틀이면 운영과 같이 us. 프로필로 한 번 더 */
async function runLegacy(c: Captured) {
    const t0 = Date.now();
    const profiles = [LEGACY_MODEL, 'us.anthropic.claude-haiku-4-5-20251001-v1:0'];
    let lastErr = '';
    for (let k = 0; k < profiles.length; k++) {
        try {
            const messages: any[] = [{ role: 'user', content: c.userPrompt }];
            if (c.jsonPrefill) messages.push({ role: 'assistant', content: '{' });
            await reserveBedrockSlot('ai-ab');
            const res = await Promise.race([
                bedrock().send(new InvokeModelCommand({
                    modelId: profiles[k], contentType: 'application/json', accept: 'application/json',
                    body: JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: c.maxTokens, temperature: c.temperature ?? 0.3, system: c.system.includes('<finance_terms>') ? c.system : financeTermsRule() + c.system, messages }),
                })),
                new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout 45s')), 45_000)),
            ]);
            const body = JSON.parse(new TextDecoder().decode(res.body));
            let text = (body.content?.[0]?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
            if (c.jsonPrefill) text = '{' + text;
            const usage = usageOf(body.usage);
            return { ok: true as const, ms: Date.now() - t0, text, usage, costUsd: costOf(usage, 'haiku-4.5'), stop: body.stop_reason || null, profile: k === 0 ? 'global' : 'us' };
        } catch (e: any) {
            lastErr = `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 160)}`;
            if (!/Throttl|Too many/i.test(lastErr)) break;
        }
    }
    return { ok: false as const, ms: Date.now() - t0, error: lastErr };
}

let _nova: BedrockRuntimeClient | null = null;
const novaClient = () => (_nova ||= new BedrockRuntimeClient({
    region: 'us-east-1',
    credentials: process.env.AWS_ACCESS_KEY_ID ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! } : undefined,
    maxAttempts: 2,
}));

/** 종목 뉴스의 현행 경로(Amazon Nova Lite, Converse) 재현 — ticker-news/route.ts 의 legacy 와 같은 모델·상한·temperature */
async function runNova(c: Captured) {
    const t0 = Date.now();
    try {
        const r = await Promise.race([
            novaClient().send(new ConverseCommand({
                modelId: 'us.amazon.nova-lite-v1:0',
                system: [{ text: c.system }],
                messages: [{ role: 'user', content: [{ text: c.userPrompt }] }],
                inferenceConfig: { maxTokens: Math.min(c.maxTokens || 2000, 4000), temperature: c.temperature ?? 0.3 },
            })),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout 45s')), 45_000)),
        ]);
        const text = (r.output?.message?.content || []).map((x: any) => x.text || '').join('').trim();
        const usage = { input: Number(r.usage?.inputTokens) || 0, output: Number(r.usage?.outputTokens) || 0, cacheWrite: 0, cacheRead: 0 };
        return { ok: true as const, ms: Date.now() - t0, text, usage, costUsd: costOf(usage, 'nova-lite'), stop: r.stopReason === 'max_tokens' ? 'max_tokens' : (r.stopReason || null), profile: 'nova-lite' };
    } catch (e: any) {
        return { ok: false as const, ms: Date.now() - t0, error: `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 160)}` };
    }
}

async function runH55(c: Captured, effort: Effort, expectJson: boolean | 'array', thinking?: 'disabled', opt: { timeoutMs?: number; cacheSystem?: boolean } = {}) {
    const t0 = Date.now();
    const key = (process.env.ANTHROPIC_API_KEY_CREDITS || '').trim();
    if (!key) return { ok: false as const, ms: 0, error: 'no-key' };
    try {
        const body = shapeH55Body('claude-haiku-5-5', {
            system: c.system, userPrompt: c.userPrompt, maxTokens: c.maxTokens,
            jsonPrefill: !!(c.jsonPrefill || expectJson), jsonArray: expectJson === 'array', effort, thinking,
        });
        // 프롬프트 캐시 시험: system 을 블록 배열로 보내고 cache_control 을 붙인다(512토큰 이상 공통 머리말일 때만 의미가 있다)
        if (opt.cacheSystem) (body as any).system = [{ type: 'text', text: (body as any).system, cache_control: { type: 'ephemeral' } }];
        const r = await defaultCallAnthropic({ body, timeoutMs: Math.min(58_000, Math.max(5_000, opt.timeoutMs || 45_000)) }, key);
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
    // 정보용 단발 비교(예: 종목 뉴스 번역 — 이번 회차에 사다리를 켜지 않는 경로): 호출자가 준 system·user 를 Haiku 5.5 로만 돌려 돌려준다.
    //   현행 쪽 결과는 호출자가 이미 가지고 있다(운영 캐시). 입력은 운영의 실제 재료여야 한다.
    if (body.adhoc && typeof body.adhoc.system === 'string' && typeof body.adhoc.userPrompt === 'string') {
        const a = body.adhoc;
        const c: Captured = {
            t: Date.now(), purpose: 'adhoc', system: String(a.system).includes('<finance_terms>') ? a.system : financeTermsRule() + a.system, userPrompt: a.userPrompt, maxTokens: Math.min(8192, Number(a.maxTokens) || 2000),
            temperature: null, jsonPrefill: false, locale: 'multi', expectJson: a.expectJson !== false,
        };
        const effort: Effort = body.effort === 'medium' || body.effort === 'high' ? body.effort : 'low';
        const think = body.thinking === 'disabled' ? 'disabled' as const : undefined;
        // adhoc.legacy:true → 같은 입력을 현행 Bedrock Haiku 4.5(운영과 같은 global→us 프로필)로도 돌려 나란히 돌려준다(maxTokens 는 adhoc.maxTokens)
        if (a.legacy) {
            const [lg, h55] = await Promise.all([runLegacy({ ...c, jsonPrefill: false }), runH55(c, effort, c.expectJson ?? true, think, { timeoutMs: a.timeoutMs, cacheSystem: !!a.cacheSystem })]);
            return NextResponse.json({ ok: true, adhoc: true, effort, legacy: lg, h55 });
        }
        const h55 = await runH55(c, effort, c.expectJson ?? true, think, { timeoutMs: a.timeoutMs, cacheSystem: !!a.cacheSystem });
        return NextResponse.json({ ok: true, adhoc: true, effort, h55 });
    }
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
    const mtOverride = Math.min(16_000, Math.max(0, Number(body.maxTokens) || 0));
    const skipLegacy = body.skipLegacy === true;
    const suffix = typeof body.h55SystemSuffix === 'string' ? body.h55SystemSuffix.slice(0, 4000) : '';
    const userReplace: Array<[string, string]> = body.h55UserReplace && typeof body.h55UserReplace === 'object'
        ? Object.entries(body.h55UserReplace as Record<string, unknown>).filter(([k, v]) => k && typeof v === 'string').slice(0, 50) as Array<[string, string]> : [];
    const applyReplace = (t: string) => userReplace.reduce((acc, [from, to]) => acc.split(from).join(to), t);
    const started = Date.now();
    const results: any[] = [];
    let i = from;
    for (; i < Math.min(inputs.length, from + count); i++) {
        if (Date.now() - started > 38_000) break;
        const c = mtOverride ? { ...inputs[i], maxTokens: mtOverride } : inputs[i];
        // JSON 기대 여부 — 캡처에 표지가 없으면 프리필·프롬프트로 추정
        const expectJson: boolean | 'array' = c.expectJson ?? (purpose === 'NewsDigest' ? 'array' : (c.jsonPrefill || /\bJSON\b/.test(c.userPrompt + c.system)));
        const [lg, hn] = await Promise.all([
            skipLegacy ? Promise.resolve({ ok: false as const, ms: 0, error: 'skipped' }) : purpose === 'TickerNews' ? runNova(c) : runLegacy(c),
            runH55({ ...c, system: suffix ? c.system + '\n\n' + suffix : c.system, userPrompt: userReplace.length ? applyReplace(c.userPrompt) : c.userPrompt }, effort, expectJson, thinking),
        ]);
        const source = c.userPrompt;
        const judge = (r: any) => (r.ok ? evaluateOutput({
            purpose, locale: c.locale, text: r.text, source, expectJson,
            truncated: r.stop === 'max_tokens', refusal: !!r.refusal,
        }) : { ok: false, reasons: [`call-failed:${r.error}`], chars: 0, jsonOk: null });
        // 종목 뉴스: 제목마다 한·일이 운영 검사(checked)를 통과했나 — 운영 라우트와 같은 함수
        const titles = purpose === 'TickerNews' ? titlesFromNewsPrompt(c.userPrompt) : [];
        const news = (r: any) => (titles.length && r.ok ? newsItemVerdicts(r.text, titles) : undefined);
        results.push({
            i, locale: c.locale, capturedAt: new Date(c.t).toISOString(), promptChars: c.system.length + c.userPrompt.length,
            userHead: c.userPrompt.slice(0, 90), maxTokens: c.maxTokens,
            legacy: { ...lg, gate: judge(lg), ...(titles.length ? { news: news(lg) } : {}) },
            h55: { ...hn, gate: judge(hn), ...(titles.length ? { news: news(hn) } : {}) },
        });
    }
    return NextResponse.json({ ok: true, purpose, captured: inputs.length, from, next: i < inputs.length ? i : null, effort, thinking: thinking ?? 'adaptive', results });
}
