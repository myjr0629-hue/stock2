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

    throw new Error(`[${label}] All Bedrock attempts exhausted (primary + fallback)`);
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
            
            // Unknown error — don't retry
            console.error(`[${label}] Non-retryable error:`, error.message);
            throw error;
            
        } finally {
            releaseSlot();
        }
    }
    
    return null;
}
