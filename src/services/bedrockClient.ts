/**
 * Centralized Bedrock Client Service
 * 
 * Provides a unified interface for all Bedrock API calls with:
 * - Singleton BedrockRuntimeClient
 * - Exponential backoff retry (3 attempts on ThrottlingException)
 * - Concurrency limiter (max 3 simultaneous requests)
 * - Automatic Haiku 4.5 fallback when Sonnet 4.6 is throttled
 * 
 * All AI routes should use callBedrock() instead of direct InvokeModelCommand.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// --- Model Constants ---
export const MODELS = {
    SONNET_4: 'us.anthropic.claude-sonnet-4-6',
    HAIKU_35: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
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
    /** Model ID to use (default: Sonnet 4) */
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
        modelId = MODELS.SONNET_4,
        system,
        userPrompt,
        maxTokens = 4096,
        temperature = 0.3,
        timeoutMs = 55000,
        fallbackModel = MODELS.HAIKU_35,
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
