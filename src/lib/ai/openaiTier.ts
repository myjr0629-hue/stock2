/**
 * OpenAI 단 (2026-11-07, 대표: «openai 에서 200달러 크레딧… 사용할 곳이 있으면 사용» · «이미 크레딧이 해결이 되었는데 이런 일이 발생하게 하면 안 된다»).
 *
 * 사다리 안에서의 자리: ① Anthropic Haiku 5.5 → ★OpenAI(용도별 모델) → ② Bedrock 5.5 → ③ 현행(Bedrock 4.5 …)
 *   · 용도별 설정은 llmLadder.LADDER_PURPOSES[용도].openai — 없으면 이 단은 없다(예전과 같다).
 *   · 같은 프롬프트(system·user)·같은 출구 가드(validate)·같은 JSON 정리(normalizeJsonText)를 쓴다.
 *
 * 크레딧(ChatGPT 구독에 딸린 API 크레딧 — 결제 수단 없음 = 크레딧이 곧 하드 상한, 매달 갱신)
 *   · 원장: llm:oa:cost:{YYYYMM}(UTC 달) — 응답이 왔으면(가드 실패 포함) 센다. 연성 상한 OPENAI_MONTHLY_CAP_USD(기본 $170) 에 이르면 이 단을 건너뛴다.
 *   · 401/403(키)·404(모델)·429 insufficient_quota(크레딧 소진·만료) = 이 단을 6시간 닫고 다음 단으로. 경보(SNS signum-lambda-alerts)는 달마다 종류별 한 번.
 *   · 끄기: Redis llm:oa:off = '1'|'*' 또는 용도 배열 JSON(재배포 없이) · 환경변수 AI_OPENAI_OFF=1.
 *   · 키 값은 어디에도 기록하지 않는다.
 *
 * 요청 모양: Responses API(POST /v1/responses) — instructions=system, input=user, max_output_tokens, reasoning.effort, store:false.
 *   temperature 는 보내지 않는다(추론 모델). 추론 토큰도 max_output_tokens 안에서 세므로 h55MaxTokens 와 같은 여유를 둔다.
 * 단가 출처: developers.openai.com/api/docs/pricing (2026-11-07 확인, 표준 등급 ≤272K 입력, /백만 토큰).
 */
import { classifyHttpFailure, h55MaxTokens, JSON_ARRAY_INSTRUCTION, JSON_ONLY_INSTRUCTION, type FailKind } from '@/lib/ai/llmRequest';
import type { TokenUsage } from '@/lib/ai/llmPricing';

export type OaEffort = 'none' | 'low' | 'medium';

export interface OaPrice { input: number; cached: number; output: number }
export const OA_PRICES: Readonly<Record<string, OaPrice>> = {
    'gpt-6.1-sol': { input: 2.0, cached: 0.10, output: 10.0 },
    'gpt-6.1-terra': { input: 1.0, cached: 0.05, output: 5.0 },
    'gpt-6-luna': { input: 0.10, cached: 0.01, output: 0.50 },
    'gpt-5.6-terra': { input: 2.0, cached: 0.20, output: 12.0 },
    'gpt-5.6-luna': { input: 0.20, cached: 0.02, output: 1.20 },
    'gpt-5.4-mini': { input: 0.75, cached: 0.075, output: 4.50 },
};
export const isOaModel = (m: unknown): m is string => typeof m === 'string' && Object.prototype.hasOwnProperty.call(OA_PRICES, m);

/** usage.input 은 캐시 읽기를 뺀 입력(Anthropic 과 같은 뜻) — cacheRead 가 캐시 단가로 붙는다 */
export function oaCost(usage: Partial<TokenUsage> | null | undefined, model: string): number {
    const p = OA_PRICES[model];
    if (!usage || !p) return 0;
    const usd = ((usage.input || 0) * p.input + (usage.cacheRead || 0) * p.cached + (usage.output || 0) * p.output) / 1_000_000;
    return Number.isFinite(usd) ? usd : 0;
}

export const OA_DEFAULT_MONTHLY_CAP_USD = 170;
export function oaMonthlyCapUsd(): number {
    const n = Number(process.env.OPENAI_MONTHLY_CAP_USD);
    return Number.isFinite(n) && n > 0 ? n : OA_DEFAULT_MONTHLY_CAP_USD;
}
/** 원장 달 id(UTC) — 예: 202611 */
export const oaMonthId = (ms: number): string => new Date(ms).toISOString().slice(0, 7).replace('-', '');
export const OA_KEYS = {
    cost: (month: string) => `llm:oa:cost:${month}`,
    off: 'llm:oa:off',
    alert: (month: string, tag: string) => `llm:oa:alert:${month}:${tag}`,
};

export interface OaParsed { text: string; stop: 'end' | 'max_tokens' | 'refusal' | 'filtered'; usage: TokenUsage; reasoningTokens: number }

/** Responses API 응답 → 글·멈춘 이유·사용량 */
export function parseOaResponse(json: any): OaParsed {
    let text = '';
    let refused = false;
    for (const item of Array.isArray(json?.output) ? json.output : []) {
        if (item?.type !== 'message') continue;
        for (const c of Array.isArray(item.content) ? item.content : []) {
            if (c?.type === 'output_text' && typeof c.text === 'string') text += c.text;
            else if (c?.type === 'refusal') refused = true;
        }
    }
    if (!text && typeof json?.output_text === 'string') text = json.output_text;
    const u = json?.usage || {};
    const inTok = Number(u.input_tokens) || 0;
    const cached = Math.min(inTok, Number(u.input_tokens_details?.cached_tokens) || 0);
    const usage: TokenUsage = { input: inTok - cached, cacheRead: cached, cacheWrite: 0, output: Number(u.output_tokens) || 0 };
    const reason = String(json?.incomplete_details?.reason || '');
    const stop: OaParsed['stop'] = refused && !text ? 'refusal'
        : json?.status === 'incomplete' ? (reason === 'content_filter' ? 'filtered' : 'max_tokens')
        : 'end';
    return { text: text.trim(), stop, usage, reasoningTokens: Number(u.output_tokens_details?.reasoning_tokens) || 0 };
}

export interface OaFail { kind: FailKind; closeSec: number; detail: string }
const QUOTA_RE = /insufficient_quota|exceeded your current quota|billing_hard_limit|billing_not_active|credit/i;

/**
 * HTTP 오류 → 종류·문 닫는 시간. 크레딧 소진·만료(429 insufficient_quota)는 6시간 — 결제 수단이 없어 사람이 채우기 전엔 돌아오지 않는다.
 * 키(401)·권한(403)·모델 없음(404)도 6시간(경보). 나머지는 Anthropic 과 같은 규칙.
 */
export function classifyOaFailure(status: number, bodyText: string, retryAfter?: string | null): OaFail {
    const body = String(bodyText || '').slice(0, 400);
    if ((status === 429 || status === 402 || status === 400) && QUOTA_RE.test(body)) return { kind: 'credit', closeSec: 6 * 3600, detail: `${status} ${body}` };
    if (status === 401) return { kind: 'auth', closeSec: 6 * 3600, detail: `401 ${body}` };
    if (status === 403 || status === 404) return { kind: 'access', closeSec: 6 * 3600, detail: `${status} ${body}` };
    return classifyHttpFailure(status, body, retryAfter);
}

export class OaCallError extends Error {
    constructor(public kind: FailKind, public closeSec: number, public detail: string) { super(`${kind}: ${detail}`); this.name = 'OaCallError'; }
}

export interface OaCall {
    model: string; system: string; userPrompt: string; maxTokens: number;
    /** JSON 응답(객체/배열) — Haiku 단과 같은 형식 지시를 system 끝에 붙인다 */
    json?: boolean | 'array';
    effort?: OaEffort; timeoutMs: number;
}

export function shapeOaBody(c: OaCall): Record<string, unknown> {
    const instructions = c.json === 'array' ? c.system + JSON_ARRAY_INSTRUCTION : c.json ? c.system + JSON_ONLY_INSTRUCTION : c.system;
    return {
        model: c.model,
        instructions,
        input: c.userPrompt,
        max_output_tokens: h55MaxTokens(c.maxTokens),
        reasoning: { effort: c.effort ?? 'none' },
        store: false,
    };
}

export async function defaultCallOpenAI(c: OaCall, key: string): Promise<OaParsed> {
    let res: Response;
    try {
        res = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
            body: JSON.stringify(shapeOaBody(c)),
            signal: AbortSignal.timeout(c.timeoutMs),
        });
    } catch (e: any) {
        const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        throw new OaCallError(timedOut ? 'timeout' : 'network', timedOut ? 0 : 60, String(e?.message || e).slice(0, 160));
    }
    const text = await res.text().catch(() => '');
    if (!res.ok) {
        const f = classifyOaFailure(res.status, text, res.headers.get('retry-after'));
        throw new OaCallError(f.kind, f.closeSec, f.detail);
    }
    let json: any;
    try { json = JSON.parse(text); } catch { throw new OaCallError('server', 120, 'non-json body'); }
    if (json?.status === 'failed') throw new OaCallError('server', 120, String(json?.error?.message || 'failed').slice(0, 160));
    return parseOaResponse(json);
}

export const openaiKeyFromEnv = (): string | undefined => (process.env.OPENAI_API_KEY || '').trim() || undefined;
