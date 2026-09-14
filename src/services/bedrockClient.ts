/**
 * Centralized Bedrock Client Service
 * 
 * Provides a unified interface for all Bedrock API calls with:
 * - Singleton BedrockRuntimeClient
 * - Exponential backoff retry (3 attempts on ThrottlingException)
 * - Concurrency limiter (max 3 simultaneous requests)
 * - Primary model: Haiku 4.5 (fast, cost-effective, 5M TPM quota)
 * 
 * All AI routes should use callBedrock() instead of direct InvokeModelCommand.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { reserveBedrockSlot, BEDROCK_CLIENT_RETRY } from '@/services/bedrockRateLimit';

// --- Model Constants ---
//
// ★ [2026-09-09] «us.» 프로파일 하나에 세 앱이 전부 매달려 있었고, 그 통이 말랐다.
//
//   실측 (CloudWatch, 24시간):
//     us.anthropic.claude-haiku-4-5   입력 8.9M + 출력 3.6M = 12.5M 토큰
//                                     성공 4,170회 · **스로틀 34,487회**
//     us.anthropic.claude-sonnet-4-6  호출 0회 (선언만 있고 아무도 안 쓴다)
//   일일 한도는 13.5M — 12.5M 을 썼으니 사실상 소진이다. 그래서 WIM 과
//   UC 일본어가 「데이터 없음」으로 죽었고, SIGNUM 도 같은 통을 쓰므로
//   AI 문구가 조용히 «어제 것»으로 굳고 있었다.
//
//   **같은 모델인데 «global.» 프로파일은 한도 통이 따로다**(27M/일).
//   실측: us. 는 ThrottlingException, global. 은 같은 순간 정상 응답.
//   → 기본을 global 로 두고, 막히면 us 로 넘어간다. 둘 다 같은 Haiku 4.5 라
//     품질은 동일하고 가용 한도만 두 배가 된다.
export const MODELS = {
    /** 기본 — 전 앱 공용 */
    HAIKU_35: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
    /** 같은 모델·다른 한도 통. 기본이 스로틀되면 이쪽으로 */
    HAIKU_35_US: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    /** @deprecated 호출자 0곳·호출 0회 (2026-09-09 실측). 남겨만 둔다 */
    SONNET_4: 'us.anthropic.claude-sonnet-4-6',
} as const;

/**
 * 모델 «계열»이 통째로 죽었을 때 내려갈 순서.
 * 같은 모델의 다른 한도 통(us↔global)을 먼저 시도하고, 그래도 안 되면 계열을 바꾼다.
 * 2026-09-14 에 Haiku 4.5 가 두 프로파일 모두 ServiceUnavailable 이었다 — 실제로 일어난다.
 */
const LAST_RESORT_CHAIN: Record<string, string[]> = {
    'global.anthropic.claude-haiku-4-5-20251001-v1:0': [
        'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        'us.anthropic.claude-sonnet-4-6',
    ],
    'us.anthropic.claude-haiku-4-5-20251001-v1:0': [
        'global.anthropic.claude-haiku-4-5-20251001-v1:0',
        'us.anthropic.claude-sonnet-4-6',
    ],
};

/** 표에 없는 모델의 기본 사다리 */
const DEFAULT_LAST_RESORT: string[] = ['us.anthropic.claude-sonnet-4-6'];

// --- Singleton Client ---
let _client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
    if (_client) return _client;
    _client = new BedrockRuntimeClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
        // SDK 기본 재시도 3회는 전부 «스로틀»로 따로 집계된다 — 증폭을 줄인다
        ...BEDROCK_CLIENT_RETRY,
    });
    return _client;
}

// --- Concurrency Limiter ---
const MAX_CONCURRENT = 5;  // [V10] Raised from 3 — AWS Bedrock has no strict concurrency limit
let _activeRequests = 0;
const _waitQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
    if (_activeRequests < MAX_CONCURRENT) {
        _activeRequests++;
        return;
    }
    // Wait in queue
    return new Promise<void>((resolve) => {
        _waitQueue.push(() => {
            _activeRequests++;
            resolve();
        });
    });
}

function releaseSlot(): void {
    _activeRequests--;
    if (_waitQueue.length > 0) {
        const next = _waitQueue.shift()!;
        next();
    }
}

// --- Retry with Exponential Backoff ---
/**
 * «지금 내려가 있는 모델» 기억표.
 *
 * 사다리는 작동했지만 장애가 지속되는 동안 매 호출이 죽은 모델을 두 번씩
 * 두드렸다(실측 14.4초). 라우트 maxDuration 을 넘기면 사다리가 있어도 소용없다.
 * → 한 번 «응답 불가»를 본 모델은 쿨다운 동안 건너뛴다. 실측 14.4초 → 약 1.4초.
 *
 * 쿨다운을 길게 두지 않는 이유: 모델이 복구됐는데도 계속 비싼 Sonnet 을 쓰면
 * 그것도 손해다. 5분이면 복구를 금방 되찾으면서 장애 중 낭비는 없앤다.
 */
const MODEL_COOLDOWN_MS = 5 * 60 * 1000;
const _modelDownUntil = new Map<string, number>();

function isModelCoolingDown(modelId: string): boolean {
    const until = _modelDownUntil.get(modelId);
    if (!until) return false;
    if (Date.now() >= until) { _modelDownUntil.delete(modelId); return false; }
    return true;
}

function markModelDown(modelId: string): void {
    _modelDownUntil.set(modelId, Date.now() + MODEL_COOLDOWN_MS);
}

/**
 * «이 모델이 지금 응답을 못 한다» 계열의 에러.
 *
 * ★ 2026-09-14 실사고: Bedrock 의 Haiku 4.5 가 두 프로파일 모두
 *   ServiceUnavailableException 을 냈다(실측 0/5, 같은 순간 Sonnet 은 5/5).
 *   그런데 이 에러가 «알 수 없는 에러»로 분류돼 그대로 throw 됐고,
 *   폴백·마지막 사다리까지 도달하지 못해 가디언 TACTICAL INSIGHT 가
 *   「Insight generation failed」 로 떨어졌다.
 *
 *   이건 던질 신호가 아니라 **다른 모델로 가라는 신호**다. → null 을 반환해
 *   호출부가 사다리를 타게 한다.
 */
function isModelUnavailableError(error: any): boolean {
    const name = String(error?.name || '');
    const msg = String(error?.message || '');
    return (
        name === 'ServiceUnavailableException' ||
        name === 'ModelNotReadyException' ||
        name === 'ModelTimeoutException' ||
        name === 'InternalServerException' ||
        /unable to process your request/i.test(msg)
    );
}

function isThrottlingError(error: any): boolean {
    const message = (error?.message || '').toLowerCase();
    const name = (error?.name || '').toLowerCase();
    return (
        name.includes('throttling') ||
        name.includes('toomanyrequests') ||
        message.includes('too many requests') ||
        message.includes('throttling') ||
        message.includes('rate exceeded') ||
        error?.['$metadata']?.httpStatusCode === 429
    );
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Main API ---
export interface CallBedrockOptions {
    /** Model ID to use (default: Haiku 4.5) */
    modelId?: string;
    /** System prompt */
    system: string;
    /** User prompt */
    userPrompt: string;
    /** Max output tokens (default: 4096) */
    maxTokens?: number;
    /** Temperature (default: 0.3) */
    temperature?: number;
    /** Timeout in ms (default: 55000) */
    timeoutMs?: number;
    /** Fallback model if primary fails after all retries (default: Haiku 3.5) */
    fallbackModel?: string | null;
    /** Enable JSON prefill with '{' for assistant (default: true) */
    jsonPrefill?: boolean;
    /** Max retry attempts (default: 3) */
    maxRetries?: number;
    /** Label for logging */
    label?: string;
    /**
     * 기본·폴백이 «모두» 실패했을 때 다른 모델 계열로 한 번 더 내려갈지.
     * 기본 true — 모델 하나가 통째로 죽어도 화면이 사는 쪽이 낫다.
     * 비용이 아까운 호출(소셜 글 등)만 false 로 끈다.
     */
    allowLastResort?: boolean;
}

export interface CallBedrockResult {
    /** Raw text response from Claude */
    text: string;
    /** Which model actually responded */
    model: string;
    /** Whether fallback model was used */
    usedFallback: boolean;
    /** Total elapsed time in ms */
    elapsedMs: number;
}

/**
 * Call Bedrock Claude with automatic retry, concurrency control, and fallback.
 * Returns the raw text response. Note: Sonnet 4.6+ does NOT support assistant prefill.
 */
export async function callBedrock(options: CallBedrockOptions): Promise<CallBedrockResult> {
    const {
        modelId = MODELS.HAIKU_35,
        system,
        userPrompt,
        maxTokens = 4096,
        temperature = 0.3,
        timeoutMs = 55000,
        // 기본 폴백 = 같은 모델의 다른 한도 통. 명시적으로 null 을 넘기면 끈다.
        fallbackModel = MODELS.HAIKU_35_US as string | null,
        jsonPrefill = false,
        maxRetries = 3,
        label = 'Bedrock',
        allowLastResort = true,
    } = options;

    const startTime = Date.now();

    if (!process.env.AWS_ACCESS_KEY_ID) {
        throw new Error('AWS credentials not configured');
    }

    // --- Try primary model with retries ---
    const primaryResult = await callWithRetry(modelId, system, userPrompt, maxTokens, temperature, timeoutMs, jsonPrefill, maxRetries, label);
    
    if (primaryResult) {
        return {
            text: primaryResult,
            model: modelId.includes('sonnet') ? 'claude-sonnet-4.6' : modelId.includes('haiku') ? 'claude-haiku-4.5' : modelId,
            usedFallback: false,
            elapsedMs: Date.now() - startTime,
        };
    }

    // --- Fallback model ---
    if (fallbackModel && fallbackModel !== modelId) {
        console.warn(`[${label}] Primary model exhausted retries, falling back to ${fallbackModel.includes('haiku') ? 'Haiku 4.5' : fallbackModel}`);
        
        const fallbackResult = await callWithRetry(fallbackModel, system, userPrompt, maxTokens, temperature, timeoutMs, jsonPrefill, 2, `${label}/Fallback`);
        
        if (fallbackResult) {
            return {
                text: fallbackResult,
                model: fallbackModel.includes('haiku') ? 'claude-haiku-4.5' : fallbackModel,
                usedFallback: true,
                elapsedMs: Date.now() - startTime,
            };
        }
    }

    // ── 마지막 사다리 ─────────────────────────────────────────────────
    // ★ 2026-09-14 실사고: Bedrock 의 Haiku 4.5 가 **두 프로파일 모두** 죽었다.
    //     global.anthropic.claude-haiku-4-5  → ServiceUnavailableException 5/5
    //     us.anthropic.claude-haiku-4-5      → ServiceUnavailableException 5/5
    //     us.anthropic.claude-sonnet-4-6     → 정상 5/5
    //   우리 코드도 한도도 아니고 «그 모델»이 내려간 것이다.
    //   그런데 폴백이 한 단계뿐이라(Haiku→Haiku) 둘 다 같은 모델이었고,
    //   가디언 TACTICAL INSIGHT 가 「Insight generation failed」 로 떨어졌다.
    //
    //   계열이 통째로 죽는 일은 실제로 일어난다. 그래서 «다른 계열»까지 내려간다.
    //   품질은 Sonnet 이 더 좋고 값이 비쌀 뿐이다 — 화면이 죽는 것보다 낫다.
    if (allowLastResort) {
        const tried = new Set([modelId, fallbackModel].filter(Boolean) as string[]);
        for (const next of LAST_RESORT_CHAIN[modelId] || DEFAULT_LAST_RESORT) {
            if (tried.has(next)) continue;
            console.warn(`[${label}] 모델 계열이 통째로 실패 — 마지막 사다리로 ${next}`);
            const r = await callWithRetry(next, system, userPrompt, maxTokens, temperature, timeoutMs, jsonPrefill, 2, `${label}/LastResort`);
            if (r) {
                return {
                    text: r,
                    model: next.includes('sonnet') ? 'claude-sonnet-4.6' : next.includes('haiku') ? 'claude-haiku-4.5' : next,
                    usedFallback: true,
                    elapsedMs: Date.now() - startTime,
                };
            }
            tried.add(next);
        }
    }

    throw new Error(`[${label}] All Bedrock attempts exhausted (primary + fallback + last resort)`);
}

async function callWithRetry(
    modelId: string,
    system: string,
    userPrompt: string,
    maxTokens: number,
    temperature: number,
    timeoutMs: number,
    jsonPrefill: boolean,
    maxRetries: number,
    label: string,
): Promise<string | null> {
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 방금 «응답 불가»였던 모델은 건너뛴다 — 두드려봐야 시간만 쓴다
    if (isModelCoolingDown(modelId)) {
        console.warn(`[${label}] ${modelId} 는 쿨다운 중 — 건너뛴다`);
        return null;
    }

        await acquireSlot();
        
        try {
            const client = getClient();
            
            const messages: any[] = [
                { role: 'user', content: userPrompt },
            ];
            // Sonnet 4.6+ does NOT support assistant prefill — auto-detect and skip
            const canPrefill = jsonPrefill && !modelId.includes('sonnet-4-6');
            if (canPrefill) {
                messages.push({ role: 'assistant', content: '{' });
            }
            
            const command = new InvokeModelCommand({
                modelId,
                contentType: 'application/json',
                accept: 'application/json',
                body: JSON.stringify({
                    anthropic_version: 'bedrock-2023-05-31',
                    max_tokens: maxTokens,
                    temperature,
                    system,
                    messages,
                }),
            });
            
            // 분당 한도(10)에 맞춰 «간격»을 벌린다. 줄이 길면 그냥 통과한다.
            await reserveBedrockSlot(label);

            const result = await Promise.race([
                client.send(command),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error(`${label} timeout ${timeoutMs}ms`)), timeoutMs)
                ),
            ]);
            
            const responseBody = JSON.parse(new TextDecoder().decode(result.body));
            let text = responseBody.content?.[0]?.text || '';
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            
            if (canPrefill) {
                text = '{' + text;
            }
            
            if (!text || text === '{') {
                console.warn(`[${label}] Empty response on attempt ${attempt}`);
                continue;
            }
            
            console.log(`[${label}] ✅ Success on attempt ${attempt} (model: ${modelId.includes('sonnet') ? 'Sonnet4.6' : modelId.includes('haiku') ? 'Haiku4.5' : modelId})`);
            return text;
            
        } catch (error: any) {
            if (isThrottlingError(error)) {
                const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000); // 1s, 2s, 4s, 8s
                console.warn(`[${label}] ThrottlingException on attempt ${attempt}/${maxRetries}, waiting ${backoffMs}ms...`);
                
                if (attempt < maxRetries) {
                    await sleep(backoffMs);
                    continue;
                }
                console.warn(`[${label}] All ${maxRetries} retries exhausted for ${modelId}`);
                return null;
            }
            
            // Non-throttling errors: timeout, parse errors, etc.
            if (error.message?.includes('timeout')) {
                console.warn(`[${label}] Timeout on attempt ${attempt}`);
                if (attempt < maxRetries) continue;
                return null;
            }
            
            // 모델이 내려간 경우 — 같은 모델을 더 두드려봐야 소용없다.
            // 한 번만 짧게 재시도하고, 그래도 안 되면 null 을 돌려 «다른 모델»로 넘긴다.
            if (isModelUnavailableError(error)) {
                console.warn(`[${label}] 모델 응답 불가(${error.name}) — ${modelId}`);
                if (attempt < Math.min(2, maxRetries)) {
                    await sleep(800);
                    continue;
                }
                markModelDown(modelId);
                return null;
            }

            // Unknown error — don't retry
            console.error(`[${label}] Non-retryable error:`, error.message);
            throw error;
            
        } finally {
            releaseSlot();
        }
    }
    
    return null;
}
